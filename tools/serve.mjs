// Local preview server: serves the project folder, and accepts POST /save/<file>
// from tools/record.html to write demo clips into demo/media/.
// Usage: node tools/serve.mjs   →  http://localhost:4777/demo/
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, extname, normalize, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, 'demo', 'media');
const PORT = Number(process.env.PORT) || 4777;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname.startsWith('/save/')) {
      const name = basename(decodeURIComponent(url.pathname.slice(6)));
      if (!/^[\w-]+\.(mp4|webm|jpg)$/.test(name)) { res.writeHead(400).end('bad name'); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      await mkdir(MEDIA, { recursive: true });
      await writeFile(join(MEDIA, name), Buffer.concat(chunks));
      res.writeHead(200).end('ok'); return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/demo/case-study-cards.js') p = '/case-study-cards.js'; // the demo loads the real component file
    let file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    // support range requests so <video> can seek
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range && type.startsWith('video/')) {
      const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : data.length - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      res.end(data.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404).end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://localhost:${PORT}`));
