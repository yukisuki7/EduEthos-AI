import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SESSION_SECONDS = 8 * 60 * 60;
const SESSION_COOKIE = 'eduethos_session';
const SECURE_SESSION_COOKIE = '__Host-eduethos_session';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_STATE_BYTES = 1_800_000;
const responseHeaders = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...responseHeaders, ...extraHeaders } });
}

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function fail(status, code, message) { throw new HttpError(status, code, message); }
function cookieName(origin) { return origin.startsWith('https://') ? SECURE_SESSION_COOKIE : SESSION_COOKIE; }

export function readSessionCookie(request, origin) {
  const name = cookieName(origin) + '=';
  const item = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(name));
  const token = item?.slice(name.length);
  return token && /^[A-Za-z0-9_-]{40,128}$/.test(token) ? token : null;
}

function sessionCookie(origin, token, maxAge) {
  return `${cookieName(origin)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${origin.startsWith('https://') ? '; Secure' : ''}`;
}

function publicUserSafe(user) {
  return user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null;
}

function validDisplayName(value) {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 40;
}

const usernamePattern = /^[a-z0-9_-]{3,40}$/;
function validPassword(value) { return typeof value === 'string' && [...value].length >= 12 && [...value].length <= 128; }

function validateState(state, userRole) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      !Array.isArray(state.sessions) || state.sessions.length > 20 ||
      !Array.isArray(state.docs) || state.docs.length > 40 ||
      typeof state.activeSessionId !== 'string' || state.activeSessionId.length > 128) {
    fail(400, 'invalid_state', '学习记录格式不正确。');
  }
  let messageCount = 0;
  for (const session of state.sessions) {
    if (!session || typeof session !== 'object' || Array.isArray(session) ||
        typeof session.id !== 'string' || session.id.length < 1 || session.id.length > 128 ||
        typeof session.title !== 'string' || session.title.length > 1000 ||
        typeof session.chapterId !== 'string' || session.chapterId.length > 128 ||
        !Array.isArray(session.messages) || session.messages.length > 40) {
      fail(400, 'invalid_state', '学习记录格式不正确。');
    }
    for (const message of session.messages) {
      messageCount++;
      if (!message || typeof message !== 'object' || Array.isArray(message) ||
          typeof message.id !== 'string' || message.id.length < 1 || message.id.length > 128 ||
          typeof message.question !== 'string' || message.question.length > 5000 ||
          typeof message.answer !== 'object' || message.answer === null || Array.isArray(message.answer) ||
          !Array.isArray(message.answer.paragraphs) || !Array.isArray(message.answer.bullets) ||
          !Array.isArray(message.answer.sourceIds) || !Array.isArray(message.answer.followups) ||
          !Array.isArray(message.sources) || message.sources.length > 20 ||
          (message.createdAt !== undefined && (typeof message.createdAt !== 'string' || message.createdAt.length > 100 || !Number.isFinite(Date.parse(message.createdAt)))) ||
          (session.updatedAt !== undefined && (typeof session.updatedAt !== 'string' || session.updatedAt.length > 100 || !Number.isFinite(Date.parse(session.updatedAt))))) {
        fail(400, 'invalid_state', '学习记录格式不正确。');
      }
      const validStrings = (items, maxItems, maxLength) => items.length <= maxItems && items.every(item => typeof item === 'string' && item.length <= maxLength);
      if (!validStrings(message.answer.paragraphs, 20, 10000) || !validStrings(message.answer.bullets, 20, 10000) ||
          !validStrings(message.answer.sourceIds, 20, 128) || !validStrings(message.answer.followups, 10, 2000) ||
          (message.answer.sections !== undefined && (!Array.isArray(message.answer.sections) || message.answer.sections.length > 8 ||
            message.answer.sections.some(section => !section || typeof section !== 'object' || Array.isArray(section) ||
              !Array.isArray(section.paragraphs) || !Array.isArray(section.bullets) ||
              !validStrings(section.paragraphs, 20, 10000) || !validStrings(section.bullets, 20, 10000))))) {
        fail(400, 'invalid_state', '回答内容格式不正确。');
      }
      for (const source of message.sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source) ||
            typeof source.id !== 'string' || source.id.length > 128 ||
            typeof source.title !== 'string' || source.title.length > 500 ||
            typeof source.text !== 'string' || source.text.length > 200000 ||
            (source.section !== undefined && (typeof source.section !== 'string' || source.section.length > 1000))) {
          fail(400, 'invalid_state', '引用资料格式不正确。');
        }
      }
      // Authors are derived from the authenticated principal; client roles are never authoritative.
      message.authorRole = userRole;
      message.isDemo = false;
    }
  }
  if (messageCount > 800) fail(400, 'invalid_state', '学习记录数量超出限制。');
  for (const doc of state.docs) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) ||
        typeof doc.id !== 'string' || doc.id.length < 1 || doc.id.length > 128 ||
        typeof doc.title !== 'string' || doc.title.length > 500 ||
        typeof doc.text !== 'string' || doc.text.length > 200_000 ||
        typeof doc.chapterId !== 'string' || doc.chapterId.length > 128 ||
        (doc.enabled !== undefined && typeof doc.enabled !== 'boolean')) {
      fail(400, 'invalid_state', '资料格式不正确。');
    }
  }
  if (state.activeSessionId && !state.sessions.some(session => session.id === state.activeSessionId)) {
    fail(400, 'invalid_state', '当前对话不存在。');
  }
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_STATE_BYTES) fail(413, 'state_too_large', '学习记录过大。');
  return state;
}

