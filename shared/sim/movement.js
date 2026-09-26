// Gemeinsame Bewegungsphysik: lokaler Spieler (Client) und Bots (Simulation).
import {
  WALK_SPEED, SPRINT_MULT, CROUCH_MULT, ADS_MULT, USE_MOVE_MULT, SLIDE_START_MULT, SLIDE_TIME,
  SLIDE_MAX_TIME, SLIDE_COOLDOWN, SLIDE_FRICTION, STAMINA_SPRINT_TIME, STAMINA_REGEN_TIME,
  STAMINA_REGEN_DELAY, STAMINA_RECOVER, GRAVITY, JUMP_SPEED, STEP_HEIGHT, PLAYER_RADIUS, STAND_HEIGHT,
  CROUCH_HEIGHT, SLIDE_HEIGHT, EYE_STAND, EYE_CROUCH, EYE_SLIDE, MAX_WALK_SLOPE, DEEP_WATER,
  BOUNDARY_RADIUS, SEA_LEVEL, F,
} from '../constants.js';
import { MAT } from '../physics/collision.js';

export function createBody(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    vx: 0, vy: 0, vz: 0,
    yaw: 0,
    grounded: true,
    stance: 'stand', // stand | crouch | slide
    slideT: 0,
    slideCd: 0,
    sprinting: false,
    stamina: 1, // 0..1
    staminaCd: 0,
    exhausted: false,
    waterDepth: 0,
    groundMat: MAT.TERRAIN,
    airTime: 0,
    frozen: false,
    // Ereignisse des letzten Schritts
    landed: 0,
    jumped: false,
    slideStarted: false,
    slideEnded: false,
  };
}

export function bodyHeight(b) {
  return b.stance === 'slide' ? SLIDE_HEIGHT : b.stance === 'crouch' ? CROUCH_HEIGHT : STAND_HEIGHT;
}

export function eyeHeight(b) {
  return b.stance === 'slide' ? EYE_SLIDE : b.stance === 'crouch' ? EYE_CROUCH : EYE_STAND;
}

export function bodyFlags(b, extra = 0) {
  let f = extra;
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > 0.6) f |= F.MOVING;
  if (b.sprinting) f |= F.SPRINT;
  if (b.stance === 'crouch') f |= F.CROUCH;
  if (b.stance === 'slide') f |= F.SLIDE;
  if (!b.grounded) f |= F.AIR;
  if (b.waterDepth > 0.25) f |= F.WATER;
  return f;
}

const tmpPos = { x: 0, z: 0 };
const tmpN = { x: 0, y: 1, z: 0 };

function canStand(b, world, height) {
  const c = world.collision.ceilingAt(b.x, b.z, PLAYER_RADIUS * 0.9, b.y + 0.3);
  return c >= b.y + height;
}

/**
 * input: { mx, mz (-1..1 lokal: mz>0 = vorwärts, mx>0 = rechts), yaw, jump, sprint, crouch,
 *          crouchPressed, ads, using, fly, flyUp, flyDown, flySpeed, speedMul }
 */
export function stepMovement(b, input, dt, world) {
  b.landed = 0;
  b.jumped = false;
  b.slideStarted = false;
  b.slideEnded = false;
  if (b.frozen) {
    b.vx = b.vz = 0;
    return;
  }
  const n = Math.max(1, Math.ceil(dt / (1 / 60)));
  const h = dt / n;
  for (let s = 0; s < n; s++) subStep(b, input, h, world, s === 0);
}

