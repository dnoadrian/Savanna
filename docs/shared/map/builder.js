// Baukasten für Strukturen. Erzeugt "Parts" (Weltkoordinaten), die der Client rendert
// und aus denen Server + Client identische Collider bauen.
import { MAT } from '../physics/collision.js';

export const C = {
  WOOD: 0xb07a45,
  WOOD_DARK: 0x7a4e2a,
  WOOD_LIGHT: 0xd6a66c,
  PLANK: 0x9c6b3c,
  ROOF_RED: 0xc0492f,
  ROOF_TIN: 0x8d99a6,
  ROOF_GREEN: 0x4f7d5a,
  ROOF_BROWN: 0x8a5a3a,
  WALL_WHITE: 0xf1e3c8,
  WALL_BLUE: 0x7fb3d5,
  WALL_RED: 0xb33a2e,
  WALL_YELLOW: 0xf2c46d,
  WALL_TEAL: 0x5fb3a5,
  METAL: 0x7b8794,
  METAL_DARK: 0x3d4450,
  RUST: 0x9c4a26,
  ROCK: 0xa06d50,
  ROCK_DARK: 0x7a5140,
  ROCK_GREY: 0x8f8a84,
  CLOTH_TAN: 0xe3cc9f,
  CLOTH_GREEN: 0x6b8e4e,
  CLOTH_WHITE: 0xf5efe0,
  CLOTH_RED: 0xd9534f,
  CLOTH_BLUE: 0x4a7fb5,
  BONE: 0xf2ead3,
  BONE_DARK: 0xd6c8a8,
  GOLD: 0xf2c230,
  BLACK: 0x2b2b2b,
  TIRE: 0x262626,
  DARK: 0x1d1a18,
  LEAF: 0x6aa84f,
  PALM: 0x4f9a3a,
  PALM_TRUNK: 0x9a7650,
  HAY: 0xe8c35a,
  STONE: 0x9e9a92,
  FIRE: 0xff8c1a,
  FIRE2: 0xffd23f,
  GLASS: 0x9fd3e6,
  WHITE: 0xffffff,
  RED: 0xd63a2f,
  JEEP: 0x7d8f4a,
  JEEP2: 0xd9b25b,
  WATER: 0x3aa3c8,
};

export class Builder {
  constructor(parts, ox, oz, oy, rot = 0, groups = null) {
    this.parts = parts;
    this.ox = ox;
    this.oz = oz;
    this.oy = oy;
    this.rot = rot;
    this.cos = Math.cos(rot);
    this.sin = Math.sin(rot);
    this.groups = groups;
  }

  wx(lx, lz) {
    return this.ox + lx * this.cos + lz * this.sin;
  }

  wz(lx, lz) {
    return this.oz - lx * this.sin + lz * this.cos;
  }

  sub(lx, lz, rot = 0, ly = 0) {
    return new Builder(this.parts, this.wx(lx, lz), this.wz(lx, lz), this.oy + ly, this.rot + rot, this.groups);
  }

  // Box: ly = Unterkante
  box(lx, ly, lz, w, h, d, c, o = {}) {
    const rx = o.rx || 0, rz = o.rz || 0;
    this.parts.push({
      s: 'box',
      x: this.wx(lx, lz), y: this.oy + ly + h / 2, z: this.wz(lx, lz),
      w, h, d,
      ry: this.rot + (o.ry || 0), rx, rz,
      c,
      col: o.col !== false && !rx && !rz,
      m: o.m ?? MAT.WOOD,
      grp: o.grp,
    });
    return this;
  }

  // Zylinder / Kegel: ly = Unterkante
  cyl(lx, ly, lz, r, h, c, o = {}) {
    const rx = o.rx || 0, rz = o.rz || 0;
    this.parts.push({
      s: 'cyl',
      x: this.wx(lx, lz), y: this.oy + (o.center ? ly : ly + h / 2), z: this.wz(lx, lz),
      r, rt: o.rt ?? r, h, seg: o.seg || 8,
      ry: this.rot + (o.ry || 0), rx, rz,
      c,
      col: o.col !== false && !rx && !rz,
      m: o.m ?? MAT.WOOD,
      grp: o.grp,
    });
    return this;
  }

