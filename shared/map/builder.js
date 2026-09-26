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
  // Bucht im Canyon
  SAND: 0xf2b886,
  CLIFF_BASE: 0xa9492f,
  CLIFF_RED: 0xc65a36,
  CLIFF_ORANGE: 0xdc7a45,
  CLIFF_LIGHT: 0xeaa06a,
  CLIFF_TOP: 0xd98752,
  STACK: 0xc9c7cf,
  STACK_DARK: 0xa9a6b2,
  TIN: 0xb6bac2,
  TIN_DARK: 0x8f949e,
  HOUSE_BLUE: 0x5ea8cf,
  HOUSE_BLUE_DARK: 0x3f7fa6,
  LIGHT_RED: 0xd23c3c,
  LAMP: 0xfff1a8,
  BOARD: 0x9a6a44,
  BOARD_LIGHT: 0xb68254,
  BOARD_DARK: 0x6e4a31,
  BUOY: 0xf5c518,
  // Inseln (Chapter-2-Orte)
  CONCRETE: 0xc4bfb4,
  CONCRETE_DARK: 0x8f8b84,
  BRICK: 0xb05a40,
  BRICK_DARK: 0x81412f,
  ROOF_GREY: 0x5d626b,
  ROOF_BLUE: 0x3f6f9f,
  ROOF_DARK: 0x3f3a38,
  WALL_GREEN: 0x92c27f,
  WALL_PINK: 0xf0a9b6,
  WALL_CREAM: 0xf3e3bd,
  WALL_GREY: 0xb9bdc3,
  WALL_ORANGE: 0xf0a25a,
  WALL_PURPLE: 0xa98bd6,
  STEEL: 0x9aa3ad,
  STEEL_DARK: 0x5f6873,
  SLURP: 0x46f2ff,
  SLURP_DARK: 0x238fb3,
  NEON: 0xff5ec4,
  TOWER: 0xd9d5cd,
  HEDGE: 0x3f8f3c,
  HEDGE_DARK: 0x2f7432,
  GOLD_TRIM: 0xdcb24c,
  NAVY: 0x2d406c,
  LINE: 0xf4f4f0,
  POOL: 0x4ecbe8,
  YELLOW: 0xf2c230,
  ORANGE: 0xe8792f,
  GREEN: 0x3f9a4a,
  BLUE: 0x2f6fd0,
  TEAL: 0x2a9d8f,
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
      pass: !!o.pass,
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

  railing(x1, z1, x2, z2, y, h = 1.0, c = C.WOOD_DARK) {
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const ry = Math.atan2(-dz / len, dx / len);
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    this.box(mx, y + h - 0.1, mz, len, 0.1, 0.12, c, { ry, col: false });
    this.box(mx, y + h * 0.5, mz, len, 0.08, 0.1, c, { ry, col: false });
    // Geländer/Zäune blockieren Laufen, aber nicht Kugeln (man kann hindurchschießen)
    this.blocker(mx, y, mz, len, h, 0.15, { ry, pass: true });
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

  // massive Treppe: Stufen steigen Richtung lokales -Z an (Unterkante ly)
  stairs(lx, lz, width, rise, run, steps, c = C.WOOD, ry = 0, ly = 0) {
    const b = this.sub(lx, lz, ry, ly);
    for (let i = 0; i < steps; i++) b.box(0, 0, -i * run, width, (i + 1) * rise, run, c, { m: MAT.WOOD });
    return b;
  }

  // Felsblock (achteckig abgeschrägt, oben schmaler) – Canyonwände und Felsen; ly = Unterkante
  slab(lx, ly, lz, w, h, d, c, o = {}) {
    this.parts.push({
      s: 'slab',
      x: this.wx(lx, lz), y: this.oy + ly + h / 2, z: this.wz(lx, lz),
      w, h, d,
      ry: this.rot + (o.ry || 0),
      c,
      taper: o.taper ?? 0.9,
      col: o.col !== false,
      m: o.m ?? MAT.STONE,
    });
    return this;
  }

  // Ruderboot (schwimmt knapp über dem Wasser)
  boat(lx, lz, ry = 0, c = C.WALL_BLUE, ly = 0) {
    const b = this.sub(lx, lz, ry, ly);
    b.box(0, 0, 0, 1.5, 0.5, 3.6, c, { m: MAT.WOOD });
    b.box(0, 0.12, 0, 1.2, 0.4, 3.2, C.WOOD_DARK, { col: false });
    b.box(0, 0.3, 0.1, 1.3, 0.08, 0.35, C.WOOD_LIGHT, { col: false });
    b.box(0, 0, -1.95, 0.9, 0.42, 0.5, c, { col: false, rx: -0.5 });
    b.box(0.55, 0.52, 0.8, 0.06, 0.06, 1.8, C.WOOD_LIGHT, { col: false, ry: 0.3, rz: 0.3 });
    return b;
  }

  // Wellblechdach (Pultdach, Rippen quer zur Neigung). Unterkante ly, Neigung Richtung +Z
  tinRoof(lx, ly, lz, w, d, rise, c = C.TIN) {
    const slope = Math.atan2(rise, d);
    const len = Math.hypot(d, rise);
    this.box(lx, ly, lz, w, 0.12, len, c, { rx: slope, col: false });
    const n = Math.max(3, Math.round(w / 0.45));
    for (let i = 0; i <= n; i++) {
      const x = lx - w / 2 + (i / n) * w;
      this.box(x, ly + 0.07, lz, 0.1, 0.07, len, i % 2 ? C.TIN_DARK : c, { rx: slope, col: false });
    }
    this.blocker(lx, ly - 0.05, lz, w, Math.abs(rise) * 0.5 + 0.2, d);
    return this;
  }

  // Laterne auf Pfahl
  lamppost(lx, lz, h = 2.6, ly = 0) {
    this.cyl(lx, ly, lz, 0.08, h, C.WOOD_DARK, { seg: 5 });
    this.box(lx, ly + h, lz, 0.32, 0.4, 0.32, C.LAMP, { col: false });
    this.box(lx, ly + h + 0.4, lz, 0.42, 0.08, 0.42, C.METAL_DARK, { col: false });
    return this;
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
}
