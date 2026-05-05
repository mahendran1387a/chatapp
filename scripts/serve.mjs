import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createChatStateStore } from './chat-state-store.mjs';

const root = process.cwd();
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? '0.0.0.0';
const chatStateStore = createChatStateStore({ root });
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml'
};

function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, cleanPath === '/' ? 'index.html' : cleanPath);
  if (!filePath.startsWith(root)) return null;
  if (!existsSync(filePath)) return null;
  if (statSync(filePath).isDirectory()) return join(filePath, 'index.html');
  return filePath;
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    'Content-Type': 'text/plain',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(text);
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    const size = chunks.reduce((total, item) => total + item.length, 0);
    if (size > 1024 * 1024) throw new Error('Request body too large');
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleChatsApi(request, response) {
  if (request.method === 'GET') {
    sendJson(response, 200, await chatStateStore.read());
    return;
  }

  if (request.method === 'POST' || request.method === 'PUT') {
    const body = await readRequestBody(request);
    const data = JSON.parse(body);
    const merged = await chatStateStore.merge(data);
    sendJson(response, 200, { ok: true, state: merged });
    return;
  }

  response.writeHead(405, { 'Content-Type': 'text/plain' });
  response.end('Method not allowed');
}

createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://127.0.0.1:${port}`).pathname;
  if (pathname === '/healthz') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === '/api/chats') {
    try {
      await handleChatsApi(request, response);
    } catch (error) {
      console.error('Chat API error:', error);
      sendJson(response, 500, { error: 'Could not save chats' });
    }
    return;
  }

  const filePath = resolvePath(request.url ?? '/');
  if (!filePath) {
    sendText(response, 404, 'Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': types[extname(filePath)] ?? 'application/octet-stream',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`ChatApp running at http://127.0.0.1:${port}`);
  console.log(`LAN access enabled at http://<this-computer-ip>:${port}`);
});
