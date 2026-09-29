// Admin-Panel: öffnet sich mit der Taste 0 (bewusst nicht in den Tastenbelegungen).
// Aufgeteilt in Kategorien: Kampf, Bewegung, Server (nur Haupt-Admin) und Zugänge (nur Haupt-Admin).
// Haupt-Admin (adrian) kann Zugänge für andere anlegen – mit wählbarer Anzahl an Anmeldungen.
// Mit Server werden Zugänge und Anmeldungen dort geprüft (gelten für alle Geräte), ohne Server
// nur auf diesem Gerät. Server-Werkzeuge: Übersicht, Spieler rauswerfen, Coins verschenken,
// Lobby-Nachrichten und „Alle Spieler zurücksetzen“ (löscht alle Konten und Spielstände).
import { h } from './dom.js';
import { t } from '../i18n.js';
import { ICON } from './icons.js';
import { ADMIN_USER as USER, ADMIN_PASS as PASS, ADMIN_MAX_COINS } from '../../shared/constants.js';
import { wipeAllProfiles } from '../profile.js';

const STORE = 'showdown.admin';
const LOCAL_ACCOUNTS = 'showdown.adminAccounts';
// Kategorien mit ihren Schaltern; master: nur für den Haupt-Admin
const TABS = [
  { id: 'combat', icon: 'headshot', toggles: ['aimbot', 'aimbotFov', 'esp', 'wallbang', 'infammo', 'god', 'oploot'] },
  { id: 'move', icon: 'map', toggles: ['fly', 'speed', 'spinbot'] },
  { id: 'server', icon: 'globe', master: true, toggles: [] },
  { id: 'access', icon: 'lock', master: true, toggles: [] },
];
const TOGGLES = TABS.flatMap((tb) => tb.toggles);
// Unteroptionen erscheinen nur, wenn die übergeordnete Option an ist
const PARENT = { aimbotFov: 'aimbot' };
// Regler: [Schlüssel, min, max, Schritt, Standard, Anzeige]
const SLIDERS = {
  aimbotFov: ['fovRadius', 30, 600, 5, 160, (v) => v + ' px'],
  fly: ['flySpeed', 5, 80, 1, 15, (v) => v + ' m/s'],
  speed: ['speedMul', 1, 5, 0.1, 1.6, (v) => '×' + Number(v).toFixed(1)],
};
const USES = [1, 3, 5, 10, 25, -1];
// Lobby-Nachrichten: Anzeigedauer in Minuten (0 = dauerhaft)
const ANN_MINS = [10, 30, 60, 360, 1440, 10080, 0];
const LOCAL_ANN = 'showdown.announcements';

