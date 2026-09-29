// Persistenz als JSON-Datei (Konten, Freunde, Partys, Kronen-Bot) – übersteht Server-Neustarts.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SHOWDOWN_DATA_DIR || path.join(__dirname, 'data');
// Datei-Name bleibt (auch nach der Umbenennung in SNOWDOWN), damit Konten erhalten bleiben
const FILE = path.join(DATA_DIR, 'showdownbay.json');
// Version 3: alle Spielerkonten erneut zurückgesetzt (die Browser verwerfen ihr altes Profil ebenfalls)
const DATA_VERSION = 3;

export class Store {
  constructor() {
    this.data = { players: {}, parties: {}, champion: null, version: DATA_VERSION };
    this.timer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(FILE)) {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        this.data = { players: {}, parties: {}, champion: null, ...d };
        if ((this.data.version || 1) < DATA_VERSION) {
          console.log('Alle Spielerkonten werden zurückgesetzt (neue Datenversion).');
          this.data.players = {};
          this.data.parties = {};
          this.data.champion = null;
          this.data.version = DATA_VERSION;
          this.save();
        }
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
