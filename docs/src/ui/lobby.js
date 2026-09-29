// Lobby: schlichte Kopfzeile (Logo, Spielerkarte, Freunde/Einstellungen), 3D-Figur in der Mitte,
// Party + Chat links, rechts der Modus mit Kartenvorschau und der große BEREIT-Knopf.
// BEREIT = 15 s Warteschlange, danach geht es immer in eine Lobby mit Bots (freie Plätze).
import { h, esc } from './dom.js';
import { ICON, logo } from './icons.js';
import { isInstalledApp } from '../pwa.js';
import { t } from '../i18n.js';
import { OUTFITS, OUTFIT_COLORS, CROWN_STYLES, MATCH_SIZE, PARTY_MAX, SKIN_SHOP, KNIFE_SHOP, DEFAULT_OUTFIT, clampQueueWait, MODES, modeSize, isArenaMode } from '../../shared/constants.js';
import { RARITY_COLORS, KNIFE_SKINS, knifeItem } from '../../shared/items.js';
import { itemIcon } from '../render/itemIcons.js';
import { skinPortrait } from '../render/skinPortraits.js';
import { rankBadge, rankName, rankColor } from './rankBadge.js';
import { UNREAL } from '../../shared/ranks.js';
import { mapDef } from '../../shared/map/mapgen.js';

