// Einstellungen: im localStorage gespeichert, Änderungen werden sofort an Abonnenten gemeldet.

export const DEFAULT_KEYS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ControlLeft',
  crouch: 'ShiftLeft',
  fire: 'Mouse0',
  ads: 'Mouse2',
  reload: 'KeyR',
  heal: 'KeyF',
  slot1: 'Digit1',
  slot2: 'Digit2',
  scoreboard: 'Tab',
  map: 'KeyM',
  view: 'KeyV',
  pause: 'Escape',
};

export const KEY_ACTIONS = Object.keys(DEFAULT_KEYS);

export const DEFAULTS = {
  // Grafik
  quality: 'auto',
  resolution: 100,
  shadows: 'high',
  viewDistance: 'far',
  grass: 'medium',
  antialias: true,
  post: true,
  fpsLimit: '144',
  vsync: true,
  fov: 90,
  // Anzeige
  showFps: true,
  showPing: true,
  damageNumbers: true,
  minimap: true,
  hudScale: 100,
  crossColor: '#ffffff',
  crossShape: 'cross',
  crossSize: 100,
  crossDot: true,
  headBob: true,
  colorblind: 'off',
  // Steuerung
  keys: { ...DEFAULT_KEYS },
  sensX: 1.0,
  sensY: 1.0,
  adsSens: 0.7,
  invertY: false,
  sprintMode: 'hold',
  crouchMode: 'hold',
  aimAssist: 'strong',
  // Audio
  volMaster: 80,
  volSfx: 90,
  volMusic: 55,
  volUi: 80,
  lobbyMusic: true,
  // Konto
  language: 'de',
};

const STORAGE_KEY = 'savanna.settings.v1';

export class Settings {
  constructor() {
    this.values = structuredClone(DEFAULTS);
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) {
          if (saved[k] === undefined) continue;
          if (k === 'keys') this.values.keys = { ...DEFAULT_KEYS, ...saved.keys };
          else this.values[k] = saved[k];
        }
      } else {
        // Sprache aus dem Browser übernehmen
        const lang = (navigator.language || 'de').slice(0, 2);
        this.values.language = lang === 'de' ? 'de' : 'en';
      }
    } catch {
      /* Standardwerte */
    }
  }

  get(k) {
    return this.values[k];
  }

  set(k, v) {
    if (JSON.stringify(this.values[k]) === JSON.stringify(v)) return;
    this.values[k] = v;
    this.save();
    for (const fn of this.listeners) fn(k, v);
  }

  setMany(obj) {
    for (const [k, v] of Object.entries(obj)) this.values[k] = v;
    this.save();
    for (const k of Object.keys(obj)) for (const fn of this.listeners) fn(k, this.values[k]);
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* Speicher voll/gesperrt */
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  resetKeys() {
    this.set('keys', { ...DEFAULT_KEYS });
  }

  // Doppelt belegte Tasten finden
  duplicateKeys() {
    const seen = new Map();
    const dups = new Set();
    for (const [action, code] of Object.entries(this.values.keys)) {
      if (!code) continue;
      if (seen.has(code)) {
        dups.add(action);
        dups.add(seen.get(code));
      } else seen.set(code, action);
    }
    return dups;
  }
}

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) {
    const n = Number(code.slice(5));
    return ['Maus L', 'Maus M', 'Maus R', 'Maus 4', 'Maus 5'][n] || 'Maus ' + (n + 1);
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    ControlLeft: 'STRG', ControlRight: 'STRG R', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT R', AltLeft: 'ALT', AltRight: 'ALT GR',
    Space: 'LEER', Tab: 'TAB', Escape: 'ESC', Enter: 'ENTER', Backspace: '⌫', CapsLock: 'CAPS', ArrowUp: '↑', ArrowDown: '↓',
    ArrowLeft: '←', ArrowRight: '→', WheelUp: 'Rad ↑', WheelDown: 'Rad ↓',
  };
  return map[code] || code;
}
