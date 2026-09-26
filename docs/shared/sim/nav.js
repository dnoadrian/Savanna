// Navigationsgitter (1 m) mit A*-Wegfindung für Bots. Begehbare Flächen sind Terrain oder
// niedrige Collider-Oberseiten (Stege, Böden); zu hohe Stufen (z. B. aus dem Wasser auf einen Steg) sind gesperrt.
import { MAX_WALK_SLOPE } from '../constants.js';
import { CollisionWorld } from '../physics/collision.js';

const HALF = 104;
const CELL = 1;
const N = (HALF * 2) / CELL;
const SQ2 = Math.SQRT2;

const FREE = 0, STEEP = 1, BLOCKED = 2;

export class NavGrid {
  constructor(terrain, collision) {
    this.terrain = terrain;
    this.collision = collision;
    this.n = N;
    this.walk = new Uint8Array(N * N);
    this.h = new Float32Array(N * N);
    this.cover = new Uint8Array(N * N);
    this.g = new Float32Array(N * N);
    this.f = new Float32Array(N * N);
    this.parent = new Int32Array(N * N);
    this.openStamp = new Uint32Array(N * N);
    this.closedStamp = new Uint32Array(N * N);
    this.search = 0;
    this.heap = new Int32Array(N * N);
    this.build();
  }

  cellX(i) { return -HALF + (i + 0.5) * CELL; }
  toCell(x) { return Math.floor((x + HALF) / CELL); }

