// Lobby-Oberfläche: Kopfzeile (Name, Level, XP, Siege, Kronen, Kills), Spind, Party + Chat,
// Modus-Auswahl, SPIELEN-Button mit Matchmaking-Status, Hamburger-Menü.
import { h, esc } from './dom.js';
import { ICON, icon } from './icons.js';
import { t } from '../i18n.js';
import { OUTFITS, OUTFIT_COLORS, WEAPON_SKINS, CROWN_STYLES, MATCH_SIZE, PARTY_MAX, xpForLevel } from '../../shared/constants.js';
import { SKIN_COLORS } from '../render/rifle.js';

export class LobbyScreen {
  constructor(ui) {
    this.ui = ui;
    this.app = ui.app;
    this.el = null;
    this.mode = localStorage.getItem('savanna.mode') || 'solo';
    this.chatLog = [];
    this.lockerOpen = false;
    this.menuOpen = false;
  }

  show() {
    this.hide();
    const app = this.app;
    this.el = h('div', { class: 'screen lobby-screen' });
    // Kopfzeile
    this.nameBtn = h('button', { class: 'lobby-name', title: t('clickName'), onclick: () => { app.audio.uiClick(); this.ui.renameDialog(); } });
    this.levelEl = h('div', { class: 'level-badge' });
    this.xpFill = h('div', { class: 'xp-fill' });
    this.xpText = h('div', { class: 'xp-text' });
    this.statsEl = h('div', { class: 'lobby-stats' });
    const left = h('div', { class: 'lobby-top-left' },
      h('div', { class: 'logo small' }, h('div', { class: 'logo-top' }, 'SAVANNA'), h('div', { class: 'logo-bottom' }, 'ROYALE')),
      h('div', { class: 'player-card' }, this.levelEl, h('div', { class: 'pc-main' }, this.nameBtn, h('div', { class: 'xp-bar' }, this.xpFill, this.xpText))),
      this.statsEl);
    this.serverDot = h('div', { class: 'server-dot' });
    this.friendsBtn = h('button', { class: 'icon-btn', title: t('menuFriends'), html: ICON.friends, onclick: () => { app.audio.uiClick(); this.ui.openFriends(); } });
    this.friendsBadge = h('span', { class: 'badge hidden' });
    this.friendsBtn.appendChild(this.friendsBadge);
    const fsBtn = h('button', { class: 'icon-btn', title: t('fullscreen'), html: ICON.fullscreen, onclick: () => { app.audio.uiClick(); this.ui.toggleFullscreen(); } });
    this.menuBtn = h('button', { class: 'icon-btn menu-btn', title: 'Menü', html: ICON.menu, onclick: (e) => { e.stopPropagation(); app.audio.uiClick(); this.toggleMenu(); } });
    this.menuEl = h('div', { class: 'dropdown hidden' },
      this.menuItem('friends', t('menuFriends'), () => this.ui.openFriends()),
      this.menuItem('gear', t('menuSettings'), () => this.ui.openSettings()),
      this.menuItem('chart', t('menuStats'), () => this.ui.openStats()),
      this.menuItem('globe', app.net.staticSite ? t('menuServer') : t('menuHost'), () => this.ui.openHost()),
      this.menuItem('info', t('menuCredits'), () => this.ui.openCredits()),
      this.menuItem('exit', t('menuQuit'), () => this.ui.quitGame()));
    this.serverDot.addEventListener('click', () => { if (app.net.staticSite) { app.audio.uiClick(); this.ui.openHost(); } });
    const right = h('div', { class: 'lobby-top-right' }, this.serverDot, fsBtn, this.friendsBtn, this.menuBtn, this.menuEl);
    // Spind
    this.lockerBtn = h('button', { class: 'locker-btn', onclick: () => { app.audio.uiClick(); this.toggleLocker(); } }, h('span', { class: 'icon', html: ICON.locker }), h('span', {}, t('locker')));
    this.lockerEl = h('div', { class: 'locker hidden' });
    // Party + Chat
    this.partyEl = h('div', { class: 'party-panel' });
    this.chatLogEl = h('div', { class: 'chat-log' });
    this.chatInput = h('input', { type: 'text', maxlength: 140, placeholder: t('chatPlaceholder') });
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChat();
      else if (e.key.length === 1) app.audio.uiType();
    });
    this.chatEl = h('div', { class: 'chat hidden' }, h('div', { class: 'chat-title' }, t('partyChat')), this.chatLogEl,
      h('div', { class: 'chat-row' }, this.chatInput, h('button', { class: 'btn small', onclick: () => this.sendChat() }, t('send'))));
    const bottomLeft = h('div', { class: 'lobby-bottom-left' }, this.partyEl, this.chatEl);
    // Spielen
    this.modeSolo = this.modeCard('solo', t('modeSolo'), t('modeSoloDesc'));
    this.modeParty = this.modeCard('party', t('modeParty'), t('modePartyDesc'));
    this.countEl = h('div', { class: 'player-count' });
    this.readyBtn = h('button', { class: 'btn ready-btn hidden', onclick: () => this.toggleReady() });
    this.playBtn = h('button', { class: 'btn yellow play-btn', onclick: () => this.play(), onmouseenter: () => app.audio.uiHover() }, t('play'));
    this.queueEl = h('div', { class: 'queue-box hidden' });
    const br = h('div', { class: 'lobby-bottom-right' }, h('div', { class: 'mode-select' }, this.modeSolo, this.modeParty), this.countEl, this.queueEl, h('div', { class: 'play-row' }, this.readyBtn, this.playBtn));
    // Namen über den Figuren
    this.labelsEl = h('div', { class: 'member-labels' });
    this.el.append(this.labelsEl, left, right, this.lockerBtn, this.lockerEl, bottomLeft, br);
    this.ui.screenRoot.appendChild(this.el);
    this.closeMenuFn = () => this.toggleMenu(false);
    document.addEventListener('click', this.closeMenuFn);
    this.refresh();
    this.renderChat();
  }

  menuItem(ic, label, fn) {
    return h('button', { class: 'dd-item', onclick: () => { this.app.audio.uiClick(); this.toggleMenu(false); fn(); }, onmouseenter: () => this.app.audio.uiHover() }, h('span', { class: 'icon', html: ICON[ic] }), label);
  }

  modeCard(mode, title, desc) {
    return h('button', {
      class: 'mode-card',
      'data-mode': mode,
      onclick: () => {
        this.app.audio.uiClick();
        this.mode = mode;
        localStorage.setItem('savanna.mode', mode);
        this.refresh();
      },
      onmouseenter: () => this.app.audio.uiHover(),
    }, h('div', { class: 'mc-title' }, title), h('div', { class: 'mc-desc' }, desc));
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
      <div class="stat-chip">${ICON.star}<b>${st.wins}</b><small>${t('wins')}</small></div>
      <div class="stat-chip">${ICON.crown}<b>${st.crownWins}</b><small>${t('crowns')}</small></div>
      <div class="stat-chip">${ICON.skull}<b>${st.kills}</b><small>${t('kills')}</small></div>
      ${prof.winStreak > 0 ? `<div class="stat-chip streak">${ICON.crown}<b>${prof.winStreak}</b><small>${t('streak')}</small></div>` : ''}`;
    const net = app.net;
    this.serverDot.className = 'server-dot ' + (net.connected ? 'on' : net.staticSite && !net.enabled ? 'solo' : 'off');
    if (net.connected) this.serverDot.textContent = net.serverUrl ? t('connectedTo', { host: net.serverHost }) : t('serverOnline');
    else if (net.failed) this.serverDot.textContent = t('serverFailed');
    else if (net.staticSite && !net.enabled) this.serverDot.textContent = t('serverStatic');
    else this.serverDot.textContent = net.enabled ? t('connecting') : t('serverOffline');
    const reqs = app.social.incoming.length;
    this.friendsBadge.textContent = reqs;
    this.friendsBadge.classList.toggle('hidden', reqs === 0);
    // Modus
    const party = app.party;
    const inParty = party && party.members.length > 1;
    if (inParty && this.mode !== 'party') this.mode = 'party';
    this.modeSolo.classList.toggle('sel', this.mode === 'solo');
    this.modeParty.classList.toggle('sel', this.mode === 'party');
    this.modeSolo.disabled = !!inParty;
    this.modeParty.classList.toggle('disabled', !app.net.connected);
    // Spielerzahl
    const humans = this.mode === 'solo' ? 1 : Math.max(1, party ? party.members.length : 1);
    const q = app.queue;
    const hh = q ? q.humans : humans;
    this.countEl.textContent = t('playersCount', { h: hh, hw: hh === 1 ? t('human') : t('humans'), b: MATCH_SIZE - hh });
    // Bereit / Leader
    const myId = prof.id;
    const leader = party ? party.leader === myId : true;
    const me = party ? party.members.find((m) => m.id === myId) : null;
    if (inParty && !leader) {
      this.readyBtn.classList.remove('hidden');
      this.readyBtn.textContent = me && me.ready ? '✓ ' + t('ready') : t('ready') + '?';
      this.readyBtn.classList.toggle('on', !!(me && me.ready));
      this.playBtn.disabled = true;
      this.playBtn.textContent = t('onlyLeader');
      this.playBtn.classList.add('wait');
    } else {
      this.readyBtn.classList.add('hidden');
      const notReady = inParty ? party.members.filter((m) => m.id !== party.leader && !m.ready) : [];
      this.playBtn.disabled = notReady.length > 0 || !!q;
      this.playBtn.classList.toggle('wait', notReady.length > 0);
      this.playBtn.textContent = notReady.length > 0 ? t('waitReady') : t('play');
    }
    // Warteschlange
    if (q) {
      this.queueEl.classList.remove('hidden');
      this.queueEl.innerHTML = `<div class="q-title">${t('queueWaiting', { s: Math.max(0, Math.ceil(q.secs)) })}</div><div class="q-info">${t('queueInfo', { h: q.humans, hw: q.humans === 1 ? t('human') : t('humans'), b: MATCH_SIZE - q.humans })}</div>`;
      const cb = h('button', { class: 'btn small ghost', onclick: () => { this.app.audio.uiClick(); this.app.cancelQueue(); } }, t('queueCancel'));
      if (!party || leader) this.queueEl.appendChild(cb);
    } else this.queueEl.classList.add('hidden');
    this.renderParty();
    if (this.lockerOpen) this.renderLocker();
  }

  renderParty() {
    const app = this.app;
    const party = app.party;
    const myId = app.profile.id;
    const el = this.partyEl;
    el.innerHTML = '';
    const inParty = party && party.members.length > 1;
    this.chatEl.classList.toggle('hidden', !party);
    if (!party) return;
    const leader = party.leader === myId;
    el.appendChild(h('div', { class: 'pp-title' }, `Party ${party.members.length}/${PARTY_MAX}`));
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
    if (inParty) el.appendChild(h('button', { class: 'btn small ghost', onclick: () => { this.app.audio.uiClick(); this.app.net.send({ t: 'partyLeave' }); } }, t('partyLeave')));
  }

  toggleReady() {
    const app = this.app;
    const me = app.party && app.party.members.find((m) => m.id === app.profile.id);
    app.audio.uiClick();
    app.net.send({ t: 'partyReady', ready: !(me && me.ready) });
  }

  play() {
    const app = this.app;
    app.audio.uiConfirm();
    if (this.mode === 'solo') app.playSolo();
    else app.playParty();
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
  toggleLocker() {
    this.lockerOpen = !this.lockerOpen;
    this.lockerEl.classList.toggle('hidden', !this.lockerOpen);
    if (this.lockerOpen) this.renderLocker();
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
    el.appendChild(h('div', { class: 'locker-title' }, t('locker'), h('button', { class: 'close-x', onclick: () => this.toggleLocker() }, '✕')));
    el.appendChild(h('div', { class: 'lbl' }, t('outfit')));
    const grid = h('div', { class: 'outfit-grid' });
    for (const o of OUTFITS) grid.appendChild(h('button', { class: 'outfit-btn' + (prof.outfit === o ? ' sel' : ''), onclick: () => set('outfit', o), onmouseenter: () => app.audio.uiHover() }, t('outfit_' + o)));
    el.appendChild(grid);
    el.appendChild(h('div', { class: 'lbl' }, t('color')));
    const colors = h('div', { class: 'color-row' });
    OUTFIT_COLORS.forEach((c, i) => colors.appendChild(h('button', { class: 'swatch' + (prof.color === i ? ' sel' : ''), style: { background: c }, onclick: () => set('color', i) })));
    el.appendChild(colors);
    el.appendChild(h('div', { class: 'lbl' }, t('weaponSkin')));
    const skins = h('div', { class: 'skin-row' });
    for (const s of WEAPON_SKINS) {
      const c = SKIN_COLORS[s];
      skins.appendChild(h('button', {
        class: 'skin-btn' + (prof.weaponSkin === s ? ' sel' : ''),
        style: { background: `linear-gradient(135deg, #${c.a.toString(16).padStart(6, '0')} 55%, #${c.b.toString(16).padStart(6, '0')} 55%)` },
        onclick: () => set('weaponSkin', s),
      }, h('span', {}, t('skin_' + s))));
    }
    el.appendChild(skins);
    el.appendChild(h('div', { class: 'lbl' }, t('crownStyle')));
    const crowns = h('div', { class: 'skin-row' });
    const cc = { gold: '#f2c230', ruby: '#ff2255', emerald: '#2ecc71', diamond: '#7fdbff' };
    for (const s of CROWN_STYLES) {
      crowns.appendChild(h('button', { class: 'skin-btn crown-btn' + (prof.crownStyle === s ? ' sel' : ''), style: { background: cc[s] }, onclick: () => set('crownStyle', s) }, h('span', {}, t('crown_' + s))));
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
