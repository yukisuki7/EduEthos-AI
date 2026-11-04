import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { openStore } from '../server/store.mjs';
import { createAccountApi } from '../server/accounts-api.mjs';

const scrypt = promisify(scryptCallback);
const origin = 'https://eduethos.example.test';
const temp = await mkdtemp(join(tmpdir(), 'eduethos-isolation-'));
let clock = Date.now();
const store = openStore(join(temp, 'test.sqlite'), { now: () => clock });
let chatCalls = 0;

async function createUser(username, role) {
  const salt = randomBytes(16);
  const password = `${username}-passphrase-2026`;
  const passwordHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { user: store.createUser({ id: randomUUID(), username, displayName: username, role,
    passwordSalt: salt.toString('base64url'), passwordHash: passwordHash.toString('base64url') }), password };
}

function request(path, { method = 'GET', body, cookie, expectedUserId, headers = {} } = {}) {
  const finalHeaders = new Headers({ origin, ...headers });
  if (body !== undefined) finalHeaders.set('content-type', 'application/json');
  if (cookie) finalHeaders.set('cookie', cookie);
  if (expectedUserId) finalHeaders.set('x-expected-user-id', expectedUserId);
  return new Request(origin + path, { method, headers: finalHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
}

const api = createAccountApi({ store, origin, now: () => clock, chat: async (_request, user) => {
  chatCalls++;
  return Response.json({ modelUserId: user.id, role: user.role });
} });

async function login(username, password, ip) {
  const response = await api(request('/api/auth/login', { method: 'POST', body: { username, password }, headers: { 'cf-connecting-ip': ip } }));
  assert.equal(response.status, 200);
  const user = (await response.json()).user;
  const cookie = response.headers.get('set-cookie').split(';', 1)[0];
  return { user, cookie };
}

try {
  const admin = await createUser('admin_main', 'admin');
  const teacher = await createUser('teacher_one', 'teacher');
  const studentA = await createUser('student_aa', 'student');
  const studentB = await createUser('student_bb', 'student');
  const classOne = store.createClass({ id: randomUUID(), name: '计算机组成原理一班' });
  const classTwo = store.createClass({ id: randomUUID(), name: '计算机组成原理二班' });
  store.setMembership({ classId: classOne.id, userId: teacher.user.id });
  store.setMembership({ classId: classOne.id, userId: studentA.user.id });
  store.setMembership({ classId: classTwo.id, userId: studentB.user.id });

  const adminSession = await login(admin.user.username, admin.password, '10.0.0.1');
  const teacherSession = await login(teacher.user.username, teacher.password, '10.0.0.2');
  const sessionA = await login(studentA.user.username, studentA.password, '10.0.0.3');
  const sessionB = await login(studentB.user.username, studentB.password, '10.0.0.4');
  let response;

  response = await api(request('/api/admin/users', { method: 'POST', cookie: adminSession.cookie, expectedUserId: admin.user.id, body: {
    username: 'student_new', password: 'NewStudentPassphrase2026', displayName: '新学生', role: 'student',
  } }));
  assert.equal(response.status, 201, 'administrator can create accounts');
  const newStudent = (await response.json()).user;
  response = await api(request('/api/admin/users', { method: 'POST', cookie: adminSession.cookie, expectedUserId: admin.user.id, body: {
    username: 'STUDENT_NEW', password: 'NewStudentPassphrase2026', displayName: '重复账号', role: 'student',
  } }));
  assert.equal(response.status, 409, 'duplicate account names do not become server errors');
  assert.equal((await response.json()).code, 'username_taken');
  response = await api(request('/api/admin/classes', { method: 'POST', cookie: adminSession.cookie, expectedUserId: admin.user.id,
    body: { name: '计算机组成原理新班' } }));
  assert.equal(response.status, 201, 'administrator can create classes');
  const newClass = (await response.json()).class;
  response = await api(request('/api/admin/classes', { method: 'POST', cookie: adminSession.cookie, expectedUserId: admin.user.id,
    body: { name: '计算机组成原理新班' } }));
  assert.equal(response.status, 409, 'duplicate class names do not become server errors');
  assert.equal((await response.json()).code, 'class_exists');
  response = await api(request('/api/admin/memberships', { method: 'POST', cookie: adminSession.cookie, expectedUserId: admin.user.id,
    body: { classId: newClass.id, userId: newStudent.id } }));
  assert.equal(response.status, 200, 'administrator can assign students to classes');
  response = await api(request('/api/admin/overview', { cookie: adminSession.cookie }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).users.some(user => user.id === newStudent.id), true);

  response = await api(request('/api/me/state', { cookie: sessionA.cookie }));
  assert.equal(response.status, 200);
  let stateA = await response.json();
  assert.equal(stateA.userId, sessionA.user.id);
  assert.equal(stateA.revision, 0);
  const questionA = 'A 私有提问：Cache 的映射方式是什么？';
  const saveA = { ...stateA, state: { sessions: [{ id: 'a-session', title: questionA, chapterId: 'memory', messages: [{
    id: 'a-message', question: questionA, createdAt: '2026-11-03T12:00:00.000Z', authorRole: 'teacher', isDemo: true,
    answer: { supported: true, paragraphs: [], bullets: [], sourceIds: [], followups: [] }, sources: [], feedback: 'helpful',
  }] }], docs: [], activeSessionId: 'a-session' } };
  response = await api(request('/api/me/state', { method: 'PUT', cookie: sessionA.cookie, expectedUserId: sessionA.user.id, body: saveA }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);

  response = await api(request('/api/me/state', { cookie: sessionB.cookie }));
  const emptyB = await response.json();
  assert.equal(emptyB.userId, sessionB.user.id);
  assert.equal(emptyB.state.sessions.length, 0, 'user B does not see A history');

  response = await api(request('/api/me/state', { method: 'PUT', cookie: sessionB.cookie, expectedUserId: sessionB.user.id,
    body: { userId: sessionA.user.id, revision: 0, state: saveA.state } }));
  assert.equal(response.status, 409, 'body owner spoof is rejected');
  assert.equal((await response.json()).code, 'identity_mismatch');
  response = await api(request('/api/me/state', { method: 'PUT', cookie: sessionB.cookie, expectedUserId: sessionA.user.id,
    body: { ...emptyB, userId: sessionB.user.id } }));
  assert.equal(response.status, 409, 'cross-tab old identity header is rejected');

  response = await api(request('/api/me/state', { method: 'PUT', cookie: sessionA.cookie, expectedUserId: sessionA.user.id, body: saveA }));
  assert.equal(response.status, 409, 'stale revisions cannot overwrite newer state');
  assert.equal((await response.json()).code, 'revision_conflict');

  const questionB = 'B 私有提问：CPU 的状态寄存器是什么？';
  response = await api(request('/api/me/state', { method: 'PUT', cookie: sessionB.cookie, expectedUserId: sessionB.user.id, body: {
    ...emptyB, userId: sessionB.user.id, revision: 0,
    state: { sessions: [{ id: 'b-session', title: questionB, chapterId: 'memory', messages: [{ id: 'b-message', question: questionB,
      authorRole: 'student', isDemo: false, answer: { supported: true, paragraphs: [], bullets: [], sourceIds: [], followups: [] }, sources: [] }] }], docs: [], activeSessionId: 'b-session' },
  } }));
  assert.equal(response.status, 200);

  response = await api(request('/api/teacher/questions', { cookie: sessionB.cookie }));
  assert.equal(response.status, 403, 'a student cannot read teacher statistics');
  response = await api(request('/api/teacher/questions', { cookie: teacherSession.cookie }));
  assert.equal(response.status, 200);
  const teacherData = await response.json();
  assert.deepEqual(teacherData.classes, [{ id: classOne.id, name: classOne.name }]);
  assert.equal(teacherData.sessions.length, 1, 'teacher reads only students in their authorized class');
  assert.equal(teacherData.sessions[0].messages[0].question, questionA);
  assert.equal(teacherData.sessions[0].messages[0].authorRole, 'student', 'client forged author role is replaced server-side');
  assert.equal(JSON.stringify(teacherData).includes('b-session'), false, 'unassigned student B cannot be included');
  assert.equal(JSON.stringify(teacherData).includes('a-message'), true);
  assert.equal(JSON.stringify(teacherData).includes('sources'), false, 'teacher results omit full private answer and sources');

  response = await api(request('/api/admin/overview', { cookie: teacherSession.cookie }));
  assert.equal(response.status, 403, 'teacher cannot read admin account overview');
  response = await api(request('/api/admin/overview', { cookie: sessionA.cookie, headers: { 'oai-authenticated-user-id': admin.user.id } }));
  assert.equal(response.status, 403, 'a forged platform identity header cannot grant admin access');
  response = await api(request('/api/chat', { method: 'POST', cookie: sessionB.cookie, expectedUserId: sessionA.user.id,
    body: { question: 'test' } }));
  assert.equal(response.status, 409, 'a pending old chat cannot run under the new browser account');
  assert.equal(chatCalls, 0, 'chat handler is not called after an identity mismatch');
  response = await api(request('/api/chat', { method: 'POST', cookie: sessionA.cookie, expectedUserId: sessionA.user.id, body: { question: 'test' } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).modelUserId, sessionA.user.id);

  response = await api(request('/api/admin/memberships', { method: 'DELETE', cookie: adminSession.cookie,
    expectedUserId: admin.user.id, body: { classId: classOne.id, userId: studentA.user.id } }));
  assert.equal(response.status, 200);
  response = await api(request('/api/teacher/questions', { cookie: teacherSession.cookie }));
  assert.equal((await response.json()).sessions.length, 0, 'revoking class membership removes access immediately');

  response = await api(request('/api/auth/logout', { method: 'POST', cookie: sessionA.cookie }));
  assert.equal(response.status, 200);
  response = await api(request('/api/me/state', { cookie: sessionA.cookie }));
  assert.equal(response.status, 401, 'logout revokes its server-side token');

  response = await api(request('/api/auth/session', { cookie: sessionB.cookie, expectedUserId: sessionA.user.id }));
  assert.equal(response.status, 409, 'all authenticated APIs check an expected identity header');

  const expiring = await login(studentA.user.username, studentA.password, '10.0.0.5');
  clock += 8 * 60 * 60 * 1000;
  response = await api(request('/api/me/state', { cookie: expiring.cookie }));
  assert.equal(response.status, 401, 'expired sessions cannot read private state');

  response = await api(new Request(origin + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' }, body: '{}' }));
  assert.equal(response.status, 403, 'cross-origin write is rejected');
  console.log('Account isolation checks passed: private state, owner spoofing, revision conflicts, teacher scope/revocation, role/header spoofing, chat identity, logout, expiry, and cross-origin protection.');
} finally {
  store.close();
  await rm(temp, { recursive: true, force: true });
}
