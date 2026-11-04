import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRetriever, tokenFrequencies } from './retrieval.mjs';
const docs = JSON.parse(await readFile(new URL('./generated/documents.json', import.meta.url)));
const search = createRetriever(docs).search;
const syllabus = docs.filter(d => d.sourceId === 'syllabus-2024');
const application = docs.filter(d => d.sourceId === 'application-2025');
assert.equal(syllabus.length, 6);
assert.ok(syllabus.every(d => /^syllabus-2024-t02-r00[2-7]$/.test(d.id)));
assert.ok(application.length > 0);
assert.ok(application.every(d => /^application-2025-page(?:05|06|07|09|10|11)(?:-|$)/.test(d.id)));
assert.ok(docs.every(d => d.id && d.locator && d.sourceFile && d.contentRole));
assert.doesNotMatch(JSON.stringify(docs), /REDACTED_PHONE|REDACTED_EMAIL|课程团队基本信息|2-2 本课程|4．课程建设工作计划|考核形式及成绩占比|期末闭卷考试|指定教材/);
const rows = application.filter(d => d.teachingTopic);
assert.deepEqual(rows.map(d => d.teachingTopic).sort(), ['arithmetic','cpu','instruction','memory','system']);
for (const row of rows) {
  assert.ok(row.teachingPoint.length > 20 && row.text.includes(row.teachingPoint));
  assert.doesNotMatch(row.teachingPoint, /学生能独立|错误率降低|显著增强/);
}
for (const [question, topic] of [
 ['Cache如何提高存储可靠性？','memory'], ['定点浮点运算为什么要严谨？','arithmetic'],
 ['指令格式为什么需要无歧义？','instruction'], ['CPU各部件如何协同？','cpu'],
]) {
 const found = search(question);
 assert.ok(found.some(d => d.sourceId === 'application-2025' && d.teachingTopic === topic && d.teachingPoint));
 assert.ok(found.length <= 6 && found.every(d => d.text.length <= 1500));
}
assert.ok(search('存储系统安排多少学时？').some(d => /课内12学时/.test(d.text)));
assert.ok(search('那没命中呢？', {history:['为什么需要Cache？']}).some(d => /Cache|存储/.test(d.text)));
for (const q of ['今天天气怎么样？','中国足球成绩怎么样','课程助教API密钥是什么','你好']) assert.deepEqual(search(q), []);
assert.equal(tokenFrequencies('Cache Cache Cache').get('cache'), 3);
console.log(`Scoped retrieval checks passed (${docs.length} chunks): table 2, PDF sections 3/5, five teaching topics and excluded administration content.`);
