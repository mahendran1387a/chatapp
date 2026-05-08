import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Firebase Google auth gates chat access and removes manual new-chat registration', () => {
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const auth = readFileSync(new URL('../src/firebase-chat.js', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../src/firebase-config.js', import.meta.url), 'utf8');

  assert.match(auth, /GoogleAuthProvider/);
  assert.match(auth, /signInWithPopup/);
  assert.match(auth, /collection\(db, 'users'\)/);
  assert.match(auth, /senderUid: user\.uid/);
  assert.match(auth, /senderEmail: user\.email/);
  assert.match(auth, /senderDisplayName:/);
  assert.match(app, /data-auth-sign-in/);
  assert.match(app, /currentAuthUser/);
  assert.match(app, /createAuthenticatedContact/);
  assert.match(app, /reconcileAuthenticatedContacts/);
  assert.doesNotMatch(app, /placeholder="Aisha Friend"/);
  assert.match(config, /apiKey: 'AIzaSyCTwbG9VfUstguvtiEhCLWLiO2U1SZFoGM'/);
  assert.match(config, /projectId: 'kidswhatsapp-6fffb'/);
  assert.doesNotMatch(config, /apiKey: 'YOUR_/);
});

test('Firestore rules require auth uid and sender identity to match request auth', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.match(rules, /request\.auth != null/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /senderUid == request\.auth\.uid/);
  assert.match(rules, /senderEmail == request\.auth\.token\.email/);
  assert.match(rules, /participants\.hasAny\(\[request\.auth\.uid\]\)/);
});
