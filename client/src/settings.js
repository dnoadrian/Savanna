// Einstellungen: im localStorage gespeichert, Änderungen werden sofort an Abonnenten gemeldet.
import { QUEUE_WAIT, clampQueueWait } from '../shared/constants.js';

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
  interact: 'KeyF',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
  slot5: 'Digit5',
  knife: 'KeyQ',
  scoreboard: 'Tab',
  map: 'KeyM',
  view: 'KeyV',
  pause: 'Escape',
};

export const KEY_ACTIONS = Object.keys(DEFAULT_KEYS);

export const DEFAULTS = {
  // Grafik (Qualität ist fest, siehe GRAPHICS in render/renderer.js)
  fpsLimit: '144',
  vsync: true,
  fov: 100,
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
  scopeSens: 0.6,
  invertY: false,
  sprintMode: 'hold',
  crouchMode: 'hold',
  aimAssist: 'on',
  // Audio
  volMaster: 80,
  volSfx: 90,
  volMusic: 55,
  volUi: 80,
  lobbyMusic: true,
  // Konto / Warteschlange
  language: 'de',
  queueWait: QUEUE_WAIT, // Sekunden, die auf echte Spieler gewartet wird (10–120)
  gameMode: 'solo', // 'solo', 'duo' (Battle Royale) oder '1v1', '2v2' (Arena)
};

const STORAGE_KEY = 'showdown.settings.v1';
// Version der gespeicherten Einstellungen: 2 = neues Standard-Sichtfeld (FOV 100),
// 3 = Inventarplätze wieder auf den Tasten 1–5
const SETTINGS_VERSION = 3;
const SLOT_KEYS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

export class Settings {
  constructor() {
    this.values = structuredClone(DEFAULTS);
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const ver = saved.v || 1;
        if (ver < 2) delete saved.fov;
        for (const k of Object.keys(DEFAULTS)) {
          if (saved[k] === undefined) continue;
          if (k === 'keys') {
            this.values.keys = { ...DEFAULT_KEYS };
            for (const a of KEY_ACTIONS) if (saved.keys[a]) this.values.keys[a] = saved.keys[a];
            if (ver < 3) {
              // Inventar wieder auf 1–5; andere Aktionen, die auf 1–5 lagen, bekommen ihre Standardtaste
              const digits = SLOT_KEYS.map((a) => DEFAULT_KEYS[a]);
              for (const a of KEY_ACTIONS) if (!SLOT_KEYS.includes(a) && digits.includes(this.values.keys[a])) this.values.keys[a] = DEFAULT_KEYS[a];
              for (const a of SLOT_KEYS) this.values.keys[a] = DEFAULT_KEYS[a];
            }
          } else this.values[k] = saved[k];
        }
      } else {
        // Sprache aus dem Browser übernehmen
        const lang = (navigator.language || 'de').slice(0, 2);
        this.values.language = lang === 'de' ? 'de' : 'en';
      }
    } catch {
      /* Standardwerte */
    }
    this.values.queueWait = clampQueueWait(this.values.queueWait);
    if (!['solo', 'duo', '1v1', '2v2'].includes(this.values.gameMode)) this.values.gameMode = 'solo';
    if (this.values.aimAssist !== 'on' && this.values.aimAssist !== 'off') this.values.aimAssist = 'on';
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.values, v: SETTINGS_VERSION }));
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
