// Admin-Panel: öffnet sich mit der Taste 0 (bewusst nicht in den Tastenbelegungen), Anmeldung mit
// Benutzer + Passwort, danach Schalter für Hitboxen, Aimbot und Fliegen.
import { h } from './dom.js';
import { t } from '../i18n.js';

const USER = 'adrian';
const PASS = '1234';
const STORE = 'showdown.admin';
const TOGGLES = ['hitboxes', 'aimbot', 'fly'];

export class AdminPanel {
  constructor(app) {
    this.app = app;
    this.el = null;
    this.loggedIn = false;
    this.flags = { hitboxes: false, aimbot: false, fly: false };
    try {
      const s = JSON.parse(sessionStorage.getItem(STORE) || 'null');
      if (s && s.ok) {
        this.loggedIn = true;
        for (const k of TOGGLES) this.flags[k] = !!s.flags[k];
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

  save() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ ok: this.loggedIn, flags: this.flags })); } catch { /* ignorieren */ }
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
    }
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

  updateBadge() {
    const on = TOGGLES.filter((k) => this.active(k));
    this.badge.classList.toggle('hidden', !on.length);
    this.badge.textContent = 'ADMIN · ' + on.map((k) => t('admin_' + k).toUpperCase()).join(' · ');
  }
}
