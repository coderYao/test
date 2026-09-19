// Perigee — Three.js presentation layer.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './physics.js';
import { mulberry32 } from './levels.js';

const MAX_BODIES = 16;

// ---------- procedural textures ----------

const PAL = {
  terra: { base: '#2d6bb5', bands: [], blobs: ['#3f9a4c', '#57b25f', '#8c7a3c', '#e9e4d2'], blobCount: 90, blobSize: [10, 60], cloud: true },
  dune: { base: '#c98b4a', bands: ['#b57438', '#d9a25e', '#a5652e'], blobs: ['#e0b075', '#8e5326'], blobCount: 40, blobSize: [8, 40] },
  ice: { base: '#cfe6f5', bands: ['#b9d7ee', '#e6f2fb'], blobs: ['#9cc3e2', '#ffffff', '#7fa9cc'], blobCount: 50, blobSize: [10, 50] },
  lava: { base: '#2a1a1a', bands: ['#33201c'], blobs: ['#5a2a1e', '#1d1112'], blobCount: 60, blobSize: [10, 50], cracks: '#ff6a1f' },
  jovian: { base: '#c9a57b', bands: ['#a77d55', '#e3c79f', '#8f6a48', '#d6b58c', '#b48a60', '#f0dcbc'], blobs: ['#d97c4b'], blobCount: 4, blobSize: [20, 60], stormy: true },
};