// ohne Server: Nachrichten nur auf diesem Gerät
export function loadLocalAnnouncements() {
  try {
    const a = JSON.parse(localStorage.getItem(LOCAL_ANN) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function saveLocalAnnouncements(a) {
  try { localStorage.setItem(LOCAL_ANN, JSON.stringify(a)); } catch { /* ignorieren */ }
}

function loadLocalAccounts() {
  try { return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS) || '{}') || {}; } catch { return {}; }
}
function saveLocalAccounts(a) {
  try { localStorage.setItem(LOCAL_ACCOUNTS, JSON.stringify(a)); } catch { /* ignorieren */ }
}

export class AdminPanel {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.loggedIn = false;
    this.role = null; // 'master' | 'guest'
    this.token = null;
    this.user = null;
    this.accounts = null;
    this.tab = 'combat';
    this.flags = Object.fromEntries(TOGGLES.map((k) => [k, false]));
    this.values = Object.fromEntries(Object.values(SLIDERS).map(([k, , , , d]) => [k, d]));
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (s && s.ok) {
        this.loggedIn = true;
        this.role = s.role || 'master';
        this.token = s.token || null;
        this.user = s.user || USER;
        for (const k of TOGGLES) this.flags[k] = !!(s.flags && s.flags[k]);
        for (const k of Object.keys(this.values)) if (Number.isFinite(s.values?.[k])) this.values[k] = s.values[k];
        if (TABS.some((tb) => tb.id === s.tab)) this.tab = s.tab;
      }
    } catch { /* ignorieren */ }
    this.badge = h('div', { class: 'admin-badge hidden' });
    document.getElementById('ui-root').appendChild(this.badge);
    this.updateBadge();
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Digit0' && e.code !== 'Numpad0') return;
      if (e.repeat || app.input.captureCb) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      if (this.el) this.close();
      else this.open();
    });
    // nach (Wieder-)Verbindung beim Server als Admin melden
    app.net.onStatus((connected) => { if (connected && this.loggedIn) this.resume(); });
  }

  get isOpen() { return !!this.el; }
  get isMaster() { return this.loggedIn && this.role === 'master'; }

  active(name) {
    return this.loggedIn && !!this.flags[name] && (!PARENT[name] || !!this.flags[PARENT[name]]);
  }

  // eingestellter Wert (Fluggeschwindigkeit, Tempo-Faktor)
  value(key) {
    return this.values[key];
  }

  save() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ ok: this.loggedIn, role: this.role, token: this.token, user: this.user, flags: this.flags, values: this.values, tab: this.tab }));
    } catch { /* ignorieren */ }
  }

  // Beim Server mit dem Token melden (verbraucht keine weitere Anmeldung)
  async resume() {
    const net = this.app.net;
    if (!net.connected) return;
    let r = this.token ? await net.request({ t: 'adminResume', token: this.token }) : { ok: false };
    if (!r.ok && this.role === 'master') {
      r = await net.request({ t: 'adminLogin', user: USER, pass: PASS });
      if (r.ok) { this.token = r.token; this.save(); }
    }
    if (!r.ok && r.t !== 'error' && this.role === 'guest') {
      // Zugang gelöscht oder abgelaufen
      this.logout();
      this.app.ui.toast(t('adminExpired'), 'error');
      return;
    }
    this.syncCheats();
  }

  // Cheat-Zustand an die laufende Runde schicken (Server/Simulation)
  syncCheats(op = false, heal = false) {
    const m = this.app.match;
    if (!m || !m.session || !m.session.cheat) return false;
    m.session.cheat({ ia: this.active('infammo'), gm: this.active('god'), op, heal });
    return true;
  }

  async login(user, pass) {
    const net = this.app.net;
    const u = user.trim().toLowerCase();
    if (net.connected) {
      const r = await net.request({ t: 'adminLogin', user: u, pass });
      if (!r.ok) return { ok: false, key: r.err === 'timeout' ? 'err_generic' : r.key || 'adminWrong' };
      Object.assign(this, { loggedIn: true, role: r.role, token: r.token, user: u });
      return { ok: true, uses: r.uses };
    }
    // ohne Server: Haupt-Admin oder Zugänge dieses Geräts
    if (u === USER && pass === PASS) {
      Object.assign(this, { loggedIn: true, role: 'master', token: null, user: u });
      return { ok: true };
    }
    const acc = loadLocalAccounts();
    const a = acc[u];
    if (!a || a.pass !== pass) return { ok: false, key: 'adminWrong' };
    if (a.uses === 0) return { ok: false, key: 'adminNoUses' };
    if (a.uses > 0) a.uses--;
    saveLocalAccounts(acc);
    Object.assign(this, { loggedIn: true, role: 'guest', token: null, user: u });
    return { ok: true, uses: a.uses };
  }

  logout() {
    this.loggedIn = false;
    this.role = null;
    this.token = null;
    for (const k of TOGGLES) this.flags[k] = false;
    if (this.app.net.connected) this.app.net.send({ t: 'adminLogout' });
    this.syncCheats();
    this.save();
    this.updateBadge();
    if (this.el) this.render();
  }

  open() {
    const app = this.app;
    if (app.state === 'welcome' || app.state === 'loading') return;
    if (app.input.locked) app.input.unlock();
    if (app.match && app.match.invScreen && app.match.invScreen.open) app.match.invScreen.toggle(false, true);
    this.el = h('div', { class: 'modal-back admin-back' });
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    this.panel = h('div', { class: 'modal admin small' });
    this.el.appendChild(this.panel);
    app.ui.overlayRoot.appendChild(this.el);
    app.audio.uiClick();
    this.accounts = null;
    this.stats = null;
    this.render();
    // Server-Übersicht aktuell halten, solange sie offen ist
    clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => { if (this.el && this.tab === 'server' && this.isMaster && !this.typing) this.loadStats(); }, 4000);
  }

  close() {
    if (!this.el) return;
    clearInterval(this.statsTimer);
    this.el.remove();
    this.el = null;
    this.app.ui.onOverlayClosed();
  }

  render() {
    const p = this.panel;
    const body = p.querySelector('.admin-body');
    const scroll = body ? body.scrollTop : 0;
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, t('adminTitle')), h('button', { class: 'close-x', onclick: () => this.close() }, '✕')));
    if (!this.loggedIn) {
      this.panel.classList.add('small');
      this.renderLogin(p);
      return;
    }
    this.panel.classList.remove('small');
    this.renderMain(p);
    const nb = p.querySelector('.admin-body');
    if (nb) nb.scrollTop = scroll;
  }

  visibleTabs() {
    return TABS.filter((tb) => !tb.master || this.isMaster);
  }

  renderMain(p) {
    const app = this.app;
    const tabs = this.visibleTabs();
    if (!tabs.some((tb) => tb.id === this.tab)) this.tab = 'combat';
    const anyOn = TOGGLES.some((k) => this.flags[k]);
    p.appendChild(h('div', { class: 'admin-user' },
      h('span', {}, t('adminHint'), ' ', h('b', {}, (this.user || '') + (this.isMaster ? ' · ' + t('adminMaster') : ''))),
      anyOn ? h('button', { class: 'btn ghost small', onclick: () => { app.audio.uiClick(); this.allOff(); } }, t('adminAllOff')) : null));
    p.appendChild(h('div', { class: 'admin-tabs' }, ...tabs.map((tb) => {
      const on = tb.toggles.filter((k) => this.active(k)).length;
      return h('button', {
        class: 'admin-tab' + (this.tab === tb.id ? ' sel' : ''),
        onclick: () => { if (this.tab === tb.id) return; app.audio.uiClick(); this.tab = tb.id; this.save(); this.render(); if (tb.id === 'server') this.loadStats(); },
      }, h('span', { class: 'icon', html: ICON[tb.icon] || '' }), t('adminTab_' + tb.id), on ? h('i', { class: 'admin-tab-n' }, String(on)) : null);
    })));
    const body = h('div', { class: 'admin-body' });
    p.appendChild(body);
    const tab = TABS.find((tb) => tb.id === this.tab);
    if (tab.toggles.length) this.renderToggles(body, tab.toggles);
    if (tab.id === 'combat') this.renderCombatActions(body);
    else if (tab.id === 'move') this.renderTeleport(body);
    else if (tab.id === 'server') {
      this.renderServer(body);
      this.renderAnnounce(body);
      this.renderCoins(body);
      this.renderWipe(body);
    } else if (tab.id === 'access') this.renderAccounts(body);
    p.appendChild(h('div', { class: 'row end admin-foot' },
      h('button', { class: 'btn ghost small', onclick: () => { app.audio.uiClick(); this.logout(); } }, t('adminLogout')),
      h('button', { class: 'btn yellow small', onclick: () => this.close() }, t('close'))));
  }

  // alle Cheats aus (Regler behalten ihre Werte)
  allOff() {
    for (const k of TOGGLES) this.flags[k] = false;
    this.save();
    this.updateBadge();
    this.syncCheats();
    this.render();
  }

  renderToggles(p, keys) {
    const app = this.app;
    for (const k of keys) {
      if (PARENT[k] && !this.flags[PARENT[k]]) continue;
      const on = this.flags[k];
      p.appendChild(h('div', { class: 'set-row' + (PARENT[k] ? ' sub-toggle' : '') },
        h('div', { class: 'set-label' }, t('admin_' + k), h('small', {}, t('admin_' + k + 'Desc'))),
        h('div', { class: 'set-ctrl' }, h('button', {
          class: 'toggle' + (on ? ' on' : ''),
          onclick: () => {
            app.audio.uiClick();
            this.flags[k] = !this.flags[k];
            this.save();
            this.updateBadge();
            if (k === 'infammo' || k === 'god') this.syncCheats();
            if (k === 'oploot' && this.flags[k]) this.giveOpLoot();
            this.render();
          },
        }, h('span', { class: 'knob' }), h('span', { class: 'tl' }, on ? t('on') : t('off'))))));
      // Regler für Flug- und Laufgeschwindigkeit
      const sl = SLIDERS[k];
      if (sl && on) {
        const [key, min, max, step, , fmt] = sl;
        const out = h('span', { class: 'slider-val' }, fmt(this.values[key]));
        const inp = h('input', { type: 'range', min, max, step, value: this.values[key] });
        inp.addEventListener('input', () => {
          this.values[key] = Number(inp.value);
          out.textContent = fmt(this.values[key]);
          this.save();
        });
        p.appendChild(h('div', { class: 'set-row sub' }, h('div', { class: 'set-label' }, t('admin_' + key)), h('div', { class: 'set-ctrl' }, h('div', { class: 'slider' }, inp, out))));
      }
    }
  }

  // lebt man gerade in einer Runde? (für Heilen, OP-Loot, Teleport)
  liveMatch() {
    const m = this.app.match;
    return m && m.state === 'alive' && m.player && m.session.phase !== 'ended' ? m : null;
  }

  renderCombatActions(p) {
    const app = this.app;
    const heal = () => {
      app.audio.uiClick();
      const m = this.liveMatch();
      if (!m || !this.syncCheats(false, true)) { app.ui.toast(t('adminOnlyInMatch'), 'error'); return; }
      app.audio.uiConfirm();
      app.ui.toast(t('adminHealed'), 'ok');
    };
    const loot = () => {
      app.audio.uiClick();
      if (!this.liveMatch()) { app.ui.toast(t('adminOnlyInMatch'), 'error'); return; }
      this.giveOpLoot();
    };
    p.appendChild(h('div', { class: 'admin-box' },
      h('div', { class: 'set-label' }, t('adminActions'), h('small', {}, t('adminActionsDesc'))),
      h('div', { class: 'admin-actions' },
        h('button', { class: 'btn small', onclick: heal }, h('span', { class: 'icon', html: ICON.heart }), t('adminHeal')),
        h('button', { class: 'btn small', onclick: loot }, h('span', { class: 'icon', html: ICON.star }), t('adminOpLootNow')))));
  }

  // Teleport zu den Orten der Karte (oder zufällig auf die Insel)
  renderTeleport(p) {
    const app = this.app;
    const m = this.liveMatch();
    const box = h('div', { class: 'admin-box' }, h('div', { class: 'set-label' }, t('adminTeleport'), h('small', {}, t(m ? 'adminTeleportDesc' : 'adminOnlyInMatch'))));
    if (m) {
      const pois = ((m.map && m.map.pois) || []).filter((q) => q.name && q.name.trim());
      const go = (x, z, name) => {
        app.audio.uiConfirm();
        this.teleport(m, x, z);
        app.ui.toast(t('adminTeleported', { name }), 'ok');
      };
      const rnd = () => {
        const tr = m.map.terrain;
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (tr.half || 200) * 0.85;
          const x = Math.cos(a) * r, z = Math.sin(a) * r;
          if (tr.heightAt(x, z) > 1) return go(x, z, t('adminRandomSpot'));
        }
      };
      box.appendChild(h('div', { class: 'admin-actions tp-list' },
        ...pois.map((q) => h('button', { class: 'btn small ghost', onclick: () => go(q.x, q.z, q.name) }, q.name)),
        h('button', { class: 'btn small', onclick: rnd }, h('span', { class: 'icon', html: ICON.dice }), t('adminRandomSpot'))));
    }
    p.appendChild(box);
  }

  teleport(m, x, z) {
    const b = m.player.body;
    const col = m.map.collision;
    const top = 400;
    const tHit = col.raycast(x, top, z, 0, -1, 0, top + 200, true, false);
    const ground = Math.max(m.map.terrain.heightAt(x, z), tHit >= 0 ? top - tHit : -1e9);
    b.x = x; b.z = z; b.y = ground + 0.2;
    b.vx = 0; b.vy = 0; b.vz = 0;
  }

  renderLogin(p) {
    const app = this.app;
    const user = h('input', { type: 'text', class: 'field', placeholder: t('adminUser'), autocomplete: 'off', spellcheck: 'false' });
    const pass = h('input', { type: 'password', class: 'field', placeholder: t('adminPass'), autocomplete: 'off' });
    const err = h('div', { class: 'admin-err' });
    let busy = false;
    const submit = async () => {
      if (busy) return;
      busy = true;
      const r = await this.login(user.value, pass.value);
      busy = false;
      if (r.ok) {
        this.save();
        this.updateBadge();
        app.audio.uiConfirm();
        if (this.role === 'guest' && r.uses !== undefined) app.ui.toast(t(r.uses < 0 ? 'adminWelcomeInf' : 'adminWelcome', { n: r.uses }), 'ok');
        this.syncCheats();
        this.render();
      } else {
        app.audio.uiError();
        err.textContent = t(r.key || 'adminWrong');
        pass.value = '';
        pass.focus();
      }
    };
    for (const i of [user, pass]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    p.append(
      h('p', { class: 'hint' }, t('adminLoginHint')),
      h('label', { class: 'lbl' }, t('adminUser')), user,
      h('label', { class: 'lbl' }, t('adminPass')), pass,
      err,
      h('div', { class: 'row end' }, h('button', { class: 'btn yellow', onclick: submit }, t('adminLogin'))));
    setTimeout(() => user.focus(), 30);
  }

  // OP-Loot sofort geben, wenn man gerade im Match lebt (sonst beim nächsten Match)
  giveOpLoot() {
    const m = this.app.match;
    if (m && m.state === 'alive' && m.player && m.session.phase !== 'ended') {
      m.player.applyOpLoot();
      m.opLootGiven = true;
      this.app.ui.toast(t('adminOpLootGiven'), 'ok');
    } else {
      this.app.ui.toast(t('adminOpLootNext'), '');
    }
  }

  // ---------------- Server: Übersicht, Spieler, Rauswerfen ----------------
  async loadStats() {
    const net = this.app.net;
    if (!net.connected || !this.isMaster) return;
    const r = await net.request({ t: 'adminStats' }, 4000);
    if (!r.ok) return;
    this.stats = r;
    if (this.el && this.tab === 'server' && !this.typing) this.render();
  }

  renderServer(p) {
    const app = this.app;
    const box = h('div', { class: 'admin-box' });
    p.appendChild(box);
    if (!app.net.connected) {
      box.append(h('div', { class: 'set-label' }, t('adminServer'), h('small', {}, t('adminServerOffline'))));
      return;
    }
    const r = this.stats;
    if (!r) {
      this.loadStats();
      box.append(h('div', { class: 'set-label' }, t('adminServer'), h('small', {}, t('loading'))));
      return;
    }
    const st = r.stats;
    const tile = (v, k) => h('div', { class: 'stat-tile' }, h('b', {}, String(v)), h('small', {}, t(k)));
    box.append(
      h('div', { class: 'set-label' }, t('adminServer'), h('small', {}, t('adminServerDesc'))),
      h('div', { class: 'admin-stats' },
        tile(st.online, 'adminStOnline'), tile(st.matches, 'adminStMatches'), tile(st.queue, 'adminStQueue'),
        tile(st.accounts, 'adminStAccounts'), tile(fmtUptime(st.uptime), 'adminStUptime'), tile(st.mem + ' MB', 'adminStMem')));
    if (r.matches.length) {
      box.appendChild(h('div', { class: 'acc-list admin-matches' }, ...r.matches.map((mt) => h('div', { class: 'acc-row' },
        h('b', {}, (mt.mode === 'duo' ? 'Duo' : 'Solo') + ' · ' + fmtClock(mt.time)),
        h('span', {}, t('adminMatchRow', { h: mt.humans, a: mt.alive }))))));
    }
    const list = h('div', { class: 'acc-list admin-players' });
    if (!r.online.length) list.appendChild(h('div', { class: 'hint small' }, t('adminNoPlayers')));
    const me = app.profile.id;
    for (const pl of r.online) {
      const coins = async () => {
        app.audio.uiClick();
        const res = await app.net.request({ t: 'adminCoins', name: pl.name, amount: 1000 });
        if (res.ok) { app.audio.uiConfirm(); app.ui.toast(t('adminCoinsSent', { name: pl.name, n: 1000 }), 'ok'); }
        else app.ui.toast(t(res.key || 'err_generic', { name: pl.name }), 'error');
      };
      const kick = () => {
        app.audio.uiClick();
        app.ui.confirm(t('adminKickConfirm', { name: pl.name }), async () => {
          const res = await app.net.request({ t: 'adminKick', id: pl.id });
          if (res.ok) { app.ui.toast(t('adminKicked', { name: pl.name }), 'ok'); this.loadStats(); }
          else app.ui.toast(t(res.key || 'err_generic'), 'error');
        });
      };
      list.appendChild(h('div', { class: 'acc-row player-row' },
        h('b', {}, pl.name, pl.admin ? h('span', { class: 'admin-tag' }, 'ADMIN') : null),
        h('span', { class: 'pl-status st-' + pl.status }, t('adminSt_' + pl.status)),
        h('button', { class: 'btn small ghost', title: t('adminCoinsGive'), onclick: coins }, '+1000'),
        pl.id === me ? null : h('button', { class: 'btn small danger', onclick: kick }, t('adminKick'))));
    }
    box.append(h('div', { class: 'set-label admin-sub' }, t('adminPlayersOnline', { n: r.online.length })), list);
  }

  // ---------------- Alle Spieler zurücksetzen ----------------
  renderWipe(p) {
    const app = this.app;
    const online = app.net.connected;
    const input = h('input', { type: 'text', class: 'field', placeholder: 'RESET', autocomplete: 'off', spellcheck: 'false', maxlength: 5 });
    const btn = h('button', { class: 'btn danger', disabled: true }, t(online ? 'adminWipeBtn' : 'adminWipeLocalBtn'));
    input.addEventListener('focus', () => { this.typing = true; });
    input.addEventListener('blur', () => { this.typing = false; });
    input.addEventListener('input', () => { btn.disabled = input.value.trim().toUpperCase() !== 'RESET'; });
    btn.addEventListener('click', () => {
      app.audio.uiClick();
      app.ui.confirm(t(online ? 'adminWipeConfirm2' : 'adminWipeLocalConfirm'), async () => {
        if (online) {
          const r = await app.net.request({ t: 'adminWipe', confirm: 'RESET' }, 8000);
          if (!r.ok) { app.audio.uiError(); app.ui.toast(t(r.key || 'err_generic'), 'error'); return; }
          app.ui.toast(t('adminWiped', { n: r.n }), 'ok');
        } else {
          const at = Date.now();
          wipeAllProfiles(at);
          app.onWiped(at);
          app.ui.toast(t('adminWipedLocal'), 'ok');
        }
        this.typing = false;
        this.close();
      });
    });
    p.appendChild(h('div', { class: 'admin-box admin-danger' },
      h('div', { class: 'set-label' }, t('adminWipe'), h('small', {}, t(online ? 'adminWipeDesc' : 'adminWipeLocalDesc'))),
      h('div', { class: 'row' }, input, btn)));
  }

  // ---------------- Lobby-Nachrichten ----------------
  onAnnouncements() {
    if (this.el && this.loggedIn && this.isMaster && !this.annTyping) this.render();
  }

  async changeAnnouncement(op, data) {
    const app = this.app;
    if (app.net.connected) {
      const r = await app.net.request({ t: 'adminAnnounce', op, ...data });
      if (!r.ok) {
        app.audio.uiError();
        app.ui.toast(t(r.key || 'err_generic'), 'error');
        return false;
      }
      if (r.ann) app.setAnnouncements(r.ann);
      return true;
    }
    const now = Date.now();
    let list = loadLocalAnnouncements().filter((a) => !a.until || a.until > now);
    if (op === 'add') {
      const text = String(data.text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!text) { app.ui.toast(t('adminAnnEmpty'), 'error'); return false; }
      if (list.length >= 5) { app.ui.toast(t('adminAnnFull'), 'error'); return false; }
      list.push({ id: now, text, until: data.mins ? now + data.mins * 60000 : 0 });
    } else if (op === 'remove') list = list.filter((a) => a.id !== data.id);
    saveLocalAnnouncements(list);
    app.ui.lobby.renderAnnouncements?.();
    if (this.el) this.render();
    return true;
  }

  renderAnnounce(p) {
    const app = this.app;
    const box = h('div', { class: 'admin-box admin-ann' },
      h('div', { class: 'set-label' }, t('adminAnn'), h('small', {}, t(app.net.connected ? 'adminAnnDesc' : 'adminAnnLocal'))));
    const text = h('input', { type: 'text', class: 'field', placeholder: t('adminAnnText'), maxlength: 160, spellcheck: 'true' });
    text.addEventListener('focus', () => { this.annTyping = true; this.typing = true; });
    text.addEventListener('blur', () => { this.annTyping = false; this.typing = false; });
    const dur = h('select', { class: 'field' }, ...ANN_MINS.map((n) => h('option', { value: n, selected: n === 60 }, annDuration(n))));
    const send = async () => {
      app.audio.uiClick();
      if (await this.changeAnnouncement('add', { text: text.value, mins: Number(dur.value) })) {
        app.audio.uiConfirm();
        app.ui.toast(t('adminAnnSent'), 'ok');
        text.value = '';
        this.annTyping = false;
        this.render();
      }
    };
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    box.appendChild(h('div', { class: 'row acc-add ann-add' }, text, dur, h('button', { class: 'btn yellow small', onclick: send }, t('adminAnnSend'))));
    const list = h('div', { class: 'acc-list' });
    const live = app.liveAnnouncements();
    if (!live.length) list.appendChild(h('div', { class: 'hint small' }, t('adminAnnNone')));
    for (const a of live) {
      const left = a.until ? Math.max(1, Math.round((a.until - Date.now()) / 60000)) : 0;
      list.appendChild(h('div', { class: 'acc-row ann-row' },
        h('span', { class: 'ann-text' }, a.text),
        h('span', { class: 'acc-uses' }, left ? t('adminAnnLeft', { t: annDuration(left) }) : t('adminAnnPerm')),
        h('button', { class: 'close-x small', title: t('adminAnnRemove'), onclick: () => { app.audio.uiClick(); this.changeAnnouncement('remove', { id: a.id }); } }, '✕')));
    }
    box.appendChild(list);
    p.appendChild(box);
  }

  // ---------------- Zugänge für andere ----------------
  async loadAccounts() {
    const net = this.app.net;
    if (net.connected) {
      const r = await net.request({ t: 'adminAccounts', op: 'list' });
      this.accounts = r.ok ? r.accounts : [];
      this.accountsOnServer = true;
    } else {
      const acc = loadLocalAccounts();
      this.accounts = Object.entries(acc).map(([user, a]) => ({ user, pass: a.pass, uses: a.uses, created: a.created || 0 }));
      this.accountsOnServer = false;
    }
    if (this.el) this.render();
  }

  async changeAccount(op, data) {
    const net = this.app.net;
    if (net.connected) {
      const r = await net.request({ t: 'adminAccounts', op, ...data });
      if (!r.ok) {
        this.app.audio.uiError();
        this.app.ui.toast(t(r.key || 'err_generic'), 'error');
      }
      if (r.accounts) this.accounts = r.accounts;
    } else {
      const acc = loadLocalAccounts();
      if (op === 'add') {
        const u = String(data.user || '').trim().toLowerCase();
        if (u.length < 2 || String(data.pass || '').length < 2 || u === USER) {
          this.app.ui.toast(t('adminAccBad'), 'error');
          return;
        }
        acc[u] = { pass: String(data.pass), uses: data.uses, created: Date.now() };
      } else if (op === 'remove') delete acc[data.user];
      saveLocalAccounts(acc);
      await this.loadAccounts();
      return;
    }
    if (this.el) this.render();
  }

  renderAccounts(p) {
    const app = this.app;
    if (!this.accounts) this.loadAccounts();
    const box = h('div', { class: 'admin-box admin-accounts' },
      h('div', { class: 'set-label' }, t('adminAccounts'), h('small', {}, t(this.accountsOnServer === false ? 'adminAccountsLocal' : 'adminAccountsDesc'))));
    const name = h('input', { type: 'text', class: 'field', placeholder: t('adminUser'), autocomplete: 'off', spellcheck: 'false', maxlength: 24 });
    const pass = h('input', { type: 'text', class: 'field', placeholder: t('adminPass'), autocomplete: 'off', spellcheck: 'false', maxlength: 32, value: String(1000 + Math.floor(Math.random() * 9000)) });
    const uses = h('select', { class: 'field' }, ...USES.map((n) => h('option', { value: n, selected: n === 3 }, n < 0 ? t('adminUsesInf') : t('adminUsesN', { n }))));
    const add = async () => {
      app.audio.uiClick();
      await this.changeAccount('add', { user: name.value, pass: pass.value, uses: Number(uses.value) });
    };
    box.appendChild(h('div', { class: 'row acc-add' }, name, pass, uses, h('button', { class: 'btn yellow small', onclick: add }, t('adminAccAdd'))));
    const list = h('div', { class: 'acc-list' });
    if (this.accounts && !this.accounts.length) list.appendChild(h('div', { class: 'hint small' }, t('adminAccNone')));
    for (const a of this.accounts || []) {
      list.appendChild(h('div', { class: 'acc-row' + (a.uses === 0 ? ' used' : '') },
        h('b', {}, a.user),
        h('span', { class: 'acc-pass' }, a.pass),
        h('span', { class: 'acc-uses' }, a.uses < 0 ? t('adminUsesInf') : t('adminUsesLeft', { n: a.uses })),
        h('button', { class: 'close-x small', title: t('adminAccRemove'), onclick: () => { app.audio.uiClick(); this.changeAccount('remove', { user: a.user }); } }, '✕')));
    }
    box.appendChild(list);
    p.appendChild(box);
  }

  // Coins an Spieler verschenken: eigener Name → lokal, sonst über den Server
  renderCoins(p) {
    const app = this.app;
    const name = h('input', { type: 'text', class: 'field', placeholder: t('adminCoinsName'), value: app.profile.name || '', autocomplete: 'off', spellcheck: 'false' });
    const amount = h('input', { type: 'number', class: 'field', min: 1, max: ADMIN_MAX_COINS, step: 50, value: 1000 });
    const msg = h('div', { class: 'admin-err' });
    const say = (text, ok) => { msg.textContent = text; msg.classList.toggle('ok', ok); };
    const give = async () => {
      const n = Math.round(Number(amount.value));
      const who = name.value.trim();
      if (!who || !(n >= 1 && n <= ADMIN_MAX_COINS)) { app.audio.uiError(); say(t('err_generic'), false); return; }
      const me = (app.profile.name || '').toLowerCase() === who.toLowerCase();
      if (me && !app.net.connected) {
        app.profile.addCoins(n);
        app.audio.uiConfirm();
        say(t('adminCoinsSent', { name: who, n }), true);
        app.ui.lobby.refresh?.();
        return;
      }
      const r = await app.net.request({ t: 'adminCoins', name: who, amount: n, user: USER, pass: PASS });
      if (r.ok) { app.audio.uiConfirm(); say(t('adminCoinsSent', { name: r.name || who, n }), true); }
      else { app.audio.uiError(); say(t(r.err === 'offline' ? 'adminCoinsNoServer' : (r.key || 'err_generic'), { name: r.name || who }), false); }
    };
    p.appendChild(h('div', { class: 'admin-box admin-coins' },
      h('div', { class: 'set-label' }, t('adminCoins'), h('small', {}, t('adminCoinsDesc'))),
      h('div', { class: 'row' }, name, amount, h('button', { class: 'btn yellow small', onclick: give }, t('adminCoinsGive'))),
      msg));
  }

  updateBadge() {
    const on = TOGGLES.filter((k) => this.active(k));
    this.badge.classList.toggle('hidden', !on.length);
    this.badge.textContent = 'ADMIN · ' + on.map((k) => t('admin_' + k).toUpperCase()).join(' · ');
  }
}

// Laufzeit des Servers: 3 h 12 min / 2 Tage 4 h
function fmtUptime(sec) {
  const m = Math.floor(sec / 60), hh = Math.floor(m / 60), d = Math.floor(hh / 24);
  if (d) return d + ' d ' + (hh % 24) + ' h';
  if (hh) return hh + ' h ' + (m % 60) + ' min';
  return m + ' min';
}
function fmtClock(sec) {
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// Dauer lesbar: 45 min, 3 h, 2 Tage, dauerhaft
function annDuration(mins) {
  if (!mins) return t('adminAnnPerm');
  if (mins < 60) return t('durMin', { n: mins });
  if (mins < 1440) return t('durHour', { n: Math.round(mins / 60) });
  const d = Math.round(mins / 1440);
  return t(d === 1 ? 'durDay' : 'durDays', { n: d });
}
