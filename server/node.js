// Local dev server (also usable on any VPS): node server/node.js
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { initConfig } from './config.js';
import { openNodeDb } from './db-node.js';
import { handle } from './app.js';
import { cronTick } from './core.js';

try {
  for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const PORT = +process.env.PORT || 8787;
process.env.BASE_URL ||= `http://localhost:${PORT}`;
initConfig(process.env);
const db = await openNodeDb(process.env.DB_PATH || './data/notsuperx.db');
const WEB = new URL('../web/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

export const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  let out = await handle(request, process.env, db);
  if (!out) {
    let f = path.join(WEB, new URL(request.url).pathname);
    if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(WEB, 'index.html');
    out = new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } });
  }
  const headers = {}; out.headers.forEach((v, k) => { headers[k] = v; });
  if (out.headers.get('set-cookie')) headers['set-cookie'] = out.headers.get('set-cookie').replace('; Secure', '');
  res.writeHead(out.status, headers);
  res.end(Buffer.from(await out.arrayBuffer()));
});
server.listen(PORT, () => console.log(`notsuperx on http://localhost:${PORT}`));
setInterval(() => cronTick(db).catch((e) => console.error(e.message)), 60_000);
