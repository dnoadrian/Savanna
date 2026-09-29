// Anmeldung beim Erststart: Benutzernamen + Geburtsdatum wählen (vor der Lobby), danach optional
// Outfit mit 3D-Vorschau. Reiter „Anmelden“: bestehendes Konto mit Name + Geburtsdatum laden.
// Rechts daneben drehen sich Waffen aus dem Spiel.
import { h, esc } from './dom.js';
import { ICON, logo } from './icons.js';
import { t } from '../i18n.js';
import { validateName, randomName } from '../../shared/names.js';
import { OUTFITS, OUTFIT_COLORS } from '../../shared/constants.js';
import { birthKey, validBirthDate } from '../../shared/sha256.js';

export class WelcomeScreen {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
    this.checkSeq = 0;
    this.valid = false;
    this.mode = 'new';
  }

  // opts: { mode: 'new' | 'login', name, msg }
  show(opts = {}) {
    this.hide();
    this.mode = opts.mode || 'new';
    this.el = h('div', { class: 'screen welcome-screen' });
    this.card = h('div', { class: 'welcome-card panel' });
    this.el.append(this.card, h('div', { class: 'welcome-foot' }, t('welcomeFoot')));
    this.ui.screenRoot.appendChild(this.el);
    this.render(opts);
  }

  render(opts = {}) {
    const app = this.app;
    const card = this.card;
    card.innerHTML = '';
    const tab = (id, label) => h('button', {
      class: 'wc-tab' + (this.mode === id ? ' sel' : ''),
      onclick: () => { if (this.mode === id) return; app.audio.uiClick(); this.mode = id; this.render({ name: this.input?.value }); },
    }, label);
    this.input = h('input', { class: 'name-input', type: 'text', maxlength: 16, placeholder: t('namePlaceholder'), autocomplete: 'off', spellcheck: 'false', value: opts.name || '' });
    this.status = h('div', { class: 'name-status' });
    this.suggest = h('div', { class: 'name-suggest' });
    this.birth = birthPicker(() => this.onChange());
    this.birthErr = h('div', { class: 'name-status' });
    card.append(logo('big'), h('div', { class: 'wc-tabs' }, tab('new', t('wcNew')), tab('login', t('wcLogin'))));
    if (this.mode === 'new') {
      this.dice = h('button', { class: 'btn dice', title: t('randomName'), html: ICON.dice });
      this.nextBtn = h('button', { class: 'btn yellow big', disabled: true }, t('next'));
      card.append(
        h('h2', {}, t('welcomeTitle')),
        h('p', { class: 'sub' }, t('welcomeSub')),
        opts.msg ? h('div', { class: 'wc-notice' }, opts.msg) : null,
        h('div', { class: 'name-row' }, this.input, this.dice),
        this.status,
        this.suggest,
        h('div', { class: 'lbl birth-lbl' }, t('birthLabel')),
        this.birth.el,
        h('div', { class: 'hint small birth-hint' }, t('birthHint')),
        this.nextBtn);
      this.dice.addEventListener('click', () => {
        app.audio.uiClick();
        this.input.value = randomName();
        this.onChange();
        this.input.focus();
      });
      this.nextBtn.addEventListener('click', () => this.submit());
    } else {
      this.nextBtn = h('button', { class: 'btn yellow big' }, t('loginBtn'));
      card.append(
        h('h2', {}, t('loginTitle')),
        h('p', { class: 'sub' }, t('loginSub')),
        this.input,
        h('div', { class: 'lbl birth-lbl' }, t('birthLabel')),
        this.birth.el,
        this.status,
        this.nextBtn);
      this.nextBtn.addEventListener('click', () => this.submitLogin());
      if (opts.msg) this.setStatus('err', opts.msg);
    }
    this.input.addEventListener('input', () => {
      app.audio.uiType();
      this.onChange();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.mode === 'new' ? this.submit() : this.submitLogin());
    });
    setTimeout(() => this.input && this.input.focus(), 50);
    if (this.mode === 'new') this.onChange();
  }

  setStatus(kind, text) {
    const ic = kind === 'ok' ? ICON.check : kind === 'err' ? ICON.cross : '';
    this.status.className = 'name-status ' + kind;
    this.status.innerHTML = `${ic ? `<span class="icon">${ic}</span>` : ''}<span>${esc(text)}</span>`;
  }

  updateNext() {
    if (this.mode === 'new' && this.nextBtn) this.nextBtn.disabled = !(this.valid && this.birth.value());
  }

  async onChange() {
    if (!this.el || this.mode !== 'new') {
      if (this.mode === 'login' && this.status && this.status.classList.contains('err')) this.setStatus('', '');
      return;
    }
    const name = this.input.value;
    const seq = ++this.checkSeq;
    this.suggest.innerHTML = '';
    this.valid = false;
    this.updateNext();
    if (!name) {
      this.setStatus('', '');
      return;
    }
    const err = validateName(name);
    if (err) {
      this.setStatus('err', t('nameErr_' + err));
      return;
    }
    if (!this.app.net.connected) {
      const solo = this.app.net.staticSite && !this.app.net.enabled;
      this.setStatus('ok', solo ? t('nameOk') : t('nameOk') + ' · ' + t('nameOffline'));
      this.valid = true;
      this.updateNext();
      return;
    }
    this.setStatus('checking', t('nameChecking'));
    await new Promise((r) => setTimeout(r, 250));
    if (seq !== this.checkSeq) return;
    const r = await this.app.checkName(name);
    if (seq !== this.checkSeq || !this.el) return;
    if (r.offline || r.err === 'offline' || r.err === 'timeout') {
      this.setStatus('ok', t('nameOk') + ' · ' + t('nameOffline'));
      this.valid = true;
    } else if (r.ok) {
      this.setStatus('ok', t('nameOk'));
      this.valid = true;
    } else {
      this.setStatus('err', t('nameErr_' + (r.err || 'taken')));
      if (r.err === 'taken') this.suggest.appendChild(h('button', { class: 'chip login-chip', onclick: () => { this.app.audio.uiClick(); this.mode = 'login'; this.render({ name }); } }, t('wcIsMine')));
      this.showSuggestions(r.suggestions || []);
    }
    this.updateNext();
  }

  showSuggestions(list) {
    if (!list.length) return;
    this.suggest.appendChild(h('span', { class: 'lbl' }, t('nameSuggest')));
    for (const s of list) {
      this.suggest.appendChild(h('button', {
        class: 'chip',
        onclick: () => {
          this.app.audio.uiClick();
          this.input.value = s;
          this.onChange();
        },
      }, s));
    }
  }

  async submit() {
    const date = this.birth.value();
    if (!this.valid || !date || this.submitting) {
      this.app.audio.uiError();
      if (this.valid && !date) this.birth.flash();
      return;
    }
    this.submitting = true;
    const name = this.input.value;
    // Letzte Prüfung beim Server (Race-Condition vermeiden)
    if (this.app.net.connected) {
      const r = await this.app.checkName(name);
      if (r.ok === false && !r.offline && r.err !== 'offline' && r.err !== 'timeout') {
        this.setStatus('err', t('nameErr_' + (r.err || 'taken')));
        this.suggest.innerHTML = '';
        this.showSuggestions(r.suggestions || []);
        this.valid = false;
        this.updateNext();
        this.submitting = false;
        this.app.audio.uiError();
        return;
      }
    }
    await this.app.finishWelcome(name, birthKey(date));
    this.submitting = false;
    this.confirmed(name, () => this.showOutfitStep());
  }

  async submitLogin() {
    if (this.submitting) return;
    const name = this.input.value.trim();
    const date = this.birth.value();
    if (!name) { this.app.audio.uiError(); this.setStatus('err', t('nameErr_empty')); return; }
    if (!date) { this.app.audio.uiError(); this.birth.flash(); return; }
    this.submitting = true;
    this.setStatus('checking', t('loginChecking'));
    const r = await this.app.login(name, birthKey(date));
    this.submitting = false;
    if (!this.el) return;
    if (!r.ok) {
      this.app.audio.uiError();
      this.setStatus('err', t(r.key));
      return;
    }
    this.app.audio.uiConfirm();
    this.confirmed(r.name, () => this.done());
  }

  // Bestätigungsanimation, danach weiter
  confirmed(name, next) {
    this.el.classList.add('confirmed');
    this.card.innerHTML = `<div class="welcome-done"><span class="icon">${ICON.check}</span><h2></h2></div>`;
    this.card.querySelector('h2').textContent = t('nameSaved', { name });
    this.ui.confettiBurst(60);
    setTimeout(next, 1300);
  }

  // Schritt 2: Outfit + Farbe mit 3D-Vorschau
  showOutfitStep() {
    const app = this.app;
    app.lobbyScene.mode = 'lobby';
    app.refreshLobbyMembers();
    this.el.innerHTML = '';
    this.el.classList.add('outfit-step');
    const prof = app.profile.data;
    const grid = h('div', { class: 'outfit-grid' });
    const colors = h('div', { class: 'color-row' });
    const refresh = () => {
      for (const b of grid.children) b.classList.toggle('sel', b.dataset.o === prof.outfit);
      for (const b of colors.children) b.classList.toggle('sel', Number(b.dataset.c) === prof.color);
      app.refreshLobbyMembers();
      app.sendProfile();
    };
    for (const o of OUTFITS.filter((x) => app.profile.owns(x))) {
      grid.appendChild(h('button', { class: 'outfit-btn', 'data-o': o, onclick: () => { app.audio.uiClick(); app.profile.set('outfit', o); refresh(); }, onmouseenter: () => app.audio.uiHover() }, t('outfit_' + o)));
    }
    OUTFIT_COLORS.forEach((c, i) => {
      colors.appendChild(h('button', { class: 'swatch', 'data-c': i, style: { background: c }, onclick: () => { app.audio.uiClick(); app.profile.set('color', i); refresh(); } }));
    });
    const panel = h('div', { class: 'outfit-panel panel' },
      h('h2', {}, t('outfitStep')),
      grid,
      h('div', { class: 'lbl' }, t('color')),
      colors,
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => this.done() }, t('skip')),
        h('button', { class: 'btn yellow', onclick: () => this.done() }, t('done'))));
    this.el.appendChild(panel);
    refresh();
  }

  done() {
    this.app.audio.uiConfirm();
    this.hide();
    this.app.enterLobby();
  }

  hide() {
    if (this.el) this.el.remove();
    this.el = null;
  }
}

// Geburtsdatum: drei Auswahllisten (Tag, Monat, Jahr); value() = „JJJJ-MM-TT“ oder null
function birthPicker(onChange) {
  const year = new Date().getFullYear();
  const opt = (v, label) => h('option', { value: v }, label);
  const day = h('select', { class: 'field birth-sel' }, opt('', t('birthDay')), ...Array.from({ length: 31 }, (_, i) => opt(i + 1, String(i + 1))));
  const month = h('select', { class: 'field birth-sel' }, opt('', t('birthMonth')), ...Array.from({ length: 12 }, (_, i) => opt(i + 1, t('month' + (i + 1)))));
  const yr = h('select', { class: 'field birth-sel' }, opt('', t('birthYear')), ...Array.from({ length: year - 1929 }, (_, i) => opt(year - i, String(year - i))));
  const el = h('div', { class: 'birth-row' }, day, month, yr);
  const value = () => validBirthDate(yr.value, month.value, day.value);
  for (const s of [day, month, yr]) {
    s.addEventListener('change', () => {
      el.classList.toggle('bad', !!(day.value && month.value && yr.value) && !value());
      el.classList.remove('flash');
      onChange();
    });
  }
  const flash = () => {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };
  return { el, value, flash };
}
