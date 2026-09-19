'use strict';
// ---------- procedural scroll: ink clouds, pearls, lotus, fishing hooks, the rising ink tide ----------
const CHUNK = 800;

class World {
  constructor(seed) {
    this.seed = seed;
    this.chunks = new Map();
    this.pearls = [];   // {x,y,taken,t}
    this.lotus = [];    // {x,y,taken,t}
    this.hooks = [];    // {x,y0,len,phase,sway}
    this.clouds = [];   // {x,y,r,amt,deposited}
    this.tideX = -420;
    this.tideV = 95;
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
    // ink clouds
    if (i >= 2) {
      const n = Math.floor(0.6 + diff * 3.2 + rng() * 1.6);
      for (let k = 0; k < n; k++) {
        const cx = x0 + 80 + rng() * (CHUNK - 160), cy = 120 + rng() * 440;
        const r = 34 + rng() * (36 + diff * 50);
        const sub = 2 + (rng() * 4 | 0);
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
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1 || 1);
        this.pearls.push({ x: px + k * 42, y: py + dir * Math.sin(t * Math.PI) * curve, taken: false, t: rng() * TAU });
      }
    }
    if (rng() < 0.28 + diff * 0.1) this.lotus.push({ x: x0 + rng() * CHUNK, y: 160 + rng() * 380, taken: false, t: rng() * TAU });
    // fishing hooks dangling from beyond the top of the scroll
    if (i >= 6 && rng() < 0.25 + diff * 0.5) {
      const n = 1 + (rng() < diff * 0.7 ? 1 : 0);
      for (let k = 0; k < n; k++) this.hooks.push({ x: x0 + 120 + rng() * (CHUNK - 240), len: 170 + rng() * 260, phase: rng() * TAU, sway: 14 + rng() * 22 });
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
    this.hooks = this.hooks.filter(p => p.x > minX);
    this.clouds = this.clouds.filter(p => p.x > minX - 300);
  }

  updateTide(dt, camX, koiX) {
    const diff = this.difficulty(koiX);
    this.tideV = 95 + diff * 150;
    this.tideX = Math.max(this.tideX + this.tideV * dt, camX - 30);
  }

  hookTip(h, time) {
    const sx = Math.sin(time * 0.9 + h.phase) * h.sway;
    return { x: h.x + sx, y: h.len + Math.sin(time * 1.7 + h.phase) * 8 };
  }

  drawPickups(ctx, camX, W, time) {
    ctx.save(); ctx.translate(-camX, 0);
    for (const p of this.pearls) {
      if (p.taken || p.x < camX - 40 || p.x > camX + W + 40) continue;
      const y = p.y + Math.sin(time * 2 + p.t) * 3;
      const g = ctx.createRadialGradient(p.x - 2, y - 2, 1, p.x, y, 8);
      g.addColorStop(0, 'rgba(120,124,140,0.95)'); g.addColorStop(0.6, 'rgba(30,32,44,0.95)'); g.addColorStop(1, 'rgba(30,32,44,0.0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, y, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(240,236,224,0.8)'; ctx.beginPath(); ctx.arc(p.x - 2.2, y - 2.4, 1.6, 0, TAU); ctx.fill();
    }
    for (const l of this.lotus) {
      if (l.taken || l.x < camX - 60 || l.x > camX + W + 60) continue;
      const y = l.y + Math.sin(time * 1.5 + l.t) * 4;
      ctx.save(); ctx.translate(l.x, y);
      // lotus: five petals in vermilion wash with ink veins
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = `rgba(212,82,96,${0.55 + (i === 2 ? 0.25 : 0)})`;
        ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(-7, -6, 0, -18); ctx.quadraticCurveTo(7, -6, 0, 4); ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,40,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -14); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(230,200,90,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
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
    }
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
    ctx.restore();
  }
}
