import http from 'node:http';
const root = new URL('../', import.meta.url);
try { process.loadEnvFile(new URL('.env.local', root)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { default: worker } = await import('../worker/index.mjs');
const port = Number(process.env.PORT || 8766);
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 40000) { res.writeHead(413); res.end('Payload too large'); return; } chunks.push(chunk); }
    const headers = { ...req.headers };
    // The local HTTP adapter does not trust browser-supplied Sites identity headers.
    delete headers['oai-authenticated-user-id']; delete headers['oai-authenticated-user-email'];
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await worker.fetch(request, { ...process.env, LOCAL_PREVIEW: 'true' });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Local preview unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
