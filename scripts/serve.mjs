import { createVerify } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createChatStateStore } from './chat-state-store.mjs';
import { readRequestBody } from './http-utils.mjs';

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? 'kidswhatsapp-6fffb';
let firebaseCertCache = { expiresAt: 0, certs: {} };
const voiceSignalTypes = new Set([
  'call-offer',
  'call-answer',
  'ice-candidate',
  'call-reject',
  'call-ended',
  'call-timeout'
]);
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml'
};

function resolvePath(pathname, root) {
  const components = pathname.split('/').filter(Boolean);
  if (components.some(part => part.startsWith('.') || part.includes('\\'))) return null;
  const publicFiles = new Set(['index.html', 'styles.css', 'app-icon.svg']);
  const publicSourceFiles = new Set(['app.js', 'chat-store.js', 'firebase-chat.js', 'firebase-config.js']);
  const allowed = !components.length ||
    (components.length === 1 && publicFiles.has(components[0])) ||
    (components.length === 2 && components[0] === 'src' && publicSourceFiles.has(components[1]));
  if (!allowed) return null;
  try {
    const actualRoot = realpathSync(root);
    const filePath = realpathSync(join(actualRoot, ...(!components.length ? ['index.html'] : components)));
    const relativePath = relative(actualRoot, filePath);
    if (relativePath.startsWith(`..${sep}`) || relativePath === '..' || resolve(actualRoot, relativePath) !== filePath) return null;
    // A public alias must never expose a private file through a symlink.
    if (filePath !== join(actualRoot, ...(!components.length ? ['index.html'] : components))) return null;
    return statSync(filePath).isFile() ? filePath : null;
  } catch { return null; }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    'Content-Type': 'text/plain',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(text);
}

async function handleChatsApi(request, response, getUserStore, authorizeUser) {
  const idToken = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!idToken) throw Object.assign(new Error('Sign in required'), { statusCode: 401 });
  const decodedToken = await authorizeUser(idToken);
  const chatStateStore = getUserStore(decodedToken.sub);
  if (request.method === 'GET') {
    sendJson(response, 200, await chatStateStore.read());
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    const body = await readRequestBody(request);
    let data;
    try { data = JSON.parse(body); } catch {
      throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
    }
    validateChatPayload(data);
    const merged = await chatStateStore.merge(data);
    sendJson(response, 200, { ok: true, state: merged });
    return;
  }

  response.writeHead(405, { 'Content-Type': 'text/plain' });
  response.end('Method not allowed');
}

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function readJwtJson(encodedPart) {
  return JSON.parse(base64UrlToBuffer(encodedPart).toString('utf8'));
}

