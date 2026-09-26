// In-Match-HUD: Leben/Schild unten links, 5 Inventarplätze unten rechts, Minimap + Sturm +
// Spielerzahl oben rechts, Killfeed links, Fadenkreuz je Waffe, Nachlade-/Benutzen-Ring,
// F-Hinweis für Truhen und Beute, Zielfernrohr, Schadenszahlen (weiß/blau/gelb).
import * as THREE from 'three';
import { h, clear, esc, fmtTime } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';
import { keyLabel } from '../settings.js';
import { MAX_HEALTH, MAX_SHIELD } from '../../shared/constants.js';
import { WEAPONS, CONSUMABLES, RARITY_COLORS, AMMO_TYPES, itemRarity } from '../../shared/items.js';
import { MAP_EXTENT } from '../render/mapImage.js';
import { itemIcon } from '../render/itemIcons.js';

const _v = new THREE.Vector3();

export function itemName(it) {
  if (!it) return '';
  if (it.k === 'w') return t('w_' + it.w);
  if (it.k === 'c') return t('c_' + it.c);
  return t('a_' + it.a);
}

export class HUD {
  constructor(root, settings) {
    this.settings = settings;
    this.root = h('div', { class: 'hud hidden' });
    root.appendChild(this.root);
    this.dmgNums = [];
    this.indicators = [];
    this.tags = new Map();
    this.msgTimer = 0;
    this.minimapImg = null;
    this.bigMapOpen = false;
    this.build();
    this.applySettings();
    settings.onChange(() => this.applySettings());
    window.addEventListener('resize', () => this.applyScale());
  }

