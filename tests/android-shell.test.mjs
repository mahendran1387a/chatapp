import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const activity = readFileSync(new URL('../android/app/src/main/java/com/chatapp/demo/MainActivity.java', import.meta.url), 'utf8');
const publicLink = readFileSync(new URL('../PUBLIC_CHAT_LINK.txt', import.meta.url), 'utf8').match(/https:\/\/\S+/)[0];

test('Android launches the canonical HTTPS app with the system browser', () => {
  assert.ok(activity.includes(`"${publicLink}"`));
  assert.match(activity, /new Intent\(Intent\.ACTION_VIEW,\s*Uri\.parse\(/);
  assert.match(activity, /startActivity\(/);
  assert.match(activity, /finish\(\)/);
});

test('Android does not run Firebase Google sign-in in an embedded file WebView', () => {
  assert.doesNotMatch(activity, /\bWebView\b|file:\/\/\/android_asset/);
});

test('Android shows a useful fallback when no browser can open the public link', () => {
  assert.match(activity, /catch\s*\(ActivityNotFoundException\b/);
  assert.match(activity, /new TextView\(this\)/);
  assert.match(activity, /install a web browser/i);
  assert.match(activity, /setContentView\(/);
});
