import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApi, normalizeModelOutput } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';

const docs = JSON.parse(await readFile(new URL('../worker/documents.json', import.meta.url)));
const retriever = createRetriever(docs);
const emptyRetriever = { search: () => [] };
const modelEnv = { DEEPSEEK_API_KEY: 'fixture-only' };
const request = (question, history = []) => new Request('https://course.example/api/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'teaching-test' },
  body: JSON.stringify({ question, history }),
});
const completion = answer => new Response(JSON.stringify({ choices: [
  { finish_reason: 'stop', message: { content: JSON.stringify(answer) } },
] }));
const answer = (paragraphs, value = { text: '', citations: [] }) => ({
  supported: true, paragraphs, bullets: [], value, followups: [],
});
const general = text => ({ kind: 'general', text, citations: [] });

// An automatically enabled, concise extension must be supported by a matching
// syllabus passage that explicitly describes a 思政融入点.
let teachingPrompt;
let systemPrompt;
const automaticApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const messages = JSON.parse(init.body).messages;
  systemPrompt = messages[0].content;
  teachingPrompt = JSON.parse(messages[1].content);
  assert.match(systemPrompt, /紧接原理说明补充启发/);
  assert.match(systemPrompt, /value\.text直接写补充正文，不加标题、标签、资料说明/);
  assert.match(systemPrompt, /不要照抄或换词搬运案例/);
  assert.match(systemPrompt, /同属一个章节不等于直接相关/);
  assert.match(systemPrompt, /只问Cache原理时，不突然转到航天黑匣子、事故分析或冗余备份/);
  const policy = teachingPrompt.answerPolicy;
  assert.equal(policy.teachingMode, 'auto');
  assert.equal(policy.allowTeaching, true);
  assert.ok(policy.teachingCandidates.length > 0);
  const candidate = policy.teachingCandidates[0];
  assert.match(candidate.point, /存储芯片|自主创新/);
  return completion(answer([
    general('Cache 利用局部性减少处理器等待主存的次数。'),
  ], { text: 'Cache 设计要协调高速存储和系统结构，也能联系到国内存储芯片的发展，理解自主创新的重要性。', citations: [candidate.citation] }));
} });
const automaticResponse = await automaticApi(request('为什么需要Cache？'), modelEnv);
assert.equal(automaticResponse.status, 200);
const automatic = await automaticResponse.json();
assert.equal(automatic.answer.basis, 'mixed');
assert.equal(automatic.answer.valueTitle, '课程思政 · 相关延伸');
assert.equal(automatic.answer.sections.find(section => section.kind === 'general').paragraphs.length, 1);
assert.equal(automatic.answer.value.length <= 120, true);
assert.ok(automatic.sources.some(source => source.id === automatic.answer.sourceIds[0]));

// The model may decide that the connection feels forced. Then the core answer
// remains valid and no empty extension card is created.
const omittedApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  const policy = JSON.parse(JSON.parse(init.body).messages[1].content).answerPolicy;
  assert.equal(policy.teachingMode, 'auto');
  return completion(answer([general('Cache 利用局部性提高平均访存效率。') ]));
} });
const omittedResponse = await omittedApi(request('Cache命中率代表什么？'), modelEnv);
assert.equal(omittedResponse.status, 200);
const omitted = await omittedResponse.json();
assert.equal(omitted.answer.basis, 'general');
assert.equal(omitted.answer.value, '');
assert.deepEqual(omitted.answer.sourceIds, []);

// A knowledge-only source, a technical question without matching syllabus
// passages, and a wrong-topic marker must not produce a 思政 extension.
const noHitApi = createApi({ retriever: emptyRetriever, knowledgeCount: 0, fetchImpl: async (_url, init) => {
  const policy = JSON.parse(JSON.parse(init.body).messages[1].content).answerPolicy;
  assert.equal(policy.teachingMode, 'off');
  assert.equal(policy.allowTeaching, false);
  return completion(answer([general('布斯乘法算法通过加减和移位实现有符号乘法。')], {
    text: '项目申报提到科技自立自强。', citations: [1],
  }));
} });
const noHitResponse = await noHitApi(request('布斯乘法算法如何工作？'), modelEnv);
assert.equal(noHitResponse.status, 200);
const noHit = await noHitResponse.json();
assert.equal(noHit.answer.value, '');
assert.deepEqual(noHit.answer.sourceIds, []);

