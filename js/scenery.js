'use strict';
// ---------- the scroll: rice paper, layered mountain washes, mist, moon, pines, bamboo, seasons ----------
const SEASONS = [
  { name: '春', en: 'Spring', accent: 'rgba(214,88,110,', tint: [255, 232, 234], particle: 'petal' },
  { name: '夏', en: 'Summer', accent: 'rgba(70,120,90,', tint: [226, 242, 230], particle: 'rain' },
  { name: '秋', en: 'Autumn', accent: 'rgba(200,84,30,', tint: [255, 236, 216], particle: 'leaf' },
  { name: '冬', en: 'Winter', accent: 'rgba(255,255,255,', tint: [222, 232, 248], particle: 'snow' },
];
const SEASON_LEN = 6000; // world px per season
// time of day: one slow day over every 900 丈 of scroll, so a good run swims from dawn into a starlit night
const DAY_LEN = 9000;
const DAY_KEYS = [
  // [phase, tint at the top of the sky, strength]
  [0.00, [255, 196, 170], 0.32],   // dawn
  [0.10, [255, 236, 214], 0.14],
  [0.22, [255, 252, 244], 0.04],   // day
  [0.40, [255, 238, 200], 0.12],
  [0.50, [255, 200, 140], 0.28],   // golden hour
  [0.58, [214, 132, 132], 0.48],   // sunset
  [0.66, [52, 72, 156], 0.72],     // night
  [0.86, [52, 72, 156], 0.72],
  [0.94, [200, 170, 190], 0.4],    // before dawn
  [1.00, [255, 196, 170], 0.32],
];

class Scenery {
  constructor(seed) {
    this.seed = seed;
    this.paper = null;
    this.paperPattern = null;
    this.decoCache = new Map();
  }

