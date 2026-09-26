// WebSocket-Verbindung zum Server (funktioniert lokal, im LAN und über HTTPS-Tunnel/Proxy).
import { BEACON_BASE, BEACON_TOPIC, BEACON_MAX_AGE } from '../../shared/constants.js';

const TUNNEL_RE = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i;

export class NetClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.handlers = new Set();
    this.statusHandlers = new Set();
    this.ping = 0;
    this.rid = 1;
    this.pending = new Map();
    this.retry = 0;
    this.pingTimer = null;
    // Statische Webseite (z. B. GitHub Pages): kein eigener Server. Solo läuft sofort,
    // für Party/Freunde kann man sich mit einem gehosteten Server verbinden (?server=…).
    this.staticSite = !!document.querySelector('meta[name="showdown-static"]');
    this.serverUrl = null;
    this.failed = false;
    this.everConnected = false;
    const param = new URLSearchParams(location.search).get('server');
    if (this.staticSite) {
      let saved = null;
      try { saved = localStorage.getItem('showdown.server'); } catch { /* ignorieren */ }
      const meta = document.querySelector('meta[name="showdown-server"]');
      // fest eingetragener 24/7-Server (package.json → showdown.server)
      this.permanentServer = normalizeServerUrl(meta && meta.content);
      const url = normalizeServerUrl(param || saved || (meta && meta.content));
      if (url) {
        this.serverUrl = url;
        try { localStorage.setItem('showdown.server', url); } catch { /* ignorieren */ }
      }
    }
    this.enabled = (location.protocol === 'http:' || location.protocol === 'https:') && (!this.staticSite || !!this.serverUrl);
    // Webseite ohne festen Server-Link: automatisch den gerade online hostenden Server suchen
    this.autoFound = null;
    // (nicht nötig, wenn ein fester 24/7-Server eingetragen ist)
    if (this.staticSite && !param && !this.permanentServer) {
      this.discover();
      this.discoverTimer = setInterval(() => { if (!this.connected) this.discover(); }, 30000);
    }
  }

  // Leuchtfeuer abfragen (ntfy.sh): neueste Tunnel-Adresse der letzten Minuten
  async discover() {
    let text;
    try {
      const r = await fetch(`${BEACON_BASE}/${encodeURIComponent(BEACON_TOPIC)}/json?poll=1&since=10m`, { cache: 'no-store' });
      if (!r.ok) return;
      text = await r.text();
    } catch {
      return;
    }
    let last = null;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (m.event === 'message' && (!last || m.time >= last.time)) last = m;
      } catch { /* ignorieren */ }
    }
    if (this.noAuto || !last || Date.now() / 1000 - last.time > BEACON_MAX_AGE) return;
    const url = normalizeServerUrl(String(last.message || '').trim());
    if (!url || !TUNNEL_RE.test(url) || this.connected) return;
    if (url === this.serverUrl && !this.failed) return;
    this.autoFound = url;
    this.setServer(url, false);
  }

  url() {
    if (this.serverUrl) {
      const u = new URL(this.serverUrl);
      return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host + '/ws';
    }
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return proto + location.host + '/ws';
  }

  get serverHost() {
    try { return this.serverUrl ? new URL(this.serverUrl).host : location.host; } catch { return ''; }
  }

  // Mit einem anderen Server verbinden (statische Webseite)
  setServer(url, persist = true) {
    const n = normalizeServerUrl(url);
    if (!n) return false;
    this.serverUrl = n;
    if (persist) try { localStorage.setItem('showdown.server', n); } catch { /* ignorieren */ }
    this.enabled = true;
    this.failed = false;
    this.everConnected = false;
    this.wakeStart = 0;
    this.waking = false;
    this.retry = 0;
    if (this.ws) this.ws.close();
    else this.connect();
    return true;
  }

  clearServer() {
    this.serverUrl = null;
    this.noAuto = true; // bewusst getrennt: nicht automatisch wieder verbinden
    try { localStorage.removeItem('showdown.server'); } catch { /* ignorieren */ }
    this.enabled = !this.staticSite;
    if (this.ws) this.ws.close();
    this.emitStatus();
  }

  connect() {
    if (!this.enabled || this.ws) return;
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.everConnected = true;
      this.failed = false;
      this.waking = false;
      this.retry = 0;
      this.emitStatus();
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
      this.send({ t: 'ping', c: performance.now() });
    };
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.t === 'pong') {
        const rtt = performance.now() - m.c;
        this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt;
        return;
      }
      if (m.rid && this.pending.has(m.rid)) {
        const p = this.pending.get(m.rid);
        this.pending.delete(m.rid);
        clearTimeout(p.timer);
        p.resolve(m);
      }
      for (const fn of [...this.handlers]) {
        try {
          fn(m);
        } catch (e) {
          console.error(e);
        }
      }
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.ws = null;
      clearInterval(this.pingTimer);
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.resolve({ t: 'error', err: 'offline' });
      }
      this.pending.clear();
      if (was) this.emitStatus();
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose folgt */
    };
  }

  scheduleReconnect() {
    if (!this.enabled) return;
    // Fester 24/7-Server (z. B. Render im Gratis-Tarif): schläft er, braucht er bis zu ~1 Minute
    // zum Aufwachen – so lange weiter versuchen und „Server startet …“ anzeigen
    const permanent = this.staticSite && this.serverUrl && this.serverUrl === this.permanentServer;
    if (permanent && !this.everConnected) {
      if (!this.wakeStart) {
        this.wakeStart = Date.now();
        // normaler HTTP-Aufruf weckt schlafende Server zuverlässig
        try { fetch(this.serverUrl + '/api/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch { /* ignorieren */ }
      }
      if (Date.now() - this.wakeStart < 120000) {
        if (!this.waking) { this.waking = true; this.emitStatus(); }
        setTimeout(() => { if (this.enabled) this.connect(); }, 3000);
        return;
      }
      this.waking = false;
    }
    // fremder Server nicht erreichbar (z. B. alter Einladungslink): nicht endlos versuchen
    if (this.staticSite && !this.everConnected && this.retry >= 3) {
      this.failed = true;
      this.emitStatus();
      return;
    }
    const delay = Math.min(8000, 800 * Math.pow(1.6, this.retry++));
    setTimeout(() => { if (this.enabled) this.connect(); }, delay);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  request(obj, timeout = 5000) {
    return new Promise((resolve) => {
      if (!this.connected) {
        resolve({ t: 'error', err: 'offline' });
        return;
      }
      const rid = this.rid++;
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve({ t: 'error', err: 'timeout' });
      }, timeout);
      this.pending.set(rid, { resolve, timer });
      this.send({ ...obj, rid });
    });
  }

  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onStatus(fn) {
    this.statusHandlers.add(fn);
    return () => this.statusHandlers.delete(fn);
  }

  emitStatus() {
    for (const fn of this.statusHandlers) fn(this.connected);
  }
}

// "abc.trycloudflare.com" oder "https://abc.trycloudflare.com/xyz" -> "https://abc.trycloudflare.com"
export function normalizeServerUrl(v) {
  if (!v || typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.protocol + '//' + u.host;
  } catch {
    return null;
  }
}
