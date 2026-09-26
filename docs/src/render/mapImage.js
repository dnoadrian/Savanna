// Vorgerenderte Draufsicht der Insel (für Minimap und große Karte).
import * as THREE from 'three';
import { surfaceColor } from './terrainMesh.js';
import { PROP_TYPES } from '../../shared/map/props.js';

export const MAP_EXTENT = 112; // Karte zeigt die ganze Bucht bis zu den Canyonwänden

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
        // türkises Flachwasser
        const depth = wl - h;
        const k = Math.min(1, depth / 1.1);
        r = 130 * (1 - k) + 40 * k;
        gg = 232 * (1 - k) + 190 * k;
        b = 222 * (1 - k) + 214 * k;
        if (depth < 0.08) { r = 225; gg = 250; b = 245; }
      } else {
        col.set(surfaceColor(t.surfaceAt(x, z)));
        col.convertLinearToSRGB();
        const hx = t.heightAt(x + 1, z) - t.heightAt(x - 1, z);
        const hz = t.heightAt(x, z + 1) - t.heightAt(x, z - 1);
        const shade = Math.max(0.6, Math.min(1.3, 1 + (hx * sun.x + hz * sun.z) * 0.35 + h * 0.02));
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
  const shade = new THREE.Color();
  // Bäume und Felsen in echter Größe
  const CANOPY = { palm: 2.6, palm_s: 2.0, bush: 1.0, rock_l: 2.0, rock_m: 1.0 };
  for (const p of map.props) {
    const n = PROP_TYPES[p.t];
    const r = CANOPY[n];
    if (!r) continue;
    g.fillStyle = n.startsWith('rock') ? 'rgba(150,70,45,0.85)' : 'rgba(50,140,50,0.75)';
    g.beginPath();
    g.arc(toPx(p.x), toPx(p.z), (r * p.s) / scale, 0, Math.PI * 2);
    g.fill();
  }
  // Gebäude/Strukturen (Dächer zuletzt, sie verdecken Boden und Wände)
  for (const p of map.parts) {
    if (p.inv || (!p.col && p.s !== 'prism' && p.s !== 'slab')) continue;
    if (p.s !== 'box' && p.s !== 'cyl' && p.s !== 'prism' && p.s !== 'slab') continue;
    const w = (p.s === 'cyl' ? p.r * 2 : p.w) / scale;
    const d = (p.s === 'cyl' ? p.r * 2 : p.d) / scale;
    if (w * d < 0.5) continue;
    g.save();
    g.translate(toPx(p.x), toPx(p.z));
    g.rotate(-(p.ry || 0));
    g.fillStyle = shade.set(p.c || 0x777777).multiplyScalar(0.8).getStyle();
    g.fillRect(-w / 2, -d / 2, Math.max(1, w), Math.max(1, d));
    g.restore();
  }
  return c;
}