  // HUD-Größe aus Einstellung × Fenstergröße (kleine Fenster: alles etwas kleiner, nichts überlappt)
  applyScale() {
    const auto = Math.max(0.55, Math.min(1, window.innerWidth / 1500, window.innerHeight / 820));
    this.root.style.setProperty('--hud-scale', (this.settings.get('hudScale') / 100) * auto);
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    // ---- oben rechts: Minimap, Sturm, Zähler ----
    this.mmCanvas = h('canvas', { width: 220, height: 220 });
    this.mm = h('div', { class: 'hud-minimap' }, this.mmCanvas);
    this.stormEl = h('div', { class: 'hud-storm' });
    this.aliveEl = h('b', {}, '12');
    this.killsEl = h('b', {}, '0');
    const counters = h('div', { class: 'hud-counters' },
      h('div', { class: 'counter' }, h('span', { class: 'icon', html: ICON.person }), this.aliveEl),
      h('div', { class: 'counter' }, h('span', { class: 'icon', html: ICON.skull }), this.killsEl));
    const tr = h('div', { class: 'hud-tr' }, this.mm, h('div', { class: 'hud-info' }, this.stormEl, counters));
    // ---- oben links: Leistung, Killfeed ----
    this.stats = h('div', { class: 'hud-perf' });
    this.feedEl = h('div', { class: 'hud-feed' });
    const tl = h('div', { class: 'hud-tl' }, this.stats, this.feedEl);
    // ---- unten links: Schild + Leben ----
    this.osRow = h('div', { class: 'bar-row os hidden' }, h('span', { class: 'bar-ico', html: ICON.shield }), h('div', { class: 'bar' }, h('div', { class: 'bar-fill' })), h('span', { class: 'bar-num' }));
    this.shRow = h('div', { class: 'bar-row sh' }, h('span', { class: 'bar-ico', html: ICON.shield }), h('div', { class: 'bar' }, h('div', { class: 'bar-ghost' }), h('div', { class: 'bar-fill' })), h('span', { class: 'bar-num' }));
    this.hpRow = h('div', { class: 'bar-row hp' }, h('span', { class: 'bar-ico', html: ICON.cross2 }), h('div', { class: 'bar' }, h('div', { class: 'bar-ghost' }), h('div', { class: 'bar-fill' })), h('span', { class: 'bar-num' }));
    const bl = h('div', { class: 'hud-bl' }, this.osRow, this.shRow, this.hpRow);
    // ---- unten rechts: Munition + Inventar ----
    this.ammoBig = h('div', { class: 'ammo-big' });
    this.ammoRes = h('div', { class: 'ammo-res' });
    this.slotEls = [];
    const bar = h('div', { class: 'hotbar' });
    for (let i = 0; i < 5; i++) {
      const el = h('div', { class: 'slot empty' }, h('div', { class: 'slot-key' }), h('img', { class: 'slot-img', alt: '' }), h('div', { class: 'slot-count' }));
      bar.appendChild(el);
      this.slotEls.push(el);
    }
    this.itemLabel = h('div', { class: 'item-label' });
    const br = h('div', { class: 'hud-br' }, this.itemLabel, h('div', { class: 'ammo-line' }, this.ammoBig, this.ammoRes), bar);
    // ---- Mitte ----
    this.cross = h('div', { class: 'crosshair' });
    this.hitmarkerEl = h('div', { class: 'hitmarker' });
    this.ring = h('div', { class: 'progress-ring hidden', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="bg"/><circle cx="50" cy="50" r="42" class="fg"/></svg>' });
    this.ringFg = this.ring.querySelector('.fg');
    this.useLabel = h('div', { class: 'use-label hidden' });
    this.center = h('div', { class: 'hud-center' }, this.cross, this.hitmarkerEl, this.ring, this.useLabel);
    this.prompt = h('div', { class: 'interact hidden' });
    this.scope = h('div', { class: 'scope hidden' }, h('div', { class: 'scope-lens' }), h('div', { class: 'scope-h' }), h('div', { class: 'scope-v' }));
    this.msgEl = h('div', { class: 'hud-msg' });
    this.bigMsgEl = h('div', { class: 'hud-bigmsg' });
    this.countEl = h('div', { class: 'hud-count' });
    this.pickEl = h('div', { class: 'pickups' });
    // Overlays
    this.vignette = h('div', { class: 'dmg-vignette' });
    this.stormTint = h('div', { class: 'storm-tint' });
    this.indEl = h('div', { class: 'dmg-indicators' });
    this.numsEl = h('div', { class: 'dmg-numbers' });
    this.tagsEl = h('div', { class: 'name-tags' });
    this.floatEl = h('div', { class: 'heal-float' });
    this.specEl = h('div', { class: 'spectate-bar hidden' });
    this.scoreEl = h('div', { class: 'scoreboard hidden' });
    this.bigMap = h('div', { class: 'bigmap hidden' });
    this.bigMapCanvas = h('canvas', { width: 900, height: 900 });
    this.bigMap.appendChild(h('div', { class: 'bigmap-inner' }, h('div', { class: 'bigmap-title' }, t('bigMap'), h('small', {}, ' · ' + t('mapClose'))), this.bigMapCanvas));
    r.append(this.scope, this.stormTint, this.vignette, this.tagsEl, this.numsEl, this.indEl, tl, tr, bl, br, this.center, this.prompt,
      this.msgEl, this.bigMsgEl, this.countEl, this.pickEl, this.floatEl, this.specEl, this.scoreEl, this.bigMap);
    this.buildCrosshair();
    this.cache = {};
  }

  applySettings() {
    const s = this.settings;
    this.applyScale();
    this.root.classList.toggle('no-minimap', !s.get('minimap'));
    this.root.dataset.cb = s.get('colorblind');
    const keys = s.get('keys');
    this.slotEls.forEach((el, i) => { el.firstChild.textContent = keyLabel(keys['slot' + (i + 1)]); });
    this.cache = {};
    this.buildCrosshair();
  }

  buildCrosshair() {
    const s = this.settings;
    const shape = s.get('crossShape');
    const el = this.cross;
    if (!el) return;
    el.className = 'crosshair shape-' + shape;
    el.style.setProperty('--cross-color', s.get('crossColor'));
    el.style.setProperty('--cross-size', s.get('crossSize') / 100);
    el.innerHTML = '';
    if (shape === 'cross' || shape === 't') {
      for (const d of shape === 't' ? ['l', 'r', 'b'] : ['t', 'l', 'r', 'b']) el.appendChild(h('div', { class: 'ch-line ch-' + d }));
    } else if (shape === 'circle') el.appendChild(h('div', { class: 'ch-circle' }));
    if (s.get('crossDot') || shape === 'dot') el.appendChild(h('div', { class: 'ch-dot' }));
    // Schrotflinten: Streukreis mit vier Ecken
    el.appendChild(h('div', { class: 'ch-spread' }, h('i'), h('i'), h('i'), h('i')));
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  setMapImage(canvas, pois) {
    this.minimapImg = canvas;
    this.pois = pois;
  }

  // ---------------- pro Frame ----------------
  update(dt, d) {
    const s = this.settings;
    const c = this.cache;
    // Leben / Schild / Überschild
    this.setBar(this.hpRow, 'hp', d.health, MAX_HEALTH, dt);
    this.setBar(this.shRow, 'sh', d.shield, MAX_SHIELD, dt);
    const os = Math.round(d.overshield);
    if (c.os !== os) {
      c.os = os;
      this.osRow.classList.toggle('hidden', os <= 0);
      this.osRow.querySelector('.bar-fill').style.width = (os / 50) * 100 + '%';
      this.osRow.lastChild.textContent = os;
    }
    // Inventar
    this.updateSlots(d.inv);
    // Munition der Waffe in der Hand
    const it = d.inv.slots[d.inv.sel];
    const w = it && it.k === 'w' ? WEAPONS[it.w] : null;
    const ammoKey = w ? `${it.mag}|${d.inv.ammo[w.ammo]}|${w.ammo}` : '';
    if (c.ammo !== ammoKey) {
      c.ammo = ammoKey;
      if (w) {
        this.ammoBig.innerHTML = `<span class="mag ${it.mag === 0 ? 'empty' : it.mag <= Math.ceil(w.mag * 0.2) ? 'low' : ''}">${it.mag}</span>`;
        this.ammoRes.innerHTML = `<span class="ammo-dot a-${w.ammo}"></span>${d.inv.ammo[w.ammo]}`;
      } else {
        this.ammoBig.innerHTML = '';
        this.ammoRes.innerHTML = '';
      }
    }
    const label = it ? `${it.k === 'w' ? `<i style="background:${RARITY_COLORS[itemRarity(it)]}"></i>` : ''}${esc(itemName(it))}` : '';
    if (c.label !== label) {
      c.label = label;
      this.itemLabel.innerHTML = label;
    }
    // Zähler
    const aliveTxt = String(d.aliveCount);
    if (c.alive !== aliveTxt) { c.alive = aliveTxt; this.aliveEl.textContent = aliveTxt; }
    if (c.kills !== d.kills) { c.kills = d.kills; this.killsEl.textContent = d.kills; }
    // Sturm
    const z = d.zone;
    if (d.stormOn && z) {
      const txt = d.phase === 'countdown' ? '' : z.done ? t('stormShrinkLabel') : (z.shrinking ? `${t('stormShrinkLabel')} ${fmtTime(z.timeLeft)}` : `${t('stormNext')} ${fmtTime(z.timeLeft)}`);
      const html = `${ICON.storm}<span>${esc(txt)}</span><small>${t('stormPhase', { n: z.phase })}</small>`;
      if (c.storm !== html) { c.storm = html; this.stormEl.innerHTML = html; }
      this.stormEl.classList.toggle('shrinking', !!z.shrinking);
      this.stormEl.classList.remove('hidden');
    } else this.stormEl.classList.add('hidden');
    this.stormTint.style.opacity = d.inStorm ? '1' : '0';
    // Leistung
    const parts = [];
    if (s.get('showFps')) parts.push(`${Math.round(d.fps)} FPS`);
    if (s.get('showPing') && d.ping !== null) parts.push(`${Math.round(d.ping)} ms`);
    const perf = parts.join(' · ');
    if (c.perf !== perf) { c.perf = perf; this.stats.textContent = perf; this.stats.style.display = perf ? '' : 'none'; }
    // Fadenkreuz
    const pellets = w && w.pellets > 1;
    this.cross.classList.toggle('shotgun', !!pellets);
    this.cross.classList.toggle('noweapon', !w);
    if (pellets) this.cross.style.setProperty('--spread', Math.round(d.spread * 7.5 + 8) + 'px');
    else this.cross.style.setProperty('--gap', 4 + d.spread * 5.5 + 'px');
    this.cross.classList.toggle('enemy', !!d.overEnemy);
    this.cross.classList.toggle('hidden', !!d.hideCross);
    this.scope.classList.toggle('hidden', !d.scoped);
    // Fortschrittsring (Nachladen / Benutzen)
    const prog = d.use01 >= 0 ? d.use01 : d.reload01;
    if (prog >= 0 && d.alive) {
      this.ring.classList.remove('hidden');
      this.ringFg.style.strokeDashoffset = String(264 * (1 - Math.min(1, prog)));
      this.ring.classList.toggle('heal', d.use01 >= 0);
    } else this.ring.classList.add('hidden');
    if (d.useItem && d.alive) {
      const def = CONSUMABLES[d.useItem.c];
      const left = Math.max(0, def.use * (1 - d.use01)).toFixed(1);
      this.useLabel.textContent = `${itemName(d.useItem)} · ${left} s`;
      this.useLabel.classList.remove('hidden');
    } else this.useLabel.classList.add('hidden');
    // F-Hinweis
    this.updatePrompt(d.target);
    // Meldungen
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msgEl.classList.remove('show');
    }
    if (this.bigTimer > 0) {
      this.bigTimer -= dt;
      if (this.bigTimer <= 0) this.bigMsgEl.classList.remove('show');
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.hitmarkerEl.className = 'hitmarker';
    }
    // Karten
    if (s.get('minimap')) this.drawMinimap(d);
    if (this.bigMapOpen) {
      // große Karte reicht mit ~15 Bildern/s (spart Zeichenarbeit)
      this.bigMapT = (this.bigMapT || 0) - dt;
      if (this.bigMapT <= 0) {
        this.bigMapT = 1 / 15;
        this.drawBigMap(d);
      }
    }
    // Schadensindikatoren
    for (const ind of this.indicators) {
      ind.t -= dt;
      const ang = Math.atan2(ind.x - d.px, -(ind.z - d.pz));
      const rel = ang + d.yaw;
      ind.el.style.transform = `translate(-50%,-50%) rotate(${rel}rad)`;
      ind.el.style.opacity = Math.max(0, Math.min(1, ind.t));
    }
    this.indicators = this.indicators.filter((i) => {
      if (i.t <= 0) i.el.remove();
      return i.t > 0;
    });
  }

  setBar(row, key, value, max, dt) {
    const v = Math.max(0, Math.round(value));
    const pct = (v / max) * 100;
    const gk = key + 'Ghost';
    this[gk] = this[gk] === undefined ? pct : Math.max(pct, this[gk] - dt * 45);
    const fill = row.querySelector('.bar-fill');
    const ghost = row.querySelector('.bar-ghost');
    if (this.cache[key] !== v) {
      this.cache[key] = v;
      fill.style.width = pct + '%';
      row.lastChild.textContent = `${v}`;
      row.classList.toggle('low', key === 'hp' && v <= 30);
      row.classList.toggle('zero', v <= 0);
    }
    ghost.style.width = this[gk] + '%';
  }

  updateSlots(inv) {
    const key = inv.slots.map((it) => (it ? (it.k === 'w' ? `${it.w}${it.r}:${it.mag}` : `${it.c}:${it.n}`) : '-')).join('|') + '#' + inv.sel;
    if (this.cache.slots === key) return;
    this.cache.slots = key;
    inv.slots.forEach((it, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('sel', i === inv.sel);
      el.classList.toggle('empty', !it);
      const img = el.children[1];
      const cnt = el.children[2];
      if (!it) {
        el.style.removeProperty('--rar');
        img.removeAttribute('src');
        cnt.textContent = '';
        el._k = null;
        return;
      }
      el.style.setProperty('--rar', RARITY_COLORS[itemRarity(it)]);
      const k = it.k === 'w' ? `w${it.w}${it.r}` : `c${it.c}`;
      if (el._k !== k) {
        el._k = k;
        img.src = itemIcon(it);
      }
      cnt.textContent = it.k === 'w' ? String(it.mag) : String(it.n);
      el.classList.toggle('mag-empty', it.k === 'w' && it.mag === 0);
    });
  }

  updatePrompt(tg) {
    const key = tg ? `${tg.kind}${tg.id}` : '';
    if (this.cache.prompt === key) return;
    this.cache.prompt = key;
    if (!tg) {
      this.prompt.classList.add('hidden');
      return;
    }
    const k = keyLabel(this.settings.get('keys').interact);
    const el = this.prompt;
    el.classList.remove('hidden');
    if (tg.kind === 'c') {
      el.style.removeProperty('--rar');
      el.innerHTML = `<span class="key">${esc(k)}</span><span class="ip-text">${esc(t('openChest'))}</span>`;
    } else {
      const it = tg.item;
      const rar = itemRarity(it);
      el.style.setProperty('--rar', RARITY_COLORS[rar]);
      const detail = it.k === 'w' ? `${t('rar_' + rar)} · ${WEAPONS[it.w].mag} ${t('magShort')}` : `x${it.n}`;
      el.innerHTML = `<span class="key">${esc(k)}</span><img src="${itemIcon(it)}" alt=""><span class="ip-text"><b>${esc(itemName(it))}</b><small>${esc(detail)}</small></span>`;
    }
  }

  // Projektionen (Schadenszahlen) – braucht Kamera
  project(camera, w, hgt) {
    for (const n of this.dmgNums) {
      n.t += 1 / 60;
      _v.set(n.x, n.y + n.t * 0.9, n.z).project(camera);
      if (_v.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      n.el.style.transform = `translate(${((_v.x + 1) / 2) * w + n.ox}px, ${((1 - _v.y) / 2) * hgt}px) translate(-50%,-50%)`;
    }
  }

  updateTags(camera, w, hgt, list) {
    const seen = new Set();
    for (const tg of list) {
      seen.add(tg.id);
      let el = this.tags.get(tg.id);
      if (!el) {
        el = h('div', { class: 'name-tag' }, h('div', { class: 'nt-name' }), h('div', { class: 'nt-bars' }, h('div', { class: 'nt-sh' }, h('i')), h('div', { class: 'nt-hp' }, h('i'))));
        this.tagsEl.appendChild(el);
        this.tags.set(tg.id, el);
      }
      _v.set(tg.x, tg.y + 2.2, tg.z).project(camera);
      if (_v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      const scale = Math.max(0.6, Math.min(1.1, 14 / Math.max(1, tg.dist)));
      el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * hgt}px) translate(-50%,-100%) scale(${scale})`;
      const nameHtml = (tg.crown ? `<span class="nt-crown">${ICON.crown}</span>` : '') + esc(tg.name);
      if (el._name !== nameHtml) {
        el._name = nameHtml;
        el.firstChild.innerHTML = nameHtml;
      }
      const bars = el.lastChild;
      bars.style.display = tg.showBar ? '' : 'none';
      if (tg.showBar) {
        bars.firstChild.firstChild.style.width = Math.min(100, (tg.shield / MAX_SHIELD) * 100) + '%';
        bars.firstChild.style.display = tg.shield > 0 ? '' : 'none';
        bars.lastChild.firstChild.style.width = Math.max(0, (tg.health / MAX_HEALTH) * 100) + '%';
      }
    }
    for (const [id, el] of this.tags) {
      if (!seen.has(id)) {
        el.remove();
        this.tags.delete(id);
      }
    }
  }

  // ---------------- Ereignisse ----------------
  hitmarker(head, kill, shield = false) {
    this.hitmarkerEl.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '') + (shield ? ' shield' : '');
    this.hitmarkerEl.innerHTML = kill ? ICON.skull : '<i></i><i></i><i></i><i></i>';
    this.hitT = kill ? 0.5 : 0.18;
  }

  // kind: 'health' (weiß) | 'shield' (blau) | 'head' (gelb)
  damageNumber(pos, dmg, kind) {
    if (!this.settings.get('damageNumbers')) return;
    const el = h('div', { class: 'dmg-num ' + kind }, String(dmg));
    this.numsEl.appendChild(el);
    const n = { el, x: pos[0], y: pos[1], z: pos[2], t: 0, ox: (Math.random() - 0.5) * 36 };
    this.dmgNums.push(n);
    setTimeout(() => {
      el.remove();
      this.dmgNums = this.dmgNums.filter((q) => q !== n);
    }, 950);
  }

  damageIndicator(x, z) {
    const el = h('div', { class: 'dmg-ind' }, h('div', { class: 'dmg-ind-arc' }));
    this.indEl.appendChild(el);
    this.indicators.push({ el, x, z, t: 1.6 });
  }

  flashDamage(shieldOnly = false) {
    this.vignette.classList.remove('flash', 'shield');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
    if (shieldOnly) this.vignette.classList.add('shield');
  }

  flashAmmo() {
    this.ammoBig.classList.remove('pulse');
    void this.ammoBig.offsetWidth;
    this.ammoBig.classList.add('pulse');
  }

  pulseEmpty() {
    this.ammoBig.classList.remove('shake');
    void this.ammoBig.offsetWidth;
    this.ammoBig.classList.add('shake');
    this.message(t('reloadHint', { key: keyLabel(this.settings.get('keys').reload) }), 'warn');
  }

  // Schild eines Gegners gebrochen
  shieldBroken() {
    this.hitmarkerEl.classList.add('break');
  }

  siphon(amount) {
    const el = h('div', { class: 'float-num siphon' }, '+' + amount);
    this.floatEl.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  pickupToast(it) {
    const el = h('div', { class: 'pickup', style: { '--rar': RARITY_COLORS[itemRarity(it)] } },
      h('img', { src: itemIcon(it), alt: '' }), h('span', {}, itemName(it)), it.k === 'c' ? h('b', {}, 'x' + it.n) : null);
    this.pickEl.prepend(el);
    while (this.pickEl.children.length > 4) this.pickEl.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  message(text, type = '') {
    this.msgEl.textContent = text;
    this.msgEl.className = 'hud-msg show ' + type;
    this.msgTimer = 2.2;
  }

  bigMessage(text, sub = '', cls = '') {
    this.bigMsgEl.innerHTML = `<div class="bm-main">${esc(text)}</div>${sub ? `<div class="bm-sub">${esc(sub)}</div>` : ''}`;
    this.bigMsgEl.className = 'hud-bigmsg show ' + cls;
    this.bigTimer = 2.6;
  }

  countdown(n) {
    if (n === null) {
      this.countEl.className = 'hud-count';
      return;
    }
    this.countEl.textContent = n === 0 ? t('go') : String(n);
    this.countEl.className = 'hud-count show' + (n === 0 ? ' go' : '');
    void this.countEl.offsetWidth;
    this.countEl.classList.add('pop');
  }

  killfeed(e) {
    const weapon = e.cause === 'storm' ? t('kfStorm') : e.cause === 'leave' ? t('kfLeft') : t('w_' + e.cause);
    const nm = (name, crown, me, bot) => `<span class="kf-name ${me ? 'me' : ''}">${crown ? `<span class="kf-crown">${ICON.crown}</span>` : ''}${esc(name)}${bot ? ' <small>BOT</small>' : ''}</span>`;
    const html = (e.killer ? nm(e.killer, e.killerCrown, e.killerMe, e.killerBot) : '') +
      `<span class="kf-weapon">${esc(weapon)}</span>` + (e.headshot ? `<span class="kf-hs">${ICON.headshot}</span>` : '') + nm(e.victim, e.victimCrown, e.victimMe, e.victimBot);
    const el = h('div', { class: 'kf-row' + (e.killerMe || e.victimMe ? ' involved' : ''), html });
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 6500);
    setTimeout(() => el.remove(), 7200);
  }

  setSpectate(text) {
    if (!text) {
      this.specEl.classList.add('hidden');
      return;
    }
    this.specEl.classList.remove('hidden');
    this.specEl.innerHTML = text;
  }

  // ---------------- Scoreboard ----------------
  showScoreboard(show, rows) {
    this.scoreEl.classList.toggle('hidden', !show);
    if (!show) return;
    const sorted = rows.slice().sort((a, b) => (b.alive - a.alive) || (b.kills - a.kills) || (a.placement - b.placement));
    this.scoreEl.innerHTML = `<div class="sb-inner panel"><div class="sb-title">${t('scoreboard')} · ${rows.filter((r) => r.alive).length}/${rows.length} ${t('alive')}</div>
      <table><thead><tr><th>#</th><th>${t('player')}</th><th>${t('killsLabel')}</th><th>${t('damage')}</th><th>${t('status')}</th><th>${t('ping')}</th></tr></thead><tbody>
      ${sorted.map((r, i) => `<tr class="${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${i + 1}</td><td>${r.crown ? `<span class="sb-crown">${ICON.crown}<b>${r.streak}</b></span>` : ''}${esc(r.name)} ${r.isBot ? '<span class="bot-tag">BOT</span>' : ''}</td><td>${r.kills}</td><td>${r.damage ?? '–'}</td><td>${r.alive ? `<span class="alive-dot"></span>${t('alive')}` : `${t('dead')} #${r.placement}`}</td><td>${r.isBot ? '–' : (r.ping ? Math.round(r.ping) + ' ms' : '–')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ---------------- Karten ----------------
  drawMinimap(d) {
    const c = this.mmCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const R = W / 2;
    const range = 40; // Meter vom Zentrum zum Rand
    const pxPerM = R / range;
    g.fillStyle = '#39c5d6';
    g.fillRect(0, 0, W, W);
    g.save();
    g.translate(R, R);
    g.rotate(d.yaw);
    if (this.minimapImg) {
      const s = (MAP_EXTENT * 2) * pxPerM;
      g.drawImage(this.minimapImg, (-MAP_EXTENT - d.px) * pxPerM, (-MAP_EXTENT - d.pz) * pxPerM, s, s);
    }
    if (d.stormOn && d.zone) {
      const z = d.zone;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(190,120,255,0.95)';
      g.beginPath();
      g.arc((z.x - d.px) * pxPerM, (z.z - d.pz) * pxPerM, Math.max(1, z.r * pxPerM), 0, Math.PI * 2);
      g.stroke();
      if (z.next) {
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 2;
        g.setLineDash([6, 4]);
        g.beginPath();
        g.arc((z.next.x - d.px) * pxPerM, (z.next.z - d.pz) * pxPerM, Math.max(1, z.next.r * pxPerM), 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }
    if (this.pois) {
      g.font = '700 12px "Barlow Condensed", sans-serif';
      g.textAlign = 'center';
      for (const p of this.pois) {
        const x = (p.x - d.px) * pxPerM, y = (p.z - d.pz) * pxPerM;
        if (Math.hypot(x, y) > R * 1.5) continue;
        g.save();
        g.translate(x, y);
        g.rotate(-d.yaw);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(p.name.toUpperCase(), 1, 1);
        g.fillStyle = '#fff';
        g.fillText(p.name.toUpperCase(), 0, 0);
        g.restore();
      }
    }
    g.restore();
    // Spielerpfeil
    g.save();
    g.translate(R, R);
    g.fillStyle = '#ffe14d';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // Norden
    const nx = R - Math.sin(-d.yaw) * (R - 12);
    const ny = R - Math.cos(-d.yaw) * (R - 12);
    const cx = Math.max(10, Math.min(W - 10, nx)), cy = Math.max(10, Math.min(W - 10, ny));
    g.font = '700 13px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(10,20,50,0.85)';
    g.beginPath();
    g.arc(cx, cy, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText('N', cx, cy + 1);
    g.textBaseline = 'alphabetic';
  }

  toggleBigMap(show) {
    this.bigMapOpen = show;
    this.bigMapT = 0;
    this.bigMap.classList.toggle('hidden', !show);
  }

  drawBigMap(d) {
    const c = this.bigMapCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const pxPerM = W / (MAP_EXTENT * 2);
    const toX = (x) => (x + MAP_EXTENT) * pxPerM;
    g.fillStyle = '#39c5d6';
    g.fillRect(0, 0, W, W);
    if (this.minimapImg) g.drawImage(this.minimapImg, 0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo((i * W) / 10, 0); g.lineTo((i * W) / 10, W); g.stroke();
      g.beginPath(); g.moveTo(0, (i * W) / 10); g.lineTo(W, (i * W) / 10); g.stroke();
    }
    if (d.stormOn && d.zone) {
      const z = d.zone;
      g.save();
      g.fillStyle = 'rgba(120,50,200,0.35)';
      g.beginPath();
      g.rect(0, 0, W, W);
      g.arc(toX(z.x), toX(z.z), Math.max(0.5, z.r * pxPerM), 0, Math.PI * 2, true);
      g.fill('evenodd');
      g.restore();
      g.lineWidth = 3;
      g.strokeStyle = '#c38bff';
      g.beginPath();
      g.arc(toX(z.x), toX(z.z), Math.max(0.5, z.r * pxPerM), 0, Math.PI * 2);
      g.stroke();
      if (z.next) {
        g.strokeStyle = '#fff';
        g.setLineDash([8, 6]);
        g.beginPath();
        g.arc(toX(z.next.x), toX(z.next.z), Math.max(0.5, z.next.r * pxPerM), 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }
    g.font = '700 26px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    for (const p of this.pois || []) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(p.name.toUpperCase(), toX(p.x) + 2, toX(p.z) + 2);
      g.fillStyle = '#fff';
      g.fillText(p.name.toUpperCase(), toX(p.x), toX(p.z));
    }
    g.save();
    g.translate(toX(d.px), toX(d.pz));
    g.rotate(-d.yaw);
    g.fillStyle = '#ffe14d';
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(10, 11);
    g.lineTo(0, 5);
    g.lineTo(-10, 11);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  reset() {
    clear(this.feedEl);
    clear(this.numsEl);
    clear(this.indEl);
    clear(this.tagsEl);
    clear(this.pickEl);
    this.tags.clear();
    this.dmgNums = [];
    this.indicators = [];
    this.msgEl.classList.remove('show');
    this.bigMsgEl.classList.remove('show');
    this.countdown(null);
    this.setSpectate(null);
    this.showScoreboard(false);
    this.toggleBigMap(false);
    this.hpGhost = undefined;
    this.shGhost = undefined;
    this.cache = {};
  }
}

export { AMMO_TYPES };
