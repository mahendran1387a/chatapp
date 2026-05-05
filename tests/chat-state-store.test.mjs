import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createChatStateStore } from '../scripts/chat-state-store.mjs';

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
