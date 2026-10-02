import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The browser module uses CDN imports. Supply the SDK boundary while executing
// the unchanged module body, so these tests exercise its public operations.
function loadChat(initial = {}, user = { uid: 'alice', email: 'alice@example.com' }, overrides = {}) {
  const records = new Map(Object.entries(initial));
  const listeners = [];
  const snapshot = (ref) => { const data = records.get(ref.path); return { id: ref.id, ref, exists: () => data !== undefined, data: () => data }; };
  const ref = (...parts) => {
    const path = parts.filter((part) => typeof part === 'string').join('/');
    return { path, id: path.split('/').at(-1) };
  };
  const update = (target, changes) => {
    if (!records.has(target.path)) throw new Error('Missing record');
    records.set(target.path, { ...records.get(target.path), ...changes });
  };
  let transactionQueue = Promise.resolve();
  const sdk = {
    initializeApp: () => ({}), getAuth: () => ({ currentUser: user }), getFirestore: () => ({}),
    isFirebaseConfigured: () => true, firebaseConfig: {},
    serverTimestamp: () => 123, doc: ref, collection: ref,
    query: (collection, ...filters) => ({ ...collection, filters }),
    where: (field, operator, value) => ({ field, operator, value }),
    documentId: () => '__name__', orderBy: (field) => ({ field }), arrayUnion: (...items) => items,
    getDoc: async (target) => snapshot(target),
    getDocs: async (target) => ({ docs: [...records.keys()].filter((path) => path.startsWith(target.path + '/') && !path.slice(target.path.length + 1).includes('/')).filter((path) => (target.filters ?? []).every(({ field, operator, value }) => operator !== '==' || records.get(path)[field] === value)).map((path) => snapshot(ref(path))) }),
    updateDoc: async (target, changes) => update(target, changes),
    setDoc: async (target, changes) => records.set(target.path, { ...records.get(target.path), ...changes }),
    addDoc: async (target, data) => { const created = ref(target.path, 'new-message'); records.set(created.path, data); return created; },
    onSnapshot: (target, success, error) => { const listener = { target, success, error, active: true }; listeners.push(listener); return () => { listener.active = false; }; },
    writeBatch: () => { const writes = []; return { update: (target, changes) => writes.push(() => update(target, changes)), commit: async () => writes.forEach((write) => write()) }; },
    runTransaction: (_db, callback) => { const result = transactionQueue.then(async () => { const writes = []; const value = await callback({ get: async (target) => snapshot(target), update: (target, changes) => writes.push(() => update(target, changes)) }); writes.forEach((write) => write()); return value; }); transactionQueue = result.catch(() => {}); return result; }
  };
  Object.assign(sdk, overrides);
  let source = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8').replace(/^import[\s\S]*?from .*?;\n/gm, '').replace(/export /g, '');
  const exports = [...source.matchAll(/^(?:async )?function (\w+)/gm)].map((match) => match[1]);
  const module = new Function(...Object.keys(sdk), `${source}\nreturn { ${exports.join(',')} };`)(...Object.values(sdk));
  return { module, records, listeners };
}

const alice = { uid: 'alice', email: 'alice@example.com' };
const group = { groupName: 'Friends', createdBy: 'alice', hostId: 'alice', adminIds: ['alice'], members: ['alice', 'bob'], memberIds: ['alice', 'bob'], participants: ['alice', 'bob'] };
const message = { text: 'Hello', senderUid: 'alice', participants: ['alice', 'bob'], readBy: ['alice'] };

test('sender message edits persist and leave message identity intact in DMs and groups', async () => {
  for (const [contact, path] of [[{ id: 'bob', uid: 'bob' }, 'conversations/alice_bob/messages/m1'], [{ id: 'g1', groupId: 'g1', group: true }, 'groups/g1/messages/m1']]) {
    const { module, records } = loadChat({ [path]: message });
    assert.equal(typeof module.updateFirebaseMessage, 'function');
    await module.updateFirebaseMessage(contact, 'm1', '  Better hello  ', alice);
    assert.equal(records.get(path).text, 'Better hello');
    assert.equal(records.get(path).senderUid, 'alice');
    assert.deepEqual(records.get(path).participants, ['alice', 'bob']);
  }
});

test('sender delete persists a tombstone and clears deleted text', async () => {
  const path = 'conversations/alice_bob/messages/m1';
  const { module, records } = loadChat({ [path]: message });
  assert.equal(typeof module.deleteFirebaseMessage, 'function');
  await module.deleteFirebaseMessage({ id: 'bob' }, 'm1', alice);
  assert.equal(records.get(path).deleted, true);
  assert.equal(records.get(path).text, '');
});

