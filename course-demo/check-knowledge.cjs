const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, 'dist/data.js'), 'utf8'), sandbox);
const { chapters, docs } = sandbox.window.COURSE_DATA;
const answer = sandbox.window.answerQuestion;
assert.equal(chapters.length, 6);
assert.deepEqual(Array.from(chapters, c => c.id), ['overview','data','memory','instructions','cpu','io']);
assert.ok(chapters.every(c => c.questions.length === 3));
assert.ok(docs.length <= 12);
assert.ok(docs.every(d => d.enabled === true && d.custom === false && d.text.length > 60));

const enabledIds = new Set(docs.filter(d => d.enabled).map(d => d.id));
for (const q of chapters.flatMap(c => c.questions)) {
  const result = answer(q, { docs, settings: { valuesEnabled: true } });
  assert.equal(result.supported, true, `expected preset support for: ${q}`);
  assert.equal(result.label, '预置讲义回答');
  assert.ok(result.sourceIds.length > 0);
  assert.ok(result.sourceIds.every(id => enabledIds.has(id)));
  assert.ok(result.paragraphs.length > 0);
  for (const followup of result.followups) {
    const next = answer(followup, { docs, lastTopic: result.topic, settings: { mode: 'extended', valuesEnabled: true } });
    assert.equal(next.supported, true, `generated follow-up must be supported: ${followup}`);
  }
}

for (const q of ['CPU售价是多少？', 'Cache 为什么这么贵，今天在哪里买？', '帮我写CPU论文', '今天的天气如何？', '给我写一个网页']) {
  const result = answer(q, { docs });
  assert.equal(result.supported, false, `must not overclaim support for: ${q}`);
  assert.equal(result.label, '当前演示未覆盖');
  assert.deepEqual(Array.from(result.sourceIds), []);
}

const cacheDocs = docs.filter(d => d.chapterId === 'memory');
assert.equal(answer('那没命中呢？', { docs: cacheDocs, lastTopic: 'cache' }).supported, true);
assert.equal(answer('那没命中呢？', { docs: cacheDocs, lastTopic: 'binary' }).supported, false);
assert.ok(answer('为什么需要 Cache？', { docs: cacheDocs, settings: { valuesEnabled: false } }).value, 'legacy off flag cannot disable teaching');
assert.ok(answer('为什么需要 Cache？', { docs: cacheDocs, settings: { valuesEnabled: true } }).value);
assert.equal(answer('为什么需要 Cache？', { docs: cacheDocs.filter(d => d.id !== 'doc-memory-2') }).supported, false);
const miss = answer('Cache 未命中后会发生什么？', { docs: cacheDocs });
assert.equal(miss.topic, 'cache-miss');
assert.equal(answer('那没命中呢？', { docs: cacheDocs, lastTopic: miss.topic }).topic, 'cache-miss');
const extended = answer('为什么需要 Cache？', { docs: cacheDocs, settings: { mode: 'extended', valuesEnabled: true } });
assert.equal(extended.value,answer('为什么需要 Cache？', {docs:cacheDocs}).value,'legacy mode must not change fixed integration');
const dma = answer('DMA 为什么能减轻 CPU 负担？', {docs,settings:{valuesEnabled:true}});
assert.match(dma.valueTitle,/课程思政.*责任/);
assert.match(dma.value,/分工协作不等于责任转移/);
assert.equal(dma.valueRevision,2);
assert.match(answer('DMA 为什么能减轻 CPU 负担？',{docs,settings:{valuesEnabled:false}}).valueTitle,/课程思政/);
assert.ok(answer('为什么需要 Cache？', { docs: cacheDocs, settings: { mode: 'extended', valuesEnabled: false } }).value);

console.log('knowledge checks passed');
