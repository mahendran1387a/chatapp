import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
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

  const updated = sendMessage(state, 'Are we meeting today?', { senderId: 'device-a' });
  const messages = getActiveContact(updated).messages;

  assert.equal(messages.length, before + 1);
  assert.equal(messages.at(-1).text, 'Are we meeting today?');
  assert.equal(messages.at(-1).direction, 'out');
  assert.equal(messages.at(-1).senderId, 'device-a');
});

test('switches between chat and status sections', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'status');

  assert.equal(updated.activeSection, 'status');
  assert.deepEqual(updated.statuses.recent, []);
  assert.deepEqual(updated.statuses.viewed, []);
});

test('includes discoverable channels and switches to channels section', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'channels');

  assert.equal(updated.activeSection, 'channels');
  assert.equal(updated.channels[0].name, 'UAE News');
  assert.ok(updated.channels.every((channel) => channel.followers.endsWith('followers')));
});

test('toggles channel follow state', () => {
  const state = createInitialState();
  const updated = toggleChannelFollow(state, 'lovin-dubai');
  const channel = updated.channels.find((item) => item.id === 'lovin-dubai');

  assert.equal(channel.following, true);
});

test('switches to communities section', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'communities');

  assert.equal(updated.activeSection, 'communities');
});

test('switches to business tools section', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'business');

  assert.equal(updated.activeSection, 'business');
});

test('switches to settings section', () => {
  const state = createInitialState();
  const updated = switchSection(state, 'settings');

  assert.equal(updated.activeSection, 'settings');
});

test('returns detail content for inactive-looking buttons', () => {
  const view = getActionView('catalog');

  assert.equal(view.title, 'Catalog');
  assert.match(view.body, /products and services/i);
  assert.equal(view.primaryAction, 'Add item');
});

test('returns nested settings page options', () => {
  const page = getSettingsPage('privacy');

  assert.equal(page.title, 'Privacy');
  assert.ok(page.items.some((item) => item.label === 'Blocked contacts'));
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

test('profile settings include editable account fields', () => {
  const page = getSettingsPage('profile');

  assert.ok(page.items.some((item) => item.type === 'input' && item.label === 'Email'));
  assert.ok(page.items.some((item) => item.type === 'password' && item.label === 'Password'));
});

test('uses AM profile identity in settings and bundled Android app', () => {
  const page = getSettingsPage('profile');
  const profileView = getActionView('profile');
  const nameField = page.items.find((item) => item.label === 'Name');

  assert.equal(nameField.value, 'Aadhish Mahendran');
  assert.ok(profileView.points.includes('Aadhish Mahendran'));

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

test('business profile action includes editable username and password fields', () => {
  const view = getActionView('businessProfile');

  assert.ok(view.fields.some((field) => field.name === 'Username'));
  assert.ok(view.fields.some((field) => field.name === 'Password' && field.type === 'password'));
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

test('new chat form keeps typed draft values across re-renders and refreshes', () => {
  for (const relativePath of [
    '../src/app.js',
    '../android/app/src/main/assets/www/src/app.js'
  ]) {
    const contents = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(contents, /const newChatDraftStorageKey = 'chatapp\.newChatDraft\.v1'/);
    assert.match(contents, /function loadNewChatDraft\(\)/);
    assert.match(contents, /function saveNewChatDraft\(\)/);
    assert.match(contents, /window\.localStorage\.removeItem\(newChatDraftStorageKey\)/);
    assert.match(contents, /const newChatDraft = loadNewChatDraft\(\)/);
    assert.match(contents, /newChatDraft\.name = newChatInput\.value/);
    assert.match(contents, /newChatDraft\.email = newChatInput\.value/);
    assert.match(contents, /if \(activeAction === 'newChat'\) return;/);
    assert.match(contents, /value="\$\{escapeAttribute\(newChatDraft\.name\)\}"/);
    assert.match(contents, /value="\$\{escapeAttribute\(newChatDraft\.phone\)\}"/);
    assert.match(contents, /value="\$\{escapeAttribute\(newChatDraft\.email\)\}"/);
    assert.match(contents, /contact-avatar-wrap/);
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

test('chat menu action exposes WhatsApp-style menu items', () => {
  const view = getActionView('chatMenu');

  assert.ok(view.menuItems.some((item) => item.label === 'Contact info'));
  assert.ok(view.menuItems.some((item) => item.label === 'Delete chat' && item.danger));
});

test('discover channels action exposes a browse list', () => {
  const view = getActionView('discoverChannels');

  assert.ok(view.discoverItems.some((item) => item.name === 'Dubai Foodies'));
  assert.ok(view.discoverItems.every((item) => item.category));
});

test('create channel action exposes a channel creation form', () => {
  const view = getActionView('createChannel');

  assert.equal(view.form, 'createChannel');
  assert.ok(view.fields.some((field) => field.name === 'Channel name'));
  assert.ok(view.fields.some((field) => field.name === 'Description'));
});

test('add channel plus action opens the same channel creation form', () => {
  const view = getActionView('addChannel');

  assert.equal(view.form, 'createChannel');
  assert.ok(view.fields.some((field) => field.name === 'Channel name'));
});

test('add status action exposes a status composer form', () => {
  const view = getActionView('addStatus');

  assert.equal(view.form, 'createStatus');
  assert.ok(view.fields.some((field) => field.name === 'Status text'));
});

test('example communities action exposes community cards', () => {
  const view = getActionView('exampleCommunities');

  assert.ok(view.communityExamples.some((item) => item.name === 'School community'));
  assert.ok(view.communityExamples.every((item) => item.groups));
});

test('business tool actions expose real forms or lists', () => {
  const catalog = getActionView('catalog');
  const quickReplies = getActionView('quickReplies');
  const labels = getActionView('labels');

  assert.equal(catalog.form, 'catalogItem');
  assert.ok(catalog.fields.some((field) => field.name === 'Item name'));
  assert.equal(quickReplies.form, 'quickReply');
  assert.ok(labels.listItems.some((item) => item.name === 'New customer'));
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
  assert.deepEqual(privacyResults.map((row) => row.label), ['Privacy', 'Help and feedback']);
  assert.deepEqual(missingResults, []);
});