test('message changes reject other senders, deleted messages, blank text and oversized text', async () => {
  const path = 'conversations/alice_bob/messages/m1';
  const { module } = loadChat({ [path]: { ...message, senderUid: 'bob' } });
  assert.equal(typeof module.updateFirebaseMessage, 'function');
  await assert.rejects(module.updateFirebaseMessage({ id: 'bob' }, 'm1', 'Changed', alice), /own messages/);
  await assert.rejects(module.deleteFirebaseMessage({ id: 'bob' }, 'm1', alice), /own messages/);
  const own = loadChat({ [path]: message }).module;
  await assert.rejects(own.updateFirebaseMessage({ id: 'bob' }, 'm1', ' ', alice), /message/);
  await assert.rejects(own.updateFirebaseMessage({ id: 'bob' }, 'm1', 'x'.repeat(4001), alice), /4000/);
  const deleted = loadChat({ [path]: { ...message, deleted: true, text: '' } }).module;
  await assert.rejects(deleted.updateFirebaseMessage({ id: 'bob' }, 'm1', 'Restore', alice), /deleted/);
});

test('concurrent approvals preserve both new members', async () => {
  const initial = { 'groups/g1': group };
  for (const uid of ['alice', 'charlie', 'daisy']) initial[`users/${uid}`] = { uid, approved: true };
  for (const uid of ['charlie', 'daisy']) initial[`groupJoinRequests/g1_${uid}`] = { groupId: 'g1', uid, status: 'pending' };
  const { module, records } = loadChat(initial);
  await Promise.all(['charlie', 'daisy'].map((uid) => module.approveGroupJoinRequest({ groupId: 'g1', uid }, alice)));
  assert.deepEqual(new Set(records.get('groups/g1').members), new Set(['alice', 'bob', 'charlie', 'daisy']));
});

test('empty DM waits for its permitted parent query before subscribing to messages', () => {
  const { module, listeners } = loadChat();
  const emitted = [];
  const unsubscribe = module.subscribeConversationMessages('alice', 'bob', (messages) => emitted.push(messages));
  assert.equal(listeners[0].target.path, 'conversations');
  listeners[0].success({ docs: [] });
  assert.deepEqual(emitted, [[]]);
  assert.equal(listeners.length, 1);
  listeners[0].success({ docs: [{ id: 'alice_bob' }] });
  assert.equal(listeners[1].target.path, 'conversations/alice_bob/messages');
  unsubscribe();
  assert.equal(listeners.every((listener) => !listener.active), true);
});

test('invited approved users keep their original approval metadata when signing in again', async () => {
  const { module, records } = loadChat({ 'users/alice': { uid: 'alice', email: alice.email, approved: true, role: 'member', approvedAt: 42, approvedBy: 'owner' }, 'invites/alice@example.com': { invitedBy: 'other-owner' } });
  await module.saveUserProfile(alice);
  assert.equal(records.get('users/alice').approvedAt, 42);
  assert.equal(records.get('users/alice').approvedBy, 'owner');
});

test('first group join request succeeds without reading a nonexistent owned document', async () => {
  const charlie = { uid: 'charlie', email: 'charlie@example.com' };
  const { module, records } = loadChat({ 'groups/g1': group, 'users/charlie': { ...charlie, approved: true } }, charlie, {
    getDoc: async (ref) => {
      assert.ok(!ref.path.startsWith('groupJoinRequests/'), 'missing request ownership cannot authorize getDoc');
      const data = ref.path === 'groups/g1' ? group : { ...charlie, approved: true };
      return { id: ref.id, exists: () => true, data: () => data };
    }
  });
  await module.requestGroupJoin('g1', charlie);
  assert.equal(records.get('groupJoinRequests/g1_charlie').status, 'pending');
});

test('managed request subscriptions query authoritative group IDs and unsubscribe together', () => {
  const { module, listeners } = loadChat();
  const emitted = [];
  const unsubscribe = module.subscribeManagedGroupJoinRequests([{ id: 'g1', ...group }, { id: 'g2', createdBy: 'bob' }], alice, (requests) => emitted.push(requests));
  assert.equal(listeners.length, 1);
  assert.ok(listeners[0].target.filters.some((filter) => filter.field === 'groupId' && filter.value === 'g1'));
  listeners[0].success({ docs: [{ id: 'r1', data: () => ({ status: 'pending' }) }] });
  assert.equal(emitted.at(-1)[0].id, 'r1');
  unsubscribe();
  assert.equal(listeners[0].active, false);
});