  // Kugel/Brocken (Icosaeder), ly = Mittelpunkt
  sph(lx, ly, lz, r, c, o = {}) {
    this.parts.push({
      s: 'sph',
      x: this.wx(lx, lz), y: this.oy + ly, z: this.wz(lx, lz),
      r, sx: o.sx || 1, sy: o.sy || 1, sz: o.sz || 1,
      ry: this.rot + (o.ry || 0), rx: o.rx || 0, rz: o.rz || 0,
      c,
      detail: o.detail ?? 0,
      col: o.col === true,
      m: o.m ?? MAT.STONE,
      grp: o.grp,
    });
    return this;
  }

  // Dreiecksprisma (Satteldach), ly = Unterkante; First entlang lokaler Z-Achse
  prism(lx, ly, lz, w, h, d, c, o = {}) {
    this.parts.push({
      s: 'prism',
      x: this.wx(lx, lz), y: this.oy + ly + h / 2, z: this.wz(lx, lz),
      w, h, d,
      ry: this.rot + (o.ry || 0), rx: o.rx || 0, rz: o.rz || 0,
      c,
      col: false,
      grp: o.grp,
    });
    if (o.col) {
      // grobe Kollision im unteren Teil des Daches
      this.box(lx, ly, lz, w * 0.7, h * 0.5, d, c, { ry: o.ry, m: o.m ?? MAT.WOOD, invisible: true });
      this.parts[this.parts.length - 1].inv = true;
    }
    return this;
  }

  // unsichtbarer Collider
  blocker(lx, ly, lz, w, h, d, o = {}) {
    this.box(lx, ly, lz, w, h, d, 0, o);
    this.parts[this.parts.length - 1].inv = true;
    return this;
  }