  makePaper(ctx) {
    const s = 512;
    const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
    const c = cv.getContext('2d');
    c.fillStyle = '#f1eadb'; c.fillRect(0, 0, s, s);
    const rng = mulberry32(this.seed ^ 0x51);
    // fibres
    for (let i = 0; i < 2600; i++) {
      const x = rng() * s, y = rng() * s, a = rng() * TAU, L = 4 + rng() * 22;
      c.strokeStyle = `rgba(${120 + rng() * 60 | 0},${100 + rng() * 50 | 0},${70 + rng() * 40 | 0},${0.035 + rng() * 0.06})`;
      c.lineWidth = 0.5 + rng() * 0.8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); c.stroke();
    }
    // mottling
    for (let i = 0; i < 300; i++) {
      const x = rng() * s, y = rng() * s, r = 6 + rng() * 40;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const dark = rng() < 0.5;
      g.addColorStop(0, dark ? 'rgba(120,100,70,0.05)' : 'rgba(255,252,240,0.09)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // specks
    for (let i = 0; i < 500; i++) {
      c.fillStyle = `rgba(90,70,50,${0.05 + rng() * 0.1})`;
      c.fillRect(rng() * s, rng() * s, 1 + rng(), 1 + rng());
    }
    this.paper = cv;
    this.paperPattern = ctx.createPattern(cv, 'repeat');
  }

  season(worldX) { return SEASONS[Math.floor(Math.max(0, worldX) / SEASON_LEN) % SEASONS.length]; }
  seasonIndex(worldX) { return Math.floor(Math.max(0, worldX) / SEASON_LEN) % SEASONS.length; }

  // ridge height for a layer at world x (in layer space)
  ridge(layer, x) {
    const p = LAYERS[layer];
    const n = ridged(x * p.freq, layer * 3.7, 4, this.seed + layer * 101);
    const m = fbm(x * p.freq * 0.35, layer, 3, this.seed + layer * 13);
    return p.base - (n * 0.65 + m * 0.35) * p.amp;
  }

  // where in the day this part of the scroll is painted
  daylight(worldX) {
    if (this._dl && this._dlX === worldX) return this._dl;
    const p = ((Math.max(0, worldX) / DAY_LEN) % 1 + 1) % 1;
    let i = 0; while (i < DAY_KEYS.length - 2 && DAY_KEYS[i + 1][0] <= p) i++;
    const a = DAY_KEYS[i], b = DAY_KEYS[i + 1], f = smoothstep(a[0], b[0], p);
    this._dlX = worldX;
    return this._dl = {
      p, k: lerp(a[2], b[2], f),
      tint: [lerp(a[1][0], b[1][0], f), lerp(a[1][1], b[1][1], f), lerp(a[1][2], b[1][2], f)],
      night: smoothstep(0.58, 0.66, p) * (1 - smoothstep(0.86, 0.95, p)),
    };
  }

  drawBackground(ctx, camX, W, H, time) {
    this.dl = this.daylight(camX + W * 0.5);
    // paper
    ctx.fillStyle = this.paperPattern; ctx.save(); ctx.translate(-(camX * 0.02) % 512, 0); ctx.fillRect(0, -1, W + 512, H + 2); ctx.restore();
    // subtle warm vignette / light from top-left
    const vg = ctx.createRadialGradient(W * 0.3, H * 0.2, H * 0.2, W * 0.5, H * 0.5, W * 0.9);
    vg.addColorStop(0, 'rgba(255,250,235,0.25)'); vg.addColorStop(1, 'rgba(120,100,70,0.16)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // the sun climbs and sets across the day; the moon follows it through the night
    const p = this.dl.p;
    if (p < 0.63) this.drawSun(ctx, W, H, p / 0.63);
    if (p > 0.57 && p < 0.99) this.drawMoon(ctx, W, H, (p - 0.57) / 0.42);
    // mountain layers back to front
    for (let L = 0; L < LAYERS.length; L++) this.drawLayer(ctx, L, camX, W, H, time);
    // deep ink pool at the bottom
    const pg = ctx.createLinearGradient(0, H - 90, 0, H);
    pg.addColorStop(0, 'rgba(24,26,34,0)'); pg.addColorStop(0.55, 'rgba(24,26,34,0.55)'); pg.addColorStop(1, 'rgba(18,20,28,0.95)');
    ctx.fillStyle = pg; ctx.fillRect(0, H - 90, W, 90);
    // pool surface ripples
    ctx.strokeStyle = 'rgba(30,32,44,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = H - 48 + i * 5 + Math.sin(time * 0.7 + i) * 1.5;
      const x0 = ((i * 397 - camX * (0.5 + i * 0.05)) % (W + 300) + W + 300) % (W + 300) - 150;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + 40, y - 3, x0 + 80 + i * 20, y); ctx.stroke();
    }
  }

  // the season's colour grade: each season warms or cools the paper, blending at the turn
  seasonTint(worldX) {
    const x = Math.max(0, worldX), i = Math.floor(x / SEASON_LEN), f = (x - i * SEASON_LEN) / SEASON_LEN;
    const a = SEASONS[i % 4].tint, b = SEASONS[(i + 1) % 4].tint, k = smoothstep(0.86, 1, f);
    return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  }

  // position on a sky arc: u runs 0..1 from rising at the left to setting at the right
  skyArc(W, H, u) { return { x: W * (0.1 + 0.8 * u), y: H * 0.56 - Math.sin(u * Math.PI) * H * 0.44 }; }

