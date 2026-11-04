import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';
import { createServer } from '../server/index.mjs';

const scratch = new URL('../.deploy/', import.meta.url);
await mkdir(scratch, { recursive: true });
const dir = await mkdtemp(new URL('http-test-', scratch));
const store = openStore(`${dir}/test.sqlite`);
const password = randomBytes(24).toString('base64url');
const salt = randomBytes(16);
const user = store.createUser({ id: randomUUID(), username: 'http_student', role: 'student', displayName: 'HTTP test',
  passwordSalt: salt.toString('base64url'), passwordHash: scryptSync(password, salt, 64).toString('base64url') });
const app = await createServer({ store, env: { PUBLIC_ORIGIN: 'https://eduethos.test', LOCAL_PREVIEW: 'true', DEEPSEEK_API_KEY: '' } });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;
const call = (path, options = {}) => fetch(base + path, options);
try {
  let response = await call('/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /window.EDUETHOS_ACCOUNT_MODE='isolated'/);
  for (const path of ['/.env.local', '/server/store.mjs', '/runtime/eduethos.sqlite', '/.git/config', '/api/demo/login']) {
    assert.notEqual((await call(path)).status, 200, `private/legacy route must be inaccessible: ${path}`);
  }
  response = await call('/api/health', { headers: { 'oai-authenticated-user-id': 'forged' } });
  const health = await response.json();
  assert.equal(health.accountMode, 'isolated'); assert.equal(health.user, null);
  response = await call('/api/chat', { method: 'POST', headers: { origin: 'https://eduethos.test', 'content-type': 'application/json', 'oai-authenticated-user-id': 'forged' }, body: JSON.stringify({ question: 'Cache 是什么？' }) });
  assert.equal(response.status, 401, 'neither LOCAL_PREVIEW nor a forged platform header authorizes self-hosted chat');
  response = await call('/api/auth/login', { method: 'POST', headers: { origin: 'https://eduethos.test', 'content-type': 'application/json' }, body: JSON.stringify({ username: user.username, password }) });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /HttpOnly.*Secure/);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  response = await call('/api/health', { headers: { cookie } });
  assert.equal((await response.json()).user.id, user.id);
  response = await call('/api/chat', { method: 'POST', headers: { cookie, origin: 'https://eduethos.test', 'x-expected-user-id': user.id, 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Cache 是什么？', history: [] }) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-eduethos-user-id'), user.id);
  assert.equal((await response.json()).answer.mode, 'retrieval');
  console.log('Account HTTP checks passed: isolated entry, private routes, server sessions, model identity, platform-header spoof and preview-bypass rejection.');
} finally {
  await app.close(); store.close(); await rm(dir, { recursive: true, force: true });
}
