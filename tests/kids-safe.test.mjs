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

const styleFiles = [
  '../styles.css',
  '../android/app/src/main/assets/www/styles.css'
];

test('kids-safe shell exposes chat, friends, and settings navigation', () => {
  for (const relativePath of webFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /Kids WhatsApp/);
    assert.match(contents, /data-section="chats"/);
    assert.match(contents, /data-section="friends"/);
    assert.match(contents, /data-section="settings"/);
    assert.match(contents, /data-panel="friends"/);
    assert.match(contents, /Friends &amp; Invites/);
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
    assert.match(contents, /data-emoji-toggle/);
    assert.match(contents, /data-emoji-value="😀"/);
    assert.match(contents, /😀 😂 🎮 🚀 🦄 🍕 ⚽/);
    assert.match(contents, /insertEmojiIntoMessage/);
    assert.match(contents, /message-status/);
    assert.match(contents, /readBy/);
    assert.doesNotMatch(contents, /data-action="attach"/);
    assert.doesNotMatch(contents, /renderCreateStatusForm/);
    assert.doesNotMatch(contents, /renderCreateChannelForm/);
    assert.doesNotMatch(contents, /renderBusinessProfileForm/);
  }
});

test('kids-safe app removes old status channel business and manual identity forms', () => {
  for (const relativePath of appFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.doesNotMatch(contents, /function disabledStatusComposer/);
    assert.doesNotMatch(contents, /function disabledChannelComposer/);
    assert.doesNotMatch(contents, /createStatusForm/);
    assert.doesNotMatch(contents, /createChannelForm/);
    assert.doesNotMatch(contents, /businessToolForm/);
    assert.doesNotMatch(contents, /businessProfileValues/);
    assert.doesNotMatch(contents, /createdChannelValues/);
    assert.doesNotMatch(contents, /statusValues/);
    assert.doesNotMatch(contents, /id="editContactForm"/);
    assert.doesNotMatch(contents, /data-contact-menu-action="edit-contact"/);
  }
});

test('chat view keeps the composer available after auth refresh when a chat is selected', () => {
  for (const relativePath of appFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /function hasSelectedChat\(\)/);
    assert.match(contents, /if \(chatsLoading && !hasSelectedChat\(\)\)/);
    assert.match(contents, /let restoreSelectedChatOnLoad = Boolean\(savedInitialChatState\.activeContactId\)/);
    assert.match(contents, /restoreSelectedChatOnLoad && state\.activeSection === 'chats' && hasSelectedChat\(\)/);
    assert.match(contents, /function renderNoChatSelected\(\)/);
    assert.match(contents, /Choose a friend to start chatting\./);
    assert.match(contents, /<form class="composer" id="composer">/);
    assert.match(contents, /data-emoji-toggle/);
    assert.match(contents, /data-action="voiceCall"/);
  }
});

test('chat refresh waits for Firestore users and groups before leaving loading state', () => {
  for (const relativePath of appFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /let approvedUsersLoaded = false/);
    assert.match(contents, /let userGroupsLoaded = false/);
    assert.match(contents, /function areApprovedChatListsReady\(\)/);
    assert.match(contents, /function resetApprovedChatLoadingState\(\)/);
    assert.match(contents, /approvedUsersLoaded = true/);
    assert.match(contents, /userGroupsLoaded = true/);
    assert.match(contents, /chatsLoading = !areApprovedChatListsReady\(\)/);
    assert.doesNotMatch(contents, /refresh again/i);
  }
});

test('chat layout keeps the message bar inside the visible screen on desktop and mobile', () => {
  for (const relativePath of styleFiles) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(contents, /\.content \{[\s\S]*?height: 100%;[\s\S]*?overflow: hidden;/);
    assert.match(contents, /\.conversation \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto;[\s\S]*?overflow: hidden;/);
    assert.match(contents, /\.messages \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
    assert.match(contents, /\.composer \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;[\s\S]*?z-index: 5;/);
  }
});

test('kids-safe app keeps Google identity as the only chat identity source', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/chat-store.js', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(app, /currentAuthUser\.uid/);
  assert.match(app, /currentAuthUser\.email/);
  assert.match(firebase, /senderUid: user\.uid/);
  assert.match(firebase, /senderEmail: user\.email/);
  assert.match(firebase, /readBy: \[user\.uid\]/);
  assert.match(rules, /request\.auth\.uid/);
  assert.match(rules, /readBy/);
  assert.match(store, /export function createContactChat\(state\)[\s\S]*return state;/);
  assert.match(store, /export function updateContactChat\(state\)[\s\S]*return state;/);
});