async function getFirebaseSigningCerts() {
  const now = Date.now();
  if (firebaseCertCache.expiresAt > now && Object.keys(firebaseCertCache.certs).length) {
    return firebaseCertCache.certs;
  }

  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Could not load Firebase signing certificates: ${response.status}`);
  }
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAgeSeconds = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 300);
  firebaseCertCache = {
    expiresAt: now + maxAgeSeconds * 1000,
    certs: await response.json()
  };
  return firebaseCertCache.certs;
}

export async function verifyFirebaseIdToken(idToken) {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new Error('Missing Firebase ID token.');
  }

  const parts = idToken.split('.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (parts.length !== 3 || !encodedHeader || !encodedPayload || !encodedSignature || idToken.length > 16384) {
    throw new Error('Invalid Firebase ID token.');
  }

  const header = readJwtJson(encodedHeader);
  const payload = readJwtJson(encodedPayload);
  if (!isRecord(header) || !isRecord(payload) || header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Unexpected Firebase token signing algorithm.');
  }
  if (payload.aud !== firebaseProjectId) {
    throw new Error('Firebase token project did not match this app.');
  }
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error('Firebase token issuer did not match this app.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128 || typeof payload.email !== 'string') {
    throw new Error('Firebase token did not include a user ID.');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds || !Number.isFinite(payload.iat) || payload.iat > nowSeconds || !Number.isFinite(payload.auth_time) || payload.auth_time > nowSeconds) {
    throw new Error('Firebase token has expired.');
  }

  const certs = await getFirebaseSigningCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Firebase signing certificate was not found.');
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const valid = verifier.verify(cert, base64UrlToBuffer(encodedSignature));
  if (!valid) {
    throw new Error('Firebase token signature could not be verified.');
  }
  return payload;
}

async function verifyVoiceHello(uid, idToken, authorizeUser) {
  const decodedToken = await authorizeUser(idToken);
  if (decodedToken.sub !== uid) {
    throw new Error('Firebase token user did not match the voice connection user.');
  }
  return decodedToken;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateChatPayload(data) {
  const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 256;
  if (!isRecord(data) ||
      (data.contacts !== undefined && (!Array.isArray(data.contacts) || data.contacts.length > 1000 || data.contacts.some(contact =>
        !isRecord(contact) || !validId(contact.id) ||
        (contact.messages !== undefined && (!Array.isArray(contact.messages) || contact.messages.length > 50000 || contact.messages.some(message =>
          !isRecord(message) || !validId(message.id))))))) ||
      (data.deletedContactIds !== undefined && (!Array.isArray(data.deletedContactIds) || data.deletedContactIds.length > 10000 || data.deletedContactIds.some(id => !validId(id)))) ||
      (data.activeContactId !== undefined && data.activeContactId !== null && !validId(data.activeContactId))) {
    throw Object.assign(new Error('Invalid chat state'), { statusCode: 400 });
  }
}

export async function verifyApprovedFirebaseUser(idToken) {
  let decodedToken;
  try { decodedToken = await verifyFirebaseIdToken(idToken); } catch {
    throw Object.assign(new Error('Invalid sign-in'), { statusCode: 401 });
  }
  const profileUrl = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents/users/${encodeURIComponent(decodedToken.sub)}`;
  const response = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Object.assign(new Error('Approved profile required'), { statusCode: response.status >= 500 ? 503 : 403 });
  const profile = (await response.json()).fields;
  if (profile?.approved?.booleanValue !== true || profile?.uid?.stringValue !== decodedToken.sub ||
      profile?.email?.stringValue !== decodedToken.email.trim().toLowerCase()) {
    throw Object.assign(new Error('Approved profile required'), { statusCode: 403 });
  }
  return decodedToken;
}

function sendVoiceJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function createVoiceSocketId() {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getVoicePresenceSnapshot(clientsByUid) {
  return [...clientsByUid.entries()]
    .map(([uid, sockets]) => {
      const openSockets = [...sockets].filter((socket) => socket.readyState === WebSocket.OPEN);
      return {
        uid,
        socketCount: openSockets.length,
        browserSessionIds: [...new Set(openSockets.map((socket) => socket.browserSessionId).filter(Boolean))],
        socketIds: openSockets.map((socket) => socket.voiceSocketId).filter(Boolean),
        lastSeenAt: Math.max(0, ...openSockets.map((socket) => socket.lastSeenAt ?? 0))
      };
    })
    .filter((entry) => entry.socketCount > 0);
}

function broadcastVoicePresence(wss, clientsByUid) {
  const presence = getVoicePresenceSnapshot(clientsByUid);
  const payload = {
    type: 'voice-presence',
    onlineUids: presence.map((entry) => entry.uid),
    presence,
    serverTime: Date.now()
  };
  for (const client of wss.clients) {
    if (client.userUid) sendVoiceJson(client, payload);
  }
}

function addVoiceClient(clientsByUid, socket, uid, browserSessionId = '') {
  const existing = clientsByUid.get(uid) ?? new Set();
  existing.add(socket);
  clientsByUid.set(uid, existing);
  socket.userUid = uid;
  socket.voiceSocketId = socket.voiceSocketId ?? createVoiceSocketId();
  socket.browserSessionId = browserSessionId;
  socket.lastSeenAt = Date.now();
}

function removeVoiceClient(clientsByUid, socket) {
  if (!socket.userUid) return;
  const clients = clientsByUid.get(socket.userUid);
  if (!clients) return;
  clients.delete(socket);
  if (!clients.size) clientsByUid.delete(socket.userUid);
  socket.userUid = '';
}

function getOpenVoiceTargets(clientsByUid, uid) {
  const clients = clientsByUid.get(uid);
  if (!clients) return [];
  const openTargets = [...clients].filter((client) => client.readyState === WebSocket.OPEN);
  for (const client of [...clients]) {
    if (client.readyState !== WebSocket.OPEN) clients.delete(client);
  }
  if (!clients.size) clientsByUid.delete(uid);
  return openTargets;
}

async function handleVoiceSignal(clientsByUid, socket, message, authorizeUser) {
  if (!socket.userUid) {
    sendVoiceJson(socket, { type: 'voice-error', message: 'Sign in before starting a call.' });
    return;
  }
  socket.lastSeenAt = Date.now();
  if (message.senderUid !== socket.userUid) {
    sendVoiceJson(socket, { type: 'voice-error', message: 'Caller identity did not match the signed-in user.' });
    return;
  }
  if (!voiceSignalTypes.has(message.type)) {
    sendVoiceJson(socket, { type: 'voice-error', message: 'Unknown call signal.' });
    return;
  }

  const validString = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit;
  const descriptionKey = message.type === 'call-offer' ? 'offer' : message.type === 'call-answer' ? 'answer' : null;
  const description = descriptionKey ? message[descriptionKey] : null;
  if (!validString(message.callId, 256) || !validString(message.recipientUid, 128) ||
      (descriptionKey && (!isRecord(description) || description.type !== descriptionKey || !validString(description.sdp, 65536))) ||
      (message.type === 'ice-candidate' && (!isRecord(message.candidate) || !validString(message.candidate.candidate, 8192))) ||
      ['senderEmail', 'senderDisplayName', 'senderPhotoURL', 'reason'].some(key => message[key] !== undefined && (typeof message[key] !== 'string' || message[key].length > 2048))) {
    sendVoiceJson(socket, { type: 'voice-error', message: 'Invalid call signal.' });
    return;
  }

  const recipientUid = message.recipientUid.trim();
  const targets = recipientUid ? getOpenVoiceTargets(clientsByUid, recipientUid) : [];
  if (!recipientUid || !targets.length) {
    sendVoiceJson(socket, {
      type: 'recipient-offline',
      callId: message.callId,
      recipientUid,
      message: 'That friend is not connected for voice calls right now.'
    });
    return;
  }

  try {
    await verifyVoiceHello(socket.userUid, socket.firebaseIdToken, authorizeUser);
    if (socket.readyState !== WebSocket.OPEN) return;
    // An already connected recipient can also have expired or withdrawn approval.
    for (const target of targets) {
      await verifyVoiceHello(recipientUid, target.firebaseIdToken, authorizeUser);
    }
  } catch {
    sendVoiceJson(socket, { type: 'voice-error', message: 'Call access could not be verified. Sign in with an approved account again.' });
    return;
  }

  if (socket.readyState !== WebSocket.OPEN) return;
  const forwarded = {
    type: message.type,
    callId: message.callId,
    recipientUid,
    ...(descriptionKey ? { [descriptionKey]: description } : {}),
    ...(message.type === 'ice-candidate' ? { candidate: message.candidate } : {}),
    ...(message.reason !== undefined ? { reason: message.reason } : {}),
    senderEmail: socket.authClaims.email ?? '',
    senderDisplayName: socket.authClaims.name ?? socket.authClaims.email ?? 'Google user',
    senderPhotoURL: socket.authClaims.picture ?? '',
    senderUid: socket.userUid,
    fromUid: socket.userUid,
    serverTime: Date.now()
  };
  for (const target of targets) {
    if (target.userUid === recipientUid) sendVoiceJson(target, forwarded);
  }
}

function setupVoiceSignalling(server, authorizeUser) {
  const clientsByUid = new Map();
  const wss = new WebSocketServer({
    server, path: '/voice', maxPayload: 128 * 1024,
    verifyClient: ({ origin, req }, done) => {
      let valid = !origin;
      try {
        const parsed = new URL(origin);
        valid = ['http:', 'https:'].includes(parsed.protocol) && parsed.host === req.headers.host;
      } catch {}
      done(valid, 403, 'Origin not allowed');
    }
  });

  wss.on('connection', (socket) => {
    const handleMessage = async rawMessage => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        sendVoiceJson(socket, { type: 'voice-error', message: 'Voice signal was not valid JSON.' });
        return;
      }

      if (!isRecord(message) || typeof message.type !== 'string') {
        sendVoiceJson(socket, { type: 'voice-error', message: 'Voice signal must be an object with a type.' });
        return;
      }

      if (message.type === 'hello') {
        const uid = typeof message.uid === 'string' ? message.uid.trim() : '';
        if (!uid || uid.length > 128 || (message.sessionId !== undefined && (typeof message.sessionId !== 'string' || message.sessionId.length > 256))) {
          sendVoiceJson(socket, { type: 'voice-error', message: 'Voice connection needs a signed-in user.' });
          return;
        }
        const browserSessionId = typeof message.sessionId === 'string' ? message.sessionId.trim() : '';
        let decodedToken;
        try {
          decodedToken = await verifyVoiceHello(uid, message.idToken, authorizeUser);
        } catch (error) {
          sendVoiceJson(socket, {
            type: 'voice-error',
            message: 'Voice sign-in could not be verified. Refresh and sign in again.'
          });
          socket.close(1008, 'Voice auth failed');
          return;
        }
        if (socket.readyState !== WebSocket.OPEN) return;
        socket.firebaseIdToken = message.idToken;
        socket.authClaims = { email: decodedToken.email, name: decodedToken.name, picture: decodedToken.picture };
        clearTimeout(socket.authExpiryTimer);
        if (Number.isFinite(decodedToken.exp)) {
          socket.authExpiryTimer = setTimeout(() => socket.close(1008, 'Sign-in expired'), Math.max(0, decodedToken.exp * 1000 - Date.now()));
          socket.authExpiryTimer.unref();
        }
        removeVoiceClient(clientsByUid, socket);
        addVoiceClient(clientsByUid, socket, uid, browserSessionId);
        const presence = getVoicePresenceSnapshot(clientsByUid);
        sendVoiceJson(socket, {
          type: 'voice-ready',
          uid,
          socketId: socket.voiceSocketId,
          sessionId: socket.browserSessionId,
          socketCount: clientsByUid.get(uid)?.size ?? 0,
          onlineUids: presence.map((entry) => entry.uid),
          presence
        });
        broadcastVoicePresence(wss, clientsByUid);
        return;
      }

      await handleVoiceSignal(clientsByUid, socket, message, authorizeUser);
    };
    // Serialize authentication and signals so concurrent hello messages cannot swap identities.
    let messageQueue = Promise.resolve();
    let queuedMessages = 0;
    socket.on('message', rawMessage => {
      if (++queuedMessages > 32) { socket.close(1008, 'Too many pending signals'); return; }
      messageQueue = messageQueue.then(() => {
        if (socket.readyState === WebSocket.OPEN) return handleMessage(rawMessage);
      }).catch(() => {
        sendVoiceJson(socket, { type: 'voice-error', message: 'Call signal could not be verified.' });
        socket.close(1008, 'Voice signal failed');
      }).finally(() => { queuedMessages -= 1; });
    });

    socket.on('close', () => {
      clearTimeout(socket.authExpiryTimer);
      socket.firebaseIdToken = '';
      socket.authClaims = null;
      removeVoiceClient(clientsByUid, socket);
      broadcastVoicePresence(wss, clientsByUid);
    });
    socket.on('error', () => {
      removeVoiceClient(clientsByUid, socket);
      broadcastVoicePresence(wss, clientsByUid);
    });
  });
}

