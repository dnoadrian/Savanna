// TAB-Menü im Match (wie das Inventar im Original): links ein Menü (Inventar / Karte /
// Einstellungen), oben Währung und Munitionsvorräte, darunter die 5 Plätze mit Details.
// Sortieren nur über Tasten: Platznummer drücken (auswählen), dann Zielnummer (tauschen).
import { h } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';
import { keyLabel } from '../settings.js';
import { WEAPONS, CONSUMABLES, RARITY_COLORS, AMMO_TYPES, itemRarity } from '../../shared/items.js';
import { itemIcon } from '../render/itemIcons.js';
import { itemName, shortName } from './hud.js';

const AMMO_COLOR = { light: '#9fc0dc', medium: '#5fbf3e', heavy: '#c0493a', shells: '#ff5a44' };

export class InventoryScreen {
  constructor(root, app) {
    this.app = app;
    this.open = false;
    this.picked = -1;
    this.focus = 0;
    this.tab = 'inv';
    this.el = h('div', { class: 'inv-screen hidden' });
    root.appendChild(this.el);
  }

  toggle(v = !this.open) {
    this.open = v;
    this.picked = -1;
    this.tab = 'inv';
    this.el.classList.toggle('hidden', !v);
    if (v) {
      this.focus = this.app.match?.player?.inv?.sel ?? 0;
      this.app.audio.uiClick();
      this.render();
    }
  }

  // Tasten im offenen Menü: 1–5 wählen/tauschen, Q/E Reiter, Esc schließt
  handleInput(input, player) {
    if (!this.open) return;
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

  render() {
    if (!this.open) return;
    const app = this.app;
    const pl = app.match?.player;
    if (!pl) return;
    const inv = pl.inv;
    const keys = app.settings.get('keys');
    const coins = app.profile.data.coins || 0;
    const menu = h('div', { class: 'inv-menu' },
      h('div', { class: 'inv-logo' }, 'SHOWDOWN', h('b', {}, ' BAY')),
      ...[['inv', t('invTab'), 'backpack'], ['map', t('invMap'), 'map'], ['settings', t('menuSettings'), 'gear']].map(([id, label, ic]) =>
        h('button', {
          class: 'inv-menu-btn' + (this.tab === id ? ' sel' : ''),
          onclick: () => {
            app.audio.uiClick();
            if (id === 'map') { this.toggle(false); app.match.hud.toggleBigMap(true); return; }
            if (id === 'settings') { this.toggle(false); app.input.unlock(); app.ui.openSettings?.(); return; }
            this.tab = id; this.render();
          },
        }, h('span', { class: 'icon', html: ICON[ic] || '' }), label)),
      h('div', { class: 'inv-close-hint' }, t('invClose', { key: keyLabel(keys.scoreboard) })));

    // Währung + Ressourcen
    const res = h('div', { class: 'inv-res' },
      h('div', { class: 'inv-sec' }, h('div', { class: 'inv-h' }, t('invCurrency')),
        h('div', { class: 'inv-cur' }, h('span', { class: 'icon', html: ICON.coin }), h('b', {}, coins.toLocaleString('de-DE')), h('small', {}, t('coins')))),
      h('div', { class: 'inv-sec grow' }, h('div', { class: 'inv-h' }, t('invResources')),
        h('div', { class: 'inv-ammo-row' }, ...AMMO_TYPES.map((a) =>
          h('div', { class: 'inv-ammo', style: { '--ac': AMMO_COLOR[a] } },
            h('img', { src: itemIcon({ k: 'a', a, n: 1 }), alt: '' }),
            h('div', {}, h('b', {}, String(inv.ammo[a] || 0)), h('small', {}, t('a_' + a))))))));

    // Loadout
    const slots = h('div', { class: 'inv-slots' });
    for (let i = 0; i < 5; i++) {
      const it = inv.slots[i];
      const rar = it ? RARITY_COLORS[itemRarity(it)] : '#2a3350';
      slots.appendChild(h('div', {
        class: 'inv-slot' + (it ? '' : ' empty') + (i === inv.sel ? ' held' : '') + (i === this.picked ? ' picked' : '') + (i === this.focus ? ' focus' : ''),
        style: { '--rar': rar },
      },
      h('div', { class: 'inv-key' }, keyLabel(keys['slot' + (i + 1)])),
      it ? h('img', { src: itemIcon(it), alt: '' }) : null,
      it ? h('div', { class: 'inv-name' }, shortName(it)) : h('div', { class: 'inv-name dim' }, t('invEmpty')),
      it && it.k === 'w' ? h('div', { class: 'inv-count' }, `${it.mag}/${WEAPONS[it.w].mag}`) : it && it.k === 'c' ? h('div', { class: 'inv-count' }, '×' + it.n) : null));
    }

    const hint = h('div', { class: 'inv-hint' }, this.picked >= 0
      ? t('invSwapPick', { n: this.picked + 1 })
      : t('invSwapHint'));

    const main = h('div', { class: 'inv-main' },
      res,
      h('div', { class: 'inv-sec' }, h('div', { class: 'inv-h' }, t('invLoadout')), slots, hint),
      this.details(inv.slots[this.focus]));
    this.el.innerHTML = '';
    this.el.append(h('div', { class: 'inv-wrap' }, menu, main));
  }

  details(it) {
    if (!it) return h('div', { class: 'inv-details empty' });
    const rar = itemRarity(it);
    const rows = [];
    if (it.k === 'w') {
      const d = WEAPONS[it.w];
      rows.push([t('invDmg'), Math.round(d.dmg[it.r])], [t('invRate'), d.fireRate.toFixed(1) + '/s'], [t('invMag'), d.mag], [t('invReload'), d.reload[it.r].toFixed(2) + ' s'], [t('invAmmo'), t('a_' + d.ammo)]);
    } else if (it.k === 'c') {
      const c = CONSUMABLES[it.c];
      if (c.heal) rows.push([t('invHeal'), '+' + c.heal]);
      if (c.shield) rows.push([t('invShield'), '+' + c.shield + ' (max ' + c.cap + ')']);
      rows.push([t('invStack'), c.stack]);
    }
    return h('div', { class: 'inv-details', style: { '--rar': RARITY_COLORS[rar] } },
      h('img', { src: itemIcon(it), alt: '' }),
      h('div', { class: 'inv-d-body' },
        h('div', { class: 'inv-d-rar' }, t('rar_' + rar)),
        h('div', { class: 'inv-d-name' }, itemName(it)),
        h('div', { class: 'inv-d-stats' }, ...rows.map(([k, v]) => h('div', {}, h('span', {}, k), h('b', {}, String(v)))))));
  }
}
