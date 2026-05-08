import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('app uses the teal chat icon for browser and Android launcher', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const androidIndex = readFileSync(new URL('../android/app/src/main/assets/www/index.html', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('../app-icon.svg', import.meta.url), 'utf8');
  const launcher = readFileSync(new URL('../android/app/src/main/res/drawable/ic_launcher.xml', import.meta.url), 'utf8');

  assert.match(index, /rel="icon" href="app-icon\.svg"/);
  assert.match(androidIndex, /rel="icon" href="app-icon\.svg"/);
  assert.match(manifest, /android:icon="@drawable\/ic_launcher"/);
  assert.match(icon, /#19e6d2/);
  assert.match(launcher, /#19E6D2/);
});

test('app branding is Kids WhatsApp across web and Android shell', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const androidIndex = readFileSync(new URL('../android/app/src/main/assets/www/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const androidApp = readFileSync(new URL('../android/app/src/main/assets/www/src/app.js', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const icon = readFileSync(new URL('../app-icon.svg', import.meta.url), 'utf8');

  for (const contents of [index, androidIndex, app, androidApp, manifest, icon]) {
    assert.match(contents, /Kids WhatsApp/);
  }
  assert.match(index, /<title>Kids WhatsApp<\/title>/);
  assert.match(androidIndex, /<title>Kids WhatsApp<\/title>/);
  assert.doesNotMatch(index, />WhatsApp</);
  assert.doesNotMatch(app, />ChatApp</);
});
