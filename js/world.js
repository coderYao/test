'use strict';
// ---------- procedural scroll: ink clouds, pearls, lotus, ensō rings, dragon gates, fishing hooks, the rising ink tide ----------
const CHUNK = 800;
const GATE = { FIRST: 2600, EVERY: 3000, R: 84 }; // 龙门: a great vermilion ensō every 300 丈
const RING_R = [44, 56];                          // 圆相: small ensō rings to swim through

class World {
  constructor(seed) {
    this.seed = seed;
    this.chunks = new Map();
    this.pearls = [];   // {x,y,taken,t}
    this.lotus = [];    // {x,y,taken,t}
    this.rings = [];    // {x,y,r,gate,n,taken,missed,t,fx}
    this.hooks = [];    // {x,y0,len,phase,sway}
    this.clouds = [];   // {x,y,r,amt,deposited}
    this.tideX = -420;
    this.tideV = 95;
    this.tidePush = 0; this.tideHold = 0; this.tideSlack = 0; // lotus: the tide ebbs, rests, then returns
    this.bestX = 0;     // world x of the player's best distance, marked on the scroll
    this.bestPassed = false;
  }

  difficulty(x) { return clamp(x / 42000, 0, 1); }

  ensure(x0, x1) {
    const c0 = Math.floor(x0 / CHUNK), c1 = Math.floor(x1 / CHUNK);
    for (let i = c0; i <= c1; i++) if (!this.chunks.has(i)) this.gen(i);
  }