  // the sun is a vermilion disc, as painters leave it: deep red near the horizon, pale gold at noon
  drawSun(ctx, W, H, u) {
    const { x, y } = this.skyArc(W, H, u), hi = Math.sin(u * Math.PI), r = 34 + (1 - hi) * 10;
    const c = [lerp(214, 250, hi), lerp(70, 226, hi), lerp(48, 180, hi)];
    const fade = smoothstep(0, 0.04, u) * (1 - smoothstep(0.96, 1, u));
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
    g.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.35 * fade})`); g.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r * 3.3, y - r * 3.3, r * 6.6, r * 6.6);
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(0.55 + 0.3 * (1 - hi)) * fade})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }

  drawMoon(ctx, W, H, u) {
    const { x, y } = this.skyArc(W, H, u), r = 42;
    const fade = smoothstep(0, 0.06, u) * (1 - smoothstep(0.92, 1, u));
    ctx.save(); ctx.globalAlpha = fade;
    const g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.8);
    g.addColorStop(0, 'rgba(250,244,225,0.75)'); g.addColorStop(1, 'rgba(250,244,225,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    ctx.fillStyle = 'rgba(248,242,222,0.95)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(70,64,60,0.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0.3, TAU - 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(120,112,100,0.12)';
    for (const [dx, dy, rr] of [[-12, -8, 9], [10, 6, 12], [-4, 16, 6], [15, -14, 5]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, rr, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // the light of the hour over the landscape (the ink is painted on top, unaffected), then stars and fireflies
  // season and hour are folded into one multiply pass, since each full-screen composite costs a frame real time
  drawDaylight(ctx, W, H, camX, time) {
    const dl = this.dl; if (!dl) return;
    const t = dl.tint, se = this.seasonTint(camX + W * 0.5);
    const col = k => `rgb(${lerp(255, t[0], k) * se[0] / 255 | 0},${lerp(255, t[1], k) * se[1] / 255 | 0},${lerp(255, t[2], k) * se[2] / 255 | 0})`;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col(dl.k)); g.addColorStop(0.5, col(dl.k * 0.5)); g.addColorStop(1, col(dl.k * 0.3));
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    const n = dl.night; if (n < 0.01) return;
    for (let i = 0; i < 70; i++) {
      const x = ((hash2(i, 1, 61) * (W + 200) - camX * 0.02) % (W + 200) + W + 200) % (W + 200) - 100;
      const y = hash2(i, 2, 61) * H * 0.5, tw = 0.5 + 0.5 * Math.sin(time * (1 + hash2(i, 3, 61) * 2) + i);
      ctx.fillStyle = `rgba(255,250,232,${n * (0.35 + 0.55 * tw)})`;
      ctx.beginPath(); ctx.arc(x, y, 0.6 + hash2(i, 4, 61) * 1.1, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 26; i++) {
      const x = ((hash2(i, 5, 61) * (W + 200) - camX * 0.55) % (W + 200) + W + 200) % (W + 200) - 100 + Math.sin(time * 0.7 + i * 3) * 30;
      const y = H * 0.5 + hash2(i, 6, 61) * H * 0.34 + Math.sin(time * 0.9 + i) * 18;
      const a = n * Math.max(0, Math.sin(time * 1.8 + i * 1.7));
      if (a < 0.02) continue;
      const fg = ctx.createRadialGradient(x, y, 0, x, y, 9);
      fg.addColorStop(0, `rgba(226,240,140,${0.8 * a})`); fg.addColorStop(1, 'rgba(226,240,140,0)');
      ctx.fillStyle = fg; ctx.fillRect(x - 9, y - 9, 18, 18);
    }
  }

  // wonders that appear as the koi ascends: golden motes, sky lanterns, auspicious clouds, then cranes and shafts of light
  drawMagic(ctx, W, H, camX, time, level) {
    if (level < 0.01) return;
    const wrap = (v, m) => ((v % m) + m) % m;
    const a1 = clamp(level, 0, 1), a2 = clamp(level - 1, 0, 1), a3 = clamp(level - 2, 0, 1), a4 = clamp(level - 3, 0, 1);
    ctx.save();
    if (a4 > 0) {
      // shafts of light slanting down from the heavens
      for (let i = 0; i < 4; i++) {
        const x = wrap(i * 360 + hash2(i, 1, 71) * 200 - camX * 0.05 + Math.sin(time * 0.2 + i) * 30, W + 400) - 200;
        const g = ctx.createLinearGradient(x, 0, x + 180, H * 0.8);
        g.addColorStop(0, `rgba(255,232,170,${0.16 * a4})`); g.addColorStop(1, 'rgba(255,232,170,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x + 70, -10); ctx.lineTo(x + 330, H * 0.85); ctx.lineTo(x + 180, H * 0.85); ctx.closePath(); ctx.fill();
      }
    }
    if (a3 > 0) for (let i = 0; i < 5; i++) {
      const x = wrap(i * 430 + hash2(i, 2, 71) * 200 - camX * 0.3 + time * 12, W + 600) - 300, y = 80 + hash2(i, 3, 71) * 230 + Math.sin(time * 0.4 + i) * 6;
      this.xiangyun(ctx, x, y, 0.8 + hash2(i, 4, 71) * 0.6, a3 * 0.85, i % 2 ? 1 : -1);
    }
    if (a2 > 0) for (let i = 0; i < 12; i++) {
      const x = wrap(i * 190 + hash2(i, 5, 71) * 120 - camX * 0.12 - time * 5, W + 300) - 150 + Math.sin(time * 0.5 + i) * 8;
      const y = H * 0.72 - wrap(time * (9 + hash2(i, 6, 71) * 8) + hash2(i, 7, 71) * 900, 780);
      const a = a2 * smoothstep(H * 0.72, H * 0.6, y) * smoothstep(-30, 80, y);
      if (a > 0.01) this.skyLantern(ctx, x, y, 4.5 + hash2(i, 8, 71) * 5, a, time + i);
    }
    for (let i = 0; i < 36; i++) {
      const x = wrap(hash2(i, 9, 71) * (W + 200) - camX * 0.25 + Math.sin(time * 0.5 + i) * 20, W + 200) - 100;
      const y = H + 30 - wrap(time * (10 + hash2(i, 10, 71) * 16) + hash2(i, 11, 71) * H, H + 60);
      const tw = 0.5 + 0.5 * Math.sin(time * 3 + i * 2.1), r = 0.8 + hash2(i, 12, 71) * 1.4;
      ctx.fillStyle = `rgba(240,196,100,${a1 * 0.18 * tw})`; ctx.beginPath(); ctx.arc(x, y, r * 3.5, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(250,214,120,${a1 * (0.4 + 0.4 * tw)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    if (a4 > 0) for (let i = 0; i < 4; i++) {
      const x = W + 220 - wrap(time * 50 + i * 64 + (i % 2) * 20, W + 700), y = 120 + i * 26 + Math.abs(i - 1.5) * 10 + Math.sin(time * 1.1 + i) * 5;
      this.crane(ctx, x, y, 1 - i * 0.08, a4, time * 3.6 + i * 0.8);
    }
    ctx.restore();
  }

  // 孔明灯: a warm paper lantern drifting up
  skyLantern(ctx, x, y, s, a, t) {
    const fl = 0.85 + 0.15 * Math.sin(t * 9);
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 5);
    g.addColorStop(0, `rgba(255,196,110,${0.4 * a * fl})`); g.addColorStop(1, 'rgba(255,196,110,0)');
    ctx.fillStyle = g; ctx.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
    const b = ctx.createLinearGradient(x, y - s, x, y + s);
    b.addColorStop(0, `rgba(226,104,56,${0.85 * a})`); b.addColorStop(1, `rgba(255,212,140,${0.95 * a * fl})`);
    ctx.fillStyle = b;
    ctx.beginPath(); ctx.moveTo(x - s * 0.55, y - s); ctx.quadraticCurveTo(x, y - s * 1.35, x + s * 0.55, y - s);
    ctx.lineTo(x + s * 0.72, y + s * 0.75); ctx.lineTo(x - s * 0.72, y + s * 0.75); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(120,50,30,${0.5 * a})`; ctx.lineWidth = 0.7; ctx.stroke();
  }

  // 祥云: an auspicious cloud of scroll-curls with a trailing tail
  xiangyun(ctx, x, y, s, a, dir) {
    const curls = [[0, 0, 13], [17, -7, 10], [32, 2, 8], [-15, 4, 9]];
    ctx.fillStyle = `rgba(252,246,232,${0.8 * a})`;
    ctx.beginPath();
    for (const [dx, dy, r] of curls) { ctx.moveTo(x + dx * s * dir + r * s, y + dy * s); ctx.arc(x + dx * s * dir, y + dy * s, r * s, 0, TAU); }
    ctx.fill();
    ctx.strokeStyle = `rgba(196,140,64,${0.75 * a})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (const [dx, dy, r] of curls) {
      const cx = x + dx * s * dir, cy = y + dy * s;
      ctx.beginPath();
      for (let k = 0; k <= 26; k++) {
        const t = k / 26 * TAU * 1.15, rr = r * s * (1 - t / (TAU * 1.5));
        const px = cx + Math.cos(-t * dir + 1.6) * rr * dir, py = cy + Math.sin(-t * dir + 1.6) * rr;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x - 15 * s * dir, y + 13 * s);
    ctx.bezierCurveTo(x - 40 * s * dir, y + 16 * s, x - 55 * s * dir, y + 4 * s, x - 78 * s * dir, y + 10 * s); ctx.stroke();
  }

  // 仙鹤: a red-crowned crane, wings beating
  crane(ctx, x, y, s, a, ph) {
    const f = Math.sin(ph);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = `rgba(30,30,40,${0.85 * a})`; ctx.lineCap = 'round'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-14, -3, -20, 0); ctx.stroke();            // neck, reaching forward (to the left)
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, 2); ctx.stroke();                                  // legs trailing
    ctx.fillStyle = `rgba(252,250,244,${0.95 * a})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill();
    for (const sg of [1, -1]) {
      const wy = -sg * (4 + f * 9 * sg) ;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(0, wy, 10, wy * 1.2); ctx.quadraticCurveTo(4, wy * 0.4, 3, 0); ctx.closePath();
      ctx.fillStyle = `rgba(252,250,244,${0.95 * a})`; ctx.fill();
      ctx.strokeStyle = `rgba(30,30,40,${0.5 * a})`; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.strokeStyle = `rgba(20,20,28,${0.85 * a})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(7, wy * 1.05); ctx.lineTo(10, wy * 1.2); ctx.stroke();                // black flight feathers
    }
    ctx.fillStyle = `rgba(200,40,36,${a})`; ctx.beginPath(); ctx.arc(-20, -0.5, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawLayer(ctx, L, camX, W, H, time) {
    const p = LAYERS[L];
    const ox = camX * p.par;
    const step = 6;
    const seasonIdx = this.seasonIndex(camX + W * 0.5);
    // three offset washes give the layered "wet wash" look
    for (let pass = 0; pass < 3; pass++) {
      const dy = pass * p.amp * 0.06;
      const alpha = pass === 0 ? p.alpha * 0.55 : pass === 1 ? p.alpha * 0.5 : p.alpha * 0.35;
      ctx.fillStyle = `rgba(${p.col},${alpha})`;
      ctx.beginPath(); ctx.moveTo(-10, H + 10);
      for (let x = -10; x <= W + 10; x += step) {
        const y = this.ridge(L, x + ox) + dy + (pass ? (vnoise((x + ox) * 0.05, pass * 9, 77) - 0.5) * 6 : 0);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 10, H + 10); ctx.closePath(); ctx.fill();
    }
    // ridge line: a broken, pressure-varied brush line
    ctx.lineCap = 'round';
    let prev = null;
    for (let x = -10; x <= W + 10; x += step) {
      const wx = x + ox;
      const y = this.ridge(L, wx);
      if (prev) {
        const n = vnoise(wx * 0.03, L * 5, 91);
        if (n > 0.25) {
          ctx.strokeStyle = `rgba(28,30,40,${p.line * (0.5 + n * 0.5)})`;
          ctx.lineWidth = 0.6 + n * 2.2 * p.lineW;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(x, y); ctx.stroke();
        }
      }
      prev = { x, y };
    }
    // snow on the ridge in winter
    if (seasonIdx === 3 && L >= 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.2;
      for (let x = -10; x <= W + 10; x += step * 2) {
        const wx = x + ox; if (vnoise(wx * 0.04, 5, 33) < 0.45) continue;
        const y = this.ridge(L, wx);
        ctx.beginPath(); ctx.moveTo(x, y - 1); ctx.lineTo(x + step * 2, this.ridge(L, wx + step * 2) - 1); ctx.stroke();
      }
    }
    // mist below the ridge
    const mg = ctx.createLinearGradient(0, p.base - p.amp * 0.15, 0, p.base + 90);
    mg.addColorStop(0, 'rgba(241,234,219,0)'); mg.addColorStop(0.5, `rgba(241,234,219,${p.mist})`); mg.addColorStop(1, 'rgba(241,234,219,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, p.base - p.amp * 0.15, W, p.amp * 0.15 + 90);
    // decorations
    this.drawDecorations(ctx, L, ox, W, seasonIdx, time);
  }

  chunkDeco(L, ci) {
    const key = L * 100000 + ci;
    let d = this.decoCache.get(key);
    if (d) return d;
    const rng = mulberry32((this.seed * 31 + ci * 7919 + L * 104729) >>> 0);
    d = [];
    const CH = 700;
    const p = LAYERS[L];
    if (L === 1) {
      // distant pines and pagodas on the mid ridge
      const n = 1 + (rng() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const x = ci * CH + rng() * CH;
        if (rng() < 0.12) d.push({ t: 'pagoda', x, s: 0.6 + rng() * 0.4 });
        else d.push({ t: 'pine', x, s: 0.55 + rng() * 0.4, k: rng() });
      }
      if (rng() < 0.35) d.push({ t: 'birds', x: ci * CH + rng() * CH, y: 90 + rng() * 160, n: 3 + (rng() * 5 | 0), s: rng() });
    } else if (L === 2) {
      const n = 2 + (rng() * 3 | 0);
      for (let i = 0; i < n; i++) {
        const x = ci * CH + rng() * CH;
        const r = rng();
        if (r < 0.45) d.push({ t: 'pine', x, s: 0.9 + rng() * 0.6, k: rng() });
        else if (r < 0.8) d.push({ t: 'bamboo', x, n: 3 + (rng() * 4 | 0), s: 0.8 + rng() * 0.5, k: rng() });
        else d.push({ t: 'plum', x, s: 0.8 + rng() * 0.5, k: rng() });
      }
      if (rng() < 0.18) d.push({ t: 'hut', x: ci * CH + rng() * CH, s: 0.9 + rng() * 0.3 });
    }
    this.decoCache.set(key, d);
    return d;
  }

  drawDecorations(ctx, L, ox, W, seasonIdx, time) {
    if (L === 0) return;
    const CH = 700;
    const c0 = Math.floor((ox - 200) / CH), c1 = Math.floor((ox + W + 200) / CH);
    const p = LAYERS[L];
    for (let ci = c0; ci <= c1; ci++) {
      for (const d of this.chunkDeco(L, ci)) {
        const sx = d.x - ox;
        if (sx < -150 || sx > W + 150) continue;
        const gy = this.ridge(L, d.x);
        const a = p.alpha * 1.6;
        switch (d.t) {
          case 'pine': this.pine(ctx, sx, gy, d.s * (L === 2 ? 1 : 0.6), a, d.k, seasonIdx); break;
          case 'bamboo': this.bamboo(ctx, sx, gy, d, a, time, seasonIdx); break;
          case 'plum': this.plum(ctx, sx, gy, d.s, a, d.k, seasonIdx); break;
          case 'pagoda': this.pagoda(ctx, sx, gy, d.s, a); this.glowAt(ctx, sx, gy - 30 * d.s, 12 * d.s); break;
          case 'hut': this.hut(ctx, sx, gy, d.s, a); this.glowAt(ctx, sx, gy - 8 * d.s, 16 * d.s); break;
          case 'birds': this.birds(ctx, sx, d.y, d.n, d.s, a, time); break;
        }
      }
    }
  }

  pine(ctx, x, y, s, a, k, seasonIdx) {
    ctx.strokeStyle = `rgba(30,32,42,${a})`; ctx.lineCap = 'round';
    const h = 60 * s;
    // trunk with a slight lean
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + (k - 0.5) * 14 * s, y - h * 0.5, x + (k - 0.5) * 22 * s, y - h); ctx.stroke();
    // needle clusters: flat horizontal dabs
    for (let i = 0; i < 4; i++) {
      const t = 0.35 + i * 0.2;
      const tx = x + (k - 0.5) * 22 * s * t, ty = y - h * t;
      const w = (26 - i * 5) * s;
      ctx.lineWidth = (5 - i * 0.7) * s;
      ctx.strokeStyle = `rgba(30,32,42,${a * 0.9})`;
      ctx.beginPath(); ctx.moveTo(tx - w, ty + 3 * s); ctx.quadraticCurveTo(tx, ty - 4 * s, tx + w * 0.9, ty + 2 * s); ctx.stroke();
      // fine needles
      ctx.lineWidth = 0.8;
      for (let j = -3; j <= 3; j++) {
        const nx = tx + j * w * 0.28;
        ctx.beginPath(); ctx.moveTo(nx, ty); ctx.lineTo(nx + j * 1.5, ty - 6 * s); ctx.stroke();
      }
      if (seasonIdx === 3) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(tx - w * 0.8, ty); ctx.quadraticCurveTo(tx, ty - 6 * s, tx + w * 0.7, ty - 1); ctx.stroke(); }
    }
  }

  bamboo(ctx, x, y, d, a, time, seasonIdx) {
    const s = d.s;
    for (let b = 0; b < d.n; b++) {
      const bx = x + (b - d.n / 2) * 14 * s + hash2(b, d.n, 4) * 8;
      const h = (150 + hash2(b, 3, 8) * 90) * s;
      const sway = Math.sin(time * 0.8 + b + d.k * 6) * 6;
      const lean = (hash2(b, 9, 2) - 0.5) * 30 + sway;
      ctx.strokeStyle = `rgba(34,40,44,${a * 0.85})`; ctx.lineCap = 'butt';
      ctx.lineWidth = 2.6 * s;
      // segments with nodes
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs - 0.03;
        ctx.beginPath();
        ctx.moveTo(bx + lean * t0 * t0, y - h * t0);
        ctx.lineTo(bx + lean * t1 * t1, y - h * t1);
        ctx.stroke();
      }
      // leaves: quick tapered dabs
      ctx.fillStyle = seasonIdx === 1 ? `rgba(60,90,70,${a * 0.9})` : `rgba(30,34,42,${a * 0.9})`;
      for (let i = 0; i < 9; i++) {
        const t = 0.45 + hash2(b * 7 + i, 1, 6) * 0.55;
        const lx = bx + lean * t * t, ly = y - h * t;
        const ang = (hash2(i, b, 11) - 0.5) * 2.4 + 0.4 + Math.sin(time + i) * 0.08;
        const len = (18 + hash2(i, b, 12) * 14) * s;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -3.2 * s, len, 0); ctx.quadraticCurveTo(len * 0.5, 3.2 * s, 0, 0); ctx.fill();
        ctx.restore();
      }
    }
  }

  plum(ctx, x, y, s, a, k, seasonIdx) {
    ctx.strokeStyle = `rgba(30,32,42,${a})`; ctx.lineCap = 'round';
    const branch = (x0, y0, ang, len, w, depth) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + Math.cos(ang + 0.5) * len * 0.5, y0 + Math.sin(ang + 0.5) * len * 0.5, x1, y1); ctx.stroke();
      if (depth > 0) {
        branch(x1, y1, ang - 0.6 - hash2(depth, x0 | 0, 1) * 0.4, len * 0.7, w * 0.65, depth - 1);
        if (hash2(depth, y0 | 0, 2) > 0.3) branch(x1, y1, ang + 0.5 + hash2(depth, x0 | 0, 3) * 0.5, len * 0.6, w * 0.6, depth - 1);
      } else if (seasonIdx === 0 || seasonIdx === 2) {
        // blossoms in spring, red leaves in autumn
        const col = seasonIdx === 0 ? 'rgba(214,88,110,' : 'rgba(200,84,30,';
        for (let i = 0; i < 4; i++) {
          const bx = x1 + (hash2(i, x1 | 0, 5) - 0.5) * 16, by = y1 + (hash2(i, y1 | 0, 6) - 0.5) * 16;
          ctx.fillStyle = col + (0.55 + hash2(i, 2, 7) * 0.3) + ')';
          ctx.beginPath(); ctx.arc(bx, by, 2.4 + hash2(i, 3, 8) * 1.6, 0, TAU); ctx.fill();
        }
      }
    };
    branch(x, y + 2, -Math.PI / 2 + (k - 0.5) * 0.8, 46 * s, 3.2 * s, 3);
  }

  pagoda(ctx, x, y, s, a) {
    ctx.strokeStyle = `rgba(30,32,42,${a})`; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const ty = y - i * 16 * s - 6, w = (22 - i * 4) * s;
      ctx.beginPath(); ctx.moveTo(x - w, ty); ctx.quadraticCurveTo(x - w * 0.5, ty - 4, x, ty - 5); ctx.quadraticCurveTo(x + w * 0.5, ty - 4, x + w, ty); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - w * 0.6, ty); ctx.lineTo(x - w * 0.55, ty - 10 * s); ctx.moveTo(x + w * 0.6, ty); ctx.lineTo(x + w * 0.55, ty - 10 * s); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(x, y - tiers * 16 * s - 8); ctx.lineTo(x, y - tiers * 16 * s - 22 * s); ctx.stroke();
  }

  // a lamp lit in a window as night falls
  glowAt(ctx, x, y, r) {
    const n = this.dl ? this.dl.night : 0; if (n < 0.02) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
    g.addColorStop(0, `rgba(255,206,120,${0.8 * n})`); g.addColorStop(0.3, `rgba(255,180,90,${0.35 * n})`); g.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
  }

  hut(ctx, x, y, s, a) {
    ctx.strokeStyle = `rgba(30,32,42,${a})`; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const w = 26 * s, h = 18 * s;
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.8, y - h); ctx.lineTo(x + w * 0.8, y - h); ctx.lineTo(x + w, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w * 1.2, y - h); ctx.quadraticCurveTo(x, y - h - 12 * s, x + w * 1.2, y - h); ctx.stroke();
    ctx.fillStyle = `rgba(30,32,42,${a * 0.5})`;
    ctx.beginPath(); ctx.moveTo(x - w * 1.2, y - h); ctx.quadraticCurveTo(x, y - h - 12 * s, x + w * 1.2, y - h); ctx.lineTo(x, y - h - 2 * s); ctx.closePath(); ctx.fill();
  }

  birds(ctx, x, y, n, s, a, time) {
    ctx.strokeStyle = `rgba(30,32,42,${Math.min(0.7, a * 1.4)})`; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const bx = x + i * 16 - (i % 2) * 4, by = y + Math.abs(i - n / 2) * 6 + Math.sin(time * 2 + i) * 1.5;
      const f = Math.sin(time * 6 + i * 1.3) * 2;
      ctx.beginPath(); ctx.moveTo(bx - 5, by + f); ctx.quadraticCurveTo(bx - 1, by - 2, bx, by); ctx.quadraticCurveTo(bx + 1, by - 2, bx + 5, by + f); ctx.stroke();
    }
  }
}

// parallax layers, back to front
const LAYERS = [
  { par: 0.08, base: 470, amp: 260, freq: 0.0011, alpha: 0.13, col: '70,76,92', line: 0.10, lineW: 0.5, mist: 0.55 },
  { par: 0.2, base: 560, amp: 210, freq: 0.0016, alpha: 0.22, col: '52,58,74', line: 0.22, lineW: 0.8, mist: 0.5 },
  { par: 0.42, base: 660, amp: 140, freq: 0.0024, alpha: 0.30, col: '36,40,54', line: 0.38, lineW: 1.0, mist: 0.35 },
];