function planetTexture(palette, seed) {
  const P = PAL[palette] || PAL.terra;
  const rnd = mulberry32(seed);
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = P.base; g.fillRect(0, 0, w, h);
  const nb = P.bands.length ? (P.stormy ? 18 : 6) : 0;
  for (let i = 0; i < nb; i++) {
    const y = rnd() * h, bh = 6 + rnd() * (P.stormy ? 26 : 40);
    g.globalAlpha = P.stormy ? 0.55 : 0.22;
    g.fillStyle = P.bands[Math.floor(rnd() * P.bands.length)];
    g.fillRect(0, y - bh / 2, w, bh);
  }
  for (let i = 0; i < P.blobCount; i++) {
    const x = rnd() * w, y = rnd() * h;
    const r = P.blobSize[0] + rnd() * (P.blobSize[1] - P.blobSize[0]);
    g.globalAlpha = P.stormy ? 0.35 : 0.65;
    g.fillStyle = P.blobs[Math.floor(rnd() * P.blobs.length)];
    g.beginPath();
    if (P.stormy) g.ellipse(x, y, r, r * 0.45, 0, 0, Math.PI * 2); else g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (x + r > w) { g.beginPath(); g.arc(x - w, y, r, 0, Math.PI * 2); g.fill(); }
    if (x - r < 0) { g.beginPath(); g.arc(x + w, y, r, 0, Math.PI * 2); g.fill(); }
  }
  if (P.cracks) {
    g.globalAlpha = 0.9; g.strokeStyle = P.cracks; g.lineWidth = 2.2;
    for (let i = 0; i < 26; i++) {
      let x = rnd() * w, y = rnd() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
  }
  if (P.cloud) {
    g.globalAlpha = 0.28; g.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w, y = rnd() * h, r = 8 + rnd() * 30;
      g.beginPath(); g.ellipse(x, y, r * 1.8, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    }
  }
  // polar caps
  g.globalAlpha = P.stormy ? 0.25 : 0.5; g.fillStyle = palette === 'lava' ? '#111' : '#f4f8ff';
  g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function ringTexture(seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas'); c.width = 256; c.height = 8;
  const g = c.getContext('2d');
  for (let x = 0; x < 256; x++) {
    const a = x < 8 || x > 248 ? 0 : 0.25 + 0.55 * Math.abs(Math.sin(x * 0.11 + rnd() * 0.5)) * (rnd() < 0.15 ? 0.2 : 1);
    g.fillStyle = `rgba(230,210,180,${a.toFixed(3)})`; g.fillRect(x, 0, 1, 8);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowSprite(colorInner, colorOuter) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, colorInner); gr.addColorStop(0.35, colorOuter); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- shaders ----------

const GRID_VERT = /* glsl */`
  uniform vec4 uBodies[${MAX_BODIES}];
  uniform int uCount;
  varying vec2 vXZ; varying float vDepth;
  void main() {
    vec3 p = position;
    float y = 0.0;
    for (int i = 0; i < ${MAX_BODIES}; i++) {
      if (i >= uCount) break;
      vec4 b = uBodies[i];
      float d = length(p.xz - b.xy);
      y -= b.z * 0.17 / (d + b.w * 0.9);
    }
    y = clamp(y, -9.0, 4.0);
    p.y = y - 1.1;
    vXZ = p.xz; vDepth = y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const GRID_FRAG = /* glsl */`
  varying vec2 vXZ; varying float vDepth;
  uniform float uFade;
  void main() {
    vec2 c = vXZ / 4.0;
    vec2 gr = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    float line = 1.0 - min(min(gr.x, gr.y), 1.0);
    float r = length(vXZ);
    float fade = 1.0 - smoothstep(uFade * 0.55, uFade, r);
    vec3 colA = vec3(0.25, 0.55, 1.0);
    vec3 colB = vec3(1.0, 0.45, 0.85);
    float t = clamp(-vDepth / 4.0, 0.0, 1.0);
    vec3 col = mix(colA, colB, t);
    float a = line * fade * (0.22 + t * 0.5);
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * (0.6 + t * 0.8), a);
  }`;

const SKY_VERT = /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = /* glsl */`
  varying vec3 vDir;
  float hash(vec3 p){ p = fract(p*0.3183099+vec3(.1,.2,.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.02; a*=0.5;} return s; }
  void main(){
    vec3 d = vDir;
    float n = fbm(d*3.0 + vec3(1.7,9.2,4.1));
    float n2 = fbm(d*6.0 + vec3(5.0,2.0,7.0));
    vec3 base = mix(vec3(0.010,0.012,0.035), vec3(0.03,0.02,0.07), d.y*0.5+0.5);
    vec3 neb1 = vec3(0.25,0.12,0.45) * smoothstep(0.45,0.85,n) * 0.6;
    vec3 neb2 = vec3(0.05,0.35,0.5) * smoothstep(0.5,0.9,n2) * 0.45;
    gl_FragColor = vec4(base + neb1 + neb2, 1.0);
  }`;

const STAR_VERT = /* glsl */`
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; varying vec3 vColor; varying float vTw;
  void main(){ vColor = aColor; vTw = 0.7 + 0.3*sin(uTime*1.7 + aPhase);
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    gl_PointSize = aSize * vTw; gl_Position = projectionMatrix * mv; }`;
const STAR_FRAG = /* glsl */`
  varying vec3 vColor; varying float vTw;
  void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor * vTw * 1.6, a); }`;

const ATMO_VERT = /* glsl */`varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const ATMO_FRAG = /* glsl */`uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower); gl_FragColor = vec4(uColor * f * 1.6, f); }`;

const SWIRL_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv - 0.5; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SWIRL_FRAG = /* glsl */`uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; uniform float uInner; uniform float uGain; varying vec2 vUv;
  void main(){ float r = length(vUv)*2.0; if (r > 1.0 || r < uInner) discard;
    float a = atan(vUv.y, vUv.x);
    float s = sin(a*3.0 - r*14.0 + uTime*4.0)*0.5+0.5;
    float s2 = sin(a*5.0 + r*9.0 - uTime*2.5)*0.5+0.5;
    float edge = smoothstep(1.0, 0.55, r) * smoothstep(uInner, uInner + 0.12, r);
    vec3 col = mix(uColA, uColB, s) * (0.6 + s2*0.8);
    float alpha = edge * (0.35 + 0.65*s) ;
    gl_FragColor = vec4(col * uGain, alpha); }`;

const BEAM_VERT = /* glsl */`varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const BEAM_FRAG = /* glsl */`uniform vec3 uColor; uniform float uTime; varying float vY;
  void main(){ float a = (1.0 - vY) * (1.0 - vY) * 0.18 * (0.8 + 0.2*sin(uTime*3.0 + vY*20.0)); gl_FragColor = vec4(uColor, a); }`;

const TRAIL_VERT = /* glsl */`attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const TRAIL_FRAG = /* glsl */`uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * (1.0 + vA), vA * 0.9); }`;

const PART_VERT = /* glsl */`attribute float aLife; attribute float aSize; attribute vec3 aColor; varying float vL; varying vec3 vC;
  void main(){ vL = aLife; vC = aColor; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize * (200.0 / -mv.z) * (0.4 + 0.6*aLife); gl_Position = projectionMatrix*mv; }`;
const PART_FRAG = /* glsl */`varying float vL; varying vec3 vC;
  void main(){ if (vL <= 0.0) discard; vec2 c = gl_PointCoord-0.5; float d = length(c); if (d > 0.5) discard; float a = smoothstep(0.5,0.05,d) * vL; gl_FragColor = vec4(vC * 2.0, a); }`;

// ---------- helpers ----------

function additiveShader(vert, frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...extra });
}