  gen(i) {
    this.chunks.set(i, true);
    const rng = mulberry32((this.seed + i * 7919) >>> 0);
    const x0 = i * CHUNK;
    const diff = this.difficulty(x0);
    if (i < 1) return;                      // calm start
    // a dragon gate falls in this chunk? Then keep the air around it clear, and lead into it with pearls
    const k = Math.ceil((x0 - GATE.FIRST) / GATE.EVERY), gx = GATE.FIRST + Math.max(0, k) * GATE.EVERY;
    if (gx >= x0 && gx < x0 + CHUNK) {
      const gy = 220 + rng() * 260;
      this.rings.push({ x: gx, y: gy, r: GATE.R, gate: true, n: Math.round((gx - GATE.FIRST) / GATE.EVERY) + 1, taken: false, missed: false, t: rng() * TAU, fx: 0 });
      for (let p = 0; p < 4; p++) this.pearls.push({ x: gx - 230 + p * 44, y: gy + Math.sin(p * 0.9) * 20, taken: false, t: rng() * TAU });
    }
    // gates sit at a fixed spacing, so every chunk can keep clear of the nearest one, including a gate in the next chunk
    const clear = (x, reach = 0) => Math.abs(x - (GATE.FIRST + Math.max(0, Math.round((x - GATE.FIRST) / GATE.EVERY)) * GATE.EVERY)) > 240 + reach;
    // ink clouds
    if (i >= 2) {
      const n = Math.floor(0.6 + diff * 3.2 + rng() * 1.6);
      for (let q = 0; q < n; q++) {
        const cx = x0 + 80 + rng() * (CHUNK - 160), cy = 120 + rng() * 440;
        const r = 34 + rng() * (36 + diff * 50);
        const sub = 2 + (rng() * 4 | 0);
        if (!clear(cx, r * 2.1)) continue; // a cloud's ink reaches about 2r from its centre once its blobs spread
        for (let s = 0; s < sub; s++) {
          const a = rng() * TAU, d = rng() * r * 0.8;
          this.clouds.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: r * (0.45 + rng() * 0.5), amt: 0.75 + rng() * 0.45, deposited: false });
        }
      }
    }
    // pearls: arcs of 3-6
    const arcs = 1 + (rng() < 0.5 + diff * 0.2 ? 1 : 0);
    for (let a = 0; a < arcs; a++) {
      const n = 3 + (rng() * 4 | 0);
      const px = x0 + 60 + rng() * (CHUNK - 260), py = 140 + rng() * 380;
      const dir = rng() < 0.5 ? -1 : 1, curve = rng() * 60;
      if (!clear(px + n * 21)) continue;
      for (let q = 0; q < n; q++) {
        const t = q / (n - 1 || 1);
        this.pearls.push({ x: px + q * 42, y: py + dir * Math.sin(t * Math.PI) * curve, taken: false, t: rng() * TAU });
      }
    }
    // ensō rings: a target to paint a path through
    if (i >= 2 && rng() < 0.6) {
      const rx = x0 + 100 + rng() * (CHUNK - 200);
      if (clear(rx)) this.rings.push({ x: rx, y: 170 + rng() * 330, r: RING_R[0] + rng() * (RING_R[1] - RING_R[0]), gate: false, taken: false, missed: false, t: rng() * TAU, fx: 0 });
    }
    if (rng() < 0.28 + diff * 0.1) { const lx = x0 + rng() * CHUNK; if (clear(lx)) this.lotus.push({ x: lx, y: 160 + rng() * 380, taken: false, t: rng() * TAU }); }
    // fishing hooks dangling from beyond the top of the scroll
    if (i >= 6 && rng() < 0.25 + diff * 0.5) {
      const n = 1 + (rng() < diff * 0.7 ? 1 : 0);
      for (let q = 0; q < n; q++) { const hx = x0 + 120 + rng() * (CHUNK - 240); if (clear(hx)) this.hooks.push({ x: hx, len: 170 + rng() * 260, phase: rng() * TAU, sway: 14 + rng() * 22 }); }
    }
  }

  // push clouds that have entered the field window into the density grid
  depositClouds(field) {
    const right = field.right();
    for (const c of this.clouds) {
      if (c.deposited) continue;
      if (c.x + c.r * 2 < right && c.x - c.r * 2 > field.ox) { field.deposit(c.x, c.y, c.r, c.amt); c.deposited = true; }
      else if (c.x + c.r * 2 < field.ox) c.deposited = true; // scrolled past before it entered the window
    }
  }

  prune(minX) {
    this.pearls = this.pearls.filter(p => p.x > minX);
    this.lotus = this.lotus.filter(p => p.x > minX);
    this.rings = this.rings.filter(p => p.x > minX - 200);
    this.hooks = this.hooks.filter(p => p.x > minX);
    this.clouds = this.clouds.filter(p => p.x > minX - 300);
  }

  updateTide(dt, camX, koiX) {
    const diff = this.difficulty(koiX);
    this.tideV = 95 + diff * 150;
    if (this.tidePush > 0) { const m = Math.min(this.tidePush, 520 * dt); this.tideX -= m; this.tidePush -= m; }
    else if (this.tideHold > 0) this.tideHold -= dt;
    else { this.tideX += this.tideV * dt; this.tideSlack = Math.max(0, this.tideSlack - 45 * dt); }
    this.tideX = Math.max(this.tideX, camX - 30 - this.tideSlack);
  }

  // the tide ebbs by `dist`, rests for `hold` seconds, then creeps back to the edge of the scroll
  ebbTide(d, hold) {
    this.tideSlack = Math.min(this.tideSlack + d, d * 2);
    this.tidePush = Math.min(this.tidePush + d, this.tideSlack);
    this.tideHold = hold;
  }

  hookTip(h, time) {
    const sx = Math.sin(time * 0.9 + h.phase) * h.sway;
    return { x: h.x + sx, y: h.len + Math.sin(time * 1.7 + h.phase) * 8 };
  }

  // an ensō painted once with the stroke renderer: a heavy landing, thinning into 飞白, never quite closed
  static paintEnso(ring) {
    const r = ring.r, gate = ring.gate;
    const W0 = gate ? 19 : 12, W1 = gate ? 6 : 4;
    const pad = W0 * 2 + 10, size = (r + pad) * 2, k = Math.min(2, window.devicePixelRatio || 1) * 1.2;
    const cv = document.createElement('canvas'); cv.width = Math.ceil(size * k); cv.height = Math.ceil(size * k);
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, size * k / 2, size * k / 2);
    const id = (ring.x * 13 + ring.y) | 0, a0 = -2.2 + hash2(id, 1, 3) * 0.6, sweep = TAU * (0.86 + hash2(id, 2, 3) * 0.06);
    const pts = [], n = Math.ceil(sweep * r / 3.5);
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + sweep * u;
      const rr = r * (1 + (vnoise(u * 5, id, 7) - 0.5) * 0.06) + u * 3;
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, w: lerp(W0, W1, Math.pow(u, 0.8)) * (u < 0.05 ? 0.7 + u * 6 : 1), dry: smoothstep(0.45, 1, u) * 0.85 });
    }
    Stroke.paint(c, pts, id);
    if (gate) {
      c.globalCompositeOperation = 'source-atop';
      const g = c.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, 'rgba(190,44,32,0.92)'); g.addColorStop(0.6, 'rgba(206,70,40,0.9)'); g.addColorStop(1, 'rgba(214,148,62,0.9)');
      c.fillStyle = g; c.fillRect(-size / 2, -size / 2, size, size);
    }
    ring.cv = cv; ring.cs = size;
  }

  drawRings(ctx, camX, W, time) {
    ctx.save(); ctx.translate(-camX, 0);
    for (const g of this.rings) {
      if (g.x < camX - 160 || g.x > camX + W + 160) continue;
      if (!g.cv) World.paintEnso(g);
      const y = g.y + Math.sin(time * 1.1 + g.t) * 4;
      let a = g.missed ? 0.3 : 1, sc = 1;
      if (g.taken) { const u = clamp(g.fx / 0.6, 0, 1); sc = 1 + easeOut(u) * 0.45; a = 1 - u; }
      if (a <= 0.01) continue;
      if (g.gate && !g.taken) {
        // a warm glow in the gate's eye, and its seal
        const gr = ctx.createRadialGradient(g.x, y, 4, g.x, y, g.r * 1.1);
        gr.addColorStop(0, `rgba(255,224,160,${0.35 * a})`); gr.addColorStop(1, 'rgba(255,224,160,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, y, g.r * 1.1, 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.globalAlpha = a; ctx.translate(g.x, y); ctx.rotate(Math.sin(time * 0.3 + g.t) * 0.05); ctx.scale(sc, sc);
      ctx.drawImage(g.cv, -g.cs / 2, -g.cs / 2, g.cs, g.cs);
      ctx.restore();
      if (g.gate && !g.taken) {
        const sx = g.x + g.r * 0.8, sy = y - g.r - 22;
        ctx.save(); ctx.globalAlpha = a; ctx.translate(sx, sy); ctx.rotate(0.06);
        ctx.fillStyle = 'rgba(184,44,36,0.9)'; ctx.fillRect(-15, -26, 30, 52);
        ctx.fillStyle = 'rgba(245,236,220,0.95)'; ctx.font = `20px ${FONT_BRUSH}`; ctx.textAlign = 'center';
        ctx.fillText('龙', 0, -5); ctx.fillText('门', 0, 18);
        ctx.restore();
        ctx.fillStyle = `rgba(40,30,30,${0.8 * a})`; ctx.font = `600 13px ${FONT_TEXT}`; ctx.textAlign = 'center';
        ctx.fillText(`Dragon Gate ${g.n}`, g.x, y + g.r + 34);
      }
    }
    ctx.restore();
  }

  drawPickups(ctx, camX, W, time) {
    ctx.save(); ctx.translate(-camX, 0);
    for (const p of this.pearls) {
      if (p.taken || p.x < camX - 40 || p.x > camX + W + 40) continue;
      const y = p.y + Math.sin(time * 2 + p.t) * 3;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + p.t * 2);
      // a soft lustre around the pearl so it reads against ink and paper alike
      const h = ctx.createRadialGradient(p.x, y, 4, p.x, y, 17);
      h.addColorStop(0, `rgba(250,244,226,${0.55 + 0.25 * pulse})`); h.addColorStop(1, 'rgba(250,244,226,0)');
      ctx.fillStyle = h; ctx.beginPath(); ctx.arc(p.x, y, 17, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(p.x - 2.5, y - 2.5, 0.5, p.x, y, 8.5);
      g.addColorStop(0, 'rgba(150,154,172,1)'); g.addColorStop(0.45, 'rgba(46,48,62,1)'); g.addColorStop(1, 'rgba(14,15,22,1)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, y, 7.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(12,12,18,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = 'rgba(250,248,238,0.9)'; ctx.beginPath(); ctx.ellipse(p.x - 2.4, y - 2.8, 2.1, 1.3, -0.6, 0, TAU); ctx.fill();
    }
    for (const l of this.lotus) {
      if (l.taken || l.x < camX - 60 || l.x > camX + W + 60) continue;
      const y = l.y + Math.sin(time * 1.5 + l.t) * 4;
      ctx.save(); ctx.translate(l.x, y);
      const gl = ctx.createRadialGradient(0, -4, 3, 0, -4, 36);
      gl.addColorStop(0, 'rgba(255,214,214,0.55)'); gl.addColorStop(1, 'rgba(255,214,214,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -4, 36, 0, TAU); ctx.fill();
      // a lily pad wash beneath
      ctx.fillStyle = 'rgba(70,96,80,0.4)'; ctx.beginPath(); ctx.ellipse(0, 6, 22, 6.5, 0, 0.25, TAU - 0.25); ctx.lineTo(0, 6); ctx.fill();
      // lotus: two rings of petals in a vermilion-pink wash with ink veins
      const petal = (a, len, wid, col) => {
        ctx.save(); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 4, 0, -len);
        g.addColorStop(0, 'rgba(248,226,222,0.9)'); g.addColorStop(1, col);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-wid, -len * 0.35, 0, -len); ctx.quadraticCurveTo(wid, -len * 0.35, 0, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(120,40,60,0.3)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -len * 0.8); ctx.stroke();
        ctx.restore();
      };
      const breathe = Math.sin(time * 2 + l.t) * 0.04;
      for (let i = 0; i < 4; i++) petal(-Math.PI / 2 + (i - 1.5) * (0.75 + breathe), 16, 8, 'rgba(214,96,110,0.75)');
      for (let i = 0; i < 3; i++) petal(-Math.PI / 2 + (i - 1) * (0.42 + breathe), 20, 7.5, 'rgba(206,64,84,0.9)');
      ctx.fillStyle = 'rgba(232,196,86,0.95)'; ctx.beginPath(); ctx.ellipse(0, -1, 4, 2.6, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawHooks(ctx, camX, W, time) {
    ctx.save(); ctx.translate(-camX, 0);
    for (const h of this.hooks) {
      if (h.x < camX - 80 || h.x > camX + W + 80) continue;
      const tip = this.hookTip(h, time);
      ctx.strokeStyle = 'rgba(40,40,52,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(h.x, -5); ctx.quadraticCurveTo(h.x + (tip.x - h.x) * 0.3, tip.y * 0.6, tip.x, tip.y); ctx.stroke();
      // the hook itself
      ctx.strokeStyle = 'rgba(30,30,40,0.9)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x, tip.y + 10); ctx.arc(tip.x + 5, tip.y + 10, 5, Math.PI, 0.2, true); ctx.stroke();
      // a float above
      ctx.fillStyle = 'rgba(200,60,50,0.8)'; ctx.beginPath(); ctx.arc(h.x + (tip.x - h.x) * 0.3, tip.y * 0.6 - 10, 3.2, 0, TAU); ctx.fill();
      // a faint danger halo around the barb
      const g = ctx.createRadialGradient(tip.x + 4, tip.y + 10, 2, tip.x + 4, tip.y + 10, 22);
      g.addColorStop(0, 'rgba(160,40,30,0.14)'); g.addColorStop(1, 'rgba(160,40,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tip.x + 4, tip.y + 10, 22, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // the player's record, planted on the scroll as a pole with a red seal: something to swim past
  drawBest(ctx, camX, W, H, time) {
    const x = this.bestX - camX;
    if (this.bestX <= 200 || x < -40 || x > W + 60) return;
    ctx.save();
    const a = this.bestPassed ? 0.35 : 0.85;
    ctx.strokeStyle = `rgba(160,40,32,${a * 0.55})`; ctx.lineWidth = 2; ctx.setLineDash([10, 9]); ctx.lineDashOffset = -time * 20;
    ctx.beginPath(); ctx.moveTo(x, 200); ctx.lineTo(x, H - 50); ctx.stroke(); ctx.setLineDash([]);
    // the flag rides low on the pole, clear of the score and the season inscription
    const fy = H - 150;
    ctx.translate(x, fy); ctx.rotate(-0.05 + Math.sin(time * 1.4) * 0.03);
    ctx.fillStyle = `rgba(184,44,36,${a})`; ctx.fillRect(0, -40, 46, 34);
    ctx.fillStyle = `rgba(245,236,220,${a})`; ctx.font = `19px ${FONT_BRUSH}`; ctx.textAlign = 'center';
    ctx.fillText('最远', 23, -16);
    ctx.fillStyle = `rgba(120,30,24,${a})`; ctx.font = `600 13px ${FONT_TEXT}`; ctx.textAlign = 'left';
    ctx.fillText(`Best ${Math.floor((this.bestX - 150) / 10)} 丈`, 52, -18);
    ctx.restore();
  }

  drawTide(ctx, camX, W, H, time) {
    const tx = this.tideX - camX;
    if (tx < -260) return;
    ctx.save();
    for (let pass = 0; pass < 3; pass++) {
      const pad = pass * 26, a = pass === 0 ? 0.95 : pass === 1 ? 0.35 : 0.14;
      ctx.fillStyle = `rgba(20,22,30,${a})`;
      ctx.beginPath(); ctx.moveTo(-400, -10);
      for (let y = -10; y <= H + 10; y += 10) {
        const n = fbm(y * 0.008 + pass, time * 0.25, 3, 5) - 0.5;
        const n2 = Math.sin(y * 0.05 + time * 1.4 + pass) * 6;
        ctx.lineTo(tx + pad + n * 140 + n2, y);
      }
      ctx.lineTo(-400, H + 10); ctx.closePath(); ctx.fill();
    }
    // spatters flung ahead of the tide's edge
    ctx.fillStyle = 'rgba(20,22,30,0.6)';
    for (let i = 0; i < 14; i++) {
      const y = (hash2(i, 1, 9) * H + time * 30 * (0.5 + hash2(i, 2, 9))) % H;
      const n = fbm(y * 0.008, time * 0.25, 3, 5) - 0.5;
      const x = tx + n * 140 + 20 + hash2(i, 3, 9) * 40 + Math.sin(time * 2 + i) * 6;
      ctx.beginPath(); ctx.arc(x, y, 1 + hash2(i, 4, 9) * 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
