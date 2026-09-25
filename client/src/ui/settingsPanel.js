// Einstellungen im Fortnite-Stil mit Tabs. Alles wird sofort gespeichert und angewendet.
import { h, esc } from './dom.js';
import { t } from '../i18n.js';
import { KEY_ACTIONS, keyLabel } from '../settings.js';
import { QUALITY_PRESETS } from '../render/renderer.js';

const TABS = ['account', 'graphics', 'hud', 'controls', 'mouse', 'audio', 'game'];
const TAB_LABEL = { account: 'tabAccount', graphics: 'tabGraphics', hud: 'tabHud', controls: 'tabControls', mouse: 'tabMouse', audio: 'tabAudio', game: 'tabGame' };
const GFX_KEYS = ['resolution', 'shadows', 'viewDistance', 'grass', 'antialias', 'post'];

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

  setGfx(key, value) {
    const s = this.s;
    const vals = {};
    for (const k of GFX_KEYS) vals[k] = s.get(k);
    vals[key] = value;
    let preset = 'custom';
    for (const [name, p] of Object.entries(QUALITY_PRESETS)) {
      if (GFX_KEYS.every((k) => String(p[k]) === String(vals[k]))) preset = name;
    }
    s.setMany({ [key]: value, quality: preset });
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
  }

  tab_graphics() {
    const s = this.s;
    this.section(t('tabGraphics'));
    const q = s.get('quality');
    const presetSeg = this.seg('quality', ['low', 'medium', 'high', 'epic', 'auto'], (o) => t('q_' + o), (o) => {
      if (o === 'auto') s.set('quality', 'auto');
      else s.setMany({ quality: o, ...QUALITY_PRESETS[o] });
    });
    this.row(t('sQuality'), presetSeg, q === 'custom' ? t('q_custom') : q === 'auto' ? `→ ${t('q_' + this.app.autoLevel)}` : null);
    this.row(t('sResolution'), this.slider('resolution', 50, 100, 5, (v) => v + ' %', (v) => this.setGfx('resolution', v)));
    this.row(t('sShadows'), this.seg('shadows', ['off', 'low', 'high'], (o) => t('sh_' + o), (o) => this.setGfx('shadows', o)));
    this.row(t('sViewDistance'), this.seg('viewDistance', ['near', 'medium', 'far', 'epic'], (o) => t('vd_' + o), (o) => this.setGfx('viewDistance', o)));
    this.row(t('sGrass'), this.seg('grass', ['off', 'low', 'medium', 'high'], (o) => t('gr_' + o), (o) => this.setGfx('grass', o)));
    this.row(t('sAA'), this.toggle('antialias', (v) => this.setGfx('antialias', v)));
    this.row(t('sPost'), this.toggle('post', (v) => this.setGfx('post', v)));
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
    this.row(t('sInvertY'), this.toggle('invertY'));
    this.row(t('sSprintMode'), this.seg('sprintMode', ['hold', 'toggle'], (o) => t('mode_' + o)));
    this.row(t('sCrouchMode'), this.seg('crouchMode', ['hold', 'toggle'], (o) => t('mode_' + o)));
    this.row(t('sAimAssist'), this.seg('aimAssist', ['off', 'weak', 'medium', 'strong'], (o) => t('aa_' + o)));
  }

  tab_audio() {
    this.section(t('tabAudio'));
    const pct = (v) => v + ' %';
    this.row(t('sVolMaster'), this.slider('volMaster', 0, 100, 1, pct));
    this.row(t('sVolSfx'), this.slider('volSfx', 0, 100, 1, pct));
    this.row(t('sVolMusic'), this.slider('volMusic', 0, 100, 1, pct));
    this.row(t('sVolUi'), this.slider('volUi', 0, 100, 1, pct));
    this.row(t('sVolAmbient'), this.slider('volAmbient', 0, 100, 1, pct));
    this.row(t('sLobbyMusic'), this.toggle('lobbyMusic'));
  }

  tab_game() {
    this.section(t('tabGame'));
    this.row(t('sBotDifficulty'), this.seg('botDifficulty', ['easy', 'normal', 'hard', 'pro'], (o) => t('bd_' + o)));
    this.row(t('sStorm'), this.toggle('storm'));
    this.row(t('sAmmo'), this.seg('infiniteAmmo', [true, false], (o) => (o ? t('ammo_inf') : t('ammo_180'))));
    this.row(t('sLanguage'), this.seg('language', ['de', 'en'], (o) => (o === 'de' ? 'Deutsch' : 'English')));
    this.row(t('sThirdPerson'), this.toggle('thirdPerson'));
    this.row(t('sPlayerCount'), h('b', {}, t('sPlayerCountFixed')));
  }
}

export { esc };