  build() {
    const t = this.terrain;
    const nrm = { x: 0, y: 1, z: 0 };
    for (let j = 0; j < N; j++) {
      const z = this.cellX(j);
      for (let i = 0; i < N; i++) {
        const x = this.cellX(i);
        const idx = j * N + i;
        const tH = t.heightAt(x, z);
        const gH = this.collision.groundAt(x, z, 0.3, Math.max(tH, 0) + 1.3);
        const h = Math.max(tH, gH);
        this.h[idx] = h;
        const wl = t.waterLevelAt(x, z);
        if (wl - h > 0.85) { this.walk[idx] = BLOCKED; continue; }
        if (gH > tH + 0.05) { this.walk[idx] = FREE; continue; }
        t.normalAt(x, z, nrm);
        this.walk[idx] = nrm.y < MAX_WALK_SLOPE ? STEEP : FREE;
      }
    }
    // Collider rasterisieren
    const R = 0.45;
    const blockedByCol = new Uint8Array(N * N);
    for (const c of this.collision.cols) {
      const i0 = Math.max(0, this.toCell(c.minX - R)), i1 = Math.min(N - 1, this.toCell(c.maxX + R));
      const j0 = Math.max(0, this.toCell(c.minZ - R)), j1 = Math.min(N - 1, this.toCell(c.maxZ + R));
      for (let j = j0; j <= j1; j++) {
        const z = this.cellX(j);
        for (let i = i0; i <= i1; i++) {
          const idx = j * N + i;
          if (this.walk[idx] === BLOCKED) continue;
          const g = this.h[idx];
          if (c.maxY <= g + 0.5 || c.minY >= g + 1.7) continue;
          if (CollisionWorld.circleOverlapsFootprint(c, this.cellX(i), z, R)) {
            this.walk[idx] = BLOCKED;
            if (c.maxY - g > 1.1) blockedByCol[idx] = 1;
          }
        }
      }
    }
    // Deckungs-Zellen: frei, mit hohem Collider als Nachbar
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i;
        if (this.walk[idx] !== FREE) continue;
        if (blockedByCol[idx - 1] || blockedByCol[idx + 1] || blockedByCol[idx - N] || blockedByCol[idx + N]) this.cover[idx] = 1;
      }
    }
  }

  isFree(x, z) {
    const i = this.toCell(x), j = this.toCell(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return this.walk[j * N + i] === FREE;
  }

  nearestFree(x, z, maxR = 12) {
    const ci = this.toCell(x), cj = this.toCell(z);
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          if (this.walk[j * N + i] === FREE) return j * N + i;
        }
      }
    }
    return -1;
  }

  canStep(from, to) {
    const w = this.walk[to];
    if (w === BLOCKED) return false;
    const dh = this.h[to] - this.h[from];
    if (dh > 0.6) return false; // zu hohe Stufe
    if (w === STEEP) return dh < -0.2;
    return true;
  }

  // Höhe der begehbaren Fläche an (x, z) (für Erreichbarkeit von Truhen)
  groundH(x, z) {
    const i = this.toCell(x), j = this.toCell(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return -99;
    return this.h[j * N + i];
  }

  heapPush(idx, size) {
    const heap = this.heap, f = this.f;
    let i = size;
    heap[i] = idx;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t;
      i = p;
    }
  }

  heapPop(size) {
    const heap = this.heap, f = this.f;
    const top = heap[0];
    const last = heap[size - 1];
    heap[0] = last;
    let i = 0;
    const n = size - 1;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && f[heap[l]] < f[heap[m]]) m = l;
      if (r < n && f[heap[r]] < f[heap[m]]) m = r;
      if (m === i) break;
      const t = heap[m]; heap[m] = heap[i]; heap[i] = t;
      i = m;
    }
    return top;
  }

  // A*; gibt Wegpunkte [[x,z],...] zurück (geglättet) oder null
  findPath(sx, sz, tx, tz, maxExpand = 50000) {
    let start = this.nearestFree(sx, sz, 6);
    if (start < 0) {
      const i = this.toCell(sx), j = this.toCell(sz);
      if (i < 0 || j < 0 || i >= N || j >= N) return null;
      start = j * N + i;
    }
    const goal = this.nearestFree(tx, tz, 12);
    if (goal < 0) return null;
    const s = ++this.search;
    const gi = goal % N, gj = (goal / N) | 0;
    const hfun = (idx) => {
      const di = Math.abs((idx % N) - gi), dj = Math.abs(((idx / N) | 0) - gj);
      return (di + dj + (SQ2 - 2) * Math.min(di, dj)) * 1.05;
    };
    this.g[start] = 0;
    this.f[start] = hfun(start);
    this.parent[start] = -1;
    this.openStamp[start] = s;
    let size = 0;
    this.heapPush(start, size++);
    let best = start, bestH = this.f[start];
    let expand = 0;
    let found = false;
    const walk = this.walk;
    while (size > 0 && expand < maxExpand) {
      const cur = this.heapPop(size--);
      if (this.closedStamp[cur] === s) continue;
      this.closedStamp[cur] = s;
      expand++;
      if (cur === goal) { found = true; best = cur; break; }
      const hc = this.f[cur] - this.g[cur];
      if (hc < bestH) { bestH = hc; best = cur; }
      const ci = cur % N, cj = (cur / N) | 0;
      for (let dj = -1; dj <= 1; dj++) {
        const nj = cj + dj;
        if (nj < 0 || nj >= N) continue;
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          if (ni < 0 || ni >= N) continue;
          const nb = nj * N + ni;
          if (this.closedStamp[nb] === s) continue;
          if (!this.canStep(cur, nb)) continue;
          if (di && dj) {
            // keine Ecken schneiden
            if (walk[cj * N + ni] === BLOCKED || walk[nj * N + ci] === BLOCKED) continue;
          }
          let cost = di && dj ? SQ2 : 1;
          if (walk[nb] === STEEP) cost += 1;
          if (this.cover[nb]) cost += 0.15; // an Wänden entlang leicht teurer
          const ng = this.g[cur] + cost;
          if (this.openStamp[nb] === s && ng >= this.g[nb]) continue;
          this.openStamp[nb] = s;
          this.g[nb] = ng;
          this.f[nb] = ng + hfun(nb);
          this.parent[nb] = cur;
          if (size < this.heap.length) this.heapPush(nb, size++);
        }
      }
    }
    // Pfad rekonstruieren
    const cells = [];
    let c = best;
    let guard = 0;
    while (c >= 0 && guard++ < 100000) {
      cells.push(c);
      c = this.parent[c];
    }
    cells.reverse();
    if (cells.length === 0) return null;
    const pts = this.smooth(cells);
    if (found) pts.push([tx, tz]);
    return { points: pts, complete: found };
  }

  lineWalkable(a, b) {
    const ax = this.cellX(a % N), az = this.cellX((a / N) | 0);
    const bx = this.cellX(b % N), bz = this.cellX((b / N) | 0);
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(d / 0.9);
    let prev = a;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const i = this.toCell(x), j = this.toCell(z);
      const idx = j * N + i;
      if (idx === prev) continue;
      if (!this.canStep(prev, idx)) return false;
      // Ecken
      for (const o of [0.45, -0.45]) {
        const i2 = this.toCell(x + o), j2 = this.toCell(z + o);
        if (this.walk[j2 * N + i2] === BLOCKED || this.walk[j * N + i2] === BLOCKED || this.walk[j2 * N + i] === BLOCKED) return false;
      }
      prev = idx;
    }
    return true;
  }

  smooth(cells) {
    const out = [];
    let i = 0;
    while (i < cells.length) {
      out.push([this.cellX(cells[i] % N), this.cellX((cells[i] / N) | 0)]);
      if (i === cells.length - 1) break;
      let j = Math.min(cells.length - 1, i + 40);
      while (j > i + 1 && !this.lineWalkable(cells[i], cells[j])) j--;
      i = j;
    }
    return out;
  }

  randomFree(rng, cx, cz, r, tries = 30) {
    for (let k = 0; k < tries; k++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (this.isFree(x, z)) return [x, z];
    }
    return null;
  }

  // Deckung: freie Zelle neben hohem Hindernis, die aus Sicht der Bedrohung verdeckt ist
  findCover(bx, bz, tx, ty, tz, radius = 18) {
    const ci = this.toCell(bx), cj = this.toCell(bz);
    const rc = Math.ceil(radius / CELL);
    const cands = [];
    for (let dj = -rc; dj <= rc; dj++) {
      const j = cj + dj;
      if (j < 1 || j >= N - 1) continue;
      for (let di = -rc; di <= rc; di++) {
        const i = ci + di;
        if (i < 1 || i >= N - 1) continue;
        const idx = j * N + i;
        if (!this.cover[idx]) continue;
        const d2 = di * di + dj * dj;
        if (d2 > rc * rc) continue;
        cands.push(d2, idx);
      }
    }
    // nach Distanz sortieren (Paare)
    const idxs = [];
    for (let k = 0; k < cands.length; k += 2) idxs.push(k);
    idxs.sort((a, b) => cands[a] - cands[b]);
    let checked = 0;
    for (const k of idxs) {
      if (checked++ > 14) break;
      const idx = cands[k + 1];
      const x = this.cellX(idx % N), z = this.cellX((idx / N) | 0);
      // weiter weg von der Bedrohung als näher ran
      const dThreat = Math.hypot(x - tx, z - tz);
      if (dThreat < 6) continue;
      const y = this.h[idx] + 1.0;
      if (!this.collision.lineOfSight(tx, ty, tz, x, y, z)) return [x, z];
    }
    return null;
  }
}
