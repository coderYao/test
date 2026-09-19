'use strict';
// ---------- the scroll: rice paper, layered mountain washes, mist, moon, pines, bamboo, seasons ----------
const SEASONS = [
  { name: '春', en: 'Spring', accent: 'rgba(214,88,110,', tint: [0, 0, 0], particle: 'petal' },
  { name: '夏', en: 'Summer', accent: 'rgba(70,120,90,', tint: [0, 0, 0], particle: 'rain' },
  { name: '秋', en: 'Autumn', accent: 'rgba(200,84,30,', tint: [0, 0, 0], particle: 'leaf' },
  { name: '冬', en: 'Winter', accent: 'rgba(255,255,255,', tint: [0, 0, 0], particle: 'snow' },
];
const SEASON_LEN = 6000; // world px per season

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

  drawBackground(ctx, camX, W, H, time) {
    // paper
    ctx.fillStyle = this.paperPattern; ctx.save(); ctx.translate(-(camX * 0.02) % 512, 0); ctx.fillRect(0, -1, W + 512, H + 2); ctx.restore();
    // subtle warm vignette / light from top-left
    const vg = ctx.createRadialGradient(W * 0.3, H * 0.2, H * 0.2, W * 0.5, H * 0.5, W * 0.9);
    vg.addColorStop(0, 'rgba(255,250,235,0.25)'); vg.addColorStop(1, 'rgba(120,100,70,0.16)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // moon
    this.drawMoon(ctx, W, H, camX);
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

  drawMoon(ctx, W, H, camX) {
    const x = W * 0.78 - (camX * 0.01) % 50, y = 110, r = 46;
    const g = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(250,244,225,0.7)'); g.addColorStop(1, 'rgba(250,244,225,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 2.5, y - r * 2.5, r * 5, r * 5);
    ctx.fillStyle = 'rgba(246,238,215,0.9)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(70,64,60,0.22)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0.3, TAU - 0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(70,64,60,0.10)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r - 4, 1.2, 3.6); ctx.stroke();
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
          case 'pagoda': this.pagoda(ctx, sx, gy, d.s, a); break;
          case 'hut': this.hut(ctx, sx, gy, d.s, a); break;
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
