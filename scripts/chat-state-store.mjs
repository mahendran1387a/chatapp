import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';

const sharedStateId = 'shared';

function parseJsonDocument(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

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
  const deletedContactIds = [
    ...new Set([
      ...(existing.deletedContactIds ?? []),
      ...(incoming.deletedContactIds ?? [])
    ].filter((id) => typeof id === 'string'))
  ];
  const deletedIdSet = new Set(deletedContactIds);
  const contactsById = new Map();
  for (const contact of existing.contacts ?? []) {
    if (deletedIdSet.has(contact?.id)) continue;
    if (contact?.id) contactsById.set(contact.id, contact);
  }
  for (const contact of incoming.contacts ?? []) {
    if (!contact?.id) continue;
    if (deletedIdSet.has(contact.id)) continue;
    contactsById.set(contact.id, mergeContact(contactsById.get(contact.id), contact));
  }
  const contacts = [...contactsById.values()];
  const activeContactId = contacts.some((contact) => contact.id === incoming.activeContactId)
    ? incoming.activeContactId
    : contacts.some((contact) => contact.id === existing.activeContactId)
      ? existing.activeContactId
      : contacts[0]?.id;

  return {
    ...existing,
    ...incoming,
    activeContactId,
    deletedContactIds,
    contacts
  };
}

function queueStoreWrites(store) {
  let writeQueue = Promise.resolve();

  return {
    ...store,
    async merge(payload) {
      const operation = writeQueue.then(async () => {
        const merged = mergeChatState(await store.read(), payload);
        await store.write(merged);
        return merged;
      });
      writeQueue = operation.catch(() => {});
      return operation;
    }
  };
}

function createFileStore(chatsFile) {
  return {
    async read() {
      if (!existsSync(chatsFile)) return {};
      return parseJsonDocument(await readFile(chatsFile, 'utf8'));
    },
    async write(payload) {
      await mkdir(dirname(chatsFile), { recursive: true });
      const temporaryFile = `${chatsFile}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryFile, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
        await rename(temporaryFile, chatsFile);
      } finally {
        await rm(temporaryFile, { force: true });
      }
    }
  };
}

function createPostgresStore(databaseUrl, stateId) {
  const connectionUrl = new URL(databaseUrl);
  // pg lets URL SSL settings override the ssl object; never accept a verification bypass.
  connectionUrl.searchParams.set('sslmode', 'verify-full');
  const pool = new pg.Pool({
    connectionString: connectionUrl.toString(),
    ssl: { rejectUnauthorized: true }
  });

  return {
    async read() {
      const result = await pool.query('select payload from public.chat_state where id = $1', [stateId]);
      return result.rows[0]?.payload ?? {};
    },
    async write(payload) {
      await pool.query(
        `insert into public.chat_state (id, payload, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (id)
         do update set payload = excluded.payload, updated_at = now()`,
        [stateId, JSON.stringify(payload)]
      );
    },
    async close() {
      await pool.end();
    }
  };
}

export function createChatStateStore({ root, databaseUrl = process.env.DATABASE_URL, uid } = {}) {
  const userKey = uid === undefined ? '' : createHash('sha256').update(uid).digest('hex');
  const stateId = userKey ? `user:${userKey}` : sharedStateId;
  if (databaseUrl) return queueStoreWrites(createPostgresStore(databaseUrl, stateId));

  const baseRoot = root ?? process.cwd();
  return queueStoreWrites(createFileStore(userKey
    ? join(baseRoot, '.data', 'users', `${userKey}.json`)
    : join(baseRoot, '.data', 'chats.json')));
}
