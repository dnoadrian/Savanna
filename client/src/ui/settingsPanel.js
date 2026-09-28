// Einstellungen im Fortnite-Stil mit Tabs. Alles wird sofort gespeichert und angewendet.
import { h, esc } from './dom.js';
import { t } from '../i18n.js';
import { KEY_ACTIONS, keyLabel } from '../settings.js';
import { GRAPHICS } from '../render/renderer.js';
import { QUEUE_WAIT_MIN, QUEUE_WAIT_MAX } from '../../shared/constants.js';

const TABS = ['account', 'graphics', 'hud', 'controls', 'mouse', 'audio'];
const TAB_LABEL = { account: 'tabAccount', graphics: 'tabGraphics', hud: 'tabHud', controls: 'tabControls', mouse: 'tabMouse', audio: 'tabAudio' };

export class SettingsPanel {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.s = ui.app.settings;
    this.tab = 'graphics';
    this.el = null;
  }

  open(tab) {
    if (tab) this.tab = tab;
    this.close();
    this.el = h('div', { class: 'modal-back' });
    this.panel = h('div', { class: 'modal settings' });
    this.el.appendChild(this.panel);
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    this.ui.overlayRoot.appendChild(this.el);
    this.render();
    this.unsub = this.s.onChange(() => { if (!this.capturing) this.renderBody(); });
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.unsub && this.unsub();
    this.ui.onOverlayClosed();
  }

  get isOpen() { return !!this.el; }

  render() {
    const p = this.panel;
    p.innerHTML = '';
    const tabs = h('div', { class: 'tabs' });
    for (const tb of TABS) {
      tabs.appendChild(h('button', {
        class: 'tab' + (tb === this.tab ? ' sel' : ''),
        onclick: () => { this.app.audio.uiClick(); this.tab = tb; this.render(); },
        onmouseenter: () => this.app.audio.uiHover(),
      }, t(TAB_LABEL[tb])));
    }
    p.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, t('menuSettings')), h('button', { class: 'close-x', onclick: () => { this.app.audio.uiClick(); this.close(); } }, '✕')));
    p.appendChild(tabs);
    this.body = h('div', { class: 'settings-body' });
    p.appendChild(this.body);
    this.renderBody();
  }

  renderBody() {
    if (!this.body) return;
    const scroll = this.body.scrollTop;
    this.body.innerHTML = '';
    this['tab_' + this.tab]();
    this.body.scrollTop = scroll;
  }

  // ---------- Bausteine ----------
  row(label, control, hint) {
    const r = h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label, hint ? h('small', {}, hint) : null), h('div', { class: 'set-ctrl' }, control));
    this.body.appendChild(r);
    return r;
  }

  section(title) {
    this.body.appendChild(h('div', { class: 'set-section' }, title));
  }

  seg(key, options, labelFn, onSet) {
    const wrap = h('div', { class: 'seg' });
    const cur = this.s.get(key);
    for (const o of options) {
      wrap.appendChild(h('button', {
        class: 'seg-btn' + (String(cur) === String(o) ? ' sel' : ''),
        onclick: () => {
          this.app.audio.uiClick();
          if (onSet) onSet(o);
          else this.s.set(key, o);
        },
      }, labelFn(o)));
    }
    return wrap;
  }

  toggle(key, onSet) {
    const v = !!this.s.get(key);
    return h('button', {
      class: 'toggle' + (v ? ' on' : ''),
      onclick: () => {
        this.app.audio.uiClick();
        if (onSet) onSet(!v);
        else this.s.set(key, !v);
      },
    }, h('span', { class: 'knob' }), h('span', { class: 'tl' }, v ? t('on') : t('off')));
  }

  // Schalter für Werte 'on' / 'off'
  toggle2(key) {
    const v = this.s.get(key) === 'on';
    return h('button', {
      class: 'toggle' + (v ? ' on' : ''),
      onclick: () => { this.app.audio.uiClick(); this.s.set(key, v ? 'off' : 'on'); },
    }, h('span', { class: 'knob' }), h('span', { class: 'tl' }, v ? t('on') : t('off')));
  }

  slider(key, min, max, step, fmt = (v) => v, onSet) {
    const v = this.s.get(key);
    const out = h('span', { class: 'slider-val' }, fmt(v));
    const inp = h('input', { type: 'range', min, max, step, value: v });
    inp.addEventListener('input', () => {
      const nv = Number(inp.value);
      out.textContent = fmt(nv);
      this.capturing = true;
      if (onSet) onSet(nv);
      else this.s.set(key, nv);
      this.capturing = false;
    });
    inp.addEventListener('change', () => this.app.audio.uiClick());
    return h('div', { class: 'slider' }, inp, out);
  }

  // ---------- Tabs ----------
  tab_account() {
    const app = this.app;
    const prof = app.profile.data;
    this.section(t('tabAccount'));
    this.row(t('sName'), h('div', { class: 'row' }, h('b', { class: 'acc-name' }, prof.name), h('button', { class: 'btn small', onclick: () => { app.audio.uiClick(); this.ui.renameDialog(); } }, t('sChangeName'))));
    const idEl = h('code', { class: 'pid' }, prof.id);
    this.row(t('sPlayerId'), h('div', { class: 'row' }, idEl, h('button', {
      class: 'btn small ghost',
      onclick: () => { navigator.clipboard?.writeText(prof.id).catch(() => {}); this.ui.toast(t('copied')); },
    }, t('copy'))));
    this.row(t('sLanguage'), this.seg('language', ['de', 'en'], (o) => (o === 'de' ? 'Deutsch' : 'English')));
    this.row(t('sSignOut'), h('button', {
      class: 'btn small ghost',
      onclick: () => {
        app.audio.uiClick();
        this.ui.confirm(t('sSignOutConfirm'), () => {
          this.close();
          app.signOut();
        });
      },
    }, t('sSignOut')), t('sSignOutHint'));
    this.row(t('sReset'), h('button', {
      class: 'btn small danger',
      onclick: () => {
        app.audio.uiClick();
        this.ui.confirm(t('sResetConfirm'), () => {
          this.close();
          app.resetAccount();
        });
      },
    }, t('sReset')));
    this.section(t('sQueue'));
    this.row(t('sQueueWait'), this.slider('queueWait', QUEUE_WAIT_MIN, QUEUE_WAIT_MAX, 5, (v) => v + ' s'), t('sQueueWaitHint'));
  }

  tab_graphics() {
    this.section(t('tabGraphics'));
    // Grafikqualität ist für alle gleich (Leistungsmodus mit Schatten niedrig und epischer Sichtweite)
    const fixed = (text) => h('b', { class: 'fixed-val' }, text);
    this.row(t('sRenderMode'), fixed(t('rm_performance')), t('gfxFixedHint'));
    this.row(t('sShadows'), fixed(t('sh_' + GRAPHICS.shadows)));
    this.row(t('sViewDistance'), fixed(t('vd_' + GRAPHICS.viewDistance)));
    this.row(t('sGrass'), fixed(t('gr_' + GRAPHICS.grass)));
    this.row(t('sResolution'), fixed(GRAPHICS.resolution + ' %'));
    this.row(t('sFpsLimit'), this.seg('fpsLimit', ['30', '60', '120', '144', '240', 'unlimited'], (o) => (o === 'unlimited' ? t('unlimited') : o)));
    this.row(t('sVsync'), this.toggle('vsync'));
    this.row(t('sFov'), this.slider('fov', 70, 110, 1, (v) => v + '°'));
    const fs = !!document.fullscreenElement;
    this.row(t('sFullscreen'), h('button', { class: 'toggle' + (fs ? ' on' : ''), onclick: () => { this.app.audio.uiClick(); this.ui.toggleFullscreen(); setTimeout(() => this.renderBody(), 300); } }, h('span', { class: 'knob' }), h('span', { class: 'tl' }, fs ? t('on') : t('off'))));
  }

  tab_hud() {
    const s = this.s;
    this.section(t('tabHud'));
    this.row(t('sShowFps'), this.toggle('showFps'));
    this.row(t('sShowPing'), this.toggle('showPing'));
    this.row(t('sDamageNumbers'), this.toggle('damageNumbers'));
    this.row(t('sMinimap'), this.toggle('minimap'));
    this.row(t('sHudScale'), this.slider('hudScale', 70, 130, 5, (v) => v + ' %'));
    this.row(t('sHeadBob'), this.toggle('headBob'));
    this.row(t('sColorblind'), this.seg('colorblind', ['off', 'deuteranopia', 'protanopia', 'tritanopia'], (o) => t('cb_' + o)));
    this.section(t('sCrosshair'));
    const colors = ['#ffffff', '#00ff66', '#ffe600', '#00e5ff', '#ff4dd2', '#ff3b3b'];
    const colorRow = h('div', { class: 'row' });
    for (const c of colors) colorRow.appendChild(h('button', { class: 'swatch small' + (s.get('crossColor') === c ? ' sel' : ''), style: { background: c }, onclick: () => { this.app.audio.uiClick(); s.set('crossColor', c); } }));
    const picker = h('input', { type: 'color', value: s.get('crossColor') });
    picker.addEventListener('input', () => { this.capturing = true; s.set('crossColor', picker.value); this.capturing = false; this.updatePreview(); });
    colorRow.appendChild(picker);
    this.row(t('sCrossColor'), colorRow);
    this.row(t('sCrossShape'), this.seg('crossShape', ['cross', 'dot', 'circle', 't'], (o) => t('cs_' + o)));
    this.row(t('sCrossSize'), this.slider('crossSize', 50, 200, 10, (v) => v + ' %', (v) => { s.set('crossSize', v); this.updatePreview(); }));
    this.row(t('sCrossDot'), this.toggle('crossDot'));
    this.preview = h('div', { class: 'cross-preview' });
    this.body.appendChild(this.preview);
    this.updatePreview();
  }

  updatePreview() {
    if (!this.preview) return;
    const s = this.s;
    const shape = s.get('crossShape');
    const c = h('div', { class: 'crosshair shape-' + shape, style: { position: 'relative', left: '0', top: '0' } });
    c.style.setProperty('--cross-color', s.get('crossColor'));
    c.style.setProperty('--cross-size', s.get('crossSize') / 100);
    c.style.setProperty('--gap', '6px');
    if (shape === 'cross' || shape === 't') for (const d of shape === 't' ? ['l', 'r', 'b'] : ['t', 'l', 'r', 'b']) c.appendChild(h('div', { class: 'ch-line ch-' + d }));
    else if (shape === 'circle') c.appendChild(h('div', { class: 'ch-circle' }));
    if (s.get('crossDot') || shape === 'dot') c.appendChild(h('div', { class: 'ch-dot' }));
    this.preview.innerHTML = '';
    this.preview.appendChild(c);
  }

  tab_controls() {
    const s = this.s;
    this.section(t('tabControls'));
    this.body.appendChild(h('p', { class: 'hint' }, t('sKeysHint')));
    const dups = s.duplicateKeys();
    if (dups.size) this.body.appendChild(h('div', { class: 'warn-box' }, '⚠ ' + t('sKeyDup')));
    const keys = s.get('keys');
    for (const a of KEY_ACTIONS) {
      const btn = h('button', { class: 'key-btn' + (dups.has(a) ? ' dup' : '') }, keyLabel(keys[a]));
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.audio.uiClick();
        btn.textContent = t('sPressKey');
        btn.classList.add('capturing');
        this.capturing = true;
        this.app.input.captureNext((code) => {
          this.capturing = false;
          if (code) s.set('keys', { ...s.get('keys'), [a]: code });
          this.renderBody();
        });
      });
      this.row(t('act_' + a), h('div', { class: 'row' }, btn, dups.has(a) ? h('span', { class: 'dup-tag' }, t('sKeyDup')) : null));
    }
    this.body.appendChild(h('div', { class: 'row end' }, h('button', { class: 'btn small', onclick: () => { this.app.audio.uiClick(); s.resetKeys(); } }, t('sKeysReset'))));
  }

  tab_mouse() {
    this.section(t('tabMouse'));
    this.row(t('sSensX'), this.slider('sensX', 0.1, 3, 0.05, (v) => Number(v).toFixed(2)));
    this.row(t('sSensY'), this.slider('sensY', 0.1, 3, 0.05, (v) => Number(v).toFixed(2)));
    this.row(t('sAdsSens'), this.slider('adsSens', 0.2, 1.5, 0.05, (v) => Number(v).toFixed(2)));
    this.row(t('sScopeSens'), this.slider('scopeSens', 0.2, 1.5, 0.05, (v) => Number(v).toFixed(2)));
    this.row(t('sInvertY'), this.toggle('invertY'));
    this.row(t('sSprintMode'), this.seg('sprintMode', ['hold', 'toggle'], (o) => t('mode_' + o)));
    this.row(t('sCrouchMode'), this.seg('crouchMode', ['hold', 'toggle'], (o) => t('mode_' + o)));
    this.row(t('sAimAssist'), this.toggle2('aimAssist'), t('sAimAssistHint'));
  }

  tab_audio() {
    this.section(t('tabAudio'));
    const pct = (v) => v + ' %';
    this.row(t('sVolMaster'), this.slider('volMaster', 0, 100, 1, pct));
    this.row(t('sVolSfx'), this.slider('volSfx', 0, 100, 1, pct));
    this.row(t('sVolMusic'), this.slider('volMusic', 0, 100, 1, pct));
    this.row(t('sVolUi'), this.slider('volUi', 0, 100, 1, pct));
    this.row(t('sLobbyMusic'), this.toggle('lobbyMusic'));
  }
}

export { esc };
