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
    assert.match(app, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
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
