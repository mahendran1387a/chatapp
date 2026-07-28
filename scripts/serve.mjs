import { createVerify } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createChatStateStore } from './chat-state-store.mjs';
import { readRequestBody } from './http-utils.mjs';

const root = process.cwd();
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';
const chatStateStore = createChatStateStore({ root });
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID ?? 'kidswhatsapp-6fffb';
const allowUnverifiedVoiceSignaling = process.env.VOICE_SIGNALING_ALLOW_UNVERIFIED === 'true';
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

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, cleanPath === '/' ? 'index.html' : cleanPath);
  if (!filePath.startsWith(root)) return null;
  if (!existsSync(filePath)) return null;
  if (statSync(filePath).isDirectory()) return join(filePath, 'index.html');
  return filePath;
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

async function handleChatsApi(request, response) {
  if (request.method === 'GET') {
    sendJson(response, 200, await chatStateStore.read());
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    const body = await readRequestBody(request);
    const data = JSON.parse(body);
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

  const response = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
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

async function verifyFirebaseIdToken(idToken) {
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new Error('Missing Firebase ID token.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('Invalid Firebase ID token.');
  }

  const header = readJwtJson(encodedHeader);
  const payload = readJwtJson(encodedPayload);
  if (header.alg !== 'RS256') {
    throw new Error('Unexpected Firebase token signing algorithm.');
  }
  if (payload.aud !== firebaseProjectId) {
    throw new Error('Firebase token project did not match this app.');
  }
  if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) {
    throw new Error('Firebase token issuer did not match this app.');
  }
  if (!payload.sub) {
    throw new Error('Firebase token did not include a user ID.');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number(payload.exp ?? 0) <= nowSeconds) {
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

async function verifyVoiceHello(uid, idToken) {
  const decodedToken = allowUnverifiedVoiceSignaling
    ? { sub: uid }
    : await verifyFirebaseIdToken(idToken);
  if (decodedToken.sub !== uid) {
    throw new Error('Firebase token user did not match the voice connection user.');
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

function handleVoiceSignal(clientsByUid, socket, message) {
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

  const recipientUid = typeof message.recipientUid === 'string' ? message.recipientUid.trim() : '';
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

  const forwarded = {
    ...message,
    senderUid: socket.userUid,
    fromUid: socket.userUid,
    serverTime: Date.now()
  };
  for (const target of targets) {
    sendVoiceJson(target, forwarded);
  }
}

function setupVoiceSignalling(server) {
  const clientsByUid = new Map();
  const wss = new WebSocketServer({ server, path: '/voice' });

  wss.on('connection', (socket) => {
    socket.on('message', async (rawMessage) => {
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        sendVoiceJson(socket, { type: 'voice-error', message: 'Voice signal was not valid JSON.' });
        return;
      }

      if (message.type === 'hello') {
        const uid = typeof message.uid === 'string' ? message.uid.trim() : '';
        if (!uid) {
          sendVoiceJson(socket, { type: 'voice-error', message: 'Voice connection needs a signed-in user.' });
          return;
        }
        const browserSessionId = typeof message.sessionId === 'string' ? message.sessionId.trim() : '';
        try {
          await verifyVoiceHello(uid, message.idToken);
        } catch (error) {
          console.warn('[Kids WhatsApp] Voice auth rejected', { uid, error: error.message });
          sendVoiceJson(socket, {
            type: 'voice-error',
            message: 'Voice sign-in could not be verified. Refresh and sign in again.'
          });
          socket.close(1008, 'Voice auth failed');
          return;
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

      handleVoiceSignal(clientsByUid, socket, message);
    });

    socket.on('close', () => {
      removeVoiceClient(clientsByUid, socket);
      broadcastVoicePresence(wss, clientsByUid);
    });
    socket.on('error', () => {
      removeVoiceClient(clientsByUid, socket);
      broadcastVoicePresence(wss, clientsByUid);
    });
  });
}

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname;
  if (pathname === '/healthz') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/chats') {
    try {
      await handleChatsApi(request, response);
    } catch (error) {
      console.error('Chat API error:', error);
      sendJson(response, error.statusCode ?? 500, { error: 'Could not save chats' });
    }
    return;
  }

  const filePath = resolvePath(request.url ?? '/');
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
  createReadStream(filePath).pipe(response);
});

setupVoiceSignalling(server);

server.listen(port, host, () => {
  console.log(`ChatApp running at http://127.0.0.1:${port}`);
  console.log(`LAN access enabled at http://<this-computer-ip>:${port}`);
});
