import { copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await copyFile(new URL('../knowledge-base/runtime/generated/documents.json', root), new URL('worker/documents.json', root));
await copyFile(new URL('../knowledge-base/runtime/retrieval.mjs', root), new URL('worker/retrieval.mjs', root));
console.log('Copied privacy-filtered reference chunks and retrieval module into the deployment source.');