// stilisierte Schneeinsel, solange die Kartenvorschau noch berechnet wird
function drawIslandPlaceholder(g, S) {
  const grd = g.createLinearGradient(0, 0, S, S);
  grd.addColorStop(0, '#3b8fc4');
  grd.addColorStop(1, '#1d5f96');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const pts = [];
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const r = S * (0.36 + Math.sin(a * 3 + 1) * 0.03 + Math.sin(a * 5) * 0.02);
    pts.push([S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r]);
  }
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = '#eef4fa';
  g.fill();
  // Berg im Norden, gefrorener Fluss, die Feste
  g.fillStyle = '#8a8178';
  g.beginPath();
  g.moveTo(S * 0.3, S * 0.3); g.lineTo(S * 0.5, S * 0.12); g.lineTo(S * 0.7, S * 0.3); g.closePath();
  g.fill();
  g.strokeStyle = '#8fd3ec';
  g.lineWidth = S * 0.035;
  g.beginPath();
  g.moveTo(S * 0.36, S * 0.3); g.quadraticCurveTo(S * 0.3, S * 0.5, S * 0.22, S * 0.62);
  g.stroke();
  g.fillStyle = '#9c978f';
  g.fillRect(S * 0.42, S * 0.36, S * 0.16, S * 0.07);
}

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
    this.lockerOpen = false;
    app.lobbyScene?.setPanelOpen(false);
    this.el = h('div', { class: 'screen lobby-screen' });
    // ---- Kopfzeile ----
    this.nameBtn = h('button', { class: 'pc-name', title: t('clickName'), onclick: () => { app.audio.uiClick(); this.ui.renameDialog(); } });
    this.levelEl = h('div', { class: 'pc-level pc-rank' });
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
      isInstalledApp() ? null : this.menuItem('download', t('installApp'), () => this.ui.openInstall()),
      this.menuItem('info', t('menuCredits'), () => this.ui.openCredits()),
      this.menuItem('exit', t('menuQuit'), () => this.ui.quitGame()));
    const nav = h('nav', { class: 'top-nav' },
      this.navBtn('play', t('navPlay'), () => this.toggleLocker(false)),
      this.navBtn('locker', t('locker'), () => this.toggleLocker(true)),
      this.navBtn('shop', t('shop'), () => this.toggleLocker(true, 'shop')),
      this.navBtn('stats', t('menuStats'), () => this.ui.openStats()));
    const top = h('header', { class: 'topbar' },
      h('div', { class: 'tb-left' }, logo('small'), nav),
      h('div', { class: 'tb-right' }, this.coinPill = h('button', { class: 'coin-pill', title: t('shop'), onclick: (e) => { e.stopPropagation(); app.audio.uiClick(); this.toggleLocker(true, 'shop'); } }), this.serverDot, this.friendsBtn,
        this.installBtn = isInstalledApp() ? null : h('button', { class: 'install-pill', title: t('installApp'), html: ICON.download + '<span>' + t('installShort') + '</span>', onclick: (e) => { e.stopPropagation(); app.audio.uiClick(); this.ui.openInstall(); }, onmouseenter: () => app.audio.uiHover() }),
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
    this.kickerEl = h('div', { class: 'mode-kicker' });
    this.modeTitle = h('div', { class: 'mode-title' });
    this.modeSwitch = h('div', { class: 'mode-switch' });
    // Klick auf die Karte über BEREIT: Solo ↔ Duo
    const mode = h('button', { class: 'mode-card', title: t('modeSwitchHint'), onclick: () => this.toggleMode(), onmouseenter: () => app.audio.uiHover() },
      this.mapThumb,
      h('div', { class: 'mode-info' }, this.kickerEl, this.modeTitle, this.countEl, this.modeSwitch));
    this.queueEl = h('div', { class: 'queue-box hidden' });
    this.readyBtn = h('button', { class: 'ready-btn', onclick: () => this.onReady(), onmouseenter: () => app.audio.uiHover() });
    this.readyHint = h('div', { class: 'ready-hint' });
    const right = h('div', { class: 'lobby-right' }, mode, this.queueEl, this.readyBtn, this.readyHint);
    // ---- Spind ----
    this.lockerEl = h('div', { class: 'locker panel hidden' });
    // Namen über den Figuren
    this.labelsEl = h('div', { class: 'member-labels' });
    // unten links: mit welchem Server man verbunden ist
    this.serverBox = h('div', { class: 'lobby-server' });
    // oben in der Mitte: Nachrichten vom Admin
    this.annEl = h('div', { class: 'lobby-ann' });
    this.el.append(this.labelsEl, top, left, right, this.lockerEl, this.serverBox, this.annEl);
    clearInterval(this.serverTimer);
    this.serverTimer = setInterval(() => { this.updateServerBox(); this.renderAnnouncements(); }, 1000);
    this.renderAnnouncements();
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
    for (const b of this.el.querySelectorAll('.nav-btn')) b.classList.toggle('sel', b.dataset.nav === (this.lockerOpen ? this.panelKind : 'play'));
  }

  menuItem(ic, label, fn) {
    return h('button', { class: 'dd-item', onclick: () => { this.app.audio.uiClick(); this.toggleMenu(false); fn(); }, onmouseenter: () => this.app.audio.uiHover() }, h('span', { class: 'icon', html: ICON[ic] }), label);
  }

  toggleMenu(v) {
    this.menuOpen = v === undefined ? !this.menuOpen : v;
    if (this.menuEl) this.menuEl.classList.toggle('hidden', !this.menuOpen);
  }

  hide() {
    clearInterval(this.serverTimer);
    if (this.el) {
      this.el.remove();
      document.removeEventListener('click', this.closeMenuFn);
    }
    this.el = null;
  }

  // Admin-Nachrichten oben in der Mitte (abgelaufene verschwinden von selbst)
  renderAnnouncements() {
    if (!this.annEl) return;
    const list = this.app.liveAnnouncements();
    const key = list.map((a) => a.id + ':' + a.text).join('|');
    if (this.annEl._k === key) return;
    this.annEl._k = key;
    this.annEl.innerHTML = '';
    for (const a of list) this.annEl.appendChild(h('div', { class: 'ann-item' }, h('span', { class: 'icon', html: ICON.megaphone }), h('span', { class: 'ann-msg' }, a.text)));
  }

  // Server-Anzeige unten links: Name/Standort, Adresse, Ping, Spieler online
  updateServerBox() {
    if (!this.serverBox) return;
    const app = this.app;
    const net = app.net;
    const info = app.serverInfo;
    let title, sub = '', state = 'off';
    if (net.connected) {
      state = 'on';
      const host = net.serverHost || location.host;
      const local = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
      if (info && info.region) title = info.region;
      else if (/trycloudflare\.com$/i.test(host)) title = t('srvTunnel');
      else if (local) title = app.isHost ? t('srvLocalHost') : t('srvLan');
      else title = t('srvOnline');
      const parts = [info && info.name ? info.name : host];
      if (net.ping) parts.push(Math.round(net.ping) + ' ms');
      if (info && info.online) parts.push(t('srvPlayers', { n: info.online }));
      sub = parts.join(' · ');
    } else if (net.waking) {
      state = 'wait';
      title = t('serverWaking');
      sub = net.serverHost || '';
    } else if (net.enabled && !net.failed) {
      state = 'wait';
      title = t('connecting');
      sub = net.serverHost || '';
    } else {
      title = t('srvOffline');
      sub = net.failed ? t('serverFailed') : t('srvOfflineSub');
    }
    const ping = net.connected && net.ping ? Math.round(net.ping) : null;
    const q = ping === null ? '' : ping < 60 ? 'good' : ping < 120 ? 'ok' : 'bad';
    const key = [state, title, sub, q].join('|');
    if (this.serverBox._k === key) return;
    this.serverBox._k = key;
    this.serverBox.className = 'lobby-server ' + state + (q ? ' ping-' + q : '');
    this.serverBox.innerHTML = `<span class="icon">${ICON.globe}</span><div><small>${esc(t('srvLabel'))}</small><b>${esc(title)}</b><span>${esc(sub)}</span></div>`;
  }

  // ---------------- Aktualisieren ----------------
  refresh() {
    if (!this.el) return;
    const app = this.app;
    const prof = app.profile.data;
    if (!prof) return;
    const st = prof.stats;
    this.nameBtn.innerHTML = `${prof.winStreak > 0 ? `<span class="crown-mini">${ICON.crown}</span>` : ''}<span>${esc(prof.name)}</span><span class="edit">✎</span>`;
    // Rang statt Level
    const rk = prof.rank || { i: 0, p: 0 };
    this.levelEl.innerHTML = rankBadge(rk.i, 58);
    this.levelEl.title = rankName(rk.i);
    this.xpFill.style.width = (rk.i === UNREAL ? 100 : rk.p) + '%';
    this.xpFill.style.background = `linear-gradient(90deg, ${rankColor(rk.i)}, #fff)`;
    this.xpText.textContent = rk.i === UNREAL ? rankName(rk.i) : `${rankName(rk.i)} · ${Math.floor(rk.p)} %`;
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
    else if (net.waking) srv = t('serverWaking');
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
    const gm = app.gameMode();
    this.kickerEl.textContent = t('modeKicker_' + gm);
    this.modeTitle.textContent = mapDef((q && q.map) || app.lobbyMapId()).name.toUpperCase();
    const size = modeSize(gm);
    this.countEl.textContent = gm === 'duo' ? t('playersCountDuo', { n: MATCH_SIZE, t: MATCH_SIZE / 2 })
      : isArenaMode(gm) ? t('playersCountArena', { n: size, b: Math.max(0, size - humans) })
        : t('playersCount', { n: MATCH_SIZE, h: humans, b: MATCH_SIZE - humans });
    // Modus direkt anklicken (Solo, Duo, 1v1, 2v2)
    this.modeSwitch.innerHTML = '';
    for (const m of MODES) {
      this.modeSwitch.appendChild(h('span', { class: gm === m ? 'on' : '', onclick: (e) => { e.stopPropagation(); this.chooseMode(m); } }, m.toUpperCase()));
    }
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
        <div class="q-info">${esc(t('queueInfo', { h: q.humans, b: Math.max(0, modeSize(q.mode || gm) - q.humans) }))}</div>`;
    } else this.queueEl.classList.add('hidden');
    this.renderParty();
    this.updateCoins();
    if (this.lockerOpen) this.renderPanel();
    this.updateNav();
    this.updateServerBox();
  }

  // Karte oben: Vorschau der nächsten Karte (sobald berechnet), sonst eine stilisierte Insel
  drawMapThumb() {
    const q = this.app.queue;
    const id = (q && q.map) || this.app.lobbyMapId();
    const e = this.app.mapCache.get(id);
    const img = e && e.data ? e.data.mapImage : null;
    const key = img ? id : 'placeholder';
    if (this.thumbDone === key) return;
    this.thumbDone = key;
    const g = this.mapThumb.getContext('2d');
    if (img) g.drawImage(img, 0, 0, 240, 240);
    else drawIslandPlaceholder(g, 240);
  }

  toggleMode() {
    const app = this.app;
    const party = app.party;
    if (app.queue) { app.audio.uiError(); return; }
    if (party && party.members.length > 1 && party.leader !== app.profile.id) {
      app.audio.uiError();
      this.ui.toast(t('onlyLeaderMode'), 'error');
      return;
    }
    const next = MODES[(MODES.indexOf(app.gameMode()) + 1) % MODES.length];
    this.chooseMode(next);
  }

  chooseMode(next) {
    const app = this.app;
    const party = app.party;
    if (next === app.gameMode()) return;
    if (app.queue) { app.audio.uiError(); return; }
    if (party && party.members.length > 1 && party.leader !== app.profile.id) {
      app.audio.uiError();
      this.ui.toast(t('onlyLeaderMode'), 'error');
      return;
    }
    if (next !== 'solo' && party && party.members.length > 2) {
      app.audio.uiError();
      this.ui.toast(t(next === 'duo' ? 'duoTooMany' : 'modeTooMany'), 'error');
      return;
    }
    app.audio.uiClick();
    app.setGameMode(next);
    // Arena-Karte schon im Hintergrund vorbereiten (Vorschau + schneller Start)
    app.prepareMap(app.lobbyMapId()).then(() => this.refresh()).catch(() => {});
    this.refresh();
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
        m.status === 'game' && m.id !== myId
          ? h('span', { class: 'pp-ready ingame' }, t('inGame'))
          : h('span', { class: 'pp-ready ' + (m.ready || m.id === party.leader ? 'on' : '') }, m.id === party.leader ? t('leader') : m.ready ? t('ready') : t('notReady')));
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
  // rechtes Panel: Spind oder Shop
  toggleLocker(v, kind = 'locker') {
    this.lockerOpen = v === undefined ? !this.lockerOpen : v;
    this.panelKind = kind;
    this.lockerEl.classList.toggle('hidden', !this.lockerOpen);
    this.lockerEl.classList.toggle('shop', kind === 'shop');
    this.el.classList.toggle('locker-open', this.lockerOpen);
    this.app.lobbyScene?.setPanelOpen(this.lockerOpen);
    if (this.lockerOpen) this.renderPanel();
    this.updateNav();
  }

  renderPanel() {
    if (this.panelKind === 'shop') this.renderShop();
    else this.renderLocker();
  }

  updateCoins() {
    if (!this.coinPill) return;
    this.coinPill.innerHTML = `<span class="icon">${ICON.coin}</span><b>${this.app.profile.data.coins.toLocaleString('de-DE')}</b>`;
  }

  // Shop: Skins mit Coins kaufen (Standard „Rekrut“ hat jeder)
  renderShop() {
    const app = this.app;
    const prof = app.profile.data;
    const el = this.lockerEl;
    el.innerHTML = '';
    el.appendChild(h('div', { class: 'panel-title' }, t('shop'),
      h('span', { class: 'shop-coins' }, h('span', { class: 'icon', html: ICON.coin }), h('b', {}, prof.coins.toLocaleString('de-DE'))),
      h('button', { class: 'close-x', onclick: () => { app.audio.uiClick(); this.toggleLocker(false); } }, '✕')));
    el.appendChild(h('div', { class: 'hint small' }, t('shopHint')));
    const scroll = h('div', { class: 'shop-scroll' });
    const coin = (n) => h('span', {}, h('span', { class: 'icon', html: ICON.coin }), ' ' + n.toLocaleString('de-DE'));
    // Skins
    scroll.appendChild(h('div', { class: 'shop-sec' }, t('shopSkins')));
    const grid = h('div', { class: 'shop-grid' });
    for (const o of OUTFITS) {
      if (o === DEFAULT_OUTFIT) continue;
      const it = SKIN_SHOP[o];
      const owned = app.profile.owns(o);
      const worn = prof.outfit === o;
      grid.appendChild(h('button', {
        class: 'shop-card' + (owned ? ' owned' : '') + (worn ? ' worn' : ''),
        style: { '--rar': RARITY_COLORS[it.rarity] },
        onmouseenter: () => app.audio.uiHover(),
        onclick: () => this.shopClick(o),
      },
      h('img', { src: skinPortrait(o, prof.color), alt: '' }),
      h('div', { class: 'sc-name' }, t('outfit_' + o)),
      h('div', { class: 'sc-rar' }, t('rar_' + it.rarity)),
      h('div', { class: 'sc-price' }, worn ? t('equipped') : owned ? t('owned') : coin(it.price))));
    }
    scroll.appendChild(grid);
    // Messer
    scroll.appendChild(h('div', { class: 'shop-sec' }, t('knives')));
    const kgrid = h('div', { class: 'shop-grid knife-grid' });
    for (const k of KNIFE_SKINS) {
      if (k === 'standard') continue;
      const it = KNIFE_SHOP[k];
      const owned = app.profile.ownsKnife(k);
      const worn = prof.knife === k;
      kgrid.appendChild(h('button', {
        class: 'shop-card knife-card' + (owned ? ' owned' : '') + (worn ? ' worn' : ''),
        style: { '--rar': RARITY_COLORS[it.rarity] },
        onmouseenter: () => app.audio.uiHover(),
        onclick: () => this.knifeClick(k),
      },
      h('div', { class: 'kc-img' }, h('img', { src: itemIcon(knifeItem(k)), alt: '' })),
      h('div', { class: 'sc-name' }, t('knife_' + k)),
      h('div', { class: 'sc-rar' }, t('rar_' + it.rarity)),
      h('div', { class: 'sc-price' }, worn ? t('equipped') : owned ? t('owned') : coin(it.price))));
    }
    scroll.appendChild(kgrid);
    el.appendChild(scroll);
  }

  knifeClick(k) {
    const app = this.app;
    const it = KNIFE_SHOP[k];
    if (app.profile.ownsKnife(k)) {
      app.audio.uiClick();
      this.equipKnife(k);
      return;
    }
    if (app.profile.data.coins < it.price) {
      app.audio.uiError();
      this.ui.toast(t('notEnoughCoins', { n: it.price - app.profile.data.coins }), 'error');
      return;
    }
    app.audio.uiClick();
    this.ui.confirm(t('buyConfirm', { name: t('knife_' + k), n: it.price }), () => {
      if (app.profile.buyKnife(k)) {
        app.audio.uiConfirm();
        this.ui.confettiBurst(80);
        this.ui.toast(t('bought', { name: t('knife_' + k) }), 'ok');
        this.equipKnife(k);
      }
    });
  }

  equipKnife(k) {
    const app = this.app;
    app.profile.set('knife', k);
    app.sendProfile();
    this.updateCoins();
    this.renderPanel();
  }

  shopClick(o) {
    const app = this.app;
    const it = SKIN_SHOP[o];
    if (app.profile.owns(o)) {
      app.audio.uiClick();
      this.equipOutfit(o);
      return;
    }
    if (app.profile.data.coins < it.price) {
      app.audio.uiError();
      this.ui.toast(t('notEnoughCoins', { n: it.price - app.profile.data.coins }), 'error');
      return;
    }
    app.audio.uiClick();
    this.ui.confirm(t('buyConfirm', { name: t('outfit_' + o), n: it.price }), () => {
      if (app.profile.buy(o)) {
        app.audio.uiConfirm();
        this.ui.confettiBurst(80);
        this.ui.toast(t('bought', { name: t('outfit_' + o) }), 'ok');
        this.equipOutfit(o);
      }
    });
  }

  equipOutfit(o) {
    const app = this.app;
    app.profile.set('outfit', o);
    app.refreshLobbyMembers();
    app.sendProfile();
    this.updateCoins();
    this.renderPanel();
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
    for (const o of OUTFITS) {
      const owned = app.profile.owns(o);
      grid.appendChild(h('button', {
        class: 'outfit-btn' + (prof.outfit === o ? ' sel' : '') + (owned ? '' : ' locked'),
        title: owned ? '' : t('shopHint'),
        onclick: () => (owned ? set('outfit', o) : (app.audio.uiClick(), this.toggleLocker(true, 'shop'))),
        onmouseenter: () => app.audio.uiHover(),
      }, owned ? null : h('span', { class: 'icon', html: ICON.lock }), t('outfit_' + o)));
    }
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
    el.appendChild(h('div', { class: 'lbl' }, t('knife')));
    const knives = h('div', { class: 'knife-row' });
    for (const k of KNIFE_SKINS) {
      const owned = app.profile.ownsKnife(k);
      knives.appendChild(h('button', {
        class: 'knife-btn' + (prof.knife === k ? ' sel' : '') + (owned ? '' : ' locked'),
        style: { '--rar': RARITY_COLORS[k === 'standard' ? 0 : KNIFE_SHOP[k].rarity] },
        title: t('knife_' + k),
        onclick: () => (owned ? set('knife', k) : (app.audio.uiClick(), this.toggleLocker(true, 'shop'))),
        onmouseenter: () => app.audio.uiHover(),
      }, h('img', { src: itemIcon(knifeItem(k)), alt: '' }), h('span', {}, owned ? null : h('span', { class: 'icon', html: ICON.lock }), t('knife_' + k))));
    }
    el.appendChild(knives);
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
      const ingame = m.id !== prof.id && m.status === 'game';
      const tag = ingame ? `<span class="ml-ready ingame">${t('inGame')}</span>` : ready !== null ? `<span class="ml-ready ${ready ? 'on' : ''}">${ready ? t('ready') : t('notReady')}</span>` : '';
      const html = `${streak > 0 ? `<span class="ml-crown">${ICON.crown}${streak}</span>` : ''}${isLeader ? `<span class="ml-star">${ICON.star}</span>` : ''}<span class="ml-name">${esc(m.name)}</span>${tag}`;
      if (el._h !== html) {
        el._h = html;
        el.innerHTML = html;
      }
    });
  }
}
