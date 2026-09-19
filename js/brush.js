'use strict';
// ---------- brush strokes: the koi rides these as water currents ----------
const BRUSH = {
  WMAX: 14, WMIN: 4,          // stroke width from slow (wet, heavy) to fast (dry, thin)
  MINSEG: 3,                  // min distance between sampled points
  INK_COST: 0.00008,         // ink per (px * width)
  LIFE_BASE: 6.5,             // seconds before a thin stroke has faded completely
  LIFE_PER_W: 0.28,           // extra seconds per unit of average width
};

let strokeSeq = 0;
class Stroke {
  constructor() {
    this.id = ++strokeSeq;
    this.pts = [];   // {x,y,w,dry}
    this.cum = [0];  // cumulative arc length
    this.len = 0;
    this.age = 0;
    this.life = BRUSH.LIFE_BASE;
    this.done = false;
    this.dead = false;
    this.alpha = 1;
    this.erode = 0;      // extra fading applied by the water brush
    this.canvas = null;  // rasterised once finished
    this.bx0 = 1e9; this.by0 = 1e9; this.bx1 = -1e9; this.by1 = -1e9;
    this.wsum = 0;
  }

  add(x, y, w, dry) {
    const n = this.pts.length;
    if (n) {
      const p = this.pts[n - 1];
      const dl = Math.hypot(x - p.x, y - p.y);
      if (dl < BRUSH.MINSEG) return false;
      this.len += dl; this.cum.push(this.len);
    }
    this.pts.push({ x, y, w, dry });
    this.wsum += w;
    this.bx0 = Math.min(this.bx0, x - w); this.by0 = Math.min(this.by0, y - w);
    this.bx1 = Math.max(this.bx1, x + w); this.by1 = Math.max(this.by1, y + w);
    return true;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const n = this.pts.length;
    // taper the tail like a lifted brush
    for (let i = 1; i <= 3 && n - i >= 1; i++) this.pts[n - i].w *= 0.35 + 0.2 * i;
    const avgW = n ? this.wsum / n : 6;
    this.life = BRUSH.LIFE_BASE + avgW * BRUSH.LIFE_PER_W;
    if (n < 2) { this.dead = true; return; }
    this.rasterize();
  }

  get avgW() { return this.pts.length ? this.wsum / this.pts.length : 6; }

  update(dt) {
    this.age += dt;
    const t = this.age / this.life + this.erode;
    this.alpha = t < 0.62 ? 1 : 1 - smoothstep(0.62, 1, t);
    if (this.alpha <= 0.001 || this.pts.length < 2 && this.done) this.dead = true;
  }

  // arc-length position + unit tangent
  pointAt(s) {
    const cum = this.cum, pts = this.pts;
    if (pts.length < 2) { const p = pts[0]; return { x: p.x, y: p.y, tx: 1, ty: 0 }; }
    s = clamp(s, 0, this.len);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[Math.min(lo + 1, pts.length - 1)];
    const segLen = cum[lo + 1] - cum[lo] || 1;
    const t = (s - cum[lo]) / segLen;
    let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    return { x: a.x + tx * L * t, y: a.y + ty * L * t, tx, ty };
  }