// Admin-Fliegen: keine Schwerkraft, Leertaste hoch, Ducken runter, Wände bleiben fest
function flyStep(b, inp, h, world) {
  const terrain = world.terrain;
  const col = world.collision;
  b.yaw = inp.yaw;
  const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const speed = (inp.flySpeed || WALK_SPEED * 2) * (inp.sprint ? 1.6 : 1);
  const tx = (-sin * mz + cos * mx) * speed;
  const tz = (-cos * mz - sin * mx) * speed;
  const ty = ((inp.flyUp ? 1 : 0) - (inp.flyDown ? 1 : 0)) * speed * 0.8;
  const k = Math.min(1, 10 * h);
  b.vx += (tx - b.vx) * k;
  b.vz += (tz - b.vz) * k;
  b.vy += (ty - b.vy) * k;
  tmpPos.x = b.x + b.vx * h;
  tmpPos.z = b.z + b.vz * h;
  col.resolveCircle(tmpPos, PLAYER_RADIUS, b.y + 0.1, b.y + STAND_HEIGHT);
  const r = Math.hypot(tmpPos.x, tmpPos.z);
  if (r > BOUNDARY_RADIUS) { tmpPos.x *= BOUNDARY_RADIUS / r; tmpPos.z *= BOUNDARY_RADIUS / r; }
  b.x = tmpPos.x;
  b.z = tmpPos.z;
  const ground = Math.max(terrain.heightAt(b.x, b.z), col.groundAt(b.x, b.z, PLAYER_RADIUS * 0.7, b.y + STEP_HEIGHT));
  b.y = Math.min(120, Math.max(ground, b.y + b.vy * h));
  b.grounded = b.y <= ground + 0.01;
  b.stance = 'stand';
  b.sprinting = false;
  b.airTime = 0;
  b.waterDepth = Math.max(0, terrain.waterLevelAt(b.x, b.z) - b.y);
}

