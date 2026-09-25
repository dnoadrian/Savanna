// Himmel mit Farbverlauf, Sonne und weichen Low-Poly-Wolken. Folgt der Kamera und
// wird mit der Sichtweite skaliert (Winkelgröße bleibt gleich).
import * as THREE from 'three';
import { GeoBuilder } from './geom.js';
import { RNG } from '../../shared/rng.js';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uStormColor;
uniform float uStorm;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
  col = mix(col, uStormColor, uStorm * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(opts = {}) {
    this.group = new THREE.Group();
    this.group.name = 'sky';
    this.uniforms = {
      uTop: { value: new THREE.Color(opts.top ?? 0x3f9be8) },
      uHorizon: { value: new THREE.Color(opts.horizon ?? 0xcfe8f5) },
      uBottom: { value: new THREE.Color(opts.bottom ?? 0xcfe8f5) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.62, 0.35).normalize() },
      uSunColor: { value: new THREE.Color(opts.sun ?? 0xfff2c4) },
      uStormColor: { value: new THREE.Color(0x7a3fc4) },
      uStorm: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
    // Wolken
    const rng = new RNG(opts.seed ?? 77);
    const g = new GeoBuilder();
    const n = opts.clouds ?? 26;
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.range(380, 760);
      const y = rng.range(150, 300);
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      const puffs = rng.int(3, 6);
      const size = rng.range(24, 48);
      for (let k = 0; k < puffs; k++) {
        const ox = (k - puffs / 2) * size * 0.7 + rng.range(-8, 8);
        const oz = rng.range(-12, 12);
        const s = size * rng.range(0.6, 1.05);
        g.ico(cx + ox * Math.cos(a + 1.57), y + rng.range(-4, 8), cz + ox * Math.sin(a + 1.57) + oz, s, 0xffffff, { sy: 0.55, detail: 1, jitter: 0.12, vary: 0.03, jseed: i * 10 + k });
      }
    }
    const cmat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0xb8c8d8, emissiveIntensity: 0.85, fog: false, transparent: true, opacity: 0.95 });
    this.clouds = new THREE.Mesh(g.toGeometry(), cmat);
    this.clouds.renderOrder = -9;
    this.clouds.frustumCulled = false;
    this.group.add(this.clouds);
    this.scale = 1;
  }

  setSun(dir) {
    this.uniforms.uSunDir.value.copy(dir).normalize();
  }

  update(camera, dt) {
    this.group.position.copy(camera.position);
    const s = Math.max(0.2, (camera.far * 0.92) / 900);
    if (s !== this.scale) {
      this.scale = s;
      this.group.scale.setScalar(s);
    }
    this.clouds.rotation.y += dt * 0.004;
  }
}
