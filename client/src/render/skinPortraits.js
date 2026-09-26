// Vorschaubilder der Skins für Shop und Spind: die echte 3D-Figur wird einmal in ein kleines Bild
// gerendert und zwischengespeichert (Data-URL).
import * as THREE from 'three';
import { Character } from './characters.js';

const W = 200, H = 250;
const cache = new Map();
let ctx = null;

function setup() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x3a4f8a, 2.0));
  const d = new THREE.DirectionalLight(0xffffff, 2.2);
  d.position.set(-2, 3, 4);
  scene.add(d);
  const rim = new THREE.DirectionalLight(0x7fd4ff, 1.6);
  rim.position.set(3, 2, -3);
  scene.add(rim);
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.1, 30);
  cam.position.set(0, 1.05, 5.2);
  cam.lookAt(0, 0.95, 0);
  ctx = { renderer, scene, cam };
}

export function skinPortrait(outfit, color = 0) {
  const key = outfit + ':' + color;
  let url = cache.get(key);
  if (url) return url;
  try {
    if (!ctx) setup();
    const { renderer, scene, cam } = ctx;
    const c = new Character({ outfit, color, name: 'Vorschau' });
    c.setHand(0);
    for (let i = 0; i < 3; i++) c.update(0.05, { vx: 0, vz: 0, yaw: Math.PI + 0.35, pitch: 0, flags: 0 });
    scene.add(c.root);
    c.root.updateMatrixWorld(true);
    renderer.render(scene, cam);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(c.root);
    c.dispose();
  } catch {
    url = '';
  }
  cache.set(key, url);
  return url;
}
