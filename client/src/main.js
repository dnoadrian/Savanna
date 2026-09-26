// SHOWDOWN BAY – Client-Einstieg: App-Zustände (Anmeldung → Lobby → Warteschlange → Laden → Match → Ergebnis).
import * as THREE from 'three';
import { Settings } from './settings.js';
import { setLanguage, t } from './i18n.js';
import { Profile, computeXp } from './profile.js';
import { AudioEngine } from './audio/engine.js';
import { Renderer, QUALITY_PRESETS, PERFORMANCE_MODE } from './render/renderer.js';
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
import { AdminPanel } from './ui/admin.js';
import { generateMap } from '../shared/map/mapgen.js';
import { NavGrid } from '../shared/sim/nav.js';
import { Simulation } from '../shared/sim/simulation.js';
import { RNG } from '../shared/rng.js';
import { MAP_SEED, MATCH_SIZE, clampQueueWait } from '../shared/constants.js';

const QUALITY_ORDER = ['low', 'medium', 'high', 'epic'];
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
    this.mapData = null;
    this.social = { friends: [], incoming: [], outgoing: [], blocked: [] };
    this.party = null;
    this.queue = null;
    this.isHost = false;
    this.hostStatus = null;
    this.autoLevel = 'high';
    this.fpsSamples = [];
    this.registered = false;
    this.applyGraphics();
    this.settings.onChange((k) => this.onSettingChanged(k));
    this.net.on((m) => this.onNet(m));
    this.net.onStatus((c) => this.onNetStatus(c));
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
    // Karte im Hintergrund vorbereiten, damit das erste Match schnell startet
    setTimeout(() => this.prepareMap().catch((e) => console.error(e)), 600);
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
    } else if (this.state !== 'loading') {
      this.lobbyScene.update(dt);
      this.ui.updateLobbyOverlay(dt);
      this.renderer.render();
    }
    this.ui.update(dt);
  }

  // ---------------- Grafik ----------------
  // alle Stufen mit 100 % 3D-Auflösung; Rendermodus „Leistung“ schaltet alles Teure ab
  effectiveGraphics() {
    const s = this.settings;
    if (s.get('renderMode') === 'performance') return { ...PERFORMANCE_MODE };
    if (s.get('quality') === 'auto') return { ...QUALITY_PRESETS[this.autoLevel] };
    return {
      resolution: 100, shadows: s.get('shadows'), viewDistance: s.get('viewDistance'),
      grass: s.get('grass'), antialias: s.get('antialias'), post: s.get('post'),
    };
  }

  applyGraphics() {
    const g = this.effectiveGraphics();
    this.renderer.apply(g);
    if (this.match) this.match.applySettings();
    this.graphics = g;
  }

  reportFps(fps) {
    if (this.settings.get('quality') !== 'auto' || this.settings.get('renderMode') === 'performance') return;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length < 10) return;
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.fpsSamples = [];
    const i = QUALITY_ORDER.indexOf(this.autoLevel);
    if (avg < 48 && i > 0) this.autoLevel = QUALITY_ORDER[i - 1];
    else if (avg > 110 && i < QUALITY_ORDER.length - 1) this.autoLevel = QUALITY_ORDER[i + 1];
    else return;
    this.applyGraphics();
  }

  onSettingChanged(k) {
    if (['renderMode', 'quality', 'shadows', 'viewDistance', 'grass', 'antialias', 'post'].includes(k)) this.applyGraphics();
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

  showWelcome() {
    this.state = 'welcome';
    this.cancelQueue();
    this.lobbyScene.setMembers([]);
    this.showMenuScene('welcome');
    this.ui.showWelcome();
  }

  // Name gewählt (Erststart)
  async finishWelcome(name) {
    this.profile.create(name);
    this.registered = false;
    if (this.net.connected) this.sendHello();
    this.audio.uiConfirm();
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
    this.net.send({ t: 'hello', id: p.id, name: p.name, profile: p.publicInfo() });
  }

  sendProfile() {
    if (this.net.connected && this.profile.hasName) this.net.send({ t: 'profile', profile: this.profile.publicInfo() });
  }

  onNet(m) {
    switch (m.t) {
      case 'welcome':
        this.registered = true;
        this.isHost = !!m.isHost;
        if (m.name && m.name !== this.profile.name) this.profile.set('name', m.name);
        this.profile.set('registered', true);
        this.ui.onRegistered();
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
        this.ui.onQueue();
        break;
      case 'matchStart':
        this.startNetMatch(m);
        break;
      case 'host':
        this.hostStatus = m.status;
        this.ui.onHostStatus();
        break;
      default:
        break;
    }
  }

  // ---------------- Karte / Welt ----------------
  async prepareMap(onProgress = null) {
    if (onProgress) this.mapProgressCb = onProgress;
    if (this.mapData) return this.mapData;
    if (this.mapPromise) return this.mapPromise;
    const report = (p) => this.mapProgressCb && this.mapProgressCb(p);
    this.mapPromise = (async () => {
      report(0.02);
      await nextFrame();
      const map = generateMap(MAP_SEED);
      report(0.25);
      await nextFrame();
      const world = new WorldView(map);
      await world.build((p) => report(0.25 + p * 0.55));
      const mapImage = renderMapImage(map, 1024);
      preloadItemIcons();
      report(0.9);
      this.mapData = { map, world, mapImage, nav: null };
      return this.mapData;
    })();
    return this.mapPromise;
  }

  ensureNav() {
    if (!this.mapData.nav) this.mapData.nav = new NavGrid(this.mapData.map.terrain, this.mapData.map.collision);
    return this.mapData.nav;
  }

  // ---------------- Warteschlange ----------------
  // BEREIT: mit Server → Warteschlange dort (Standard 15 s, einstellbar 10–120 s), danach Bots
  // für freie Plätze; ohne Server (Webseite) → dieselbe Wartezeit lokal, dann eine Bot-Lobby.
  ready() {
    if (this.queue) return;
    this.prepareMap().catch(() => {});
    const wait = clampQueueWait(this.settings.get('queueWait'));
    if (this.net.connected) {
      this.net.send({ t: 'queue', wait });
      return;
    }
    this.localQueue = { start: performance.now(), wait };
    this.queue = { state: 'waiting', secs: wait, wait, humans: 1, bots: MATCH_SIZE - 1, local: true };
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
    const data = await this.prepareMap((p) => this.ui.setLoading(p));
    this.ui.setLoading(0.92);
    await nextFrame();
    const nav = this.ensureNav();
    const prof = this.profile.data;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const rng = new RNG(seed);
    const me = { ...this.profile.publicInfo(), isBot: false };
    const champ = prof.soloChampion;
    const players = Simulation.fillWithBots([me], rng, champ ? { ...champ, isBot: true, crownStyle: 'gold' } : null);
    if (players.length !== MATCH_SIZE) throw new Error('Spielerzahl muss 12 sein');
    const map = data.map;
    const sim = new Simulation({ terrain: map.terrain, collision: map.collision, nav, pois: map.pois, chests: map.chests, floorLoot: map.floorLoot }, { seed, players });
    const session = new LocalSession(sim, me.id);
    this.beginMatch(session, 'solo');
  }

  async startNetMatch(m) {
    if (this.state === 'match' && this.match) this.disposeMatch();
    this.audio.stopLobbyMusic();
    this.state = 'loading';
    this.queue = null;
    this.ui.showLoading();
    const data = await this.prepareMap((p) => this.ui.setLoading(p));
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
    if (r.mode === 'solo') this.applySoloResult({ mine, results: r.results, winnerId: r.winnerId, players: r.players, silent: true });
    const xp = this.applyPersonalResult(mine);
    this.disposeMatch();
    this.state = 'results';
    this.showMenuScene('lobby');
    this.refreshLobbyMembers();
    this.ui.showResults({ mine, total: r.players.length, xp, winner: r.winner, youId: r.youId, onDone: () => this.enterLobby() });
  }

  // Vorzeitig zurück in die Lobby
  returnToLobby({ mine, mode, partial }) {
    if (mine && partial) this.applyPersonalResult({ ...mine, placement: mine.placement || 0 });
    this.disposeMatch();
    this.enterLobby();
  }

  applyPersonalResult(mine) {
    const r = { kills: mine.kills || 0, damage: mine.damage || 0, headshots: mine.headshots || 0, placement: mine.placement || 12, survival: mine.survival || 0 };
    this.profile.applyMatch(r);
    const xp = computeXp(r);
    xp.levelUps = this.profile.addXp(xp.total);
    xp.level = this.profile.data.stats.level;
    xp.progress = this.profile.data.stats.xp;
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

const app = new App();
window.__app = app;
app.start();

export default app;
export { THREE };
