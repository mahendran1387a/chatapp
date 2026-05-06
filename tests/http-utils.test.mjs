import assert from 'node:assert/strict';
import test from 'node:test';
import { maxRequestBodyBytes, readRequestBody } from '../scripts/http-utils.mjs';

async function* chunksFor(text, chunkSize = 64 * 1024) {
  const buffer = Buffer.from(text, 'utf8');
  for (let index = 0; index < buffer.length; index += chunkSize) {
    yield buffer.subarray(index, index + chunkSize);
  }
}

test('chat API accepts a long saved chat payload', async () => {
  const longPayload = 'x'.repeat(2 * 1024 * 1024);

  assert.ok(maxRequestBodyBytes > longPayload.length);
  assert.equal(await readRequestBody(chunksFor(longPayload)), longPayload);
});
