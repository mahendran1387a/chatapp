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

test('reconciles participant-only Firestore groups for existing group documents', () => {
  const state = createInitialState();
  const updated = reconcileAuthenticatedContacts(
    state,
    [
      { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
      { uid: 'uid-aisha', email: 'aisha@gmail.com', displayName: 'Aisha' }
    ],
    'uid-aisha',
    [
      {
        id: 'group-study',
        groupName: 'Study Team',
        type: 'group',
        participants: ['uid-me', 'uid-aisha'],
        createdBy: 'uid-me'
      }
    ]
  );

  const groups = filterContacts(updated, { filter: 'groups' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Study Team');
  assert.deepEqual(groups[0].memberUids, ['uid-me', 'uid-aisha']);
});

test('group contacts keep creator, host, and admin IDs for management permissions', () => {
  const state = createInitialState();
  const updated = reconcileAuthenticatedContacts(
    state,
    [
      { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
      { uid: 'uid-aisha', email: 'aisha@gmail.com', displayName: 'Aisha' }
    ],
    'uid-aisha',
    [
      {
        id: 'group-family',
        groupName: 'Family Crew',
        type: 'group',
        members: ['uid-me', 'uid-aisha'],
        participants: ['uid-me', 'uid-aisha'],
        createdBy: 'uid-me',
        hostUid: 'uid-me',
        adminUids: ['uid-aisha']
      }
    ]
  );

  const group = filterContacts(updated, { filter: 'groups' })[0];

  assert.equal(group.createdBy, 'uid-me');
  assert.equal(group.hostUid, 'uid-me');
  assert.deepEqual(group.adminUids, ['uid-aisha']);
});

test('group chats can be selected and accept outgoing text messages', () => {
  const state = reconcileAuthenticatedContacts(
    createInitialState(),
    [
      { uid: 'uid-me', email: 'me@gmail.com', displayName: 'Me' },
      { uid: 'uid-aisha', email: 'aisha@gmail.com', displayName: 'Aisha' }
    ],
    'uid-me',
    [
      {
        id: 'group-family',
        groupName: 'Family Crew',
        type: 'group',
        members: ['uid-me', 'uid-aisha'],
        participants: ['uid-me', 'uid-aisha'],
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
    assert.match(app, /selectedGroupMemberIds\.size < 1/);
    assert.match(app, /allowedMemberIds/);
    assert.match(app, /createFirebaseGroup/);
    assert.match(app, /updateFirebaseGroupName/);
    assert.match(app, /deleteFirebaseGroup/);
    assert.match(app, /subscribeUserGroups/);
    assert.match(app, /sendFirebaseGroupMessage/);
    assert.match(app, /subscribeGroupMessages/);
    assert.match(app, /explainFirebaseError/);
    assert.match(app, /Group delete is blocked by Firestore rules/);
    assert.match(app, /showFirebaseError\(error, 'deleteGroup'\)/);
    assert.match(app, /activeContact\.groupId/);
    assert.match(app, /function canCurrentUserManageGroup\(contact\)/);
    assert.match(app, /canCurrentUserManageGroup\(contact\)/);
    assert.match(app, /function isFirestoreGroupContact\(contact\)/);
    assert.match(app, /function getPersistableContacts\(\)/);
    assert.match(app, /previousGroupContacts/);
    assert.match(app, /!userGroupsLoaded/);
    assert.match(app, /id="editGroupForm"/);
    assert.match(app, /data-contact-menu-action="edit-group"/);
    assert.match(app, /data-contact-menu-action="delete-group"/);
    assert.doesNotMatch(app, /Saved in your family chat database/);
    assert.doesNotMatch(app, /return state\.contacts\.filter\(\(contact\) => !isFirestoreGroupContact\(contact\)\)/);
  }
});

test('Firebase group helpers and rules protect group membership and sender identity', () => {
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(firebase, /createFirebaseGroup/);
  assert.match(firebase, /updateFirebaseGroupName/);
  assert.match(firebase, /deleteFirebaseGroup/);
  assert.match(firebase, /canManageFirebaseGroup/);
  assert.match(firebase, /hostUid/);
  assert.match(firebase, /adminUids/);
  assert.match(firebase, /collection\(firebase\.db, 'groups'\)/);
  assert.match(firebase, /type: 'group'/);
  assert.match(firebase, /participants: members/);
  assert.match(firebase, /loadApprovedGroupMembers/);
  assert.match(firebase, /Choose only approved friends for a group/);
  assert.match(firebase, /doc\(firebase\.db, 'users', uid\)/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Creating group'/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Created group'/);
  assert.match(firebase, /console\.error\('\[Kids WhatsApp\] Group create failed'/);
  assert.match(firebase, /groupRef\.path/);
  assert.doesNotMatch(firebase, /updateDoc\(groupRef,\s*\{\s*updatedAt/s);
  assert.doesNotMatch(firebase, /where\('type', '==', 'group'\)/);
  assert.match(firebase, /where\('members', 'array-contains', currentUid\)/);
  assert.match(firebase, /where\('participants', 'array-contains', currentUid\)/);
  assert.match(firebase, /memberGroupsLoaded/);
  assert.match(firebase, /participantGroupsLoaded/);
  assert.match(firebase, /if \(!memberGroupsLoaded \|\| !participantGroupsLoaded\) return/);
  assert.match(firebase, /data\.type === 'group'/);
  assert.match(firebase, /mergeFirebaseGroups/);
  assert.match(firebase, /isUserInGroup/);
  assert.match(firebase, /sendFirebaseGroupMessage/);
  assert.match(firebase, /subscribeGroupMessages/);
  assert.match(rules, /match \/groups\/\{groupId\}/);
  assert.match(rules, /validGroupCreate\(\)/);
  assert.match(rules, /validGroupUpdate\(\)/);
  assert.match(rules, /validGroupDelete\(\)/);
  assert.match(rules, /groupManager/);
  assert.match(rules, /hostUid/);
  assert.match(rules, /adminUids/);
  assert.match(rules, /'type'/);
  assert.match(rules, /request\.resource\.data\.type == 'group'/);
  assert.match(rules, /participants/);
  assert.match(rules, /groupHasSignedInUser/);
  assert.match(rules, /participants\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /members == request\.resource\.data\.participants/);
  assert.match(rules, /members\.size\(\) >= 2/);
  assert.match(rules, /createdBy == request\.auth\.uid/);
  assert.match(rules, /allow delete: if validGroupDelete\(\)/);
  assert.match(rules, /validGroupMessage\(groupId\)/);
});
