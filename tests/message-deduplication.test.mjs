import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('sent messages use one Firestore-backed insertion and a unique document id', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');

  assert.doesNotMatch(app, /state = sendMessage\(state, text/);
  assert.doesNotMatch(app, /\bsendMessage,\s*\n\s*switchSection/);
  assert.match(
    firebase,
    /const messageRef = await addDoc\(\s*collection\(firebase\.db, 'conversations', conversationId, 'messages'\),\s*payload\s*\)/
  );
  assert.match(firebase, /const messageRef = await addDoc\(collection\(firebase\.db, 'groups', groupId, 'messages'\), payload\)/);
  assert.match(firebase, /return \{ id: messageRef\.id, \.\.\.payload \}/);
  assert.match(firebase, /id: item\.id/);
});
