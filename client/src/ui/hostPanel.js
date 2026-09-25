// "Online hosten": Server über einen sicheren Tunnel weltweit erreichbar machen und Link teilen.
import { h } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';

export class HostPanel {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
  }

  get isOpen() { return !!this.el; }

  open() {
    this.close();
    this.el = h('div', { class: 'modal-back' });
    this.panel = h('div', { class: 'modal host' });
    this.el.appendChild(this.panel);
    this.el.addEventListener('mousedown', (e) => { if (e.target === this.el) this.close(); });
    this.ui.overlayRoot.appendChild(this.el);
    if (this.app.net.connected) this.app.net.send({ t: 'hostStatus' });
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.ui.onOverlayClosed();
  }

  render() {
    if (!this.el) return;
    const app = this.app;
    const st = app.hostStatus || {};
    const p = this.panel;
    p.innerHTML = '';
    p.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, h('span', { class: 'icon', html: ICON.globe }), ' ', t('hostTitle')), h('button', { class: 'close-x', onclick: () => this.close() }, '✕')));
    p.appendChild(h('p', { class: 'hint' }, t('hostDesc')));
    if (!app.net.connected) {
      p.appendChild(h('div', { class: 'warn-box' }, t('serverOffline')));
      return;
    }
    if (!app.isHost) {
      p.appendChild(h('div', { class: 'warn-box' }, t('hostOnlyHost')));
      if (st.url) p.appendChild(this.linkBox(st.url));
      return;
    }
    // Status
    const state = st.state || 'idle';
    let statusText = t('hostOffline');
    let cls = 'off';
    if (state === 'downloading') { statusText = t('hostDownloading', { p: Math.round((st.progress || 0) * 100) }); cls = 'busy'; }
    else if (state === 'starting') { statusText = t('hostStarting'); cls = 'busy'; }
    else if (state === 'online') { statusText = t('hostOnline'); cls = 'on'; }
    else if (state === 'error') { statusText = t('hostError', { msg: st.error || '?' }); cls = 'err'; }
    p.appendChild(h('div', { class: 'host-status ' + cls }, h('span', { class: 'status-dot ' + (cls === 'on' ? 'lobby' : cls === 'busy' ? 'game' : 'offline') }), statusText));
    if (state === 'online' && st.url) p.appendChild(this.linkBox(st.url));
    const busy = state === 'downloading' || state === 'starting';
    const btn = state === 'online'
      ? h('button', { class: 'btn danger', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'hostStop' }); } }, t('hostStop'))
      : h('button', { class: 'btn yellow big', disabled: busy, onclick: () => { app.audio.uiConfirm(); app.net.send({ t: 'hostStart' }); } }, t('hostStart'));
    p.appendChild(h('div', { class: 'row center' }, btn));
    p.appendChild(h('p', { class: 'hint small' }, t('hostVia')));
    // LAN + Portweiterleitung
    const lan = st.lan || [];
    if (lan.length) {
      p.appendChild(h('div', { class: 'lbl' }, t('hostLan')));
      for (const ip of lan) p.appendChild(this.linkBox(`http://${ip}:${st.port}`, true));
    }
    p.appendChild(h('div', { class: 'lbl' }, t('hostPublicIp')));
    p.appendChild(h('p', { class: 'hint small' }, t('hostPortHint', { port: st.port || 4242, ip: st.publicIp || 'DEINE-IP' })));
    if (typeof st.players === 'number') p.appendChild(h('p', { class: 'hint small' }, t('hostPlayers', { n: st.players })));
  }

  linkBox(url, small = false) {
    const input = h('input', { type: 'text', readonly: true, value: url, class: 'link-input' });
    input.addEventListener('focus', () => input.select());
    const copy = h('button', {
      class: 'btn small',
      onclick: () => {
        this.app.audio.uiClick();
        const done = () => this.ui.toast(t('copied'), 'ok');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => { input.select(); document.execCommand('copy'); done(); });
        else { input.select(); document.execCommand('copy'); done(); }
      },
    }, h('span', { class: 'icon', html: ICON.copy }), ' ', t('copy'));
    const row = h('div', { class: 'link-box' + (small ? ' small' : '') }, input, copy);
    if (!small && navigator.share) {
      row.appendChild(h('button', { class: 'btn small ghost', onclick: () => navigator.share({ title: 'SAVANNA ROYALE', text: 'Spiel mit mir SAVANNA ROYALE!', url }).catch(() => {}) }, t('hostShare')));
    }
    return row;
  }
}
