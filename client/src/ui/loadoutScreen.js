// Arena (1v1/2v2): Ausrüstung in der Startbox wählen. Solange die Wahlzeit läuft, steht man in
// der Box still, die Maus ist frei. Platz 1–3: je eine Waffe (Gold bzw. höchste Seltenheit),
// Platz 4–5: Heilung. Jede Änderung geht sofort an die Simulation bzw. den Server; die letzte
// Wahl wird gemerkt und beim nächsten Mal gleich wieder benutzt.
import { h } from './dom.js';
import { t } from '../i18n.js';
import { LOADOUT_WEAPONS, LOADOUT_HEALS, cleanLoadout, loadoutRarity, RARITY_COLORS, CONSUMABLES } from '../../shared/items.js';
import { itemIcon } from '../render/itemIcons.js';

const STORE = 'showdown.loadout';

function loadSaved() {
  try { return cleanLoadout(JSON.parse(localStorage.getItem(STORE) || 'null')); } catch { return cleanLoadout(null); }
}

export class LoadoutScreen {
  constructor(root, app) {
    this.app = app;
    this.open = false;
    this.done = false;
    this.sel = loadSaved();
    this.el = h('div', { class: 'loadout-screen hidden' });
    root.appendChild(this.el);
  }

  // Beginn der Wahlzeit: gemerkte Ausrüstung sofort anwenden und das Menü zeigen
  start(session) {
    this.session = session;
    this.done = false;
    this.sel = loadSaved();
    session.loadout(this.sel);
    this.show();
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.el.classList.remove('hidden');
    this.app.input.unlock();
    this.render();
  }

  // ready: „Fertig“ gedrückt (Maus wieder fangen); sonst Ende der Wahlzeit
  hide(ready = false) {
    if (!this.open) return;
    this.open = false;
    this.el.classList.add('hidden');
    const app = this.app, m = app.match;
    if (!m || m.state !== 'alive' || m.ended || app.ui.overlayOpen(false)) return;
    app.lockGame();
    setTimeout(() => {
      if (!app.input.locked && app.state === 'match' && app.match === m && m.state === 'alive' && !m.ended && !app.ui.overlayOpen()) app.ui.showClickToPlay();
    }, ready ? 700 : 300);
  }

  choose(slot, value) {
    const s = this.sel;
    if (slot < 3) s.w[slot] = value;
    else s.c[slot - 3] = value;
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* ignorieren */ }
    if (this.session) this.session.loadout(s);
    this.app.audio.uiClick();
    this.render();
  }

  // Restzeit in der Box (wird jedes Bild aufgerufen)
  update(secs) {
    if (!this.open || !this.timerEl) return;
    const n = Math.max(0, Math.ceil(secs));
    if (n !== this.lastN) {
      this.lastN = n;
      this.timerEl.textContent = String(n);
      this.timerEl.classList.toggle('urgent', n <= 3);
    }
  }

  render() {
    const el = this.el;
    el.innerHTML = '';
    const cols = [];
    for (let slot = 0; slot < 5; slot++) {
      const weapon = slot < 3;
      const cur = weapon ? this.sel.w[slot] : this.sel.c[slot - 3];
      const list = weapon ? LOADOUT_WEAPONS : LOADOUT_HEALS;
      const opts = list.map((v) => {
        const item = weapon ? { k: 'w', w: v, r: loadoutRarity(v) } : { k: 'c', c: v };
        const rar = weapon ? loadoutRarity(v) : CONSUMABLES[v].rarity;
        const name = weapon ? t('ws_' + v) : t('c_' + v) + ' ×' + CONSUMABLES[v].stack;
        return h('button', {
          class: 'lo-opt' + (v === cur ? ' sel' : ''),
          style: { '--rc': RARITY_COLORS[rar] },
          title: name,
          onclick: () => this.choose(slot, v),
          onmouseenter: () => this.app.audio.uiHover(),
        }, h('img', { src: itemIcon(item), alt: '' }), h('span', {}, name));
      });
      cols.push(h('div', { class: 'lo-col' + (weapon ? '' : ' heal') },
        h('div', { class: 'lo-slot' }, h('b', {}, String(slot + 1)), t(weapon ? 'loSlotWeapon' : 'loSlotHeal')),
        ...opts));
    }
    this.timerEl = h('div', { class: 'lo-timer' }, '');
    this.lastN = -1;
    el.append(h('div', { class: 'lo-panel' },
      h('div', { class: 'lo-head' },
        h('div', {}, h('div', { class: 'lo-kicker' }, t('loKicker')), h('h2', {}, t('loTitle'))),
        this.timerEl),
      h('div', { class: 'lo-cols' }, ...cols),
      h('div', { class: 'lo-foot' },
        h('span', { class: 'lo-hint' }, t('loHint')),
        h('button', { class: 'btn yellow', onclick: () => { this.app.audio.uiConfirm(); this.hide(true); } }, t('loReady')))));
  }
}