  // nearest arc-length param within radius r, or -1
  nearest(x, y, r) {
    if (x < this.bx0 - r || x > this.bx1 + r || y < this.by0 - r || y > this.by1 + r) return -1;
    const pts = this.pts; let best = r * r, bs = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / L2; t = clamp(t, 0, 1);
      const px = a.x + dx * t - x, py = a.y + dy * t - y;
      const d2 = px * px + py * py;
      if (d2 < best) { best = d2; bs = this.cum[i] + Math.sqrt(L2) * t; }
    }
    return bs;
  }

  // ---- rendering ----
  // Build the stroke as one outline polygon (no per-segment overlap beads), with a
  // gently jittered edge like ink soaking into rice paper.
  static outline(ctx, pts, id, scale, jitter) {
    const n = pts.length;
    if (n === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, pts[0].w * 0.5 * scale, 0, TAU); return; }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const p = pts[i];
      const j = jitter ? (0.86 + 0.28 * vnoise(i * 0.55, id * 0.37, 21)) : 1;
      const hw = p.w * 0.5 * scale * j * (1 - p.dry * 0.28);
      L.push({ x: p.x - ty * hw, y: p.y + tx * hw }); R.push({ x: p.x + ty * hw, y: p.y - tx * hw });
    }
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) { const p = L[i - 1], q = L[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    // round-ish end cap
    const e = pts[n - 1], pe = pts[n - 2];
    let ex = e.x - pe.x, ey = e.y - pe.y; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
    const ew = e.w * 0.5 * scale;
    ctx.quadraticCurveTo(e.x + ex * ew * 1.2, e.y + ey * ew * 1.2, R[n - 1].x, R[n - 1].y);
    for (let i = n - 2; i >= 0; i--) { const p = R[i + 1], q = R[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    const s0 = pts[0], s1 = pts[1];
    let sx = s0.x - s1.x, sy = s0.y - s1.y; const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    const sw = s0.w * 0.5 * scale;
    ctx.quadraticCurveTo(s0.x + sx * sw * 1.3, s0.y + sy * sw * 1.3, L[0].x, L[0].y);
    ctx.closePath();
  }

  // Paints opaque ink onto a transparent surface; the caller applies the stroke's fade.
  static paint(ctx, pts, id) {
    const n = pts.length; if (n < 1) return;
    // wet halo: ink bleeding into the fibres
    Stroke.outline(ctx, pts, id, 1.75, false);
    ctx.fillStyle = 'rgba(40,44,62,0.13)'; ctx.fill();
    // body
    Stroke.outline(ctx, pts, id, 1, true);
    ctx.fillStyle = 'rgba(24,26,36,0.9)'; ctx.fill();
    // dried edge: ink pools darker at the rim
    ctx.strokeStyle = 'rgba(12,13,20,0.35)'; ctx.lineWidth = 1.1; ctx.lineJoin = 'round'; ctx.stroke();
    // 起笔: the brush lands with a heavier dab
    const p0 = pts[0];
    ctx.fillStyle = 'rgba(18,20,28,0.55)';
    ctx.beginPath(); ctx.arc(p0.x, p0.y, p0.w * 0.62, 0, TAU); ctx.fill();
    // 飞白: fast, dry passages are cut open so the paper shows through
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round';
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dry = (a.dry + b.dry) * 0.5; if (dry < 0.12) continue;
      const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L; const w = (a.w + b.w) * 0.5;
      const streaks = 2 + ((hash2(id, i, 5) * (2 + dry * 4)) | 0);
      for (let k = 0; k < streaks; k++) {
        const h = hash2(id, i * 7 + k, 9);
        if (h > dry * 0.95) continue;
        const off = (hash2(id, i * 3 + k, 3) - 0.5) * w * 0.95;
        ctx.strokeStyle = `rgba(0,0,0,${0.5 + dry * 0.5})`;
        ctx.lineWidth = 0.5 + hash2(id, i + k * 11, 13) * (0.8 + dry * 1.4);
        ctx.beginPath(); ctx.moveTo(a.x + nx * off - dx * 0.3, a.y + ny * off - dy * 0.3); ctx.lineTo(b.x + nx * off + dx * 0.3, b.y + ny * off + dy * 0.3); ctx.stroke();
      }
    }
    ctx.restore();
    // a few ink granules along the wet parts
    ctx.fillStyle = 'rgba(10,11,16,0.5)';
    for (let i = 0; i < n; i += 3) {
      const p = pts[i]; if (p.dry > 0.4 || hash2(id, i, 41) > 0.45) continue;
      const ox = (hash2(id, i, 42) - 0.5) * p.w * 0.7, oy = (hash2(id, i, 43) - 0.5) * p.w * 0.7;
      ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, 0.5 + hash2(id, i, 44) * 0.9, 0, TAU); ctx.fill();
    }
  }

  rasterize() {
    const pad = 14;
    const w = this.bx1 - this.bx0 + pad * 2, h = this.by1 - this.by0 + pad * 2;
    const k = Stroke.RES;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, (-this.bx0 + pad) * k, (-this.by0 + pad) * k);
    Stroke.paint(c, this.pts, this.id);
    this.canvas = cv; this.cx = this.bx0 - pad; this.cy = this.by0 - pad; this.cw = w; this.ch = h;
  }

  // finished strokes are drawn from their raster; live strokes are painted through a scratch surface
  draw(ctx, camX, scratch) {
    if (this.dead) return;
    if (this.canvas) {
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(this.canvas, this.cx - camX, this.cy, this.cw, this.ch);
      ctx.globalAlpha = 1;
    } else if (scratch && this.pts.length > 1) {
      const sc = scratch.ctx;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
      sc.setTransform(scratch.k, 0, 0, scratch.k, -camX * scratch.k, 0);
      Stroke.paint(sc, this.pts, this.id);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(scratch.canvas, 0, 0);
      ctx.restore();
    }
  }
}
Stroke.RES = 2;