  // Wand von (x1,z1) nach (x2,z2) mit Öffnungen [{at, w, y0, y1}]
  wall(x1, z1, x2, z2, height, thick, c, openings = [], o = {}) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len;
    const ry = Math.atan2(-uz, ux);
    const seg = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.05 || y1 - y0 < 0.05) return;
      const mid = (s0 + s1) / 2;
      this.box(x1 + ux * mid, y0, z1 + uz * mid, s1 - s0, y1 - y0, thick, c, { ry, m: o.m ?? MAT.WOOD });
    };
    const ops = openings.slice().sort((a, b) => a.at - b.at);
    let cur = 0;
    for (const op of ops) {
      const a = op.at - op.w / 2;
      const b = op.at + op.w / 2;
      seg(cur, a, 0, height);
      seg(a, b, 0, op.y0);
      seg(a, b, op.y1, height);
      // Fensterrahmen
      if (op.y0 > 0.1 && o.frame !== false) {
        const fc = o.frameColor ?? C.WOOD_LIGHT;
        const mx = x1 + ux * op.at, mz = z1 + uz * op.at;
        this.box(mx, op.y0 - 0.08, mz, op.w + 0.2, 0.1, thick + 0.12, fc, { ry, col: false });
        this.box(mx, op.y1, mz, op.w + 0.2, 0.1, thick + 0.12, fc, { ry, col: false });
      }
      cur = b;
    }
    seg(cur, len, 0, height);
    return this;
  }

  // Haus mit Tür (vorne, +Z) und Fenstern, Satteldach. Mittelpunkt (lx,lz).
  house(lx, lz, w, d, o = {}) {
    const b = this.sub(lx, lz, o.rot || 0);
    const hh = o.wallH ?? 3.2;
    const t = 0.25;
    const wc = o.wall ?? C.WALL_WHITE;
    const rc = o.roof ?? C.ROOF_RED;
    const door = { at: o.doorAt ?? w / 2, w: o.doorW ?? 1.8, y0: 0, y1: 2.35 };
    const win = (at) => ({ at, w: 1.3, y0: 1.0, y1: 2.0 });
    // Boden
    b.box(0, 0, 0, w, 0.22, d, o.floor ?? C.PLANK, { m: MAT.WOOD });
    const hw = w / 2, hd = d / 2;
    const frontOps = [door];
    if (w > 7) frontOps.push(win(w * 0.2), win(w * 0.8));
    b.wall(-hw, hd, hw, hd, hh, t, wc, frontOps, o);
    const backOps = o.backDoor ? [{ at: w / 2, w: 1.6, y0: 0, y1: 2.3 }] : [win(w / 2)];
    b.wall(hw, -hd, -hw, -hd, hh, t, wc, backOps, o);
    const sideOps = d > 6 ? [win(d * 0.3), win(d * 0.7)] : [win(d / 2)];
    b.wall(-hw, -hd, -hw, hd, hh, t, wc, sideOps, o);
    b.wall(hw, hd, hw, -hd, hh, t, wc, sideOps, o);
    // Decke + Dach
    b.box(0, hh, 0, w + 0.1, 0.2, d + 0.1, o.ceil ?? C.WOOD_DARK, { m: MAT.WOOD });
    const rh = o.roofH ?? Math.min(2.4, w * 0.3);
    b.prism(0, hh + 0.2, 0, w + 0.9, rh, d + 0.9, rc, { col: true, ry: Math.PI / 2 * (o.ridgeX ? 1 : 0) });
    // Ecken-Balken
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(sx * (hw - 0.05), 0, sz * (hd - 0.05), 0.35, hh, 0.35, o.trim ?? C.WOOD_DARK, { col: false });
    }
    return b;
  }

  crate(lx, ly, lz, s = 1.2, ry = 0, c = C.WOOD) {
    this.box(lx, ly, lz, s, s, s, c, { ry, m: MAT.WOOD });
    this.box(lx, ly + s * 0.45, lz, s + 0.04, s * 0.1, s + 0.04, C.WOOD_DARK, { ry, col: false });
    return this;
  }

  barrel(lx, ly, lz, c = C.RUST) {
    this.cyl(lx, ly, lz, 0.42, 1.1, c, { seg: 10, m: MAT.METAL });
    this.cyl(lx, ly + 0.25, lz, 0.44, 0.08, C.METAL_DARK, { seg: 10, col: false });
    this.cyl(lx, ly + 0.78, lz, 0.44, 0.08, C.METAL_DARK, { seg: 10, col: false });
    return this;
  }

  // massive Treppe entlang lokaler +Z (vom Boden hoch), Stufen als Blöcke
  stairs(lx, lz, width, rise, run, steps, c = C.WOOD, ry = 0) {
    const b = this.sub(lx, lz, ry);
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      b.box(0, 0, -i * run - run / 2, width, top, run, c, { m: MAT.WOOD });
    }
    return b;
  }

  railing(x1, z1, x2, z2, y, h = 1.0, c = C.WOOD_DARK) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz / len, dx / len);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    this.box(mx, y + h - 0.1, mz, len, 0.1, 0.12, c, { ry, col: false });
    this.box(mx, y + h * 0.5, mz, len, 0.08, 0.1, c, { ry, col: false });
    this.blocker(mx, y, mz, len, h, 0.15, { ry });
    const n = Math.max(2, Math.round(len / 1.5) + 1);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      this.box(x1 + dx * k, y, z1 + dz * k, 0.12, h, 0.12, c, { col: false });
    }
    return this;
  }

  fence(x1, z1, x2, z2, c = C.WOOD) {
    return this.railing(x1, z1, x2, z2, 0, 1.1, c);
  }

  haybale(lx, lz, ry = 0, ly = 0) {
    this.cyl(lx, ly, lz, 0.75, 1.5, C.HAY, { rz: Math.PI / 2, ry, seg: 10, col: false });
    this.blocker(lx, ly, lz, 1.5, 1.45, 1.4, { ry, m: MAT.PLANT });
    this.parts[this.parts.length - 1].m = MAT.PLANT;
    return this;
  }

  jeep(lx, lz, ry = 0, c = C.JEEP) {
    const b = this.sub(lx, lz, ry);
    b.box(0, 0.55, 0, 2.0, 0.8, 4.2, c, { col: false });
    b.box(0, 1.35, 0.9, 1.9, 0.08, 0.1, C.METAL_DARK, { col: false, rx: -0.2 });
    b.box(0, 1.35, 0.95, 1.8, 0.55, 0.06, C.GLASS, { col: false });
    b.box(0, 1.35, -0.4, 1.9, 0.9, 0.08, C.METAL_DARK, { col: false });
    b.box(0.9, 1.35, -1.2, 0.08, 1.0, 0.08, C.METAL_DARK, { col: false });
    b.box(-0.9, 1.35, -1.2, 0.08, 1.0, 0.08, C.METAL_DARK, { col: false });
    b.box(0, 2.3, -0.6, 2.0, 0.08, 1.6, C.CLOTH_TAN, { col: false });
    b.box(0, 1.35, 1.3, 2.0, 0.25, 1.6, c, { col: false });
    for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) {
      b.cyl(sx * 1.0, 0.45, sz, 0.45, 0.4, C.TIRE, { rz: Math.PI / 2, seg: 10, col: false, center: true });
    }
    b.cyl(0, 0.9, -2.2, 0.42, 0.3, C.TIRE, { rx: Math.PI / 2, seg: 10, col: false });
    b.box(0.6, 1.0, 2.12, 0.3, 0.2, 0.05, C.FIRE2, { col: false });
    b.box(-0.6, 1.0, 2.12, 0.3, 0.2, 0.05, C.FIRE2, { col: false });
    b.blocker(0, 0, 0, 2.0, 1.4, 4.2, { m: MAT.METAL });
    this.parts[this.parts.length - 1].m = MAT.METAL;
    return b;
  }

  palm(lx, lz, h = 7, lean = 0.25, ry = 0) {
    const b = this.sub(lx, lz, ry);
    const segs = 5;
    let x = 0, y = 0;
    for (let i = 0; i < segs; i++) {
      const sh = h / segs;
      const r = 0.28 - i * 0.03;
      b.cyl(x, y, 0, r, sh + 0.05, C.PALM_TRUNK, { rt: r - 0.03, rz: -lean * (0.3 + i * 0.2), seg: 6, col: false });
      x += Math.sin(lean * (0.3 + i * 0.2)) * sh;
      y += Math.cos(lean * (0.3 + i * 0.2)) * sh;
    }
    b.cyl(0, 0, 0, 0.3, Math.min(3, h), C.PALM_TRUNK, { col: true, m: MAT.PLANT, seg: 6 });
    b.parts[b.parts.length - 1].inv = true;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.sub(x, 0, a, y).box(1.4, -0.1, 0, 3.0, 0.08, 0.9, k % 2 ? C.PALM : C.LEAF, { rz: -0.35, col: false });
    }
    b.sph(x, y + 0.1, 0, 0.35, C.WOOD_DARK, { col: false });
    return b;
  }

  campfire(lx, lz) {
    const b = this.sub(lx, lz);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.sph(Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0, 0.28, C.STONE, { sy: 0.7 });
    }
    b.cyl(0, 0.05, 0, 0.12, 1.4, C.WOOD_DARK, { rz: Math.PI / 2, col: false });
    b.cyl(0, 0.05, 0, 0.12, 1.4, C.WOOD_DARK, { rz: Math.PI / 2, ry: Math.PI / 2, col: false });
    b.cyl(0, 0.1, 0, 0.45, 0.9, C.FIRE, { rt: 0, seg: 6, col: false });
    b.cyl(0, 0.1, 0, 0.25, 1.2, C.FIRE2, { rt: 0, seg: 5, col: false });
    return b;
  }

  // begehbares Safari-Zelt (Stoffwände, Tür vorne)
  tent(lx, lz, w, d, c = C.CLOTH_TAN, ry = 0) {
    const b = this.sub(lx, lz, ry);
    const h = 2.2;
    b.box(0, 0, 0, w, 0.12, d, C.WOOD_DARK, { m: MAT.WOOD });
    b.wall(-w / 2, d / 2, w / 2, d / 2, h, 0.08, c, [{ at: w / 2, w: 1.6, y0: 0, y1: 2.1 }], { m: MAT.CLOTH, frame: false });
    b.wall(w / 2, -d / 2, -w / 2, -d / 2, h, 0.08, c, [], { m: MAT.CLOTH });
    b.wall(-w / 2, -d / 2, -w / 2, d / 2, h, 0.08, c, [{ at: d / 2, w: 1.0, y0: 1.0, y1: 1.7 }], { m: MAT.CLOTH, frame: false });
    b.wall(w / 2, d / 2, w / 2, -d / 2, h, 0.08, c, [{ at: d / 2, w: 1.0, y0: 1.0, y1: 1.7 }], { m: MAT.CLOTH, frame: false });
    b.prism(0, h, 0, w + 0.6, 1.5, d + 0.8, c === C.CLOTH_GREEN ? 0x5a7a40 : 0xd4b988, { ry: 0, col: false });
    b.blocker(0, h, 0, w, 0.5, d, { m: MAT.CLOTH });
    b.box(0, h + 1.4, d / 2 + 0.45, 0.1, 0.1, 0.1, C.WOOD_DARK, { col: false });
    b.box(-w / 2 - 0.4, 0, d / 2 + 0.6, 0.08, 1.2, 0.08, C.WOOD_DARK, { col: false, rz: 0.3 });
    b.box(w / 2 + 0.4, 0, d / 2 + 0.6, 0.08, 1.2, 0.08, C.WOOD_DARK, { col: false, rz: -0.3 });
    return b;
  }

  // offenes Sonnendach auf 4 Pfosten
  canopy(lx, lz, w, d, c = C.CLOTH_RED, ry = 0) {
    const b = this.sub(lx, lz, ry);
    const h = 2.6;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1), 0.08, h, C.WOOD_DARK, { seg: 5 });
    }
    b.prism(0, h, 0, w + 0.4, 0.9, d + 0.4, c, { col: false });
    return b;
  }

  windmill(lx, lz, grpKey, ry = 0, height = 11) {
    const b = this.sub(lx, lz, ry);
    const legs = [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]];
    for (const [x, z] of legs) {
      b.box(x * 0.62, 0, z * 0.62, 0.18, height, 0.18, C.METAL, { rx: -z * 0.07, rz: x * 0.07, col: false, m: MAT.METAL });
      b.cyl(x * 0.9, 0, z * 0.9, 0.12, 2.2, C.METAL, { col: true, m: MAT.METAL, seg: 5 });
      b.parts[b.parts.length - 1].inv = true;
    }
    for (let y = 2; y < height; y += 2.5) {
      const s = 1.4 - (y / height) * 0.55;
      b.box(0, y, s, s * 2, 0.08, 0.08, C.METAL, { col: false });
      b.box(0, y, -s, s * 2, 0.08, 0.08, C.METAL, { col: false });
      b.box(s, y, 0, 0.08, 0.08, s * 2, C.METAL, { col: false });
      b.box(-s, y, 0, 0.08, 0.08, s * 2, C.METAL, { col: false });
    }
    b.box(0, height, 0, 0.6, 0.6, 1.4, C.METAL_DARK, { col: false });
    b.box(0, height + 0.2, -1.6, 0.05, 1.0, 1.6, C.WALL_WHITE, { col: false });
    // Rotor (animiert)
    const pivot = { x: b.wx(0, 0.9), y: b.oy + height + 0.3, z: b.wz(0, 0.9) };
    if (this.groups) this.groups[grpKey] = { pivot, axis: 'z', ry: b.rot, speed: 1.6 };
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const bx = Math.cos(a) * 1.3, by = Math.sin(a) * 1.3;
      b.box(bx, height + 0.3 + by - 0.6, 0.9, 0.35, 1.2, 0.04, k % 2 ? C.WALL_WHITE : C.RED, { rz: a - Math.PI / 2, col: false, grp: grpKey });
    }
    b.cyl(0, height + 0.3, 0.95, 0.25, 0.2, C.METAL_DARK, { rx: Math.PI / 2, col: false, grp: grpKey });
    return b;
  }

  watertower(lx, lz, ry = 0, h = 7, c = C.WOOD) {
    const b = this.sub(lx, lz, ry);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.cyl(sx * 1.4, 0, sz * 1.4, 0.18, h, C.WOOD_DARK, { seg: 6 });
    }
    b.box(0, h * 0.45, 1.4, 2.8, 0.12, 0.12, C.WOOD_DARK, { col: false, rz: 0.6 });
    b.box(0, h * 0.45, -1.4, 2.8, 0.12, 0.12, C.WOOD_DARK, { col: false, rz: -0.6 });
    b.box(0, h, 0, 3.4, 0.2, 3.4, C.WOOD_DARK, { m: MAT.WOOD });
    b.cyl(0, h + 0.2, 0, 1.8, 3.0, c, { seg: 12, m: MAT.WOOD });
    for (let y = 0.4; y < 3; y += 0.9) b.cyl(0, h + 0.2 + y, 0, 1.84, 0.1, C.METAL_DARK, { seg: 12, col: false });
    b.cyl(0, h + 3.2, 0, 2.0, 1.2, C.ROOF_TIN, { rt: 0.1, seg: 12, col: false });
    return b;
  }

  boat(lx, lz, ry = 0, c = C.WALL_BLUE, ly = 0) {
    const b = this.sub(lx, lz, ry, ly);
    b.box(0, 0.15, 0, 1.8, 0.7, 4.6, c, { m: MAT.WOOD });
    b.box(0, 0.25, 2.55, 1.2, 0.6, 0.8, c, { col: false, ry: 0 });
    b.box(0, 0.35, 2.9, 0.6, 0.5, 0.5, c, { col: false });
    b.box(0, 0.0, 0, 1.2, 0.2, 4.0, C.WOOD_DARK, { col: false });
    b.box(0, 0.85, 0, 1.9, 0.08, 4.7, C.WHITE, { col: false });
    b.box(0, 0.6, 0.3, 1.6, 0.1, 0.4, C.WOOD_LIGHT, { col: false });
    b.box(0, 0.6, -1.2, 1.6, 0.1, 0.4, C.WOOD_LIGHT, { col: false });
    return b;
  }

  signpost(lx, lz, angles, ly = 0) {
    const b = this.sub(lx, lz, 0, ly);
    b.cyl(0, 0, 0, 0.09, 2.6, C.WOOD_DARK, { seg: 5, col: false });
    angles.forEach((a, i) => {
      const s = b.sub(0, 0, a);
      s.box(0.7, 2.1 - i * 0.45, 0, 1.3, 0.32, 0.06, i % 2 ? C.WOOD_LIGHT : C.WOOD, { col: false });
      s.box(1.42, 2.1 - i * 0.45 + 0.05, 0, 0.22, 0.22, 0.06, i % 2 ? C.WOOD_LIGHT : C.WOOD, { col: false, rz: Math.PI / 4 });
    });
    return b;
  }

  minecart(lx, lz, ry = 0, ly = 0, ore = C.GOLD) {
    const b = this.sub(lx, lz, ry, ly);
    b.box(0, 0.35, 0, 1.2, 0.8, 1.7, C.RUST, { m: MAT.METAL });
    b.box(0, 1.1, 0, 1.3, 0.08, 1.8, C.METAL_DARK, { col: false });
    b.sph(0, 1.15, 0, 0.5, ore, { sy: 0.5, col: false, detail: 0 });
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) {
      b.cyl(sx, 0.22, sz, 0.22, 0.12, C.METAL_DARK, { rz: Math.PI / 2, col: false, center: true });
    }
    return b;
  }

  // Schienenstück entlang lokaler Z
  rails(lx, lz, len, ry = 0, ly = 0, sleeperC = C.WOOD_DARK) {
    const b = this.sub(lx, lz, ry, ly);
    const n = Math.floor(len / 0.9);
    for (let i = 0; i < n; i++) b.box(0, 0.0, -len / 2 + i * 0.9 + 0.45, 2.2, 0.12, 0.3, sleeperC, { col: false });
    b.box(-0.72, 0.12, 0, 0.1, 0.14, len, C.METAL_DARK, { col: false });
    b.box(0.72, 0.12, 0, 0.1, 0.14, len, C.METAL_DARK, { col: false });
    return b;
  }
}
