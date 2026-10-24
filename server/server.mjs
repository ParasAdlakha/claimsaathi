// ClaimSaathi server: node:http, no framework. Stateless: the browser holds the policy and
// the claim and sends them with each request, so nothing personal is stored on the server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, aiEnabled } from '../core/config.mjs';
import { makeHandlers } from '../core/handlers.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sample = {
  policy: JSON.parse(readFileSync(join(root, 'data/sample/policy.json'), 'utf8')),
  bill: JSON.parse(readFileSync(join(root, 'data/sample/bill.json'), 'utf8')),
  letter: readFileSync(join(root, 'data/sample/settlement-letter.txt'), 'utf8'),
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > config.maxUploadBytes * 1.4) throw Object.assign(new Error('Upload too large (8 MB max)'), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function pdfText(base64) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(base64, 'base64')), useSystemFonts: true }).promise;
  let text = '';
  for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    let lastY = null;
    for (const it of c.items) { if (lastY !== null && Math.abs(it.transform[5] - lastY) > 4) text += '\n'; text += it.str + ' '; lastY = it.transform[5]; }
    text += '\n\n';
  }
  return text;
}

const routes = makeHandlers(sample, { pdfText });

async function serveStatic(res, path) {
  const base = path.startsWith('/docs/') ? root : join(root, 'public');
  const rel = path.startsWith('/docs/') ? path : path === '/' ? '/index.html' : path;
  const file = normalize(join(base, decodeURIComponent(rel)));
  if (!file.startsWith(normalize(base))) return send(res, 403, { error: 'forbidden' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return req.method === 'GET' ? serveStatic(res, url.pathname) : send(res, 404, { error: 'not found' });
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await handler(body));
  } catch (e) {
    console.error(req.method, url.pathname, e.message);
    send(res, e.status || 500, { error: e.message });
  }
});

server.listen(config.port, () => console.log(`ClaimSaathi on http://localhost:${config.port}  (AI ${aiEnabled() ? 'on: ' + config.textModel : 'off: sample + offline mode'})`));
