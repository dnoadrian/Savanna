// In-Match-HUD im Stil moderner Battle-Royales.
import * as THREE from 'three';
import { h, clear, esc, fmtTime } from './dom.js';
import { ICON, icon } from './icons.js';
import { t } from '../i18n.js';
import { MAX_HP, MEDKIT_MAX, WEAPON } from '../../shared/constants.js';
import { MAP_EXTENT } from '../render/mapImage.js';

const _v = new THREE.Vector3();

export class HUD {
  constructor(root, settings) {
    this.settings = settings;
    this.root = h('div', { class: 'hud hidden' });
    root.appendChild(this.root);
    this.build();
    this.dmgNums = [];
    this.indicators = [];
    this.tags = new Map();
    this.msgTimer = 0;
    this.feed = [];
    this.minimapImg = null;
    this.bigMapOpen = false;
    this.applySettings();
    settings.onChange(() => this.applySettings());
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    // Oben links: Minimap
    this.mm = h('div', { class: 'hud-minimap' });
    this.mmCanvas = h('canvas', { width: 220, height: 220 });
    this.mm.appendChild(this.mmCanvas);
    this.stats = h('div', { class: 'hud-perf' });
    const tl = h('div', { class: 'hud-tl' }, this.mm, this.stats);
    // Oben rechts
    this.aliveEl = h('span', { class: 'num' }, '12');
    this.killsEl = h('span', { class: 'num' }, '0');
    this.stormEl = h('div', { class: 'hud-storm' });
    this.feedEl = h('div', { class: 'hud-feed' });
    const tr = h('div', { class: 'hud-tr' },
      h('div', { class: 'hud-counters' },
        h('div', { class: 'counter', title: t('alive') }, h('span', { html: ICON.person, class: 'icon' }), this.aliveEl),
        h('div', { class: 'counter' }, h('span', { html: ICON.skull, class: 'icon' }), this.killsEl)),
      this.stormEl, this.feedEl);
    // Unten links: Leben
    this.hpFill = h('div', { class: 'hp-fill' });
    this.hpGhost = h('div', { class: 'hp-ghost' });
    this.hpText = h('div', { class: 'hp-text' }, '200');
    const bl = h('div', { class: 'hud-bl' },
      h('div', { class: 'hp-bar' }, this.hpGhost, this.hpFill, h('div', { class: 'hp-plus', html: ICON.heart }), this.hpText));
    // Unten rechts: Hotbar
    this.slot1Ammo = h('div', { class: 'slot-ammo' }, '30');
    this.slot2Count = h('div', { class: 'slot-count' }, '1');
    this.slot1 = h('div', { class: 'slot active' }, h('div', { class: 'slot-key' }, '1'), h('div', { class: 'slot-icon', html: ICON.rifle }), this.slot1Ammo);
    this.slot2 = h('div', { class: 'slot medkit-slot' }, h('div', { class: 'slot-key' }, '2'), h('div', { class: 'slot-icon', html: ICON.medkit }), this.slot2Count);
    this.bigAmmo = h('div', { class: 'big-ammo' });
    const br = h('div', { class: 'hud-br' }, this.bigAmmo, h('div', { class: 'hotbar' }, this.slot1, this.slot2));
    // Mitte
    this.cross = h('div', { class: 'crosshair' });
    this.hitmarkerEl = h('div', { class: 'hitmarker' });
    this.ammoNear = h('div', { class: 'ammo-near' });
    // kleiner Kreis um das Fadenkreuz, der sich beim Nachladen/Heilen langsam schließt (ohne Text)
    this.ring = h('div', { class: 'progress-ring hidden', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="bg"/><circle cx="50" cy="50" r="42" class="fg"/></svg>' });
    this.ringFg = this.ring.querySelector('.fg');
    this.msgEl = h('div', { class: 'hud-msg' });
    this.bigMsgEl = h('div', { class: 'hud-bigmsg' });
    this.countEl = h('div', { class: 'hud-count' });
    this.center = h('div', { class: 'hud-center' }, this.cross, this.hitmarkerEl, this.ammoNear, this.ring);
    // Overlays
    this.vignette = h('div', { class: 'dmg-vignette' });
    this.stormTint = h('div', { class: 'storm-tint' });
    this.indEl = h('div', { class: 'dmg-indicators' });
    this.numsEl = h('div', { class: 'dmg-numbers' });
    this.tagsEl = h('div', { class: 'name-tags' });
    this.healEl = h('div', { class: 'heal-float' });
    this.fsHint = h('div', { class: 'fs-hint' }, t('fullscreenHint'));
    this.specEl = h('div', { class: 'spectate-bar hidden' });
    this.scoreEl = h('div', { class: 'scoreboard hidden' });
    this.bigMap = h('div', { class: 'bigmap hidden' });
    this.bigMapCanvas = h('canvas', { width: 900, height: 900 });
    this.bigMap.appendChild(h('div', { class: 'bigmap-inner' }, h('div', { class: 'bigmap-title' }, t('bigMap'), h('small', {}, ' · ' + t('mapClose'))), this.bigMapCanvas));
    r.append(this.stormTint, this.vignette, this.tagsEl, this.numsEl, this.indEl, tl, tr, bl, br, this.center, this.msgEl, this.bigMsgEl, this.countEl, this.healEl, this.fsHint, this.specEl, this.scoreEl, this.bigMap);
    this.buildCrosshair();
  }

  applySettings() {
    const s = this.settings;
    this.root.style.setProperty('--hud-scale', s.get('hudScale') / 100);
    this.root.classList.toggle('no-minimap', !s.get('minimap'));
    this.root.dataset.cb = s.get('colorblind');
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
    // Leben
    const hp = Math.max(0, d.hp);
    const pct = (hp / MAX_HP) * 100;
    this.hpFill.style.width = pct + '%';
    this.hpGhostPct = this.hpGhostPct === undefined ? pct : Math.max(pct, this.hpGhostPct - dt * 40);
    this.hpGhost.style.width = this.hpGhostPct + '%';
    this.hpText.textContent = Math.ceil(hp);
    this.hpFill.parentElement.classList.toggle('low', hp < 60);
    // Munition
    const reserve = d.reserve === Infinity ? '∞' : d.reserve;
    const ammoTxt = `${d.mag} / ${reserve}`;
    if (this._ammo !== ammoTxt) {
      this._ammo = ammoTxt;
      this.slot1Ammo.textContent = ammoTxt;
      this.bigAmmo.innerHTML = `<span class="mag ${d.mag <= 5 ? 'low' : ''}">${d.mag}</span><span class="res">/ ${reserve}</span>`;
      this.bigAmmo.classList.toggle('empty', d.mag === 0);
      this.ammoNear.textContent = ammoTxt;
      this.ammoNear.classList.toggle('low', d.mag <= 5);
      this.ammoNear.classList.toggle('empty', d.mag === 0);
    }
    this.slot2Count.textContent = `${d.medkits}/${MEDKIT_MAX}`;
    this.slot2.classList.toggle('empty', d.medkits <= 0);
    this.slot1.classList.toggle('active', !d.healing);
    this.slot2.classList.toggle('active', !!d.healing);
    // Zähler
    this.aliveEl.textContent = `${d.alive}/${d.total}`;
    this.killsEl.textContent = d.kills;
    // Sturm
    const z = d.zone;
    if (d.stormOn && z) {
      const txt = d.phase === 'countdown' ? '' : z.done ? t('stormShrinkLabel') : (z.shrinking ? `${t('stormShrinkLabel')} ${fmtTime(z.timeLeft)}` : `${t('stormNext')} ${fmtTime(z.timeLeft)}`);
      this.stormEl.innerHTML = `${ICON.storm}<span>${esc(txt)}</span><small>${t('stormPhase', { n: z.phase })}</small>`;
      this.stormEl.classList.toggle('shrinking', !!z.shrinking);
      this.stormEl.classList.remove('hidden');
    } else this.stormEl.classList.add('hidden');
    this.stormTint.style.opacity = d.inStorm ? '1' : '0';
    // Perf
    const parts = [];
    if (s.get('showFps')) parts.push(`${Math.round(d.fps)} FPS`);
    if (s.get('showPing') && d.ping !== null) parts.push(`${Math.round(d.ping)} ms`);
    this.stats.textContent = parts.join(' · ');
    this.stats.style.display = parts.length ? '' : 'none';
    // Fadenkreuz-Spreizung
    const gap = 4 + d.spread * 5.5;
    this.cross.style.setProperty('--gap', gap + 'px');
    this.cross.classList.toggle('enemy', !!d.overEnemy);
    this.cross.classList.toggle('hidden', !!d.hideCross);
    this.ammoNear.classList.toggle('hidden', !!d.hideCross);
    // Fortschrittsring
    if (d.progress !== null && d.progress !== undefined) {
      this.ring.classList.remove('hidden');
      this.ringFg.style.strokeDashoffset = String(264 * (1 - Math.min(1, d.progress)));
      this.ring.classList.toggle('heal', d.progressType === 'heal');
    } else this.ring.classList.add('hidden');
    // Vollbild-Hinweis
    this.fsHint.classList.toggle('hidden', !!document.fullscreenElement || d.phase === 'ended');
    // Meldung
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msgEl.classList.remove('show');
    }
    if (this.bigTimer > 0) {
      this.bigTimer -= dt;
      if (this.bigTimer <= 0) this.bigMsgEl.classList.remove('show');
    }
    // Hitmarker
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.hitmarkerEl.className = 'hitmarker';
    }
    // Minimap
    if (s.get('minimap')) this.drawMinimap(d);
    if (this.bigMapOpen) this.drawBigMap(d);
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

  // Projektionen (Schadenszahlen, Namensschilder) – braucht Kamera
  project(camera, w, hgt) {
    for (const n of this.dmgNums) {
      n.t += 1 / 60;
      _v.set(n.x, n.y + n.t * 0.9, n.z).project(camera);
      if (_v.z > 1) { n.el.style.display = 'none'; continue; }
      n.el.style.display = '';
      n.el.style.left = ((_v.x + 1) / 2) * w + n.ox + 'px';
      n.el.style.top = ((1 - _v.y) / 2) * hgt + 'px';
    }
  }

  updateTags(camera, w, hgt, list) {
    const seen = new Set();
    for (const tg of list) {
      seen.add(tg.id);
      let el = this.tags.get(tg.id);
      if (!el) {
        el = h('div', { class: 'name-tag' }, h('div', { class: 'nt-name' }), h('div', { class: 'nt-bar' }, h('div', { class: 'nt-fill' })));
        this.tagsEl.appendChild(el);
        this.tags.set(tg.id, el);
      }
      _v.set(tg.x, tg.y + 2.25, tg.z).project(camera);
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
      const bar = el.lastChild;
      bar.style.display = tg.showBar ? '' : 'none';
      bar.firstChild.style.width = Math.max(0, (tg.hp / MAX_HP) * 100) + '%';
    }
    for (const [id, el] of this.tags) {
      if (!seen.has(id)) {
        el.remove();
        this.tags.delete(id);
      }
    }
  }

  // ---------------- Ereignisse ----------------
  hitmarker(head, kill) {
    this.hitmarkerEl.className = 'hitmarker show' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitmarkerEl.innerHTML = kill ? ICON.skull : '<i></i><i></i><i></i><i></i>';
    this.hitT = kill ? 0.5 : 0.18;
  }

  damageNumber(pos, dmg, head) {
    if (!this.settings.get('damageNumbers')) return;
    const el = h('div', { class: 'dmg-num' + (head ? ' head' : '') }, String(dmg));
    this.numsEl.appendChild(el);
    const n = { el, x: pos[0], y: pos[1], z: pos[2], t: 0, ox: (Math.random() - 0.5) * 30 };
    this.dmgNums.push(n);
    setTimeout(() => {
      el.remove();
      this.dmgNums = this.dmgNums.filter((q) => q !== n);
    }, 900);
  }

  damageIndicator(x, z) {
    const el = h('div', { class: 'dmg-ind' }, h('div', { class: 'dmg-ind-arc' }));
    this.indEl.appendChild(el);
    this.indicators.push({ el, x, z, t: 1.6 });
  }

  flashDamage() {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('flash');
  }

  flashAmmo() {
    this.bigAmmo.classList.remove('pulse');
    void this.bigAmmo.offsetWidth;
    this.bigAmmo.classList.add('pulse');
  }

  healFloat(amount) {
    const el = h('div', { class: 'heal-num' }, '+' + amount);
    this.healEl.appendChild(el);
    setTimeout(() => el.remove(), 1400);
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
    const weapon = e.cause === 'storm' ? ICON.storm : e.cause === 'leave' ? ICON.exit : ICON.rifle;
    const nm = (name, crown, me, bot) => `<span class="kf-name ${me ? 'me' : ''}">${crown ? `<span class="kf-crown">${ICON.crown}</span>` : ''}${esc(name)}${bot ? ' <small>[BOT]</small>' : ''}</span>`;
    const html = (e.killer ? nm(e.killer, e.killerCrown, e.killerMe, e.killerBot) : '') +
      `<span class="kf-weapon">${weapon}</span>` + (e.headshot ? `<span class="kf-hs">${ICON.headshot}</span>` : '') + nm(e.victim, e.victimCrown, e.victimMe, e.victimBot);
    const el = h('div', { class: 'kf-row' + (e.killerMe || e.victimMe ? ' involved' : ''), html });
    this.feedEl.prepend(el);
    while (this.feedEl.children.length > 6) this.feedEl.lastChild.remove();
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
    this.scoreEl.innerHTML = `<div class="sb-inner"><div class="sb-title">${t('scoreboard')} · ${rows.filter((r) => r.alive).length}/${rows.length} ${t('alive')}</div>
      <table><thead><tr><th>#</th><th>${t('player')}</th><th>${t('killsLabel')}</th><th>${t('damage')}</th><th>${t('status')}</th><th>${t('ping')}</th></tr></thead><tbody>
      ${sorted.map((r, i) => `<tr class="${r.me ? 'me' : ''} ${r.alive ? '' : 'dead'}"><td>${i + 1}</td><td>${r.crown ? `<span class="sb-crown">${ICON.crown}<b>${r.streak}</b></span>` : ''}${esc(r.name)} ${r.isBot ? '<span class="bot-tag">[BOT]</span>' : ''}</td><td>${r.kills}</td><td>${r.damage ?? '–'}</td><td>${r.alive ? `<span class="alive-dot"></span>${t('alive')}` : `${t('dead')} #${r.placement}`}</td><td>${r.isBot ? 'BOT' : (r.ping ? Math.round(r.ping) + ' ms' : '–')}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  // ---------------- Karten ----------------
  drawMinimap(d) {
    const c = this.mmCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const R = W / 2;
    const range = 45; // Meter vom Zentrum zum Rand
    const pxPerM = R / range;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2a78c8';
    g.fillRect(0, 0, W, W);
    g.translate(R, R);
    g.rotate(d.yaw);
    if (this.minimapImg) {
      const img = this.minimapImg;
      const s = (MAP_EXTENT * 2) * pxPerM;
      g.drawImage(img, (-MAP_EXTENT - d.px) * pxPerM, (-MAP_EXTENT - d.pz) * pxPerM, s, s);
    }
    // Sturmkreise
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
    // POI-Namen
    if (this.pois) {
      g.font = 'bold 11px "Lilita One", sans-serif';
      g.textAlign = 'center';
      for (const p of this.pois) {
        const x = (p.x - d.px) * pxPerM, y = (p.z - d.pz) * pxPerM;
        if (Math.hypot(x, y) > R + 30) continue;
        g.save();
        g.translate(x, y);
        g.rotate(-d.yaw);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(p.name, 1, 1);
        g.fillStyle = '#fff';
        g.fillText(p.name, 0, 0);
        g.restore();
      }
    }
    g.restore();
    // Spielerpfeil
    g.save();
    g.translate(R, R);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#222';
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
    const nx = R + Math.sin(-d.yaw) * (R - 12) * -1;
    const ny = R - Math.cos(-d.yaw) * (R - 12);
    g.font = 'bold 13px "Lilita One", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#222';
    g.beginPath();
    g.arc(nx, ny, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText('N', nx, ny + 1);
    g.textBaseline = 'alphabetic';
    // Rand
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.stroke();
  }

  toggleBigMap(show) {
    this.bigMapOpen = show;
    this.bigMap.classList.toggle('hidden', !show);
  }

  drawBigMap(d) {
    const c = this.bigMapCanvas;
    const g = c.getContext('2d');
    const W = c.width;
    const pxPerM = W / (MAP_EXTENT * 2);
    const toX = (x) => (x + MAP_EXTENT) * pxPerM;
    g.fillStyle = '#2a78c8';
    g.fillRect(0, 0, W, W);
    if (this.minimapImg) g.drawImage(this.minimapImg, 0, 0, W, W);
    // Raster
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo((i * W) / 10, 0); g.lineTo((i * W) / 10, W); g.stroke();
      g.beginPath(); g.moveTo(0, (i * W) / 10); g.lineTo(W, (i * W) / 10); g.stroke();
    }
    if (d.stormOn && d.zone) {
      const z = d.zone;
      // Sturmfläche außerhalb abdunkeln
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
    g.font = '18px "Lilita One", sans-serif';
    g.textAlign = 'center';
    for (const p of this.pois || []) {
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(p.name, toX(p.x) + 1.5, toX(p.z) + 1.5);
      g.fillStyle = '#fff';
      g.fillText(p.name, toX(p.x), toX(p.z));
    }
    // Spieler
    g.save();
    g.translate(toX(d.px), toX(d.pz));
    g.rotate(-d.yaw);
    g.fillStyle = '#ffd23f';
    g.strokeStyle = '#222';
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
    this.tags.clear();
    this.dmgNums = [];
    this.indicators = [];
    this.msgEl.classList.remove('show');
    this.bigMsgEl.classList.remove('show');
    this.countdown(null);
    this.setSpectate(null);
    this.showScoreboard(false);
    this.toggleBigMap(false);
    this.hpGhostPct = undefined;
    this._ammo = null;
  }
}
