import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scripts = [
  '../src/app.js',
  '../src/chat-store.js',
  '../src/firebase-chat.js',
  '../android/app/src/main/assets/www/src/app.js',
  '../android/app/src/main/assets/www/src/chat-store.js',
  '../android/app/src/main/assets/www/src/firebase-chat.js'
];

test('browser scripts parse without duplicate declarations or syntax errors', () => {
  for (const relativePath of scripts) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(relativePath, import.meta.url))], {
      stdio: 'pipe'
    });
  }
});