// ---------- world ----------

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    this.time = 0;
    this.cam = { yaw: -0.35, pitch: 1.02, dist: 46, target: new THREE.Vector3(), targetGoal: new THREE.Vector3(), distGoal: 46, shake: 0, shakeVec: new THREE.Vector3() };

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this._buildStatics();
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this._buildBall();
    this._buildAim();
    this._buildParticles();
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _buildStatics() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x7f95ff, 0x140a20, 0.55));
    this.sunLight = new THREE.DirectionalLight(0xfff2e0, 1.7);
    this.sunLight.position.set(30, 60, 20);
    s.add(this.sunLight);
    this.starLight = new THREE.PointLight(0xffd9a0, 0, 0, 2);
    s.add(this.starLight);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    s.add(sky);

    // stars
    const N = 3200, pos = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N), col = new Float32Array(N * 3);
    const rnd = mulberry32(42);
    for (let i = 0; i < N; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = 700 + rnd() * 150;
      const q = Math.sqrt(1 - u * u);
      pos[i * 3] = q * Math.cos(th) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = q * Math.sin(th) * r;
      size[i] = 1.2 + Math.pow(rnd(), 3) * 4.5; phase[i] = rnd() * 6.28;
      const t = rnd(); const c = t < 0.2 ? [0.7, 0.8, 1] : t < 0.85 ? [1, 1, 1] : [1, 0.85, 0.6];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.starMat = additiveShader(STAR_VERT, STAR_FRAG, { uTime: { value: 0 } });
    s.add(new THREE.Points(sg, this.starMat));

    // gravity grid
    const SEG = 150, SIZE = 200;
    const gpos = new Float32Array((SEG + 1) * (SEG + 1) * 3);
    let k = 0;
    for (let i = 0; i <= SEG; i++) for (let j = 0; j <= SEG; j++) {
      gpos[k++] = (j / SEG - 0.5) * SIZE; gpos[k++] = 0; gpos[k++] = (i / SEG - 0.5) * SIZE;
    }
    const idx = [];
    for (let i = 0; i < SEG; i++) for (let j = 0; j < SEG; j++) {
      const a = i * (SEG + 1) + j, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
    gg.setIndex(idx);
    const bodiesU = [];
    for (let i = 0; i < MAX_BODIES; i++) bodiesU.push(new THREE.Vector4());
    this.gridMat = new THREE.ShaderMaterial({ vertexShader: GRID_VERT, fragmentShader: GRID_FRAG, uniforms: { uBodies: { value: bodiesU }, uCount: { value: 0 }, uFade: { value: 90 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.grid = new THREE.Mesh(gg, this.gridMat);
    this.grid.frustumCulled = false;
    s.add(this.grid);
  }

  _buildBall() {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballR, 32, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1, emissive: 0x6fb8ff, emissiveIntensity: 0.55 }));
    g.add(mesh);
    // dimples-ish: a subtle wire overlay
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(CFG.ballR * 1.01, 1), new THREE.MeshBasicMaterial({ color: 0x9fd4ff, wireframe: true, transparent: true, opacity: 0.35 }));
    g.add(wire);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(180,220,255,0.9)', 'rgba(80,140,255,0.25)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(CFG.ballR * 7);
    g.add(glow);
    this.ball = g; this.ballMesh = mesh; this.ballGlow = glow;
    this.scene.add(g);

    // trail ribbon
    this.trailN = 110;
    this.trail = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 2 * 3), 3));
    tg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.trailN * 2), 1));
    const ti = [];
    for (let i = 0; i < this.trailN - 1; i++) { const a = i * 2; ti.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(ti);
    tg.setDrawRange(0, 0);
    this.trailMesh = new THREE.Mesh(tg, additiveShader(TRAIL_VERT, TRAIL_FRAG, { uColor: { value: new THREE.Color(0.45, 0.8, 1.0) } }, { side: THREE.DoubleSide }));
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
  }

  _buildAim() {
    const N = 160;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setDrawRange(0, 0);
    this.aimPoints = new THREE.Points(g, additiveShader(PART_VERT, PART_FRAG, {}));
    this.aimPoints.frustumCulled = false;
    this.scene.add(this.aimPoints);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));
    this.aimLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    // launch arrow: a flat triangle strip along the launch direction
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.arrow.visible = false;
    this.scene.add(this.arrow);
    this.arrowStem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    this.arrowStem.visible = false;
    this.scene.add(this.arrowStem);
  }

  _buildParticles() {
    this.pN = 900;
    this.pPos = new Float32Array(this.pN * 3);
    this.pVel = new Float32Array(this.pN * 3);
    this.pLife = new Float32Array(this.pN);
    this.pDecay = new Float32Array(this.pN);
    this.pSize = new Float32Array(this.pN);
    this.pCol = new Float32Array(this.pN * 3);
    this.pHead = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.pLife, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3));
    this.particles = new THREE.Points(g, additiveShader(PART_VERT, PART_FRAG, {}));
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  emit(x, y, z, count, color, speed, opts = {}) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const k = this.pHead; this.pHead = (this.pHead + 1) % this.pN;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * Math.PI * (opts.flat ? 0.25 : 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      let vx = Math.cos(a) * Math.cos(e) * sp, vy = Math.sin(e) * sp + (opts.up || 0), vz = Math.sin(a) * Math.cos(e) * sp;
      if (opts.nx !== undefined) { vx += opts.nx * speed * 0.8; vz += opts.nz * speed * 0.8; }
      this.pPos[k * 3] = x; this.pPos[k * 3 + 1] = y; this.pPos[k * 3 + 2] = z;
      this.pVel[k * 3] = vx; this.pVel[k * 3 + 1] = vy; this.pVel[k * 3 + 2] = vz;
      this.pLife[k] = 1; this.pDecay[k] = 1 / (opts.life || 0.8) * (0.7 + Math.random() * 0.6);
      this.pSize[k] = (opts.size || 1.4) * (0.6 + Math.random() * 0.8);
      const jitter = 0.85 + Math.random() * 0.3;
      this.pCol[k * 3] = c.r * jitter; this.pCol[k * 3 + 1] = c.g * jitter; this.pCol[k * 3 + 2] = c.b * jitter;
    }
  }

  _updateParticles(dt) {
    const drag = Math.exp(-dt * 1.8);
    for (let k = 0; k < this.pN; k++) {
      if (this.pLife[k] <= 0) continue;
      this.pLife[k] -= this.pDecay[k] * dt;
      if (this.pLife[k] <= 0) { this.pLife[k] = 0; continue; }
      this.pVel[k * 3] *= drag; this.pVel[k * 3 + 1] *= drag; this.pVel[k * 3 + 2] *= drag;
      this.pPos[k * 3] += this.pVel[k * 3] * dt; this.pPos[k * 3 + 1] += this.pVel[k * 3 + 1] * dt; this.pPos[k * 3 + 2] += this.pVel[k * 3 + 2] * dt;
    }
    const g = this.particles.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
  }

  // ----- level -----

  buildLevel(level) {
    while (this.levelGroup.children.length) {
      const c = this.levelGroup.children.pop();
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; if (m.map) m.map.dispose(); m.dispose(); } });
    }
    this.bodyViews = [];
    this.animated = [];
    const rnd = mulberry32(level.seed || (level.name.length * 977));
    let hasSun = false;
    level.bodies.forEach((b, i) => {
      const g = new THREE.Group();
      const spin = (rnd() - 0.5) * 0.5;
      let view = { group: g, spin, body: b };
      if (b.type === 'black') {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 0.92, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })));
        const disc = new THREE.Mesh(new THREE.PlaneGeometry(b.r * 5.2, b.r * 5.2), additiveShader(SWIRL_VERT, SWIRL_FRAG, { uTime: { value: 0 }, uColA: { value: new THREE.Color(0.9, 0.3, 0.05) }, uColB: { value: new THREE.Color(1.0, 0.75, 0.4) }, uInner: { value: 0.42 }, uGain: { value: 0.75 } }, { side: THREE.DoubleSide }));
        disc.rotation.x = -Math.PI / 2 + 0.28; disc.rotation.z = rnd() * 3;
        g.add(disc);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.02, 32, 24), additiveShader(ATMO_VERT, ATMO_FRAG, { uColor: { value: new THREE.Color(0.9, 0.4, 0.15) }, uPower: { value: 3.5 } }));
        g.add(halo);
        this.animated.push({ mat: disc.material });
      } else if (b.type === 'sun') {
        hasSun = true;
        g.add(new THREE.Mesh(new THREE.SphereGeometry(b.r, 40, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.0) })));
        const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(255,230,160,1)', 'rgba(255,120,40,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        corona.scale.setScalar(b.r * 5.2); g.add(corona);
        const atmo = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.08, 40, 28), additiveShader(ATMO_VERT, ATMO_FRAG, { uColor: { value: new THREE.Color(1.0, 0.5, 0.1) }, uPower: { value: 1.5 } }));
        g.add(atmo);
        view.isSun = true;
      } else if (b.type === 'repulsor') {
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r * 0.7, 1), new THREE.MeshStandardMaterial({ color: 0x5a2b9a, emissive: 0xa050ff, emissiveIntensity: 1.2, roughness: 0.3, flatShading: true }));
        g.add(core);
        const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(b.r, 2), new THREE.MeshBasicMaterial({ color: 0xc78bff, wireframe: true, transparent: true, opacity: 0.45 }));
        g.add(shell);
        const halo = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.35, 32, 24), additiveShader(ATMO_VERT, ATMO_FRAG, { uColor: { value: new THREE.Color(0.7, 0.3, 1.0) }, uPower: { value: 3.0 } }));
        g.add(halo);
        view.pulse = shell; view.core = core;
      } else {
        const tex = planetTexture(b.palette || 'terra', Math.floor(rnd() * 1e6));
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.0 });
        if (b.palette === 'lava') { mat.emissiveMap = tex; mat.emissive = new THREE.Color(0xff5a1a); mat.emissiveIntensity = 0.9; }
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 32), mat);
        mesh.rotation.z = (rnd() - 0.5) * 0.5;
        g.add(mesh);
        view.mesh = mesh;
        const ac = { terra: [0.35, 0.65, 1.0], dune: [1.0, 0.7, 0.4], ice: [0.6, 0.85, 1.0], lava: [1.0, 0.4, 0.15], jovian: [1.0, 0.8, 0.55] }[b.palette] || [0.5, 0.7, 1];
        const atmo = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.04, 48, 32), additiveShader(ATMO_VERT, ATMO_FRAG, { uColor: { value: new THREE.Color(...ac) }, uPower: { value: 3.2 } }));
        g.add(atmo);
        if (b.ring) {
          const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * 1.45, b.r * 2.4, 96, 1), new THREE.MeshStandardMaterial({ map: ringTexture(Math.floor(rnd() * 1e6)), side: THREE.DoubleSide, transparent: true, roughness: 0.9, depthWrite: false }));
          // map ring uv radially
          const uv = ring.geometry.attributes.uv, p = ring.geometry.attributes.position;
          for (let k = 0; k < uv.count; k++) { const r = Math.hypot(p.getX(k), p.getY(k)); uv.setXY(k, (r - b.r * 1.45) / (b.r * 0.95), 0.5); }
          ring.rotation.x = -Math.PI / 2 + 0.22; ring.rotation.y = 0.1;
          g.add(ring);
        }
      }
      this.levelGroup.add(g);
      this.bodyViews.push(view);
    });
    this.starLight.intensity = hasSun ? 900 : 0;
    this.sunLight.intensity = hasSun ? 0.9 : 1.7;

    // goal
    const goal = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.25, 1.4) });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(CFG.goalR, 0.11, 12, 64), ringMat);
    torus.rotation.x = Math.PI / 2; goal.add(torus);
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(CFG.goalR * 0.72, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.0, 1.2) }));
    torus2.rotation.x = Math.PI / 2 + 0.6; goal.add(torus2);
    const swirl = new THREE.Mesh(new THREE.PlaneGeometry(CFG.goalR * 2, CFG.goalR * 2), additiveShader(SWIRL_VERT, SWIRL_FRAG, { uTime: { value: 0 }, uColA: { value: new THREE.Color(0.1, 0.6, 1.0) }, uColB: { value: new THREE.Color(0.5, 1.0, 1.0) }, uInner: { value: 0.0 }, uGain: { value: 1.6 } }, { side: THREE.DoubleSide }));
    swirl.rotation.x = -Math.PI / 2; goal.add(swirl);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(CFG.goalR * 0.25, CFG.goalR * 0.8, 11, 24, 1, true), additiveShader(BEAM_VERT, BEAM_FRAG, { uColor: { value: new THREE.Color(0.3, 0.8, 1.0) }, uTime: { value: 0 } }, { side: THREE.DoubleSide }));
    beam.position.y = 5.5; goal.add(beam);
    const gglow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite('rgba(160,240,255,0.9)', 'rgba(40,120,255,0.25)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    gglow.scale.setScalar(CFG.goalR * 3.6); gglow.material.opacity = 0.7; goal.add(gglow);
    this.goalView = { group: goal, torus, torus2, swirl, beam };
    this.animated.push({ mat: swirl.material }, { mat: beam.material });
    this.levelGroup.add(goal);

    // boosts
    this.boostViews = (level.boosts || []).map((bo) => {
      const g = new THREE.Group();
      g.position.set(bo.x, 0, bo.z);
      const a = bo.angle * Math.PI / 180;
      g.rotation.y = -a;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(CFG.boostR, 0.12, 10, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.1, 0.2) }));
      ring.rotation.y = Math.PI / 2; g.add(ring);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.4, 0.4) }));
      cone.rotation.z = -Math.PI / 2; cone.position.x = 0.4; g.add(cone);
      const pulses = [];
      for (let k = 0; k < 3; k++) {
        const p = new THREE.Mesh(new THREE.TorusGeometry(CFG.boostR * 0.9, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.5, depthWrite: false }));
        p.rotation.y = Math.PI / 2; g.add(p); pulses.push(p);
      }
      this.levelGroup.add(g);
      return { group: g, pulses };
    });

    // bounds ring
    const bounds = level.bounds || CFG.bounds;
    const br = new THREE.Mesh(new THREE.RingGeometry(bounds - 0.35, bounds, 128), new THREE.MeshBasicMaterial({ color: 0xff4080, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    br.rotation.x = -Math.PI / 2; br.position.y = -1.0;
    this.levelGroup.add(br);
    this.gridMat.uniforms.uFade.value = bounds + 6;
    this.gridMat.uniforms.uCount.value = Math.min(MAX_BODIES, level.bodies.length);
    for (let i = 0; i < MAX_BODIES; i++) {
      const u = this.gridMat.uniforms.uBodies.value[i];
      const b = level.bodies[i];
      if (b) u.set(0, 0, b.type === 'black' ? b.m * 1.4 : b.m, b.r); else u.set(0, 0, 0, 1);
    }
    this.trail.length = 0;
    this.trailMesh.geometry.setDrawRange(0, 0);
  }

  // ----- per-frame -----

  updateLevel(level, positions, goalPos, dt) {
    this.time += dt;
    this.starMat.uniforms.uTime.value = this.time;
    for (const a of this.animated) a.mat.uniforms.uTime.value = this.time;
    for (let i = 0; i < this.bodyViews.length; i++) {
      const v = this.bodyViews[i], p = positions[i];
      v.group.position.set(p.x, 0, p.z);
      if (v.mesh) v.mesh.rotation.y += v.spin * dt;
      if (v.pulse) { const s = 1 + 0.08 * Math.sin(this.time * 4 + i); v.pulse.scale.setScalar(s); v.core.rotation.y += dt * 0.8; v.core.rotation.x += dt * 0.5; }
      if (v.isSun) this.starLight.position.set(p.x, 0, p.z);
      if (i < MAX_BODIES) { const u = this.gridMat.uniforms.uBodies.value[i]; u.x = p.x; u.y = p.z; }
    }
    const gv = this.goalView;
    gv.group.position.set(goalPos.x, 0, goalPos.z);
    gv.torus.rotation.z += dt * 0.6; gv.torus2.rotation.z -= dt * 1.1; gv.torus2.rotation.x = Math.PI / 2 + 0.6 * Math.sin(this.time * 0.8);
    this.boostViews.forEach((bv) => {
      bv.pulses.forEach((p, k) => {
        const ph = (this.time * 1.3 + k / 3) % 1;
        p.position.x = -2 + ph * 4; p.material.opacity = 0.6 * (1 - ph) * ph * 4 * 0.5; p.scale.setScalar(0.6 + ph * 0.6);
      });
    });
    this._updateParticles(dt);
  }

  updateBall(ball, flying, dt) {
    this.ball.position.set(ball.x, 0, ball.z);
    const sp = Math.hypot(ball.vx, ball.vz);
    if (sp > 0.01) {
      // roll around axis perpendicular to velocity
      const axis = new THREE.Vector3(ball.vz, 0, -ball.vx).normalize();
      this.ballMesh.rotateOnWorldAxis(axis, sp * dt / CFG.ballR);
    }
    this.ballGlow.material.opacity = 0.55 + Math.min(0.45, sp * 0.03);
    // trail
    if (flying) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - ball.x, last.z - ball.z) > 0.12) {
        this.trail.push({ x: ball.x, z: ball.z });
        if (this.trail.length > this.trailN) this.trail.shift();
      }
    } else if (this.trail.length) {
      for (let k = 0; k < 4 && this.trail.length; k++) this.trail.shift();
    }
    this._rebuildTrail(sp);
  }

  _rebuildTrail(speed) {
    const n = this.trail.length;
    const g = this.trailMesh.geometry;
    if (n < 2) { g.setDrawRange(0, 0); return; }
    const pos = g.attributes.position.array, al = g.attributes.aAlpha.array;
    const width = 0.22 + Math.min(0.25, speed * 0.012);
    for (let i = 0; i < n; i++) {
      const p = this.trail[i];
      const q = this.trail[Math.min(n - 1, i + 1)], r = this.trail[Math.max(0, i - 1)];
      let dx = q.x - r.x, dz = q.z - r.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const t = i / (n - 1);
      const w = width * t;
      pos[i * 6] = p.x + dz * w; pos[i * 6 + 1] = 0; pos[i * 6 + 2] = p.z - dx * w;
      pos[i * 6 + 3] = p.x - dz * w; pos[i * 6 + 4] = 0; pos[i * 6 + 5] = p.z + dx * w;
      al[i * 2] = t * t; al[i * 2 + 1] = t * t;
    }
    g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }

  showAim(ball, dirX, dirZ, power01, pred, dragStart, dragNow) {
    const g = this.aimPoints.geometry;
    const pos = g.attributes.position.array, life = g.attributes.aLife.array, size = g.attributes.aSize.array, col = g.attributes.aColor.array;
    const pts = pred.points;
    const n = Math.min(pts.length, 160);
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = i / Math.max(1, n - 1);
      pos[i * 3] = p.x; pos[i * 3 + 1] = 0.05; pos[i * 3 + 2] = p.z;
      life[i] = 0.9 * (1 - t * 0.85);
      size[i] = 1.1 - t * 0.6;
      const hot = Math.min(1, p.v / 22);
      col[i * 3] = 0.5 + hot * 0.5; col[i * 3 + 1] = 0.9 - hot * 0.4; col[i * 3 + 2] = 1.0 - hot * 0.7;
    }
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aColor.needsUpdate = true;
    g.setDrawRange(0, n);
    this.aimPoints.visible = true;

    const lp = this.aimLine.geometry.attributes.position.array;
    lp[0] = dragStart.x; lp[1] = 0.05; lp[2] = dragStart.z; lp[3] = dragNow.x; lp[4] = 0.05; lp[5] = dragNow.z;
    this.aimLine.geometry.attributes.position.needsUpdate = true;
    this.aimLine.visible = true;

    const len = 1.5 + power01 * 5;
    const c = new THREE.Color().setHSL(0.36 - power01 * 0.36, 0.95, 0.6);
    this.arrow.material.color.copy(c); this.arrowStem.material.color.copy(c);
    this.arrowStem.scale.y = len; this.arrowStem.position.set(ball.x + dirX * len / 2, 0, ball.z + dirZ * len / 2);
    this.arrowStem.rotation.set(0, 0, 0); this.arrowStem.rotateY(-Math.atan2(dirZ, dirX)); this.arrowStem.rotateZ(-Math.PI / 2);
    this.arrow.position.set(ball.x + dirX * (len + 0.7), 0, ball.z + dirZ * (len + 0.7));
    this.arrow.rotation.set(0, 0, 0); this.arrow.rotateY(-Math.atan2(dirZ, dirX)); this.arrow.rotateZ(-Math.PI / 2);
    this.arrow.visible = true; this.arrowStem.visible = true;
  }

  hideAim() { this.aimPoints.visible = false; this.aimLine.visible = false; this.arrow.visible = false; this.arrowStem.visible = false; }

  shake(amount) { this.cam.shake = Math.min(1.2, this.cam.shake + amount); }

  updateCamera(dt) {
    const c = this.cam;
    c.target.lerp(c.targetGoal, 1 - Math.exp(-dt * 4.5));
    c.dist += (c.distGoal - c.dist) * (1 - Math.exp(-dt * 3));
    const off = new THREE.Vector3(Math.cos(c.pitch) * Math.sin(c.yaw), Math.sin(c.pitch), Math.cos(c.pitch) * Math.cos(c.yaw)).multiplyScalar(c.dist);
    this.camera.position.copy(c.target).add(off);
    if (c.shake > 0.001) {
      c.shake *= Math.exp(-dt * 7);
      const s = c.shake;
      c.shakeVec.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.camera.position.add(c.shakeVec);
    }
    this.camera.lookAt(c.target);
  }

  // pointer (clientX, clientY) -> point on the y=0 plane
  pick(cx, cy, out) {
    const r = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(nd, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (rc.ray.intersectPlane(plane, hit)) { out.x = hit.x; out.z = hit.z; return true; }
    return false;
  }

  render() { this.composer.render(); }
}
