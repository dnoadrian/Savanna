// Spielerprofil im localStorage: Name, Spieler-ID (UUID), Spind, Statistik, Krone.
import { xpForLevel } from '../shared/constants.js';

const BASE_KEY = 'savanna.profile.v1';

// Profil-Slots pro Tab: Ist ein Profil bereits in einem anderen offenen Tab aktiv, bekommt
// dieser Tab ein eigenes Profil (z. B. zum Testen von Freunden/Party mit zwei Tabs).
const TOKEN = Math.random().toString(36).slice(2);
function slotAlive(n) {
  try {
    const raw = localStorage.getItem('savanna.slot.' + n);
    if (!raw) return false;
    const { t, token } = JSON.parse(raw);
    return token !== TOKEN && Date.now() - t < 2500;
  } catch {
    return false;
  }
}
function pickSlot() {
  let slot = null;
  try {
    const s = sessionStorage.getItem('savanna.slot');
    if (s !== null) slot = Number(s);
  } catch { /* ignorieren */ }
  if (slot === null || slotAlive(slot)) {
    slot = 0;
    while (slotAlive(slot) && slot < 16) slot++;
  }
  try { sessionStorage.setItem('savanna.slot', String(slot)); } catch { /* ignorieren */ }
  const beat = () => {
    try { localStorage.setItem('savanna.slot.' + slot, JSON.stringify({ t: Date.now(), token: TOKEN })); } catch { /* ignorieren */ }
  };
  beat();
  setInterval(beat, 1000);
  window.addEventListener('beforeunload', () => {
    try { localStorage.removeItem('savanna.slot.' + slot); } catch { /* ignorieren */ }
  });
  return slot;
}
export const PROFILE_SLOT = pickSlot();
const KEY = PROFILE_SLOT === 0 ? BASE_KEY : BASE_KEY + '.s' + PROFILE_SLOT;

export function uuid() {
  if (window.crypto && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* unsicherer Kontext */ }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function freshStats() {
  return { xp: 0, level: 1, wins: 0, crownWins: 0, kills: 0, deaths: 0, matches: 0, damage: 0, headshots: 0, bestPlacement: 0, timePlayed: 0, bestStreak: 0 };
}

export class Profile {
  constructor() {
    this.data = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = JSON.parse(raw);
    } catch {
      this.data = null;
    }
    if (this.data) {
      this.data.stats = { ...freshStats(), ...(this.data.stats || {}) };
      if (!this.data.id) this.data.id = uuid();
    }
  }

  get hasName() {
    return !!(this.data && this.data.name);
  }

  get id() { return this.data?.id; }
  get name() { return this.data?.name; }

  create(name) {
    this.data = {
      id: uuid(),
      name,
      outfit: 'cowboy',
      color: Math.floor(Math.random() * 8),
      weaponSkin: 'gold',
      crownStyle: 'gold',
      winStreak: 0,
      soloChampion: null,
      stats: freshStats(),
      registered: false,
    };
    this.save();
  }

  set(k, v) {
    this.data[k] = v;
    this.save();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignorieren */
    }
  }

  reset() {
    this.data = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignorieren */
    }
  }

  // Öffentliche Daten für Server / Match
  publicInfo() {
    const d = this.data;
    return {
      id: d.id,
      name: d.name,
      outfit: d.outfit,
      color: d.color,
      skin: d.weaponSkin,
      crownStyle: d.crownStyle,
      streak: d.winStreak,
      level: d.stats.level,
    };
  }

  // XP gutschreiben, gibt Anzahl Level-Ups zurück
  addXp(xp) {
    const s = this.data.stats;
    s.xp += xp;
    let ups = 0;
    while (s.xp >= xpForLevel(s.level)) {
      s.xp -= xpForLevel(s.level);
      s.level++;
      ups++;
    }
    this.save();
    return ups;
  }

  // Ergebnis eines Matches übernehmen
  applyMatch(r) {
    const s = this.data.stats;
    s.matches++;
    s.kills += r.kills;
    s.damage += r.damage;
    s.headshots += r.headshots;
    s.timePlayed += Math.round(r.survival);
    if (r.placement > 0 && (s.bestPlacement === 0 || r.placement < s.bestPlacement)) s.bestPlacement = r.placement;
    if (r.placement === 1) {
      if (this.data.winStreak > 0) s.crownWins++;
      s.wins++;
      this.data.winStreak++;
      s.bestStreak = Math.max(s.bestStreak, this.data.winStreak);
    } else {
      s.deaths++;
      this.data.winStreak = 0;
    }
    this.save();
  }
}

export function computeXp(r) {
  const parts = [];
  const place = r.placement || 12;
  parts.push({ key: 'xpPlacement', xp: Math.round((13 - place) * 25) });
  if (r.kills) parts.push({ key: 'xpKills', xp: r.kills * 60 });
  if (r.damage) parts.push({ key: 'xpDamage', xp: Math.round(r.damage / 5) });
  if (place === 1) parts.push({ key: 'xpWin', xp: 400 });
  return { parts, total: parts.reduce((a, b) => a + b.xp, 0) };
}
