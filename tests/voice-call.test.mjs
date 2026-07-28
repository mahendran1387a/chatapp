import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appFiles = [
  '../src/app.js',
  '../android/app/src/main/assets/www/src/app.js'
];

test('voice call action starts a real authenticated WebRTC workflow', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(app, /data-start-voice-call/);
    assert.match(app, /async function startVoiceCall/);
    assert.match(app, /currentAuthUser\?\.uid/);
    assert.match(app, /contact\?\.uid/);
    assert.match(app, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true, video: false \}\)/);
    assert.match(app, /new RTCPeerConnection/);
    assert.match(app, /createOffer\(\)/);
    assert.match(app, /type: 'call-offer'/);
    assert.match(app, /type: 'call-answer'/);
    assert.match(app, /type: 'ice-candidate'/);
    assert.match(app, /type: 'call-reject'/);
    assert.match(app, /type: 'call-ended'/);
  }
});

test('voice call UI exposes clear call states and permission failures', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    for (const stateLabel of ['Calling', 'Ringing', 'Connected', 'Failed', 'Ended']) {
      assert.match(app, new RegExp(stateLabel));
    }
    assert.match(app, /Microphone permission is needed/);
    assert.match(app, /Voice calls are only for one-to-one chats/);
  }
});

test('microphone permission is requested from the click path before call signalling starts', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    const startCode = app.slice(app.indexOf('async function startVoiceCall()'), app.indexOf('async function answerVoiceCall()'));
    const answerCode = app.slice(app.indexOf('async function answerVoiceCall()'), app.indexOf('function rejectVoiceCall()'));

    assert.ok(
      startCode.indexOf('await getVoiceLocalStream()') < startCode.indexOf('await ensureVoiceSocket()'),
      'outgoing calls must get microphone permission before signalling starts'
    );
    assert.ok(
      startCode.indexOf('await getVoiceLocalStream()') < startCode.indexOf('createVoicePeerConnection'),
      'outgoing calls must get microphone permission before creating WebRTC peer state'
    );
    assert.ok(
      answerCode.indexOf('await getVoiceLocalStream()') < answerCode.indexOf('await ensureVoiceSocket()'),
      'answering calls must get microphone permission before sending an answer'
    );
  }
});

test('microphone permission handling gives specific browser guidance and retry', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(app, /async function getMicrophonePermissionState/);
    assert.match(app, /navigator\.permissions\.query\(\{ name: 'microphone' \}\)/);
    assert.match(app, /window\.isSecureContext/);
    assert.match(app, /voicePermissionReason: 'granted'/);
    assert.match(app, /voicePermissionReason: 'prompt'/);
    assert.match(app, /voicePermissionReason: 'denied'/);
    assert.match(app, /voicePermissionReason: 'insecure-context'/);
    assert.match(app, /error\.name === 'NotAllowedError'/);
    assert.match(app, /error\.name === 'NotFoundError'/);
    assert.match(app, /error\.name === 'NotReadableError'/);
    assert.match(app, /Chrome\/Edge/);
    assert.match(app, /data-voice-call-retry/);
    assert.match(app, /console\.info\('\[Kids WhatsApp\] Requesting microphone access'/);
    assert.match(app, /console\.warn\('\[Kids WhatsApp\] Microphone access failed'/);
  }
});

test('voice signalling uses a production-safe websocket endpoint', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');
  const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

  assert.match(app, /location\.protocol === 'https:' \? 'wss:' : 'ws:'/);
  assert.match(app, /new WebSocket\(getVoiceSocketUrl\(\)\)/);
  assert.match(app, /currentAuthUser\.getIdToken\(\)/);
  assert.match(app, /sendVoiceSignal/);
  assert.match(app, /recipientUid/);
  assert.match(server, /import \{ WebSocket, WebSocketServer \} from 'ws'/);
  assert.match(server, /async function verifyFirebaseIdToken/);
  assert.match(server, /VOICE_SIGNALING_ALLOW_UNVERIFIED/);
  assert.match(server, /decodedToken\.sub !== uid/);
  assert.match(server, /new WebSocketServer\(\{ server, path: '\/voice' \}\)/);
  assert.match(server, /message\.senderUid !== socket\.userUid/);
  assert.match(server, /recipientUid/);
  assert.match(packageJson, /"ws":/);
});

test('voice call ICE config includes STUN and configurable TURN fallback support', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(app, /stun:stun\.l\.google\.com:19302/);
  assert.match(app, /KIDS_WHATSAPP_TURN_SERVERS/);
  assert.match(app, /voiceCallIceServers/);
  assert.match(app, /iceconnectionstatechange/);
});

test('authenticated users register their voice socket immediately after login and reconnect safely', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const authStart = app.indexOf('function startFirebaseAuth()');
  const authCode = app.slice(authStart);

  assert.match(authCode, /await saveUserProfile\(user\)/);
  assert.match(authCode, /ensureVoiceSocket\(\)\.catch/);
  assert.match(authCode, /subscribeCurrentUserProfile/);
  const afterProfileSave = authCode.slice(authCode.indexOf('await saveUserProfile(user)'));
  assert.ok(
    afterProfileSave.indexOf('ensureVoiceSocket().catch') < afterProfileSave.indexOf('subscribeCurrentUserProfile'),
    'voice socket registration should start before profile snapshot approval rendering'
  );
  assert.match(app, /voiceSocketShouldReconnect/);
  assert.match(app, /scheduleVoiceSocketReconnect/);
  assert.match(app, /voiceSocketReconnectAttempts/);
  assert.match(app, /closeVoiceSocket\(\{ intentional = true \} = \{\}\)/);
  assert.match(app, /sessionId: currentClientId/);
});

test('online labels use active voice socket presence instead of stale database-only status', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(app, /let voiceOnlineUserIds = new Set\(\)/);
    assert.match(app, /function getDisplayedOnlineStatus/);
    assert.match(app, /voiceOnlineUserIds\.has\(entity\?\.uid\)/);
    assert.match(app, /message\.type === 'voice-presence'/);
    assert.match(app, /updateCurrentPresence\('online', \{ force: true \}\)/);
    assert.match(app, /renderPresenceStatus\(getDisplayedOnlineStatus\(contact\), extraClass\)/);
    assert.match(app, /renderPresenceStatus\(getDisplayedOnlineStatus\(user\), 'mini'\)/);
  }
});

test('voice server tracks user id, socket id, browser session, and stale socket cleanup', () => {
  const server = readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');

  assert.match(server, /function createVoiceSocketId/);
  assert.match(server, /socket\.voiceSocketId/);
  assert.match(server, /socket\.browserSessionId/);
  assert.match(server, /socket\.lastSeenAt/);
  assert.match(server, /function getVoicePresenceSnapshot/);
  assert.match(server, /function broadcastVoicePresence/);
  assert.match(server, /type: 'voice-presence'/);
  assert.match(server, /socketCount/);
  assert.match(server, /browserSessionIds/);
  assert.match(server, /removeVoiceClient\(clientsByUid, socket\)/);
});
