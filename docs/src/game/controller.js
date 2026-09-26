// Lokaler Spieler: Eingabe → gemeinsame Bewegungsphysik, Kamera (Ego/Schulter), Inventar (1–5,
// Mausrad), Waffen (Feuerrate, Streuung, Schrotkugeln, Rückstoß, Nachladen nur mit R),
// Schilde/Medikits, F zum Öffnen/Aufheben, Zielfernrohr, Aim-Assist und Admin-Funktionen.
import * as THREE from 'three';
import { createBody, stepMovement, bodyFlags, eyeHeight } from '../../shared/sim/movement.js';
import {
  createWeaponRuntime, equipWeapon, canFire, fireWeapon, canReload, startReload, cancelReload, updateWeapon, weaponSpread, reloadProgress,
} from '../../shared/sim/weapon.js';
import { cloneInventory } from '../../shared/sim/inventory.js';
import { applySpread, dirFromAngles, anglesFromDir, rayPlayer, stanceScale } from '../../shared/sim/combat.js';
import { F, CLIENT_SEND_HZ, INTERACT_RANGE, MAX_HEALTH } from '../../shared/constants.js';
import { WEAPONS, CONSUMABLES } from '../../shared/items.js';
import { MAT } from '../../shared/physics/collision.js';
import { SURF } from '../../shared/map/terrain.js';
import { AimAssist } from './aimassist.js';

