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
    this.enabled = location.protocol === 'http:' || location.protocol === 'https:';
    this.pingTimer = null;
  }

  url() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    return proto + location.host + '/ws';
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
    const delay = Math.min(8000, 800 * Math.pow(1.6, this.retry++));
    setTimeout(() => this.connect(), delay);
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
