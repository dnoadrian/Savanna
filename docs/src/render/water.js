// Animiertes Low-Poly-Wasser mit Tiefenfarbe und Schaumkante am Strand.
import * as THREE from 'three';

const vert = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec3 vWorld;
varying float vWave;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float w = sin(wp.x * 0.09 + uTime * 0.9) * 0.05
          + sin(wp.z * 0.12 - uTime * 1.2) * 0.04
          + sin((wp.x + wp.z) * 0.22 + uTime * 1.7) * 0.02;
  wp.y = uLevel + w;
  vWave = w;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform sampler2D uHeight;
uniform float uHalf;
uniform vec3 uSunDir;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uStormColor;
uniform float uStorm;
varying vec3 vWorld;
varying float vWave;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec2 uv = (vWorld.xz + uHalf) / (2.0 * uHalf);
  float ground = texture2D(uHeight, uv).r;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ground = -20.0;
  float depth = uLevel - ground;
  float dk = smoothstep(0.05, 1.1, depth);
  vec3 col = mix(uShallow, uDeep, dk);
  float diff = clamp(dot(n, normalize(uSunDir)), 0.0, 1.0);
  col *= 0.72 + 0.4 * diff;
  // Glanz
  vec3 viewDir = normalize(cameraPosition - vWorld);
  vec3 h = normalize(normalize(uSunDir) + viewDir);
  float spec = pow(clamp(dot(n, h), 0.0, 1.0), 60.0);
  col += vec3(1.0, 0.95, 0.8) * spec * 0.55;
  // Schaum am Strand + auf Wellenkämmen
  float fn = vnoise(vWorld.xz * 0.35 + vec2(uTime * 0.3, uTime * 0.2));
  float shoreFoam = smoothstep(0.22, 0.02, depth + fn * 0.12 - 0.05 * sin(uTime * 1.6 + vWorld.x * 0.08));
  float band = smoothstep(0.1, 0.0, abs(depth - 0.35 - 0.08 * sin(uTime * 1.1 + vWorld.z * 0.05)) - 0.05) * 0.35;
  float crest = smoothstep(0.085, 0.11, vWave + fn * 0.03) * 0.5;
  float foam = clamp(max(shoreFoam, band * (1.0 - dk)) + crest * 0.6, 0.0, 1.0);
  col = mix(col, vec3(1.0), foam * 0.85);
  float alpha = mix(0.5, 0.86, smoothstep(0.0, 1.0, depth));
  alpha = max(alpha, foam);
  // Nebel
  float dist = length(cameraPosition - vWorld);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  vec3 fogC = mix(uFogColor, uStormColor, uStorm);
  col = mix(col, fogC, fog);
  alpha = mix(alpha, 1.0, fog);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

export function createWater(heightTex, half, level = 0, size = 320, segments = 128) {
  const uniforms = {
    uTime: { value: 0 },
    uLevel: { value: level },
    uHeight: { value: heightTex },
    uHalf: { value: half },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
    uShallow: { value: new THREE.Color(0x74cfd9) },
    uDeep: { value: new THREE.Color(0x1a7fa6) },
    uFogColor: { value: new THREE.Color(0xcfe8f5) },
    uFogNear: { value: 200 },
    uFogFar: { value: 600 },
    uStormColor: { value: new THREE.Color(0x8a4fd6) },
    uStorm: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: true,
  });
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return { mesh, uniforms };
}

