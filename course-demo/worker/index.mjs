import { createApi } from './api.mjs';
import { createRetriever } from './retrieval.mjs';
import documents from './documents.json' with { type: 'json' };
import { assets } from './assets.mjs';

const api = createApi({ retriever: createRetriever(documents), knowledgeCount: documents.length });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env);
    const asset = assets[url.pathname];
    if (!asset || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.text, { headers: {
      'content-type': asset.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    } });
  },
};
