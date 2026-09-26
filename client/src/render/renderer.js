// WebGL-Renderer mit Qualitätsstufen, Schatten, Nachbearbeitung (Bloom, Farbkorrektur),
// MSAA/FXAA und separatem Viewmodel-Pass (Waffe clippt nicht in Wände).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSat: { value: 1.12 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.22 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uSat; uniform float uContrast; uniform float uVignette; uniform vec3 uTint;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18;
      c.rgb *= uTint;
      float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.45, 0.95, d) * uVignette;
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

// Qualitätsstufen wie in Fortnite – alle mit 100 % 3D-Auflösung
export const QUALITY_PRESETS = {
  low: { resolution: 100, shadows: 'off', viewDistance: 'near', grass: 'off', antialias: false, post: false },
  medium: { resolution: 100, shadows: 'low', viewDistance: 'medium', grass: 'low', antialias: true, post: false },
  high: { resolution: 100, shadows: 'high', viewDistance: 'far', grass: 'medium', antialias: true, post: true },
  epic: { resolution: 100, shadows: 'high', viewDistance: 'epic', grass: 'high', antialias: true, post: true },
};
// Rendermodus „Leistung“: wie Fortnites Performance-Modus – alles Teure aus, 100 % Auflösung bleibt
export const PERFORMANCE_MODE = { resolution: 100, shadows: 'off', viewDistance: 'near', grass: 'off', antialias: false, post: false };
export const VIEW_DISTANCES = { near: 220, medium: 280, far: 340, epic: 420 };

export class Renderer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0xbfe4f7, 1);
    this.transparent = false;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);
    this.settings = {};
    this.width = 1;
    this.height = 1;
    this.composer = null;
    this.usingComposer = false;
    this.scene = null;
    this.camera = null;
    this.vmScene = null;
    this.vmCamera = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get gl() {
    return this.renderer;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height);
    if (this.composer) this.composer.setSize(this.width, this.height);
    if (this.bloom) this.bloom.resolution.set(this.width / 2, this.height / 2);
    this.onResize && this.onResize(this.width, this.height);
  }

  applyPixelRatio() {
    const scale = (this.settings.resolution ?? 100) / 100;
    const pr = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.renderer.setPixelRatio(pr);
    if (this.composer) this.composer.setPixelRatio(pr);
  }

  apply(settings) {
    const prev = this.settings;
    this.settings = { ...settings };
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height);
    const shadows = settings.shadows !== 'off';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.shadowsChanged = true;
    }
    const wantComposer = !!(settings.post || settings.antialias);
    if (wantComposer !== this.usingComposer || prev.post !== settings.post || prev.antialias !== settings.antialias) {
      this.buildComposer();
    }
  }

  // transparent: Lobby über dem CSS-Hintergrund (ohne Bloom/Farbkorrektur, Alpha bleibt erhalten)
  setScenes(scene, camera, vmScene = null, vmCamera = null, transparent = false) {
    this.scene = scene;
    this.camera = camera;
    this.vmScene = vmScene;
    this.vmCamera = vmCamera;
    this.transparent = transparent;
    this.renderer.setClearColor(transparent ? 0x000000 : 0xbfe4f7, transparent ? 0 : 1);
    this.buildComposer();
  }

  buildComposer() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    const s = this.settings;
    this.usingComposer = !!(s.post || s.antialias);
    if (!this.usingComposer || !this.scene) return;
    const rt = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, samples: s.antialias ? 4 : 0 });
    const post = s.post && !this.transparent;
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(this.width, this.height);
    this.mainPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.mainPass);
    if (this.vmScene) {
      this.vmPass = new RenderPass(this.vmScene, this.vmCamera);
      this.vmPass.clear = false;
      this.vmPass.clearDepth = true;
      composer.addPass(this.vmPass);
    }
    if (post) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(this.width / 2, this.height / 2), 0.35, 0.45, 0.88);
      composer.addPass(this.bloom);
      this.grade = new ShaderPass(GradeShader);
      composer.addPass(this.grade);
    } else {
      this.bloom = null;
      this.grade = null;
    }
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setTint(r, g, b) {
    if (this.grade) this.grade.uniforms.uTint.value.set(r, g, b);
  }

  render() {
    if (!this.scene || !this.camera) return;
    if (this.usingComposer && this.composer) {
      this.mainPass.scene = this.scene;
      this.mainPass.camera = this.camera;
      if (this.vmPass) {
        this.vmPass.enabled = !!this.vmScene && this.vmScene.visible !== false;
      }
      this.composer.render();
    } else {
      const r = this.renderer;
      r.autoClear = true;
      r.render(this.scene, this.camera);
      if (this.vmScene && this.vmScene.visible !== false) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.vmScene, this.vmCamera);
        r.autoClear = true;
      }
    }
  }
}

// Sonne + Himmelslicht mit Schatten, die dem Spieler folgen (kleine Insel: enger, scharfer Schattenbereich)
export class Lights {
  constructor(scene) {
    this.sunDir = new THREE.Vector3(0.5, 0.62, 0.35).normalize();
    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0xc29a62, 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.45);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2.5;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.quality = null;
    this.extent = 70;
  }

  setQuality(q) {
    if (q === this.quality) return;
    this.quality = q;
    const size = q === 'high' ? 2048 : 1024;
    this.extent = q === 'high' ? 50 : 36;
    const cam = this.sun.shadow.camera;
    cam.left = -this.extent;
    cam.right = this.extent;
    cam.top = this.extent;
    cam.bottom = -this.extent;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = q !== 'off';
  }

  update(focus) {
    // Schattenkamera am Texelraster ausrichten (kein Flimmern)
    const texel = (this.extent * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 120, focus.y + this.sunDir.y * 120, fz + this.sunDir.z * 120);
    this.sun.target.updateMatrixWorld();
  }
}
