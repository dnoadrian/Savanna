// Persistenz als JSON-Datei (Konten, Freunde, Partys, Kronen-Bot) – übersteht Server-Neustarts.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SHOWDOWN_DATA_DIR || path.join(__dirname, 'data');
// neue Datei für Showdown Bay: alle Spielerkonten starten frisch
const FILE = path.join(DATA_DIR, 'showdownbay.json');

export class Store {
  constructor() {
    this.data = { players: {}, parties: {}, champion: null, version: 1 };
    this.timer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(FILE)) {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        this.data = { players: {}, parties: {}, champion: null, ...d };
        // Bereit-Status nach Neustart zurücksetzen
        for (const p of Object.values(this.data.parties)) p.ready = {};
      }
    } catch (e) {
      console.error('Konnte Datenbank nicht laden, starte leer:', e.message);
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 400);
  }

  saveNow() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('Speichern fehlgeschlagen:', e.message);
    }
  }

  get players() { return this.data.players; }
  get parties() { return this.data.parties; }

  player(id) {
    return this.data.players[id] || null;
  }

  byName(name) {
    const key = String(name).toLowerCase();
    for (const p of Object.values(this.data.players)) if (p.nameKey === key) return p;
    return null;
  }

  nameTaken(name, exceptId = null) {
    const p = this.byName(name);
    return !!p && p.id !== exceptId;
  }
}
