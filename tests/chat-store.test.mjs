import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createAuthenticatedContact,
  createContactChat,
  createInitialState,
  filterContacts,
  getActionView,
  getActiveContact,
  getSettingOptionView,
  getSettingDangerView,
  getSettingsPage,
  deleteContactChat,
  deleteLatestContactMessage,
  deleteMessage,
  reconcileAuthenticatedContacts,
  updateContactChat,
  updateMessage,
  searchSettings,
  toggleChannelFollow,
  sendMessage,
  switchSection
} from '../src/chat-store.js';

function buildSavedContact(overrides = {}) {
  return {
    id: 'aisha-saved',
    name: 'Aisha Saved',
    phone: '+971 50 123 4567',
    avatar: 'AS',
    color: '#0aa884',
    preview: 'New chat created',
    time: 'Now',
    unread: 0,
    favorite: false,
    group: false,
    messages: [
      { id: 'aisha-saved-created', direction: 'in', text: 'New chat created with +971 50 123 4567', time: 'Now' }
    ],
    ...overrides
  };
}

test('starts without reference chat names', () => {
  const state = createInitialState();

  assert.equal(state.activeSection, 'chats');
  assert.equal(state.activeContactId, undefined);
  assert.deepEqual(state.contacts, []);
});

test('removes reference chat names from saved state', () => {
  const state = createInitialState({
    activeContactId: 'sangavi-love-1778002802119',
    contacts: [
      buildSavedContact({ id: 'dunes', name: 'Dunes_KG1B@2026' }),
      buildSavedContact({ id: 'aadhish-1778003171685', name: 'Aadhish' }),
      buildSavedContact({ id: 'sangavi-love-1778002802119', name: 'Sangavi Love' }),
      buildSavedContact({ id: 'live-sync-contact', name: 'Live Sync Contact' }),
      buildSavedContact({ id: 'real-friend', name: 'Real Friend' })
    ]
  });

  assert.deepEqual(
    state.contacts.map((contact) => contact.name),
    ['Real Friend']
  );
  assert.equal(state.activeContactId, 'real-friend');
});

test('restores saved chats after reload', () => {
  const savedContact = buildSavedContact();

  const state = createInitialState({
    contacts: [savedContact],
    activeContactId: savedContact.id
  });

  assert.equal(state.activeContactId, savedContact.id);
  assert.equal(state.contacts[0].name, 'Aisha Saved');
  assert.equal(getActiveContact(state).phone, '+971 50 123 4567');
});

test('adds a Gmail display line to older saved contacts without one', () => {
  const savedContact = buildSavedContact({ name: 'Paper Friend', email: undefined, preview: 'hi' });

  const state = createInitialState({ contacts: [savedContact], activeContactId: savedContact.id });

  assert.equal(state.contacts[0].email, 'paper.friend@gmail.com');
  assert.equal(state.contacts[0].preview, 'hi');
});

test('filters contacts by search term and unread mode', () => {
  const state = createInitialState({
    contacts: [
      buildSavedContact({ id: 'city-hospital', name: 'City Hospital', unread: 1 }),
      buildSavedContact({ id: 'friend', name: 'Aisha Friend', unread: 0 })
    ],
    activeContactId: 'city-hospital'
  });

  const hospital = filterContacts(state, { query: 'hospital', filter: 'all' });
  const unread = filterContacts(state, { query: '', filter: 'unread' });

  assert.deepEqual(hospital.map((contact) => contact.name), ['City Hospital']);
  assert.ok(unread.every((contact) => contact.unread > 0));
});

test('sends a message to the active contact without an automatic reply', () => {
  const savedContact = buildSavedContact();
  const state = createInitialState({ contacts: [savedContact], activeContactId: savedContact.id });
  const before = getActiveContact(state).messages.length;

  const updated = sendMessage(state, 'Are we meeting today?', {
    senderId: 'device-a',
    senderUid: 'uid-a',
    senderEmail: 'aisha@gmail.com',
    senderDisplayName: 'Aisha Google',
    senderPhotoURL: 'https://example.com/aisha.png'
  });
  const messages = getActiveContact(updated).messages;

  assert.equal(messages.length, before + 1);
  assert.equal(messages.at(-1).text, 'Are we meeting today?');
  assert.equal(messages.at(-1).direction, 'out');
  assert.equal(messages.at(-1).senderId, 'device-a');
  assert.equal(messages.at(-1).senderUid, 'uid-a');
  assert.equal(messages.at(-1).senderEmail, 'aisha@gmail.com');
  assert.equal(messages.at(-1).senderDisplayName, 'Aisha Google');
});

