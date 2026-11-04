// One-shot live verification. Credentials arrive on hidden stdin and remain in memory.
import { createApi } from '../worker/api.mjs';
import { createRetriever } from '../worker/retrieval.mjs';
import { readFile } from 'node:fs/promises';
const docs = JSON.parse(await readFile(new URL('../worker/documents.json', import.meta.url)));
if (process.stdin.isTTY) process.stdin.setRawMode(true);
console.log('Ready for live-check JSON on stdin (input is hidden).');
const config = await new Promise((resolve, reject) => {
  let text = '';
  function onData(buffer) {
    text += buffer.toString();
    if (text.includes('\u0003')) process.exit(130);
    if (!/[\r\n]/.test(text)) return;
    process.stdin.off('data', onData);
    process.stdin.pause();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    try { resolve(JSON.parse(text.trim())); } catch { reject(new Error('Invalid input')); }
  }
  process.stdin.on('data', onData);
});
const api = createApi({ retriever: createRetriever(docs), knowledgeCount: docs.length, fetchImpl: async (...args) => {
  const response = await fetch(...args);
  const clone = response.clone();
  try {
    const content = (await clone.json()).choices?.[0]?.message?.content;
    if (content?.trim()) {
      try { JSON.parse(content); } catch {
        console.log(JSON.stringify({ diagnostic: 'invalid-json', first: content.slice(0, 500), last: content.slice(-500) }));
      }
    }
  } catch { /* API errors are reported without upstream content. */ }
  return response;
} });
let failures = 0;
for (const question of (config.questions || ['这门课有多少学分、多少学时？', '存储系统到底安排多少学时？', '如何将航天文化融入计算机组成原理课程思政？'])) {
  const response = await api(new Request('https://live-check.invalid/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'live-check' },
    body: JSON.stringify({ question, history: [] }),
  }), config);
  const data = await response.json();
  if (!response.ok || data.answer?.mode !== 'model') failures++;
  console.log(JSON.stringify({ question, status: response.status, mode: data.answer?.mode, model: data.model,
    supported: data.answer?.supported, paragraphs: data.answer?.paragraphs, error: data.error,
    sources: data.sources?.map(s => ({ id: s.id, location: s.section })) }));
}
process.exitCode = failures ? 1 : 0;
