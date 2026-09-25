// Egoperspektive: sichtbare Arme + Sturmgewehr in eigener Szene (kein Clipping),
// mit ADS über Kimme, Sprint-Haltung, Nachlade- und Heilanimation, Wippen, Schwanken, Rückstoß.
import * as THREE from 'three';
import { createRifleMesh, setRifleSkin, buildMagazine, SIGHT_Y, MUZZLE, EJECT, MAG_ORIGIN } from './rifle.js';
import { GeoBuilder, flatMaterial, worldMaterial } from './geom.js';
import { buildMedkitGeo, SKIN_TONES } from './characters.js';
import { OUTFIT_COLORS } from '../../shared/constants.js';

const GUN_SCALE = 1.0;

function lerp(a, b, t) { return a + (b - a) * t; }

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
    this.gun = createRifleMesh('gold', 1, true, true);
    this.gun.scale.setScalar(GUN_SCALE);
    this.sway.add(this.gun);
    this.mag = new THREE.Mesh(buildMagazine('gold').toGeometry(), worldMaterial());
    this.mag.position.copy(MAG_ORIGIN);
    this.gun.add(this.mag);
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
    this.flash.position.copy(MUZZLE).add(new THREE.Vector3(0, 0, -0.03));
    this.flash.visible = false;
    this.gun.add(this.flash);
    // Arme
    this.armR = new THREE.Group();
    this.armL = new THREE.Group();
    this.sway.add(this.armR);
    this.sway.add(this.armL);
    // Medkit
    this.medkit = new THREE.Mesh(buildMedkitGeo(1.0).toGeometry(), flatMaterial());
    this.medkit.visible = false;
    this.sway.add(this.medkit);
    this.setOutfit('cowboy', 0, 'gold');
    // Zustand
    this.adsK = 0;
    this.sprintK = 0;
    this.healK = 0;
    this.slideK = 0;
    this.kick = 0;
    this.kickRot = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.land = 0;
    this.flashT = 0;
    this.equipT = 0;
  }

  setOutfit(outfit, color, skin) {
    const primary = OUTFIT_COLORS[color % OUTFIT_COLORS.length];
    const sleeveColors = { cowboy: primary, ranger: 0xc9ab70, ninja: 0x23262e, soldier: 0x5b6b3a, dancer: primary, pirate: 0xf5efe0, chef: 0xfafafa, astronaut: 0xf2f2f2 };
    const gloveColors = { ninja: 0x111111, soldier: 0x3a3a2a, dancer: 0xffffff, astronaut: 0xd8d8e0 };
    const sleeve = sleeveColors[outfit] ?? primary;
    const hand = gloveColors[outfit] ?? SKIN_TONES[1];
    const mkArm = () => {
      const g = new GeoBuilder();
      g.box(0, 0.0, 0, 0.062, 0.08, 0.085, hand);
      g.box(0, 0.035, 0.02, 0.026, 0.045, 0.045, hand, { rz: 0.4 });
      g.box(0, 0.22, 0, 0.07, 0.34, 0.075, outfit === 'ranger' ? SKIN_TONES[1] : sleeve);
      g.box(0, 0.4, 0, 0.08, 0.05, 0.085, sleeve);
      return new THREE.Mesh(g.toGeometry(), flatMaterial());
    };
    this.armR.clear();
    this.armL.clear();
    this.armR.add(mkArm());
    this.armL.add(mkArm());
    this.setSkin(skin);
  }

  setSkin(skin) {
    if (this.skin === skin) return;
    this.skin = skin;
    setRifleSkin(this.gun, skin, 1, true);
    this.mag.geometry.dispose();
    this.mag.geometry = buildMagazine(skin).toGeometry();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  fire() {
    this.kick = Math.min(1.4, this.kick + 1);
    this.kickRot = Math.min(1.6, this.kickRot + 1);
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, s);
  }

  // Weltposition der Mündung (für Leuchtspur/Licht)
  muzzleWorld(mainCamera, out) {
    this.gun.updateWorldMatrix(true, false);
    const p = MUZZLE.clone().applyMatrix4(this.gun.matrixWorld); // im VM-Kamera-Raum (Kamera bei 0)
    // VM-Kamera sitzt bei Ursprung ohne Drehung -> Punkt ist in Kamerakoordinaten
    const camInv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
    p.applyMatrix4(camInv);
    p.applyMatrix4(mainCamera.matrixWorld);
    return out.copy(p);
  }

  ejectWorld(mainCamera, out) {
    this.gun.updateWorldMatrix(true, false);
    const p = EJECT.clone().applyMatrix4(this.gun.matrixWorld);
    const camInv = new THREE.Matrix4().copy(this.camera.matrixWorld).invert();
    p.applyMatrix4(camInv);
    p.applyMatrix4(mainCamera.matrixWorld);
    return out.copy(p);
  }

  /**
   * s: { dt, ads, sprint, speed, grounded, slide, reload01 (-1 wenn nicht), heal01 (-1), lookDX, lookDY, land, time, crouch, fov }
   */
  update(s) {
    const dt = s.dt;
    const k = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    this.adsK = k(this.adsK, s.ads ? 1 : 0, 14);
    this.sprintK = k(this.sprintK, s.sprint ? 1 : 0, 9);
    this.healK = k(this.healK, s.heal01 >= 0 ? 1 : 0, 10);
    this.slideK = k(this.slideK, s.slide ? 1 : 0, 10);
    this.kick = Math.max(0, this.kick - dt * 9);
    this.kickRot = Math.max(0, this.kickRot - dt * 7);
    this.land = Math.max(0, this.land - dt * 3);
    this.equipT = Math.max(0, this.equipT - dt * 2.5);
    if (s.fov) {
      // Viewmodel-FOV folgt leicht dem Zoom
      const f = 56 - this.adsK * 8;
      if (Math.abs(this.camera.fov - f) > 0.01) {
        this.camera.fov = f;
        this.camera.updateProjectionMatrix();
      }
    }
    // Schwanken (hängt der Mausbewegung hinterher)
    this.swayX = k(this.swayX, Math.max(-1, Math.min(1, -s.lookDX * 0.004)), 8);
    this.swayY = k(this.swayY, Math.max(-1, Math.min(1, -s.lookDY * 0.004)), 8);
    // Wippen
    const moving = s.grounded && s.speed > 0.5 && !s.slide;
    if (moving) this.bobPhase += dt * s.speed * (s.sprint ? 1.5 : 1.9);
    const bobAmt = (moving ? Math.min(1, s.speed / 5) : 0) * (1 - this.adsK * 0.85);
    const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmt * (s.sprint ? 2 : 1);
    const bobY = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt * (s.sprint ? 2 : 1);
    const idle = Math.sin(s.time * 1.6) * 0.003 * (1 - this.adsK);

    const ads = this.adsK;
    const hip = { x: 0.2, y: -0.215, z: -0.5 };
    const adsP = { x: 0, y: -SIGHT_Y * GUN_SCALE, z: -0.34 };
    const spr = { x: 0.15, y: -0.26, z: -0.44 };
    let px = lerp(hip.x, adsP.x, ads), py = lerp(hip.y, adsP.y, ads), pz = lerp(hip.z, adsP.z, ads);
    let rx = 0, ry = lerp(0.04, 0, ads), rz = 0;
    px = lerp(px, spr.x, this.sprintK); py = lerp(py, spr.y, this.sprintK); pz = lerp(pz, spr.z, this.sprintK);
    rx += -0.35 * this.sprintK;
    ry += 0.75 * this.sprintK;
    rz += 0.25 * this.sprintK;
    // Slide: gekippt
    rz += -0.18 * this.slideK;
    // Heilen: Waffe nach unten weg
    py -= this.healK * 0.25;
    rx -= this.healK * 0.6;
    // Nachladen
    let magOff = null;
    let leftTarget = null;
    if (s.reload01 >= 0) {
      const r = s.reload01;
      const tilt = Math.sin(Math.min(1, r * 1.15) * Math.PI);
      rz += 0.55 * tilt;
      rx += 0.2 * tilt;
      py -= 0.03 * tilt;
      px -= 0.04 * tilt;
      // Magazin raus (0.12-0.35), neu rein (0.45-0.65), Durchladen (0.75-0.9)
      if (r < 0.12) leftTarget = 'mag';
      else if (r < 0.4) { magOff = (r - 0.12) / 0.28; leftTarget = 'mag'; }
      else if (r < 0.62) { magOff = 1 - (r - 0.4) / 0.22; leftTarget = 'mag'; }
      else if (r < 0.75) leftTarget = 'grip';
      else if (r < 0.92) leftTarget = 'charge';
    }
    // Aufrüsten (Equip-Animation)
    py -= this.equipT * 0.25;
    rx -= this.equipT * 0.5;
    // Landung
    py -= this.land * 0.04;
    // Rückstoß
    pz += this.kick * 0.035 * (1 - ads * 0.5);
    py += this.kick * 0.006;
    rx += this.kickRot * 0.06 * (1 - ads * 0.6);

    this.rig.position.set(px + bobX, py + bobY + idle, pz);
    this.rig.rotation.set(rx, ry, rz);
    this.sway.rotation.set(this.swayY * 0.08, this.swayX * 0.1, this.swayX * 0.05);

    // Magazin
    if (magOff !== null) {
      this.mag.position.set(MAG_ORIGIN.x - magOff * 0.02, MAG_ORIGIN.y - magOff * 0.22, MAG_ORIGIN.z + magOff * 0.05);
      this.mag.rotation.set(magOff * 0.4, 0, 0);
      this.mag.visible = !(magOff > 0.97);
    } else {
      this.mag.position.copy(MAG_ORIGIN);
      this.mag.rotation.set(0, 0, 0);
      this.mag.visible = true;
    }
    // Hände (IK-artig: Unterarm zeigt vom Griff zu einem Ellbogenpunkt außerhalb des Bildes)
    this.gun.updateMatrix();
    const g = this.gun.matrix;
    const gripR = new THREE.Vector3(0, -0.07, 0.05).applyMatrix4(g);
    let lp;
    if (this.healK > 0.3) {
      this.medkit.visible = true;
      const pump = Math.sin(s.time * 12) * 0.015;
      this.medkit.position.set(-0.05, -0.2 + (1 - this.healK) * -0.2 + pump, -0.38);
      this.medkit.rotation.set(0.4, -0.3, 0.1);
      lp = this.medkit.position.clone().add(new THREE.Vector3(-0.08, -0.02, 0.02));
    } else {
      this.medkit.visible = false;
      if (leftTarget === 'mag') lp = new THREE.Vector3().copy(this.mag.position).add(new THREE.Vector3(0, -0.12, 0.02)).applyMatrix4(g);
      else if (leftTarget === 'charge') lp = new THREE.Vector3(0.06, 0.06, -0.02).applyMatrix4(g);
      else lp = new THREE.Vector3(0, -0.01, -0.36).applyMatrix4(g);
    }
    this.placeArm(this.armR, gripR, new THREE.Vector3(0.34, -0.66, -0.34));
    this.placeArm(this.armL, lp, new THREE.Vector3(0.0, -0.58, -0.4));
    // Mündungsfeuer
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
  }

  placeArm(arm, hand, elbow) {
    arm.position.copy(hand);
    const d = elbow.clone().sub(hand).normalize();
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  }

  setSunFromWorld(sunDirWorld, mainCamera) {
    // Richtung ins Kameraraum-System der VM-Kamera übertragen
    const inv = new THREE.Quaternion().copy(mainCamera.quaternion).invert();
    const d = sunDirWorld.clone().applyQuaternion(inv);
    this.dir.position.copy(d.multiplyScalar(5));
  }
}
