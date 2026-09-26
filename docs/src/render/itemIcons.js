// Symbolbilder der Gegenstände für HUD/Inventar: die echten 3D-Waffenmodelle werden einmal in
// ein kleines Bild gerendert und zwischengespeichert (Data-URL).
import * as THREE from 'three';
import { itemGeometry, itemMaterial } from './weapons.js';
import { WEAPONS, WEAPON_TYPES, CONSUMABLE_TYPES, AMMO_TYPES } from '../../shared/items.js';

const W = 192, H = 96;
const cache = new Map();
let ctx = null;

function setup() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x51607a, 2.4));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(1, 2, 3);
  scene.add(d);
  const cam = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 20);
  cam.position.set(0, 0, 5);
  ctx = { renderer, scene, cam };
}

function keyOf(item) {
  return item.k === 'w' ? `w${item.w}${item.r}` : item.k === 'c' ? `c${item.c}` : `a${item.a}`;
}

export function itemIcon(item) {
  if (!item) return '';
  const key = keyOf(item);
  let url = cache.get(key);
  if (url) return url;
  try {
    if (!ctx) setup();
    const { renderer, scene, cam } = ctx;
    const mesh = new THREE.Mesh(itemGeometry(item, 1), itemMaterial());
    if (item.k === 'w') mesh.rotation.set(0, -Math.PI / 2, 0);
    else mesh.rotation.set(0.35, -0.6, 0);
    scene.add(mesh);
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const half = Math.max(sz.x / 2, sz.y) * 1.08;
    cam.left = c.x - half;
    cam.right = c.x + half;
    cam.top = c.y + half / 2;
    cam.bottom = c.y - half / 2;
    cam.position.set(c.x, c.y, 5);
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(mesh);
  } catch {
    url = '';
  }
  cache.set(key, url);
  return url;
}

// Alle Symbole beim Laden vorab erzeugen (kein Ruckler beim ersten Aufheben), danach den
// kleinen Zusatz-Renderer wieder freigeben.
export function preloadItemIcons() {
  for (const w of WEAPON_TYPES) for (const r of WEAPONS[w].rarities) itemIcon({ k: 'w', w, r });
  for (const c of CONSUMABLE_TYPES) itemIcon({ k: 'c', c });
  for (const a of AMMO_TYPES) itemIcon({ k: 'a', a });
  if (ctx) {
    ctx.renderer.dispose();
    ctx.renderer.forceContextLoss();
    ctx = null;
  }
}
