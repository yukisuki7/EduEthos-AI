// Shared trial accounts only. Secrets and password verifiers live in runtime configuration.
const DEMO_SESSION_SECONDS = 8 * 60 * 60;
const demoEncoder = new TextEncoder();
const demoDecoder = new TextDecoder();
function demoBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function demoBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function demoConfiguration(env) {
  if (!env.DEMO_ACCOUNTS || !env.DEMO_SESSION_SECRET) return null;
  try {
    const accounts = JSON.parse(env.DEMO_ACCOUNTS);
    if (String(env.DEMO_SESSION_SECRET).length < 32 || !Array.isArray(accounts) || !accounts.length || accounts.length > 10) return null;
    const names = new Set();
    for (const a of accounts) {
      if (!/^[a-z0-9_-]{3,40}$/.test(a.username) || names.has(a.username) ||
          !['student', 'teacher'].includes(a.role) || typeof a.displayName !== 'string' || a.displayName.length > 20 ||
          demoBytes(a.salt).length < 16 || demoBytes(a.hash).length !== 32) return null;
      names.add(a.username);
    }
    return accounts;
  } catch { return null; }
}
function demoUser(account) {
  return { username: account.username, role: account.role, displayName: account.displayName };
}
function demoCookieName(request) { return new URL(request.url).protocol === 'https:' ? '__Host-eduethos_demo' : 'eduethos_demo'; }
function demoCookie(request, value, seconds) {
  return `${demoCookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
async function demoSigningKey(env) {
  // Rotating either the signing secret or the accounts invalidates existing sessions.
  return crypto.subtle.importKey('raw', demoEncoder.encode(env.DEMO_SESSION_SECRET + '\n' + env.DEMO_ACCOUNTS), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export function createDemoAuth({ now = () => Date.now(), ApiError, json }) {
  const attempts = new Map();
  const enabled = env => Boolean(demoConfiguration(env));
  async function user(request, env) {
    const accounts = demoConfiguration(env);
    if (!accounts) return null;
    try {
      const cookie = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(demoCookieName(request) + '='));
      if (!cookie || cookie.length > 2048) return null;
      const pieces = cookie.slice(cookie.indexOf('=') + 1).split('.');
      if (pieces.length !== 2 || !await crypto.subtle.verify('HMAC', await demoSigningKey(env), demoBytes(pieces[1]), demoEncoder.encode(pieces[0]))) return null;
      const payload = JSON.parse(demoDecoder.decode(demoBytes(pieces[0])));
      const seconds = Math.floor(now() / 1000);
      if (!Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || payload.exp <= seconds || payload.iat > seconds || payload.exp - payload.iat !== DEMO_SESSION_SECONDS) return null;
      const account = accounts.find(a => a.username === payload.sub);
      return account ? demoUser(account) : null;
    } catch { return null; }
  }
  function throttle(request, username) {
    const time = now();
    for (const [key, bucket] of attempts) if (time - bucket.start >= 600000) attempts.delete(key);
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const keys = [[`ip:${ip}`, 10], [`account:${username}`, 30]];
    for (const [key, max] of keys) {
      if ((attempts.get(key)?.count || 0) >= max || (attempts.size >= 2000 && !attempts.has(key))) {
        throw new ApiError(429, 'login_rate_limit', '登录尝试较多，请十分钟后再试。');
      }
    }
    for (const [key] of keys) {
      const bucket = attempts.get(key) || { start: time, count: 0 };
      bucket.count++; attempts.set(key, bucket);
    }
  }
  async function login(request, env) {
    const accounts = demoConfiguration(env);
    if (!accounts) throw new ApiError(503, 'demo_unavailable', '体验账号暂未配置，请联系维护者。');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'json_required', '请使用登录表单提交。');
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError(400, 'invalid_login', '请输入账号和密码。');
    const chunks = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 4096) { await reader.cancel(); throw new ApiError(413, 'input_too_large', '登录信息过长。'); }
      chunks.push(value);
    }
    let body;
    try {
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      body = JSON.parse(demoDecoder.decode(bytes));
    } catch { throw new ApiError(400, 'invalid_login', '登录信息格式不正确。'); }
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 128 || !body.password || !/^[a-z0-9_-]{3,40}$/.test(body.username.trim())) throw new ApiError(400, 'invalid_login', '请输入有效账号和密码。');
    const username = body.username.trim();
    throttle(request, username);
    const account = accounts.find(a => a.username === username);
    // Unknown accounts do the same expensive verification to avoid a username timing signal.
    const candidate = account || accounts[0];
    const key = await crypto.subtle.importKey('raw', demoEncoder.encode(body.password), 'PBKDF2', false, ['deriveBits']);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: demoBytes(candidate.salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
    const expected = demoBytes(candidate.hash); let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i];
    if (!account || mismatch) throw new ApiError(401, 'invalid_credentials', '账号或密码不正确。');
    const iat = Math.floor(now() / 1000);
    const payload = demoBase64(demoEncoder.encode(JSON.stringify({ sub: username, iat, exp: iat + DEMO_SESSION_SECONDS, nonce: crypto.randomUUID() })));
    const signature = demoBase64(await crypto.subtle.sign('HMAC', await demoSigningKey(env), demoEncoder.encode(payload)));
    return json({ user: demoUser(account) }, 200, { 'set-cookie': demoCookie(request, payload + '.' + signature, DEMO_SESSION_SECONDS) });
  }
  return { enabled, user, login, logout: request => json({ ok: true }, 200, { 'set-cookie': demoCookie(request, '', 0) }) };
}