test('kids-safe mode blocks status, channels, communities, and business sections', () => {
  const state = createInitialState();

  assert.equal(switchSection(state, 'status').activeSection, 'chats');
  assert.equal(switchSection(state, 'channels').activeSection, 'chats');
  assert.equal(switchSection(state, 'communities').activeSection, 'chats');
  assert.equal(switchSection(state, 'business').activeSection, 'chats');
});

test('toggles channel follow state', () => {
  const state = createInitialState();
  const updated = toggleChannelFollow(state, 'lovin-dubai');
  const channel = updated.channels.find((item) => item.id === 'lovin-dubai');

  assert.equal(channel.following, true);
});

test('switches to settings section', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'settings');

  assert.equal(updated.activeSection, 'settings');
});

test('disabled privacy-risk buttons return kids-safe detail content', () => {
  const view = getActionView('catalog');

  assert.equal(view.title, 'Kids-safe mode');
  assert.match(view.body, /text chat, group chat, and voice calls/i);
  assert.equal(view.primaryAction, 'OK');
});

test('returns nested settings page options', () => {
  const page = getSettingsPage('privacy');

  assert.equal(page.title, 'Privacy');
  assert.ok(page.items.some((item) => item.label === 'Blocked friends'));
  assert.ok(page.items.some((item) => item.type === 'toggle'));
});

test('returns logout confirmation settings page', () => {
  const page = getSettingsPage('logout');

  assert.equal(page.title, 'Log out');
  assert.equal(page.items[0].type, 'danger');
});

test('logout danger action exposes a real confirmation flow', () => {
  const view = getSettingDangerView('Log out from this computer');

  assert.equal(view.title, 'Log out from this computer?');
  assert.equal(view.primaryAction, 'Log out');
  assert.equal(view.finalAction, 'logout');
});

test('profile settings include kid ownership fields', () => {
  const page = getSettingsPage('profile');

  assert.ok(page.items.some((item) => item.type === 'readonly' && item.label === 'Name'));
  assert.ok(page.items.some((item) => item.type === 'readonly' && item.label === 'Photo'));
  assert.ok(page.items.some((item) => item.type === 'input' && item.label === 'Status'));
  assert.ok(page.items.some((item) => item.type === 'input' && item.label === 'Favorite color'));
  assert.ok(page.items.some((item) => item.type === 'textarea' && item.label === 'Fun bio'));
});

