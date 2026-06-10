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
        memberIds: ['uid-me', 'uid-aisha'],
        participants: ['uid-me', 'uid-aisha'],
        createdBy: 'uid-me',
        hostId: 'uid-me',
        adminIds: ['uid-aisha']
      }
    ]
  );

  const group = filterContacts(updated, { filter: 'groups' })[0];

  assert.equal(group.createdBy, 'uid-me');
  assert.equal(group.hostId, 'uid-me');
  assert.deepEqual(group.adminIds, ['uid-aisha']);
  assert.deepEqual(group.memberIds, ['uid-me', 'uid-aisha']);
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
  assert.match(app, /window\.confirm/);
  assert.match(app, /activeContact\.groupId/);
    assert.match(app, /function canCurrentUserManageGroup\(contact\)/);
    assert.match(app, /function canCurrentUserEditGroupName\(contact\)/);
    assert.match(app, /canCurrentUserManageGroup\(contact\)/);
    assert.match(app, /canCurrentUserEditGroupName\(contact\)/);
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
  assert.match(firebase, /hostId/);
  assert.match(firebase, /adminIds/);
  assert.match(firebase, /collection\(firebase\.db, 'groups'\)/);
  assert.match(firebase, /type: 'group'/);
  assert.match(firebase, /participants: members/);
  assert.match(firebase, /memberIds: members/);
  assert.match(firebase, /hostId: user\.uid/);
  assert.match(firebase, /adminIds: \[user\.uid\]/);
  assert.match(firebase, /loadApprovedGroupMembers/);
  assert.match(firebase, /Choose only approved friends for a group/);
  assert.match(firebase, /doc\(firebase\.db, 'users', uid\)/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Creating group'/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Created group'/);
  assert.match(firebase, /console\.error\('\[Kids WhatsApp\] Group create failed'/);
  assert.match(firebase, /groupRef\.path/);
  assert.doesNotMatch(firebase, /updateDoc\(groupRef,\s*\{\s*updatedAt/s);
  assert.doesNotMatch(firebase, /where\('type', '==', 'group'\)/);
  assert.match(firebase, /where\('memberIds', 'array-contains', currentUid\)/);
  assert.match(firebase, /where\('members', 'array-contains', currentUid\)/);
  assert.match(firebase, /where\('participants', 'array-contains', currentUid\)/);
  assert.match(firebase, /memberIdGroupsLoaded/);
  assert.match(firebase, /memberGroupsLoaded/);
  assert.match(firebase, /participantGroupsLoaded/);
  assert.match(firebase, /if \(!memberIdGroupsLoaded \|\| !memberGroupsLoaded \|\| !participantGroupsLoaded\) return/);
  assert.match(firebase, /mergeFirebaseGroups\(memberIdGroups, memberGroups, participantGroups\)/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Loading groups for user'/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Fetched memberId groups'/);
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
  assert.match(rules, /hostId/);
  assert.match(rules, /adminIds/);
  assert.match(rules, /'type'/);
  assert.match(rules, /request\.resource\.data\.type == 'group'/);
  assert.match(rules, /participants/);
  assert.match(rules, /memberIds/);
  assert.match(rules, /groupHasSignedInUser/);
  assert.match(rules, /participants\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /memberIds\.hasAny\(\[request\.auth\.uid\]\)/);
  assert.match(rules, /members == request\.resource\.data\.participants/);
  assert.match(rules, /memberIds == request\.resource\.data\.members/);
  assert.match(rules, /members\.size\(\) >= 2/);
  assert.match(rules, /createdBy == request\.auth\.uid/);
  assert.match(rules, /allow delete: if validGroupDelete\(\)/);
  assert.match(rules, /validGroupMessage\(groupId\)/);
});

test('group delete validates manager uid and removes messages before the group document', () => {
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/chat-store.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(firebase, /getDocs/);
  assert.match(firebase, /writeBatch/);
  assert.match(firebase, /loadApprovedUser\(firebase, user\.uid\)/);
  assert.match(firebase, /canManageFirebaseGroup\(group, user\.uid\)/);
  assert.doesNotMatch(firebase, /if \(!group \|\| !isUserInGroup\(group, user\.uid\) \|\| !canManageFirebaseGroup\(group, user\.uid\)\)/);
  assert.match(firebase, /deleteFirebaseGroupMessages/);
  assert.match(firebase, /collection\(firebase\.db, 'groups', groupId, 'messages'\)/);
  assert.match(firebase, /batch\.delete\(message\.ref\)/);
  assert.match(firebase, /await deleteFirebaseGroupMessages\(firebase, groupId\)/);
  assert.match(firebase, /await deleteDoc\(groupRef\)/);
  assert.match(firebase, /Only group creators, hosts, or admins can delete this group/);
  assert.match(firebase, /group\?\.creatorId/);
  assert.match(firebase, /group\?\.creatorUid/);
  assert.match(firebase, /group\?\.ownerId/);
  assert.match(firebase, /group\?\.ownerUid/);
  assert.match(firebase, /group\?\.adminId/);
  assert.match(firebase, /group\?\.adminUid/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Group delete permission check'/);
  assert.match(firebase, /currentUserUid: user\.uid/);
  assert.match(firebase, /createdBy: group\?\.createdBy/);
  assert.match(firebase, /creatorId: group\?\.creatorId/);
  assert.match(firebase, /hostId: group\?\.hostId/);
  assert.match(firebase, /adminIds: group\?\.adminIds/);
  assert.match(firebase, /permissionGranted/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Deleting group messages'/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Deleting group document'/);
  assert.match(firebase, /Firestore rejected group deletion even though this account is recorded as a group manager/);

  assert.match(app, /window\.confirm\('Delete this group\? Group messages will also be removed\.'\)/);
  assert.match(app, /showToast\('Group deleted'\)/);
  assert.match(app, /Group delete is blocked by Firestore rules/);
  assert.match(app, /contact\?\.creatorId/);
  assert.match(app, /contact\?\.ownerId/);
  assert.match(app, /contact\?\.adminId/);

  assert.match(store, /creatorId: group\.creatorId/);
  assert.match(store, /ownerId: group\.ownerId/);
  assert.match(store, /adminId: group\.adminId/);

  assert.match(rules, /function groupCreator\(data\)/);
  assert.match(rules, /data\.creatorId == request\.auth\.uid/);
  assert.match(rules, /data\.creatorUid == request\.auth\.uid/);
  assert.match(rules, /data\.ownerId == request\.auth\.uid/);
  assert.match(rules, /data\.ownerUid == request\.auth\.uid/);
  assert.match(rules, /function groupHost\(data\)/);
  assert.match(rules, /data\.hostId == request\.auth\.uid/);
  assert.match(rules, /function groupAdmin\(data\)/);
  assert.match(rules, /data\.adminIds is list/);
  assert.match(rules, /data\.adminId == request\.auth\.uid/);
  assert.match(rules, /data\.adminUid == request\.auth\.uid/);
  assert.match(rules, /groupCreator\(data\)/);
  assert.match(rules, /function groupMessageViewer\(groupId\)/);
  assert.match(rules, /groupManager\(get\(\/databases\/\$\(database\)\/documents\/groups\/\$\(groupId\)\)\.data\)/);
  assert.match(rules, /validGroupMessageDelete\(groupId\)/);
  assert.match(rules, /allow read: if groupMessageViewer\(groupId\)/);
  assert.match(rules, /allow delete: if validGroupMessageDelete\(groupId\)/);
});

test('group name edits require an approved group member or manager and keep membership unchanged', () => {
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(app, /if \(!requireAuth\(\)\) return/);
  assert.match(app, /if \(!isCurrentUserApproved\(\)\)/);
  assert.match(app, /Your account is not approved yet/);
  assert.match(app, /showToast\('Group name saved'\)/);

  assert.match(firebase, /function loadApprovedUser/);
  assert.match(firebase, /Your account is not approved yet/);
  assert.match(firebase, /loadApprovedUser\(firebase, user\.uid\)/);
  assert.match(firebase, /isUserInGroup\(group, user\.uid\)/);
  assert.match(firebase, /canManageFirebaseGroup\(group, user\.uid\)/);
  assert.match(firebase, /!isUserInGroup\(group, user\.uid\) && !canManageFirebaseGroup\(group, user\.uid\)/);
  assert.match(firebase, /Only approved group creators, hosts, admins, or members can edit this group/);
  assert.match(firebase, /updateDoc\(groupRef,\s*\{\s*groupName: cleanName,\s*updatedAt: serverTimestamp\(\)\s*\}\)/);
  assert.doesNotMatch(firebase, /members:\s*group\.members/);
  assert.doesNotMatch(firebase, /participants:\s*group\.participants/);

  assert.match(app, /isCurrentUserGroupManager\(contact\)/);
  assert.match(app, /isCurrentUserGroupMember\(contact\) \|\| isCurrentUserGroupManager\(contact\)/);
  assert.match(rules, /function groupNameEditor/);
  assert.match(rules, /groupManager\(data\) \|\| groupHasSignedInUser\(data\)/);
  assert.match(rules, /groupHasSignedInUser\(data\)/);
  assert.match(rules, /groupNameEditor\(resource\.data\)/);
  assert.match(rules, /request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['groupName', 'updatedAt'\]\)/);
  assert.match(rules, /request\.resource\.data\.members == resource\.data\.members/);
  assert.match(rules, /request\.resource\.data\.memberIds == resource\.data\.memberIds/);
  assert.match(rules, /request\.resource\.data\.participants == resource\.data\.participants/);
});

test('group join requests persist in Firestore and managers can approve or reject in real time', () => {
  const firebase = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(firebase, /function getGroupJoinRequestId\(groupId, uid\)/);
  assert.match(firebase, /collection\(firebase\.db, 'groupJoinRequests'\)/);
  assert.match(firebase, /export async function requestGroupJoin/);
  assert.match(firebase, /status: 'pending'/);
  assert.match(firebase, /export function subscribeDiscoverableGroups/);
  assert.match(firebase, /export function subscribeOwnGroupJoinRequests/);
  assert.match(firebase, /export function subscribeManagedGroupJoinRequests/);
  assert.match(firebase, /export async function approveGroupJoinRequest/);
  assert.match(firebase, /export async function rejectGroupJoinRequest/);
  assert.match(firebase, /writeBatch\(firebase\.db\)/);
  assert.match(firebase, /new Set\(\[\.\.\.getExistingGroupMembers\(group\), request\.uid\]\)/);
  assert.match(firebase, /memberIds: nextMembers/);
  assert.match(firebase, /members: nextMembers/);
  assert.match(firebase, /participants: nextMembers/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Approving group join'/);
  assert.match(firebase, /console\.info\('\[Kids WhatsApp\] Approved group join'/);
  assert.match(firebase, /status: 'approved'/);
  assert.match(firebase, /status: 'rejected'/);

  assert.match(app, /availableGroups/);
  assert.match(app, /ownGroupJoinRequests/);
  assert.match(app, /pendingGroupJoinRequests/);
  assert.match(app, /data-request-group-join/);
  assert.match(app, /data-approve-group-join/);
  assert.match(app, /data-reject-group-join/);
  assert.match(app, /pending-request-badge/);
  assert.match(app, /Waiting for host/);
  assert.match(app, /Group join approved/);
  assert.match(app, /Group join rejected/);
  assert.match(app, /restartManagedGroupJoinRequestSubscription/);

  assert.match(rules, /function validGroupMembershipUpdate\(\)/);
  assert.match(rules, /groupManager\(resource\.data\)/);
  assert.match(rules, /request\.resource\.data\.memberIds\.hasAll\(resource\.data\.memberIds\)/);
  assert.match(rules, /match \/groupJoinRequests\/\{requestId\}/);
  assert.match(rules, /function validGroupJoinRequestCreate\(requestId\)/);
  assert.match(rules, /function validGroupJoinDecision\(\)/);
  assert.match(rules, /request\.resource\.data\.status == 'pending'/);
  assert.match(rules, /request\.resource\.data\.status in \['approved', 'rejected'\]/);
  assert.match(rules, /allow read: if canReadGroupJoinRequest\(\)/);
  assert.match(rules, /allow update: if validGroupJoinRequestCreate\(requestId\) \|\| validGroupJoinDecision\(\)/);
  assert.match(rules, /allow read: if approvedUser\(request\.auth\.uid\)/);
});
