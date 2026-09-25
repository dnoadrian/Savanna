// Höhenfeld der Insel. Physik und Rendering verwenden exakt dieselbe
// Dreiecksaufteilung (Diagonale von (i+1,j) nach (i,j+1)).
import { SEA_LEVEL } from '../constants.js';

export const SURF = {
  GRASS: 0,
  DIRT: 1,
  ROCK: 3,
  BEACH: 4,
  PATH: 5,
  SEAFLOOR: 6,
  DRYGRASS: 8,
};

export class Terrain {
  constructor(heights, surface, n, cell, half) {
    this.h = heights; // Float32Array (n+1)*(n+1)
    this.surf = surface; // Uint8Array (n+1)*(n+1)
    this.n = n;
    this.cell = cell;
    this.half = half;
    this.stride = n + 1;
    let maxH = -Infinity;
    for (let i = 0; i < heights.length; i++) if (heights[i] > maxH) maxH = heights[i];
    this.maxHeight = maxH;
  }

  vertexHeight(i, j) {
    if (i < 0) i = 0; else if (i > this.n) i = this.n;
    if (j < 0) j = 0; else if (j > this.n) j = this.n;
    return this.h[j * this.stride + i];
  }

  heightAt(x, z) {
    const gx = (x + this.half) / this.cell;
    const gz = (z + this.half) / this.cell;
    let i = Math.floor(gx);
    let j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) {
      return this.vertexHeight(Math.round(gx), Math.round(gz));
    }
    const fx = gx - i;
    const fz = gz - j;
    const s = this.stride;
    const h = this.h;
    const idx = j * s + i;
    const h00 = h[idx];
    const h10 = h[idx + 1];
    const h01 = h[idx + s];
    const h11 = h[idx + s + 1];
    if (fx + fz <= 1) {
      return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    }
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  // Flächennormale des Dreiecks unter (x,z). Ergebnis in out {x,y,z}.
  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const c = this.cell;
    const gx = (x + this.half) / c;
    const gz = (z + this.half) / c;
    let i = Math.floor(gx);
    let j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) {
      out.x = 0; out.y = 1; out.z = 0;
      return out;
    }
    const fx = gx - i;
    const fz = gz - j;
    const s = this.stride;
    const idx = j * s + i;
    const h = this.h;
    let dhdx, dhdz;
    if (fx + fz <= 1) {
      dhdx = (h[idx + 1] - h[idx]) / c;
      dhdz = (h[idx + s] - h[idx]) / c;
    } else {
      dhdx = (h[idx + s + 1] - h[idx + s]) / c;
      dhdz = (h[idx + s + 1] - h[idx + 1]) / c;
    }
    const len = Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz);
    out.x = -dhdx / len;
    out.y = 1 / len;
    out.z = -dhdz / len;
    return out;
  }

  gradientAt(x, z, out = { x: 0, z: 0 }) {
    const n = this.normalAt(x, z);
    out.x = -n.x / n.y;
    out.z = -n.z / n.y;
    return out;
  }

  surfaceAt(x, z) {
    const i = Math.round((x + this.half) / this.cell);
    const j = Math.round((z + this.half) / this.cell);
    if (i < 0 || j < 0 || i > this.n || j > this.n) return SURF.SEAFLOOR;
    return this.surf[j * this.stride + i];
  }

  // Wasserspiegel an (x,z): nur das Meer (keine Teiche auf der kleinen Insel)
  waterLevelAt() {
    return SEA_LEVEL;
  }

  // Raycast gegen das Höhenfeld. Liefert Distanz oder -1.
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    const step = 1.0;
    let t = 0;
    let prevT = 0;
    let prevAbove = oy - this.heightAt(ox, oz);
    if (prevAbove < 0) return 0;
    const maxH = this.maxHeight + 0.5;
    while (t < maxDist) {
      t += step;
      if (t > maxDist) t = maxDist;
      const y = oy + dy * t;
      if (y > maxH && dy >= 0) return -1;
      const x = ox + dx * t;
      const z = oz + dz * t;
      const above = y - this.heightAt(x, z);
      if (above < 0) {
        // Binärsuche zwischen prevT und t
        let a = prevT;
        let b = t;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) * 0.5;
          const ym = oy + dy * m;
          if (ym - this.heightAt(ox + dx * m, oz + dz * m) < 0) b = m;
          else a = m;
        }
        return (a + b) * 0.5;
      }
      prevAbove = above;
      prevT = t;
      if (t >= maxDist) break;
    }
    return -1;
  }
}
