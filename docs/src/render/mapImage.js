// Vorgerenderte Draufsicht der Insel (für Minimap und große Karte).
import * as THREE from 'three';
import { surfaceColor } from './terrainMesh.js';
import { PROP_TYPES } from '../../shared/map/props.js';

export const MAP_EXTENT = 178; // Karte zeigt die ganze Insel mit etwas Meer drumherum

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
        // kaltes Meer: helles Flachwasser, tiefes Blau
        const depth = wl - h;
        const k = Math.min(1, depth / 2.5);
        r = 118 * (1 - k) + 30 * k;
        gg = 204 * (1 - k) + 118 * k;
        b = 216 * (1 - k) + 170 * k;
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
  const CANOPY = { palm: 2.6, palm_s: 2.0, bush: 1.0, rock_l: 2.0, rock_m: 1.0, tree: 2.2, pine: 1.6, snowpine: 1.9, stone_l: 2.0, stone_m: 1.0, car: 1.2, boulder: 1.3, icechunk: 1.2, floe: 2.8 };
  const CANOPY_COL = {
    rock_l: 'rgba(150,70,45,0.85)', rock_m: 'rgba(150,70,45,0.85)', stone_l: 'rgba(130,135,140,0.9)', stone_m: 'rgba(130,135,140,0.9)',
    pine: 'rgba(30,90,45,0.85)', snowpine: 'rgba(52,104,70,0.85)', car: 'rgba(200,70,60,0.9)',
    boulder: 'rgba(120,98,82,0.9)', icechunk: 'rgba(70,190,230,0.9)', floe: 'rgba(236,244,250,0.95)',
  };
  for (const p of map.props) {
    const n = PROP_TYPES[p.t];
    const r = CANOPY[n];
    if (!r) continue;
    g.fillStyle = CANOPY_COL[n] || 'rgba(50,140,50,0.75)';
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
