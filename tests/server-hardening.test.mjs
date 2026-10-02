import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';

async function startFixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'chatapp-server-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  await mkdir(join(root, '.data'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<p>Hello</p>');
  await writeFile(join(root, 'src', 'app.js'), 'export const ok = true;');
  for (const file of ['.env', '.git/config', '.data/chats.json', 'scripts/private.mjs', 'package.json']) {
    await writeFile(join(root, file), file === '.data/chats.json' ? '{"contacts":[]}' : 'private fixture');
  }
  await symlink(join(root, '.env'), join(root, 'src', 'firebase-config.js'));
  const child = spawn(process.execPath, [new URL('../scripts/serve.mjs', import.meta.url).pathname], {
    cwd: root, env: { ...process.env, DATABASE_URL: '', PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } await rm(root, { recursive: true, force: true }); });
  let port;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    port = Number(output.match(/ChatApp running at http:\/\/127\.0\.0\.1:(\d+)/)?.[1]);
    if (port) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(port, `Server did not listen: ${output}`);
  return { child, url: `http://127.0.0.1:${port}` };
}

test('static server serves app assets while withholding private checkout files and symlinks', async t => {
  const { url } = await startFixture(t);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/src/app.js`)).status, 200);
  for (const path of ['/.env', '/.git/config', '/.data/chats.json', '/scripts/private.mjs', '/package.json', '/src/firebase-config.js']) {
    assert.equal((await fetch(`${url}${path}`)).status, 404, path);
  }
});

test('malformed escaped URL receives 400 and server keeps answering requests', async t => {
  const { url } = await startFixture(t);
  assert.equal((await fetch(`${url}/%ZZ`).catch(() => ({ status: 'crashed' }))).status, 400);
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
});

test('directory without an index receives 404 and server stays alive', async t => {
  const { url } = await startFixture(t);
  assert.equal((await fetch(`${url}/src/`).catch(() => ({ status: 'crashed' }))).status, 404);
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
});

test('legacy chat API rejects unsigned reads and writes', async t => {
  const { url } = await startFixture(t);
  for (const method of ['GET', 'POST', 'PUT']) {
    const response = await fetch(`${url}/api/chats`, { method, ...(method === 'GET' ? {} : { body: '{"contacts":[]}' }) });
    assert.equal(response.status, 401, method);
  }
});

test('null websocket payload returns an error without crashing the server', async t => {
  const { url } = await startFixture(t);
  const socket = new WebSocket(url.replace('http:', 'ws:') + '/voice');
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const result = new Promise(resolve => { socket.once('message', data => resolve(JSON.parse(data))); socket.once('close', () => resolve({ type: 'crashed' })); });
  socket.send('null');
  assert.equal((await result).type, 'voice-error');
  assert.equal((await fetch(`${url}/healthz`)).status, 200);
});

test('invalid body-size configuration retains the finite default bound', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  for (const value of ['not-a-number', 'Infinity', '0', '-1']) {
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', `import { maxRequestBodyBytes } from ${JSON.stringify(new URL('../scripts/http-utils.mjs', import.meta.url).href)}; process.stdout.write(String(maxRequestBodyBytes));`], { env: { ...process.env, MAX_CHAT_BODY_MB: value } });
    assert.equal(Number(stdout), 25 * 1024 * 1024, value);
  }
});