let mismatchCalls = 0;
const mismatchApi = createApi({ retriever: { search: () => [{
  id: 'wrong-topic', title: '运算方法', section: 'ALU', text: '课程思政融入点：严谨治学。',
  sourceId: 'syllabus-2024',
}] }, knowledgeCount: 1, fetchImpl: async (_url, init) => {
  mismatchCalls++;
  const policy = JSON.parse(JSON.parse(init.body).messages[1].content).answerPolicy;
  assert.equal(policy.teachingMode, 'off');
  assert.deepEqual(policy.teachingCandidates, []);
  return completion(answer([general('Cache 利用局部性提升性能。')], {
    text: '培养严谨治学精神。', citations: [1],
  }));
} });
const mismatchResponse = await mismatchApi(request('Cache如何提升性能？'), modelEnv);
assert.equal(mismatchResponse.status, 200);
assert.equal((await mismatchResponse.json()).answer.value, '');
assert.equal(mismatchCalls, 1, 'the model still answers the technical question, without a mismatched extension');

// The user can turn it off for one question. A short follow-up inherits the
// Cache topic, so an unrelated prior answer cannot lend a 思政 citation.
let closePolicy;
const closeApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  closePolicy = JSON.parse(JSON.parse(init.body).messages[1].content).answerPolicy;
  return completion(answer([general('Cache 将近期或邻近数据保存在更快的存储中。') ]));
} });
const closeResponse = await closeApi(request('为什么需要Cache？不要加思政内容。'), modelEnv);
assert.equal(closeResponse.status, 200);
assert.equal(closePolicy.teachingMode, 'off');
assert.equal(closePolicy.allowTeaching, false);
assert.equal((await closeResponse.json()).answer.value, '');

let followUpPolicy;
const followUpApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
  followUpPolicy = JSON.parse(JSON.parse(init.body).messages[1].content).answerPolicy;
  return completion(answer([general('命中率是命中请求与总请求数之比。') ]));
} });
const followUpResponse = await followUpApi(request('为什么呢？', [
  { question: '为什么需要Cache？', answer: 'Cache 利用访问局部性。' },
]), modelEnv);
assert.equal(followUpResponse.status, 200);
assert.equal(followUpPolicy.teachingMode, 'auto');
assert.ok(followUpPolicy.teachingCandidates.length > 0);

// Automatically generated prose with an out-of-scope, nonexistent, or overly
// long citation is dropped without invalidating the useful technical answer.
const raw = answer([general('技术说明')]);
const autoPolicy = { allowTeaching: true, teachingMode: 'auto', teachingCitations: [1], teachingMaxLength: 120 };
const matchingSource = retriever.search('为什么需要Cache？')[0];
for (const value of [
  { text: '无据结论。', citations: [2] },
  { text: '无引用说明。', citations: [] },
  { text: '过长延伸。'.repeat(30), citations: [1] },
]) {
  const result = normalizeModelOutput({ ...raw, value }, [matchingSource], autoPolicy);
  assert.equal(result.answer.value, '');
  assert.deepEqual(result.answer.sourceIds, []);
}

// Explicit user requests preserve the existing path, with a real citation.
const explicit = normalizeModelOutput({
  ...raw,
  value: { text: '结合存储芯片发展讨论自主创新。', citations: [1] },
}, [matchingSource], {
  allowTeaching: true, teachingMode: 'requested', teachingCitations: [1], teachingMaxLength: 350,
});
assert.equal(explicit.answer.value, '结合存储芯片发展讨论自主创新。');
assert.deepEqual(explicit.answer.sourceIds, [matchingSource.id]);

for (const [question, topic] of [['Cache如何提高存储可靠性？','memory'], ['定点浮点运算为什么要严谨？','arithmetic'], ['指令格式为什么需要无歧义？','instruction'], ['CPU各部件如何协同？','cpu']]) {
  const scopedApi = createApi({ retriever, knowledgeCount: docs.length, fetchImpl: async (_url, init) => {
    const prompt = JSON.parse(JSON.parse(init.body).messages[1].content);
    const hits = retriever.search(question);
    assert.equal(prompt.answerPolicy.teachingMode, 'auto');
    assert.ok(prompt.answerPolicy.teachingCandidates.some(candidate => {
      const source = hits[candidate.citation - 1];
      return source.sourceId === 'application-2025' && source.teachingTopic === topic && candidate.point === source.teachingPoint;
    }), `missing PDF topic direction: ${topic}`);
    return completion(answer([general('这里先解释技术原理。')]));
  } });
  assert.equal((await scopedApi(request(question), modelEnv)).status, 200);
}
console.log('Auto-teaching checks passed: topic gating, opt-out, citation bounds, and all four PDF technical directions.');
