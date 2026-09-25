// Erststart: Benutzernamen wählen (vor der Lobby), danach optional Outfit mit 3D-Vorschau.
import { h } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';
import { validateName, randomName } from '/shared/names.js';
import { OUTFITS, OUTFIT_COLORS } from '/shared/constants.js';

export class WelcomeScreen {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
    this.checkSeq = 0;
    this.valid = false;
  }

  show() {
    this.el = h('div', { class: 'screen welcome-screen' });
    const logo = h('div', { class: 'logo big' }, h('span', { class: 'logo-crown', html: ICON.crown }), h('div', { class: 'logo-top' }, 'SAVANNA'), h('div', { class: 'logo-bottom' }, 'ROYALE'));
    this.input = h('input', { class: 'name-input', type: 'text', maxlength: 16, placeholder: t('namePlaceholder'), autocomplete: 'off', spellcheck: 'false' });
    this.dice = h('button', { class: 'btn dice', title: t('randomName'), html: ICON.dice });
    this.status = h('div', { class: 'name-status' });
    this.suggest = h('div', { class: 'name-suggest' });
    this.nextBtn = h('button', { class: 'btn yellow big', disabled: true }, t('next'));
    const card = h('div', { class: 'welcome-card' },
      h('h2', {}, t('welcomeTitle')),
      h('p', { class: 'sub' }, t('welcomeSub')),
      h('div', { class: 'name-row' }, this.input, this.dice),
      this.status,
      this.suggest,
      this.nextBtn);
    this.el.append(logo, card);
    this.ui.screenRoot.appendChild(this.el);
    this.input.addEventListener('input', () => {
      this.app.audio.uiType();
      this.onChange();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit();
    });
    this.dice.addEventListener('click', () => {
      this.app.audio.uiClick();
      this.input.value = randomName();
      this.onChange();
      this.input.focus();
    });
    this.nextBtn.addEventListener('click', () => this.submit());
    setTimeout(() => this.input.focus(), 50);
    this.onChange();
  }

  setStatus(kind, text) {
    const ic = kind === 'ok' ? ICON.check : kind === 'err' ? ICON.cross : '';
    this.status.className = 'name-status ' + kind;
    this.status.innerHTML = `${ic ? `<span class="icon">${ic}</span>` : ''}<span>${text}</span>`;
  }

  async onChange() {
    const name = this.input.value;
    const seq = ++this.checkSeq;
    this.suggest.innerHTML = '';
    this.valid = false;
    this.nextBtn.disabled = true;
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
      this.setStatus('ok', t('nameOk') + ' · ' + t('nameOffline'));
      this.valid = true;
      this.nextBtn.disabled = false;
      return;
    }
    this.setStatus('checking', t('nameChecking'));
    await new Promise((r) => setTimeout(r, 250));
    if (seq !== this.checkSeq) return;
    const r = await this.app.checkName(name);
    if (seq !== this.checkSeq) return;
    if (r.offline || r.err === 'offline' || r.err === 'timeout') {
      this.setStatus('ok', t('nameOk') + ' · ' + t('nameOffline'));
      this.valid = true;
    } else if (r.ok) {
      this.setStatus('ok', t('nameOk'));
      this.valid = true;
    } else {
      this.setStatus('err', t('nameErr_' + (r.err || 'taken')));
      this.showSuggestions(r.suggestions || []);
    }
    this.nextBtn.disabled = !this.valid;
  }

  showSuggestions(list) {
    this.suggest.innerHTML = '';
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
    if (!this.valid || this.submitting) {
      if (!this.valid) this.app.audio.uiError();
      return;
    }
    this.submitting = true;
    const name = this.input.value;
    // Letzte Prüfung beim Server (Race-Condition vermeiden)
    if (this.app.net.connected) {
      const r = await this.app.checkName(name);
      if (r.ok === false && !r.offline && r.err !== 'offline' && r.err !== 'timeout') {
        this.setStatus('err', t('nameErr_' + (r.err || 'taken')));
        this.showSuggestions(r.suggestions || []);
        this.nextBtn.disabled = true;
        this.submitting = false;
        this.app.audio.uiError();
        return;
      }
    }
    await this.app.finishWelcome(name);
    // Bestätigungsanimation
    this.el.classList.add('confirmed');
    const card = this.el.querySelector('.welcome-card');
    card.innerHTML = `<div class="welcome-done"><span class="icon">${ICON.check}</span><h2></h2></div>`;
    card.querySelector('h2').textContent = t('nameSaved', { name });
    this.ui.confettiBurst(60);
    setTimeout(() => this.showOutfitStep(), 1300);
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
    for (const o of OUTFITS) {
      grid.appendChild(h('button', { class: 'outfit-btn', 'data-o': o, onclick: () => { app.audio.uiClick(); app.profile.set('outfit', o); refresh(); }, onmouseenter: () => app.audio.uiHover() }, t('outfit_' + o)));
    }
    OUTFIT_COLORS.forEach((c, i) => {
      colors.appendChild(h('button', { class: 'swatch', 'data-c': i, style: { background: c }, onclick: () => { app.audio.uiClick(); app.profile.set('color', i); refresh(); } }));
    });
    const panel = h('div', { class: 'outfit-panel' },
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
