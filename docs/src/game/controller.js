// Lokaler Spieler: Eingabe → gemeinsame Bewegungsphysik, Kamera (Ego/Schulter), Waffe
// (Vollautomatik, Rückstoß, Streuung, Nachladen nur per Taste), Medkit, Slide, Schritte, Atmen.
import * as THREE from 'three';
import { createBody, stepMovement, bodyFlags, eyeHeight } from '../../shared/sim/movement.js';
import { WeaponState } from '../../shared/sim/weapon.js';
import { applySpread, dirFromAngles, rayPlayer } from '../../shared/sim/combat.js';
import { F, WEAPON, MAX_HP, MEDKIT_TIME, CLIENT_SEND_HZ } from '../../shared/constants.js';
import { MAT } from '../../shared/physics/collision.js';
import { SURF } from '../../shared/map/terrain.js';
import { AimAssist } from './aimassist.js';

const DEG = Math.PI / 180;
const BASE_SENS = 0.0021;

export function surfaceSound(map, body) {
  if (body.waterDepth > 0.15) return 'water';
  switch (body.groundMat) {
    case MAT.WOOD: case MAT.CLOTH: return 'wood';
    case MAT.METAL: return 'metal';
    case MAT.STONE: case MAT.BONE: return 'stone';
    case MAT.WATER: return 'water';
    default: break;
  }
  const s = map.terrain.surfaceAt(body.x, body.z);
  if (s === SURF.GRASS || s === SURF.DRYGRASS) return 'grass';
  if (s === SURF.ROCK) return 'stone';
  return 'sand';
}

export class LocalPlayer {
  constructor(game) {
    this.game = game;
    this.map = game.map;
    this.settings = game.app.settings;
    this.input = game.app.input;
    this.audio = game.app.audio;
    this.camera = game.camera;
    this.body = createBody();
    this.yaw = 0;
    this.pitch = 0;
    this.weapon = new WeaponState(game.infiniteAmmo);
    this.aim = new AimAssist(this.map.collision);
    this.sprintToggle = false;
    this.crouchToggle = false;
    this.adsK = 0;
    this.ads = false;
    this.wasAds = false;
    this.healT = -1;
    this.healWait = 0;
    this.recoilAcc = 0;
    this.sinceShot = 10;
    this.sprintBlockT = 0;
    this.stepAcc = 0;
    this.sprintTime = 0;
    this.breathT = 0;
    this.camY = null;
    this.landDip = 0;
    this.bobPhase = 0;
    this.roll = 0;
    this.fovCur = 90;
    this.thirdPerson = false;
    this.sendAcc = 0;
    this.dryFired = false;
    this.lastLook = { dx: 0, dy: 0 };
    this.overEnemy = false;
    this.flags = 0;
    this.shotsFired = 0;
    this.tmpV = new THREE.Vector3();
    this.tmpV2 = new THREE.Vector3();
  }

  spawn(sp) {
    Object.assign(this.body, createBody(sp.x, sp.y, sp.z));
    this.yaw = sp.yaw;
    this.pitch = 0;
    this.camY = null;
  }

  get eye() {
    return this.body.y + eyeHeight(this.body);
  }

  startHeal() {
    const g = this.game;
    const self = g.session.self();
    if (this.healT >= 0 || !self.alive) return;
    if (self.hp >= MAX_HP) {
      g.hud.message(g.t('fullHealth'), 'warn');
      this.audio.denied();
      return;
    }
    if (self.medkits <= 0) {
      g.hud.message(g.t('noMedkits'), 'warn');
      this.audio.denied();
      return;
    }
    if (this.weapon.reloading) {
      this.weapon.cancelReload();
      g.session.cancelReload();
    }
    this.healT = 0;
    this.healWait = 0;
    g.session.heal();
    this.audio.healStart();
  }

  cancelHeal() {
    if (this.healT < 0) return;
    this.healT = -1;
    this.game.session.cancelHeal();
  }

  onHealDone() {
    this.healT = -1;
  }

