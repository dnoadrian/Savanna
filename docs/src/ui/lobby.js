// Lobby: schlichte Kopfzeile (Logo, Spielerkarte, Freunde/Einstellungen), 3D-Figur in der Mitte,
// Party + Chat links, rechts der Modus mit Kartenvorschau und der große BEREIT-Knopf.
// BEREIT = 15 s Warteschlange, danach geht es immer in eine Lobby mit Bots (freie Plätze).
import { h, esc } from './dom.js';
import { ICON, logo } from './icons.js';
import { t } from '../i18n.js';
import { OUTFITS, OUTFIT_COLORS, CROWN_STYLES, MATCH_SIZE, PARTY_MAX, xpForLevel, clampQueueWait } from '../../shared/constants.js';

export class LobbyScreen {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
    this.chatLog = [];
    this.lockerOpen = false;
    this.menuOpen = false;
  }

  show() {
    this.hide();
    const app = this.app;
    this.el = h('div', { class: 'screen lobby-screen' });
    // ---- Kopfzeile ----
    this.nameBtn = h('button', { class: 'pc-name', title: t('clickName'), onclick: () => { app.audio.uiClick(); this.ui.renameDialog(); } });
    this.levelEl = h('div', { class: 'pc-level' });
    this.xpFill = h('div', { class: 'xp-fill' });
    this.xpText = h('div', { class: 'pc-xp' });
    const card = h('div', { class: 'player-card' }, this.levelEl,
      h('div', { class: 'pc-main' }, this.nameBtn, h('div', { class: 'xp-bar' }, this.xpFill), this.xpText));
    this.serverDot = h('button', { class: 'server-pill' });
    this.serverDot.addEventListener('click', () => { app.audio.uiClick(); this.ui.openHost(); });
    this.friendsBadge = h('span', { class: 'badge hidden' });
    const iconBtn = (ic, title, fn, extra = null) => h('button', { class: 'icon-btn', title, html: ICON[ic], onclick: (e) => { e.stopPropagation(); app.audio.uiClick(); fn(); }, onmouseenter: () => app.audio.uiHover() }, extra);
    this.friendsBtn = iconBtn('friends', t('menuFriends'), () => this.ui.openFriends());
    this.friendsBtn.appendChild(this.friendsBadge);
    this.menuEl = h('div', { class: 'dropdown hidden' },
      this.menuItem('chart', t('menuStats'), () => this.ui.openStats()),
      this.menuItem('globe', app.net.staticSite ? t('menuServer') : t('menuHost'), () => this.ui.openHost()),
      this.menuItem('info', t('menuCredits'), () => this.ui.openCredits()),
      this.menuItem('exit', t('menuQuit'), () => this.ui.quitGame()));
    const nav = h('nav', { class: 'top-nav' },
      this.navBtn('play', t('navPlay'), () => this.toggleLocker(false)),
      this.navBtn('locker', t('locker'), () => this.toggleLocker(true)),
      this.navBtn('stats', t('menuStats'), () => this.ui.openStats()));
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'tb-left' }, logo('small'), nav),
      h('div', { class: 'tb-right' }, this.serverDot, this.friendsBtn,
        iconBtn('gear', t('menuSettings'), () => this.ui.openSettings()),
        iconBtn('fullscreen', t('fullscreen'), () => this.ui.toggleFullscreen()),
        iconBtn('menu', t('menu'), () => this.toggleMenu()), this.menuEl));
    // ---- links: Spielerkarte, Party, Chat ----
    this.partyEl = h('div', { class: 'party-panel' });
    this.chatLogEl = h('div', { class: 'chat-log' });
    this.chatInput = h('input', { type: 'text', maxlength: 140, placeholder: t('chatPlaceholder') });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
      else if (e.key.length === 1) app.audio.uiType();
    });
    this.chatEl = h('div', { class: 'chat panel hidden' }, h('div', { class: 'panel-title' }, t('partyChat')), this.chatLogEl,
      h('div', { class: 'chat-row' }, this.chatInput, h('button', { class: 'btn small', onclick: () => this.sendChat() }, t('send'))));
    this.statsEl = h('div', { class: 'stat-chips' });
    const left = h('div', { class: 'lobby-left' }, card, this.statsEl, this.partyEl, this.chatEl);
    // ---- rechts: Modus + BEREIT ----
    this.mapThumb = h('canvas', { class: 'mode-map', width: 240, height: 240 });
    this.countEl = h('div', { class: 'mode-count' });
    const mode = h('div', { class: 'mode-card' },
      this.mapThumb,
      h('div', { class: 'mode-info' },
        h('div', { class: 'mode-kicker' }, t('modeKicker')),
        h('div', { class: 'mode-title' }, 'SHOWDOWN BAY'),
        this.countEl));
    this.queueEl = h('div', { class: 'queue-box hidden' });
    this.readyBtn = h('button', { class: 'ready-btn', onclick: () => this.onReady(), onmouseenter: () => app.audio.uiHover() });
    this.readyHint = h('div', { class: 'ready-hint' });
    const right = h('div', { class: 'lobby-right' }, mode, this.queueEl, this.readyBtn, this.readyHint);
    // ---- Spind ----
    this.lockerEl = h('div', { class: 'locker panel hidden' });
    // Namen über den Figuren
    this.labelsEl = h('div', { class: 'member-labels' });
    this.el.append(this.labelsEl, top, left, right, this.lockerEl);
    this.ui.screenRoot.appendChild(this.el);
    this.closeMenuFn = () => this.toggleMenu(false);
    document.addEventListener('click', this.closeMenuFn);
    this.navSel = 'play';
    this.refresh();
    this.renderChat();
  }

  navBtn(id, label, fn) {
    return h('button', {
      class: 'nav-btn', 'data-nav': id,
      onclick: () => { this.app.audio.uiClick(); if (id !== 'stats') this.navSel = id; fn(); this.updateNav(); },
      onmouseenter: () => this.app.audio.uiHover(),
    }, label);
  }

  updateNav() {
    if (!this.el) return;
    for (const b of this.el.querySelectorAll('.nav-btn')) b.classList.toggle('sel', b.dataset.nav === (this.lockerOpen ? 'locker' : 'play'));
  }

  menuItem(ic, label, fn) {
    return h('button', { class: 'dd-item', onclick: () => { this.app.audio.uiClick(); this.toggleMenu(false); fn(); }, onmouseenter: () => this.app.audio.uiHover() }, h('span', { class: 'icon', html: ICON[ic] }), label);
  }

  toggleMenu(v) {
    this.menuOpen = v === undefined ? !this.menuOpen : v;
    if (this.menuEl) this.menuEl.classList.toggle('hidden', !this.menuOpen);
  }

  hide() {
    if (this.el) {
      this.el.remove();
      document.removeEventListener('click', this.closeMenuFn);
    }
    this.el = null;
  }

  // ---------------- Aktualisieren ----------------
  refresh() {
    if (!this.el) return;
    const app = this.app;
    const prof = app.profile.data;
    if (!prof) return;
    const st = prof.stats;
    this.nameBtn.innerHTML = `${prof.winStreak > 0 ? `<span class="crown-mini">${ICON.crown}</span>` : ''}<span>${esc(prof.name)}</span><span class="edit">✎</span>`;
    this.levelEl.innerHTML = `<small>${t('level')}</small><b>${st.level}</b>`;
    const need = xpForLevel(st.level);
    this.xpFill.style.width = Math.min(100, (st.xp / need) * 100) + '%';
    this.xpText.textContent = `${st.xp} / ${need} XP`;
    this.statsEl.innerHTML = `
      <div class="stat-chip"><b>${st.wins}</b><small>${t('wins')}</small></div>
      <div class="stat-chip"><b>${st.kills}</b><small>${t('kills')}</small></div>
      <div class="stat-chip"><b>${st.matches}</b><small>${t('st_matches')}</small></div>
      ${prof.winStreak > 0 ? `<div class="stat-chip streak"><b>${prof.winStreak}</b><small>${t('streak')}</small></div>` : ''}`;
    // Server
    const net = app.net;
    let srv;
    if (net.connected) srv = net.serverUrl ? t('connectedTo', { host: net.serverHost }) : t('serverOnline');
    else if (net.failed) srv = t('serverFailed');
    else if (net.staticSite && !net.enabled) srv = t('serverStatic');
    else srv = net.enabled ? t('connecting') : t('serverOffline');
    this.serverDot.className = 'server-pill ' + (net.connected ? 'on' : net.staticSite && !net.enabled ? 'solo' : 'off');
    this.serverDot.innerHTML = `<i></i><span>${esc(srv)}</span>`;
    const reqs = app.social.incoming.length;
    this.friendsBadge.textContent = reqs;
    this.friendsBadge.classList.toggle('hidden', reqs === 0);
    // Kartenvorschau
    this.drawMapThumb();
    // Spielerzahl
    const party = app.party;
    const inParty = party && party.members.length > 1;
    const q = app.queue;
    const humans = q ? q.humans : Math.max(1, inParty ? party.members.length : 1);
    this.countEl.textContent = t('playersCount', { n: MATCH_SIZE, h: humans, b: MATCH_SIZE - humans });
    // BEREIT-Knopf
    const myId = prof.id;
    const leader = party ? party.leader === myId : true;
    const me = party ? party.members.find((m) => m.id === myId) : null;
    const rb = this.readyBtn;
    rb.disabled = false;
    rb.className = 'ready-btn';
    if (q) {
      rb.classList.add('queued');
      rb.innerHTML = `<span class="rb-main">${t('queueCancel')}</span>`;
      rb.disabled = !!(party && !leader && !q.local);
    } else if (inParty && !leader) {
      const on = !!(me && me.ready);
      rb.classList.toggle('on', on);
      rb.innerHTML = `<span class="rb-main">${on ? t('readyOn') : t('readyBtn')}</span><span class="rb-sub">${t('onlyLeader')}</span>`;
    } else {
      const notReady = inParty ? party.members.filter((m) => m.id !== party.leader && !m.ready) : [];
      rb.disabled = notReady.length > 0;
      rb.innerHTML = `<span class="rb-main">${t('readyBtn')}</span>${notReady.length ? `<span class="rb-sub">${t('waitReady')}</span>` : ''}`;
    }
    // Warteschlange (eigene Wartezeit aus den Einstellungen)
    const myWait = clampQueueWait(app.settings.get('queueWait'));
    this.readyHint.textContent = t('readyHint', { s: q && q.wait ? q.wait : myWait });
    if (q) {
      this.queueEl.classList.remove('hidden');
      const secs = Math.max(0, Math.ceil(q.secs));
      const pct = Math.max(0, Math.min(100, (1 - q.secs / (q.wait || myWait)) * 100));
      this.queueEl.innerHTML = `<div class="q-top"><span class="q-spin"></span><b>${esc(t('queueSearching'))}</b><span class="q-secs">${secs}s</span></div>
        <div class="q-bar"><div style="width:${pct}%"></div></div>
        <div class="q-info">${esc(t('queueInfo', { h: q.humans, b: MATCH_SIZE - q.humans }))}</div>`;
    } else this.queueEl.classList.add('hidden');
    this.renderParty();
    if (this.lockerOpen) this.renderLocker();
    this.updateNav();
  }

  drawMapThumb() {
    const data = this.app.mapData;
    if (!data || this.thumbDone === data) return;
    this.thumbDone = data;
    const g = this.mapThumb.getContext('2d');
    g.drawImage(data.mapImage, 0, 0, 240, 240);
  }

  onReady() {
    const app = this.app;
    const party = app.party;
    const inParty = party && party.members.length > 1;
    if (app.queue) {
      app.audio.uiClick();
      app.cancelQueue();
      return;
    }
    if (inParty && party.leader !== app.profile.id) {
      const me = party.members.find((m) => m.id === app.profile.id);
      app.audio.uiClick();
      app.net.send({ t: 'partyReady', ready: !(me && me.ready) });
      return;
    }
    app.audio.uiConfirm();
    app.ready();
  }

  renderParty() {
    const app = this.app;
    const party = app.party;
    const myId = app.profile.id;
    const el = this.partyEl;
    el.innerHTML = '';
    const inParty = party && party.members.length > 1;
    this.chatEl.classList.toggle('hidden', !inParty);
    el.classList.toggle('hidden', !inParty);
    if (!inParty) return;
    el.classList.add('panel');
    const leader = party.leader === myId;
    el.appendChild(h('div', { class: 'panel-title' }, `${t('party')} ${party.members.length}/${PARTY_MAX}`));
    for (const m of party.members) {
      const row = h('div', { class: 'pp-row' + (m.id === myId ? ' me' : '') },
        m.id === party.leader ? h('span', { class: 'leader-star', title: t('leader'), html: ICON.star }) : h('span', { class: 'leader-star empty' }),
        h('span', { class: 'pp-name' }, m.name),
        h('span', { class: 'pp-ready ' + (m.ready || m.id === party.leader ? 'on' : '') }, m.id === party.leader ? t('leader') : m.ready ? t('ready') : t('notReady')));
      if (leader && m.id !== myId) {
        row.appendChild(h('button', { class: 'mini', title: t('partyPromote'), onclick: () => this.app.net.send({ t: 'partyPromote', id: m.id }), html: ICON.star }));
        row.appendChild(h('button', { class: 'mini danger', title: t('partyKick'), onclick: () => this.app.net.send({ t: 'partyKick', id: m.id }) }, '✕'));
      }
      el.appendChild(row);
    }
    el.appendChild(h('button', { class: 'btn small ghost', onclick: () => { this.app.audio.uiClick(); this.app.net.send({ t: 'partyLeave' }); } }, t('partyLeave')));
  }

  // ---------------- Chat ----------------
  sendChat() {
    const txt = this.chatInput.value.trim();
    if (!txt) return;
    this.app.net.send({ t: 'partyChat', text: txt });
    this.chatInput.value = '';
  }

  addChat(m) {
    this.chatLog.push(m);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this.renderChat();
  }

  renderChat() {
    if (!this.chatLogEl) return;
    this.chatLogEl.innerHTML = this.chatLog.map((m) => `<div class="chat-line"><b>${esc(m.name)}:</b> ${esc(m.text)}</div>`).join('');
    this.chatLogEl.scrollTop = this.chatLogEl.scrollHeight;
  }

  // ---------------- Spind ----------------
  toggleLocker(v) {
    this.lockerOpen = v === undefined ? !this.lockerOpen : v;
    this.lockerEl.classList.toggle('hidden', !this.lockerOpen);
    this.el.classList.toggle('locker-open', this.lockerOpen);
    if (this.lockerOpen) this.renderLocker();
    this.updateNav();
  }

  renderLocker() {
    const app = this.app;
    const prof = app.profile.data;
    const set = (k, v) => {
      app.audio.uiClick();
      app.profile.set(k, v);
      app.refreshLobbyMembers();
      app.sendProfile();
      this.renderLocker();
    };
    const el = this.lockerEl;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'panel-title' }, t('locker'), h('button', { class: 'close-x', onclick: () => { app.audio.uiClick(); this.toggleLocker(false); } }, '✕')));
    el.appendChild(h('div', { class: 'lbl' }, t('outfit')));
    const grid = h('div', { class: 'outfit-grid' });
    for (const o of OUTFITS) grid.appendChild(h('button', { class: 'outfit-btn' + (prof.outfit === o ? ' sel' : ''), onclick: () => set('outfit', o), onmouseenter: () => app.audio.uiHover() }, t('outfit_' + o)));
    el.appendChild(grid);
    el.appendChild(h('div', { class: 'lbl' }, t('color')));
    const colors = h('div', { class: 'color-row' });
    OUTFIT_COLORS.forEach((c, i) => colors.appendChild(h('button', { class: 'swatch' + (prof.color === i ? ' sel' : ''), style: { background: c }, onclick: () => set('color', i) })));
    el.appendChild(colors);
    el.appendChild(h('div', { class: 'lbl' }, t('crownStyle')));
    const crowns = h('div', { class: 'color-row' });
    const cc = { gold: '#f2c230', ruby: '#ff2255', emerald: '#2ecc71', diamond: '#7fdbff' };
    for (const s of CROWN_STYLES) {
      crowns.appendChild(h('button', { class: 'chip-btn' + (prof.crownStyle === s ? ' sel' : ''), onclick: () => set('crownStyle', s) }, h('i', { style: { background: cc[s] } }), t('crown_' + s)));
    }
    el.appendChild(crowns);
  }

  // Namen + Bereit-Status über den 3D-Figuren
  updateLabels() {
    if (!this.el) return;
    const app = this.app;
    const scene = app.lobbyScene;
    const W = window.innerWidth, H = window.innerHeight;
    const party = app.party;
    const prof = app.profile.data;
    const members = party && party.members.length > 1
      ? [party.members.find((m) => m.id === prof.id) || { name: prof.name, id: prof.id }, ...party.members.filter((m) => m.id !== prof.id)]
      : [{ name: prof.name, id: prof.id, streak: prof.winStreak }];
    const labels = this.labelsEl;
    while (labels.children.length > members.length) labels.lastChild.remove();
    members.forEach((m, i) => {
      let el = labels.children[i];
      if (!el) {
        el = h('div', { class: 'member-label' });
        labels.appendChild(el);
      }
      const p = scene.headScreen(i, W, H);
      if (!p) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      const isLeader = party && party.leader === m.id && party.members.length > 1;
      const ready = party && party.members.length > 1 ? (isLeader || m.ready) : null;
      const streak = m.id === prof.id ? prof.winStreak : m.streak;
      const html = `${streak > 0 ? `<span class="ml-crown">${ICON.crown}${streak}</span>` : ''}${isLeader ? `<span class="ml-star">${ICON.star}</span>` : ''}<span class="ml-name">${esc(m.name)}</span>${ready !== null ? `<span class="ml-ready ${ready ? 'on' : ''}">${ready ? t('ready') : t('notReady')}</span>` : ''}`;
      if (el._h !== html) {
        el._h = html;
        el.innerHTML = html;
      }
    });
  }
}
