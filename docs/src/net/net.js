// WebSocket-Verbindung zum Server (funktioniert lokal, im LAN und über HTTPS-Tunnel/Proxy).

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
      const url = normalizeServerUrl(param || saved || (meta && meta.content));
      if (url) {
        this.serverUrl = url;
        try { localStorage.setItem('showdown.server', url); } catch { /* ignorieren */ }
      }
    }
    this.enabled = (location.protocol === 'http:' || location.protocol === 'https:') && (!this.staticSite || !!this.serverUrl);
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
  setServer(url) {
    const n = normalizeServerUrl(url);
    if (!n) return false;
    this.serverUrl = n;
    try { localStorage.setItem('showdown.server', n); } catch { /* ignorieren */ }
    this.enabled = true;
    this.failed = false;
    this.everConnected = false;
    this.retry = 0;
    if (this.ws) this.ws.close();
    else this.connect();
    return true;
  }

  clearServer() {
    this.serverUrl = null;
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
