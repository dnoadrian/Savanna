// Admin-Panel: öffnet sich mit der Taste 0 (bewusst nicht in den Tastenbelegungen).
// Haupt-Admin (adrian) kann Zugänge für andere anlegen – mit wählbarer Anzahl an Anmeldungen.
// Mit Server werden Zugänge und Anmeldungen dort geprüft (gelten für alle Geräte), ohne Server
// nur auf diesem Gerät. Cheats: Skelett-ESP, Aimbot, Durch Wände, Spinbot, Fliegen, Tempo,
// unendliche Munition, OP-Loot (goldene SCAR + goldenes Scharfschützengewehr).
import { h } from './dom.js';
import { t } from '../i18n.js';
import { ADMIN_USER as USER, ADMIN_PASS as PASS, ADMIN_MAX_COINS } from '../../shared/constants.js';

const STORE = 'showdown.admin';
const LOCAL_ACCOUNTS = 'showdown.adminAccounts';
const TOGGLES = ['esp', 'aimbot', 'aimbotFov', 'wallbang', 'spinbot', 'fly', 'speed', 'infammo', 'oploot'];
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
      sessionStorage.setItem(STORE, JSON.stringify({ ok: this.loggedIn, role: this.role, token: this.token, user: this.user, flags: this.flags, values: this.values }));
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
  syncCheats(op = false) {
    const m = this.app.match;
    if (!m || !m.session || !m.session.cheat) return;
    m.session.cheat({ ia: this.active('infammo'), op });
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
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.app.ui.onOverlayClosed();
  }

  render() {
    const p = this.panel;
    const scroll = p.scrollTop;
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, t('adminTitle')), h('button', { class: 'close-x', onclick: () => this.close() }, '✕')));
    if (!this.loggedIn) this.renderLogin(p);
    else this.renderToggles(p);
    p.scrollTop = scroll;
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

  renderToggles(p) {
    const app = this.app;
    p.appendChild(h('p', { class: 'hint' }, t('adminHint'), ' ', h('b', {}, (this.user || '') + (this.isMaster ? ' · ' + t('adminMaster') : ''))));
    for (const k of TOGGLES) {
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
            if (k === 'infammo') this.syncCheats();
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
    if (this.isMaster) {
      this.renderAnnounce(p);
      this.renderAccounts(p);
      this.renderCoins(p);
    }
    p.appendChild(h('div', { class: 'row end' },
      h('button', { class: 'btn ghost small', onclick: () => { app.audio.uiClick(); this.logout(); } }, t('adminLogout')),
      h('button', { class: 'btn yellow small', onclick: () => this.close() }, t('close'))));
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
    const box = h('div', { class: 'admin-coins admin-ann' },
      h('div', { class: 'set-label' }, t('adminAnn'), h('small', {}, t(app.net.connected ? 'adminAnnDesc' : 'adminAnnLocal'))));
    const text = h('input', { type: 'text', class: 'field', placeholder: t('adminAnnText'), maxlength: 160, spellcheck: 'true' });
    text.addEventListener('focus', () => { this.annTyping = true; });
    text.addEventListener('blur', () => { this.annTyping = false; });
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
    const box = h('div', { class: 'admin-coins admin-accounts' },
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
    p.appendChild(h('div', { class: 'admin-coins' },
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

// Dauer lesbar: 45 min, 3 h, 2 Tage, dauerhaft
function annDuration(mins) {
  if (!mins) return t('adminAnnPerm');
  if (mins < 60) return t('durMin', { n: mins });
  if (mins < 1440) return t('durHour', { n: Math.round(mins / 60) });
  const d = Math.round(mins / 1440);
  return t(d === 1 ? 'durDay' : 'durDays', { n: d });
}