const DEG = Math.PI / 180;
const BASE_SENS = 0.0021;
const SLOT_ACTIONS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

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
  if (s === SURF.GRASS) return 'grass';
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
    this.admin = game.app.admin;
    this.camera = game.camera;
    this.body = createBody();
    this.yaw = 0;
    this.pitch = 0;
    this.inv = cloneInventory(game.session.inventory());
    this.rt = createWeaponRuntime();
    equipWeapon(this.rt, this.item);
    this.aim = new AimAssist(this.map.collision);
    this.sprintToggle = false;
    this.crouchToggle = false;
    this.adsK = 0;
    this.ads = false;
    this.wasAds = false;
    this.useT = -1;
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
    this.shake = 0;
    this.fovCur = 90;
    this.thirdPerson = false;
    this.sendAcc = 0;
    this.dryFired = false;
    this.lastLook = { dx: 0, dy: 0 };
    this.overEnemy = false;
    this.target = null; // Truhe/Gegenstand unter dem Fadenkreuz
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

  // Blickrichtung der Figur (beim Spinbot die gedrehte)
  get bodyYaw() {
    return this.spinYaw === null || this.spinYaw === undefined ? this.yaw : this.spinYaw;
  }

  get item() {
    return this.inv.slots[this.inv.sel] || null;
  }

  get weaponDef() {
    const it = this.item;
    return it && it.k === 'w' ? WEAPONS[it.w] : null;
  }

  get scoped() {
    const d = this.weaponDef;
    return !!(d && d.scope && this.adsK > 0.85 && !this.thirdPerson);
  }

  // Autoritatives Inventar übernehmen (Auswahl bleibt lokal; Magazin der Waffe in der Hand wird
  // nicht höher gesetzt, solange Schüsse unterwegs sein können)
  syncInventory() {
    const srv = this.game.session.inventory();
    // leere Hand + gerade aufgehoben: Server hat den neuen Platz schon gewählt
    const pa = this.game.pendingAutoSelect;
    if (pa) {
      if (!this.item && srv.slots[srv.sel] && srv.sel !== this.inv.sel) {
        this.inv.sel = srv.sel;
        if (srv.rev === this.inv.rev) this.onHandChanged();
      }
      if (srv.rev === this.inv.rev || performance.now() - pa > 1000) this.game.pendingAutoSelect = 0;
    }
    if (srv.rev === this.inv.rev) return;
    const local = this.item;
    const next = cloneInventory(srv);
    next.sel = this.inv.sel;
    const n = next.slots[next.sel];
    if (local && n && local.k === 'w' && n.k === 'w' && local.w === n.w && local.r === n.r && !this.rt.reloading) n.mag = Math.min(n.mag, local.mag);
    const changed = !local !== !n || (local && n && (local.k !== n.k || local.w !== n.w || local.r !== n.r || local.c !== n.c));
    this.inv = next;
    if (changed) this.onHandChanged();
  }

  onHandChanged() {
    equipWeapon(this.rt, this.item);
    this.game.viewmodel.setItem(this.item);
    this.audio.equip(this.item);
  }

  selectSlot(i) {
    if (i < 0 || i > 4 || i === this.inv.sel) return;
    this.cancelUse();
    if (this.rt.reloading) this.game.session.cancelReload();
    this.inv.sel = i;
    this.game.session.select(i);
    this.onHandChanged();
  }

  cycleSlot(dir) {
    // Mausrad: nur belegte Plätze
    for (let k = 1; k <= 5; k++) {
      const i = (this.inv.sel + dir * k + 10) % 5;
      if (this.inv.slots[i]) { this.selectSlot(i); return; }
    }
  }

  onUseDone() {
    this.useT = -1;
  }

  cancelUse() {
    if (this.useT < 0) return;
    this.useT = -1;
    this.game.session.cancelUse();
  }

  // Schild/Medikit benutzen (Platz in der Hand)
  tryUse() {
    const it = this.item;
    const g = this.game;
    if (!it || it.k !== 'c' || this.useT >= 0) return;
    const self = g.session.self();
    const c = CONSUMABLES[it.c];
    const ok = c.heal ? self.health < MAX_HEALTH : self.shield < c.cap;
    if (!ok) {
      this.audio.denied();
      return;
    }
    g.session.use(this.inv.sel);
    // wirkt sofort – nur bei Gegenständen mit Benutzungszeit läuft ein Timer
    if (c.use > 0) {
      this.useT = 0;
      this.audio.useStart(it.c);
    } else {
      // sofort: Sound + Effekt direkt beim Klick (nicht erst, wenn der Server antwortet)
      this.audio.useDone(it.c, true);
      this.instantUseT = performance.now();
    }
    g.viewmodel.useFlash = 1;
  }

  // Truhe/Gegenstand, auf die man schaut (F)
  findTarget() {
    const loot = this.game.session.loot;
    const b = this.body;
    const eye = this.eye;
    const fwd = dirFromAngles(this.yaw, this.pitch);
    let best = null, bestScore = Infinity;
    const consider = (kind, id, x, y, z, item) => {
      const dx = x - b.x, dz = z - b.z;
      const dh = Math.hypot(dx, dz);
      if (dh > INTERACT_RANGE || Math.abs(y - b.y) > 2.2) return;
      const dy = y - eye;
      const d = Math.hypot(dx, dy, dz) || 1;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      if (dot < 0.55 && dh > 1.1) return;
      const score = (1 - dot) * 4 + dh * 0.3;
      if (score < bestScore) { bestScore = score; best = { kind, id, x, y, z, item }; }
    };
    for (const c of loot.chests) if (!c.open) consider('c', c.id, c.x, c.y + 0.4, c.z, null);
    for (const pk of loot.pickups.values()) if (pk.item.k !== 'a') consider('l', pk.id, pk.x, pk.y + 0.3, pk.z, pk.item);
    return best;
  }

  update(dt, now, phase, states) {
    const g = this.game;
    const input = this.input;
    const s = this.settings;
    const b = this.body;
    const playing = phase === 'playing';
    const selfInfo = g.session.self();
    b.frozen = !playing;
    this.syncInventory();
    if (selfInfo.useT < 0 && this.useT >= 0 && this.useT > 0.4) this.useT = -1; // Server hat abgebrochen/fertig
    else if (this.useT >= 0) this.useT += dt;

    // ---- Blick ----
    const m = input.consumeMouse();
    this.lastLook = m;
    const def = this.weaponDef;
    const scopeSens = this.scoped ? s.get('scopeSens') : 1;
    const adsSens = this.adsK > 0.5 ? s.get('adsSens') * scopeSens : 1;
    const camPos = this.camera.position;
    const moveInput = (input.isDown('forward') || input.isDown('back') || input.isDown('left') || input.isDown('right'));
    const aa = this.aim.update(playing && def ? s.get('aimAssist') : 'off', camPos, this.yaw, this.pitch, states, g.session.youId, dt, now,
      this.ads && !this.wasAds, Math.abs(m.dx) + Math.abs(m.dy) > 0 || moveInput);
    this.wasAds = this.ads;
    const fovScale = this.fovCur / 90;
    const yawD = m.dx * BASE_SENS * s.get('sensX') * adsSens * aa.sensMul * fovScale;
    const pitchD = m.dy * BASE_SENS * s.get('sensY') * adsSens * aa.sensMul * fovScale * (s.get('invertY') ? -1 : 1);
    this.yaw -= yawD;
    this.pitch -= pitchD;
    if (pitchD > 0 && this.recoilAcc > 0) this.recoilAcc = Math.max(0, this.recoilAcc - pitchD);
    this.yaw += aa.addYaw;
    this.pitch += aa.addPitch;
    // Admin: Aimbot rastet beim Schießen/Zielen auf den Kopf ein
    if (playing && this.admin.active('aimbot') && (input.isDown('fire') || input.isDown('ads'))) this.aimbot(states, dt);
    else if (!this.admin.active('aimbot')) this.lockId = null;
    this.sinceShot += dt;
    if (this.sinceShot > 0.12 && this.recoilAcc > 0) {
      const rec = Math.min(this.recoilAcc, dt * 7 * DEG * (1 + this.recoilAcc / (6 * DEG)));
      this.pitch -= rec;
      this.recoilAcc -= rec;
    }
    this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch));

    // ---- Inventar ----
    if (playing || phase === 'countdown') {
      for (let i = 0; i < 5; i++) if (input.pressed(SLOT_ACTIONS[i])) this.selectSlot(i);
      if (input.pressedSet.has('WheelDown')) this.cycleSlot(1);
      if (input.pressedSet.has('WheelUp')) this.cycleSlot(-1);
    }

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

    // auch sehr kurze Klicks zählen (Drücken + Loslassen zwischen zwei Frames)
    const firing = (input.isDown('fire') || input.pressed('fire')) && playing && selfInfo.alive;
    if (firing && def) {
      this.sprintBlockT = 0.35;
      if (s.get('sprintMode') === 'toggle') this.sprintToggle = false;
    }
    this.sprintBlockT -= dt;
    if (this.sprintBlockT > 0) sprintWanted = false;
    if (this.useT >= 0) sprintWanted = false;

    this.ads = input.isDown('ads') && !!def && !b.sprinting && this.useT < 0 && selfInfo.alive;
    this.adsK += ((this.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * (def && def.scope ? 10 : 14));

    const fly = this.admin.active('fly');
    const inp = {
      mx: moveX, mz: moveZ, yaw: this.yaw,
      jump: input.pressed('jump') && playing,
      sprint: sprintWanted && playing,
      crouch: crouchWanted,
      crouchPressed,
      ads: this.adsK > 0.5,
      using: this.useT >= 0,
      fly: fly && playing,
      flyUp: input.isDown('jump'),
      flyDown: input.isDown('crouch'),
      flySpeed: this.admin.value('flySpeed'),
      speedMul: this.admin.active('speed') ? this.admin.value('speedMul') : 0,
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
    if (b.stance === 'slide' && Math.random() < dt * 45) g.effects.dust(this.tmpV.set(b.x, b.y, b.z), 2);
    const hs = Math.hypot(b.vx, b.vz);
    if (b.grounded && hs > 0.8 && b.stance !== 'slide' && !fly) {
      this.stepAcc += hs * dt;
      const stride = b.sprinting ? 2.7 : b.stance === 'crouch' ? 1.5 : 2.1;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const vol = b.stance === 'crouch' ? 0.1 : b.sprinting ? 0.5 : 0.45;
        this.audio.footstep(surfaceSound(this.map, b), vol);
        if (b.waterDepth > 0.2) g.effects.splash(this.tmpV.set(b.x, b.y + b.waterDepth, b.z), 3);
      }
    } else if (!prevGrounded) this.stepAcc = 1;
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
    const it = this.item;
    const wev = updateWeapon(this.rt, it, this.inv.ammo, dt);
    if (wev === 'shell') this.audio.shellInsert();
    else if (wev === 'done') g.hud.flashAmmo();
    if (b.sprinting && this.rt.reloading && def && !def.shellReload) {
      cancelReload(this.rt);
      g.session.cancelReload();
    }
    // Nachladen nur manuell
    if (input.pressed('reload') && canReload(this.rt, it, this.inv.ammo) && selfInfo.alive && !b.sprinting && this.useT < 0) {
      if (startReload(this.rt, it, this.inv.ammo)) {
        g.session.reload();
        this.audio.reloadSounds(it.w, this.rt.reloadDur, it.mag === 0);
        if (this.scoped) this.adsK = 0;
      }
    }
    // F: Truhe öffnen / aufheben
    this.target = selfInfo.alive && playing ? this.findTarget() : null;
    if (input.pressed('interact') && this.target) {
      g.session.interact(this.target.kind === 'c' ? { c: this.target.id } : { l: this.target.id });
      if (this.target.kind === 'c') this.audio.chestOpen();
    }

    // Klick-Puffer: ein Klick kurz vor Ende von Ausrüsten/Feuerpause wird nachgeholt
    if (input.pressed('fire')) this.fireBuffer = 0.18;
    else this.fireBuffer = Math.max(0, (this.fireBuffer || 0) - dt);
    const wantShot = firing || (this.fireBuffer > 0 && def && !def.auto && playing && selfInfo.alive);
    if (wantShot && !b.sprinting && it) {
      if (it.k === 'c') {
        if (input.pressed('fire')) this.tryUse();
      } else if (it.mag <= 0 && !this.rt.reloading) {
        this.fireBuffer = 0;
        if (!this.dryFired && firing) {
          this.audio.dryFire();
          g.hud.pulseEmpty();
          this.dryFired = true;
        }
      } else {
        if (this.useT >= 0) this.cancelUse();
        let n = 0;
        while (canFire(this.rt, it) && n < 3) {
          if (!fireWeapon(this.rt, it)) break;
          this.shoot(states, it);
          this.fireBuffer = 0;
          n++;
          if (!def.auto && !input.isDown('fire')) break;
        }
      }
    }
    if (!input.isDown('fire')) this.dryFired = false;

    // ---- Perspektive ----
    if (input.pressed('view')) this.thirdPerson = !this.thirdPerson;

    // ---- Flags + Senden ----
    let extra = 0;
    if (this.adsK > 0.5) extra |= F.ADS;
    if (this.rt.reloading) extra |= F.RELOAD;
    if (this.useT >= 0) extra |= F.USING;
    if (this.sinceShot < 0.15) extra |= F.FIRING;
    this.flags = bodyFlags(b, extra);
    // Spinbot: die Figur dreht sich für die anderen, gezielt wird weiter mit der echten Blickrichtung
    if (this.admin.active('spinbot') && playing) this.spinYaw = ((this.spinYaw || 0) + dt * 22) % (Math.PI * 2);
    else this.spinYaw = null;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / CLIENT_SEND_HZ) {
      this.sendAcc = 0;
      g.session.sendState({ x: b.x, y: b.y, z: b.z, yaw: this.bodyYaw, pitch: this.pitch, flags: this.flags, vx: b.vx, vz: b.vz });
    }

    this.overEnemy = this.checkOverEnemy(states);
    this.updateCamera(dt);
  }

  reload01() {
    return reloadProgress(this.rt, this.item);
  }

  shoot(states, item) {
    const g = this.game;
    const b = this.body;
    const def = WEAPONS[item.w];
    this.sinceShot = 0;
    this.shotsFired++;
    const eye = this.tmpV.set(b.x, this.eye, b.z);
    let base = dirFromAngles(this.yaw, this.pitch);
    if (this.thirdPerson) {
      // durch das Fadenkreuz zielen: Zielpunkt von der Kamera aus bestimmen
      const cam = this.camera.position;
      const cd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      let t = this.map.collision.raycast(cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, def.range, true, true);
      if (t < 0) t = def.range;
      for (const st of states) {
        if (st.id === g.session.youId || !st.alive) continue;
        const r = rayPlayer(st, cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, t);
        if (r) t = r.t;
      }
      const d = cam.clone().addScaledVector(cd, t).sub(eye).normalize();
      base = { x: d.x, y: d.y, z: d.z };
    }
    // Streuung zum Zeitpunkt vor dem Schuss (Bloom wurde durch fireWeapon schon erhöht)
    let spread = weaponSpread(this.rt, item, bodyFlags(b, this.adsK > 0.5 ? F.ADS : 0));
    // Admin-Aimbot: exakt auf die Kopfmitte, ohne Streuung
    const at = this.admin.active('aimbot') && this.aimbotTarget && this.aimbotTarget.alive ? this.aimbotTarget : null;
    if (at) {
      const hx = at.x - eye.x, hy = at.y + 1.6 * stanceScale(at.flags) - eye.y, hz = at.z - eye.z;
      const l = Math.hypot(hx, hy, hz) || 1;
      base = { x: hx / l, y: hy / l, z: hz / l };
      spread = def.pellets > 1 ? spread * 0.35 : 0;
    }
    const dirs = [];
    for (let k = 0; k < def.pellets; k++) dirs.push(applySpread(base, spread, Math.random));
    const wall = this.admin.active('wallbang');
    g.session.fire({ s: this.inv.sel, ox: eye.x, oy: eye.y, oz: eye.z, dirs, wall });
    g.onLocalShot(eye.clone(), dirs, item, wall);
    // kein Rückstoß: das Fadenkreuz bleibt, wo du zielst (nur leichtes Bildwackeln bei Schrot/Sniper)
    this.shake = Math.min(1, this.shake + (def.pellets > 1 || def.scope ? 0.45 : 0));
    g.viewmodel.fire(item.w);
    this.audio.gunshot(null, 0, item.w);
    if (def.scope && this.scoped) this.adsK = 0.3; // nach dem Schuss kurz aus dem Zielfernrohr
  }

  // Admin-Aimbot: lockt immer auf den nächsten Gegner (Entfernung, nicht Blickwinkel) und rastet
  // auf die Kopfmitte ein. Ohne „Durch Wände“ nur sichtbare Gegner; kurz verdeckte Ziele (0,6 s)
  // bleiben gelockt. Gerechnet von der Augenposition, von der auch geschossen wird.
  aimbot(states, dt) {
    const b = this.body;
    const ex = b.x, ey = this.eye, ez = b.z;
    const wall = this.admin.active('wallbang');
    const head = (st) => st.y + 1.6 * stanceScale(st.flags);
    const visible = (st) => wall || this.map.collision.lineOfSight(ex, ey, ez, st.x, head(st), st.z);
    let tgt = null, bestD = 300;
    for (const st of states) {
      if (st.id === this.game.session.youId || !st.alive) continue;
      const d = Math.hypot(st.x - ex, head(st) - ey, st.z - ez);
      if (d >= bestD || !visible(st)) continue;
      bestD = d;
      tgt = st;
    }
    // kurz verdeckter bisheriger Gegner bleibt gelockt, wenn gerade kein anderer sichtbar ist
    if (tgt) { this.lockId = tgt.id; this.lockLost = 0; }
    else if (this.lockId) {
      const st = states.find((q) => q.id === this.lockId && q.alive);
      if (st && (this.lockLost = (this.lockLost || 0) + dt) < 0.6) tgt = st;
      else this.lockId = null;
    }
    this.aimbotTarget = tgt;
    if (tgt) {
      const dx = tgt.x - ex, dy = head(tgt) - ey, dz = tgt.z - ez;
      const d = Math.hypot(dx, dy, dz) || 1;
      const a = anglesFromDir(dx / d, dy / d, dz / d);
      this.yaw = a.yaw;
      this.pitch = a.pitch;
      this.recoilAcc = 0;
    }
  }

  checkOverEnemy(states) {
    const cam = this.camera.position;
    const cd = this.tmpV2.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    let best = 250;
    let hit = false;
    for (const s of states) {
      if (s.id === this.game.session.youId || !s.alive) continue;
      const dx = s.x - cam.x, dz = s.z - cam.z;
      if (dx * dx + dz * dz > 250 * 250) continue;
      const r = rayPlayer(s, cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, best);
      if (r) { best = r.t; hit = true; }
    }
    if (!hit) return false;
    const t = this.map.collision.raycast(cam.x, cam.y, cam.z, cd.x, cd.y, cd.z, best, true, true);
    return t < 0;
  }

  updateCamera(dt) {
    const b = this.body;
    const s = this.settings;
    const cam = this.camera;
    const targetY = b.y + eyeHeight(b);
    if (this.camY === null) this.camY = targetY;
    if (targetY > this.camY && b.grounded) this.camY += (targetY - this.camY) * Math.min(1, dt * 14);
    else if (b.stance !== 'stand' && targetY < this.camY && b.grounded) this.camY += (targetY - this.camY) * Math.min(1, dt * 14);
    else this.camY = targetY;
    this.landDip = Math.max(0, this.landDip - dt * 1.4);
    const dip = Math.sin(Math.min(1, this.landDip / 0.35) * Math.PI * 0.5) * this.landDip;
    const hs = Math.hypot(b.vx, b.vz);
    let bobY = 0, bobX = 0;
    if (s.get('headBob') && b.grounded && hs > 0.8 && b.stance !== 'slide') {
      this.bobPhase += dt * hs * (b.sprinting ? 1.55 : 1.9);
      const amp = Math.min(1, hs / 6) * (b.sprinting ? 0.055 : 0.035) * (1 - this.adsK * 0.7);
      bobY = Math.abs(Math.sin(this.bobPhase)) * amp;
      bobX = Math.cos(this.bobPhase) * amp * 0.5;
    }
    const rollT = b.stance === 'slide' ? -0.16 : 0;
    this.roll += (rollT - this.roll) * Math.min(1, dt * 8);
    // Kamerawackeln bei Schrotflinte/Sniper
    this.shake = Math.max(0, this.shake - dt * 5);
    const sh = this.shake * this.shake * 0.012;
    // FOV: Zielfernrohr (Sniper) oder leichter Zoom über Kimme und Korn
    const baseFov = s.get('fov');
    const def = this.weaponDef;
    const zoom = def && def.scope ? 1 - (1 - 1 / def.scope) * this.adsK : 1 - 0.12 * this.adsK;
    const fovT = baseFov * zoom * (b.sprinting ? 1.08 : 1) * (b.stance === 'slide' ? 1.1 + Math.min(0.06, hs * 0.004) : 1);
    this.fovCur += (fovT - this.fovCur) * Math.min(1, dt * 14);
    const vfov = (2 * Math.atan(Math.tan((this.fovCur * DEG) / 2) * (9 / 16))) / DEG;
    if (Math.abs(cam.fov - vfov) > 0.01) {
      cam.fov = vfov;
      cam.updateProjectionMatrix();
    }
    cam.rotation.order = 'YXZ';
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    if (!this.thirdPerson) {
      cam.position.set(b.x + rx * bobX, this.camY + bobY - dip, b.z + rz * bobX);
      cam.rotation.set(this.pitch + (Math.random() - 0.5) * sh, this.yaw + (Math.random() - 0.5) * sh, this.roll);
    } else {
      cam.rotation.set(this.pitch, this.yaw, 0);
      const fwd = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const pivot = this.tmpV2.set(b.x, this.camY - 0.15 - dip, b.z);
      const back = 2.9 - this.adsK * 1.2;
      const side = 0.7;
      let dx = rx * side - fwd.x * back, dy = 0.35 - fwd.y * back, dz = rz * side - fwd.z * back;
      const len = Math.hypot(dx, dy, dz);
      dx /= len; dy /= len; dz /= len;
      const t = this.map.collision.raycast(pivot.x, pivot.y, pivot.z, dx, dy, dz, len + 0.3, true);
      const dist = t >= 0 ? Math.max(0.3, t - 0.3) : len;
      cam.position.set(pivot.x + dx * dist, pivot.y + dy * dist, pivot.z + dz * dist);
    }
    cam.updateMatrixWorld();
  }
}
