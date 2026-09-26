// Ein laufendes Match auf dem Client: verbindet Session, Welt, Beute, Figuren, Steuerung, HUD,
// Effekte und Audio.
import * as THREE from 'three';
import { Character } from '../render/characters.js';
import { Viewmodel } from '../render/viewmodel.js';
import { Effects } from '../render/effects.js';
import { StormWall } from '../render/storm.js';
import { Sky } from '../render/sky.js';
import { LootView } from '../render/lootView.js';
import { WEAPON_META } from '../render/weapons.js';
import { Lights, VIEW_DISTANCES } from '../render/renderer.js';
import { LocalPlayer, surfaceSound } from './controller.js';
import { F, SIPHON } from '../../shared/constants.js';
import { WEAPONS, CONSUMABLES, decodeItem } from '../../shared/items.js';
import { weaponSpread } from '../../shared/sim/weapon.js';
import { MAT } from '../../shared/physics/collision.js';
import { rayPlayer } from '../../shared/sim/combat.js';
import { t } from '../i18n.js';

const FOG_COLOR = new THREE.Color(0xbfe4f7);
const STORM_FOG = new THREE.Color(0x9a6ad8);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _up = new THREE.Vector3();

export class MatchClient {
  constructor(app, { session, map, world, mapImage, mode }) {
    this.app = app;
    this.session = session;
    this.map = map;
    this.world = world;
    this.mode = mode; // 'solo' | 'party'
    this.t = t;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR.clone(), 120, 360);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 480);
    this.camera.rotation.order = 'YXZ';
    this.sky = new Sky({ top: 0x2f8de6, horizon: 0xc4e6fa, bottom: 0xc4e6fa });
    this.scene.add(this.sky.group);
    this.lights = new Lights(this.scene);
    this.sky.setSun(this.lights.sunDir);
    this.world.setSun(this.lights.sunDir);
    this.scene.add(world.group);
    this.storm = new StormWall();
    this.scene.add(this.storm.mesh);
    this.effects = new Effects(this.scene);
    this.effects.setTerrain(map.terrain);
    this.lootView = new LootView(this.scene, session.loot);
    this.viewmodel = new Viewmodel();
    const prof = app.profile.data;
    this.viewmodel.setOutfit(prof.outfit, prof.color);
    this.hud = app.hud;
    this.hud.reset();
    this.hud.setMapImage(mapImage, map.pois);
    this.hud.show();
    this.infoById = new Map(session.players.map((p) => [p.id, p]));
    this.chars = new Map();
    for (const p of session.players) {
      const c = new Character({ outfit: p.outfit, color: p.color, name: p.name, crown: p.streak > 0, crownStyle: p.crownStyle });
      this.scene.add(c.root);
      this.chars.set(p.id, c);
    }
    this.hitboxes = null;
    this.player = new LocalPlayer(this);
    this.player.spawn(session.spawn);
    this.viewmodel.setItem(this.player.item);
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
    this.smokeT = 0;
    this.pendingAutoSelect = 0;
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
    this.scene.fog.near = vd * 0.45;
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
    const fp = this.state === 'alive' && !this.player.thirdPerson && !this.player.scoped;
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
        this.player.syncInventory();
        this.player.updateCamera(dt);
      }
    }

    // Ereignisse
    for (const e of s.drainEvents()) this.handleEvent(e, states);

    // Figuren
    const myId = s.youId;
    const cp = this.camera.position;
    for (const st of states) {
      const c = this.chars.get(st.id);
      if (!c) continue;
      if (st.id === myId) {
        const tp = this.state !== 'alive' || this.player.thirdPerson;
        c.root.visible = tp;
        if (this.state === 'alive') {
          const b = this.player.body;
          c.setHand(st.hand);
          c.root.position.set(b.x, b.y, b.z);
          if (tp) c.update(dt, { vx: b.vx, vz: b.vz, yaw: this.player.bodyYaw, pitch: this.player.pitch, flags: this.player.flags });
        } else {
          c.root.position.set(st.x, st.y, st.z);
          c.update(dt, { ...st, flags: F.DEAD });
        }
        continue;
      }
      c.root.position.set(st.x, st.y, st.z);
      const dx = st.x - cp.x, dz = st.z - cp.z;
      const d2 = dx * dx + dz * dz;
      c.root.visible = d2 < (this.world.viewDist + 50) ** 2;
      if (c.root.visible) {
        c.setHand(st.hand);
        c.update(d2 > 120 * 120 ? dt * 0.5 + 0.0001 : dt, st);
      }
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
    this.updateHitboxes(states);

    // Tod / Zuschauen / Ende
    if (this.state === 'alive' && !self.alive) this.onDeath(null);
    if (this.state === 'dead' || this.state === 'spectate') this.updateDeadCamera(dt, states);
    if (!this.ended && (phase === 'ended' || (s.winnerId && !s.isLocal))) {
      if (s.isLocal || s.ended || s.winnerId) this.onMatchEnd();
    }

    // Viewmodel
    const pl = this.player;
    const item = pl.item;
    const reload01 = this.state === 'alive' ? pl.reload01() : -1;
    const useDur = item && item.k === 'c' ? CONSUMABLES[item.c].use : 0;
    // Schilde/Medikits wirken sofort – kein Fortschrittsring
    const use01 = this.state === 'alive' && pl.useT >= 0 && useDur > 0 ? Math.min(1, pl.useT / useDur) : -1;
    if (this.state === 'alive') {
      this.viewmodel.setSunFromWorld(this.lights.sunDir, this.camera);
      this.viewmodel.update({
        dt, time: now, ads: pl.adsK > 0.5, scoped: pl.scoped, sprint: pl.body.sprinting, speed: Math.hypot(pl.body.vx, pl.body.vz), grounded: pl.body.grounded,
        slide: pl.body.stance === 'slide', reload01, use01, lookDX: pl.lastLook.dx, lookDY: pl.lastLook.dy, fov: true,
      });
    }

    // Zone
    const zone = s.zone();
    const stormOn = s.zoneObj.enabled;
    this.storm.update(stormOn ? zone : null, dt, this.world.viewDist);
    let inStorm = false;
    if (stormOn) {
      inStorm = Math.hypot(cp.x - zone.x, cp.z - zone.z) > zone.r;
    }
    const stormK = inStorm ? 1 : 0;
    this.stormK = (this.stormK || 0) + (stormK - (this.stormK || 0)) * Math.min(1, dt * 3);
    this.scene.fog.color.copy(FOG_COLOR).lerp(STORM_FOG, this.stormK * 0.7);
    this.sky.uniforms.uStorm.value = this.stormK;
    this.world.setFog(this.scene.fog.color, this.scene.fog.near, this.scene.fog.far, 0);
    app.renderer.setTint(1 + this.stormK * 0.05, 1 - this.stormK * 0.1, 1 + this.stormK * 0.12);

    // Kaminrauch
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.35;
      for (const sm of this.map.smoke) if (Math.hypot(sm.x - cp.x, sm.z - cp.z) < 160) this.effects.smoke(sm.x, sm.y, sm.z);
    }

    // Welt, Himmel, Licht, Effekte, Beute
    this.world.update(this.camera, dt, now, app.settings.get('grass'));
    this.sky.update(this.camera, dt);
    this.lights.update(this.state === 'alive' ? { x: pl.body.x, y: pl.body.y, z: pl.body.z } : cp);
    this.effects.update(dt, cp);
    this.lootView.update(dt, now, this.state === 'alive' ? pl.target : null, cp);

    // Audio-Hörer
    const fwd = _v.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const up = _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    app.audio.setListener(cp, fwd, up);
    // Summen der nächsten geschlossenen Truhe
    let hum = null, humD = 14;
    for (const c of s.loot.chests) {
      if (c.open) continue;
      const d = Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z);
      if (d < humD) { humD = d; hum = c; }
    }
    app.audio.chestHum(hum ? { x: hum.x, y: hum.y + 0.5, z: hum.z } : null, humD);

    // HUD
    const alive = states.filter((q) => q.alive).length;
    const def = pl.weaponDef;
    const speed = Math.hypot(pl.body.vx, pl.body.vz);
    const living = this.state === 'alive';
    this.hud.update(dt, {
      alive: living,
      health: living ? self.health : 0, shield: living ? self.shield : 0, overshield: living ? self.overshield : 0,
      stamina: pl.body.stamina, exhausted: pl.body.exhausted,
      inv: pl.inv, reloading: reload01 >= 0, reload01, use01, useItem: use01 >= 0 ? item : null,
      target: living ? pl.target : null,
      aliveCount: alive, total: states.length, kills: self.kills,
      zone, stormOn, phase, inStorm: inStorm && living, fps: this.fps, ping: s.isLocal ? null : s.ping,
      vfov: this.camera.fov, weapon: def ? item.w : null, spread: living && def ? weaponSpread(pl.rt, item, pl.flags, speed) : 0,
      overEnemy: pl.overEnemy, scoped: living && pl.scoped,
      px: living ? pl.body.x : cp.x, pz: living ? pl.body.z : cp.z,
      yaw: living ? pl.yaw : this.camera.rotation.y, hideCross: !living || pl.scoped,
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

  // Admin: rotes Skelett-ESP aller Gegner (durch Wände sichtbar) – folgt den animierten Figuren
  updateHitboxes(states) {
    const on = this.app.admin && this.app.admin.active('esp');
    if (!on) {
      if (this.esp) this.esp.lines.visible = false;
      return;
    }
    if (!this.esp) {
      const MAX = 12 * 16 * 2;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff2020, depthTest: false, transparent: true, opacity: 0.95, fog: false }));
      lines.frustumCulled = false;
      lines.renderOrder = 30;
      this.scene.add(lines);
      this.esp = { lines, pos: geo.attributes.position, v: Array.from({ length: 16 }, () => new THREE.Vector3()) };
    }
    const E = this.esp;
    E.lines.visible = true;
    const arr = E.pos.array;
    let n = 0;
    const seg = (a, b) => {
      arr[n++] = a.x; arr[n++] = a.y; arr[n++] = a.z;
      arr[n++] = b.x; arr[n++] = b.y; arr[n++] = b.z;
    };
    const w = (obj, x, y, z, out) => { obj.updateWorldMatrix(true, false); return out.set(x, y, z).applyMatrix4(obj.matrixWorld); };
    for (const st of states) {
      if (st.id === this.session.youId || !st.alive) continue;
      const c = this.chars.get(st.id);
      if (!c || !c.root.visible) continue;
      const [head, neck, pelvis, sL, sR, eL, eR, hL, hR, hipL, hipR, kL, kR, fL, fR, crown] = E.v;
      w(c.head, 0, 0.18, 0, head);
      w(c.head, 0, 0.42, 0, crown);
      w(c.torso, 0, 0.55, 0, neck);
      w(c.hips, 0, 0, 0, pelvis);
      const [aL, aR] = c.arms[0].side < 0 ? [c.arms[0], c.arms[1]] : [c.arms[1], c.arms[0]];
      w(aL.upper, 0, 0, 0, sL); w(aR.upper, 0, 0, 0, sR);
      w(aL.lower, 0, 0, 0, eL); w(aR.lower, 0, 0, 0, eR);
      w(aL.lower, 0, -0.32, 0, hL); w(aR.lower, 0, -0.32, 0, hR);
      const [lL, lR] = c.legs[0].side < 0 ? [c.legs[0], c.legs[1]] : [c.legs[1], c.legs[0]];
      w(lL.upper, 0, 0, 0, hipL); w(lR.upper, 0, 0, 0, hipR);
      w(lL.knee, 0, 0, 0, kL); w(lR.knee, 0, 0, 0, kR);
      w(lL.knee, 0, -0.45, 0, fL); w(lR.knee, 0, -0.45, 0, fR);
      seg(crown, head); seg(head, neck); seg(neck, pelvis);
      seg(neck, sL); seg(sL, eL); seg(eL, hL);
      seg(neck, sR); seg(sR, eR); seg(eR, hR);
      seg(pelvis, hipL); seg(hipL, kL); seg(kL, fL);
      seg(pelvis, hipR); seg(hipR, kR); seg(kR, fR);
    }
    E.pos.needsUpdate = true;
    E.lines.geometry.setDrawRange(0, n / 3);
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
      tags.push({
        id: st.id, name: info.name, x: st.x, y: st.y - (st.flags & F.CROUCH ? 0.5 : 0), z: st.z,
        health: st.health, shield: st.shield + st.overshield, showBar: showBar || spectated, crown: info.streak > 0, dist,
      });
    }
    this.hud.updateTags(this.camera, W, H, tags);
  }

  // Mündung einer Figur (3. Person) in Weltkoordinaten
  charMuzzle(c, type, out) {
    const meta = WEAPON_META[type] || WEAPON_META.ar;
    c.gun.updateWorldMatrix(true, false);
    return out.set(meta.muzzle[0], meta.muzzle[1], meta.muzzle[2]).applyMatrix4(c.gun.matrixWorld);
  }

  // ---------------- Eigene Schüsse (sofortige Effekte) ----------------
  onLocalShot(eye, dirs, item, wall = false) {
    const def = WEAPONS[item.w];
    const col = this.map.collision;
    const states = this.session.states();
    const muzzle = new THREE.Vector3();
    if (this.player.thirdPerson) this.charMuzzle(this.chars.get(this.session.youId), item.w, muzzle);
    else this.viewmodel.muzzleWorld(this.camera, muzzle);
    const first = dirs[0];
    if (this.player.thirdPerson) this.effects.muzzleFlash(muzzle, _v.set(first.x, first.y, first.z));
    this.effects.ownMuzzleLight(muzzle);
    const pellets = dirs.length > 1;
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      let tHit = wall ? -1 : col.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, def.range, true, true);
      let mat = tHit >= 0 ? col.hitOut.mat : -1;
      const n = new THREE.Vector3(col.hitOut.nx, col.hitOut.ny, col.hitOut.nz);
      if (tHit < 0) tHit = def.range;
      // Wasser
      if (dir.y < 0) {
        const tw = (0 - eye.y) / dir.y;
        if (tw > 0 && tw < tHit && this.map.terrain.heightAt(eye.x + dir.x * tw, eye.z + dir.z * tw) < 0) {
          tHit = tw; mat = MAT.WATER; n.set(0, 1, 0);
        }
      }
      let hitPlayer = false;
      for (const st of states) {
        if (st.id === this.session.youId || !st.alive) continue;
        const r = rayPlayer(st, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, tHit);
        if (r) { tHit = r.t; hitPlayer = true; }
      }
      const end = new THREE.Vector3(eye.x + dir.x * tHit, eye.y + dir.y * tHit, eye.z + dir.z * tHit);
      // Schrot: nur jede zweite Kugel mit Leuchtspur, dünner
      if (!pellets || i % 2 === 0) this.effects.tracer(muzzle, end, false, pellets ? 0.6 : def.scope ? 1.8 : 1, def.scope ? 2400 : 1500);
      if (hitPlayer) this.effects.blood(end);
      else if (mat >= 0 && (!pellets || i < 6)) this.effects.impact(end, n, mat);
    }
    // Hülse (Pump/Sniper werfen sie beim Repetieren aus – optisch reicht der Moment des Schusses)
    const ej = new THREE.Vector3();
    if (!this.player.thirdPerson) this.viewmodel.ejectWorld(this.camera, ej);
    else ej.copy(muzzle);
    const right = _v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.effects.shell(ej, _v.set(first.x, first.y, first.z), right, pellets ? 2.2 : def.scope ? 1.8 : item.w === 'pistol' ? 0.9 : 1);
  }

  // ---------------- Ereignisse ----------------
  handleEvent(e, states) {
    const app = this.app;
    const me = this.session.youId;
    const cp = this.camera.position;
    switch (e.t) {
      case 'go':
        this.hud.countdown(0);
        app.audio.beep(true);
        setTimeout(() => this.hud.countdown(null), 900);
        break;
      case 'shot': {
        if (e.id === me) break;
        const o = new THREE.Vector3(e.o[0], e.o[1], e.o[2]);
        const first = e.e[0];
        const end0 = new THREE.Vector3(first[0], first[1], first[2]);
        const dir = end0.clone().sub(o).normalize();
        const c = this.chars.get(e.id);
        let muzzle = o.clone().addScaledVector(dir, 0.7);
        if (c && c.root.visible && c.gun.visible) muzzle = this.charMuzzle(c, e.w, new THREE.Vector3());
        const dist = muzzle.distanceTo(cp);
        const pellets = e.e.length > 1;
        if (dist < this.world.viewDist) {
          this.effects.muzzleFlash(muzzle, dir);
          e.e.forEach((en, i) => {
            const end = new THREE.Vector3(en[0], en[1], en[2]);
            if (!pellets || i % 3 === 0) this.effects.tracer(muzzle, end, true, pellets ? 0.6 : 1);
            if (en[3] === MAT.PLAYER) this.effects.blood(end);
            else if (en[3] >= 0 && (!pellets || i < 4) && end.distanceTo(cp) < 90) this.effects.impact(end, null, en[3]);
          });
        }
        app.audio.gunshot(muzzle, dist, e.w);
        // Kugel fliegt nah vorbei?
        const toCam = cp.clone().sub(o);
        const along = toCam.dot(dir);
        if (along > 5 && along < o.distanceTo(end0)) {
          const closest = o.clone().addScaledVector(dir, along);
          if (closest.distanceTo(cp) < 2.5) app.audio.bulletWhiz(closest);
        }
        break;
      }
      case 'hit': {
        const vst = states.find((q) => q.id === e.v);
        if (e.a === me && e.v !== me) {
          const head = e.p === 'h';
          const killing = e.hp <= 0;
          const shieldHit = e.sd > 0;
          if (!killing) {
            this.hud.hitmarker(head, false, shieldHit);
            app.audio.hitmarker(head, shieldHit);
          }
          if (e.pos) {
            this.hud.damageNumber(e.pos, e.d, head ? 'head' : shieldHit ? 'shield' : 'health');
            if (shieldHit) this.effects.shieldHit(_v.set(e.pos[0], e.pos[1], e.pos[2]));
          }
          if (e.br && vst) {
            this.effects.shieldBreak(_v.set(vst.x, vst.y + 0.9, vst.z));
            app.audio.shieldBreak(null, true);
            this.hud.shieldBroken();
          }
          this.hitBars.set(e.v, performance.now() / 1000);
        } else if (e.v !== me && e.a && e.a !== 'storm') {
          this.hitBars.set(e.v, this.hitBars.get(e.v) || 0);
          if (e.br && vst && Math.hypot(vst.x - cp.x, vst.z - cp.z) < 60) this.effects.shieldBreak(_v.set(vst.x, vst.y + 0.9, vst.z));
        }
        if (e.v === me) {
          this.hud.flashDamage(e.sd > 0 && e.d - e.sd <= 0);
          if (e.a === 'storm') app.audio.hurt(0.4);
          else if (e.d > 0) {
            if (e.sd > 0) app.audio.shieldHurt(); else app.audio.hurt();
            if (e.from) this.hud.damageIndicator(e.from[0], e.from[1]);
          }
          if (e.br) app.audio.shieldBreak(null);
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
        }
        const c = this.chars.get(e.v);
        if (c) {
          const kst = e.k ? states.find((q) => q.id === e.k) : null;
          c.killDir = kst ? Math.atan2(kst.x - c.root.position.x, kst.z - c.root.position.z) : 0;
        }
        if (e.v === me) this.onDeath(e);
        break;
      }
      case 'siphon': {
        if (e.id === me) {
          this.hud.siphon(SIPHON);
          app.audio.siphon();
          this.effects.siphon(_v.set(this.player.body.x, this.player.body.y, this.player.body.z), !this.player.thirdPerson);
        }
        break;
      }
      case 'chest': {
        const ch = this.session.loot.chest(e.id);
        if (ch) {
          this.effects.chestBurst(_v.set(ch.x, ch.y, ch.z));
          if (e.by !== me) app.audio.chestOpen({ x: ch.x, y: ch.y + 0.5, z: ch.z });
        }
        break;
      }
      case 'loot':
        for (const a of e.a) if (a[5] !== undefined && a[5] !== null) this.lootView.spawnArc(a[0], a[5], a[6], a[7]);
        break;
      case 'pick': {
        if (e.id === me) {
          const it = decodeItem(e.it);
          app.audio.pickup(it);
          if (it.k !== 'a' && !this.player.item) this.pendingAutoSelect = performance.now();
        }
        break;
      }
      case 'useStart': {
        if (e.id === me) break;
        const st = states.find((q) => q.id === e.id);
        if (st && Math.hypot(st.x - cp.x, st.z - cp.z) < 35) app.audio.useStart(e.c, { x: st.x, y: st.y + 1.2, z: st.z });
        break;
      }
      case 'used': {
        const st = states.find((q) => q.id === e.id);
        const shield = !CONSUMABLES[e.c].heal;
        if (e.id === me) {
          this.player.onUseDone();
          if (!(performance.now() - (this.player.instantUseT || 0) < 1500)) app.audio.useDone(e.c);
          this.effects[shield ? 'siphon' : 'healBurst'](_v.set(this.player.body.x, this.player.body.y, this.player.body.z), !this.player.thirdPerson);
        } else if (st && Math.hypot(st.x - cp.x, st.z - cp.z) < 60) {
          this.effects.healBurst(_v.set(st.x, st.y, st.z));
        }
        break;
      }
      case 'useCancel':
        if (e.id === me) this.player.useT = -1;
        break;
      case 'reload': {
        if (e.id === me) break;
        const st = states.find((q) => q.id === e.id);
        if (st && Math.hypot(st.x - cp.x, st.z - cp.z) < 30) app.audio.otherReload({ x: st.x, y: st.y + 1.2, z: st.z });
        break;
      }
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
    this.player.useT = -1;
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
        cam.position.lerp(_v.set(px, py, pz), Math.min(1, dt * 8));
        cam.rotation.order = 'YXZ';
        cam.rotation.set(-0.12 + tgt.pitch * 0.5, yaw, 0);
      }
    }
    if (Math.abs(cam.fov - 58.7) > 0.01) {
      cam.fov = 58.7;
      cam.updateProjectionMatrix();
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
    const results = s.results();
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
      const mineNow = s.sim.stats(s.sim.byId.get(s.youId));
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
    this.lootView.dispose();
    this.app.audio.chestHum(null);
    for (const c of this.chars.values()) c.dispose();
    this.hud.hide();
    this.hud.reset();
    this.app.renderer.setTint(1, 1, 1);
  }
}