test('uses AM profile identity in settings and bundled Android app', () => {
  const page = getSettingsPage('profile');
  const profileView = getActionView('profile');
  const nameField = page.items.find((item) => item.label === 'Name');

  assert.equal(nameField.value, 'Aadhish Mahendran');
  assert.ok(profileView.points.includes('Your name'));

  for (const relativePath of [
    '../src/app.js',
    '../src/chat-store.js',
    '../android/app/src/main/assets/www/src/app.js',
    '../android/app/src/main/assets/www/src/chat-store.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(contents, /Sangavi Mahendran/);
    assert.doesNotMatch(contents, /profile-(?:edit-)?photo">SM/);
  }
});

test('clicking the avatar opens a kid profile ownership page', () => {
  for (const relativePath of [
    '../src/app.js',
    '../android/app/src/main/assets/www/src/app.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(contents, /data-open-profile/);
    assert.match(contents, /function openKidProfilePage\(\)/);
    assert.match(contents, /Safe sign-in name/);
    assert.match(contents, /Profile photo/);
    assert.match(contents, /Favorite color/);
    assert.match(contents, /Fun bio/);
    assert.match(contents, /id="profileForm"/);
  }
});

test('business profile action is disabled in kids-safe mode', () => {
  const view = getActionView('businessProfile');

  assert.equal(view.title, 'Kids-safe mode');
  assert.equal(view.fields, undefined);
});

test('creates a new chat from a friend name, phone number, and Gmail', () => {
  const state = createInitialState();
  const updated = createContactChat(state, {
    name: 'Aisha Friend',
    phone: '+971 50 123 4567',
    email: 'aisha.friend@gmail.com'
  });
  const contact = updated.contacts.find((item) => item.name === 'Aisha Friend');

  assert.equal(updated.activeContactId, contact.id);
  assert.equal(contact.phone, '+971 50 123 4567');
  assert.equal(contact.email, 'aisha.friend@gmail.com');
  assert.equal(contact.preview, 'aisha.friend@gmail.com');
  assert.equal(contact.messages[0].text, 'New chat created with +971 50 123 4567');
});

test('creates a Gmail contact display from only the friend name when Gmail is blank', () => {
  const state = createInitialState();
  const updated = createContactChat(state, { name: 'Paper Friend', phone: '+971 50 765 4321' });
  const contact = updated.contacts.find((item) => item.name === 'Paper Friend');

  assert.equal(contact.email, 'paper.friend@gmail.com');
  assert.equal(contact.preview, 'paper.friend@gmail.com');
});

test('creates contacts only from authenticated Firebase users', () => {
  const state = createInitialState();
  const updated = createAuthenticatedContact(state, {
    uid: 'uid-aisha',
    email: 'aisha@gmail.com',
    displayName: 'Aisha Google',
    photoURL: 'https://example.com/aisha.png',
    onlineStatus: 'away'
  });
  const contact = updated.contacts[0];

  assert.equal(contact.id, 'uid-aisha');
  assert.equal(contact.uid, 'uid-aisha');
  assert.equal(contact.email, 'aisha@gmail.com');
  assert.equal(contact.name, 'Aisha Google');
  assert.equal(contact.photoURL, 'https://example.com/aisha.png');
  assert.equal(contact.onlineStatus, 'away');
});

test('filters chat contacts to authenticated users only', () => {
  const manual = buildSavedContact({ id: 'manual-fake', name: 'Fake User' });
  const authenticated = buildSavedContact({ id: 'uid-friend', uid: 'uid-friend', name: 'Friend' });
  const state = createInitialState({ contacts: [manual, authenticated], activeContactId: manual.id });

  const updated = reconcileAuthenticatedContacts(state, [
    { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
    { uid: 'uid-friend', email: 'friend@gmail.com', displayName: 'Friend Google' }
  ], 'uid-me');

  assert.deepEqual(updated.contacts.map((contact) => contact.id), ['uid-friend']);
  assert.equal(updated.contacts[0].email, 'friend@gmail.com');
  assert.equal(updated.activeContactId, 'uid-friend');
});

test('deduplicates authenticated users by Gmail account', () => {
  const state = createInitialState();

  const updated = reconcileAuthenticatedContacts(state, [
    { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
    { uid: 'uid-first', email: 'friend@gmail.com', displayName: 'Friend First' },
    { uid: 'uid-duplicate', email: 'FRIEND@gmail.com', displayName: 'Friend Duplicate' },
    { uid: 'uid-other', email: 'other@gmail.com', displayName: 'Other Friend' }
  ], 'uid-me');

  assert.deepEqual(updated.contacts.map((contact) => contact.email), ['friend@gmail.com', 'other@gmail.com']);
  assert.deepEqual(updated.contacts.map((contact) => contact.id), ['uid-first', 'uid-other']);
});

test('updates authenticated contact online status from Google user records', () => {
  const state = createInitialState({
    contacts: [
      buildSavedContact({
        id: 'uid-friend',
        uid: 'uid-friend',
        name: 'Friend',
        email: 'friend@gmail.com',
        onlineStatus: 'offline'
      })
    ],
    activeContactId: 'uid-friend'
  });

  const updated = reconcileAuthenticatedContacts(state, [
    { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me', onlineStatus: 'online' },
    { uid: 'uid-friend', email: 'friend@gmail.com', displayName: 'Friend Google', onlineStatus: 'online' }
  ], 'uid-me');

  assert.equal(updated.contacts[0].onlineStatus, 'online');
});

test('filters signed-in users locally for automatic discovery', async () => {
  const store = await import('../src/chat-store.js');
  assert.equal(typeof store.filterAuthenticatedUsers, 'function');

  const users = [
    { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
    { uid: 'uid-aisha', email: 'aisha.friend@gmail.com', displayName: 'Aisha Friend' },
    { uid: 'uid-rohan', email: 'rohan.home@gmail.com', displayName: 'Rohan Home' },
    { uid: 'uid-dupe', email: 'AISHA.friend@gmail.com', displayName: 'Aisha Duplicate' }
  ];

  const allFriends = store.filterAuthenticatedUsers(users, 'uid-me', '');
  const byName = store.filterAuthenticatedUsers(users, 'uid-me', 'aisha');
  const byHiddenEmail = store.filterAuthenticatedUsers(users, 'uid-me', 'home@gmail');

  assert.deepEqual(allFriends.map((user) => user.uid), ['uid-aisha', 'uid-rohan']);
  assert.deepEqual(byName.map((user) => user.uid), ['uid-aisha']);
  assert.deepEqual(byHiddenEmail.map((user) => user.uid), ['uid-rohan']);
});

test('marks the latest chat message as deleted from the chat list', () => {
  const savedContact = buildSavedContact({ id: 'aadhish', name: 'aadhish', preview: 'nvjkfmnb' });
  const state = createInitialState({ contacts: [savedContact], activeContactId: savedContact.id });

  const updated = deleteLatestContactMessage(state, savedContact.id);
  const contact = updated.contacts[0];

  assert.equal(contact.deleted, true);
  assert.equal(contact.preview, 'This message was deleted');
  assert.equal(contact.messages.at(-1).text, 'This message was deleted');
});

test('deletes a username contact from the chat list', () => {
  const first = buildSavedContact({ id: 'aadhish', name: 'aadhish' });
  const second = buildSavedContact({ id: 'friend', name: 'Friend' });
  const state = createInitialState({ contacts: [first, second], activeContactId: first.id });

  const updated = deleteContactChat(state, first.id);

  assert.deepEqual(updated.contacts.map((contact) => contact.name), ['Friend']);
  assert.equal(updated.activeContactId, 'friend');
  assert.ok(updated.deletedContactIds.includes('aadhish'));
});

test('edits a username contact name and phone number', () => {
  const contact = buildSavedContact({ id: 'aadhish', name: 'aadhish', phone: '+971 50 111 2222' });
  const state = createInitialState({ contacts: [contact], activeContactId: contact.id });

  const updated = updateContactChat(state, contact.id, {
    name: 'Aadhish Home',
    phone: '+91 98765 43210',
    email: 'aadhish.home@gmail.com'
  });

  assert.equal(updated.contacts[0].name, 'Aadhish Home');
  assert.equal(updated.contacts[0].phone, '+91 98765 43210');
  assert.equal(updated.contacts[0].email, 'aadhish.home@gmail.com');
  assert.equal(updated.contacts[0].preview, 'aadhish.home@gmail.com');
  assert.equal(updated.activeContactId, contact.id);
});

test('edits and deletes a selected chat message by right-click target', () => {
  const contact = buildSavedContact({
    id: 'aadhish',
    name: 'aadhish',
    messages: [
      { id: 'msg-1', direction: 'out', text: 'paper', time: '10:00 PM' },
      { id: 'msg-2', direction: 'in', text: 'hello', time: '10:01 PM' }
    ]
  });
  const state = createInitialState({ contacts: [contact], activeContactId: contact.id });

  const edited = updateMessage(state, contact.id, 'msg-1', 'paper is not there');
  const deleted = deleteMessage(edited, contact.id, 'msg-2');

  assert.equal(edited.contacts[0].messages[0].text, 'paper is not there');
  assert.equal(deleted.contacts[0].messages[1].text, 'This message was deleted');
  assert.equal(deleted.contacts[0].messages[1].deleted, true);
});

test('chat contact actions open from right click or name press instead of permanent row buttons', () => {
  const contents = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(contents, /chatList\.addEventListener\('contextmenu'/);
  assert.match(contents, /data-contact-menu/);
  assert.match(contents, /id="editContactForm"/);
  assert.doesNotMatch(contents, /class="chat-row-action"/);
});

test('message actions open from right-clicking a message bubble only', () => {
  const contents = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  assert.match(contents, /data-message-id/);
  assert.match(contents, /messages\.addEventListener\('contextmenu'/);
  assert.match(contents, /data-message-menu-action="edit"/);
  assert.match(contents, /id="editMessageForm"/);
  assert.doesNotMatch(contents, /data-contact-menu-action="delete-message"/);
});

test('new chat flow uses authenticated Google users instead of typed names', () => {
  for (const relativePath of [
    '../src/app.js',
    '../android/app/src/main/assets/www/src/app.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(contents, /function renderAuthenticatedUserList\(view\)/);
    assert.match(contents, /data-auth-user-id/);
    assert.match(contents, /filterAuthenticatedUsers/);
    assert.match(contents, /createAuthenticatedContact\(state, selectedUser\)/);
    assert.match(contents, /renderPresenceStatus/);
    assert.match(contents, /🟢 Online/);
    assert.match(contents, /🌙 Away/);
    assert.match(contents, /⚫ Offline/);
    assert.match(contents, /Search friends/);
    assert.match(contents, /Online friends/);
    assert.match(contents, /id="friendSearchForm"/);
    assert.match(contents, /data-friend-search-input/);
    assert.match(contents, /Only approved family and friends can chat here/);
    assert.doesNotMatch(contents, /id="newChatForm"/);
    assert.match(contents, /function getContactEmail\(contact\)/);
    assert.match(contents, /if \(activeAction === 'newChat'\) return;/);
    assert.doesNotMatch(contents, /data-friend-search-submit/);
    assert.doesNotMatch(contents, /Find friend by Gmail/);
    assert.doesNotMatch(contents, /Press Search to find or invite this Gmail/);
    assert.doesNotMatch(contents, /Invite sent \/ ask friend to sign in first\./);
    assert.doesNotMatch(contents, /subscribeUserByEmail/);
    assert.doesNotMatch(contents, /contact-avatar-wrap/);
    assert.doesNotMatch(contents, /value="\$\{escapeAttribute\(newChatDraft\.name\)\}"/);
    assert.doesNotMatch(contents, /placeholder="Aisha Friend"/);
  }
});

test('new chat automatically shows signed-in users and search only filters them', () => {
  for (const relativePath of [
    '../src/app.js',
    '../android/app/src/main/assets/www/src/app.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(contents, /Search friends/);
    assert.match(contents, /Online friends/);
    assert.match(contents, /No approved family yet/);
    assert.match(contents, /filterAuthenticatedUsers/);
    assert.match(contents, /data-friend-search-input/);
    assert.doesNotMatch(contents, /subscribeUserByEmail/);
    assert.doesNotMatch(contents, /Find friend by Gmail/);
    assert.doesNotMatch(contents, /Search \/ Invite/);
    assert.doesNotMatch(contents, /Press Search to find or invite this Gmail/);
    assert.doesNotMatch(contents, /Searching\.\.\./);
  }
});

test('text inputs keep focus during live sync and settings search typing', () => {
  for (const relativePath of [
    '../src/app.js',
    '../android/app/src/main/assets/www/src/app.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(contents, /function isTextEntryActive\(\)/);
    assert.match(contents, /if \(isTextEntryActive\(\)\) return;\s+renderAll\(\);/);
    assert.match(contents, /function renderSettingsScrollableContent\(\)/);
    assert.match(contents, /settingsScroll\.innerHTML = renderSettingsScrollableContent\(\)/);
    assert.doesNotMatch(contents, /refreshedInput\.focus\(\)/);
  }
});

test('kid shell hides the confusing chat overflow menu', () => {
  for (const relativePath of [
    '../index.html',
    '../android/app/src/main/assets/www/index.html'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(contents, /data-action="chatMenu"/);
  }
});

test('media and sharing actions are disabled in kids-safe mode', () => {
  for (const actionId of [
    'discoverChannels',
    'createChannel',
    'addChannel',
    'addStatus',
    'exampleCommunities',
    'catalog',
    'quickReplies',
    'labels',
    'attach'
  ]) {
    const view = getActionView(actionId);
    assert.equal(view.title, 'Kids-safe mode');
    assert.equal(view.form, undefined);
    assert.equal(view.fields, undefined);
    assert.equal(view.discoverItems, undefined);
    assert.equal(view.communityExamples, undefined);
    assert.equal(view.listItems, undefined);
  }
});

test('settings option rows expose specific choices', () => {
  const theme = getSettingOptionView('Theme');
  const wallpaper = getSettingOptionView('Wallpaper');

  assert.deepEqual(theme.options, ['Light', 'Dark', 'System default']);
  assert.ok(wallpaper.options.includes('Default doodle'));
});

test('settings search returns matching rows that can be opened', () => {
  const chatResults = searchSettings('chat');
  const privacyResults = searchSettings('privacy');
  const missingResults = searchSettings('nothing-here');

  assert.ok(chatResults.some((row) => row.label === 'Chats' && row.page === 'chatsSettings'));
  assert.ok(chatResults.every((row) => `${row.label} ${row.detail}`.toLowerCase().includes('chat')));
  assert.deepEqual(privacyResults.map((row) => row.label), ['Privacy']);
  assert.deepEqual(missingResults, []);
});