function validateOrigin(request, origin, method) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      fail(403, 'cross_origin', '请从课程学习页面提交请求。');
    }
  } else {
    const requestOrigin = request.headers.get('origin');
    if ((requestOrigin && requestOrigin !== origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      fail(403, 'cross_origin', '请求来源不受信任。');
    }
  }
}

async function readJson(request, maxBytes = MAX_BODY_BYTES) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) fail(415, 'json_required', '请使用页面表单提交。');
  const announcedLength = Number(request.headers.get('content-length') || 0);
  if (announcedLength > maxBytes) fail(413, 'payload_too_large', '请求内容过大。');
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) fail(413, 'payload_too_large', '请求内容过大。');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); }
  catch { fail(400, 'invalid_json', '请求内容格式不正确。'); }
}

function makeRateLimiter(now) {
  const buckets = new Map();
  return (request, username) => {
    const time = now();
    for (const [key, bucket] of buckets) if (time - bucket.start >= 10 * 60_000) buckets.delete(key);
    const ip = request.headers.get('x-client-ip') || 'unknown';
    const keys = [[`ip:${ip}`, 30], [`account:${username}`, 12]];
    for (const [key, limit] of keys) {
      const bucket = buckets.get(key);
      if ((bucket?.count || 0) >= limit || (buckets.size >= 3000 && !bucket)) fail(429, 'login_rate_limit', '登录尝试较多，请十分钟后再试。');
    }
    for (const [key] of keys) {
      const bucket = buckets.get(key) || { start: time, count: 0 };
      bucket.count++;
      buckets.set(key, bucket);
    }
  };
}

