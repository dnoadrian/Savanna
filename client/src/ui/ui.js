// UI-Manager: Bildschirme, Overlays, Dialoge, Toasts, Einladungen, Konfetti.
import { h, esc, fmtTime } from './dom.js';
import { ICON, logo } from './icons.js';
import { t } from '../i18n.js';
import { WelcomeScreen } from './welcome.js';
import { LobbyScreen } from './lobby.js';
import { SettingsPanel } from './settingsPanel.js';
import { FriendsPanel } from './friendsPanel.js';
import { HostPanel } from './hostPanel.js';
import { validateName } from '../../shared/names.js';
import { xpForLevel, INVITE_TTL } from '../../shared/constants.js';
import { toggleFullscreen, exitFullscreen } from '../game/input.js';

export class UI {
  constructor(app) {
    this.app = app;
    const root = document.getElementById('ui-root');
    this.screenRoot = h('div', { class: 'screen-root' });
    this.overlayRoot = h('div', { class: 'overlay-root' });
    this.toastRoot = h('div', { class: 'toast-root' });
    this.inviteRoot = h('div', { class: 'invite-root' });
    this.confetti = h('canvas', { class: 'confetti' });
    root.append(this.screenRoot, this.overlayRoot, this.inviteRoot, this.toastRoot, this.confetti);
    this.welcome = new WelcomeScreen(this);
    this.lobby = new LobbyScreen(this);
    this.settings = new SettingsPanel(this);
    this.friends = new FriendsPanel(this);
    this.host = new HostPanel(this);
    this.modal = null;
    this.gameOverlay = null;
    this.invites = new Map();
    this.confettiParts = [];
    window.addEventListener('resize', () => this.resizeConfetti());
    this.resizeConfetti();
    // ESC schließt Panels
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || this.app.input.captureCb) return;
      if (this.app.admin && this.app.admin.isOpen) { this.app.admin.close(); e.preventDefault(); return; }
      if (this.settings.isOpen) { this.settings.close(); e.preventDefault(); return; }
      if (this.friends.isOpen) { this.friends.close(); e.preventDefault(); return; }
      if (this.host.isOpen) { this.host.close(); e.preventDefault(); return; }
      if (this.modal && !this.modal.sticky) { this.closeModal(); e.preventDefault(); return; }
      if (this.app.state === 'match' && this.app.match) {
        const k = this.app.settings.get('keys').pause;
        if (k === 'Escape') this.handlePauseKey();
      }
    });
    this.app.input.onAnyKey = (code) => {
      if (this.app.state === 'match' && code === this.app.settings.get('keys').pause && code !== 'Escape') this.handlePauseKey();
    };
  }

  handlePauseKey() {
    const m = this.app.match;
    if (!m || m.ended || m.state !== 'alive') return;
    if (this.gameOverlay && this.gameOverlay.kind === 'pause') this.resumeGame();
    else if (!this.gameOverlay) {
      this.app.input.unlock();
      this.showPause();
    }
  }

  // ---------------- Bildschirme ----------------
  clearScreens() {
    this.welcome.hide();
    this.lobby.hide();
    if (this.loadingEl) { this.loadingEl.remove(); this.loadingEl = null; }
    if (this.resultsEl) { this.resultsEl.remove(); this.resultsEl = null; }
    this.closeGameOverlay();
    if (this.clickEl) { this.clickEl.remove(); this.clickEl = null; }
  }

  showWelcome() {
    this.clearScreens();
    this.settings.close();
    this.friends.close();
    this.host.close();
    this.welcome.show();
  }

  showLobby() {
    this.clearScreens();
    this.lobby.show();
  }

  rebuild() {
    // Sprache gewechselt
    const st = this.app.state;
    if (st === 'lobby') this.lobby.show();
    else if (st === 'welcome' && !this.app.profile.hasName) this.welcome.show();
    if (this.settings.isOpen) this.settings.render();
    if (this.friends.isOpen) this.friends.render();
  }

  showLoading() {
    this.clearScreens();
    this.settings.close();
    this.friends.close();
    this.host.close();
    const tips = Array.from({ length: 10 }, (_, i) => t('tip' + (i + 1)));
    this.tipIdx = Math.floor(Math.random() * tips.length);
    this.loadBar = h('div', { class: 'load-fill' });
    this.tipEl = h('div', { class: 'load-tip' }, tips[this.tipIdx]);
    this.loadingEl = h('div', { class: 'screen loading-screen' },
      logo('big'),
      h('div', { class: 'load-title' }, t('loadingSavanna')),
      h('div', { class: 'load-bar' }, this.loadBar),
      this.tipEl);
    this.screenRoot.appendChild(this.loadingEl);
    clearInterval(this.tipTimer);
    this.tipTimer = setInterval(() => {
      if (!this.loadingEl) return clearInterval(this.tipTimer);
      this.tipIdx = (this.tipIdx + 1) % tips.length;
      this.tipEl.textContent = tips[this.tipIdx];
    }, 3500);
  }

  setLoading(p) {
    if (this.loadBar) this.loadBar.style.width = Math.round(p * 100) + '%';
  }

  showMatch() {
    this.clearScreens();
    clearInterval(this.tipTimer);
    this.showClickToPlay();
  }

  showClickToPlay() {
    if (this.clickEl) return;
    this.clickEl = h('div', { class: 'click-to-play' },
      h('div', { class: 'ctp-box' },
        h('div', { class: 'ctp-title' }, t('clickToPlay')),
        h('div', { class: 'ctp-hint' }, t('fullscreenHint')),
        h('div', { class: 'row center' },
          h('button', { class: 'btn yellow', onclick: (e) => { e.stopPropagation(); this.app.goFullscreen(); setTimeout(() => this.app.lockGame(), 150); } }, t('fullscreen')),
          h('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); this.app.lockGame(); } }, t('clickToPlay')))));
    this.clickEl.addEventListener('click', () => this.app.lockGame());
    this.overlayRoot.appendChild(this.clickEl);
  }

  onPointerLock(locked) {
    if (locked) {
      if (this.clickEl) { this.clickEl.remove(); this.clickEl = null; }
      if (this.gameOverlay && this.gameOverlay.kind === 'pause') this.resumeGame(true);
    }
  }

  onFullscreenChange() {
    if (this.settings.isOpen && this.settings.tab === 'graphics') this.settings.renderBody();
  }

  toggleFullscreen() {
    toggleFullscreen();
  }

  // Blockiert ein Overlay die Spielsteuerung?
  overlayOpen() {
    return !!(this.gameOverlay || this.settings.isOpen || this.friends.isOpen || this.host.isOpen || this.modal || this.clickEl || (this.app.admin && this.app.admin.isOpen));
  }

  onOverlayClosed() {
    const app = this.app;
    if (app.state === 'match' && app.match && app.match.state === 'alive' && !app.match.ended && !this.overlayOpen() && !app.input.locked) {
      this.showPause();
    }
  }

  update(dt) {
    this.updateConfetti(dt);
  }

  updateLobbyOverlay() {
    if (this.app.state === 'lobby') this.lobby.updateLabels();
  }

  // ---------------- Netz-Callbacks ----------------
  onNetStatus() { this.lobby.refresh(); if (this.friends.isOpen) this.friends.render(); if (this.host.isOpen) this.host.render(); if (this.welcome.el && this.welcome.onChange) this.welcome.onChange(); }
  onRegistered() { this.lobby.refresh(); }
  onSocial() { this.lobby.refresh(); if (this.friends.isOpen) this.friends.render(); }
  onParty() { this.lobby.refresh(); if (this.friends.isOpen) this.friends.render(); }
  onQueue() { this.lobby.refresh(); }
  onHostStatus() { if (this.host.isOpen) this.host.render(); }
  onChat(m) {
    this.lobby.addChat(m);
    this.app.audio.notify();
  }

  // ---------------- Panels ----------------
  openSettings(tab) { this.settings.open(tab); }
  openFriends(tab) { this.friends.open(tab); }
  openHost() { this.host.open(); }

  openStats() {
    const s = this.app.profile.data.stats;
    const kd = (s.kills / Math.max(1, s.deaths)).toFixed(2);
    const rows = [
      ['st_level', s.level], ['st_matches', s.matches], ['st_wins', s.wins], ['st_crownWins', s.crownWins], ['st_kills', s.kills], ['st_deaths', s.deaths],
      ['st_kd', kd], ['st_damage', s.damage], ['st_headshots', s.headshots], ['st_best', s.bestPlacement ? '#' + s.bestPlacement : '–'],
      ['st_bestStreak', s.bestStreak], ['st_time', fmtTime(s.timePlayed)],
    ];
    const grid = h('div', { class: 'stats-grid' }, ...rows.map(([k, v]) => h('div', { class: 'stat-tile' }, h('b', {}, String(v)), h('small', {}, t(k)))));
    this.openModal(t('statsTitle'), grid);
  }

  openCredits() {
    const body = h('div', { class: 'credits' }, ...t('creditsText').split('\n\n').map((p) => h('p', {}, p)));
    this.openModal(t('creditsTitle'), body);
  }

  quitGame() {
    this.confirm(t('quitConfirm'), () => {
      exitFullscreen();
      this.app.audio.stopLobbyMusic();
      this.app.net.ws && this.app.net.ws.close();
      this.app.net.enabled = false;
      this.clearScreens();
      document.body.classList.add('quit');
      this.screenRoot.appendChild(h('div', { class: 'screen goodbye' },
        logo('big'),
        h('h2', {}, t('goodbye')),
        h('button', { class: 'btn yellow', onclick: () => location.reload() }, t('restart'))));
      this.app.state = 'quit';
      try { window.close(); } catch { /* Tab darf nicht geschlossen werden */ }
    });
  }

  // ---------------- Modale Dialoge ----------------
  openModal(title, body, opts = {}) {
    this.closeModal();
    const back = h('div', { class: 'modal-back' });
    const m = h('div', { class: 'modal ' + (opts.cls || '') },
      h('div', { class: 'modal-head' }, h('h2', {}, title), opts.sticky ? null : h('button', { class: 'close-x', onclick: () => this.closeModal() }, '✕')),
      body);
    back.appendChild(m);
    if (!opts.sticky) back.addEventListener('mousedown', (e) => { if (e.target === back) this.closeModal(); });
    this.overlayRoot.appendChild(back);
    this.modal = { el: back, sticky: !!opts.sticky };
    return m;
  }

  closeModal() {
    if (!this.modal) return;
    this.modal.el.remove();
    this.modal = null;
    this.onOverlayClosed();
  }

  confirm(text, onYes) {
    const body = h('div', {}, h('p', { class: 'confirm-text' }, text),
      h('div', { class: 'row end' },
        h('button', { class: 'btn ghost', onclick: () => { this.app.audio.uiClick(); this.closeModal(); } }, t('cancel')),
        h('button', { class: 'btn yellow', onclick: () => { this.app.audio.uiClick(); this.closeModal(); onYes(); } }, t('yes'))));
    this.openModal('?', body, { cls: 'small' });
  }

  // Namen ändern (gleiche Regeln wie beim Erststart)
  renameDialog(forced = false, suggestions = []) {
    const app = this.app;
    const input = h('input', { type: 'text', maxlength: 16, class: 'name-input small', value: forced ? '' : app.profile.name || '' });
    const status = h('div', { class: 'name-status' });
    const sug = h('div', { class: 'name-suggest' });
    const ok = h('button', { class: 'btn yellow' }, t('save'));
    let seq = 0;
    const showSug = (list) => {
      sug.innerHTML = '';
      if (!list || !list.length) return;
      sug.appendChild(h('span', { class: 'lbl' }, t('nameSuggest')));
      for (const s of list) sug.appendChild(h('button', { class: 'chip', onclick: () => { input.value = s; check(); } }, s));
    };
    const setStatus = (kind, text) => {
      status.className = 'name-status ' + kind;
      status.innerHTML = `${kind === 'ok' ? `<span class="icon">${ICON.check}</span>` : kind === 'err' ? `<span class="icon">${ICON.cross}</span>` : ''}<span>${esc(text)}</span>`;
    };
    const check = async () => {
      const name = input.value;
      const my = ++seq;
      const err = validateName(name);
      ok.disabled = true;
      sug.innerHTML = '';
      if (err) { setStatus('err', t('nameErr_' + err)); return; }
      if (name === app.profile.name && !forced) { setStatus('ok', t('nameOk')); ok.disabled = false; return; }
      setStatus('checking', t('nameChecking'));
      const r = await app.checkName(name);
      if (my !== seq) return;
      if (r.ok || r.offline || r.err === 'offline') { setStatus('ok', t('nameOk')); ok.disabled = false; }
      else { setStatus('err', t('nameErr_' + (r.err || 'taken'))); showSug(r.suggestions); }
    };
    input.addEventListener('input', () => { app.audio.uiType(); check(); });
    const save = async () => {
      if (ok.disabled) return;
      const r = await app.changeName(input.value);
      if (r.ok) {
        app.audio.uiConfirm();
        this.closeModal();
        this.toast(t('nameSaved', { name: input.value }), 'ok');
        this.lobby.refresh();
        if (this.settings.isOpen) this.settings.renderBody();
        if (forced) app.sendHello();
      } else {
        app.audio.uiError();
        setStatus('err', t('nameErr_' + (r.err || 'taken')));
        showSug(r.suggestions);
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    ok.addEventListener('click', save);
    const body = h('div', { class: 'rename' }, input, status, sug, h('div', { class: 'row end' }, forced ? null : h('button', { class: 'btn ghost', onclick: () => this.closeModal() }, t('cancel')), ok));
    this.openModal(forced ? t('nameTaken') : t('sChangeName'), body, { cls: 'small', sticky: forced });
    showSug(suggestions);
    check();
    setTimeout(() => input.focus(), 30);
  }

  forceRename(suggestions) {
    this.renameDialog(true, suggestions);
  }

  // ---------------- Toasts / Einladungen ----------------
  toast(text, kind = '') {
    const el = h('div', { class: 'toast ' + kind }, text);
    this.toastRoot.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  showInvite(m) {
    const app = this.app;
    const bar = h('div', { class: 'inv-bar' });
    const el = h('div', { class: 'invite-pop' },
      h('div', { class: 'inv-text' }, t('inviteFrom', { name: m.from.name })),
      h('div', { class: 'row' },
        h('button', { class: 'btn yellow small', onclick: () => { app.audio.uiConfirm(); app.net.send({ t: 'inviteAccept', inviteId: m.inviteId }); this.removeInvite(m.inviteId); } }, t('accept')),
        h('button', { class: 'btn ghost small', onclick: () => { app.audio.uiClick(); app.net.send({ t: 'inviteDecline', inviteId: m.inviteId }); this.removeInvite(m.inviteId); } }, t('decline'))),
      bar);
    this.inviteRoot.appendChild(el);
    const ttl = (m.ttl || INVITE_TTL) * 1000;
    bar.style.transition = `width ${ttl}ms linear`;
    requestAnimationFrame(() => { bar.style.width = '0%'; });
    const timer = setTimeout(() => this.removeInvite(m.inviteId), ttl);
    this.invites.set(m.inviteId, { el, timer });
  }

  removeInvite(id) {
    const inv = this.invites.get(id);
    if (!inv) return;
    clearTimeout(inv.timer);
    inv.el.remove();
    this.invites.delete(id);
  }

  // ---------------- Spiel-Overlays ----------------
  setGameOverlay(kind, el) {
    this.closeGameOverlay();
    this.gameOverlay = { kind, el };
    this.overlayRoot.appendChild(el);
  }

  closeGameOverlay() {
    if (!this.gameOverlay) return;
    this.gameOverlay.el.remove();
    this.gameOverlay = null;
  }

  showPause() {
    const app = this.app;
    if (this.gameOverlay || !app.match) return;
    const solo = app.match.session.isLocal;
    app.setPaused(true);
    const el = h('div', { class: 'game-overlay pause' },
      h('div', { class: 'pause-box' },
        h('h1', {}, t('pauseTitle')),
        h('div', { class: 'pause-sub' }, solo ? t('soloPaused') : t('mpNoPause')),
        h('button', { class: 'btn yellow big', onclick: () => this.resumeGame() }, t('resume')),
        h('button', { class: 'btn', onclick: () => { app.audio.uiClick(); this.openSettings(); } }, t('menuSettings')),
        h('button', { class: 'btn', onclick: () => { app.audio.uiClick(); this.toggleFullscreen(); } }, t('fullscreen')),
        h('button', { class: 'btn danger', onclick: () => { app.audio.uiClick(); this.confirm(t('leaveConfirm'), () => { this.closeGameOverlay(); app.setPaused(false); app.match.leaveToLobby(); }); } }, t('leaveMatch'))));
    this.setGameOverlay('pause', el);
  }

  resumeGame(fromLock = false) {
    if (!this.gameOverlay || this.gameOverlay.kind !== 'pause') return;
    this.app.audio.uiClick();
    this.closeGameOverlay();
    this.app.setPaused(false);
    if (!fromLock) this.app.lockGame();
  }

  showDeath({ text, placement, total, stats, onSpectate, onLobby }) {
    const app = this.app;
    const el = h('div', { class: 'game-overlay death' },
      h('div', { class: 'death-box' },
        h('div', { class: 'death-title' }, text),
        h('div', { class: 'death-place' }, t('placement', { n: placement || '?', total })),
        h('div', { class: 'death-stats' },
          h('div', {}, h('b', {}, String(stats.kills)), h('small', {}, t('killsLabel'))),
          h('div', {}, h('b', {}, String(stats.damage)), h('small', {}, t('damage'))),
          h('div', {}, h('b', {}, String(stats.headshots || 0)), h('small', {}, t('headshots')))),
        h('div', { class: 'row center' },
          // Platz 2: nur noch der Sieger übrig – kein Zuschauen, direkt zurück in die Lobby
          placement > 2 ? h('button', { class: 'btn yellow', onclick: () => { app.audio.uiClick(); this.closeGameOverlay(); onSpectate(); } }, t('spectate')) : null,
          h('button', { class: placement > 2 ? 'btn' : 'btn yellow', onclick: () => { app.audio.uiClick(); this.closeGameOverlay(); onLobby(); } }, t('backToLobby')))));
    setTimeout(() => this.setGameOverlay('death', el), 1600);
  }

  showVictory({ stats, time, onContinue }) {
    const app = this.app;
    if (app.match) app.match.hud.bigMsgEl.classList.remove('show');
    const el = h('div', { class: 'game-overlay victory' },
      h('div', { class: 'vic-flash' }),
      h('div', { class: 'vic-rays' }),
      h('div', { class: 'victory-banner' },
        h('div', { class: 'vb-crown', html: ICON.crown }),
        h('div', { class: 'vb-main' }, t('victory')),
        h('div', { class: 'vb-sub' }, t('victorySub'))),
      h('div', { class: 'victory-stats' },
        h('div', {}, h('b', {}, String(stats.kills)), h('small', {}, t('killsLabel'))),
        h('div', {}, h('b', {}, String(stats.damage)), h('small', {}, t('damage'))),
        h('div', {}, h('b', {}, String(stats.headshots || 0)), h('small', {}, t('headshots'))),
        h('div', {}, h('b', {}, fmtTime(time)), h('small', {}, t('survived'))),
        h('div', {}, h('b', {}, '#1'), h('small', {}, t('place')))),
      h('button', { class: 'btn yellow big', onclick: () => { app.audio.uiClick(); this.closeGameOverlay(); onContinue(); } }, t('continue')));
    this.setGameOverlay('victory', el);
    this.confettiBurst(260, true);
    // zweite Konfetti-Welle
    setTimeout(() => { if (this.gameOverlay && this.gameOverlay.kind === 'victory') this.confettiBurst(180, true); }, 1600);
  }

  showMatchOver({ winner, onContinue }) {
    const app = this.app;
    if (this.gameOverlay && this.gameOverlay.kind === 'death') this.closeGameOverlay();
    const el = h('div', { class: 'game-overlay matchover' },
      h('div', { class: 'death-box' },
        h('div', { class: 'death-title' }, t('winnerIs', { name: winner })),
        h('button', { class: 'btn yellow big', onclick: () => { app.audio.uiClick(); this.closeGameOverlay(); onContinue(); } }, t('continue'))));
    this.setGameOverlay('matchover', el);
    app.match && app.match.hud.setSpectate(null);
  }

  showResults({ mine, total, xp, winner, youId, onDone }) {
    this.clearScreens();
    const app = this.app;
    const st = app.profile.data.stats;
    const need = xpForLevel(st.level);
    const fill = h('div', { class: 'xp-fill' });
    const won = mine.placement === 1;
    const el = h('div', { class: 'screen results-screen' },
      h('div', { class: 'results-card' },
        h('h1', {}, won ? t('victory') : t('results')),
        h('div', { class: 'res-place ' + (won ? 'win' : '') }, '#' + (mine.placement || '?'), h('small', {}, ' / ' + total)),
        winner ? h('div', { class: 'res-winner' }, h('span', { class: 'icon', html: ICON.crown }), ' ', t('crownHolder'), ': ', winner.name + (winner.isBot ? ' [BOT]' : '')) : null,
        h('div', { class: 'victory-stats' },
          h('div', {}, h('b', {}, String(mine.kills)), h('small', {}, t('killsLabel'))),
          h('div', {}, h('b', {}, String(mine.damage)), h('small', {}, t('damage'))),
          h('div', {}, h('b', {}, String(mine.headshots || 0)), h('small', {}, t('headshots'))),
          h('div', {}, h('b', {}, fmtTime(mine.survival || 0)), h('small', {}, t('survived')))),
        h('div', { class: 'xp-list' }, ...xp.parts.map((p) => h('div', { class: 'xp-line' }, h('span', {}, t(p.key)), h('b', {}, '+' + p.xp + ' XP')))),
        h('div', { class: 'xp-total' }, t('xpEarned'), ': ', h('b', {}, '+' + xp.total + ' XP')),
        xp.coins ? h('div', { class: 'coin-earned' }, h('span', { class: 'icon', html: ICON.coin }), h('b', {}, '+' + xp.coins), ' ' + t('coins')) : null,
        xp.levelUps ? h('div', { class: 'level-up' }, t('levelUp'), ' ', t('level'), ' ', String(xp.level)) : null,
        h('div', { class: 'xp-bar big' }, fill, h('div', { class: 'xp-text' }, `${t('level')} ${st.level} · ${st.xp} / ${need} XP`)),
        app.profile.data.winStreak > 0 ? h('div', { class: 'streak-note' }, h('span', { class: 'icon', html: ICON.crown }), ' ', t('killStreakCrown', { n: app.profile.data.winStreak })) : null,
        h('button', { class: 'btn yellow big', onclick: () => { app.audio.uiClick(); this.resultsEl.remove(); this.resultsEl = null; onDone(); } }, t('continue'))));
    this.resultsEl = el;
    this.screenRoot.appendChild(el);
    requestAnimationFrame(() => { fill.style.width = Math.min(100, (st.xp / need) * 100) + '%'; });
    if (xp.levelUps) { app.audio.uiConfirm(); this.confettiBurst(120); }
  }

  // ---------------- Konfetti ----------------
  resizeConfetti() {
    this.confetti.width = window.innerWidth;
    this.confetti.height = window.innerHeight;
  }

  confettiBurst(n = 150, rain = false) {
    const W = this.confetti.width, H = this.confetti.height;
    const cols = ['#ffd23f', '#f2a122', '#e63946', '#2a9df4', '#43aa5b', '#9b5de5', '#f15bb5', '#ffffff'];
    for (let i = 0; i < n; i++) {
      this.confettiParts.push({
        x: rain ? Math.random() * W : W / 2 + (Math.random() - 0.5) * 200,
        y: rain ? -20 - Math.random() * H * 0.5 : H * 0.45,
        vx: rain ? (Math.random() - 0.5) * 80 : (Math.random() - 0.5) * 900,
        vy: rain ? 60 + Math.random() * 120 : -300 - Math.random() * 500,
        r: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        c: cols[i % cols.length],
        life: rain ? 7 : 4,
      });
    }
  }

  updateConfetti(dt) {
    const g = this.confetti.getContext('2d');
    if (!this.confettiParts.length) {
      if (this.confettiDirty) { g.clearRect(0, 0, this.confetti.width, this.confetti.height); this.confettiDirty = false; }
      return;
    }
    this.confettiDirty = true;
    g.clearRect(0, 0, this.confetti.width, this.confetti.height);
    for (const p of this.confettiParts) {
      p.vy += 420 * dt;
      p.vy = Math.min(p.vy, 260);
      p.vx *= 1 - dt * 1.5;
      p.x += (p.vx + Math.sin(p.r * 2) * 30) * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      p.life -= dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.scale(1, Math.abs(Math.cos(p.r * 1.3)) + 0.2);
      g.fillStyle = p.c;
      g.globalAlpha = Math.min(1, p.life);
      g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    this.confettiParts = this.confettiParts.filter((p) => p.life > 0 && p.y < this.confetti.height + 40);
  }
}
