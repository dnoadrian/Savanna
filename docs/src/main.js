// SNOWDOWN – Client-Einstieg: App-Zustände (Anmeldung → Lobby → Warteschlange → Laden → Match → Ergebnis).
import * as THREE from 'three';
import { Settings } from './settings.js';
import { setLanguage, t } from './i18n.js';
import { Profile, computeCoins, wipeAllProfiles } from './profile.js';
import { AudioEngine } from './audio/engine.js';
import { Renderer, GRAPHICS } from './render/renderer.js';
import { LobbyScene } from './render/lobbyScene.js';
import { WorldView } from './render/world.js';
import { renderMapImage } from './render/mapImage.js';
import { preloadItemIcons } from './render/itemIcons.js';
import { Input, enterFullscreen, lockKeyboard } from './game/input.js';
import { MatchClient } from './game/match.js';
import { NetClient } from './net/net.js';
import { LocalSession, NetSession } from './net/session.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { AdminPanel, loadLocalAnnouncements } from './ui/admin.js';
import { mapSteps, randomMapId } from '../shared/map/mapgen.js';
import { NavGrid } from '../shared/sim/nav.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { MATCH_SIZE, clampQueueWait, normMode, modeSize, isArenaMode, ARENA_MAP } from '../shared/constants.js';
import { initPWA } from './pwa.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

