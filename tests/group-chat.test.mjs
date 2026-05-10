import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createInitialState,
  filterContacts,
  getActiveContact,
  reconcileAuthenticatedContacts,
  selectContact,
  sendMessage
} from '../src/chat-store.js';

const appFiles = [
  '../src/app.js',
  '../android/app/src/main/assets/www/src/app.js'
];

test('reconciles Firestore groups into the chat list and Groups filter', () => {
  const state = createInitialState();
  const updated = reconcileAuthenticatedContacts(
    state,
    [
      { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
      { uid: 'uid-aisha', email: 'aisha@gmail.com', displayName: 'Aisha' },
      { uid: 'uid-rohan', email: 'rohan@gmail.com', displayName: 'Rohan' }
    ],
    'uid-me',
    [
      {
        id: 'group-family',
        groupName: 'Family Crew',
        type: 'group',
        members: ['uid-me', 'uid-aisha', 'uid-rohan'],
        participants: ['uid-me', 'uid-aisha', 'uid-rohan'],
        createdBy: 'uid-me'
      }
    ]
  );

  const groups = filterContacts(updated, { filter: 'groups' });
  assert.deepEqual(groups.map((group) => group.name), ['Family Crew']);
  assert.equal(groups[0].group, true);
  assert.equal(groups[0].groupId, 'group-family');
  assert.deepEqual(groups[0].memberUids, ['uid-me', 'uid-aisha', 'uid-rohan']);
});

test('group chats can be selected and accept outgoing text messages', () => {
  const state = reconcileAuthenticatedContacts(
    createInitialState(),
    [
      { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
      { uid: 'uid-aisha', email: 'aisha@gmail.com', displayName: 'Aisha' },
      { uid: 'uid-rohan', email: 'rohan@gmail.com', displayName: 'Rohan' }
    ],
    'uid-me',
    [
      {
        id: 'group-family',
        groupName: 'Family Crew',
        type: 'group',
        members: ['uid-me', 'uid-aisha', 'uid-rohan'],
        participants: ['uid-me', 'uid-aisha', 'uid-rohan'],
        createdBy: 'uid-me'
      }
    ]
  );

  const selected = selectContact(state, 'group-family');
  const updated = sendMessage(selected, 'Hello family group', {
    senderUid: 'uid-me',
    senderEmail: 'me@gmail.com',
    senderDisplayName: 'Me'
  });
  const active = getActiveContact(updated);

  assert.equal(active.groupId, 'group-family');
  assert.equal(active.messages.at(-1).text, 'Hello family group');
  assert.equal(active.preview, 'Hello family group');
});

test('app exposes a real Create Group flow from approved signed-in users', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(app, /data-action="createGroup"/);
    assert.match(app, /id="createGroupForm"/);
    assert.match(app, /data-group-member/);
    assert.match(app, /Create Group/);
    assert.match(app, /selectedGroupMemberIds\.size < 2/);
    assert.match(app, /createFirebaseGroup/);
    assert.match(app, /subscribeUserGroups/);
    assert.match(app, /sendFirebaseGroupMessage/);
    assert.match(app, /subscribeGroupMessages/);
    assert.match(app, /activeContact\.groupId/);
  }
});

test('Firebase group helpers and rules protect group membership and sender identity', () => {
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(firebase, /createFirebaseGroup/);
  assert.match(firebase, /collection\(firebase\.db, 'groups'\)/);
  assert.match(firebase, /type: 'group'/);
  assert.match(firebase, /participants: members/);
  assert.doesNotMatch(firebase, /updateDoc\(groupRef,\s*\{\s*updatedAt/s);
  assert.match(firebase, /where\('type', '==', 'group'\)/);
  assert.match(firebase, /where\('members', 'array-contains', currentUid\)/);
  assert.match(firebase, /sendFirebaseGroupMessage/);
  assert.match(firebase, /subscribeGroupMessages/);
  assert.match(rules, /match \/groups\/\{groupId\}/);
  assert.match(rules, /validGroupCreate\(\)/);
  assert.match(rules, /'type'/);
  assert.match(rules, /type == 'group'/);
  assert.match(rules, /participants/);
  assert.match(rules, /members == request\.resource\.data\.participants/);
  assert.match(rules, /members\.size\(\) >= 3/);
  assert.match(rules, /createdBy == request\.auth\.uid/);
  assert.match(rules, /validGroupMessage\(groupId\)/);
});
