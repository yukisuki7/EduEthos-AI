import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createApi } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';

const docs = JSON.parse(await readFile(new URL('../worker/documents.json', import.meta.url)));
const retriever = createRetriever(docs);
const fixtureQuestion = '本课程有多少学分和学时？';
const clock = { value: Date.now() };
const encode = value => Buffer.from(value).toString('base64url');
const passwordHash = (password, salt) => encode(pbkdf2Sync(password, Buffer.from(salt, 'base64url'), 100000, 32, 'sha256'));
const studentSalt = encode(randomBytes(16));
const teacherSalt = encode(randomBytes(16));
const studentPassword = 'Trial-student-38';
const teacherPassword = 'Trial-teacher-74';
const accounts = [
  { username: 'student_demo', role: 'student', displayName: '学生体验', salt: studentSalt, hash: passwordHash(studentPassword, studentSalt) },
  { username: 'teacher_demo', role: 'teacher', displayName: '教师体验', salt: teacherSalt, hash: passwordHash(teacherPassword, teacherSalt) },
];
const validEnv = { DEMO_SESSION_SECRET: randomBytes(48).toString('base64url'), DEMO_ACCOUNTS: JSON.stringify(accounts), DEEPSEEK_API_KEY: 'test-placeholder-only' };
const invalidEnv = { DEMO_SESSION_SECRET: 'short', DEMO_ACCOUNTS: validEnv.DEMO_ACCOUNTS };
let completionCalls = 0;
const api = createApi({ retriever, knowledgeCount: docs.length, now: () => clock.value, fetchImpl: async (_url, init) => {
  completionCalls++;
  const prompt = JSON.parse(init.body).messages[1].content;
  const reference = JSON.parse(prompt).references[0];
  const answer = { supported: true, paragraphs: [{ text: '根据课程资料检索回答。', citations: [reference.id] }], bullets: [], value: { text: '', citations: [] }, followups: [] };
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] }));
} });
const request = (path, { method = 'GET', body, headers = {}, url = 'https://course.example' + path } = {}) => new Request(url, {
  method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
});
const call = (path, options, env = validEnv) => api(request(path, options), env);
const login = (username, password, { ip = randomBytes(4).toString('hex'), env = validEnv, origin } = {}) => call('/api/demo/login', {
  method: 'POST', body: { username, password }, headers: { 'cf-connecting-ip': ip, ...(origin ? { origin } : {}) }
}, env);
const cookiePair = response => (response.headers.get('set-cookie') || '').split(';')[0];
const cookieHeader = response => cookiePair(response);

// Configuration and health reveal whether login is enabled and the role, never the verifier.
let response = await call('/api/health', {}, {});
let data = await response.json();
assert.equal(data.demoLoginEnabled, false);
assert.equal(data.user, null);
response = await call('/api/health', {}, invalidEnv);
assert.equal((await response.json()).demoLoginEnabled, false, 'malformed/weak configuration is disabled');
response = await call('/api/health');
data = await response.json();
assert.equal(data.demoLoginEnabled, true);
assert.equal(data.requiresSignIn, true, 'anonymous health check requires sign-in when model is configured');
assert.equal(JSON.stringify(data).includes(accounts[0].hash), false, 'health must not reveal password verifiers');

// Endpoint method, CSRF, content type, and bounded-body checks.
response = await call('/api/demo/login');
assert.equal(response.status, 405);
response = await call('/api/demo/login', { method: 'POST', body: { username: 'student_demo', password: studentPassword }, headers: { origin: 'https://attacker.example', 'cf-connecting-ip': 'csrf-check' } });
assert.equal(response.status, 403);
response = await call('/api/demo/login', { method: 'POST', body: 'x'.repeat(4097), headers: { 'content-type': 'application/json', 'cf-connecting-ip': 'size-check' } });
assert.equal(response.status, 413);
response = await call('/api/demo/login', { method: 'POST', body: { username: 'student_demo', password: studentPassword }, headers: { 'content-type': 'text/plain', 'cf-connecting-ip': 'type-check' } });
assert.equal(response.status, 415);
response = await call('/api/demo/logout', { method: 'GET' });
assert.equal(response.status, 405);