export function createAppServer({ root = process.cwd(), authorizeUser = verifyApprovedFirebaseUser, databaseUrl = process.env.DATABASE_URL } = {}) {
  const storesByUid = new Map();
  const getUserStore = uid => {
    if (typeof uid !== 'string' || !uid || uid.length > 128) throw Object.assign(new Error('Invalid user'), { statusCode: 401 });
    if (!storesByUid.has(uid)) storesByUid.set(uid, createChatStateStore({ root, databaseUrl, uid }));
    return storesByUid.get(uid);
  };
  const server = createServer(async (request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname); } catch {
      sendText(response, 400, 'Invalid URL');
      return;
    }
    if (pathname === '/healthz') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname === '/api/chats') {
      try {
        await handleChatsApi(request, response, getUserStore, authorizeUser);
      } catch (error) {
        if (!error.statusCode) console.error('Chat API error:', error.message);
        sendJson(response, error.statusCode ?? 500, { error: error.statusCode && error.statusCode < 500 ? error.message : 'Could not load or save chats' });
      }
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }
    const filePath = resolvePath(pathname, root);
    if (!filePath) {
      sendText(response, 404, 'Not found');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(filePath);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  });

  setupVoiceSignalling(server, authorizeUser);
  server.on('close', () => {
    for (const store of storesByUid.values()) store.close?.().catch(() => {});
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = createAppServer();
  server.listen(port, host, () => {
    const listeningPort = server.address().port;
    console.log(`ChatApp running at http://127.0.0.1:${listeningPort}`);
    console.log(`LAN access enabled at http://<this-computer-ip>:${listeningPort}`);
  });
}
