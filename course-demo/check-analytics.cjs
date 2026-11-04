const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'dist/analytics.js'), 'utf8'), sandbox);
const analytics = sandbox.window.CourseAnalytics;
const now = '2026-10-30T12:00:00.000Z';
const msg = (id, question, topic, createdAt, extra = {}) => ({ id, question, answer: { topic, supported: true }, authorRole: 'student', createdAt, ...extra });

// Empty input and the fixed category output shape.
const empty = analytics.build([], { range: 'all', now });
assert.equal(empty.total, 0);
assert.equal(empty.sessionCount, 0);
assert.equal(empty.unresolvedCount, 0);
assert.equal(empty.untimedCount, 0);
assert.equal(empty.legacyRoleCount, 0);
assert.equal(empty.questions.length, 0);
assert.equal(empty.categories.length, 7);
assert.ok(empty.categories.every(c => c.count === 0 && c.percent === 0));

const sessions = [
  { id:'s1', updatedAt: now, messages: [
    msg('m1', 'Cache 高速缓存 Cache 为什么需要？', 'cache', now),
    msg('m2', 'Cache 未命中后会发生什么？', 'cache-miss', '2026-10-29T10:00:00Z'),
    msg('m3', 'CPU 处理器主频如何影响性能？', 'frequency', '2026-10-25T08:00:00Z')
  ] },
  { id:'s2', messages: [
    msg('m4', '8 位补码能表示哪些整数？', 'binary', '2026-10-20T12:00:00Z'),
    msg('m5', 'Cache 高速缓存 Cache 为什么需要？', 'cache', '2026-10-30'),
    msg('m6', '今天的天气如何？', '', now, { answer: { topic:'', supported:false } }),
    msg('m7', '教师示例', 'dma', now, { authorRole:'teacher' }),
    msg('m8', 'seed sample', 'dma', now, { isDemo:true }),
    msg('m9', '旧版记录，只有时间 10:35', 'isa', undefined, { authorRole:undefined })
  ] },
  { id:'s3', updatedAt: now, messages: [
    msg('m1', '重复 id，不重复统计', 'binary', now),
    msg('m10', '总线有什么作用？', 'unknown-topic', now)
  ] }
];

const all = analytics.build(sessions, { range:'all', now });
assert.equal(all.total, 8);
assert.equal(all.sessionCount, 3);
assert.equal(all.unresolvedCount, 1);
assert.equal(all.untimedCount, 1);
assert.equal(all.legacyRoleCount, 1);
assert.equal(all.categories.find(c => c.id === 'memory').count, 3);
assert.equal(all.categories.find(c => c.id === 'cpu').count, 1);
assert.equal(all.categories.find(c => c.id === 'data').count, 1);
assert.equal(all.categories.find(c => c.id === 'io').count, 1); // unknown topic falls back to the question text
assert.equal(all.categories.find(c => c.id === 'other').count, 1);
assert.equal(all.categories.find(c => c.id === 'instructions').count, 1);
assert.equal(Math.round(all.categories.reduce((sum, c) => sum + c.percent, 0) * 10) / 10, 100);
assert.equal(all.questions.find(q => q.question.startsWith('Cache 高速缓存')).count, 2);
assert.equal(all.questions.find(q => q.question.startsWith('Cache 高速缓存')).categoryId, 'memory');
assert.equal(all.keywords.find(k => k.text === 'Cache').count, 3); // alias variants count once per message
assert.equal(all.keywords.find(k => k.text === 'CPU').count, 1); // CPU / 处理器 share one normalized term
assert.ok(all.keywords.every(k => k.size >= 14 && k.size <= 48));
assert.match(all.summary, /暂未解答/);
assert.equal(all.keywords[0].size,48);
assert.equal(all.keywords.at(-1).size,14);
for(const a of all.keywords)for(const b of all.keywords){
 if(a.count>b.count)assert(a.size>b.size,'larger count must produce larger type');
 if(a.count===b.count)assert.equal(a.size,b.size,'equal counts must keep equal type');
}

const last7 = analytics.build(sessions, { range:'7', now });
assert.equal(last7.total, 6);
assert.equal(last7.untimedCount, 1);
assert.equal(last7.legacyRoleCount, 0); // old undated records are excluded in date-filtered results
assert.equal(last7.sessionCount, 3);
assert.match(last7.summary, /另有 1 条旧记录缺少可用日期，未纳入本次范围/);
assert.doesNotMatch(last7.summary, /其中 1 条旧记录/);
const last30 = analytics.build(sessions, { range:'30', now });
assert.equal(last30.total, 7);
assert.equal(last30.untimedCount, 1);
assert.equal(last30.categories.find(c => c.id === 'data').count, 1);

const sampleA = analytics.sampleSessions(now);
const sampleB = analytics.sampleSessions(now);
assert.equal(sampleA.length, 36);
assert.notEqual(sampleA, sampleB);
assert.ok(sampleA.every(s => s.isSample && s.messages.length === 1));
assert.ok(sampleA.every(s => s.messages[0].authorRole === 'student' && s.messages[0].isDemo === false));
assert.ok(sampleA.every(s => /^\d{4}-\d\d-\d\dT/.test(s.messages[0].createdAt)));
assert.ok(new Set(sampleA.map(s => s.messages[0].createdAt.slice(0, 10))).size > 10);
assert.equal(analytics.build([], { range:'all', now }).total, 0); // samples are returned, never inserted into stored sessions
const sampled = analytics.build(sampleA, { range:'all', now });
assert.equal(sampled.total, 36);
assert.deepEqual(Array.from(sampled.categories, c => [c.id, c.count]), [['overview',2],['data',4],['memory',12],['instructions',3],['cpu',7],['io',8],['other',0]]);

// More than one alias for the same concept still increments at most once per message.
const keywordDedup = analytics.build([{ id:'kw', messages:[msg('kw1','CPU 处理器 CPU 中央处理器','frequency',now)] }], { range:'all', now });
assert.equal(keywordDedup.keywords.find(k => k.text === 'CPU').count, 1);
assert.equal(keywordDedup.keywords[0].size,30,'a single frequency does not imply a false contrast');

const manyQuestions = Array.from({ length: 25 }, (_, i) => msg(`many-${i}`, `question ${i}`, i % 2 ? 'binary' : 'dma', now));
const ranked = analytics.build([{ id:'many', messages:manyQuestions }], { range:'all', now });
assert.equal(ranked.questions.length, 25); // callers can category-filter before taking their display slice
assert.ok(ranked.questions.every(q => q.categoryId && q.categoryLabel));

const ioFallback = analytics.build([{ id:'fallback', messages:[msg('fallback1','DMA 怎样与 CPU 协调传送？','unknown-topic',now)] }], { range:'all', now });
assert.equal(ioFallback.categories.find(c => c.id === 'io').count, 1);
assert.equal(ioFallback.categories.find(c => c.id === 'cpu').count, 0);

console.log('analytics checks passed');
