// Explicit live acceptance check. Credentials and temporary test passwords stay
// in an ignored file; no passwords, cookies, or API keys are printed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const credentialPath = process.argv[2];
if (!credentialPath) throw new Error('Pass an administrator credential JSON file explicitly.');
const credentials = JSON.parse(await readFile(credentialPath, 'utf8'));
const base = new URL(credentials.url).origin;
if (!base.startsWith('https://')) throw new Error('Live acceptance requires HTTPS.');
const suffix = randomBytes(4).toString('hex');
const evidence = new URL('../.deploy/live-account-acceptance.json', import.meta.url);
const run = { base, suffix, users: [], classes: [], checks: [] };
const save = () => writeFile(evidence, JSON.stringify(run, null, 2), { mode: 0o600 });
async function request(path, { session, method = 'GET', body, expectedId, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { Accept: 'application/json',
    ...(session ? { Cookie: session.cookie, 'X-Expected-User-Id': expectedId || session.user.id } : {}),
    ...(!['GET', 'HEAD'].includes(method) ? { Origin: base, 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(path === '/api/chat' ? 65000 : 15000) });
  const data = await response.json();
  return { response, data };
}
async function login(username, password) {
  const { response, data } = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200, `Login failed: ${data.code || response.status}`);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
  return { user: data.user, cookie: cookie.split(';')[0] };
}
const admin = await login(credentials.username, credentials.password);
const sessions = [admin];
try {
  for (const role of ['student', 'student', 'teacher']) {
    const index = run.users.length;
    const password = randomBytes(24).toString('base64url');
    const username = `qa_${suffix}_${index}`;
    const { response, data } = await request('/api/admin/users', { session: admin, method: 'POST',
      body: { username, password, role, displayName: `隔离验收${index + 1}` } });
    assert.equal(response.status, 201);
    run.users.push({ ...data.user, password }); await save();
  }
  for (const label of ['A', 'B']) {
    const { response, data } = await request('/api/admin/classes', { session: admin, method: 'POST', body: { name: `验收临时班级${label}-${suffix}` } });
    assert.equal(response.status, 201); run.classes.push(data.class); await save();
  }
  const [userA, userB, teacher] = run.users;
  for (const [cls, user] of [[run.classes[0], userA], [run.classes[1], userB], [run.classes[0], teacher]]) {
    assert.equal((await request('/api/admin/memberships', { session: admin, method: 'POST', body: { classId: cls.id, userId: user.id } })).response.status, 200);
  }
  const [a, b, t] = await Promise.all(run.users.map(user => login(user.username, user.password)));
  sessions.push(a, b, t);
  const chat = await request('/api/chat', { session: a, method: 'POST', body: { question: '请简要解释 Cache 为什么能提高 CPU 访问存储器的平均速度。', history: [] } });
  assert.equal(chat.response.status, 200, `Model request failed: ${chat.data.code || chat.response.status}`);
  assert.equal(chat.data.answer?.mode, 'model');
  assert.ok(chat.data.answer.paragraphs.length || chat.data.answer.sections?.length);
  run.model = { status: chat.response.status, model: chat.data.model, supported: chat.data.answer.supported,
    paragraphs: chat.data.answer.paragraphs, sections: chat.data.answer.sections, sources: chat.data.sources?.map(s => ({ id: s.id, section: s.section })) };
  run.checks.push('HTTPS certificate, Secure/HttpOnly session and real model response');
  const questionA = `验收A-${suffix} Cache为什么可以加速？`;
  const questionB = `验收B-${suffix} CPU如何执行指令？`;
  function stateFor(id, question, answerPayload) {
    const message = { id: `m-${id}`, question, createdAt: new Date().toISOString(), authorRole: 'student', isDemo: false, feedback: '',
      answer: answerPayload?.answer || { paragraphs: ['临时验收数据'], bullets: [], sourceIds: [], followups: [], supported: true }, sources: answerPayload?.sources || [] };
    return { sessions: [{ id, title: question, chapterId: 'memory', updatedAt: new Date().toISOString(), messages: [message] }], docs: [], activeSessionId: id };
  }
  for (const [session, state] of [[a, stateFor(`s-a-${suffix}`, questionA, chat.data)], [b, stateFor(`s-b-${suffix}`, questionB)]]) {
    const { response } = await request('/api/me/state', { session, method: 'PUT', body: { userId: session.user.id, revision: 0, state } });
    assert.equal(response.status, 200);
  }
  const bState = await request(`/api/me/state?userId=${a.user.id}`, { session: b });
  assert.equal(bState.data.userId, b.user.id);
  assert.equal(bState.data.state.sessions[0].messages[0].question, questionB);
  assert.ok(!JSON.stringify(bState.data).includes(questionA));
  const attack = await request('/api/me/state', { session: b, method: 'PUT', body: { userId: a.user.id, revision: 1, state: stateFor('attack', 'forged') } });
  assert.equal(attack.response.status, 409);
  const changedCookie = await request('/api/chat', { session: b, expectedId: a.user.id, method: 'POST', body: { question: 'Cache是什么？', history: [] } });
  assert.equal(changedCookie.response.status, 409);
  const teacherData = await request('/api/teacher/questions', { session: t });
  assert.equal(teacherData.response.status, 200);
  assert.ok(JSON.stringify(teacherData.data).includes(questionA));
  assert.ok(!JSON.stringify(teacherData.data).includes(questionB));
  assert.ok(!JSON.stringify(teacherData.data).includes('临时验收数据'));
  assert.equal((await request('/api/teacher/questions', { session: a })).response.status, 403);
  assert.equal((await request('/api/admin/overview', { session: t })).response.status, 403);
  run.checks.push('Student A/B persistent state isolation, forged owner rejection, cross-tab identity rejection, teacher class scope and role authorization');
  await request('/api/admin/memberships', { session: admin, method: 'DELETE', body: { classId: run.classes[0].id, userId: teacher.id } });
  const revoked = await request('/api/teacher/questions', { session: t });
  assert.equal(revoked.data.sessions.length, 0); assert.equal(revoked.data.classes.length, 0);
  // Keep temporary accounts available only for the subsequent browser smoke test.
  // Cleanup is explicit and uses the recorded exact IDs through the server store.
  run.checks.push('Teacher access revoked immediately after removing class membership');
  const anonymous = await request('/api/chat', { method: 'POST', headers: { 'oai-authenticated-user-id': 'spoofed' }, body: { question: 'Cache是什么？', history: [] } });
  assert.equal(anonymous.response.status, 401);
  run.passed = true; await save();
  console.log(JSON.stringify({ passed: true, model: run.model.model, checks: run.checks, temporaryUsers: run.users.length, temporaryClasses: run.classes.length,
    evidence: '.deploy/live-account-acceptance.json (contains temporary test credentials; ignored, not for publication)' }));
} finally {
  for (const session of sessions) {
    const logout = await request('/api/auth/logout', { session, method: 'POST' });
    assert.equal(logout.response.status, 200);
    assert.equal((await request('/api/me/state', { session })).response.status, 401);
  }
  run.sessionsRevoked = true; await save();
}