test('Firebase writes reject oversized names, groups and messages before SDK writes', async (t) => {
  const { module } = loadChat({ 'groups/g1': group });
  await t.test('DM text bound', () => assert.rejects(module.sendFirebaseMessage('bob', 'x'.repeat(4001), alice), /4000/));
  await t.test('group text bound', () => assert.rejects(module.sendFirebaseGroupMessage('g1', 'x'.repeat(4001), alice), /4000/));
  await t.test('group name bound', () => assert.rejects(module.createFirebaseGroup({ groupName: 'x'.repeat(81), memberUids: ['bob'] }, alice), /80/));
  await t.test('group member bound', () => assert.rejects(module.createFirebaseGroup({ groupName: 'Friends', memberUids: Array.from({ length: 10 }, (_, i) => `friend${i}`) }, alice), /10/));
});

test('disabled read receipts leave incoming message readBy unchanged', () => {
  let writes = 0;
  const { module, listeners } = loadChat({}, alice, { updateDoc: async () => { writes += 1; } });
  module.subscribeGroupMessages('g1', 'alice', () => {}, undefined, () => false);
  listeners[0].success({ docs: [{ id: 'm1', ref: {}, data: () => ({ text: 'Hi', senderUid: 'bob', readBy: ['bob'] }) }] });
  assert.equal(writes, 0);
});