export function createAccountApi({ store, origin, chat, now = () => Date.now() }) {
  if (!store || typeof store.getUserForToken !== 'function') throw new TypeError('A ready account store is required.');
  const canonicalOrigin = new URL(origin).origin;
  if (canonicalOrigin !== origin.replace(/\/$/, '')) throw new TypeError('origin must be a canonical origin without a trailing slash.');
  if (typeof chat !== 'function') throw new TypeError('A chat handler is required.');
  const throttleLogin = makeRateLimiter(now);

  async function resolveUser(request) {
    const token = readSessionCookie(request, canonicalOrigin);
    return token ? store.getUserForToken(token) : null;
  }

  function verifyExpectedIdentity(request, user, { required = false } = {}) {
    const expected = request.headers.get('x-expected-user-id');
    if ((!expected && required) || (expected && expected !== user.id)) {
      fail(409, 'identity_mismatch', '账号已切换，请刷新页面后重试。');
    }
  }

  async function currentUser(request) {
    const user = await resolveUser(request);
    if (user) verifyExpectedIdentity(request, user);
    return user;
  }

  async function login(request) {
    const body = await readJson(request, 8192);
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = body?.password;
    if (!usernamePattern.test(username) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
      fail(400, 'invalid_credentials', '请输入有效账号和密码。');
    }
    throttleLogin(request, username);
    const account = store.getUserByUsername(username);
    const salt = account?.passwordSalt || randomBytes(16).toString('base64url');
    const expectedHash = account ? Buffer.from(account.passwordHash, 'base64url') : Buffer.alloc(64, 0xa5);
    const actualHash = await scrypt(password, Buffer.from(salt, 'base64url'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const same = expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
    if (!account || !same) fail(401, 'invalid_credentials', '账号或密码不正确。');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now() + SESSION_SECONDS * 1000;
    store.createSession({ token, userId: account.id, expiresAt });
    return json({ user: publicUserSafe(account) }, 200, { 'set-cookie': sessionCookie(canonicalOrigin, token, SESSION_SECONDS) });
  }

  async function handle(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (!path.startsWith('/api/')) return json({ error: '接口不存在。', code: 'not_found' }, 404);
      const method = request.method.toUpperCase();
      validateOrigin(request, canonicalOrigin, method);

      if (path === '/api/auth/session' && method === 'GET') return json({ user: await currentUser(request) });
      if (path === '/api/auth/login' && method === 'POST') return await login(request);
      if (path === '/api/auth/logout' && method === 'POST') {
        const current = await resolveUser(request);
        if (current) verifyExpectedIdentity(request, current);
        const token = readSessionCookie(request, canonicalOrigin);
        if (token) store.revokeSession(token);
        return json({ ok: true }, 200, { 'set-cookie': sessionCookie(canonicalOrigin, '', 0) });
      }

      if (path === '/api/chat' && method === 'POST') {
        const user = await resolveUser(request);
        if (!user) fail(401, 'sign_in_required', '请先登录账号。');
        verifyExpectedIdentity(request, user, { required: true });
        return await chat(request, user);
      }

      if (path === '/api/me/state' && method === 'GET') {
        const user = await currentUser(request);
        if (!user) fail(401, 'sign_in_required', '请先登录账号。');
        return json(store.getState(user.id));
      }
      if (path === '/api/me/state' && method === 'PUT') {
        const user = await resolveUser(request);
        if (!user) fail(401, 'sign_in_required', '请先登录账号。');
        const body = await readJson(request);
        if (body?.userId !== user.id) fail(409, 'identity_mismatch', '账号已切换，请刷新页面后重试。');
        verifyExpectedIdentity(request, user, { required: true });
        if (!Number.isInteger(body?.revision) || body.revision < 0) fail(400, 'invalid_revision', '记录版本不正确。');
        const state = validateState(body.state, user.role);
        const updated = store.putState({ userId: user.id, expectedRevision: body.revision, state });
        if (!updated) fail(409, 'revision_conflict', '记录已在另一页面更新，请刷新后重试。');
        return json(updated);
      }

      if (path === '/api/teacher/questions' && method === 'GET') {
        const user = await currentUser(request);
        if (!user) fail(401, 'sign_in_required', '请先登录账号。');
        if (user.role !== 'teacher' && user.role !== 'admin') fail(403, 'forbidden', '此账号无权查看班级统计。');
        return json({ userId: user.id, ...store.teacherQuestions(user.id) });
      }

      if (path === '/api/admin/overview' && method === 'GET') {
        const user = await currentUser(request);
        if (!user) fail(401, 'sign_in_required', '请先登录账号。');
        requireAdmin(user);
        return json({ userId: user.id, ...store.overview() });
      }

      if (path === '/api/admin/users' && method === 'POST') {
        const actor = await requireAuthenticated(request);
        requireAdmin(actor);
        const body = await readJson(request, 8192);
        const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
        const password = body?.password;
        const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
        const role = body?.role;
        if (!usernamePattern.test(username) || !validPassword(password) || !validDisplayName(displayName) || !['admin', 'teacher', 'student'].includes(role)) {
          fail(400, 'invalid_account', '请检查账号、显示名称、角色和密码要求（密码至少12位）。');
        }
        const salt = randomBytes(16);
        const passwordHash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
        try {
          const created = store.createUser({ id: randomUUID(), username, displayName, role,
            passwordSalt: salt.toString('base64url'), passwordHash: passwordHash.toString('base64url') });
          return json({ user: created }, 201);
        } catch (error) {
          if (error?.errcode === 2067) fail(409, 'username_taken', '账号名称已被使用。');
          throw error;
        }
      }

      if (path === '/api/admin/classes' && method === 'POST') {
        const actor = await requireAuthenticated(request);
        requireAdmin(actor);
        const body = await readJson(request, 8192);
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (!name || name.length > 100) fail(400, 'invalid_class', '班级名称不能为空且最多100个字符。');
        try { return json({ class: store.createClass({ id: randomUUID(), name }) }, 201); }
        catch (error) {
          if (error?.errcode === 2067) fail(409, 'class_exists', '同名班级已经存在。');
          throw error;
        }
      }

      if (path === '/api/admin/memberships' && method === 'POST') {
        const actor = await requireAuthenticated(request);
        requireAdmin(actor);
        const body = await readJson(request, 8192);
        if (typeof body?.classId !== 'string' || typeof body?.userId !== 'string') fail(400, 'invalid_membership', '班级和账号信息不正确。');
        const membership = store.setMembership({ classId: body.classId, userId: body.userId });
        if (!membership) fail(404, 'membership_target_missing', '班级或账号不存在。');
        return json({ membership });
      }

      if (path === '/api/admin/memberships' && method === 'DELETE') {
        const actor = await requireAuthenticated(request);
        requireAdmin(actor);
        const body = await readJson(request, 8192);
        if (typeof body?.classId !== 'string' || typeof body?.userId !== 'string') fail(400, 'invalid_membership', '班级和账号信息不正确。');
        return json({ removed: store.removeMembership({ classId: body.classId, userId: body.userId }) });
      }

      return json({ error: '接口不存在。', code: 'not_found' }, 404);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
      return json({ error: '账号服务暂不可用，请稍后重试。', code: 'internal_error' }, 500);
    }
  }

  async function requireAuthenticated(request) {
    const user = await resolveUser(request);
    if (!user) fail(401, 'sign_in_required', '请先登录账号。');
    verifyExpectedIdentity(request, user);
    return user;
  }

  return Object.assign(handle, { resolveUser, getUser: resolveUser });
}

function requireAdmin(user) {
  if (user.role !== 'admin') fail(403, 'forbidden', '此账号无权执行管理员操作。');
}