function subStep(b, inp, h, world, first) {
  if (inp.fly) {
    flyStep(b, inp, h, world);
    return;
  }
  const terrain = world.terrain;
  const col = world.collision;
  b.yaw = inp.yaw;
  b.slideCd = Math.max(0, b.slideCd - h);

  // Richtungsvektoren (yaw = 0 schaut nach -Z)
  const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
  const fwdX = -sin, fwdZ = -cos;
  const rightX = cos, rightZ = -sin;
  let mx = inp.mx || 0, mz = inp.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const moving = ml > 0.05;
  let wishX = fwdX * mz + rightX * mx;
  let wishZ = fwdZ * mz + rightZ * mx;

  // --- Haltung ---
  const horizSpeed = Math.hypot(b.vx, b.vz);
  if (b.stance !== 'slide') {
    const wantSprint = inp.sprint && moving && mz > -0.2 && !inp.ads && !inp.using && !b.exhausted && b.stamina > 0;
    // Slide: Ducken-Taste während des Sprints
    if (first && inp.crouchPressed && b.sprinting && b.grounded && b.slideCd <= 0 && horizSpeed > WALK_SPEED * 1.15) {
      b.stance = 'slide';
      b.slideT = 0;
      b.sprinting = false;
      const dirX = horizSpeed > 0.1 ? b.vx / horizSpeed : fwdX;
      const dirZ = horizSpeed > 0.1 ? b.vz / horizSpeed : fwdZ;
      const sp = WALK_SPEED * SLIDE_START_MULT;
      b.vx = dirX * sp;
      b.vz = dirZ * sp;
      b.slideStarted = true;
    } else if (inp.crouch && !wantSprint) {
      b.stance = 'crouch';
      b.sprinting = false;
    } else {
      if (b.stance === 'crouch' && canStand(b, world, STAND_HEIGHT)) b.stance = 'stand';
      b.sprinting = wantSprint && b.stance === 'stand';
    }
  }

  // --- Ausdauer ---
  if (b.sprinting && horizSpeed > WALK_SPEED * 0.8) {
    b.stamina -= h / STAMINA_SPRINT_TIME;
    b.staminaCd = STAMINA_REGEN_DELAY;
    if (b.stamina <= 0) { b.stamina = 0; b.exhausted = true; b.sprinting = false; }
  } else if (b.staminaCd > 0) b.staminaCd -= h;
  else if (b.stamina < 1) {
    b.stamina = Math.min(1, b.stamina + h / STAMINA_REGEN_TIME);
    if (b.exhausted && b.stamina >= STAMINA_RECOVER) b.exhausted = false;
  }

  // --- Wasser ---
  const wl = terrain.waterLevelAt(b.x, b.z);
  b.waterDepth = Math.max(0, wl - b.y);

  if (b.stance === 'slide') {
    b.slideT += h;
    const sp = Math.hypot(b.vx, b.vz);
    const dirX = sp > 0.01 ? b.vx / sp : fwdX;
    const dirZ = sp > 0.01 ? b.vz / sp : fwdZ;
    // Hangbeschleunigung: bergab länger rutschen
    const g = terrain.gradientAt(b.x, b.z, tmpN);
    const slopeAlong = g.x * dirX + g.z * dirZ; // >0 bergauf
    let ns = sp - SLIDE_FRICTION * h - slopeAlong * 19 * h;
    if (b.waterDepth > 0.3) ns -= 10 * h;
    ns = Math.max(0, Math.min(ns, WALK_SPEED * 3));
    // leichte Lenkung
    const steer = 2 * h;
    let ndx = dirX + wishX * steer;
    let ndz = dirZ + wishZ * steer;
    const nl = Math.hypot(ndx, ndz) || 1;
    b.vx = (ndx / nl) * ns;
    b.vz = (ndz / nl) * ns;
    const done = (b.slideT > SLIDE_TIME && ns < WALK_SPEED * 1.25) || ns < 2.4 || b.slideT > SLIDE_MAX_TIME;
    if ((done || (inp.jump && b.grounded)) && canStand(b, world, CROUCH_HEIGHT)) {
      b.stance = inp.crouch && !inp.jump ? 'crouch' : 'stand';
      if (b.stance === 'stand' && !canStand(b, world, STAND_HEIGHT)) b.stance = 'crouch';
      b.slideCd = SLIDE_COOLDOWN;
      b.slideEnded = true;
    } else if (done && !canStand(b, world, CROUCH_HEIGHT)) {
      // unter etwas eingeklemmt (z. B. unter einen Steg gerutscht): liegend herauskriechen
      b.vx = wishX * WALK_SPEED * CROUCH_MULT;
      b.vz = wishZ * WALK_SPEED * CROUCH_MULT;
    }
  } else {
    // Zielgeschwindigkeit
    let speed = WALK_SPEED;
    if (b.sprinting) speed *= SPRINT_MULT;
    if (b.stance === 'crouch') speed *= CROUCH_MULT;
    if (inp.ads) speed *= ADS_MULT;
    if (inp.using) speed *= USE_MOVE_MULT;
    if (b.waterDepth > 0.3) speed *= Math.max(0.5, 1 - (b.waterDepth - 0.3) * 0.55);
    if (inp.speedMul) speed *= inp.speedMul; // Admin: Tempo
    const tx = wishX * speed;
    const tz = wishZ * speed;
    const accel = b.grounded ? (moving ? 11 : 13) : 2.2;
    const k = Math.min(1, accel * h);
    b.vx += (tx - b.vx) * k;
    b.vz += (tz - b.vz) * k;
  }

  // --- Springen ---
  if (inp.jump && b.grounded && first && b.waterDepth < 1.0) {
    if (b.stance === 'crouch' && canStand(b, world, STAND_HEIGHT)) b.stance = 'stand';
    if (b.stance !== 'crouch') {
      b.vy = JUMP_SPEED;
      b.grounded = false;
      b.jumped = true;
    }
  }

  // --- Steile Hänge: abrutschen ---
  if (b.grounded && b.groundMat === MAT.TERRAIN) {
    const nrm = terrain.normalAt(b.x, b.z, tmpN);
    if (nrm.y < MAX_WALK_SLOPE && b.y - terrain.heightAt(b.x, b.z) < 0.05) {
      b.vx += nrm.x * 26 * h;
      b.vz += nrm.z * 26 * h;
    }
  }

  // --- horizontale Bewegung ---
  const height = bodyHeight(b);
  let nx = b.x + b.vx * h;
  let nz = b.z + b.vz * h;

  // Steigungsgrenze bergauf
  if (b.grounded) {
    const hOld = terrain.heightAt(b.x, b.z);
    const hNew = terrain.heightAt(nx, nz);
    if (hNew > hOld + 0.001) {
      const nrm = terrain.normalAt(nx, nz, tmpN);
      if (nrm.y < MAX_WALK_SLOPE && hNew > b.y - 0.05) {
        // Anteil gegen den Hang entfernen
        const gl = Math.hypot(nrm.x, nrm.z) || 1;
        const ux = -nrm.x / gl, uz = -nrm.z / gl; // bergauf
        const mvx = nx - b.x, mvz = nz - b.z;
        const up = mvx * ux + mvz * uz;
        if (up > 0) {
          nx -= ux * up;
          nz -= uz * up;
          const vUp = b.vx * ux + b.vz * uz;
          if (vUp > 0) { b.vx -= ux * vUp; b.vz -= uz * vUp; }
        }
      }
    }
  }

  tmpPos.x = nx;
  tmpPos.z = nz;
  const hitWall = col.resolveCircle(tmpPos, PLAYER_RADIUS, b.y + STEP_HEIGHT, b.y + height);
  if (hitWall) {
    // Geschwindigkeit an Wand projizieren
    const cx = tmpPos.x - nx, cz = tmpPos.z - nz;
    const cl = Math.hypot(cx, cz);
    if (cl > 1e-6) {
      const wx = cx / cl, wz = cz / cl;
      const into = b.vx * wx + b.vz * wz;
      if (into < 0) { b.vx -= wx * into; b.vz -= wz * into; }
    }
  }
  nx = tmpPos.x;
  nz = tmpPos.z;

  // Tiefes Wasser / Inselgrenze: treibt zurück
  const wlN = terrain.waterLevelAt(nx, nz);
  const depthN = wlN - terrain.heightAt(nx, nz);
  if (wlN === SEA_LEVEL && depthN > DEEP_WATER) {
    const dl = Math.hypot(nx, nz) || 1;
    const inX = -nx / dl, inZ = -nz / dl;
    const out = b.vx * -inX + b.vz * -inZ;
    if (out > 0) { b.vx += inX * out; b.vz += inZ * out; }
    const mvOut = (nx - b.x) * -inX + (nz - b.z) * -inZ;
    if (mvOut > 0) { nx += inX * mvOut; nz += inZ * mvOut; }
    nx += inX * 3.5 * h;
    nz += inZ * 3.5 * h;
  }
  const r = Math.hypot(nx, nz);
  if (r > BOUNDARY_RADIUS) {
    nx *= BOUNDARY_RADIUS / r;
    nz *= BOUNDARY_RADIUS / r;
  }
  b.x = nx;
  b.z = nz;

  // --- vertikal ---
  const wasGrounded = b.grounded;
  b.vy -= GRAVITY * h;
  if (b.waterDepth > 0.9 && b.vy < -2) b.vy *= 1 - 3 * h; // Wasser bremst
  let ny = b.y + b.vy * h;

  // Decke
  if (b.vy > 0) {
    const ceil = col.ceilingAt(b.x, b.z, PLAYER_RADIUS, b.y + height - 0.25);
    if (ny + height > ceil) {
      ny = ceil - height;
      b.vy = 0;
    }
  }

  const tH = terrain.heightAt(b.x, b.z);
  const cH = col.groundAt(b.x, b.z, PLAYER_RADIUS * 0.7, Math.max(b.y, ny) + STEP_HEIGHT);
  let ground = tH;
  let gMat = MAT.TERRAIN;
  if (cH > ground) {
    ground = cH;
    gMat = col.groundMat;
  }
  // im tiefen Meer schwimmen: Füße nicht tiefer als Grenze
  const wl2 = terrain.waterLevelAt(b.x, b.z);
  if (wl2 === SEA_LEVEL && wl2 - ground > DEEP_WATER + 0.2) {
    ground = wl2 - DEEP_WATER - 0.2;
    gMat = MAT.WATER;
  }

  if (ny <= ground) {
    if (!wasGrounded) b.landed = Math.max(0.01, -b.vy);
    ny = ground;
    b.vy = 0;
    b.grounded = true;
  } else if (wasGrounded && b.vy <= 0 && ny - ground < 0.45) {
    ny = ground; // an Hängen/Treppen kleben
    b.vy = 0;
    b.grounded = true;
  } else {
    b.grounded = false;
  }
  b.groundMat = gMat;
  b.y = ny;
  b.airTime = b.grounded ? 0 : b.airTime + h;
  b.waterDepth = Math.max(0, terrain.waterLevelAt(b.x, b.z) - b.y);
  if (b.stance === 'slide' && !b.grounded && b.airTime > 0.35) {
    b.stance = 'stand';
    b.slideCd = SLIDE_COOLDOWN;
    b.slideEnded = true;
  }
}