class App {
  constructor() {
    this.settings = new Settings();
    setLanguage(this.settings.get('language'));
    this.profile = new Profile();
    this.audio = new AudioEngine(this.settings);
    this.input = new Input(this.settings);
    this.renderer = new Renderer(document.getElementById('canvas-root'));
    this.net = new NetClient();
    this.hud = new HUD(document.getElementById('ui-root'), this.settings);
    this.lobbyScene = new LobbyScene();
    this.ui = new UI(this);
    this.admin = new AdminPanel(this);
    this.state = 'boot';
    this.localQueue = null;
    this.match = null;
    this.mapData = null; // Karte des laufenden/letzten Matches
    this.mapCache = new Map(); // Karten-ID -> { promise, data }
    this.soloMapId = randomMapId(); // nächste Karte für Matches ohne Server
    this.social = { friends: [], incoming: [], outgoing: [], blocked: [] };
    this.party = null;
    this.queue = null;
    this.isHost = false;
    this.hostStatus = null;
    this.registered = false;
    this.applyGraphics();
    this.settings.onChange((k) => this.onSettingChanged(k));
    this.net.on((m) => this.onNet(m));
    this.net.onStatus((c) => this.onNetStatus(c));
    // Spielstand-Kopie auf dem Server aktuell halten (gebündelt)
    this.profile.onChange = () => this.scheduleSync();
    // erste Nutzergeste aktiviert Audio
    const unlockAudio = () => {
      this.audio.init();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    this.input.onLockChange = (locked) => this.onPointerLock(locked);
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) lockKeyboard();
      this.ui.onFullscreenChange();
    });
    this.renderer.canvas.addEventListener('click', () => this.onCanvasClick());
  }

  start() {
    this.net.connect();
    if (this.profile.hasName) this.enterLobby();
    else this.showWelcome();
    this.lastT = performance.now();
    this.scheduleFrame();
    // Karte im Hintergrund vorbereiten (schneller Matchstart, Vorschau in der Lobby)
    setTimeout(() => {
      this.prepareMap(this.soloMapId).then(() => { if (this.state === 'lobby') this.ui.lobby.refresh(); }).catch((e) => console.error(e));
    }, 1500);
  }

  t(k, v) { return t(k, v); }

  // ---------------- Hauptschleife mit FPS-Limit / V-Sync ----------------
  scheduleFrame() {
    if (this.settings.get('vsync')) requestAnimationFrame(() => this.frame());
    else {
      if (!this.mc) {
        this.mc = new MessageChannel();
        this.mc.port1.onmessage = () => this.frame();
      }
      setTimeout(() => this.mc.port2.postMessage(0), 0);
    }
  }

  frame() {
    const now = performance.now();
    const lim = this.settings.get('fpsLimit');
    const limit = lim === 'unlimited' ? (this.settings.get('vsync') ? 1000 : 500) : Number(lim);
    const minDt = 1000 / limit - 0.5;
    if (now - this.lastT < minDt) {
      this.scheduleFrame();
      return;
    }
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    try {
      this.update(dt, now / 1000);
    } catch (e) {
      console.error(e);
    }
    this.scheduleFrame();
  }

  update(dt, now) {
    if (this.localQueue) this.tickLocalQueue();
    if (this.state === 'match' && this.match) {
      this.match.update(dt, now);
      const r = this.match.renderScenes;
      this.renderer.scene = r.scene;
      this.renderer.camera = r.camera;
      this.renderer.vmScene = r.vmScene;
      this.renderer.vmCamera = r.vmCamera;
      this.renderer.render();
      // automatische Auflösung nur, wenn die Bildrate nicht absichtlich begrenzt ist
      const lim = this.settings.get('fpsLimit');
      if (lim === 'unlimited' || Number(lim) >= 60) this.renderer.adaptResolution(this.match.fps, dt);
    } else if (this.state !== 'loading') {
      this.lobbyScene.update(dt);
      this.ui.updateLobbyOverlay(dt);
      this.renderer.render();
    }
    this.ui.update(dt);
  }

  // ---------------- Grafik ----------------
  // feste Einstellungen für alle (Leistung, Schatten niedrig, Sichtweite episch, kein Gras)
  effectiveGraphics() {
    return { ...GRAPHICS };
  }

  applyGraphics() {
    const g = this.effectiveGraphics();
    this.renderer.apply(g);
    if (this.match) this.match.applySettings();
    this.graphics = g;
  }

  onSettingChanged(k) {
    if (k === 'queueWait') this.ui.onQueue();
    if (k === 'language') {
      setLanguage(this.settings.get('language'));
      this.ui.rebuild();
      this.hud.build();
      this.hud.applySettings();
    }
  }

  // ---------------- Bildschirme ----------------
  // Menü-Hintergrund (blaues Streifen-Wallpaper) + transparente 3D-Szene davor
  showMenuScene(mode) {
    this.lobbyScene.mode = mode;
    this.renderer.setScenes(this.lobbyScene.scene, this.lobbyScene.camera, null, null, true);
    document.body.classList.add('menu');
  }

  showWelcome(opts) {
    this.state = 'welcome';
    this.cancelQueue();
    this.lobbyScene.setMembers([]);
    this.showMenuScene('welcome');
    this.ui.showWelcome(opts);
  }

  // Name + Geburtsdatum gewählt (Erststart)
  async finishWelcome(name, auth) {
    this.profile.create(name, auth);
    this.registered = false;
    if (this.net.connected) this.sendHello();
    this.audio.uiConfirm();
  }

  // Anmelden mit Name + Geburtsdatum (Konto von einem anderen Gerät/Browser)
  async login(name, auth) {
    if (!this.net.connected) return { ok: false, key: 'loginOffline' };
    const r = await this.net.request({ t: 'login', name, auth }, 5000);
    if (!r.ok) return { ok: false, key: r.key || (r.err === 'timeout' ? 'loginOffline' : 'loginWrong') };
    if (this.net.connected && this.profile.hasName && this.registered) this.net.send({ t: 'logout' });
    this.profile.adopt(r.id, r.name, auth, r.save);
    this.registered = false;
    this.party = null;
    this.sendHello();
    return { ok: true, name: r.name };
  }

  // Abmelden: Profil nur auf diesem Gerät entfernen (Konto bleibt auf dem Server)
  signOut(opts = { mode: 'login' }) {
    if (this.net.connected && this.registered) this.net.send({ t: 'logout' });
    this.profile.reset();
    this.party = null;
    this.registered = false;
    this.showWelcome(opts);
  }

  scheduleSync() {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sendProfile(), 1200);
  }

  enterLobby() {
    this.state = 'lobby';
    this.showMenuScene('lobby');
    this.refreshLobbyMembers();
    this.ui.showLobby();
    this.audio.startLobbyMusic();
    if (this.net.connected && !this.registered) this.sendHello();
  }

  refreshLobbyMembers() {
    const p = this.profile.data;
    if (!p) return;
    const me = { id: p.id, outfit: p.outfit, color: p.color, name: p.name, crown: p.winStreak > 0, crownStyle: p.crownStyle };
    let members = [me];
    if (this.party && this.party.members.length > 1) {
      members = [me, ...this.party.members.filter((m) => m.id !== p.id).map((m) => ({
        id: m.id, outfit: m.outfit, color: m.color, name: m.name, crown: m.streak > 0, crownStyle: m.crownStyle,
        ingame: m.status === 'game',
      }))];
    }
    this.lobbyScene.setMembers(members);
  }

  // ---------------- Netzwerk ----------------
  onNetStatus(connected) {
    this.ui.onNetStatus(connected);
    if (connected && this.profile.hasName) this.sendHello();
    if (!connected) {
      this.registered = false;
      this.party = null;
      if (!this.localQueue) this.queue = null;
      this.isHost = false;
      this.refreshLobbyMembers();
      if (this.state === 'match' && this.match && !this.match.session.isLocal) this.ui.toast(t('errServerLost'), 'error');
    }
  }

  sendHello() {
    const p = this.profile;
    if (!p.hasName) return;
    this.net.send({ t: 'hello', id: p.id, name: p.name, profile: p.publicInfo(), auth: p.data.auth || null, save: p.saveBlob() });
  }

  sendProfile() {
    clearTimeout(this.syncTimer);
    if (this.net.connected && this.profile.hasName && this.registered) this.net.send({ t: 'profile', profile: this.profile.publicInfo(), save: this.profile.saveBlob() });
  }

  onNet(m) {
    switch (m.t) {
      case 'welcome':
        this.serverInfo = m.srv || null;
        this.setAnnouncements(m.ann);
        this.registered = true;
        this.isHost = !!m.isHost;
        if (m.name && m.name !== this.profile.name) this.profile.set('name', m.name);
        this.profile.set('registered', true);
        this.ui.onRegistered();
        break;
      case 'authFail':
        // Konto gehört zu einem Geburtsdatum, der Schlüssel passt nicht: neu anmelden
        this.signOut({ mode: 'login', name: this.profile.name, msg: t('authFail') });
        break;
      case 'nameTaken':
        // Name wurde inzwischen vergeben (Offline-Registrierung): neuen Namen wählen lassen
        this.registered = false;
        this.ui.forceRename(m.suggestions || []);
        break;
      case 'social':
        this.social = m.social;
        this.ui.onSocial();
        break;
      case 'party':
        this.party = m.party;
        // als Leader den eigenen Modus (Solo/Duo) für die Party übernehmen
        if (m.party && m.party.members.length > 1 && m.party.leader === this.profile.id && (m.party.mode || 'solo') !== this.settings.get('gameMode')) {
          this.net.send({ t: 'partyMode', mode: this.settings.get('gameMode') });
        }
        this.refreshLobbyMembers();
        this.ui.onParty();
        break;
      case 'chat':
        this.ui.onChat(m);
        break;
      case 'invite':
        this.audio.inviteSound();
        this.ui.showInvite(m);
        break;
      case 'inviteGone':
        this.ui.removeInvite(m.inviteId);
        break;
      case 'notice':
        this.ui.toast(t(m.key, m.vars), m.kind || '');
        if (m.sound === 'friend') this.audio.friendRequest();
        else if (m.sound === 'notify') this.audio.notify();
        break;
      case 'err':
        this.ui.toast(t(m.key || 'err_generic', m.vars), 'error');
        this.audio.uiError();
        break;
      case 'queue':
        if (this.localQueue) break;
        this.queue = m.state === 'idle' ? null : m;
        if (m.map && m.state === 'waiting') this.prepareMap(m.map).catch(() => {});
        this.ui.onQueue();
        break;
      case 'matchStart':
        this.startNetMatch(m);
        break;
      case 'srv':
        this.serverInfo = m.srv;
        this.ui.lobby.updateServerBox?.();
        break;
      case 'ann':
        this.setAnnouncements(m.ann);
        break;
      case 'wiped':
        this.onWiped(m.at);
        break;
      case 'kicked':
        // vom Admin rausgeworfen: Online-Runde verlassen, Hinweis höchstens einmal pro Minute
        if (this.match && !this.match.session.isLocal) { this.disposeMatch(); this.enterLobby(); }
        this.registered = false;
        this.party = null;
        if (!this.kickToast || Date.now() - this.kickToast > 60000) {
          this.kickToast = Date.now();
          this.ui.toast(t('kickedMsg', { n: m.left || 10 }), 'error');
        }
        break;
      case 'coins':
        // Geschenk vom Admin
        this.profile.addCoins(m.amount);
        this.audio.uiConfirm();
        this.ui.toast(t('coinsGift', { n: m.amount }), 'ok');
        this.ui.lobby.refresh?.();
        break;
      case 'host':
        this.hostStatus = m.status;
        this.ui.onHostStatus();
        break;
      default:
        break;
    }
  }

  // Lobby-Nachrichten vom Admin: { id, text, until } (until = 0 → dauerhaft, sonst Zeitpunkt)
  setAnnouncements(list) {
    const now = Date.now();
    this.announcements = (Array.isArray(list) ? list : []).map((a) => ({ id: a.id, text: String(a.text || ''), until: a.left > 0 ? now + a.left : 0 }));
    this.ui.lobby.renderAnnouncements?.();
    this.admin?.onAnnouncements?.();
  }

  // aktuell sichtbare Nachrichten (mit Server die vom Server, sonst die dieses Geräts)
  liveAnnouncements() {
    const now = Date.now();
    const list = this.net.connected ? this.announcements || [] : loadLocalAnnouncements();
    return list.filter((a) => !a.until || a.until > now);
  }

  // ---------------- Karte / Welt ----------------
  // Karte erzeugen (in Häppchen, damit der Ladebalken flüssig bleibt) und zwischenspeichern.
  // onProgress bekommt 0..0.9.
  prepareMap(id, onProgress = null) {
    let e = this.mapCache.get(id);
    if (e) {
      e.used = performance.now();
      if (onProgress) {
        e.progress = onProgress;
        onProgress(e.p || 0);
      }
      return e.promise;
    }
    e = { used: performance.now(), progress: onProgress, p: 0, data: null };
    const report = (p) => { e.p = p; if (e.progress) e.progress(p); };
    e.promise = (async () => {
      report(0.02);
      await nextFrame();
      const gen = mapSteps(id);
      let map = null;
      let t = performance.now();
      for (;;) {
        const r = gen.next();
        if (r.done) { map = r.value; break; }
        report(r.value * 0.3);
        if (performance.now() - t > 30) {
          await nextFrame();
          t = performance.now();
        }
      }
      await nextFrame();
      const world = new WorldView(map);
      await world.build((p) => report(0.3 + p * 0.5));
      const mapImage = renderMapImage(map, 1024);
      preloadItemIcons();
      report(0.9);
      e.data = { id, map, world, mapImage, nav: null };
      return e.data;
    })();
    this.mapCache.set(id, e);
    this.pruneMaps(id);
    return e.promise;
  }

  // höchstens zwei Karten im Speicher; die älteste (nicht benutzte) freigeben
  pruneMaps(keep) {
    if (this.mapCache.size <= 2) return;
    const list = [...this.mapCache.entries()].filter(([id]) => id !== keep && (!this.mapData || this.mapData.id !== id)).sort((a, b) => a[1].used - b[1].used);
    while (this.mapCache.size > 2 && list.length) {
      const [id, e] = list.shift();
      this.mapCache.delete(id);
      e.promise.then((d) => d && d.world.dispose()).catch(() => {});
    }
  }

  ensureNav(data = this.mapData) {
    if (!data.nav) data.nav = new NavGrid(data.map.terrain, data.map.collision);
    return data.nav;
  }

  // Spielmodus (Solo, Duo, 1v1, 2v2): in einer Party bestimmt der Leader (Server), sonst die eigene Einstellung
  gameMode() {
    const party = this.party;
    if (party && party.members.length > 1 && this.net.connected) return normMode(party.mode);
    return normMode(this.settings.get('gameMode'));
  }

  // Karte, die im gewählten Modus als Nächstes gespielt wird (Arena-Modi: immer die Holzarena)
  lobbyMapId() {
    return isArenaMode(this.gameMode()) ? ARENA_MAP : this.soloMapId;
  }

  setGameMode(mode) {
    mode = normMode(mode);
    this.settings.set('gameMode', mode);
    const party = this.party;
    if (party && party.members.length > 1 && party.leader === this.profile.id && this.net.connected) this.net.send({ t: 'partyMode', mode });
  }

  // ---------------- Warteschlange ----------------
  // BEREIT: mit Server → Warteschlange dort (Standard 15 s, einstellbar 10–120 s), danach Bots
  // für freie Plätze; ohne Server (Webseite) → dieselbe Wartezeit lokal, dann eine Bot-Lobby.
  ready() {
    if (this.queue) return;
    const mode = this.gameMode();
    if (!this.net.connected) this.prepareMap(this.lobbyMapId()).catch(() => {});
    const wait = clampQueueWait(this.settings.get('queueWait'));
    if (this.net.connected) {
      this.net.send({ t: 'queue', wait, mode });
      return;
    }
    this.localQueue = { start: performance.now(), wait };
    this.queue = { state: 'waiting', secs: wait, wait, humans: 1, bots: modeSize(mode) - 1, local: true, mode, map: this.lobbyMapId() };
    this.ui.onQueue();
  }

  tickLocalQueue() {
    const q = this.localQueue;
    const secs = Math.max(0, q.wait - (performance.now() - q.start) / 1000);
    if (Math.ceil(secs) !== Math.ceil(this.queue.secs)) {
      this.queue.secs = secs;
      this.ui.onQueue();
      this.audio.uiHover();
    }
    this.queue.secs = secs;
    if (secs <= 0) {
      this.localQueue = null;
      this.queue = null;
      this.playSolo().catch((e) => console.error(e));
    }
  }

  cancelQueue() {
    if (this.localQueue) {
      this.localQueue = null;
      this.queue = null;
      this.ui.onQueue();
      return;
    }
    if (this.queue) this.net.send({ t: 'queueCancel' });
  }

  // ---------------- Spielstart ----------------
  async playSolo() {
    if (this.state !== 'lobby') return;
    this.audio.stopLobbyMusic();
    this.state = 'loading';
    this.ui.showLoading();
    const mode = this.gameMode();
    const arena = isArenaMode(mode);
    const mapId = arena ? ARENA_MAP : this.soloMapId;
    const data = await this.prepareMap(mapId, (p) => this.ui.setLoading(p));
    this.mapData = data;
    if (!arena) this.soloMapId = randomMapId(Math.random, mapId);
    this.ui.setLoading(0.92);
    await nextFrame();
    const nav = this.ensureNav(data);
    const prof = this.profile.data;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const rng = new RNG(seed);
    const me = { ...this.profile.publicInfo(), isBot: false };
    const champ = prof.soloChampion;
    const players = Simulation.fillWithBots([me], rng, champ ? { ...champ, isBot: true, crownStyle: 'gold' } : null, mode);
    if (players.length !== modeSize(mode)) throw new Error('Spielerzahl muss ' + modeSize(mode) + ' sein');
    const map = data.map;
    const sim = new Simulation({ terrain: map.terrain, collision: map.collision, nav, pois: map.pois, chests: map.chests, floorLoot: map.floorLoot, spawns: map.spawns, storm: map.storm }, { seed, players, mode });
    const session = new LocalSession(sim, me.id);
    this.beginMatch(session, 'solo');
  }

  async startNetMatch(m) {
    if (this.state === 'match' && this.match) this.disposeMatch();
    this.audio.stopLobbyMusic();
    this.state = 'loading';
    this.queue = null;
    this.ui.showLoading();
    const data = await this.prepareMap(m.map, (p) => this.ui.setLoading(p));
    this.mapData = data;
    const session = new NetSession(this.net, m, data.map);
    this.net.send({ t: 'loaded', mid: m.matchId });
    this.beginMatch(session, 'party');
  }

  beginMatch(session, mode) {
    const data = this.mapData;
    document.body.classList.remove('menu');
    this.admin.close();
    this.match = new MatchClient(this, { session, map: data.map, world: data.world, mapImage: data.mapImage, mode });
    this.renderer.setScenes(this.match.scene, this.match.camera, this.match.viewmodel.scene, this.match.viewmodel.camera);
    this.state = 'match';
    this.input.gameActive = true;
    this.input.clear();
    this.ui.showMatch();
  }

  onCanvasClick() {
    if (this.state !== 'match' || !this.match) return;
    if (this.ui.overlayOpen()) return;
    if (this.match.state === 'alive' && !this.input.locked) this.lockGame();
  }

  lockGame() {
    this.input.lock(this.renderer.canvas);
    lockKeyboard();
  }

  onPointerLock(locked) {
    if (this.state !== 'match' || !this.match) return;
    this.ui.onPointerLock(locked);
    if (!locked && this.match.state === 'alive' && !this.match.ended && !this.ui.overlayOpen()) {
      this.ui.showPause();
    }
  }

  setPaused(p) {
    if (this.match && this.match.session.isLocal) this.match.session.setPaused(p);
  }

  disposeMatch() {
    if (!this.match) return;
    this.match.dispose();
    this.match = null;
    this.input.gameActive = false;
    this.input.unlock();
  }

  // Match regulär beendet → Ergebnis
  endMatch(r) {
    const mine = r.mine;
    const arena = isArenaMode(r.gameMode);
    if (r.mode === 'solo' && !arena) this.applySoloResult({ mine, results: r.results, winnerId: r.winnerId, players: r.players, silent: true });
    const xp = this.applyPersonalResult(mine, r.total, arena);
    this.disposeMatch();
    this.state = 'results';
    this.showMenuScene('lobby');
    this.refreshLobbyMembers();
    this.ui.showResults({ mine, total: r.total || r.players.length, xp, winner: r.winner, youId: r.youId, duo: r.duo, onDone: () => this.enterLobby() });
  }

  // Vorzeitig zurück in die Lobby
  returnToLobby({ mine, mode, partial, total, gameMode }) {
    if (mine && partial) this.applyPersonalResult({ ...mine, placement: mine.placement || 0 }, total, isArenaMode(gameMode));
    this.disposeMatch();
    this.enterLobby();
  }

  // arena: 1v1/2v2 – Coins und Statistik ja, aber keine Rangpunkte und keine Kronen-Serie
  applyPersonalResult(mine, total = MATCH_SIZE, arena = false) {
    const r = { kills: mine.kills || 0, damage: mine.damage || 0, headshots: mine.headshots || 0, placement: mine.placement || total, survival: mine.survival || 0, arena };
    this.profile.applyMatch(r);
    const xp = { parts: [] };
    // Ranked-Fortschritt (ersetzt Level/XP) – nur im Battle Royale
    xp.rank = arena ? null : this.profile.applyRank(r);
    // Coins: 50 pro Kill, 250 für den Sieg
    xp.coins = computeCoins(r);
    if (xp.coins) this.profile.addCoins(xp.coins);
    this.sendProfile();
    return xp;
  }

  // Kronen-Bot im Solo-Modus merken
  applySoloResult({ winnerId, players }) {
    if (!winnerId) return;
    const prof = this.profile;
    const w = players.find((p) => p.id === winnerId);
    if (!w) return;
    if (w.isBot) {
      const prev = prof.data.soloChampion;
      const streak = prev && prev.name === w.name ? (prev.streak || 1) + 1 : 1;
      prof.set('soloChampion', { name: w.name, outfit: w.outfit, color: w.color, streak });
    } else {
      prof.set('soloChampion', null);
    }
    this.refreshLobbyMembers();
  }

  // ---------------- Konto ----------------
  async changeName(name) {
    if (!this.net.connected) {
      this.profile.set('name', name);
      this.profile.set('registered', false);
      return { ok: true, offline: true };
    }
    const r = await this.net.request({ t: 'setName', name });
    if (r.ok) {
      this.profile.set('name', r.name);
      this.refreshLobbyMembers();
    }
    return r;
  }

  async checkName(name) {
    if (!this.net.connected) return { ok: true, offline: true };
    return this.net.request({ t: 'checkName', name }, 3000);
  }

  // Admin hat alle Spieler zurückgesetzt: Spielstand auf diesem Gerät löschen, neu anmelden
  onWiped(at) {
    if (this.wipeHandled === at) return;
    this.wipeHandled = at;
    if (this.match) this.disposeMatch();
    wipeAllProfiles(at);
    this.profile.data = null;
    this.party = null;
    this.social = null;
    this.registered = false;
    this.showWelcome({ msg: t('wipedMsg') });
  }

  resetAccount() {
    if (this.net.connected) this.net.send({ t: 'resetAccount' });
    this.profile.reset();
    this.party = null;
    this.registered = false;
    this.showWelcome();
  }

  goFullscreen() {
    enterFullscreen();
  }
}

initPWA();
const app = new App();
window.__app = app;
app.start();

export default app;
export { THREE };
