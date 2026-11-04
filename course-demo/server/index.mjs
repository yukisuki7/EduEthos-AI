import http from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';
import { openStore } from './store.mjs';
import { createAccountApi } from './accounts-api.mjs';

const root = new URL('../', import.meta.url);
const files = ['index.html', 'styles.css', 'app.js', 'data.js', 'analytics.js', 'report.js', 'vendor/alpine.min.js'];
const responseHeaders = {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...responseHeaders, 'content-type': 'application/json; charset=utf-8' } });
}

export async function createServer({ env = process.env, fetchImpl, store: suppliedStore } = {}) {
  const origin = new URL(env.PUBLIC_ORIGIN || 'http://127.0.0.1:8767').origin;
  if (!/^https?:\/\//.test(origin) || (env.NODE_ENV === 'production' && !env.PUBLIC_ORIGIN)) throw new Error('PUBLIC_ORIGIN is required in production.');
  const databasePath = resolve(env.DATABASE_PATH || fileURLToPath(new URL('runtime/eduethos.sqlite', root)));
  if (!suppliedStore) await mkdir(dirname(databasePath), { recursive: true, mode: 0o700 });
  const store = suppliedStore || openStore(databasePath);
  const documents = JSON.parse(await readFile(new URL('worker/documents.json', root), 'utf8'));
  const identities = new WeakMap();
  const model = createApi({ retriever: createRetriever(documents), knowledgeCount: documents.length,
    ...(fetchImpl ? { fetchImpl } : {}), resolveIdentity: request => identities.get(request) || null });
  // Explicit allowlist: LOCAL_PREVIEW, platform headers, and shared demo secrets
  // must never authorize a request on the standalone server.
  const modelEnv = Object.fromEntries(['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'LLM_MODEL'].map(key => [key, env[key] || '']));
  const accountApi = createAccountApi({ store, origin, chat: async (request, user) => {
    identities.set(request, user.id);
    try {
      const response = await model(request, modelEnv);
      response.headers.set('x-eduethos-user-id', user.id);
      return response;
    } finally { identities.delete(request); }
  } });
  const assets = new Map();
  for (const name of files) {
    let text = await readFile(new URL(`dist/${name}`, root), 'utf8');
    if (name === 'index.html') text = text.replace('<head>', "<head>\n  <script>window.EDUETHOS_ACCOUNT_MODE='isolated';</script>");
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript';
    assets.set('/' + name, { text, type: type + '; charset=utf-8' });
  }
  assets.set('/', assets.get('/index.html'));
  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, origin);
      // The configured external origin is authoritative; forwarded headers cannot
      // make a request same-origin or switch cookie security on their own.
      if (path.origin !== origin) { res.writeHead(400); res.end(); return; }
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      for (const name of ['oai-authenticated-user-id', 'oai-authenticated-user-email', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-proto']) headers.delete(name);
      // Trusted Caddy connects only over loopback; never trust this header from a
      // direct network peer. The service itself binds loopback by default.
      const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      headers.set('x-client-ip', env.TRUST_PROXY === 'loopback' && loopback
        ? String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').at(-1).trim()
        : req.socket.remoteAddress || 'unknown');
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { res.writeHead(413, responseHeaders); res.end('Payload too large'); return; }
        chunks.push(chunk);
      }
      const request = new Request(path, { method: req.method, headers,
        ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}) });
      let response;
      if (path.pathname === '/api/health') {
        if (req.method !== 'GET') response = json({ error: '方法不支持。' }, 405);
        else {
          const user = await accountApi.resolveUser(request);
          response = json({ accountMode: 'isolated', user, configured: Boolean(modelEnv.DEEPSEEK_API_KEY),
            model: modelEnv.LLM_MODEL || 'deepseek-flash', knowledgeCount: documents.length,
            requiresSignIn: !user, demoLoginEnabled: false, provider: 'DeepSeek' });
        }
      } else if (path.pathname.startsWith('/api/')) response = await accountApi(request);
      else {
        const asset = assets.get(path.pathname);
        response = asset && ['GET', 'HEAD'].includes(req.method)
          ? new Response(req.method === 'HEAD' ? null : asset.text, { headers: { 'content-type': asset.type } })
          : new Response('Not found', { status: 404 });
      }
      for (const [key, value] of Object.entries(responseHeaders)) response.headers.set(key, value);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Request failed:', error?.code || error?.name || 'Error');
      if (!res.headersSent) res.writeHead(500, { ...responseHeaders, 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: '服务暂不可用，请稍后重试。', code: 'internal_error' }));
    }
  });
  server.requestTimeout = 70000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  return { server, store, close: async () => {
    await new Promise(resolveClose => server.listening ? server.close(resolveClose) : resolveClose());
    if (!suppliedStore) store.close();
  } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  if (process.env.ENV_FILE) process.loadEnvFile(process.env.ENV_FILE);
  const app = await createServer();
  const port = Number(process.env.PORT || 8767);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  app.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`EduEthos accounts listening on ${process.env.HOST || '127.0.0.1'}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
