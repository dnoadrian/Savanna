// Freunde-Panel (Slide-in von rechts) mit Tabs Freunde / Anfragen / Hinzufügen.
import { h, esc } from './dom.js';
import { ICON } from './icons.js';
import { t } from '../i18n.js';

export class FriendsPanel {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.tab = 'friends';
    this.el = null;
  }

  get isOpen() { return !!this.el; }

  open(tab) {
    if (tab) this.tab = tab;
    if (this.el) { this.render(); return; }
    this.el = h('div', { class: 'side-panel friends' });
    this.ui.overlayRoot.appendChild(this.el);
    requestAnimationFrame(() => this.el && this.el.classList.add('open'));
    this.render();
  }

  close() {
    if (!this.el) return;
    const el = this.el;
    this.el = null;
    el.classList.remove('open');
    setTimeout(() => el.remove(), 250);
    this.ui.onOverlayClosed();
  }

  render() {
    if (!this.el) return;
    const app = this.app;
    const soc = app.social;
    const el = this.el;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'modal-head' }, h('h2', {}, t('friends')), h('button', { class: 'close-x', onclick: () => { app.audio.uiClick(); this.close(); } }, '✕')));
    if (!app.net.connected) {
      el.appendChild(h('div', { class: 'empty' }, t('serverOffline')));
      return;
    }
    const tabs = h('div', { class: 'tabs small' });
    const mk = (id, label, badge) => h('button', { class: 'tab' + (this.tab === id ? ' sel' : ''), onclick: () => { app.audio.uiClick(); this.tab = id; this.render(); } }, label, badge ? h('span', { class: 'badge' }, String(badge)) : null);
    tabs.append(mk('friends', t('friends')), mk('requests', t('requests'), soc.incoming.length), mk('add', t('addFriend')));
    el.appendChild(tabs);
    const body = h('div', { class: 'fp-body' });
    el.appendChild(body);
    if (this.tab === 'friends') this.renderFriends(body);
    else if (this.tab === 'requests') this.renderRequests(body);
    else this.renderAdd(body);
  }

  renderFriends(body) {
    const app = this.app;
    const list = app.social.friends.slice().sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
    if (!list.length) {
      body.appendChild(h('div', { class: 'empty' }, t('noFriends')));
    }
    const party = app.party;
    for (const f of list) {
      const inMyParty = party && party.members.some((m) => m.id === f.id);
      const actions = h('div', { class: 'f-actions' });
      if (f.status !== 'offline' && f.status !== 'game' && !inMyParty) actions.appendChild(h('button', { class: 'btn small', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'partyInvite', id: f.id }); } }, t('invite')));
      if (f.partyOpen && f.status === 'lobby' && !inMyParty) actions.appendChild(h('button', { class: 'btn small ghost', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'partyJoin', id: f.id }); } }, t('joinParty')));
      actions.appendChild(h('button', {
        class: 'mini', title: t('remove'),
        onclick: () => this.ui.confirm(t('removeConfirm', { name: f.name }), () => app.net.send({ t: 'friendRemove', id: f.id })),
      }, '✕'));
      actions.appendChild(h('button', { class: 'mini danger', title: t('block'), onclick: () => { app.audio.uiClick(); app.net.send({ t: 'block', id: f.id }); } }, '⛔'));
      body.appendChild(h('div', { class: 'f-row' },
        h('span', { class: 'status-dot ' + f.status }),
        h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, f.name, f.streak > 0 ? h('span', { class: 'f-crown', html: ICON.crown }) : null), h('div', { class: 'f-status' }, statusText(f.status) + (inMyParty ? ' · Party' : ''))),
        actions));
    }
    if (app.social.blocked.length) {
      body.appendChild(h('div', { class: 'lbl' }, t('blocked')));
      for (const b of app.social.blocked) {
        body.appendChild(h('div', { class: 'f-row' }, h('span', { class: 'status-dot offline' }), h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, b.name)),
          h('div', { class: 'f-actions' }, h('button', { class: 'btn small ghost', onclick: () => app.net.send({ t: 'unblock', id: b.id }) }, t('unblock')))));
      }
    }
  }

  renderRequests(body) {
    const app = this.app;
    const soc = app.social;
    body.appendChild(h('div', { class: 'lbl' }, t('incoming')));
    if (!soc.incoming.length) body.appendChild(h('div', { class: 'empty small' }, t('noRequests')));
    for (const r of soc.incoming) {
      body.appendChild(h('div', { class: 'f-row' }, h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, r.name)),
        h('div', { class: 'f-actions' },
          h('button', { class: 'btn small yellow', onclick: () => { app.audio.uiConfirm(); app.net.send({ t: 'friendAccept', id: r.id }); } }, t('accept')),
          h('button', { class: 'btn small ghost', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'friendDecline', id: r.id }); } }, t('decline')))));
    }
    body.appendChild(h('div', { class: 'lbl' }, t('outgoing')));
    if (!soc.outgoing.length) body.appendChild(h('div', { class: 'empty small' }, t('noRequests')));
    for (const r of soc.outgoing) {
      body.appendChild(h('div', { class: 'f-row' }, h('div', { class: 'f-main' }, h('div', { class: 'f-name' }, r.name)),
        h('div', { class: 'f-actions' }, h('button', { class: 'btn small ghost', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'friendCancel', id: r.id }); } }, t('withdraw')))));
    }
  }

  renderAdd(body) {
    const app = this.app;
    const input = h('input', { type: 'text', maxlength: 16, placeholder: t('searchName'), class: 'add-input' });
    const send = async () => {
      const name = input.value.trim();
      if (!name) return;
      app.audio.uiClick();
      const r = await app.net.request({ t: 'friendRequest', name });
      if (r.ok) {
        this.ui.toast(t('requestSent', { name: r.name || name }), 'ok');
        input.value = '';
      } else {
        this.ui.toast(t(r.key || 'err_generic'), 'error');
        app.audio.uiError();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
      else if (e.key.length === 1) app.audio.uiType();
    });
    body.appendChild(h('div', { class: 'add-row' }, input, h('button', { class: 'btn yellow small', onclick: send }, t('sendRequest'))));
    setTimeout(() => input.focus(), 30);
  }
}

function rank(s) {
  return { game: 0, lobby: 1, online: 1, offline: 3 }[s] ?? 2;
}

function statusText(s) {
  return { online: t('statusOnline'), lobby: t('statusLobby'), game: t('statusGame'), offline: t('statusOffline') }[s] || s;
}

export { esc };
