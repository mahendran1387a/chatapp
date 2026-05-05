import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createChatStateStore, mergeChatState } from '../scripts/chat-state-store.mjs';

test('file chat state store returns empty state before anything is saved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-store-'));
  try {
    const store = createChatStateStore({ root });

    assert.deepEqual(await store.read(), {});
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file chat state store saves and reloads shared chat payloads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-store-'));
  try {
    const store = createChatStateStore({ root });
    const payload = {
      activeContactId: 'friend',
      contacts: [{ id: 'friend', name: 'Friend', messages: [{ text: 'Hello' }] }]
    };

    await store.write(payload);

    assert.deepEqual(await store.read(), payload);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('merges incoming chat saves without losing existing messages', () => {
  const existing = {
    activeContactId: 'friend',
    contacts: [
      {
        id: 'friend',
        name: 'Friend',
        preview: 'Existing',
        messages: [{ id: 'm1', text: 'Existing' }]
      }
    ]
  };
  const incoming = {
    activeContactId: 'friend',
    contacts: [
      {
        id: 'friend',
        name: 'Friend',
        preview: 'Incoming',
        messages: [{ id: 'm2', text: 'Incoming' }]
      }
    ]
  };

  const merged = mergeChatState(existing, incoming);

  assert.equal(merged.contacts[0].preview, 'Incoming');
  assert.deepEqual(
    merged.contacts[0].messages.map((message) => message.id),
    ['m1', 'm2']
  );
});

test('store merge serializes saves and preserves messages from parallel clients', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-store-'));
  try {
    const store = createChatStateStore({ root });
    await Promise.all([
      store.merge({
        activeContactId: 'friend',
        contacts: [{ id: 'friend', name: 'Friend', messages: [{ id: 'm1', text: 'First' }] }]
      }),
      store.merge({
        activeContactId: 'friend',
        contacts: [{ id: 'friend', name: 'Friend', messages: [{ id: 'm2', text: 'Second' }] }]
      })
    ]);

    const saved = await store.read();

    assert.deepEqual(
      saved.contacts[0].messages.map((message) => message.id).sort(),
      ['m1', 'm2']
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
