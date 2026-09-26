// Leuchtfeuer: Solange der Online-Tunnel läuft, meldet der Server seine öffentliche Adresse
// regelmäßig an ein ntfy.sh-Thema. Die Webseiten-Version liest das Thema und verbindet sich
// automatisch – so spielen alle zusammen, auch wenn sie einfach die normale Webseite öffnen.
// Abschalten: Umgebungsvariable SHOWDOWN_BEACON=0 oder "showdown": { "beacon": false } in package.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BEACON_BASE, BEACON_TOPIC, BEACON_INTERVAL } from '../shared/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function config() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).showdown || {}; } catch { /* ignorieren */ }
  const enabled = process.env.SHOWDOWN_BEACON !== '0' && cfg.beacon !== false;
  return { enabled, base: cfg.beaconBase || BEACON_BASE, topic: process.env.SHOWDOWN_BEACON_TOPIC || cfg.beaconTopic || BEACON_TOPIC };
}

export class Beacon {
  constructor(tunnel, log = console.log) {
    this.cfg = config();
    this.log = log;
    this.url = null;
    this.timer = null;
    if (!this.cfg.enabled || typeof fetch !== 'function') return;
    tunnel.on('change', (st) => this.onTunnel(st));
  }

  onTunnel(st) {
    const url = st.state === 'online' && st.url ? st.url : null;
    if (url === this.url) return;
    const was = this.url;
    this.url = url;
    clearInterval(this.timer);
    this.timer = null;
    if (url) {
      this.post(url);
      this.timer = setInterval(() => this.post(url), BEACON_INTERVAL * 1000);
      this.log(`[beacon] Webseiten-Spieler finden diesen Server automatisch (${this.cfg.base}/${this.cfg.topic})`);
    } else if (was) {
      this.post('offline');
    }
  }

  async post(body) {
    try {
      await fetch(`${this.cfg.base}/${encodeURIComponent(this.cfg.topic)}`, {
        method: 'POST',
        body,
        headers: { Title: 'SHOWDOWN BAY', Tags: 'video_game' },
        signal: AbortSignal.timeout(8000),
      });
    } catch { /* offline: nächster Versuch beim nächsten Intervall */ }
  }

  stop() {
    clearInterval(this.timer);
    if (this.url) this.post('offline');
    this.url = null;
  }
}
