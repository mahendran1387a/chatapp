import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appFiles = [
  '../src/app.js',
  '../android/app/src/main/assets/www/src/app.js'
];

test('Firebase identity is narrowed to approved family members only', () => {
  const auth = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');

  assert.match(auth, /familyOwnerEmails/);
  assert.match(auth, /isFamilyOwnerEmail/);
  assert.match(auth, /where/);
  assert.match(auth, /where\('approved', '==', true\)/);
  assert.match(auth, /subscribeCurrentUserProfile/);
  assert.match(auth, /subscribePendingFamilyUsers/);
  assert.match(auth, /subscribeFamilyInvites/);
  assert.match(auth, /sendFamilyInvite/);
  assert.match(auth, /approveFamilyMember/);
  assert.match(auth, /inviteRef/);
  assert.match(auth, /hasInvite/);
  assert.match(auth, /profile\.approved = true/);
  assert.match(auth, /profile\.role = 'member'/);
  assert.match(auth, /existingData/);
  assert.match(auth, /!\('approved' in existingData\)/);
  assert.match(auth, /user\.approved !== true/);
  assert.match(auth, /approved: true/);
  assert.match(auth, /role = 'owner'/);
});

test('app shows a closed-family gate, invite form, and approval controls', () => {
  for (const relativePath of appFiles) {
    const app = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(app, /currentUserProfile/);
    assert.match(app, /pendingFamilyUsers/);
    assert.match(app, /pendingFamilyInvites/);
    assert.match(app, /approvedUserEmails/);
    assert.match(app, /!approvedUserEmails\.has/);
    assert.match(app, /unsubscribeFamilyInvites = subscribeFamilyInvites/);
    assert.match(app, /function isCurrentUserApproved\(\)/);
    assert.match(app, /function renderFamilyAccessGate\(\)/);
    assert.match(app, /data-family-invite-form/);
    assert.match(app, /data-family-invite-email/);
    assert.match(app, /data-approve-family-user/);
    assert.match(app, /Invite by Gmail/);
    assert.match(app, /Approved friends/);
    assert.match(app, /Allow People/);
    assert.match(app, /pending-family-message/);
    assert.match(app, /pending-family-people/);
    assert.match(app, /family-gate-message/);
    assert.match(app, /Tap a person below to allow them into your family chat/);
    assert.match(app, /Ask Sangavi to sign in once/);
    assert.match(app, /Invite sent/);
    assert.match(app, /Ask the app owner to approve you/);
  }
});

test('allow people panel is visually prominent', () => {
  for (const relativePath of [
    '../styles.css',
    '../android/app/src/main/assets/www/styles.css'
  ]) {
    const styles = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    assert.match(styles, /\.pending-family-list/);
    assert.match(styles, /background: #fff7d8/);
    assert.match(styles, /border: 2px solid #ffd56a/);
    assert.match(styles, /\.pending-family-message \{[\s\S]*?max-height: min\(18svh, 120px\);[\s\S]*?overflow-y: auto;/);
    assert.match(styles, /\.pending-family-people \{[\s\S]*?overflow-y: auto;/);
    assert.match(styles, /\.family-gate-message \{[\s\S]*?max-height: min\(28svh, 180px\);[\s\S]*?overflow-y: auto;/);
    assert.match(styles, /overflow-wrap: anywhere/);
  }
});

test('Firestore rules enforce closed family access and owner-only invites', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(rules, /ownerEmail\(\)/);
  assert.match(rules, /approvedUser\(uid\)/);
  assert.match(rules, /resource\.data\.approved == true/);
  assert.match(rules, /match \/invites\/\{email\}/);
  assert.match(rules, /allow create, update: if ownerEmail\(\)/);
  assert.match(rules, /hasInvitedEmail\(\)/);
  assert.match(rules, /validSelfInviteApproval\(uid\)/);
  assert.match(rules, /validSelfPendingMigration\(uid\)/);
  assert.match(rules, /approvedUser\(request\.auth\.uid\)/);
  assert.match(rules, /approvedUid\(data\.participants\[0\]\)/);
  assert.match(rules, /approvedUid\(data\.participants\[1\]\)/);
  assert.match(rules, /validMessageConversation\(conversationId\)/);
  assert.match(rules, /data\.participants == request\.resource\.data\.participants/);
});
