import { readFile, writeFile, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const assetFiles = ['index.html', 'styles.css', 'app.js', 'data.js', 'analytics.js', 'report.js', 'vendor/alpine.min.js'];
const assets = {};
for (const path of assetFiles) {
  const type = path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript';
  assets['/' + path] = { text: await readFile(new URL('dist/' + path, root), 'utf8'), type: type + '; charset=utf-8' };
}
assets['/'] = assets['/index.html'];
const assetCode = 'export const assets = ' + JSON.stringify(assets) + ';\n';
await writeFile(new URL('worker/assets.mjs', root), assetCode);
const retrieval = (await readFile(new URL('worker/retrieval.mjs', root), 'utf8')).replace(/^export /gm, '');
const demoAuth = (await readFile(new URL('worker/demo-auth.mjs', root), 'utf8')).replace(/^export /gm, '');
const api = (await readFile(new URL('worker/api.mjs', root), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const docs = JSON.parse(await readFile(new URL('worker/documents.json', root), 'utf8'));
const entry = (await readFile(new URL('worker/index.mjs', root), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const manifest = JSON.parse(await readFile(new URL('.openai/hosting.json', root), 'utf8'));
if (manifest.static) throw new Error('Worker deployment cannot declare static output.');
await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/.openai/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root),
  `${retrieval}\n${demoAuth}\n${api}\nconst documents = ${JSON.stringify(docs)};\n${assetCode.replace('export ', '')}\n${entry}`);
await writeFile(new URL('dist/.openai/hosting.json', root), JSON.stringify(manifest, null, 2));
console.log(`Built standalone Worker with ${assetFiles.length} assets and ${docs.length} reference chunks.`);
