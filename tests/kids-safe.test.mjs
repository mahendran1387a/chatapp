import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const webFiles = [
  '../index.html',
  '../android/app/src/main/assets/www/index.html'
];

const appFiles = [
  '../src/app.js',
  '../android/app/src/main/assets/www/src/app.js'
];

test('kids-safe shell exposes only chat and settings navigation', () => {
  for (const relativePath of webFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /Kids WhatsApp/);
    assert.match(contents, /data-section="chats"/);
    assert.match(contents, /data-section="settings"/);
    assert.doesNotMatch(contents, /data-section="status"/);
    assert.doesNotMatch(contents, /data-section="channels"/);
    assert.doesNotMatch(contents, /data-section="communities"/);
    assert.doesNotMatch(contents, /data-section="business"/);
    assert.doesNotMatch(contents, /\b(photo|video|file|catalog|advertise|business)\b/i);
  }
});

test('conversation allows text and voice call only, with no attachment/media button', () => {
  for (const relativePath of appFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /data-action="voiceCall"/);
    assert.match(contents, /textarea id="messageInput"/);
    assert.match(contents, /message-status/);
    assert.match(contents, /readBy/);
    assert.doesNotMatch(contents, /data-action="attach"/);
    assert.doesNotMatch(contents, /renderCreateStatusForm/);
    assert.doesNotMatch(contents, /renderCreateChannelForm/);
    assert.doesNotMatch(contents, /renderBusinessProfileForm/);
  }
});

test('kids-safe app keeps Google identity as the only chat identity source', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(app, /currentAuthUser\.uid/);
  assert.match(app, /currentAuthUser\.email/);
  assert.match(firebase, /senderUid: user\.uid/);
  assert.match(firebase, /senderEmail: user\.email/);
  assert.match(firebase, /readBy: \[user\.uid\]/);
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /readBy/);
});
