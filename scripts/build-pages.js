// Baut die statische Webseiten-Version (GitHub Pages) nach docs/:
// Client + Shared-Module + Three.js + Schriften, alles mit relativen Pfaden.
// Solo gegen Bots läuft komplett im Browser; für Party/Freunde verbindet sich die Seite
// optional mit einem gehosteten Server (?server=… oder SHOWDOWN_SERVER_URL beim Build).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'docs');

function copyDir(src, dst, filter = () => true) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, filter);
    else if (filter(s)) fs.copyFileSync(s, d);
  }
}

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Client
copyDir(path.join(ROOT, 'client'), OUT);
// Gemeinsame Module (Simulation, Map-Generator, Bots …)
copyDir(path.join(ROOT, 'shared'), path.join(OUT, 'shared'));
// Three.js (nur was gebraucht wird)
const three = path.join(ROOT, 'node_modules', 'three');
for (const f of ['build/three.module.js', 'build/three.core.js', 'LICENSE']) copyFile(path.join(three, f), path.join(OUT, 'vendor/three', f));
for (const dir of ['examples/jsm/postprocessing', 'examples/jsm/shaders']) copyDir(path.join(three, dir), path.join(OUT, 'vendor/three', dir), (f) => f.endsWith('.js'));
// Schriften
const fonts = [
  ['barlow-condensed', 'barlow'],
];
for (const [pkg, dir] of fonts) {
  const src = path.join(ROOT, 'node_modules', '@fontsource', pkg);
  copyDir(path.join(src, 'files'), path.join(OUT, 'fonts', dir), (f) => f.endsWith('.woff2') && /latin(-ext)?-(500|600|700|800)-normal|latin(-ext)?-(800|900)-italic/.test(f));
  if (fs.existsSync(path.join(src, 'LICENSE'))) copyFile(path.join(src, 'LICENSE'), path.join(OUT, 'fonts', dir, 'LICENSE'));
}

// Kennzeichnung als statische Seite (+ optionaler Standard-Server)
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const server = process.env.SHOWDOWN_SERVER_URL || (pkg.showdown && pkg.showdown.server) || '';
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const meta = `<meta name="showdown-static" content="1" />${server ? `\n  <meta name="showdown-server" content="${server.replace(/"/g, '')}" />` : ''}`;
html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  ${meta}`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
// Kein Jekyll (Dateien unverändert ausliefern)
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

let files = 0;
let bytes = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else { files++; bytes += fs.statSync(p).size; }
  }
};
walk(OUT);
console.log(`Webseite gebaut: ${path.relative(ROOT, OUT)}/ (${files} Dateien, ${(bytes / 1024 / 1024).toFixed(1)} MB)${server ? ` · Standard-Server: ${server}` : ''}`);
