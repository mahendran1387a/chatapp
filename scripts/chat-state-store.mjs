import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';

const sharedStateId = 'shared';

function mergeMessages(existingMessages = [], incomingMessages = []) {
  const messagesById = new Map();
  for (const message of existingMessages) {
    if (message?.id) messagesById.set(message.id, message);
  }
  for (const message of incomingMessages) {
    if (message?.id) messagesById.set(message.id, message);
  }
  return [...messagesById.values()];
}

function mergeContact(existingContact, incomingContact) {
  return {
    ...existingContact,
    ...incomingContact,
    messages: mergeMessages(existingContact?.messages, incomingContact?.messages)
  };
}

export function mergeChatState(existing = {}, incoming = {}) {
  const contactsById = new Map();
  for (const contact of existing.contacts ?? []) {
    if (contact?.id) contactsById.set(contact.id, contact);
  }
  for (const contact of incoming.contacts ?? []) {
    if (!contact?.id) continue;
    contactsById.set(contact.id, mergeContact(contactsById.get(contact.id), contact));
  }

  return {
    ...existing,
    ...incoming,
    contacts: [...contactsById.values()]
  };
}

function queueStoreWrites(store) {
  let writeQueue = Promise.resolve();

  return {
    ...store,
    async merge(payload) {
      writeQueue = writeQueue.then(async () => {
        const merged = mergeChatState(await store.read(), payload);
        await store.write(merged);
        return merged;
      });
      return writeQueue;
    }
  };
}

function createFileStore(chatsFile) {
  return {
    async read() {
      if (!existsSync(chatsFile)) return {};
      return JSON.parse(await readFile(chatsFile, 'utf8'));
    },
    async write(payload) {
      await mkdir(dirname(chatsFile), { recursive: true });
      await writeFile(chatsFile, JSON.stringify(payload, null, 2), 'utf8');
    }
  };
}

function createPostgresStore(databaseUrl) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  return {
    async read() {
      const result = await pool.query('select payload from public.chat_state where id = $1', [sharedStateId]);
      return result.rows[0]?.payload ?? {};
    },
    async write(payload) {
      await pool.query(
        `insert into public.chat_state (id, payload, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (id)
         do update set payload = excluded.payload, updated_at = now()`,
        [sharedStateId, JSON.stringify(payload)]
      );
    },
    async close() {
      await pool.end();
    }
  };
}

export function createChatStateStore({ root, databaseUrl = process.env.DATABASE_URL } = {}) {
  if (databaseUrl) return queueStoreWrites(createPostgresStore(databaseUrl));

  const baseRoot = root ?? process.cwd();
  return queueStoreWrites(createFileStore(join(baseRoot, '.data', 'chats.json')));
}
