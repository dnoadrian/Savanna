// TAB-Inventar (wie im Original): schmales, durchsichtiges Panel links – das Spiel bleibt sichtbar.
// Die Maus ist frei: Gegenstände per Ziehen zwischen den Plätzen sortieren, aus dem Menü ziehen
// = fallen lassen (auch Munition). Tasten gehen weiterhin: Platznummer, dann Zielnummer.
// Oben: Währung und Munitionsvorräte, unten: Details zum gewählten Gegenstand.
import { h } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';
import { keyLabel } from '../settings.js';
import { WEAPONS, CONSUMABLES, RARITY_COLORS, AMMO_TYPES, AMMO_MAX, itemRarity } from '../../shared/items.js';
import { itemIcon } from '../render/itemIcons.js';
import { itemName, shortName } from './hud.js';

const AMMO_COLOR = { light: '#9fc0dc', medium: '#5fbf3e', heavy: '#c0493a', shells: '#ff5a44' };
const DRAG_START = 6; // px, ab dann ist es Ziehen statt Klicken

export class InventoryScreen {
  constructor(root, app) {
    this.app = app;
    this.open = false;
    this.picked = -1;
    this.focus = 0;
    this.drag = null;
    this.el = h('div', { class: 'inv-screen hidden' });
    root.appendChild(this.el);
    // Klick ins Spiel (außerhalb des Panels, ohne Ziehen) schließt das Inventar
    this.el.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.inv-panel') && !this.drag) { e.preventDefault(); this.toggle(false); }
    });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  get player() { return this.app.match && this.app.match.player; }

  // v: öffnen/schließen; noRelock: Maus nicht wieder fangen (anderes Menü übernimmt)
  toggle(v = !this.open, noRelock = false) {
    const app = this.app;
    if (v === this.open) return;
    this.open = v;
    this.picked = -1;
    this.cancelDrag();
    this.el.classList.toggle('hidden', !v);
    if (v) {
      this.focus = this.player?.inv?.sel ?? 0;
      app.audio.uiClick();
      app.input.unlock(); // Maus frei zum Sortieren
      // Einblend-Animation nur beim Öffnen (nicht bei jedem Neuaufbau)
      this.el.classList.add('opening');
      clearTimeout(this.openTimer);
      this.openTimer = setTimeout(() => this.el.classList.remove('opening'), 220);
      this.render();
      return;
    }
    const m = app.match;
    if (noRelock || !m || m.state !== 'alive' || m.ended || app.ui.overlayOpen(false)) return;
    app.lockGame();
    // Browser verweigert den Mausfang manchmal (z. B. direkt nach ESC): dann „Klicken zum Spielen“
    setTimeout(() => {
      if (!app.input.locked && app.state === 'match' && app.match === m && m.state === 'alive' && !m.ended && !app.ui.overlayOpen()) app.ui.showClickToPlay();
    }, 700);
  }

  // Tasten im offenen Menü: 1–5 wählen/tauschen, ESC schließt, R bricht die Auswahl ab
  handleInput(input, player) {
    if (!this.open) return;
    if (input.pressedSet.has('Escape')) { this.toggle(false); return; }
    for (let i = 0; i < 5; i++) {
      if (!input.pressed('slot' + (i + 1))) continue;
      if (this.picked < 0) {
        this.picked = i;
        this.focus = i;
        this.app.audio.uiHover();
      } else {
        if (this.picked !== i) {
          player.swapSlots(this.picked, i);
          this.app.audio.uiConfirm();
        }
        this.focus = i;
        this.picked = -1;
      }
      this.render();
    }
    if (input.pressed('reload') && this.picked >= 0) { this.picked = -1; this.render(); }
  }

  // ---------------- Ziehen & Ablegen ----------------
  startDrag(e, kind, id) {
    if (e.button !== 0) return;
    e.preventDefault();
    this.drag = { kind, id, x0: e.clientX, y0: e.clientY, started: false, ghost: null, over: null };
  }

  onMove(e) {
    const d = this.drag;
    if (!d || !this.open) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START) return;
      d.started = true;
      const inv = this.player.inv;
      const it = d.kind === 'slot' ? inv.slots[d.id] : { k: 'a', a: d.id, n: 1 };
      if (!it) { this.drag = null; return; }
      d.ghost = h('img', { class: 'inv-ghost', src: itemIcon(it), alt: '' });
      this.el.appendChild(d.ghost);
      this.el.classList.add('dragging');
      this.el.querySelector(`[data-${d.kind}="${d.id}"]`)?.classList.add('drag-src');
      this.app.audio.uiHover();
    }
    d.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest('[data-slot]');
    const outside = !under || !under.closest('.inv-panel');
    for (const el of this.el.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
    if (slot && d.kind === 'slot') slot.classList.add('drop-target');
    this.el.classList.toggle('drop-out', outside);
  }

  onUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!this.open) return;
    const pl = this.player;
    if (!d.started) {
      // Klick: Gegenstand auswählen (Details); Doppelklick nimmt ihn in die Hand
      if (d.kind === 'slot') {
        const now = performance.now();
        if (this.lastClick && this.lastClick.id === d.id && now - this.lastClick.t < 350) pl.selectSlot(d.id);
        this.lastClick = { id: d.id, t: now };
        this.focus = d.id;
      }
      this.cleanupDrag();
      this.render();
      return;
    }
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const slot = under && under.closest('[data-slot]');
    const outside = !under || !under.closest('.inv-panel');
    if (d.kind === 'slot') {
      if (slot) {
        const j = Number(slot.dataset.slot);
        if (j !== d.id) { pl.swapSlots(d.id, j); this.app.audio.uiConfirm(); this.focus = j; }
      } else if (outside) {
        pl.dropSlot(d.id);
      }
    } else if (d.kind === 'ammo' && outside) {
      pl.dropAmmo(d.id);
    }
    this.cleanupDrag();
    this.render();
  }

  cancelDrag() {
    this.drag = null;
    this.cleanupDrag();
  }

  cleanupDrag() {
    for (const g of this.el.querySelectorAll('.inv-ghost')) g.remove();
    this.el.classList.remove('dragging', 'drop-out');
  }

  // ---------------- Darstellung ----------------
  // Nur neu aufbauen, wenn sich wirklich etwas geändert hat (sonst flackert es und Hover/Ziehen
  // gehen verloren)
  refresh() {
    if (!this.open || this.drag) return;
    const pl = this.player;
    if (!pl) return;
    if (this.signature(pl.inv) !== this.lastSig) this.render();
  }

  signature(inv) {
    return JSON.stringify([inv.slots.map((it) => it && [it.w || it.c || it.a, it.r, it.mag, it.n]), inv.sel, inv.ammo, this.app.profile.data.coins, this.picked, this.focus]);
  }

  render() {
    if (!this.open || (this.drag && this.drag.started)) return;
    const app = this.app;
    const pl = this.player;
    if (!pl) return;
    const inv = pl.inv;
    this.lastSig = this.signature(inv);
    const keys = app.settings.get('keys');
    const coins = app.profile.data.coins || 0;

    const tabs = h('div', { class: 'inv-tabs' },
      h('button', { class: 'inv-tab sel' }, h('span', { class: 'icon', html: ICON.backpack }), t('invTab')),
      h('button', { class: 'inv-tab', onclick: () => { app.audio.uiClick(); this.toggle(false, true); app.match.hud.toggleBigMap(true); app.lockGame(); } }, h('span', { class: 'icon', html: ICON.map }), t('invMap')),
      h('button', { class: 'inv-tab', onclick: () => { app.audio.uiClick(); this.toggle(false, true); app.ui.openSettings(); } }, h('span', { class: 'icon', html: ICON.gear }), t('menuSettings')),
      h('span', { class: 'inv-close', title: t('invClose', { key: keyLabel(keys.scoreboard) }) }, keyLabel(keys.scoreboard)));

    const cur = h('div', { class: 'inv-row' },
      h('div', { class: 'inv-h' }, t('invCurrency')),
      h('div', { class: 'inv-cur' }, h('span', { class: 'icon', html: ICON.coin }), h('b', {}, coins.toLocaleString('de-DE'))));

    const ammo = h('div', { class: 'inv-ammo-grid' }, ...AMMO_TYPES.map((a) => {
      const n = inv.ammo[a] || 0;
      const el = h('div', {
        class: 'inv-ammo' + (n ? '' : ' empty'),
        'data-ammo': a,
        style: { '--ac': AMMO_COLOR[a] },
        title: t('invDragAmmo'),
        onpointerdown: (e) => { if (n) this.startDrag(e, 'ammo', a); },
      },
      h('img', { src: itemIcon({ k: 'a', a, n: 1 }), alt: '', draggable: 'false' }),
      h('div', { class: 'ia-txt' }, h('b', {}, String(n)), h('small', {}, t('a_' + a))),
      h('div', { class: 'ia-bar' }, h('i', { style: { width: Math.min(100, (n / AMMO_MAX[a]) * 100) + '%' } })));
      return el;
    }));

    const slots = h('div', { class: 'inv-slots' });
    for (let i = 0; i < 5; i++) {
      const it = inv.slots[i];
      const rar = it ? RARITY_COLORS[itemRarity(it)] : '#2a3350';
      slots.appendChild(h('div', {
        class: 'inv-slot' + (it ? '' : ' empty') + (i === inv.sel ? ' held' : '') + (i === this.picked ? ' picked' : '') + (i === this.focus ? ' focus' : ''),
        'data-slot': i,
        style: { '--rar': rar },
        onpointerdown: (e) => { if (it) this.startDrag(e, 'slot', i); },
        onpointerenter: () => { if (!this.drag && it) this.showDetails(inv.slots[i]); },
        onpointerleave: () => { if (!this.drag) this.showDetails(inv.slots[this.focus]); },
      },
      h('div', { class: 'inv-key' }, keyLabel(keys['slot' + (i + 1)])),
      it ? h('img', { src: itemIcon(it), alt: '', draggable: 'false' }) : null,
      it ? h('div', { class: 'inv-name' }, shortName(it)) : null,
      it && it.k === 'w' ? h('div', { class: 'inv-count' + (it.mag === 0 ? ' empty' : '') }, `${it.mag}/${WEAPONS[it.w].mag}`) : it && it.k === 'c' ? h('div', { class: 'inv-count' }, '×' + it.n) : null));
    }

    const hint = h('div', { class: 'inv-hint' }, this.picked >= 0 ? t('invSwapPick', { n: this.picked + 1 }) : t('invMouseHint'));
    this.detailsEl = h('div', { class: 'inv-details-wrap' });
    this.showDetails(inv.slots[this.focus]);

    const panel = h('div', { class: 'inv-panel' },
      tabs,
      cur,
      h('div', { class: 'inv-h' }, t('invResources')), ammo,
      h('div', { class: 'inv-h' }, t('invLoadout')), slots, hint,
      this.detailsEl);
    this.el.innerHTML = '';
    this.el.append(panel, h('div', { class: 'inv-drop-hint' }, h('span', { class: 'icon', html: ICON.backpack }), t('invDropHere')));
  }

  showDetails(it) {
    if (!this.detailsEl) return;
    this.detailsEl.innerHTML = '';
    if (!it) return;
    const rar = itemRarity(it);
    const rows = [];
    if (it.k === 'w') {
      const d = WEAPONS[it.w];
      const ammoLeft = this.player ? this.player.inv.ammo[d.ammo] || 0 : 0;
      rows.push([t('invDmg'), Math.round(d.dmg[it.r])], [t('invRate'), d.fireRate.toFixed(1) + '/s'], [t('invMag'), `${it.mag} / ${d.mag}`],
        [t('invReload'), d.reload[it.r].toFixed(2) + ' s'], [t('invAmmo'), `${t('a_' + d.ammo)} · ${ammoLeft}`]);
    } else if (it.k === 'c') {
      const c = CONSUMABLES[it.c];
      if (c.heal) rows.push([t('invHeal'), '+' + c.heal]);
      if (c.shield) rows.push([t('invShield'), '+' + c.shield + ' (max ' + c.cap + ')']);
      rows.push([t('invStack'), `${it.n} / ${c.stack}`]);
    }
    this.detailsEl.appendChild(h('div', { class: 'inv-details', style: { '--rar': RARITY_COLORS[rar] } },
      h('div', { class: 'inv-d-top' },
        h('img', { src: itemIcon(it), alt: '', draggable: 'false' }),
        h('div', {}, h('div', { class: 'inv-d-rar' }, t('rar_' + rar)), h('div', { class: 'inv-d-name' }, itemName(it)))),
      h('div', { class: 'inv-d-stats' }, ...rows.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v)))))));
  }
}
