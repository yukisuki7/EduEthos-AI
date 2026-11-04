import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi, normalizeModelOutput } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';

const docs = JSON.parse(await readFile(new URL('../worker/documents.json', import.meta.url)));
const retriever = createRetriever(docs);
const syllabusHit = retriever.search('本课程有多少学分和学时？')[0];
assert.ok(syllabusHit, 'fixture needs an actual course source for citation-scope checks');
const cacheSource = retriever.search('为什么需要 Cache？')[0];
assert.ok(cacheSource, 'fixture needs an actual Cache syllabus source');
const emptyRetriever = { search: () => [] };
const modelEnv = { DEEPSEEK_API_KEY: 'fixture-only' };
const request = (question, history = []) => new Request('https://course.example/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'policy-test' },
  body: JSON.stringify({ question, history }),
});
const completion = answer => new Response(JSON.stringify({ choices: [{
  finish_reason: 'stop', message: { content: JSON.stringify(answer) },
}] }));
const statement = (kind, text, citations = []) => ({ kind, text, citations });
const output = (paragraphs, extra = {}) => ({
  supported: true, paragraphs, bullets: [], value: { text: '', citations: [] }, followups: [], ...extra,
});

// General knowledge can answer Computer Architecture concepts without pretending
// that a syllabus fragment is evidence for a textbook explanation.
let activeAnswer = output([
  statement('general', 'Cache 用小而快的存储保存近期或邻近访问的数据，减少访问较慢主存的次数。'),
  statement('general', '缓存效果依赖局部性；命中可缩短访问时间，未命中则仍需访问主存并承担额外开销。'),
]);
let modelCalls = 0;
let lastPrompt;
const generalApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  modelCalls++;
  const payload = JSON.parse(init.body);
  lastPrompt = JSON.parse(payload.messages[1].content);
  if (lastPrompt.question.includes('局限')) activeAnswer = output([
    statement('general', 'Cache 的容量受芯片面积、成本和功耗限制，通常远小于主存，不能代替主存。'),
    statement('general', '命中率有限；冲突、容量或冷启动导致未命中时，等待主存会带来额外延迟。'),
  ]);
  else if (lastPrompt.question.includes('区别')) activeAnswer = output([
    statement('general', 'Cache 容量小、速度快，通常由 SRAM 构成；主存容量大、成本低，通常由 DRAM 构成。'),
    statement('general', 'Cache 保存主存数据的副本，处理器优先访问 Cache，未命中时再访问主存并更新副本。'),
  ]);
  else activeAnswer = output([
    statement('general', 'Cache 用小而快的存储保存近期或邻近访问的数据，减少访问较慢主存的次数。'),
    statement('general', '缓存效果依赖局部性；命中可缩短访问时间，未命中则仍需访问主存并承担额外开销。'),
  ]);
  return completion(activeAnswer);
} });
for (const question of [
  '为什么需要 Cache？',
  'cache 的局限性',
  '为什么需要 Cache？它和主存有什么区别？',
]) {
  const response = await generalApi(request(question), modelEnv);
  assert.equal(response.status, 200, question);
  const data = await response.json();
  assert.equal(data.answer.supported, true, question);
  assert.equal(data.answer.basis, 'general', question);
  assert.ok(data.answer.sections.some(s => s.kind === 'general' && s.paragraphs.length), question);
  assert.deepEqual(data.answer.sourceIds, [], 'syllabus fragments must not be cited as Cache theory');
  assert.deepEqual(data.sources, []);
  const answerText = [...data.answer.paragraphs, ...data.answer.bullets].join('');
  if (question.includes('局限性')) assert.match(answerText, /容量|未命中/);
  if (question.includes('区别')) assert.match(answerText, /SRAM|DRAM|容量/);
}
assert.equal(modelCalls, 3);
assert.equal(lastPrompt.answerPolicy.allowGeneral, true);

