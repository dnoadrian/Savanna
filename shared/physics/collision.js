// Statische Kollisionswelt: um die Y-Achse gedrehte Boxen und senkrechte Zylinder,
// räumliches Hash-Gitter, Raycasts und Kreis-Auflösung für die Spielerbewegung.
import { WORLD_HALF } from '../constants.js';

export const MAT = {
  TERRAIN: 0,
  WOOD: 1,
  METAL: 2,
  STONE: 3,
  CLOTH: 4,
  PLANT: 5,
  WATER: 6,
  BONE: 7,
  PLAYER: 8,
};
export const MAT_NAMES = ['terrain', 'wood', 'metal', 'stone', 'cloth', 'plant', 'water', 'bone', 'player'];

const CELL = 8;
const GN = Math.ceil((WORLD_HALF * 2) / CELL);

export class CollisionWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.cols = [];
    this.grid = new Array(GN * GN);
    this.stamp = 0;
    this.hitOut = { t: 0, nx: 0, ny: 0, nz: 0, mat: 0, col: null };
  }

  cellRange(minX, maxX, minZ, maxZ) {
    const i0 = Math.max(0, Math.floor((minX + WORLD_HALF) / CELL));
    const i1 = Math.min(GN - 1, Math.floor((maxX + WORLD_HALF) / CELL));
    const j0 = Math.max(0, Math.floor((minZ + WORLD_HALF) / CELL));
    const j1 = Math.min(GN - 1, Math.floor((maxZ + WORLD_HALF) / CELL));
    return [i0, i1, j0, j1];
  }

  insert(c) {
    c.id = this.cols.length;
    c.mark = 0;
    this.cols.push(c);
    const [i0, i1, j0, j1] = this.cellRange(c.minX, c.maxX, c.minZ, c.maxZ);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * GN + i;
        (this.grid[k] || (this.grid[k] = [])).push(c);
      }
    }
    return c;
  }

  // Box: Mittelpunkt, volle Maße, Drehung um Y.
  addBox(x, y, z, w, h, d, ry = 0, mat = MAT.WOOD) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const cos = Math.cos(ry), sin = Math.sin(ry);
    const ex = Math.abs(cos) * hx + Math.abs(sin) * hz;
    const ez = Math.abs(sin) * hx + Math.abs(cos) * hz;
    return this.insert({
      kind: 0, x, y, z, hx, hy, hz, cos, sin, mat,
      minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez,
      minY: y - hy, maxY: y + hy,
    });
  }

  addCyl(x, z, r, y0, y1, mat = MAT.WOOD) {
    return this.insert({
      kind: 1, x, z, r, mat,
      minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r,
      minY: y0, maxY: y1,
    });
  }

  // Alle Collider, deren 2D-Fußabdruck den Bereich berühren könnte.
  query(minX, maxX, minZ, maxZ, out) {
    out.length = 0;
    const s = ++this.stamp;
    const [i0, i1, j0, j1] = this.cellRange(minX, maxX, minZ, maxZ);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const arr = this.grid[j * GN + i];
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const c = arr[k];
          if (c.mark === s) continue;
          c.mark = s;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Kreis (x,z,r) gegen Collider c im 2D. Gibt Eindringvektor zurück oder null.
  static circlePush(c, x, z, r, out) {
    if (c.kind === 1) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2) || 0.0001;
      const pen = rr - d;
      out.x = (dx / d) * pen;
      out.z = (dz / d) * pen;
      return true;
    }
    // In lokale Box-Koordinaten drehen
    const px = x - c.x;
    const pz = z - c.z;
    const lx = px * c.cos - pz * c.sin;
    const lz = px * c.sin + pz * c.cos;
    const cx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
    const cz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
    let dx = lx - cx;
    let dz = lz - cz;
    const d2 = dx * dx + dz * dz;
    let ox, oz;
    if (d2 > 1e-10) {
      if (d2 >= r * r) return false;
      const d = Math.sqrt(d2);
      const pen = r - d;
      ox = (dx / d) * pen;
      oz = (dz / d) * pen;
    } else {
      // Mittelpunkt in der Box: entlang der kleinsten Achse hinausschieben
      const penX = c.hx - Math.abs(lx) + r;
      const penZ = c.hz - Math.abs(lz) + r;
      if (penX < penZ) {
        ox = lx >= 0 ? penX : -penX;
        oz = 0;
      } else {
        ox = 0;
        oz = lz >= 0 ? penZ : -penZ;
      }
    }
    // zurück in Weltkoordinaten
    out.x = ox * c.cos + oz * c.sin;
    out.z = -ox * c.sin + oz * c.cos;
    return true;
  }

  static circleOverlapsFootprint(c, x, z, r) {
    if (c.kind === 1) {
      const dx = x - c.x, dz = z - c.z, rr = r + c.r;
      return dx * dx + dz * dz < rr * rr;
    }
    const px = x - c.x, pz = z - c.z;
    const lx = px * c.cos - pz * c.sin;
    const lz = px * c.sin + pz * c.cos;
    const cx = lx < -c.hx ? -c.hx : lx > c.hx ? c.hx : lx;
    const cz = lz < -c.hz ? -c.hz : lz > c.hz ? c.hz : lz;
    const dx = lx - cx, dz = lz - cz;
    return dx * dx + dz * dz < r * r;
  }

  // Schiebt einen senkrechten Zylinder (Kreis r, Höhe y0..y1) aus allen Collidern heraus.
  resolveCircle(pos, r, y0, y1) {
    const tmp = this._tmp || (this._tmp = []);
    const push = this._push || (this._push = { x: 0, z: 0 });
    let hitAny = false;
    for (let iter = 0; iter < 3; iter++) {
      this.query(pos.x - r - 0.1, pos.x + r + 0.1, pos.z - r - 0.1, pos.z + r + 0.1, tmp);
      let moved = false;
      for (let k = 0; k < tmp.length; k++) {
        const c = tmp[k];
        if (c.maxY <= y0 || c.minY >= y1) continue;
        if (CollisionWorld.circlePush(c, pos.x, pos.z, r, push)) {
          pos.x += push.x;
          pos.z += push.z;
          moved = true;
          hitAny = true;
        }
      }
      if (!moved) break;
    }
    return hitAny;
  }

  // Höchste begehbare Oberseite unter dem Kreis, die nicht höher als maxTop liegt.
  groundAt(x, z, r, maxTop) {
    const tmp = this._tmp2 || (this._tmp2 = []);
    this.query(x - r, x + r, z - r, z + r, tmp);
    let best = -Infinity;
    let mat = -1;
    for (let k = 0; k < tmp.length; k++) {
      const c = tmp[k];
      if (c.maxY > maxTop || c.maxY <= best) continue;
      if (CollisionWorld.circleOverlapsFootprint(c, x, z, r)) {
        best = c.maxY;
        mat = c.mat;
      }
    }
    this.groundMat = mat;
    return best;
  }

  // Niedrigste Unterseite über y (für Decken beim Springen/Aufstehen).
  ceilingAt(x, z, r, y) {
    const tmp = this._tmp2 || (this._tmp2 = []);
    this.query(x - r, x + r, z - r, z + r, tmp);
    let best = Infinity;
    for (let k = 0; k < tmp.length; k++) {
      const c = tmp[k];
      if (c.minY < y || c.minY >= best) continue;
      if (CollisionWorld.circleOverlapsFootprint(c, x, z, r * 0.9)) best = c.minY;
    }
    return best;
  }

  // Ist an Position (Kreis, Höhenbereich) ein Collider?
  overlaps(x, z, r, y0, y1) {
    const tmp = this._tmp2 || (this._tmp2 = []);
    this.query(x - r, x + r, z - r, z + r, tmp);
    for (let k = 0; k < tmp.length; k++) {
      const c = tmp[k];
      if (c.maxY <= y0 || c.minY >= y1) continue;
      if (CollisionWorld.circleOverlapsFootprint(c, x, z, r)) return true;
    }
    return false;
  }

  // Strahl gegen einen einzelnen Collider. Gibt t oder -1, setzt Normale in out.
  static rayCollider(c, ox, oy, oz, dx, dy, dz, maxT, out) {
    if (c.kind === 1) {
      // senkrechter Zylinder: Mantel + Deckel
      let best = -1;
      const px = ox - c.x, pz = oz - c.z;
      const a = dx * dx + dz * dz;
      if (a > 1e-12) {
        const b = px * dx + pz * dz;
        const cc = px * px + pz * pz - c.r * c.r;
        const disc = b * b - a * cc;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          let t = (-b - sq) / a;
          if (t < 0 && cc < 0) t = 0; // innen gestartet
          if (t >= 0 && t <= maxT) {
            const y = oy + dy * t;
            if (y >= c.minY && y <= c.maxY) {
              best = t;
              const hx = px + dx * t, hz = pz + dz * t;
              const l = Math.sqrt(hx * hx + hz * hz) || 1;
              out.nx = hx / l; out.ny = 0; out.nz = hz / l;
            }
          }
        }
      }
      if (Math.abs(dy) > 1e-9) {
        const capY = dy < 0 ? c.maxY : c.minY;
        const t = (capY - oy) / dy;
        if (t >= 0 && t <= maxT && (best < 0 || t < best)) {
          const hx = px + dx * t, hz = pz + dz * t;
          if (hx * hx + hz * hz <= c.r * c.r) {
            best = t;
            out.nx = 0; out.ny = dy < 0 ? 1 : -1; out.nz = 0;
          }
        }
      }
      return best;
    }
    // gedrehte Box: Strahl in lokale Koordinaten
    const px = ox - c.x, py = oy - c.y, pz = oz - c.z;
    const lox = px * c.cos - pz * c.sin;
    const loz = px * c.sin + pz * c.cos;
    const ldx = dx * c.cos - dz * c.sin;
    const ldz = dx * c.sin + dz * c.cos;
    let tmin = 0, tmax = maxT;
    let axis = -1, sign = 0;
    // X
    if (Math.abs(ldx) < 1e-12) {
      if (lox < -c.hx || lox > c.hx) return -1;
    } else {
      let t1 = (-c.hx - lox) / ldx, t2 = (c.hx - lox) / ldx;
      let s = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // Y
    if (Math.abs(dy) < 1e-12) {
      if (py < -c.hy || py > c.hy) return -1;
    } else {
      let t1 = (-c.hy - py) / dy, t2 = (c.hy - py) / dy;
      let s = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    // Z
    if (Math.abs(ldz) < 1e-12) {
      if (loz < -c.hz || loz > c.hz) return -1;
    } else {
      let t1 = (-c.hz - loz) / ldz, t2 = (c.hz - loz) / ldz;
      let s = -1;
      if (t1 > t2) { const q = t1; t1 = t2; t2 = q; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    let lnx = 0, lny = 0, lnz = 0;
    if (axis === 0) lnx = sign;
    else if (axis === 1) lny = sign;
    else if (axis === 2) lnz = sign;
    else lny = 1; // innen gestartet
    out.nx = lnx * c.cos + lnz * c.sin;
    out.ny = lny;
    out.nz = -lnx * c.sin + lnz * c.cos;
    return tmin;
  }

  // Raycast gegen statische Collider (DDA durch das Gitter), optional Terrain.
  // Ergebnis in this.hitOut; gibt Distanz oder -1.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, withTerrain = true) {
    const out = this.hitOut;
    const tmpN = this._tmpN || (this._tmpN = { nx: 0, ny: 0, nz: 0 });
    let best = maxDist;
    let found = false;
    const s = ++this.stamp;
    // 2D-DDA
    let gx = (ox + WORLD_HALF) / CELL;
    let gz = (oz + WORLD_HALF) / CELL;
    let i = Math.floor(gx), j = Math.floor(gz);
    const stepI = dx > 0 ? 1 : -1;
    const stepJ = dz > 0 ? 1 : -1;
    const invDx = Math.abs(dx) > 1e-12 ? 1 / Math.abs(dx) : Infinity;
    const invDz = Math.abs(dz) > 1e-12 ? 1 / Math.abs(dz) : Infinity;
    let tMaxI = invDx === Infinity ? Infinity : (dx > 0 ? (i + 1 - gx) : (gx - i)) * CELL * invDx;
    let tMaxJ = invDz === Infinity ? Infinity : (dz > 0 ? (j + 1 - gz) : (gz - j)) * CELL * invDz;
    const tDI = CELL * invDx;
    const tDJ = CELL * invDz;
    let tCell = 0;
    let guard = 0;
    while (tCell <= best && guard++ < 400) {
      if (i >= 0 && j >= 0 && i < GN && j < GN) {
        const arr = this.grid[j * GN + i];
        if (arr) {
          for (let k = 0; k < arr.length; k++) {
            const c = arr[k];
            if (c.mark === s) continue;
            c.mark = s;
            const t = CollisionWorld.rayCollider(c, ox, oy, oz, dx, dy, dz, best, tmpN);
            if (t >= 0 && t < best) {
              best = t;
              found = true;
              out.nx = tmpN.nx; out.ny = tmpN.ny; out.nz = tmpN.nz;
              out.mat = c.mat;
              out.col = c;
            }
          }
        }
      } else if ((i < 0 && stepI < 0) || (j < 0 && stepJ < 0) || (i >= GN && stepI > 0) || (j >= GN && stepJ > 0)) {
        break;
      }
      if (tMaxI < tMaxJ) {
        tCell = tMaxI;
        tMaxI += tDI;
        i += stepI;
      } else {
        tCell = tMaxJ;
        tMaxJ += tDJ;
        j += stepJ;
      }
    }
    if (withTerrain && this.terrain) {
      const tt = this.terrain.raycast(ox, oy, oz, dx, dy, dz, best);
      if (tt >= 0 && tt < best) {
        best = tt;
        found = true;
        const n = this.terrain.normalAt(ox + dx * tt, oz + dz * tt);
        out.nx = n.x; out.ny = n.y; out.nz = n.z;
        out.mat = MAT.TERRAIN;
        out.col = null;
      }
    }
    if (!found) return -1;
    out.t = best;
    return best;
  }

  // Sichtlinie frei?
  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    const t = this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05, true);
    return t < 0;
  }
}