  update(dt, now, phase, states) {
    const g = this.game;
    const input = this.input;
    const s = this.settings;
    const b = this.body;
    const playing = phase === 'playing';
    const selfInfo = g.session.self();
    b.frozen = !playing;

    // ---- Blick ----
    const m = input.consumeMouse();
    this.lastLook = m;
    const adsSens = this.adsK > 0.5 ? s.get('adsSens') : 1;
    let sensMul = 1;
    const camPos = this.camera.position;
    const engaged = this.ads || (input.isDown('fire') && this.weapon.mag > 0);
    const aa = this.aim.update(playing ? s.get('aimAssist') : 'off', camPos, this.yaw, this.pitch, states, g.session.youId, dt, now, this.ads && !this.wasAds, engaged);
    sensMul = aa.sensMul;
    this.wasAds = this.ads;
    const fovScale = this.fovCur / 90;
    const yawD = m.dx * BASE_SENS * s.get('sensX') * adsSens * sensMul * fovScale;
    let pitchD = m.dy * BASE_SENS * s.get('sensY') * adsSens * sensMul * fovScale * (s.get('invertY') ? -1 : 1);
    this.yaw -= yawD;
    this.pitch -= pitchD;
    if (pitchD > 0 && this.recoilAcc > 0) this.recoilAcc = Math.max(0, this.recoilAcc - pitchD);
    this.yaw += aa.addYaw;
    this.pitch += aa.addPitch;
    // Rückstoß erholt sich
    this.sinceShot += dt;
    if (this.sinceShot > 0.12 && this.recoilAcc > 0) {
      const rec = Math.min(this.recoilAcc, dt * 7 * DEG * (1 + this.recoilAcc / (6 * DEG)));
      this.pitch -= rec;
      this.recoilAcc -= rec;
    }
    this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch));

    // ---- Haltung ----
    const moveX = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    const moveZ = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const moving = moveX !== 0 || moveZ !== 0;
    if (s.get('sprintMode') === 'toggle') {
      if (input.pressed('sprint')) this.sprintToggle = !this.sprintToggle;
      if (!moving) this.sprintToggle = false;
    }
    let sprintWanted = s.get('sprintMode') === 'toggle' ? this.sprintToggle : input.isDown('sprint');
    const crouchPressed = input.pressed('crouch');
    let crouchWanted;
    if (s.get('crouchMode') === 'toggle') {
      if (crouchPressed && !b.sprinting) this.crouchToggle = !this.crouchToggle;
      if (sprintWanted && moving && crouchPressed) this.crouchToggle = false;
      crouchWanted = this.crouchToggle;
    } else crouchWanted = input.isDown('crouch');

    const firing = input.isDown('fire') && playing && selfInfo.alive;
    // Schießen bricht Sprint ab
    if (firing) {
      this.sprintBlockT = 0.35;
      if (s.get('sprintMode') === 'toggle') this.sprintToggle = false;
    }
    this.sprintBlockT -= dt;
    if (this.sprintBlockT > 0) sprintWanted = false;
    if (this.healT >= 0) sprintWanted = false;

    this.ads = input.isDown('ads') && !b.sprinting && this.healT < 0 && selfInfo.alive;
    this.adsK += ((this.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);

    const inp = {
      mx: moveX, mz: moveZ, yaw: this.yaw,
      jump: input.pressed('jump') && playing,
      sprint: sprintWanted && playing,
      crouch: crouchWanted,
      crouchPressed,
      ads: this.adsK > 0.5,
      healing: this.healT >= 0,
    };
    const prevGrounded = b.grounded;
    stepMovement(b, inp, dt, this.map);

    // ---- Bewegungs-Ereignisse ----
    if (b.jumped) this.audio.jump();
    if (b.landed > 0) {
      const k = Math.min(1, b.landed / 12);
      this.landDip = Math.min(0.35, this.landDip + 0.06 + k * 0.25);
      this.audio.land(0.4 + k);
      if (k > 0.3) g.effects.dust(this.tmpV.set(b.x, b.y, b.z), 5);
      g.viewmodel.land = Math.min(1, 0.3 + k);
      if (b.waterDepth > 0.2) g.effects.splash(this.tmpV.set(b.x, b.y + b.waterDepth, b.z), 10);
    }
    if (b.slideStarted) {
      this.audio.slide();
      g.effects.dust(this.tmpV.set(b.x, b.y, b.z), 8);
    }
    if (b.stance === 'slide' && Math.random() < dt * 25) g.effects.dust(this.tmpV.set(b.x, b.y, b.z), 1);
    // Schritte
    const hs = Math.hypot(b.vx, b.vz);
    if (b.grounded && hs > 0.8 && b.stance !== 'slide') {
      this.stepAcc += hs * dt;
      const stride = b.sprinting ? 2.7 : b.stance === 'crouch' ? 1.5 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const vol = b.stance === 'crouch' ? 0.1 : b.sprinting ? 1.0 : 0.6;
        this.audio.footstep(surfaceSound(this.map, b), vol);
        if (b.waterDepth > 0.2) g.effects.splash(this.tmpV.set(b.x, b.y + b.waterDepth, b.z), 3);
      }
    } else if (!prevGrounded) this.stepAcc = 1;
    // Atmen nach langem Sprint
    if (b.sprinting) this.sprintTime += dt;
    else this.sprintTime = Math.max(0, this.sprintTime - dt * 1.5);
    if (this.sprintTime > 4) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = 1.15;
        this.audio.breath();
      }
    }

    // ---- Waffe ----
    const w = this.weapon;
    if (w.update(dt)) g.hud.flashAmmo();
    if (b.sprinting && w.reloading) {
      w.cancelReload();
      g.session.cancelReload();
    }
    // Nachladen nur manuell (kein automatisches Nachladen bei leerem Magazin)
    if (input.pressed('reload') && w.canReload() && selfInfo.alive && !b.sprinting && this.healT < 0) this.startReload();
    if (input.pressed('slot1') && this.healT >= 0) this.cancelHeal();
    if (input.pressed('heal') || input.pressed('slot2')) this.startHeal();

    if (firing && !b.sprinting) {
      if (this.healT >= 0) this.cancelHeal();
      if (w.mag <= 0 && !w.reloading) {
        if (!this.dryFired) {
          this.audio.dryFire();
          this.dryFired = true;
        }
      } else {
        // bei niedriger Framerate mehrere Schüsse pro Frame, damit die Feuerrate stimmt
        let n = 0;
        while (w.canFire() && n < 3) {
          if (!w.fire()) break;
          this.shoot(states);
          n++;
        }
      }
    }
    if (!input.isDown('fire')) this.dryFired = false;

    // ---- Heilen ----
    if (this.healT >= 0) {
      this.healT += dt;
      if (this.healT > MEDKIT_TIME + 1.2) this.healT = -1; // keine Server-Antwort
    }

    // ---- Perspektive ----
    if (input.pressed('view')) this.thirdPerson = !this.thirdPerson;

    // ---- Flags + Senden ----
    let extra = 0;
    if (this.adsK > 0.5) extra |= F.ADS;
    if (w.reloading) extra |= F.RELOAD;
    if (this.healT >= 0) extra |= F.HEAL;
    if (this.sinceShot < 0.15) extra |= F.FIRING;
    this.flags = bodyFlags(b, extra);
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / CLIENT_SEND_HZ) {
      this.sendAcc = 0;
      g.session.sendState({
        x: b.x, y: b.y, z: b.z, yaw: this.yaw, pitch: this.pitch, flags: this.flags, vx: b.vx, vz: b.vz,
      });
    }

    // ---- Fadenkreuz über Gegner? ----
    this.overEnemy = this.checkOverEnemy(states);
    this.updateCamera(dt);
  }

  startReload() {
    const w = this.weapon;
    const empty = w.mag === 0;
    if (w.startReload()) {
      this.game.session.reload();
      this.audio.reloadSounds(w.reloadDur, empty);
    }
  }

  shoot(states) {
    const g = this.game;
    const b = this.body;
    this.sinceShot = 0;
    this.shotsFired++;
    const eye = this.tmpV.set(b.x, this.eye, b.z);
    let dir = dirFromAngles(this.yaw, this.pitch);
    if (this.thirdPerson) {
      // durch das Fadenkreuz zielen: Zielpunkt von der Kamera aus bestimmen
      const cam = this.camera.position;
      const cd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      let t = this.map.collision.raycast(cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, WEAPON.range, true);
      if (t < 0) t = WEAPON.range;
      for (const s of states) {
        if (s.id === g.session.youId || !s.alive) continue;
        const r = rayPlayer(s, cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, t);
        if (r) t = r.t;
      }
      const tp = cam.clone().addScaledVector(cd, t);
      const d = tp.sub(eye).normalize();
      dir = { x: d.x, y: d.y, z: d.z };
    }
    const speed = Math.hypot(b.vx, b.vz);
    const spread = this.weapon.spread(bodyFlags(b, this.adsK > 0.5 ? F.ADS : 0), speed);
    dir = applySpread(dir, spread, Math.random);
    g.session.fire({ ox: eye.x, oy: eye.y, oz: eye.z, dx: dir.x, dy: dir.y, dz: dir.z });
    g.onLocalShot(eye.clone(), dir);
    // Rückstoß (beherrschbares Muster)
    const n = this.weapon.burst;
    const adsMul = this.adsK > 0.5 ? 0.7 : 1;
    const crMul = b.stance !== 'stand' ? 0.85 : 1;
    const up = WEAPON.recoilUp * (n <= 3 ? 0.65 : 1) * adsMul * crMul * DEG;
    const side = (Math.random() - 0.4) * 2 * WEAPON.recoilSide * adsMul * DEG;
    this.pitch += up;
    this.recoilAcc += up;
    this.yaw -= side;
    this.game.viewmodel.fire();
    this.audio.gunshot(null);
  }

  checkOverEnemy(states) {
    const cam = this.camera.position;
    const cd = this.tmpV2.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let best = 200;
    let hit = false;
    for (const s of states) {
      if (s.id === this.game.session.youId || !s.alive) continue;
      const dx = s.x - cam.x, dz = s.z - cam.z;
      if (dx * dx + dz * dz > 200 * 200) continue;
      const r = rayPlayer(s, cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, best);
      if (r) { best = r.t; hit = true; }
    }
    if (!hit) return false;
    const t = this.map.collision.raycast(cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, best, true);
    return t < 0;
  }

  updateCamera(dt) {
    const b = this.body;
    const s = this.settings;
    const cam = this.camera;
    const targetY = b.y + eyeHeight(b);
    if (this.camY === null) this.camY = targetY;
    // Treppen/Stufen weich
    if (targetY > this.camY && b.grounded) this.camY += (targetY - this.camY) * Math.min(1, dt * 14);
    else if (b.stance !== 'stand' && targetY < this.camY && b.grounded) this.camY += (targetY - this.camY) * Math.min(1, dt * 14);
    else this.camY = targetY;
    this.landDip = Math.max(0, this.landDip - dt * 1.4);
    const dip = Math.sin(Math.min(1, this.landDip / 0.35) * Math.PI * 0.5) * this.landDip;
    // Kopfwippen
    const hs = Math.hypot(b.vx, b.vz);
    let bobY = 0, bobX = 0;
    if (s.get('headBob') && b.grounded && hs > 0.8 && b.stance !== 'slide') {
      this.bobPhase += dt * hs * (b.sprinting ? 1.55 : 1.9);
      const amp = Math.min(1, hs / 6) * (b.sprinting ? 0.055 : 0.035) * (1 - this.adsK * 0.7);
      bobY = Math.abs(Math.sin(this.bobPhase)) * amp;
      bobX = Math.cos(this.bobPhase) * amp * 0.5;
    }
    // Neigung beim Slide
    const rollT = b.stance === 'slide' ? -0.1 : 0;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 8);
    // FOV
    const baseFov = s.get('fov');
    // Kimme und Korn statt Zielfernrohr: nur leichter Zoom beim Zielen
    const fovT = baseFov * (this.adsK > 0.02 ? 1 - 0.12 * this.adsK : 1) * (b.sprinting ? 1.05 : 1) * (b.stance === 'slide' ? 1.07 : 1);
    this.fovCur += (fovT - this.fovCur) * Math.min(1, dt * 12);
    // Einstellung = horizontales FOV bei 16:9 (Hor+): vertikales FOV daraus ableiten
    const vfov = (2 * Math.atan(Math.tan((this.fovCur * DEG) / 2) * (9 / 16))) / DEG;
    if (Math.abs(cam.fov - vfov) > 0.01) {
      cam.fov = vfov;
      cam.updateProjectionMatrix();
    }
    cam.rotation.order = 'YXZ';
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    if (!this.thirdPerson) {
      cam.position.set(b.x + rx * bobX, this.camY + bobY - dip, b.z + rz * bobX);
      cam.rotation.set(this.pitch, this.yaw, this.roll);
    } else {
      cam.rotation.set(this.pitch, this.yaw, 0);
      const fwd = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const pivot = this.tmpV2.set(b.x, this.camY - 0.15 - dip, b.z);
      const back = 2.9 - this.adsK * 1.2;
      const side = 0.7;
      let dx = rx * side - fwd.x * back, dy = 0.35 - fwd.y * back, dz = rz * side - fwd.z * back;
      const len = Math.hypot(dx, dy, dz);
      dx /= len; dy /= len; dz /= len;
      let t = this.map.collision.raycast(pivot.x, pivot.y, pivot.z, dx, dy, dz, len + 0.3, true);
      const dist = t >= 0 ? Math.max(0.3, t - 0.3) : len;
      cam.position.set(pivot.x + dx * dist, pivot.y + dy * dist, pivot.z + dz * dist);
    }
    cam.updateMatrixWorld();
  }
}
