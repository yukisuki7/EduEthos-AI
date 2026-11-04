import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';
const docs = JSON.parse(await readFile(new URL('../worker/documents.json', import.meta.url)));
const retriever = createRetriever(docs);
const source = retriever.search('本课程有多少学分和学时？')[0];
assert.ok(source);
let calls = 0;
const completion = raw => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(raw) } }] }));
const good = { supported: true, paragraphs: [{ text: '课程信息以教学大纲为准。', citations: [1] }], bullets: [], value: { text: '', citations: [] }, followups: [] };
let mode = 'ok';
const api = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (url, init) => {
  // Match the deployed Worker constraint that Node's standard fetch accepts.
  // https://developers.cloudflare.com/workers/runtime-apis/request/#constructor
  if (init.redirect === 'error') throw new TypeError('Workers does not implement redirect:error');
  assert.equal(init.redirect, 'manual', 'Never forward model credentials through redirects');
  calls++;
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  const body = JSON.parse(init.body);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.messages.length, 2);
  assert.ok(body.messages[0].content.includes('不可信数据'));
  assert.ok(JSON.parse(body.messages[1].content).references.every(s => s.id && s.location));
  if (mode === 'auth') return new Response('upstream private error details', { status: 401 });
  if (mode === 'timeout') throw new DOMException('private timeout details', 'TimeoutError');
  if (mode === 'bad-citation') return completion({ ...good, paragraphs: [{ text: 'wrong', citations: ['invented-id'] }] });
  if (mode === 'blank') return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: ' ' } }] }));
  if (mode === 'truncated') return new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
  return completion(good);
} });
const env = { DEEPSEEK_API_KEY: 'test-only-not-a-real-key' };
const request = (body = { question: '本课程有多少学分和学时？' }, options = {}) => new Request('https://course.example/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'test-user', ...options.headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
let r = await api(new Request('https://course.example/api/health'), {});
assert.equal((await r.json()).configured, false);
r = await api(new Request('https://course.example/api/health'), env);
assert.equal((await r.json()).requiresSignIn, true);
r = await api(new Request('https://course.example/api/chat', { method: 'POST' }), env);
assert.equal(r.status, 401); assert.equal(calls, 0);
r = await api(request({ question: '本课程有多少学分和学时？' }), {});
let data = await r.json(); assert.equal(data.answer.mode, 'retrieval'); assert.ok(data.sources.length); assert.equal(calls, 0);
r = await api(request({ question: '今天的天气如何？' }), env);
data = await r.json(); assert.equal(data.answer.supported, false); assert.deepEqual(data.sources, []); assert.equal(calls, 0);
r = await api(request({}, { headers: { origin: 'https://evil.example' } }), env); assert.equal(r.status, 403);
r = await api(request({ question: 'x'.repeat(1001) }), env); assert.equal(r.status, 400);
r = await api(request('not-json'), env); assert.equal(r.status, 400);
r = await api(request('x'.repeat(40001)), env); assert.equal(r.status, 413);
const maxHistory = Array.from({ length: 4 }, () => ({ question: '课'.repeat(1000), answer: '答'.repeat(1600) }));
r = await api(request({ question: '本课程有多少学分和学时？', history: maxHistory }), {});
assert.equal(r.status, 200, 'valid UTF-8 history must fit the bounded body allowance');
r = await api(request(), env); data = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); assert.equal(data.answer.mode, 'model');
assert.deepEqual(data.answer.sourceIds, [source.id]); assert.equal(data.sources[0].text, source.text);
// A redirect must stop after one request without following the Location or retrying.
let redirectCalls = 0;
const redirectApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  redirectCalls++; assert.equal(init.redirect, 'manual');
  return new Response('private redirect body', { status: 307, headers: { location: 'https://untrusted.example/' } });
} });
const redirected = await redirectApi(request(), env);
assert.equal(redirected.status, 502);
const redirectData = await redirected.json();
assert.equal(redirectData.code, 'model_redirect');
assert.equal(redirectCalls, 1);
assert.ok(!JSON.stringify(redirectData).includes('private') && !JSON.stringify(redirectData).includes('untrusted'));
for (const [caseName, status, code] of [['bad-citation', 502, 'invalid_model_output'], ['blank', 502, 'incomplete_model_output'],
  ['truncated', 502, 'incomplete_model_output'], ['auth', 503, 'model_credentials'], ['timeout', 504, 'model_timeout']]) {
  mode = caseName;
  r = await api(request(), env); data = await r.json();
  assert.equal(r.status, status, caseName); assert.equal(data.code, code);
  assert.ok(!JSON.stringify(data).includes('private'));
}
r = await api(request(), env); assert.equal(r.status, 429, 'per-user request limit');
const built = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(built).toString('base64'));
assert.equal(typeof worker.fetch, 'function');
for (const path of ['/', '/app.js', '/styles.css', '/vendor/alpine.min.js']) {
  r = await worker.fetch(new Request('https://course.example' + path), {}); assert.equal(r.status, 200, path);
}
for (const path of ['/.env.local', '/worker/documents.json', '/knowledge-base/sources.json', '/.openai/hosting.json']) {
  r = await worker.fetch(new Request('https://course.example' + path), {}); assert.equal(r.status, 404, path);
}
assert.ok(!built.includes('REDACTED_PHONE') && !built.includes('REDACTED_EMAIL'));
assert.ok(!built.includes('E:\\\\新建文件夹'));
console.log('Worker checks passed: retrieval, auth, real API contract, body limits, citations, failure handling, throttling, private-file isolation and standalone build.');
