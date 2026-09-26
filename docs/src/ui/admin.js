// Admin-Panel: öffnet sich mit der Taste 0 (bewusst nicht in den Tastenbelegungen), Anmeldung mit
// Benutzer + Passwort, danach Schalter für Skelett-ESP, Aimbot (mit Ziel-Lock), Durch-Wände-
// Schießen, Spinbot, Fliegen und Tempo – Flug- und Laufgeschwindigkeit frei einstellbar.
import { h } from './dom.js';
import { t } from '../i18n.js';
import { ADMIN_USER as USER, ADMIN_PASS as PASS, ADMIN_MAX_COINS } from '../../shared/constants.js';
const STORE = 'showdown.admin';
const TOGGLES = ['esp', 'aimbot', 'wallbang', 'spinbot', 'fly', 'speed'];
// Regler: [Schlüssel, min, max, Schritt, Standard, Anzeige]
const SLIDERS = {
  fly: ['flySpeed', 5, 80, 1, 15, (v) => v + ' m/s'],
  speed: ['speedMul', 1, 5, 0.1, 1.6, (v) => '×' + Number(v).toFixed(1)],
};

export class AdminPanel {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.loggedIn = false;
    this.flags = Object.fromEntries(TOGGLES.map((k) => [k, false]));
    this.values = Object.fromEntries(Object.values(SLIDERS).map(([k, , , , d]) => [k, d]));
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (s && s.ok) {
        this.loggedIn = true;
        for (const k of TOGGLES) this.flags[k] = !!s.flags[k];
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
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (this.el) this.close();
      else this.open();
    });
  }

  get isOpen() { return !!this.el; }

  active(name) {
    return this.loggedIn && !!this.flags[name];
  }

  // eingestellter Wert (Fluggeschwindigkeit, Tempo-Faktor)
  value(key) {
    return this.values[key];
  }

  save() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ ok: this.loggedIn, flags: this.flags, values: this.values })); } catch { /* ignorieren */ }
  }

  open() {
    const app = this.app;
    if (app.state === 'welcome' || app.state === 'loading') return;
    if (app.input.locked) app.input.unlock();
    this.el = h('div', { class: 'modal-back admin-back' });
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    this.panel = h('div', { class: 'modal admin small' });
    this.el.appendChild(this.panel);
    app.ui.overlayRoot.appendChild(this.el);
    app.audio.uiClick();
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
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, t('adminTitle')), h('button', { class: 'close-x', onclick: () => this.close() }, '✕')));
    if (!this.loggedIn) this.renderLogin(p);
    else this.renderToggles(p);
  }

  renderLogin(p) {
    const app = this.app;
    const user = h('input', { type: 'text', class: 'field', placeholder: t('adminUser'), autocomplete: 'off', spellcheck: 'false' });
    const pass = h('input', { type: 'password', class: 'field', placeholder: t('adminPass'), autocomplete: 'off' });
    const err = h('div', { class: 'admin-err' });
    const submit = () => {
      if (user.value.trim().toLowerCase() === USER && pass.value === PASS) {
        this.loggedIn = true;
        this.save();
        app.audio.uiConfirm();
        this.render();
      } else {
        app.audio.uiError();
        err.textContent = t('adminWrong');
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
    p.appendChild(h('p', { class: 'hint' }, t('adminHint')));
    for (const k of TOGGLES) {
      const on = this.flags[k];
      p.appendChild(h('div', { class: 'set-row' },
        h('div', { class: 'set-label' }, t('admin_' + k), h('small', {}, t('admin_' + k + 'Desc'))),
        h('div', { class: 'set-ctrl' }, h('button', {
          class: 'toggle' + (on ? ' on' : ''),
          onclick: () => {
            app.audio.uiClick();
            this.flags[k] = !this.flags[k];
            this.save();
            this.updateBadge();
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
    this.renderCoins(p);
    p.appendChild(h('div', { class: 'row end' },
      h('button', {
        class: 'btn ghost small',
        onclick: () => {
          app.audio.uiClick();
          this.loggedIn = false;
          for (const k of TOGGLES) this.flags[k] = false;
          this.save();
          this.updateBadge();
          this.render();
        },
      }, t('adminLogout')),
      h('button', { class: 'btn yellow small', onclick: () => this.close() }, t('close'))));
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
