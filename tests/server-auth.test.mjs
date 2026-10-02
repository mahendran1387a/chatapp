import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createAppServer, verifyApprovedFirebaseUser, verifyFirebaseIdToken } from '../scripts/serve.mjs';

async function startServer(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-auth-'));
  const server = createAppServer({ root, databaseUrl: '', ...options });
  const connections = new Set();
  server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of connections) socket.destroy(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  return `http://127.0.0.1:${server.address().port}`;
}
const identity = async token => {
  if (token === 'pending') throw Object.assign(new Error('Approved profile required'), { statusCode: 403 });
  if (!['alice', 'bob'].includes(token)) throw Object.assign(new Error('Invalid sign-in'), { statusCode: 401 });
  return { sub: token, email: `${token}@example.test`, name: token, picture: '' };
};
const headers = uid => ({ Authorization: `Bearer ${uid}` });

test('authenticated API isolates saved chat state by verified UID and rejects invalid sign-ins', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  assert.equal((await fetch(`${url}/api/chats`, { headers: headers('bad') })).status, 401);
  assert.equal((await fetch(`${url}/api/chats`, { headers: headers('pending') })).status, 403);
  assert.equal((await fetch(`${url}/api/chats`, { method: 'POST', headers: headers('alice'), body: '{"contacts":[{"id":"friend","messages":[{"id":"m1","text":"private"}]}]}' })).status, 200);
  assert.deepEqual(await (await fetch(`${url}/api/chats`, { headers: headers('bob') })).json(), {});
  const saved = await (await fetch(`${url}/api/chats`, { headers: headers('alice') })).json();
  assert.equal(saved.contacts[0].messages[0].text, 'private');
});

test('chat API rejects invalid JSON and shape without poisoning later valid saves', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  for (const body of ['{broken', 'null', '[]', '{"contacts":{}}', '{"contacts":[null]}', '{"contacts":[{"id":"friend","messages":{}}]}', '{"deletedContactIds":"friend"}']) {
    assert.equal((await fetch(`${url}/api/chats`, { method: 'POST', headers: headers('alice'), body })).status, 400, body);
  }
  assert.equal((await fetch(`${url}/api/chats`, { method: 'POST', headers: headers('alice'), body: '{"contacts":[]}' })).status, 200);
});

async function connectVoice(t, url, uid) {
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/voice');
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const ready = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'hello', uid, idToken: uid, sessionId: 'fixture' }));
  assert.equal(JSON.parse((await ready)[0]).type, 'voice-ready');
  return socket;
}
async function receiveAfter(socket, send, wantedType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', handler); reject(new Error(`Expected ${wantedType ?? 'message'} but server did not respond`)); }, 1000);
    const handler = data => { const message = JSON.parse(data); if (!wantedType || message.type === wantedType) { socket.off('message', handler); clearTimeout(timer); resolve(message); } };
    socket.on('message', handler); send();
  });
}

test('voice rejects pending profiles and mismatched signed-in identities', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  for (const { uid, idToken } of [{ uid: 'pending', idToken: 'pending' }, { uid: 'alice', idToken: 'bob' }]) {
    const socket = new WebSocket(url.replace('http:', 'ws:') + '/voice');
    t.after(() => socket.terminate());
    await once(socket, 'open');
    const result = await receiveAfter(socket, () => socket.send(JSON.stringify({ type: 'hello', uid, idToken })));
    assert.equal(result.type, 'voice-error');
    await once(socket, 'close');
  }
});

test('voice routes authenticated calls and rejects forged senders and malformed call payloads', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  const alice = await connectVoice(t, url, 'alice');
  const bob = await connectVoice(t, url, 'bob');
  const offer = { type: 'call-offer', senderUid: 'alice', recipientUid: 'bob', callId: 'call-1', offer: { type: 'offer', sdp: 'v=0\r\n' } };
  const received = await receiveAfter(bob, () => alice.send(JSON.stringify(offer)), 'call-offer');
  assert.equal(received.senderUid, 'alice');
  assert.equal(received.fromUid, 'alice');
  assert.deepEqual(received.offer, offer.offer);
  const spoofed = await receiveAfter(bob, () => alice.send(JSON.stringify({ ...offer, senderEmail: 'bob@example.test', senderDisplayName: 'Bob', senderPhotoURL: 'https://unrelated.example.test/bob.png' })), 'call-offer');
  assert.equal(spoofed.senderEmail, 'alice@example.test');
  assert.equal(spoofed.senderDisplayName, 'alice');
  assert.equal(spoofed.senderPhotoURL, '');
  const forged = await receiveAfter(alice, () => alice.send(JSON.stringify({ ...offer, senderUid: 'bob' })), 'voice-error');
  assert.match(forged.message, /identity/);
  // The recipient must never receive signals missing a valid call identity or description.
  const malformed = await receiveAfter(alice, () => alice.send(JSON.stringify({ type: 'call-offer', senderUid: 'alice', recipientUid: 'bob', offer: null })), 'voice-error');
  assert.match(malformed.message, /Invalid/);
});