test('Firestore rules deny forged authority and receipts while allowing sender edits', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const toolRoot = process.env.FIREBASE_TEST_TOOLS || '/tmp/chatapp-firebase-tools/node_modules';
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import(`${toolRoot}/@firebase/rules-unit-testing/dist/esm/index.esm.js`);
  const firestore = await import(`${toolRoot}/firebase/firestore/dist/index.mjs`);
  const { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, serverTimestamp, Timestamp } = firestore;
  const env = await initializeTestEnvironment({ projectId: 'demo-chatapp', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of ['alice', 'bob', 'charlie', 'daisy', ...Array.from({ length: 8 }, (_, i) => `friend${i}`)]) await setDoc(doc(db, 'users', uid), { uid, email: `${uid}@example.com`, approved: true });
      await setDoc(doc(db, 'users', 'pending'), { uid: 'pending', approved: false });
      await setDoc(doc(db, 'conversations', 'alice_bob'), { participants: ['alice', 'bob'] });
      await setDoc(doc(db, 'groups', 'g1'), { ...group, type: 'group', hostUid: 'alice', adminUids: ['alice'], createdAt: Timestamp.fromMillis(1), updatedAt: Timestamp.fromMillis(1) });
      await setDoc(doc(db, 'groups', 'legacy'), { creatorUid: 'alice', hostUid: 'alice', adminUids: ['alice'], members: ['alice', 'bob'], type: 'group', groupName: 'Legacy Friends' });
      for (const parent of ['conversations/alice_bob', 'groups/g1']) await setDoc(doc(db, `${parent}/messages/m1`), message);
      await setDoc(doc(db, 'groupJoinRequests', 'g1_charlie'), { groupId: 'g1', groupName: 'Friends', uid: 'charlie', email: 'charlie@example.com', displayName: 'Charlie', photoURL: '', createdBy: 'alice', hostId: 'alice', adminIds: ['alice'], managerIds: ['alice', 'bob'], status: 'pending' });
    });
    const failures = [];
    const check = async (operation) => { try { await operation(); } catch (error) { failures.push(error.message); } };
    const a = env.authenticatedContext('alice', { email: 'alice@example.com' }).firestore();
    const b = env.authenticatedContext('bob', { email: 'bob@example.com' }).firestore();
    const c = env.authenticatedContext('charlie', { email: 'charlie@example.com' }).firestore();
    await check(() => assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'alice'))));
    for (const parent of ['conversations/alice_bob', 'groups/g1']) {
      const own = doc(a, `${parent}/messages/m1`), other = doc(b, `${parent}/messages/m1`);
      await check(() => assertFails(updateDoc(other, { readBy: ['alice', 'bob', 'charlie'] })));
      await check(() => assertSucceeds(updateDoc(other, { readBy: ['alice', 'bob'] })));
      await check(() => assertFails(updateDoc(other, { text: 'Not mine' })));
      await check(() => assertSucceeds(updateDoc(own, { text: 'Edited', edited: true })));
      await check(() => assertFails(updateDoc(own, { text: 'x'.repeat(4001) })));
      await check(() => assertFails(updateDoc(own, { text: '' })));
      await check(() => assertFails(updateDoc(own, { senderUid: 'bob' })));
      await check(() => assertSucceeds(updateDoc(own, { text: '', deleted: true })));
      await check(() => assertFails(updateDoc(own, { text: 'Undeleted', deleted: false })));
    }
    await check(() => assertFails(getDoc(doc(b, 'groupJoinRequests', 'g1_charlie'))));
    await check(() => assertFails(updateDoc(doc(b, 'groupJoinRequests', 'g1_charlie'), { status: 'rejected', decidedBy: 'bob' })));
    await check(() => assertFails(setDoc(doc(c, 'groupJoinRequests', 'g1_charlie'), { groupId: 'g1', groupName: 'Friends', uid: 'charlie', email: 'charlie@example.com', displayName: 'Charlie', photoURL: '', createdBy: 'alice', hostId: 'alice', adminIds: ['alice'], managerIds: ['alice', 'bob'], status: 'pending' })));
    await check(() => assertSucceeds(getDocs(query(collection(a, 'groupJoinRequests'), where('groupId', '==', 'g1'), where('status', '==', 'pending')))));
    await check(() => assertSucceeds(getDocs(query(collection(c, 'conversations'), where('participants', 'array-contains', 'charlie')))));
    const createGroup = { ...group, type: 'group', hostUid: 'alice', adminUids: ['alice'], createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await check(() => assertFails(setDoc(doc(a, 'groups', 'unapproved-members'), { ...createGroup, members: ['alice', 'pending'], memberIds: ['alice', 'pending'], participants: ['alice', 'pending'] })));
    await check(() => assertFails(setDoc(doc(a, 'groups', 'injected-admins'), { ...createGroup, adminIds: ['alice', 'bob'], adminUids: ['alice', 'bob'] })));
    await check(() => assertFails(setDoc(doc(a, 'groups', 'blank-name'), { ...createGroup, groupName: '' })));
    await check(() => assertFails(setDoc(doc(a, 'groups', 'huge-name'), { ...createGroup, groupName: 'x'.repeat(81) })));
    await check(() => assertFails(updateDoc(doc(a, 'groups', 'g1'), { members: ['alice', 'bob', 'pending'], memberIds: ['alice', 'bob', 'pending'], participants: ['alice', 'bob', 'pending'], updatedAt: serverTimestamp() })));
    const tenMembers = ['alice', 'bob', ...Array.from({ length: 8 }, (_, i) => `friend${i}`)];
    await check(() => assertSucceeds(setDoc(doc(a, 'groups', 'ten-members'), { ...createGroup, members: tenMembers, memberIds: tenMembers, participants: tenMembers })));
    const elevenMembers = [...tenMembers, 'charlie'];
    await check(() => assertFails(setDoc(doc(a, 'groups', 'eleven-members'), { ...createGroup, members: elevenMembers, memberIds: elevenMembers, participants: elevenMembers })));
    const realChat = (user, db) => loadChat({}, user, { ...firestore, getFirestore: () => db }).module;
    const charlie = { uid: 'charlie', email: 'charlie@example.com' };
    const daisy = { uid: 'daisy', email: 'daisy@example.com' };
    const daisyDb = env.authenticatedContext('daisy', { email: daisy.email }).firestore();
    await check(async () => {
      await realChat(charlie, c).requestGroupJoin('g1', charlie);
      await realChat(daisy, daisyDb).requestGroupJoin('g1', daisy);
      const hostChat = realChat(alice, a);
      await Promise.all(['charlie', 'daisy'].map((uid) => hostChat.approveGroupJoinRequest({ groupId: 'g1', uid }, alice)));
      const approved = (await getDoc(doc(a, 'groups', 'g1'))).data();
      assert.ok(approved.members.includes('charlie') && approved.members.includes('daisy'));
      await assert.rejects(hostChat.approveGroupJoinRequest({ groupId: 'g1', uid: 'charlie' }, alice), /no longer pending/);
      const sent = await hostChat.sendFirebaseMessage('bob', 'Hello again', alice);
      await hostChat.updateFirebaseMessage({ id: 'bob' }, sent.id, 'Edited for real', alice);
      assert.equal((await getDoc(doc(b, 'conversations/alice_bob/messages', sent.id))).data().text, 'Edited for real');
      await hostChat.deleteFirebaseMessage({ id: 'bob' }, sent.id, alice);
      assert.equal((await getDoc(doc(b, 'conversations/alice_bob/messages', sent.id))).data().deleted, true);
      await realChat(charlie, c).requestGroupJoin('legacy', charlie);
      await hostChat.approveGroupJoinRequest({ groupId: 'legacy', uid: 'charlie' }, alice);
      assert.equal((await getDoc(doc(a, 'groups', 'legacy'))).data().creatorUid, 'alice');
    });
    assert.deepEqual(failures, []);
  } finally { await env.cleanup(); }
});