// A mixed answer cites only the actual retrieved Cache source, not a course-credit source.
const mixedAnswer = output([
  statement('general', 'Cache 用于弥合处理器与主存之间的速度差距。'),
  statement('course', '教学大纲将 Cache 原理和地址映像列为重点。', [1]),
], { bullets: [statement('general', '命中减少平均访存时间，未命中会增加等待。')] });
const mixedApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  const prompt = JSON.parse(payload.messages[1].content);
  assert.equal(prompt.answerPolicy.allowGeneral, true);
  assert.equal(prompt.references[0].title, cacheSource.title);
  assert.equal(prompt.references[0].location, cacheSource.section);
  return completion(mixedAnswer);
} });
const mixedResponse = await mixedApi(request('为什么需要 Cache？'), modelEnv);
assert.equal(mixedResponse.status, 200, JSON.stringify(await mixedResponse.clone().json()));
const mixed = await mixedResponse.json();
assert.equal(mixed.answer.basis, 'mixed');
assert.deepEqual(mixed.answer.sourceIds, [cacheSource.id]);
assert.deepEqual(mixed.sources.map(s => s.id), [cacheSource.id]);
assert.equal(mixed.answer.sections.find(s => s.kind === 'general').bullets.length, 1);
assert.equal(mixed.answer.sections.find(s => s.kind === 'course').paragraphs.length, 1);

// Statements cannot put citations on general knowledge or omit citations on course claims.
assert.throws(() => normalizeModelOutput(output([
  statement('general', '通用 Cache 原理。', [1]),
]), [syllabusHit]), /invalid_model_output|引用/);
assert.throws(() => normalizeModelOutput(output([
  statement('course', '本课程共 3 学分。'),
]), [syllabusHit]), /invalid_model_output|引用/);
assert.throws(() => normalizeModelOutput(output([
  statement('general', '通用原理。'),
]), [], { allowGeneral: false }), /invalid_model_output|引用/);

// Course policy questions must not be answered by smuggling in uncited general text.
let observedPolicy;
const policyApi = createApi({ retriever: emptyRetriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  observedPolicy = JSON.parse(payload.messages[1].content);
  activeAnswer = output([
    statement('notice', '当前提供的课程资料没有学分信息，请核对教学大纲。'),
  ], { supported: false });
  return completion(activeAnswer);
} });
const policyResponse = await policyApi(request('本课程有多少学分？'), modelEnv);
assert.equal(policyResponse.status, 200);
assert.equal(observedPolicy, undefined, 'a course rule with no matching sources should not spend a model request');
const policyAnswer = await policyResponse.json();
assert.equal(policyAnswer.answer.supported, false);
assert.equal(policyAnswer.answer.basis, 'insufficient');
assert.ok(policyAnswer.answer.sections.some(section => section.kind === 'notice'));
assert.deepEqual(policyAnswer.answer.sourceIds, []);

// With course sources present, a made-up general answer cannot bypass the policy boundary.
let capturedRulePolicy;
const policyHitApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  capturedRulePolicy = JSON.parse(payload.messages[1].content).answerPolicy;
  return completion(output([statement('general', '课程共有 8 学分。')]));
} });
const policyHitResponse = await policyHitApi(request('本课程有多少学分？'), modelEnv);
assert.equal(capturedRulePolicy.allowGeneral, false);
assert.equal(policyHitResponse.status, 502);
assert.equal((await policyHitResponse.json()).code, 'invalid_model_output');

// A knowledge question with no matching course material still gets a general answer.
const noHitApi = createApi({ retriever: emptyRetriever, knowledgeCount: 0, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  assert.equal(JSON.parse(payload.messages[1].content).answerPolicy.allowGeneral, true);
  return completion(output([statement('general', '布斯算法用加减与移位实现有符号二进制乘法。')]));
} });
const noHitResponse = await noHitApi(request('布斯乘法算法是如何工作的？'), modelEnv);
assert.equal(noHitResponse.status, 200);
assert.equal((await noHitResponse.json()).answer.basis, 'general');

// Keep the existing off-topic boundary so unrelated questions do not trigger model use.
let offTopicCalls = 0;
const offTopicApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async () => {
  offTopicCalls++;
  return completion(output([statement('general', '不应被调用。')]));
} });
const offTopicResponse = await offTopicApi(request('今天的天气如何？'), modelEnv);
const offTopic = await offTopicResponse.json();
assert.equal(offTopicResponse.status, 200);
assert.equal(offTopic.answer.supported, false);
assert.equal(offTopicCalls, 0);
const offTopicFollowupResponse = await offTopicApi(request('为什么呢？', [
  { question: '今天的天气如何？', answer: '无法帮助处理离题问题。' },
]), modelEnv);
assert.equal(offTopicFollowupResponse.status, 200);
assert.equal((await offTopicFollowupResponse.json()).answer.supported, false);
assert.equal(offTopicCalls, 0, 'a short follow-up must not bypass the off-topic boundary through history');

