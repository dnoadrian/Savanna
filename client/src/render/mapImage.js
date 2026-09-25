// Vorgerenderte Draufsicht der Insel (für Minimap und große Karte).
import * as THREE from 'three';
import { surfaceColor } from './terrainMesh.js';
import { PROP_TYPES } from '/shared/map/props.js';

export const MAP_EXTENT = 640; // Karte zeigt -640..640

export function renderMapImage(map, size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const t = map.terrain;
  const col = new THREE.Color();
  const scale = (MAP_EXTENT * 2) / size;
  const sun = { x: -0.6, z: -0.5 };
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = -MAP_EXTENT + (px + 0.5) * scale;
      const z = -MAP_EXTENT + (py + 0.5) * scale;
      const h = t.heightAt(x, z);
      const wl = t.waterLevelAt(x, z);
      let r, gg, b;
      if (h < wl) {
        const depth = wl - h;
        const k = Math.min(1, depth / 6);
        r = 90 * (1 - k) + 30 * k;
        gg = 200 * (1 - k) + 120 * k;
        b = 210 * (1 - k) + 200 * k;
        if (depth < 0.5) { r = 190; gg = 235; b = 235; }
      } else {
        col.set(surfaceColor(t.surfaceAt(x, z)));
        col.convertLinearToSRGB();
        const hx = t.heightAt(x + 3, z) - t.heightAt(x - 3, z);
        const hz = t.heightAt(x, z + 3) - t.heightAt(x, z - 3);
        const shade = Math.max(0.6, Math.min(1.3, 1 + (hx * sun.x + hz * sun.z) * 0.08 + h * 0.004));
        r = col.r * 255 * shade;
        gg = col.g * 255 * shade;
        b = col.b * 255 * shade;
      }
      const o = (py * size + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = gg;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const toPx = (x) => ((x + MAP_EXTENT) / (MAP_EXTENT * 2)) * size;
  // Bäume als Punkte
  g.fillStyle = 'rgba(60,110,40,0.75)';
  for (const p of map.props) {
    const n = PROP_TYPES[p.t];
    if (n === 'acacia' || n === 'baobab' || n === 'palm_s') {
      g.beginPath();
      g.arc(toPx(p.x), toPx(p.z), n === 'baobab' ? 2.2 : 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Gebäude/Strukturen
  for (const p of map.parts) {
    if (!p.col || p.inv) continue;
    if (p.s !== 'box' && p.s !== 'cyl') continue;
    const w = (p.s === 'box' ? p.w : p.r * 2) / scale;
    const d = (p.s === 'box' ? p.d : p.r * 2) / scale;
    if (w * d < 0.5) continue;
    g.save();
    g.translate(toPx(p.x), toPx(p.z));
    g.rotate(-(p.ry || 0));
    const c3 = new THREE.Color(p.c || 0x777777);
    g.fillStyle = `rgb(${Math.round(c3.r * 200)},${Math.round(c3.g * 200)},${Math.round(c3.b * 200)})`;
    g.fillRect(-w / 2, -d / 2, Math.max(1, w), Math.max(1, d));
    g.restore();
  }
  // Bahnlinie
  g.strokeStyle = 'rgba(70,60,55,0.8)';
  g.lineWidth = 2;
  g.setLineDash([4, 3]);
  if (map.rail.segs.length) {
    g.beginPath();
    g.moveTo(toPx(map.rail.segs[0][0]), toPx(map.rail.z));
    g.lineTo(toPx(map.rail.segs[map.rail.segs.length - 1][0] + 12), toPx(map.rail.z));
    g.stroke();
  }
  g.setLineDash([]);
  return c;
}