test('existing voice sockets lose call access when approval is withdrawn', async t => {
  let approved = true;
  const url = await startServer(t, { authorizeUser: async token => { if (!approved) throw new Error('Approval withdrawn'); return identity(token); } });
  const alice = await connectVoice(t, url, 'alice');
  await connectVoice(t, url, 'bob');
  approved = false;
  const result = await receiveAfter(alice, () => alice.send(JSON.stringify({ type: 'call-ended', senderUid: 'alice', recipientUid: 'bob', callId: 'call-1' })), 'voice-error');
  assert.match(result.message, /verified|approved/);
});

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
function jwt(changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'alice', aud: 'kidswhatsapp-6fffb', iss: 'https://securetoken.google.com/kidswhatsapp-6fffb', email: 'alice@example.test', exp: now + 3600, iat: now, auth_time: now, ...changes })).toString('base64url');
  const body = `${header}.${payload}`;
  return `${body}.${sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`;
}

test('Firebase verification checks signed claims and requires matching approved Firestore profile', async () => {
  const originalFetch = globalThis.fetch;
  let approved = true;
  let profileUid = 'alice';
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('https://www.googleapis.com/robot/')) return new Response(JSON.stringify({ fixture: publicKey.export({ type: 'spki', format: 'pem' }) }), { headers: { 'cache-control': 'max-age=0' } });
    assert.equal(url, 'https://firestore.googleapis.com/v1/projects/kidswhatsapp-6fffb/databases/(default)/documents/users/alice');
    assert.equal(options.headers.Authorization, `Bearer ${valid}`);
    return new Response(JSON.stringify({ fields: { uid: { stringValue: profileUid }, email: { stringValue: 'alice@example.test' }, approved: { booleanValue: approved } } }));
  };
  let valid = jwt();
  try {
    assert.equal((await verifyApprovedFirebaseUser(valid)).sub, 'alice');
    valid = jwt({ email: 'Alice@Example.Test' });
    assert.equal((await verifyApprovedFirebaseUser(valid)).sub, 'alice');
    approved = false;
    await assert.rejects(verifyApprovedFirebaseUser(valid), error => error.statusCode === 403);
    approved = true; profileUid = 'bob';
    await assert.rejects(verifyApprovedFirebaseUser(valid), error => error.statusCode === 403);
    for (const token of [jwt({ exp: 0 }), jwt({ exp: 'not-a-number' }), jwt({ aud: 'wrong-project' }), jwt({ iat: Math.floor(Date.now() / 1000) + 1000 }), `${valid}.extra`]) {
      await assert.rejects(verifyFirebaseIdToken(token));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('voice upgrade rejects an unrelated browser origin', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/voice', { origin: 'https://unrelated.example.test' });
  t.after(() => socket.terminate());
  const status = await new Promise(resolve => {
    socket.on('error', () => {});
    socket.on('unexpected-response', (_, response) => { response.resume(); resolve(response.statusCode); });
    socket.on('open', () => { socket.close(); resolve(101); });
  });
  assert.equal(status, 403);
});

test('oversized chat request receives 413 without disconnecting or crashing the server', async t => {
  const url = await startServer(t, { authorizeUser: identity });
  const { maxRequestBodyBytes } = await import('../scripts/http-utils.mjs');
  const response = await fetch(`${url}/api/chats`, { method: 'POST', headers: headers('alice'), body: 'x'.repeat(maxRequestBodyBytes + 1) }).catch(() => ({ status: 'disconnected' }));
  assert.equal(response.status, 413);
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
});

test('voice connection closes when its verified Firebase token expires', async t => {
  const url = await startServer(t, { authorizeUser: async token => ({ ...(await identity(token)), exp: Math.ceil(Date.now() / 1000) + 1 }) });
  const alice = await connectVoice(t, url, 'alice');
  const closed = await Promise.race([
    once(alice, 'close').then(([code]) => code),
    new Promise(resolve => { const timer = setTimeout(() => resolve('still-open'), 2200); timer.unref(); })
  ]);
  assert.equal(closed, 1008);
});

test('a socket changing signed-in users cannot receive an in-flight call for its old identity', async t => {
  let releaseVerification;
  let signalVerificationStarted;
  const started = new Promise(resolve => { signalVerificationStarted = resolve; });
  let aliceChecks = 0;
  const url = await startServer(t, { authorizeUser: async token => {
    if (token === 'alice' && ++aliceChecks === 2) {
      signalVerificationStarted();
      await new Promise(resolve => { releaseVerification = resolve; });
    }
    return { sub: token, email: `${token}@example.test` };
  } });
  const alice = await connectVoice(t, url, 'alice');
  const recipient = await connectVoice(t, url, 'bob');
  alice.send(JSON.stringify({ type: 'call-offer', senderUid: 'alice', recipientUid: 'bob', callId: 'call-race', offer: { type: 'offer', sdp: 'v=0' } }));
  await started;
  const switched = await receiveAfter(recipient, () => recipient.send(JSON.stringify({ type: 'hello', uid: 'charlie', idToken: 'charlie' })), 'voice-ready');
  assert.equal(switched.uid, 'charlie');
  const delivered = new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), 150);
    recipient.on('message', data => { if (JSON.parse(data).type === 'call-offer') { clearTimeout(timer); resolve(true); } });
  });
  releaseVerification();
  assert.equal(await delivered, false, 'Charlie must not receive Bobs call');
});
