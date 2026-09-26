// Trefferzonen und Hitscan gegen Spieler (Schaden je Waffe: shared/items.js).
import { F } from '../constants.js';

// Lokale Hitboxen (stehend, Füße bei y=0, Blick nach -Z).
// part: 'h' Kopf, 'b' Körper, 'l' Arme/Beine
// Alle Trefferzonen sind 25 % größer als die sichtbare Figur (verzeihender, wie im Original).
export const HITBOX_SCALE = 1.25;
const S = HITBOX_SCALE;
export const PARTS = [
  { part: 'h', sphere: true, x: 0, y: 1.6, z: -0.02, r: 0.2 * S },
  { part: 'b', x: 0, y: 1.17, z: 0, hx: 0.27 * S, hy: 0.3 * S, hz: 0.17 * S },
  { part: 'l', x: 0.37, y: 1.2, z: -0.12, hx: 0.1 * S, hy: 0.28 * S, hz: 0.2 * S },
  { part: 'l', x: -0.37, y: 1.2, z: -0.12, hx: 0.1 * S, hy: 0.28 * S, hz: 0.2 * S },
  { part: 'l', x: 0, y: 0.44, z: 0, hx: 0.24 * S, hy: 0.44 * S, hz: 0.15 * S },
];

export function stanceScale(flags) {
  if (flags & F.SLIDE) return 0.55;
  if (flags & F.CROUCH) return 0.67;
  return 1;
}

// Strahl gegen die Hitboxen eines Spielers. p: {x,y,z,yaw,flags}
// Rückgabe { t, part } oder null
export function rayPlayer(p, ox, oy, oz, dx, dy, dz, maxT) {
  const sy = stanceScale(p.flags);
  // lokale Koordinaten
  const px = ox - p.x, py = oy - p.y, pz = oz - p.z;
  // grobe Bounding-Kugel
  const cy = 0.95 * sy;
  const bx = px, by = py - cy, bz = pz;
  const b = bx * dx + by * dy + bz * dz;
  const c = bx * bx + by * by + bz * bz - 1.5 * 1.5;
  if (c > 0 && b > 0) return null;
  if (b * b - c < 0) return null;
  const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
  const lox = px * cos - pz * sin;
  const loz = px * sin + pz * cos;
  const ldx = dx * cos - dz * sin;
  const ldz = dx * sin + dz * cos;
  let best = maxT;
  let bestPart = null;
  for (let k = 0; k < PARTS.length; k++) {
    const q = PARTS[k];
    if (q.sphere) {
      const qx = lox - q.x, qy = py - q.y * sy, qz = loz - q.z;
      const bb = qx * ldx + qy * dy + qz * ldz;
      const cc = qx * qx + qy * qy + qz * qz - q.r * q.r;
      const disc = bb * bb - cc;
      if (disc < 0) continue;
      const t = -bb - Math.sqrt(disc);
      if (t >= 0 && t < best) { best = t; bestPart = q.part; }
    } else {
      const hy = q.hy * sy;
      const t = slab(lox - q.x, py - q.y * sy, loz - q.z, ldx, dy, ldz, q.hx, hy, q.hz, best);
      if (t >= 0 && t < best) { best = t; bestPart = q.part; }
    }
  }
  if (!bestPart) return null;
  return { t: best, part: bestPart };
}

function slab(ox, oy, oz, dx, dy, dz, hx, hy, hz, maxT) {
  let tmin = 0, tmax = maxT;
  if (Math.abs(dx) < 1e-12) { if (ox < -hx || ox > hx) return -1; } else {
    let a = (-hx - ox) / dx, b = (hx - ox) / dx;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) tmin = a; if (b < tmax) tmax = b;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-12) { if (oy < -hy || oy > hy) return -1; } else {
    let a = (-hy - oy) / dy, b = (hy - oy) / dy;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) tmin = a; if (b < tmax) tmax = b;
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-12) { if (oz < -hz || oz > hz) return -1; } else {
    let a = (-hz - oz) / dz, b = (hz - oz) / dz;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > tmin) tmin = a; if (b < tmax) tmax = b;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Richtungsvektor aus Yaw/Pitch (yaw 0 = -Z, pitch >0 = nach oben)
export function dirFromAngles(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

export function anglesFromDir(dx, dy, dz) {
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
  return { yaw, pitch };
}

// Streut eine Richtung zufällig in einem Kegel (Grad)
export function applySpread(dir, spreadDeg, rnd) {
  if (spreadDeg <= 0) return dir;
  const a = (spreadDeg * Math.PI) / 180;
  // gleichmäßig in der Scheibe
  const r = Math.sqrt(rnd()) * Math.tan(a);
  const phi = rnd() * Math.PI * 2;
  // orthonormale Basis
  let ux, uy, uz;
  if (Math.abs(dir.y) < 0.95) { ux = -dir.z; uy = 0; uz = dir.x; } else { ux = 1; uy = 0; uz = 0; }
  let l = Math.hypot(ux, uy, uz);
  ux /= l; uy /= l; uz /= l;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;
  const ox = dir.x + (ux * Math.cos(phi) + vx * Math.sin(phi)) * r;
  const oy = dir.y + (uy * Math.cos(phi) + vy * Math.sin(phi)) * r;
  const oz = dir.z + (uz * Math.cos(phi) + vz * Math.sin(phi)) * r;
  l = Math.hypot(ox, oy, oz);
  return { x: ox / l, y: oy / l, z: oz / l };
}
