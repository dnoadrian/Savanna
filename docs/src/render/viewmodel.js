// Egoperspektive: sichtbare Arme + Gegenstand in der Hand in eigener Szene (kein Clipping).
// Waffen mit Zielen über Kimme und Korn (Sniper: Zielfernrohr-Overlay), Sprint-Haltung,
// Nachladen (Magazin / Patrone für Patrone / Kammerverschluss), Pump- und Repetier-Animation,
// Schilde trinken, Medikit, Ausrüsten, Wippen, Schwanken, Rückstoß.
import * as THREE from 'three';
import { GeoBuilder, flatMaterial } from './geom.js';
import { WEAPON_META, weaponGeometry, magazineGeometry, consumableGeometry, itemMaterial } from './weapons.js';
import { firstPersonArm } from './characters.js';
import { WEAPONS } from '../../shared/items.js';

function lerp(a, b, t) { return a + (b - a) * t; }
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const type0 = (it) => (it && it.k === 'w' ? it.w : null);

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.01, 20);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xdcefff, 0xb08a60, 1.4);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xfff0d8, 1.8);
    this.scene.add(this.dir);
    this.scene.add(this.dir.target);
    this.rig = new THREE.Group();
    this.camera.add(this.rig);
    this.sway = new THREE.Group();
    this.rig.add(this.sway);
    this.gun = new THREE.Mesh(weaponGeometry('pistol', 0, 1, false), itemMaterial());
    this.sway.add(this.gun);
    this.mag = new THREE.Mesh(magazineGeometry('pistol', 0), itemMaterial());
    this.gun.add(this.mag);
    this.held = new THREE.Mesh(consumableGeometry('mini'), itemMaterial());
    this.held.visible = false;
    this.sway.add(this.held);
    // Mündungsfeuer
    const fg = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = i % 2 ? 0.035 : 0.09;
      const a2 = ((i + 1) / 6) * Math.PI * 2;
      const r2 = (i + 1) % 2 ? 0.035 : 0.09;
      pts.push(0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a2) * r2, Math.sin(a2) * r2, 0);
      pts.push(0, 0, 0, 0, Math.cos(a) * r * 0.6, -Math.abs(Math.sin(a)) * r * 2.2, 0, Math.cos(a2) * r2 * 0.6, -Math.abs(Math.sin(a2)) * r2 * 2.2);
    }
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.flash = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.flash.visible = false;
    this.gun.add(this.flash);
    this.armR = new THREE.Group();
    this.armL = new THREE.Group();
    this.sway.add(this.armR);
    this.sway.add(this.armL);
    this.setOutfit('cowboy', 0);
    this.adsK = 0;
    this.sprintK = 0;
    this.useK = 0;
    this.slideK = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.actionT = 0; // Pumpen / Repetieren nach dem Schuss
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.land = 0;
    this.flashT = 0;
    this.equipT = 0;
    this.item = null;
    this.setItem({ k: 'w', w: 'pistol', r: 0, mag: 20 });
  }

  setOutfit(outfit, color) {
    // Ärmel, Unterarm, Manschette und Hand passend zum Skin
    const a = firstPersonArm(outfit, color);
    const mkArm = () => {
      const g = new GeoBuilder();
      g.box(0, 0.0, 0, 0.062, 0.08, 0.085, a.hand);
      g.box(0, 0.035, 0.02, 0.026, 0.045, 0.045, a.hand, { rz: 0.4 });
      g.box(0, 0.22, 0, 0.07, 0.34, 0.075, a.fore);
      if (a.cuff) g.box(0, 0.065, 0, 0.076, 0.03, 0.081, a.cuff);
      g.box(0, 0.4, 0, 0.08, 0.05, 0.085, a.sleeve);
      return new THREE.Mesh(g.toGeometry(), flatMaterial());
    };
    this.armR.clear();
    this.armL.clear();
    this.armR.add(mkArm());
    this.armL.add(mkArm());
  }

  // Gegenstand in der Hand wechseln (mit Ausrüst-Animation)
  setItem(item) {
    const same = this.item && item && this.item.k === item.k && this.item.w === item.w && this.item.r === item.r && this.item.c === item.c;
    this.item = item ? { ...item } : null;
    if (!same) this.equipT = 1;
    if (item && item.k === 'w') {
      const meta = WEAPON_META[item.w];
      this.meta = meta;
      this.gun.geometry = weaponGeometry(item.w, item.r, 1, false);
      this.gun.visible = true;
      this.held.visible = false;
      this.mag.visible = !!meta.mag;
      if (meta.mag) {
        this.mag.geometry = magazineGeometry(item.w, item.r);
        this.magOrigin = V(meta.mag);
        this.mag.position.copy(this.magOrigin);
      }
      this.flash.position.copy(V(meta.muzzle)).add(new THREE.Vector3(0, 0, -0.03));
      const big = WEAPONS[item.w].pellets > 1 || item.w === 'sniper';
      this.flash.scale.setScalar(big ? 1.6 : 1);
    } else {
      this.meta = null;
      this.gun.visible = false;
      this.held.visible = !!item;
      if (item) this.held.geometry = consumableGeometry(item.c);
      this.heldType = item ? item.c : null;
      // Mini-Schild etwas größer zeigen, damit man die Flasche in der Hand gut erkennt
      this.held.scale.setScalar(item && item.c === 'mini' ? 1.3 : 1);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  fire(type) {
    const def = WEAPONS[type];
    if (def.melee) {
      // Messer: Hieb abwechselnd von rechts und links
      this.swingT = 1;
      this.swingDir = -(this.swingDir || 1);
      return;
    }
    const heavy = def.pellets > 1 || def.scope;
    this.kick = Math.min(1.6, this.kick + (heavy ? 1.5 : 1));
    this.kickRot = Math.min(2, this.kickRot + (heavy ? 1.8 : 1));
    this.flashT = heavy ? 0.06 : 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    if (type === 'pump' || type === 'hammer' || type === 'sniper') this.actionT = 1;
  }

  // Punkt aus dem Waffensystem in Weltkoordinaten der Hauptkamera
  toWorld(local, mainCamera, out) {
    this.gun.updateWorldMatrix(true, false);
    const p = local.clone().applyMatrix4(this.gun.matrixWorld);
    const camInv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
    p.applyMatrix4(camInv);
    p.applyMatrix4(mainCamera.matrixWorld);
    return out.copy(p);
  }

  muzzleWorld(mainCamera, out) {
    return this.toWorld(V(this.meta ? this.meta.muzzle : [0, 0, -0.5]), mainCamera, out);
  }

  ejectWorld(mainCamera, out) {
    return this.toWorld(V(this.meta ? this.meta.eject : [0, 0, -0.1]), mainCamera, out);
  }

  /**
   * s: { dt, ads, scoped, sprint, speed, grounded, slide, reload01 (-1), use01 (-1), lookDX, lookDY, time, fov }
   */
  update(s) {
    const dt = s.dt;
    const k = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    this.adsK = k(this.adsK, s.ads ? 1 : 0, 14);
    this.sprintK = k(this.sprintK, s.sprint ? 1 : 0, 9);
    // sofortige Benutzung: kurzes Anheben (Trinken/Anlegen) als Rückmeldung
    this.useFlash = Math.max(0, (this.useFlash || 0) - dt * 2.5);
    this.useK = k(this.useK, s.use01 >= 0 || this.useFlash > 0 ? 1 : 0, 12);
    this.slideK = k(this.slideK, s.slide ? 1 : 0, 10);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    this.actionT = Math.max(0, this.actionT - dt * 1.9);
    this.swingT = Math.max(0, (this.swingT || 0) - dt / 0.3);
    this.land = Math.max(0, this.land - dt * 3);
    this.equipT = Math.max(0, this.equipT - dt * 3.2);
    // Im Zielfernrohr ist die Waffe unsichtbar (Overlay im HUD)
    this.sway.visible = !s.scoped && !s.hidden; // am Boden (Duo): keine Waffe in der Hand
    if (s.fov) {
      const f = 56 - this.adsK * 4;
      if (Math.abs(this.camera.fov - f) > 0.01) {
        this.camera.fov = f;
        this.camera.updateProjectionMatrix();
      }
    }
    this.swayX = k(this.swayX, Math.max(-1, Math.min(1, -s.lookDX * 0.004)), 8);
    this.swayY = k(this.swayY, Math.max(-1, Math.min(1, -s.lookDY * 0.004)), 8);
    const moving = s.grounded && s.speed > 0.5 && !s.slide;
    if (moving) this.bobPhase += dt * s.speed * (s.sprint ? 1.5 : 1.9);
    const bobAmt = (moving ? Math.min(1, s.speed / 5) : 0) * (1 - this.adsK * 0.85);
    const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmt * (s.sprint ? 2 : 1);
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt * (s.sprint ? 2 : 1);
    const idle = Math.sin(s.time * 1.6) * 0.003 * (1 - this.adsK);

    const meta = this.meta;
    const ads = meta ? this.adsK : 0;
    const hip = meta ? meta.hip : [0.16, -0.2, -0.4];
    // Wie in Valorant: die Waffe bleibt auch beim Zielen seitlich unten rechts, man zielt mit dem
    // Fadenkreuz. Nur das Scharfschützengewehr geht mittig ins Zielfernrohr.
    const scoped = meta && WEAPONS[type0(this.item)]?.scope;
    const adsP = !meta ? hip : scoped ? [0, -meta.sightY, meta.adsZ] : [hip[0] * 0.72, hip[1] + 0.025, hip[2] + 0.05];
    const spr = [0.15, -0.26, -0.44];
    let px = lerp(hip[0], adsP[0], ads), py = lerp(hip[1], adsP[1], ads), pz = lerp(hip[2], adsP[2], ads);
    let rx = 0, ry = lerp(0.07, scoped ? 0 : 0.045, ads), rz = lerp(0.035, scoped ? 0 : 0.02, ads);
    px = lerp(px, spr[0], this.sprintK); py = lerp(py, spr[1], this.sprintK); pz = lerp(pz, spr[2], this.sprintK);
    rx += -0.35 * this.sprintK;
    ry += 0.75 * this.sprintK;
    rz += 0.25 * this.sprintK;
    rz += -0.18 * this.slideK;
    // Messer: Klinge schräg nach oben gekippt und leicht gedreht, damit man sie gut sieht
    if (meta && meta.melee) {
      rx += 0.55 * (1 - this.sprintK);
      ry += 0.32;
      rz -= 0.45;
    }
    // Nachladen
    let magOff = null;
    let leftTarget = null;
    const type = this.item && this.item.k === 'w' ? this.item.w : null;
    if (s.reload01 >= 0 && meta) {
      const r = s.reload01;
      if (WEAPONS[type].shellReload) {
        // Patrone für Patrone: Waffe gekippt, linke Hand pendelt zur Ladeklappe
        const tilt = Math.min(1, r * 8, (1 - r) * 8 + 0.4);
        rz += 0.5 * tilt;
        rx += 0.15 * tilt;
        py -= 0.02 * tilt;
        const cyc = (s.time * 1.8) % 1;
        leftTarget = cyc < 0.5 ? 'belt' : 'port';
      } else {
        const tilt = Math.sin(Math.min(1, r * 1.15) * Math.PI);
        rz += 0.55 * tilt;
        rx += 0.2 * tilt;
        py -= 0.03 * tilt;
        px -= 0.04 * tilt;
        if (meta.mag) {
          if (r < 0.12) leftTarget = 'mag';
          else if (r < 0.4) { magOff = (r - 0.12) / 0.28; leftTarget = 'mag'; }
          else if (r < 0.62) { magOff = 1 - (r - 0.4) / 0.22; leftTarget = 'mag'; }
          else if (r < 0.75) leftTarget = 'grip';
          else if (r < 0.92) leftTarget = 'charge';
        }
      }
    }
    // Pumpen / Repetieren
    let pumpOff = 0;
    if (this.actionT > 0 && type) {
      const a = 1 - this.actionT;
      const w = Math.sin(Math.min(1, Math.max(0, (a - 0.15) / 0.6)) * Math.PI);
      if (type === 'pump' || type === 'hammer') { pumpOff = w * 0.08; rx += w * 0.08; }
      else { leftTarget = w > 0.05 ? 'bolt' : leftTarget; rz += w * 0.15; }
    }
    // Schild/Medikit benutzen: Gegenstand zum Gesicht
    const use = this.useK;
    py -= this.equipT * 0.25;
    rx -= this.equipT * 0.5;
    py -= this.land * 0.04;
    // Messerhieb: Bogen quer durchs Bild
    if (this.swingT > 0) {
      const a = Math.sin((1 - this.swingT) * Math.PI);
      const dir = this.swingDir || 1;
      px += a * 0.2 * dir;
      py += a * 0.05;
      pz -= a * 0.12;
      ry += a * 0.9 * dir;
      rz += a * 0.7 * dir;
      rx -= a * 0.35;
    }
    // Rückstoß nur als kleiner Ruck nach hinten/unten – die Mündung kippt nicht ins Bild
    pz += this.kick * 0.018 * (1 - ads * 0.5);
    py -= this.kick * 0.004;
    rx += this.kickRot * 0.02 * (1 - ads * 0.7);

    this.rig.position.set(px + bobX, py + bobY + idle, pz);
    this.rig.rotation.set(rx, ry, rz);
    this.sway.rotation.set(this.swayY * 0.08, this.swayX * 0.1, this.swayX * 0.05);

    if (this.mag.visible && this.magOrigin) {
      if (magOff !== null) {
        this.mag.position.set(this.magOrigin.x - magOff * 0.02, this.magOrigin.y - magOff * 0.22, this.magOrigin.z + magOff * 0.05);
        this.mag.rotation.set(magOff * 0.4, 0, 0);
      } else {
        this.mag.position.copy(this.magOrigin);
        this.mag.rotation.set(0, 0, 0);
      }
    }
    // Hände
    this.gun.updateMatrix();
    const g = this.gun.matrix;
    let rp, lp;
    if (!meta) {
      // Schild/Medikit in der rechten Hand, beim Benutzen zum Mund
      const u = s.use01 >= 0 ? s.use01 : 0;
      const drink = use * (0.5 + 0.5 * Math.sin(s.time * 5));
      this.held.position.set(0.14 - use * 0.1, -0.2 + use * 0.1 + drink * 0.02, -0.42 + use * 0.1);
      this.held.rotation.set(-0.2 + use * 0.9, 0.3 - use * 0.3, 0.1 + use * 0.5 + u * 0.3);
      this.held.updateMatrix();
      if (this.heldType === 'mini') {
        // kleine Flasche: rechte Hand hält sie unten, die linke bleibt unten am Rand
        rp = new THREE.Vector3(0.005, -0.012, 0.03).applyMatrix4(this.held.matrix);
        lp = new THREE.Vector3(-0.32, -0.5, -0.3);
      } else {
        rp = new THREE.Vector3(0, 0.05, 0.02).applyMatrix4(this.held.matrix);
        lp = new THREE.Vector3(-0.08, 0.08, 0.0).applyMatrix4(this.held.matrix);
      }
      this.placeArm(this.armL, lp, new THREE.Vector3(-0.2, -0.66, -0.3));
    } else {
      rp = new THREE.Vector3(0, meta.melee ? -0.01 : -0.07, 0.05).applyMatrix4(g);
      const fore = meta.fore ? V(meta.fore) : new THREE.Vector3(0, -0.06, 0.0);
      if (leftTarget === 'mag' && meta.mag) lp = this.mag.position.clone().add(new THREE.Vector3(0, -0.12, 0.02)).applyMatrix4(g);
      else if (leftTarget === 'charge') lp = new THREE.Vector3(0.06, 0.06, -0.02).applyMatrix4(g);
      else if (leftTarget === 'bolt') lp = new THREE.Vector3(0.08, 0.05, 0.0).applyMatrix4(g);
      else if (leftTarget === 'belt') lp = new THREE.Vector3(-0.12, -0.12, 0.1).applyMatrix4(g);
      else if (leftTarget === 'port') lp = new THREE.Vector3(0.0, -0.05, -0.12).applyMatrix4(g);
      else if (meta.melee) lp = new THREE.Vector3(-0.32, -0.46, -0.3); // Messer: linke Hand unten am Rand
      else lp = fore.add(new THREE.Vector3(0, 0, pumpOff)).applyMatrix4(g);
      this.placeArm(this.armL, lp, new THREE.Vector3(meta.melee ? -0.3 : 0.0, -0.58, -0.4));
    }
    this.placeArm(this.armR, rp, new THREE.Vector3(0.34, -0.66, -0.34));
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0 && !!meta;
    if (this.flash.visible) this.flash.material.opacity = 0.95 - this.adsK * 0.55; // beim Zielen dezenter
  }

  placeArm(arm, hand, elbow) {
    arm.position.copy(hand);
    const d = elbow.clone().sub(hand).normalize();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  }

  setSunFromWorld(sunDirWorld, mainCamera) {
    const inv = new THREE.Quaternion().copy(mainCamera.quaternion).invert();
    const d = sunDirWorld.clone().applyQuaternion(inv);
    this.dir.position.copy(d.multiplyScalar(5));
  }
}
