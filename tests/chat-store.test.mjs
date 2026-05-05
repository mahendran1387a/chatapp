import assert from 'node:assert/strict';
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
  searchSettings,
  toggleChannelFollow,
  sendMessage,
  switchSection
} from '../src/chat-store.js';

test('creates a default active conversation with sample friends', () => {
  const state = createInitialState();

  assert.equal(state.activeSection, 'chats');
  assert.equal(state.activeContactId, 'dunes');
  assert.equal(getActiveContact(state).name, 'Dunes_KG1B@2026');
  assert.ok(state.contacts.length >= 8);
});

test('restores saved chats after reload', () => {
  const savedContact = {
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
    ]
  };

  const state = createInitialState({
    contacts: [savedContact],
    activeContactId: savedContact.id
  });

  assert.equal(state.activeContactId, savedContact.id);
  assert.equal(state.contacts[0].name, 'Aisha Saved');
  assert.equal(getActiveContact(state).phone, '+971 50 123 4567');
});

test('filters contacts by search term and unread mode', () => {
  const state = createInitialState();

  const hospital = filterContacts(state, { query: 'hospital', filter: 'all' });
  const unread = filterContacts(state, { query: '', filter: 'unread' });

  assert.deepEqual(hospital.map((contact) => contact.name), ['Millennium Hospital']);
  assert.ok(unread.every((contact) => contact.unread > 0));
});

test('sends a message to the active contact without an automatic reply', () => {
  const state = createInitialState();
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
  assert.notEqual(updated.statuses.recent.length, 0);
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

test('business profile action includes editable username and password fields', () => {
  const view = getActionView('businessProfile');

  assert.ok(view.fields.some((field) => field.name === 'Username'));
  assert.ok(view.fields.some((field) => field.name === 'Password' && field.type === 'password'));
});

test('creates a new chat from a friend name and phone number', () => {
  const state = createInitialState();
  const updated = createContactChat(state, { name: 'Aisha Friend', phone: '+971 50 123 4567' });
  const contact = updated.contacts.find((item) => item.name === 'Aisha Friend');

  assert.equal(updated.activeContactId, contact.id);
  assert.equal(contact.phone, '+971 50 123 4567');
  assert.equal(contact.preview, 'New chat created');
  assert.equal(contact.messages[0].text, 'New chat created with +971 50 123 4567');
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
