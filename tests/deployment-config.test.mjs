import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('static files are served without stale browser caching', () => {
  const server = readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');

  assert.match(server, /'Cache-Control': 'no-store, max-age=0'/);
});

test('Firebase rules can be deployed from the repo root', () => {
  const firebaseConfig = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  const firebaseRc = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'));

  assert.equal(firebaseConfig.firestore.rules, 'firestore.rules');
  assert.equal(firebaseRc.projects.default, 'kidswhatsapp-6fffb');
});
