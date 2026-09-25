// Online-Hosting: startet einen kostenlosen Cloudflare "Quick Tunnel" (kein Konto nötig),
// damit Freunde aus aller Welt über einen https-Link mitspielen können.
// Das Programm "cloudflared" wird gesucht (PATH, server/bin, CLOUDFLARED_PATH) und bei Bedarf
// automatisch von den offiziellen GitHub-Releases heruntergeladen.
import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, 'bin');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

// Adresse der Webseiten-Version (GitHub Pages) aus package.json "homepage"
let pagesCache;
function pagesUrl() {
  if (pagesCache !== undefined) return pagesCache;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    pagesCache = typeof pkg.homepage === 'string' && /^https:\/\//.test(pkg.homepage) ? pkg.homepage.replace(/\/?$/, '/') : null;
  } catch {
    pagesCache = null;
  }
  return pagesCache;
}

function assetName() {
  const p = process.platform;
  const a = process.arch;
  if (p === 'win32') return a === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  if (p === 'darwin') return a === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz';
  if (p === 'linux') {
    if (a === 'arm64') return 'cloudflared-linux-arm64';
    if (a === 'arm') return 'cloudflared-linux-arm';
    if (a === 'ia32') return 'cloudflared-linux-386';
    return 'cloudflared-linux-amd64';
  }
  return null;
}

function localBinPath() {
  return path.join(BIN_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}

function works(bin) {
  try {
    const r = spawnSync(bin, ['--version'], { timeout: 8000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export function findCloudflared() {
  const cands = [];
  if (process.env.CLOUDFLARED_PATH) cands.push(process.env.CLOUDFLARED_PATH);
  cands.push(localBinPath());
  cands.push('cloudflared');
  for (const c of cands) {
    if (c !== 'cloudflared' && !fs.existsSync(c)) continue;
    if (works(c)) return c;
  }
  return null;
}

// Minimaler TAR-Entpacker (für die macOS-.tgz)
function extractFromTar(buf, wanted) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim() || '0', 8);
    const start = off + 512;
    if (path.basename(name) === wanted) return buf.subarray(start, start + size);
    off = start + Math.ceil(size / 512) * 512;
  }
  return null;
}

export async function downloadCloudflared(onProgress = () => {}) {
  const asset = assetName();
  if (!asset) throw new Error(`Plattform ${process.platform}/${process.arch} nicht unterstützt`);
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (total) onProgress(got / total);
  }
  let data = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  if (asset.endsWith('.tgz')) {
    const tar = zlib.gunzipSync(data);
    data = extractFromTar(tar, 'cloudflared');
    if (!data) throw new Error('cloudflared nicht im Archiv gefunden');
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const dest = localBinPath();
  fs.writeFileSync(dest, data);
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  return dest;
}

export class TunnelManager extends EventEmitter {
  constructor(port) {
    super();
    this.port = port;
    this.state = 'idle';
    this.url = null;
    this.error = null;
    this.progress = 0;
    this.proc = null;
    this.publicIp = null;
    this.lookupPublicIp();
  }

  status() {
    return { state: this.state, url: this.url, error: this.error, progress: this.progress, port: this.port, publicIp: this.publicIp, lan: lanAddresses(), pagesUrl: pagesUrl() };
  }

  set(state, extra = {}) {
    Object.assign(this, { state, ...extra });
    this.emit('change', this.status());
  }

  async lookupPublicIp() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(timer);
      const j = await r.json();
      if (j && j.ip) {
        this.publicIp = j.ip;
        this.emit('change', this.status());
      }
    } catch {
      /* offline – keine öffentliche IP bekannt */
    }
  }

  async start() {
    if (this.state === 'online' || this.state === 'starting' || this.state === 'downloading') return;
    this.error = null;
    let bin = findCloudflared();
    if (!bin) {
      this.set('downloading', { progress: 0 });
      try {
        bin = await downloadCloudflared((p) => {
          this.progress = p;
          this.emit('change', this.status());
        });
      } catch (e) {
        this.set('error', { error: 'cloudflared: ' + e.message });
        return;
      }
    }
    this.set('starting');
    const args = ['tunnel', '--no-autoupdate', '--url', `http://localhost:${this.port}`];
    let proc;
    try {
      proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      this.set('error', { error: e.message });
      return;
    }
    this.proc = proc;
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (buf.length > 20000) buf = buf.slice(-5000);
      const m = buf.match(URL_RE);
      if (m && this.state !== 'online') {
        this.set('online', { url: m[0] });
        console.log(`\n  🌍 Online-Link für Freunde: ${m[0]}\n`);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', (e) => this.set('error', { error: e.message, url: null }));
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.state === 'online' || this.state === 'starting') {
        this.set(code === 0 || this.stopping ? 'idle' : 'error', { url: null, error: this.stopping ? null : `Tunnel beendet (Code ${code})` });
      }
      this.stopping = false;
    });
    // Zeitlimit für die Link-Vergabe
    setTimeout(() => {
      if (this.proc === proc && this.state === 'starting') {
        this.stop();
        this.set('error', { error: 'Zeitüberschreitung beim Starten des Tunnels' });
      }
    }, 45000);
  }

  stop() {
    if (this.proc) {
      this.stopping = true;
      try { this.proc.kill(); } catch { /* bereits beendet */ }
      this.proc = null;
    }
    this.set('idle', { url: null, error: null, progress: 0 });
  }
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}