// Both roles authenticate; errors do not disclose which field failed.
response = await login('student_demo', studentPassword, { ip: 'student-ip' });
assert.equal(response.status, 200);
let studentResult = await response.json();
assert.deepEqual(studentResult.user, { username: 'student_demo', role: 'student', displayName: '学生体验' });
const studentCookie = cookieHeader(response);
assert.match(studentCookie, /^__Host-eduethos_demo=/);
const cookieAttributes = response.headers.get('set-cookie');
assert.match(cookieAttributes, /; Path=\//);
assert.match(cookieAttributes, /; HttpOnly/);
assert.match(cookieAttributes, /; Secure/);
assert.match(cookieAttributes, /; SameSite=Strict/);
assert.match(cookieAttributes, /; Max-Age=28800/);
response = await login('teacher_demo', teacherPassword, { ip: 'teacher-ip' });
assert.equal(response.status, 200);
const teacherCookie = cookieHeader(response);
assert.equal((await response.json()).user.role, 'teacher');
response = await login('student_demo', 'bad password', { ip: 'bad-password-ip' });
assert.equal(response.status, 401);
const badPasswordPayload = await response.json();
assert.equal(badPasswordPayload.code, 'invalid_credentials');
const badPasswordMessage = badPasswordPayload.error;
response = await login('missing_demo', 'bad password', { ip: 'missing-user-ip' });
assert.equal(response.status, 401);
assert.equal((await response.json()).code, 'invalid_credentials');
assert.equal((await login('student_demo', studentPassword, { env: {}, ip: 'unconfigured-ip' })).status, 503);

// Cookie session makes the role visible to health, bypasses ChatGPT identity, and authorizes the model call.
response = await call('/api/health', { headers: { cookie: studentCookie } });
data = await response.json();
assert.equal(data.user.username, 'student_demo');
assert.equal(data.user.role, 'student');
assert.equal(data.requiresSignIn, false);
assert.equal(JSON.stringify(data).includes(accounts[0].hash), false);
const beforeChat = completionCalls;
response = await call('/api/chat', { method: 'POST', body: { question: fixtureQuestion }, headers: { cookie: studentCookie } });
assert.equal(response.status, 200);
assert.equal((await response.json()).answer.mode, 'model');
assert.equal(completionCalls, beforeChat + 1);
response = await call('/api/chat', { method: 'POST', body: { question: fixtureQuestion } });
assert.equal(response.status, 401, 'anonymous request is rejected');
assert.equal(completionCalls, beforeChat + 1);

// Tampered cookies, expiry, and configuration rotation invalidate existing sessions.
const sep = studentCookie.indexOf('=');
const name = studentCookie.slice(0, sep + 1);
const value = studentCookie.slice(sep + 1);
const tampered = name + (value[0] === 'a' ? 'b' : 'a') + value.slice(1);
response = await call('/api/health', { headers: { cookie: tampered } });
assert.equal((await response.json()).user, null);
clock.value += 9 * 60 * 60 * 1000;
response = await call('/api/health', { headers: { cookie: studentCookie } });
assert.equal((await response.json()).user, null, 'expired session is rejected');
clock.value -= 9 * 60 * 60 * 1000;
response = await call('/api/health', { headers: { cookie: studentCookie } }, { ...validEnv, DEMO_SESSION_SECRET: randomBytes(48).toString('base64url') });
assert.equal((await response.json()).user, null, 'session signing-secret rotation invalidates session');
const changedAccounts = accounts.map(a => ({ ...a, hash: passwordHash(a.username === 'student_demo' ? 'changed' : 'also-changed', a.salt) }));
response = await call('/api/health', { headers: { cookie: studentCookie } }, { ...validEnv, DEMO_ACCOUNTS: JSON.stringify(changedAccounts) });
assert.equal((await response.json()).user, null, 'password-account rotation invalidates session');

// Each account has its own question bucket, and logout clears the browser cookie.
const isolatedApi = createApi({ retriever, knowledgeCount: docs.length, now: () => clock.value, fetchImpl: async (_url, init) => {
  const reference = JSON.parse(JSON.parse(init.body).messages[1].content).references[0];
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ supported: true, paragraphs: [{ text: '已核验。', citations: [reference.id] }], bullets: [], value: { text: '', citations: [] }, followups: [] }) } }] }));
} });
const askAs = cookie => isolatedApi(request('/api/chat', { method: 'POST', body: { question: fixtureQuestion }, headers: { cookie } }), validEnv);
for (let i = 0; i < 6; i++) assert.equal((await askAs(studentCookie)).status, 200, 'student bucket allows six calls');
assert.equal((await askAs(studentCookie)).status, 429, 'seventh call for the same user is limited');
assert.equal((await askAs(teacherCookie)).status, 200, 'teacher has a separate rate-limit bucket');
response = await call('/api/demo/logout', { method: 'POST', headers: { cookie: studentCookie } });
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);
const clearCookie = response.headers.get('set-cookie');
assert.match(clearCookie, /Max-Age=0/);
assert.match(clearCookie, /HttpOnly/);
assert.match(clearCookie, /SameSite=Strict/);
assert.equal((await (await call('/api/health')).json()).user, null, 'browser drops the session cookie after receiving Max-Age=0');

// Login attempts are throttled per client address after ten attempts in the window.
const throttled = createApi({ retriever, knowledgeCount: docs.length, now: () => clock.value });
for (let i = 0; i < 10; i++) {
  const r = await throttled(request('/api/demo/login', { method: 'POST', body: { username: 'student_demo', password: 'wrong' }, headers: { 'cf-connecting-ip': 'bruteforce-ip' } }), validEnv);
  assert.equal(r.status, 401);
}
response = await throttled(request('/api/demo/login', { method: 'POST', body: { username: 'student_demo', password: studentPassword }, headers: { 'cf-connecting-ip': 'bruteforce-ip' } }), validEnv);
assert.equal(response.status, 429);
assert.equal((await response.json()).code, 'login_rate_limit');

// Ensure the password material in the fixture really is not a plain-text digest.
assert.notEqual(accounts[0].hash, encode(createHash('sha256').update(studentPassword).digest()));
console.log('Demo auth checks passed: credentials, errors, cookie security, session validation/rotation, health privacy, chat authorization, rate limits, CSRF, payload limits, and logout.');
