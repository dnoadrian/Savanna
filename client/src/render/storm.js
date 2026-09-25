// Lila Sturmwand (offener Zylinder mit animiertem Shader).
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const frag = /* glsl */ `
uniform float uTime;
uniform float uFar;
varying vec2 vUv;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float a = vUv.x * 160.0;
  float y = vWorld.y;
  float n = vnoise(vec2(a * 0.6 + uTime * 0.4, y * 0.05 - uTime * 0.6)) * 0.6 + vnoise(vec2(a * 2.0 - uTime, y * 0.2 + uTime * 0.3)) * 0.4;
  vec3 c1 = vec3(0.45, 0.18, 0.78);
  vec3 c2 = vec3(0.78, 0.45, 1.0);
  vec3 col = mix(c1, c2, n);
  float stripes = smoothstep(0.55, 0.9, sin(y * 0.35 + n * 5.0 - uTime * 2.0) * 0.5 + 0.5);
  col += vec3(0.25, 0.15, 0.35) * stripes;
  float fadeTop = 1.0 - smoothstep(60.0, 190.0, y);
  float dist = length(cameraPosition.xz - vWorld.xz);
  float fadeFar = 1.0 - smoothstep(uFar * 0.35, uFar, dist) * 0.85;
  float alpha = (0.38 + n * 0.25 + stripes * 0.15) * fadeTop * fadeFar;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export class StormWall {
  constructor() {
    this.uniforms = { uTime: { value: 0 }, uFar: { value: 600 } };
    const geo = new THREE.CylinderGeometry(1, 1, 220, 128, 1, true);
    geo.translate(0, 90, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'storm';
  }

  update(zone, dt, far = 600) {
    this.uniforms.uTime.value += dt;
    this.uniforms.uFar.value = far;
    if (!zone || zone.r > 5000) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(zone.x, -20, zone.z);
    const r = Math.max(0.5, zone.r);
    this.mesh.scale.set(r, 1, r);
  }
}
