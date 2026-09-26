// Statischer Dateiserver für Client, Shared-Module, Three.js und lokale Schriften (offline-fähig).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/fonts/barlow/', path.join(ROOT, 'node_modules', '@fontsource', 'barlow-condensed', 'files')],
  ['/', path.join(ROOT, 'client')],
];

export function serveStatic(req, res) {
  let url;
  try {
    url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (url === '/') url = '/index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const rel = url.slice(prefix.length);
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Nicht gefunden');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': st.size,
        'Cache-Control': prefix === '/vendor/three/' || prefix.startsWith('/fonts/') ? 'public, max-age=86400' : 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(file).pipe(res);
    });
    return;
  }
  res.writeHead(404);
  res.end('Nicht gefunden');
}
