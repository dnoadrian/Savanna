// Ein laufendes Match auf dem Client: verbindet Session, Welt, Figuren, Steuerung, HUD, Effekte, Audio.
import * as THREE from 'three';
import { Character } from '../render/characters.js';
import { Viewmodel } from '../render/viewmodel.js';
import { Effects } from '../render/effects.js';
import { StormWall } from '../render/storm.js';
import { Sky } from '../render/sky.js';
import { Lights, VIEW_DISTANCES } from '../render/renderer.js';
import { LocalPlayer, surfaceSound } from './controller.js';
import { F, MAX_HP } from '../../shared/constants.js';
import { MAT } from '../../shared/physics/collision.js';
import { dirFromAngles, rayPlayer } from '../../shared/sim/combat.js';
import { t } from '../i18n.js';

const FOG_COLOR = new THREE.Color(0xcfe8f5);
const STORM_FOG = new THREE.Color(0x9a6ad8);

export class MatchClient {
  constructor(app, { session, map, world, mapImage, mode }) {
    this.app = app;
    this.session = session;
    this.map = map;
    this.world = world;
    this.mode = mode; // 'solo' | 'party'
    this.t = t;
    this.infiniteAmmo = session.infiniteAmmo ?? true;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR.clone(), 120, 360);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 480);
    this.camera.rotation.order = 'YXZ';
    this.sky = new Sky();
    this.scene.add(this.sky.group);
    this.lights = new Lights(this.scene);
    this.sky.setSun(this.lights.sunDir);
    this.world.setSun(this.lights.sunDir);
    this.scene.add(world.group);
    this.storm = new StormWall();
    this.scene.add(this.storm.mesh);
    this.effects = new Effects(this.scene);
    this.effects.setTerrain(map.terrain);
    this.effects.onShellBounce = () => {};
    this.viewmodel = new Viewmodel();
    const prof = app.profile.data;
    this.viewmodel.setOutfit(prof.outfit, prof.color, prof.weaponSkin);
    this.viewmodel.equipT = 1;
    this.hud = app.hud;
    this.hud.reset();
    this.hud.setMapImage(mapImage, map.pois);
    this.hud.show();
    this.infoById = new Map(session.players.map((p) => [p.id, p]));
    this.chars = new Map();
    for (const p of session.players) {
      const c = new Character({ outfit: p.outfit, color: p.color, skin: p.skin, name: p.name, crown: p.streak > 0, crownStyle: p.crownStyle });
      this.scene.add(c.root);
      this.chars.set(p.id, c);
    }
    this.player = new LocalPlayer(this);
    this.player.spawn(session.spawn);
    this.state = 'alive';
    this.lastCount = null;
    this.hitBars = new Map();
    this.visCache = new Map();
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.fps = 60;
    this.stormWarned = -1;
    this.shrinkAnnounced = -1;
    this.spectateId = null;
    this.deathT = 0;
    this.ended = false;
    this.killedBy = null;
    this.placement = 0;
    this.remoteStep = new Map();
    this.onResize();
    this.resizeFn = () => this.onResize();
    window.addEventListener('resize', this.resizeFn);
    this.applySettings();
    this.unsubSettings = app.settings.onChange(() => this.applySettings());
    app.audio.stopLobbyMusic();
  }

  applySettings() {
    // effektive Grafikwerte (bei „Auto“ die automatisch gewählte Stufe)
    const g = this.app.effectiveGraphics();
    const vd = VIEW_DISTANCES[g.viewDistance] || VIEW_DISTANCES.far;
    this.camera.far = vd + 120;
    this.camera.updateProjectionMatrix();
    this.scene.fog.near = vd * 0.4;
    this.scene.fog.far = vd;
    this.world.setViewDistance(vd);
    this.lights.setQuality(g.shadows);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewmodel.resize(window.innerWidth, window.innerHeight);
  }

  get renderScenes() {
    const fp = this.state === 'alive' && !this.player.thirdPerson;
    this.viewmodel.scene.visible = fp;
    return { scene: this.scene, camera: this.camera, vmScene: this.viewmodel.scene, vmCamera: this.viewmodel.camera };
  }

  info(id) {
    return this.infoById.get(id) || { name: '?', isBot: false };
  }

  nameOf(id) {
    return this.info(id).name;
  }

  // ---------------- Hauptschleife ----------------
  update(dt, now) {
    const app = this.app;
    const input = app.input;
    const s = this.session;
    s.update(dt);
    const states = s.states();
    const phase = s.phase;
    const self = s.self();

    // FPS
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      app.reportFps && app.reportFps(this.fps);
    }

    // Countdown
    if (phase === 'countdown') {
      const n = Math.max(1, Math.ceil(s.countdown - 0.6));
      if (n !== this.lastCount && s.countdown > 0.6) {
        this.lastCount = n;
        this.hud.countdown(n);
        app.audio.beep(false);
      }
    }

    const menuOpen = app.ui.overlayOpen();
    if (this.state === 'alive') {
      if (!menuOpen && input.locked) this.player.update(dt, now, phase, states);
      else {
        input.consumeMouse();
        this.player.updateCamera(dt);
      }
    }

    // Ereignisse
    for (const e of s.drainEvents()) this.handleEvent(e, states);

    // Figuren
    const myId = s.youId;
    for (const st of states) {
      const c = this.chars.get(st.id);
      if (!c) continue;
      if (st.id === myId) {
        const tp = this.state !== 'alive' || this.player.thirdPerson;
        c.root.visible = tp;
        if (this.state === 'alive') {
          const b = this.player.body;
          c.root.position.set(b.x, b.y, b.z);
          c.update(dt, { vx: b.vx, vz: b.vz, yaw: this.player.yaw, pitch: this.player.pitch, flags: this.player.flags });
        } else {
          c.root.position.set(st.x, st.y, st.z);
          c.update(dt, { ...st, flags: F.DEAD });
        }
        continue;
      }
      c.root.position.set(st.x, st.y, st.z);
      const dx = st.x - this.camera.position.x, dz = st.z - this.camera.position.z;
      const d2 = dx * dx + dz * dz;
      c.root.visible = d2 < (this.world.viewDist + 50) ** 2;
      if (c.root.visible) c.update(d2 > 120 * 120 ? dt * 0.5 + 0.0001 : dt, st);
      // Schritte anderer Spieler (3D)
      if (st.alive && d2 < 30 * 30 && (st.flags & F.MOVING) && !(st.flags & F.AIR) && !(st.flags & F.SLIDE)) {
        let acc = (this.remoteStep.get(st.id) || 0) + Math.hypot(st.vx, st.vz) * dt;
        if (acc > 2.3) {
          acc = 0;
          const vol = st.flags & F.CROUCH ? 0.08 : st.flags & F.SPRINT ? 1 : 0.55;
          app.audio.footstep(surfaceSound(this.map, { x: st.x, z: st.z, waterDepth: 0, groundMat: MAT.TERRAIN }), vol, { x: st.x, y: st.y, z: st.z });
        }
        this.remoteStep.set(st.id, acc);
      }
    }

    // Tod / Zuschauen / Ende
    if (this.state === 'alive' && !self.alive) this.onDeath(null);
    if (this.state === 'dead' || this.state === 'spectate') this.updateDeadCamera(dt, states);
    if (!this.ended && (phase === 'ended' || (s.winnerId && !s.isLocal))) {
      if (s.isLocal || s.ended || s.winnerId) this.onMatchEnd();
    }

    // Viewmodel
    const pl = this.player;
    if (this.state === 'alive') {
      const w = pl.weapon;
      this.viewmodel.setSunFromWorld(this.lights.sunDir, this.camera);
      this.viewmodel.update({
        dt, time: now, ads: pl.adsK > 0.5, sprint: pl.body.sprinting, speed: Math.hypot(pl.body.vx, pl.body.vz), grounded: pl.body.grounded,
        slide: pl.body.stance === 'slide', reload01: w.reloading ? w.reloadT / w.reloadDur : -1, heal01: pl.healT >= 0 ? pl.healT : -1,
        lookDX: pl.lastLook.dx, lookDY: pl.lastLook.dy, fov: true,
      });
    }

    // Zone
    const zone = s.zone();
    const stormOn = s.zoneObj.enabled;
    this.storm.update(stormOn ? zone : null, dt, this.world.viewDist);
    const cp = this.camera.position;
    let inStorm = false;
    if (stormOn) {
      inStorm = Math.hypot(cp.x - zone.x, cp.z - zone.z) > zone.r;
      // Ansagen
      if (phase === 'playing' && !zone.shrinking && zone.timeLeft < 10 && zone.timeLeft > 8 && this.stormWarned !== zone.phase) {
        this.stormWarned = zone.phase;
        this.hud.message(t('stormWarn'), 'storm');
      }
      if (phase === 'playing' && zone.shrinking && this.shrinkAnnounced !== zone.phase) {
        this.shrinkAnnounced = zone.phase;
        this.hud.bigMessage(t('stormNow'), t('stormPhase', { n: zone.phase }), 'storm');
      }
    }
    const stormK = inStorm ? 1 : 0;
    this.stormK = (this.stormK || 0) + (stormK - (this.stormK || 0)) * Math.min(1, dt * 3);
    this.scene.fog.color.copy(FOG_COLOR).lerp(STORM_FOG, this.stormK * 0.7);
    this.sky.uniforms.uStorm.value = this.stormK;
    this.world.setFog(this.scene.fog.color, this.scene.fog.near, this.scene.fog.far, 0);
    app.renderer.setTint(1 + this.stormK * 0.05, 1 - this.stormK * 0.1, 1 + this.stormK * 0.12);

    // Welt, Himmel, Licht, Effekte
    this.world.update(this.camera, dt, now, app.settings.get('grass'));
    this.sky.update(this.camera, dt);
    this.lights.update(this.state === 'alive' ? { x: pl.body.x, y: pl.body.y, z: pl.body.z } : cp);
    this.effects.update(dt, this.camera.position);

    // Audio-Hörer
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    app.audio.setListener(cp, fwd, up);

    // HUD
    const alive = states.filter((q) => q.alive).length;
    const w = pl.weapon;
    const fl = pl.flags;
    const speed = Math.hypot(pl.body.vx, pl.body.vz);
    let progress = null, progressType = null;
    if (this.state === 'alive') {
      if (pl.healT >= 0) { progress = Math.min(1, pl.healT); progressType = 'heal'; }
      else if (w.reloading) { progress = w.reloadT / w.reloadDur; progressType = 'reload'; }
    }
    this.hud.update(dt, {
      hp: this.state === 'alive' ? self.hp : 0, medkits: self.medkits, mag: w.mag, reserve: w.reserve, alive, total: states.length, kills: self.kills,
      zone, stormOn, phase, inStorm: inStorm && this.state === 'alive', fps: this.fps, ping: s.isLocal ? null : s.ping,
      spread: this.state === 'alive' ? w.spread(fl, speed) : 0, overEnemy: pl.overEnemy, healing: pl.healT >= 0,
      progress, progressType, px: this.state === 'alive' ? pl.body.x : cp.x, pz: this.state === 'alive' ? pl.body.z : cp.z,
      yaw: this.state === 'alive' ? pl.yaw : this.camera.rotation.y, hideCross: this.state !== 'alive' || (pl.adsK > 0.6 && !pl.thirdPerson),
    });
    const W = window.innerWidth, H = window.innerHeight;
    this.hud.project(this.camera, W, H);
    this.updateNameTags(states, now, W, H);
    // Scoreboard / Karte
    if (!menuOpen) {
      const sb = input.isDown('scoreboard');
      if (sb || this.sbShown) this.hud.showScoreboard(sb, this.scoreRows(states));
      this.sbShown = sb;
      if (input.pressed('map')) this.hud.toggleBigMap(!this.hud.bigMapOpen);
    }
    // Zuschauer: Spieler wechseln
    if (this.state === 'spectate' && !menuOpen) {
      if (input.pressed('fire') || input.pressed('right') || app.input.pressedSet.has('ArrowRight')) this.cycleSpectate(1, states);
      if (input.pressed('ads') || input.pressed('left') || app.input.pressedSet.has('ArrowLeft')) this.cycleSpectate(-1, states);
    }
    input.endFrame();
  }

  scoreRows(states) {
    const sc = new Map(this.session.scores().map((r) => [r.id, r]));
    return this.session.players.map((p) => {
      const r = sc.get(p.id) || {};
      const st = states.find((q) => q.id === p.id);
      return {
        name: p.name, isBot: p.isBot, crown: p.streak > 0, streak: p.streak, me: p.id === this.session.youId,
        kills: r.kills || 0, damage: r.damage, alive: st ? st.alive : false, placement: r.placement || 0, ping: r.ping,
      };
    });
  }

  updateNameTags(states, now, W, H) {
    const cp = this.camera.position;
    const tags = [];
    for (const st of states) {
      if (st.id === this.session.youId || !st.alive) continue;
      const dx = st.x - cp.x, dz = st.z - cp.z;
      const dist = Math.hypot(dx, dz);
      const hb = this.hitBars.get(st.id);
      const showBar = hb && now - hb < 3;
      const spectated = this.state === 'spectate' && st.id === this.spectateId;
      if (dist > 70 && !showBar) continue;
      let vis = this.visCache.get(st.id);
      if (!vis || now - vis.t > 0.25) {
        vis = { t: now, v: this.map.collision.lineOfSight(cp.x, cp.y, cp.z, st.x, st.y + 1.7, st.z) };
        this.visCache.set(st.id, vis);
      }
      if (!vis.v && !spectated) continue;
      const info = this.info(st.id);
      tags.push({ id: st.id, name: info.name, x: st.x, y: st.y - (st.flags & F.CROUCH ? 0.5 : 0), z: st.z, hp: st.hp, showBar: showBar || spectated, crown: info.streak > 0, dist });
    }
    this.hud.updateTags(this.camera, W, H, tags);
  }

  // ---------------- Eigene Schüsse (sofortige Effekte) ----------------
  onLocalShot(eye, dir) {
    const col = this.map.collision;
    let tHit = col.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 400, true);
    let mat = tHit >= 0 ? col.hitOut.mat : -1;
    let n = new THREE.Vector3(col.hitOut.nx, col.hitOut.ny, col.hitOut.nz);
    if (tHit < 0) tHit = 400;
    // Wasser
    if (dir.y < 0) {
      const ex = eye.x + dir.x * tHit, ez = eye.z + dir.z * tHit;
      const wl = this.map.terrain.waterLevelAt(ex, ez);
      const tw = (wl - eye.y) / dir.y;
      if (tw > 0 && tw < tHit && this.map.terrain.heightAt(eye.x + dir.x * tw, eye.z + dir.z * tw) < wl) {
        tHit = tw; mat = MAT.WATER; n.set(0, 1, 0);
      }
    }
    let hitPlayer = false;
    for (const st of this.session.states()) {
      if (st.id === this.session.youId || !st.alive) continue;
      const r = rayPlayer(st, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, tHit);
      if (r) { tHit = r.t; hitPlayer = true; }
    }
    const end = new THREE.Vector3(eye.x + dir.x * tHit, eye.y + dir.y * tHit, eye.z + dir.z * tHit);
    const muzzle = new THREE.Vector3();
    if (this.player.thirdPerson) {
      const c = this.chars.get(this.session.youId);
      c.gun.updateWorldMatrix(true, false);
      muzzle.set(0, 0.036, -0.7).applyMatrix4(c.gun.matrixWorld);
      this.effects.muzzleFlash(muzzle, new THREE.Vector3(dir.x, dir.y, dir.z));
    } else {
      this.viewmodel.muzzleWorld(this.camera, muzzle);
    }
    this.effects.tracer(muzzle, end);
    this.effects.ownMuzzleLight(muzzle);
    if (hitPlayer) this.effects.blood(end);
    else if (mat >= 0) this.effects.impact(end, n, mat);
    // Hülse auswerfen
    const ej = new THREE.Vector3();
    if (!this.player.thirdPerson) this.viewmodel.ejectWorld(this.camera, ej);
    else ej.copy(muzzle);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.effects.shell(ej, new THREE.Vector3(dir.x, dir.y, dir.z), right);
  }

  // ---------------- Ereignisse ----------------
  handleEvent(e, states) {
    const app = this.app;
    const me = this.session.youId;
    switch (e.t) {
      case 'go':
        this.hud.countdown(0);
        app.audio.beep(true);
        setTimeout(() => this.hud.countdown(null), 900);
        break;
      case 'shot': {
        if (e.id === me) break;
        const o = new THREE.Vector3(e.o[0], e.o[1], e.o[2]);
        const end = new THREE.Vector3(e.e[0], e.e[1], e.e[2]);
        const dir = end.clone().sub(o).normalize();
        const c = this.chars.get(e.id);
        let muzzle = o.clone().addScaledVector(dir, 0.7);
        if (c && c.root.visible) {
          c.gun.updateWorldMatrix(true, false);
          muzzle = new THREE.Vector3(0, 0.036, -0.7).applyMatrix4(c.gun.matrixWorld);
        }
        const cp = this.camera.position;
        const dist = muzzle.distanceTo(cp);
        if (dist < this.world.viewDist) {
          this.effects.tracer(muzzle, end, true);
          this.effects.muzzleFlash(muzzle, dir);
          if (e.m === MAT.PLAYER) this.effects.blood(end);
          else if (e.m !== undefined && end.distanceTo(cp) < 120) this.effects.impact(end, e.n ? new THREE.Vector3(e.n[0], e.n[1], e.n[2]) : null, e.m);
        }
        app.audio.gunshot(muzzle, dist);
        // Kugel fliegt nah vorbei?
        const toCam = cp.clone().sub(o);
        const along = toCam.dot(dir);
        if (along > 5 && along < o.distanceTo(end)) {
          const closest = o.clone().addScaledVector(dir, along);
          if (closest.distanceTo(cp) < 2.5) app.audio.bulletWhiz(closest);
        }
        break;
      }
      case 'hit': {
        if (e.a === me && e.v !== me) {
          const head = e.p === 'h';
          const killing = e.hp <= 0;
          if (!killing) {
            this.hud.hitmarker(head, false);
            app.audio.hitmarker(head);
          }
          if (e.pos) this.hud.damageNumber(e.pos, e.d, head);
          this.hitBars.set(e.v, performance.now() / 1000);
        } else if (e.v !== me && e.a && e.a !== 'storm') {
          this.hitBars.set(e.v, this.hitBars.get(e.v) || 0);
        }
        if (e.v === me) {
          if (e.p === 's') {
            this.hud.flashDamage();
          } else if (e.d > 0) {
            this.hud.flashDamage();
            app.audio.hurt();
            if (e.from) this.hud.damageIndicator(e.from[0], e.from[1]);
          }
        }
        break;
      }
      case 'kill': {
        const ki = e.k ? this.info(e.k) : null;
        const vi = this.info(e.v);
        this.hud.killfeed({
          killer: ki ? ki.name : null, victim: vi.name, headshot: e.hs, cause: e.w,
          killerCrown: ki && ki.streak > 0, victimCrown: vi.streak > 0, killerMe: e.k === me, victimMe: e.v === me,
          killerBot: ki && ki.isBot, victimBot: vi.isBot,
        });
        if (e.k === me && e.v !== me) {
          this.hud.hitmarker(e.hs, true);
          app.audio.killConfirm();
          app.audio.elimination();
          this.hud.bigMessage(t('youKilled', { name: vi.name }), '+1 Medkit', 'kill');
        }
        const c = this.chars.get(e.v);
        if (c) {
          const kst = e.k ? states.find((q) => q.id === e.k) : null;
          c.killDir = kst ? Math.atan2(kst.x - c.root.position.x, kst.z - c.root.position.z) : 0;
        }
        if (e.v === me) this.onDeath(e);
        if (e.w === 'leave' && e.v !== me) this.hud.message(t('leftMatchNotice', { name: vi.name }));
        break;
      }
      case 'heal': {
        const st = states.find((q) => q.id === e.id);
        if (e.id === me) {
          this.hud.healFloat(e.amt);
          app.audio.healDone();
          this.player.onHealDone();
          if (st) this.effects.healBurst(new THREE.Vector3(this.player.body.x, this.player.body.y, this.player.body.z));
        } else if (st && Math.hypot(st.x - this.camera.position.x, st.z - this.camera.position.z) < 60) {
          this.effects.healBurst(new THREE.Vector3(st.x, st.y, st.z));
        }
        break;
      }
      case 'healCancel':
        if (e.id === me) this.player.healT = -1;
        break;
      case 'reload': {
        if (e.id === me) break;
        const st = states.find((q) => q.id === e.id);
        if (st && Math.hypot(st.x - this.camera.position.x, st.z - this.camera.position.z) < 30) app.audio.otherReload({ x: st.x, y: st.y + 1.2, z: st.z });
        break;
      }
      case 'win':
        break;
      default:
        break;
    }
  }

  // ---------------- Tod ----------------
  onDeath(e) {
    if (this.state !== 'alive') return;
    this.state = 'dead';
    this.deathT = 0;
    this.killedBy = e ? e.k : null;
    this.deathCause = e ? e.w : null;
    this.placement = e ? e.place : this.session.self().placement || 0;
    this.player.healT = -1;
    this.app.input.unlock();
    this.app.audio.defeat();
    this.deathPos = new THREE.Vector3(this.player.body.x, this.player.body.y, this.player.body.z);
    this.hud.showScoreboard(false);
    const text = this.killedBy ? t('eliminatedBy', { name: this.nameOf(this.killedBy) }) : this.deathCause === 'storm' ? t('eliminatedStorm') : t('eliminatedLeft');
    this.app.ui.showDeath({
      text,
      placement: this.placement,
      total: this.session.players.length,
      stats: this.session.self(),
      onSpectate: () => this.startSpectate(),
      onLobby: () => this.leaveToLobby(),
    });
  }

  startSpectate() {
    this.state = 'spectate';
    const states = this.session.states();
    const killer = this.killedBy && states.find((q) => q.id === this.killedBy && q.alive);
    this.spectateId = killer ? killer.id : (states.find((q) => q.alive && q.id !== this.session.youId) || {}).id;
    this.specYaw = 0;
    this.updateSpectateLabel();
  }

  cycleSpectate(dir, states) {
    const alive = states.filter((q) => q.alive && q.id !== this.session.youId);
    if (!alive.length) return;
    let i = alive.findIndex((q) => q.id === this.spectateId);
    i = (i + dir + alive.length) % alive.length;
    this.spectateId = alive[i].id;
    this.updateSpectateLabel();
  }

  updateSpectateLabel() {
    if (!this.spectateId) return this.hud.setSpectate(null);
    this.hud.setSpectate(`<b>${t('spectating', { name: this.nameOf(this.spectateId) })}</b><span>${t('prevPlayer')} · ${t('nextPlayer')}</span><button class="btn small" id="spec-lobby">${t('backToLobby')}</button>`);
    const b = document.getElementById('spec-lobby');
    if (b) b.onclick = () => this.leaveToLobby();
  }

  updateDeadCamera(dt, states) {
    this.deathT += dt;
    const cam = this.camera;
    if (this.state === 'dead') {
      // Todeskamera: langsam um die eigene Figur, Blick zum Killer
      const k = states.find((q) => q.id === this.killedBy);
      const a = this.deathT * 0.35;
      const p = this.deathPos;
      const r = 4 + Math.min(3, this.deathT * 1.2);
      cam.position.set(p.x + Math.sin(a) * r, p.y + 2.2 + Math.min(2, this.deathT), p.z + Math.cos(a) * r);
      const look = k && k.alive ? new THREE.Vector3(k.x, k.y + 1.2, k.z).lerp(p, 0.4) : p;
      cam.lookAt(look);
      cam.rotation.order = 'YXZ';
    } else if (this.state === 'spectate') {
      let tgt = states.find((q) => q.id === this.spectateId);
      if (!tgt || !tgt.alive) {
        this.cycleSpectate(1, states);
        tgt = states.find((q) => q.id === this.spectateId);
      }
      if (tgt) {
        const yaw = tgt.yaw;
        const back = 3.2;
        const px = tgt.x + Math.sin(yaw) * back + Math.cos(yaw) * 0.6;
        const pz = tgt.z + Math.cos(yaw) * back - Math.sin(yaw) * 0.6;
        const py = tgt.y + 2.1;
        cam.position.lerp(new THREE.Vector3(px, py, pz), Math.min(1, dt * 8));
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-0.12 + tgt.pitch * 0.5, yaw, 0);
      }
    }
    cam.updateMatrixWorld();
  }

  // ---------------- Ende ----------------
  onMatchEnd() {
    if (this.ended) return;
    const s = this.session;
    const winner = s.winnerId;
    if (!winner) return;
    this.ended = true;
    this.app.input.unlock();
    const me = s.youId;
    const mine = s.self();
    if (winner === me) {
      this.app.audio.victory();
      this.app.ui.showVictory({ stats: mine, time: s.matchTime, onContinue: () => this.finish() });
    } else {
      this.hud.bigMessage(t('winnerIs', { name: this.nameOf(winner) }), '', 'win');
      setTimeout(() => {
        if (this.disposed) return;
        this.app.ui.showMatchOver({ winner: this.nameOf(winner), onContinue: () => this.finish() });
      }, 2500);
    }
  }

  // Ergebnisse sammeln und zurück in die Lobby
  finish() {
    const s = this.session;
    let results = s.results();
    const finalize = (res, winnerId) => {
      const mine = res.find((r) => r.id === s.youId) || { kills: 0, damage: 0, headshots: 0, placement: 12, survival: 0 };
      const winnerInfo = this.info(winnerId);
      this.app.endMatch({ mode: this.mode, mine, results: res, winner: winnerInfo, winnerId, youId: s.youId, players: s.players });
    };
    if (results) finalize(results, s.winnerId);
    else {
      // Netz: auf Endergebnis warten
      const wait = () => {
        if (this.session.results()) finalize(this.session.results(), this.session.winnerId);
        else setTimeout(wait, 200);
      };
      wait();
    }
  }

  leaveToLobby() {
    const s = this.session;
    // Mehrspieler: Server immer informieren (auch als Zuschauer), damit man sofort wieder in die Warteschlange kann
    if (!s.isLocal) s.leave();
    else if (this.state === 'alive' && !this.ended) s.leave();
    if (s.isLocal && s.phase !== 'ended') {
      // Solo: Runde im Hintergrund fertig simulieren, damit der Sieger die Krone bekommt
      const mineNow = s.sim.stats(s.sim.byId.get(s.youId));
      this.app.ui.toast(t('finishingMatch'));
      s.finishInBackground((sim) => {
        const res = sim.players.map((p) => sim.stats(p));
        const mine = res.find((r) => r.id === s.youId) || mineNow;
        this.app.applySoloResult({ mine, results: res, winnerId: sim.winnerId, players: s.players, silent: true });
      });
      this.app.returnToLobby({ mine: mineNow, mode: 'solo', partial: true });
      return;
    }
    if (!s.isLocal && !this.ended) {
      this.app.returnToLobby({ mine: { ...s.self(), placement: this.placement || 0, survival: s.matchTime }, mode: 'party', partial: true });
      return;
    }
    this.finish();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.resizeFn);
    this.unsubSettings && this.unsubSettings();
    this.session.dispose();
    this.scene.remove(this.world.group);
    for (const c of this.chars.values()) c.dispose();
    this.hud.hide();
    this.hud.reset();
    this.app.renderer.setTint(1, 1, 1);
  }
}