// Legacy model output stays readable as course-grounded when it carries citations.
const legacy = normalizeModelOutput({
  supported: true,
  paragraphs: [{ text: '旧版答案。', citations: [1] }],
  bullets: [], value: { text: '', citations: [] }, followups: [],
}, [syllabusHit]);
assert.equal(legacy.answer.basis, 'course');
assert.deepEqual(legacy.answer.sections[0], { kind: 'course', paragraphs: ['旧版答案。'], bullets: [] });

// Mentioning a textbook as the learning resource does not turn a mechanism
// question into a course-book recommendation question.
let bookConceptPolicy;
const bookConceptApi = createApi({ retriever: emptyRetriever, knowledgeCount: 0, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  bookConceptPolicy = JSON.parse(payload.messages[1].content).answerPolicy;
  return completion(output([statement('general', 'Cache利用局部性保存近期或邻近访问的数据。')]));
} });
const bookConceptResponse = await bookConceptApi(request('教材里为什么要使用Cache？'), modelEnv);
assert.equal(bookConceptResponse.status, 200);
assert.equal(bookConceptPolicy.allowGeneral, true);

// Requests for the current course's assigned or recommended book remain
// course-specific and cannot be answered from generic model knowledge.
let bookRuleCalls = 0;
const bookRuleApi = createApi({ retriever: emptyRetriever, knowledgeCount: 0, fetchImpl: async () => {
  bookRuleCalls++;
  return completion(output([statement('general', '本课程使用《虚构教材》。')]));
} });
const bookRuleResponse = await bookRuleApi(request('本课程推荐的教材是哪本？'), modelEnv);
assert.equal(bookRuleResponse.status, 200);
assert.equal((await bookRuleResponse.json()).answer.basis, 'insufficient');
assert.equal(bookRuleCalls, 0);

// Teaching content must be tied to an explicit teaching request and a source.
const withoutTeaching = normalizeModelOutput({
  supported: true,
  paragraphs: [statement('general', 'Cache 的一般原理。')],
  bullets: [], value: { text: '加一段课程思政建议。', citations: [1] }, followups: [],
}, [syllabusHit], { allowGeneral: true, allowTeaching: false });
assert.equal(withoutTeaching.answer.value, '', 'Unrequested teaching suggestions should be dropped.');
const withTeaching = normalizeModelOutput({
  supported: true,
  paragraphs: [statement('course', '大纲包含Cache工作原理。', [1])],
  bullets: [], value: { text: '可用时延差异演示存储层次设计。', citations: [1] }, followups: [],
}, [cacheSource], { allowGeneral: false, allowTeaching: true });
assert.equal(withTeaching.answer.value, '可用时延差异演示存储层次设计。');
assert.deepEqual(withTeaching.answer.sourceIds, [cacheSource.id]);

// Explicit teaching requests enable a cited value; ordinary Cache questions do not.
const teachingSources = retriever.search('请用Cache举例说明教Cache时怎样融入课程思政？');
const teachingApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const payload = JSON.parse(init.body);
  const prompt = JSON.parse(payload.messages[1].content);
  assert.equal(prompt.answerPolicy.allowTeaching, true);
  return completion(output([
    statement('course', '课程申报资料提出将Cache原理与课程思政内容结合。', [1]),
  ], { value: { text: '可从国产高速存储器研发案例讨论系统优化与自主创新。', citations: [2] } }));
} });
const teachingResponse = await teachingApi(request('请用Cache举例说明教Cache时怎样融入课程思政？'), modelEnv);
assert.equal(teachingResponse.status, 200);
const teachingAnswer = await teachingResponse.json();
assert.equal(teachingAnswer.answer.value, '可从国产高速存储器研发案例讨论系统优化与自主创新。');
assert.deepEqual(teachingAnswer.answer.sourceIds, [teachingSources[0].id, teachingSources[1].id]);

console.log('Answer policy checks passed: general and mixed concept answers, citation scopes, course-policy boundary, no-hit concepts, off-topic guard, legacy output, and teaching-suggestion scope.');
