'use strict';
// ---------- brush strokes: the koi rides these as water currents ----------
const BRUSH = {
  WMAX: 14, WMIN: 4,          // stroke width from slow (wet, heavy) to fast (dry, thin)
  MINSEG: 4,                  // min distance between raw input samples
  STEP: 4,                    // spacing of the smoothed points a stroke is built from
  INK_COST: 0.00008,         // ink per (px * width)
  LIFE_BASE: 6.5,             // seconds before a thin stroke has faded completely
  LIFE_PER_W: 0.28,           // extra seconds per unit of average width
  WET_T: 1.6,                 // seconds a fresh stroke keeps its wet sheen
};
const CAN_BLUR = (() => { try { const c = document.createElement('canvas').getContext('2d'); return typeof c.filter === 'string'; } catch (e) { return false; } })();

// centripetal Catmull-Rom through p1..p2 (Barry-Goldman), u in [0,1]: no cusps or overshoot on uneven samples
function catmull(p0, p1, p2, p3, u) {
  const k = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const t0 = 0, t1 = k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a, b, ta, tb) => { const w = (t - ta) / (tb - ta); return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w }; };
  const A1 = mix(p0, p1, t0, t1), A2 = mix(p1, p2, t1, t2), A3 = mix(p2, p3, t2, t3);
  const B1 = mix(A1, A2, t0, t2), B2 = mix(A2, A3, t1, t3);
  return mix(B1, B2, t1, t2);
}

let strokeSeq = 0;
class Stroke {
  constructor() {
    this.id = ++strokeSeq;
    this.raw = [];   // input samples {x,y,w,dry}
    this.pts = [];   // smoothed points the stroke is drawn and ridden along {x,y,w,dry}
    this.cum = [0];  // cumulative arc length
    this.len = 0;
    this.prov = false; // the last point of pts is a straight provisional tail to the newest sample
    this.age = 0;
    this.life = BRUSH.LIFE_BASE;
    this.done = false;
    this.dead = false;
    this.alpha = 1;
    this.wet = 1;
    this.erode = 0;      // extra fading applied by the water brush
    this.canvas = null;  // rasterised once finished
    this.bleed = null;   // soft halo of ink soaking into the paper, grows in as the stroke dries
    this.bx0 = 1e9; this.by0 = 1e9; this.bx1 = -1e9; this.by1 = -1e9;
    this.wsum = 0;
    this.ver = 0;        // bumped whenever the points change
    this.live = null;    // surfaces for painting the stroke while it is still being drawn
  }

  _push(x, y, w, dry) {
    const n = this.pts.length;
    if (n) {
      const p = this.pts[n - 1];
      const dl = Math.hypot(x - p.x, y - p.y);
      if (dl < 0.5) { p.w = w; p.dry = dry; this.ver++; return; }
      this.len += dl; this.cum.push(this.len);
    }
    this.pts.push({ x, y, w, dry }); this.ver++;
    this.bx0 = Math.min(this.bx0, x - w); this.by0 = Math.min(this.by0, y - w);
    this.bx1 = Math.max(this.bx1, x + w); this.by1 = Math.max(this.by1, y + w);
  }

  _pop() {
    this.pts.pop(); this.ver++;
    if (this.cum.length > 1) this.cum.pop();
    this.len = this.cum[this.cum.length - 1];
  }

  // lay down the smoothed segment raw[i] -> raw[i+1]
  _spline(i) {
    const r = this.raw, a = r[i], b = r[i + 1];
    const p0 = r[i - 1] || { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
    const p3 = r[i + 2] || { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
    const n = clamp(Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / BRUSH.STEP), 1, 32);
    for (let k = 1; k <= n; k++) {
      const u = k / n, q = n === 1 ? b : catmull(p0, a, b, p3, u);
      this._push(q.x, q.y, lerp(a.w, b.w, u), lerp(a.dry, b.dry, u));
    }
  }

  add(x, y, w, dry) {
    const raw = this.raw, n = raw.length;
    if (n && Math.hypot(x - raw[n - 1].x, y - raw[n - 1].y) < BRUSH.MINSEG) return false;
    raw.push({ x, y, w, dry }); this.wsum += w;
    if (this.prov) { this._pop(); this.prov = false; }
    const m = raw.length;
    if (m === 1) { this._push(x, y, w, dry); return true; }
    // a segment is final once the sample after it exists, since that sample sets its outgoing tangent
    if (m >= 3) this._spline(m - 3);
    this._push(x, y, w, dry); this.prov = true;
    return true;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const m = this.raw.length;
    if (this.prov) { this._pop(); this.prov = false; }
    if (m >= 2) this._spline(m - 2);
    const n = this.pts.length;
    // 起笔 / 收笔: swell in from the landing dab, taper out like a lifted brush
    for (let i = 0; i < n; i++) {
      const s = this.cum[i], e = this.len - s;
      this.pts[i].w *= lerp(0.55, 1, smoothstep(0, 14, s)) * lerp(0.25, 1, smoothstep(0, 22, e));
    }
    const avgW = m ? this.wsum / m : 6;
    this.life = BRUSH.LIFE_BASE + avgW * BRUSH.LIFE_PER_W;
    this.live = null;
    if (n < 2) { this.dead = true; return; }
    this.rasterize();
  }

  get avgW() { return this.raw.length ? this.wsum / this.raw.length : 6; }

  update(dt) {
    this.age += dt;
    const t = this.age / this.life + this.erode;
    this.alpha = t < 0.62 ? 1 : 1 - smoothstep(0.62, 1, t);
    this.wet = 1 - smoothstep(0, BRUSH.WET_T, this.age);
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
    let s = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
      let tx = b.x - a.x, ty = b.y - a.y; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
      const p = pts[i];
      if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
      // the brush swells and pinches along its length, and the paper roughens its edge
      const j = jitter ? (0.84 + 0.32 * vnoise(s * 0.016, id * 0.37, 5)) * (0.93 + 0.14 * vnoise(s * 0.11, id * 0.37, 21)) : 1;
      const hw = p.w * 0.5 * scale * j * (1 - p.dry * 0.28);
      L.push({ x: p.x - ty * hw, y: p.y + tx * hw }); R.push({ x: p.x + ty * hw, y: p.y - tx * hw });
    }
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n; i++) { const p = L[i - 1], q = L[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    ctx.lineTo(L[n - 1].x, L[n - 1].y);
    // round-ish end cap
    const e = pts[n - 1], pe = pts[Math.max(0, n - 3)];
    let ex = e.x - pe.x, ey = e.y - pe.y; const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
    const ew = e.w * 0.5 * scale;
    ctx.quadraticCurveTo(e.x + ex * ew * 1.4, e.y + ey * ew * 1.4, R[n - 1].x, R[n - 1].y);
    for (let i = n - 2; i >= 0; i--) { const p = R[i + 1], q = R[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    ctx.lineTo(R[0].x, R[0].y);
    const s0 = pts[0], s1 = pts[Math.min(2, n - 1)];
    let sx = s0.x - s1.x, sy = s0.y - s1.y; const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
    const sw = s0.w * 0.5 * scale;
    ctx.quadraticCurveTo(s0.x + sx * sw * 1.5, s0.y + sy * sw * 1.5, L[0].x, L[0].y);
    ctx.closePath();
  }

  // Paints opaque ink onto a transparent surface; the caller applies the stroke's fade.
  static paint(ctx, pts, id, halo = true) {
    if (pts.length < 1) return;
    Stroke.paintBase(ctx, pts, id, halo);
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    Stroke.paintLanes(ctx, pts, id, Stroke.frames(pts, 0, pts.length - 1, []), 0, pts.length - 1);
    ctx.restore();
    Stroke.paintGranules(ctx, pts, id);
  }

  // the ink itself: bleed halo, body, dried rim, and the dab where the brush landed
  static paintBase(ctx, pts, id, halo) {
    if (halo) { Stroke.outline(ctx, pts, id, 1.7, false); ctx.fillStyle = 'rgba(40,44,62,0.12)'; ctx.fill(); }
    Stroke.outline(ctx, pts, id, 1, true);
    ctx.fillStyle = 'rgba(24,26,36,0.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(8,9,16,0.45)'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    // 起笔: the brush lands with a heavier dab
    const p0 = pts[0];
    ctx.fillStyle = 'rgba(16,18,26,0.6)';
    ctx.beginPath(); ctx.ellipse(p0.x, p0.y, p0.w * 0.95, p0.w * 0.75, id, 0, TAU); ctx.fill();
  }

  // the hairs of the brush: 9 faint bristle tracks through the whole stroke, and 7 streaks of 飞白 where it ran dry.
  // Drawn as opaque lines; the caller cuts them out of the ink (destination-out) so the paper shows through.
  static lanes(id) {
    const c = Stroke._laneCache || (Stroke._laneCache = new Map());
    let list = c.get(id);
    if (list) return list;
    list = [];
    for (let k = 0; k < 9; k++) list.push({ off: ((k + 0.5) / 9 - 0.5) * 0.8 + (hash2(id, k, 31) - 0.5) * 0.08, lw: 0.5 + hash2(id, k, 33) * 0.9, a: 0.08 + hash2(id, k, 35) * 0.16, on: (p, s) => vnoise(s * 0.02, k * 7.1 + id, 37) > 0.3 });
    for (let k = 0; k < 7; k++) list.push({ off: (hash2(id, k, 3) - 0.5) * 0.95, lw: 0.5 + hash2(id, k, 13) * 1.4, a: 0.65 + hash2(id, k, 17) * 0.35, on: (p, s) => p.dry > 0.12 && vnoise(s * 0.035, k * 5.3 + id, 9) < p.dry * 1.05 });
    if (c.size > 64) c.clear();
    c.set(id, list);
    return list;
  }

  // arc length and unit normal at points from..to, written into out (shared by every lane)
  static frames(pts, from, to, out) {
    const n = pts.length;
    for (let i = from; i <= to; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const s = i ? out[i - 1].s + Math.hypot(p.x - a.x, p.y - a.y) : 0;
      const tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1;
      out[i] = { s, nx: -ty / L, ny: tx / L };
    }
    return out;
  }

  // lanes over points i0..i1. Butt caps, so a stroke painted in pieces meets end to end with no overlap
  static paintLanes(ctx, pts, id, fr, i0, i1) {
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const ln of Stroke.lanes(id)) {
      ctx.lineWidth = ln.lw; ctx.strokeStyle = `rgba(0,0,0,${ln.a})`;
      ctx.beginPath();
      let open = false;
      for (let i = i0; i <= i1; i++) {
        const p = pts[i], f = fr[i];
        if (!ln.on(p, f.s)) { open = false; continue; }
        const x = p.x + f.nx * ln.off * p.w, y = p.y + f.ny * ln.off * p.w;
        if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; }
      }
      ctx.stroke();
    }
  }

  // a few ink granules along the wet parts
  static paintGranules(ctx, pts, id) {
    ctx.fillStyle = 'rgba(10,11,16,0.5)';
    for (let i = 0; i < pts.length; i += 4) {
      const p = pts[i]; if (p.dry > 0.4 || hash2(id, i, 41) > 0.4) continue;
      const ox = (hash2(id, i, 42) - 0.5) * p.w * 0.7, oy = (hash2(id, i, 43) - 0.5) * p.w * 0.7;
      ctx.beginPath(); ctx.arc(p.x + ox, p.y + oy, 0.5 + hash2(id, i, 44) * 0.9, 0, TAU); ctx.fill();
    }
  }

  rasterize() {
    const pad = 16;
    const w = this.bx1 - this.bx0 + pad * 2, h = this.by1 - this.by0 + pad * 2;
    const k = Stroke.RES;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, (-this.bx0 + pad) * k, (-this.by0 + pad) * k);
    Stroke.paint(c, this.pts, this.id, false);
    this.canvas = cv; this.cx = this.bx0 - pad; this.cy = this.by0 - pad; this.cw = w; this.ch = h;
    // the bleed is soft, so a quarter-resolution raster is plenty
    const bk = 0.5, bp = 16;
    const bv = document.createElement('canvas');
    bv.width = Math.max(1, Math.ceil((w + bp * 2) * bk)); bv.height = Math.max(1, Math.ceil((h + bp * 2) * bk));
    const b = bv.getContext('2d');
    b.setTransform(bk, 0, 0, bk, (-this.cx + bp) * bk, (-this.cy + bp) * bk);
    if (CAN_BLUR) {
      b.filter = 'blur(2.5px)';
      Stroke.outline(b, this.pts, this.id, 1.9, false); b.fillStyle = 'rgba(40,44,62,0.22)'; b.fill();
    } else {
      for (const sc of [1.4, 1.9, 2.5]) { Stroke.outline(b, this.pts, this.id, sc, false); b.fillStyle = 'rgba(40,44,62,0.07)'; b.fill(); }
    }
    this.bleed = bv; this.bpad = bp;
  }

  // finished strokes are drawn from their raster; a stroke still being drawn is painted live
  draw(ctx, camX) {
    if (this.dead) return;
    if (this.canvas) {
      // the halo soaks in over the first second, as ink does on 宣纸
      ctx.globalAlpha = this.alpha * (0.45 + 0.55 * smoothstep(0, 1.2, this.age));
      ctx.drawImage(this.bleed, this.cx - this.bpad - camX, this.cy - this.bpad, this.cw + this.bpad * 2, this.ch + this.bpad * 2);
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(this.canvas, this.cx - camX, this.cy, this.cw, this.ch);
      ctx.globalAlpha = 1;
    } else if (this.pts.length > 1) this.drawLive(ctx, camX);
  }

  // While the brush is down, the cheap outline is repainted as the stroke changes, but the costly bristle and 飞白
  // texture is added to a mask a piece at a time as points settle, so a long stroke costs no more per frame than a short one.
  // Both surfaces are in the stroke's own world space, so the camera moving costs nothing.
  drawLive(ctx, camX) {
    const k = Stroke.RES, pad = 20;
    const nx0 = this.bx0 - pad, ny0 = this.by0 - pad, nx1 = this.bx1 + pad, ny1 = this.by1 + pad;
    let L = this.live;
    if (!L || L.k !== k || nx0 < L.x0 || ny0 < L.y0 || nx1 > L.x1 || ny1 > L.y1) {
      // (re)allocate with room to grow; keep the mask painted so far when the scale is unchanged
      const g = clamp((nx1 - nx0) * 0.25, 120, 360), x0 = nx0 - g, y0 = ny0 - g * 0.5, x1 = nx1 + g, y1 = ny1 + g * 0.5;
      const surf = () => {
        const c = document.createElement('canvas'); c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k);
        const cx = c.getContext('2d'); cx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); return { c, cx };
      };
      const next = { k, x0, y0, x1, y1, body: surf(), mask: surf(), fr: [], done: 0, ver: -1 };
      if (L && L.k === k) { next.mask.cx.drawImage(L.mask.c, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0); next.fr = L.fr; next.done = L.done; }
      this.live = L = next;
    }
    const pts = this.pts, n = pts.length;
    // a point's lanes are final once its neighbour is (the provisional tail can still move)
    const settled = n - (this.prov ? 1 : 0) - 2;
    if (settled > L.done) {
      Stroke.frames(pts, L.fr.length, settled, L.fr);
      Stroke.paintLanes(L.mask.cx, pts, this.id, L.fr, L.done, settled);
      L.done = settled;
    }
    // the part of the surfaces the stroke covers, in device pixels
    const rx = Math.max(0, Math.floor((nx0 - L.x0) * k)), ry = Math.max(0, Math.floor((ny0 - L.y0) * k));
    const rw = Math.min(L.body.c.width - rx, Math.ceil((nx1 - nx0) * k) + 2), rh = Math.min(L.body.c.height - ry, Math.ceil((ny1 - ny0) * k) + 2);
    if (L.ver !== this.ver) {
      L.ver = this.ver;
      const b = L.body.cx;
      b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(rx, ry, rw, rh); b.restore();
      Stroke.paintBase(b, pts, this.id, true);
      b.save(); b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'destination-out';
      b.drawImage(L.mask.c, rx, ry, rw, rh, rx, ry, rw, rh); b.restore();
      Stroke.paintGranules(b, pts, this.id);
    }
    ctx.globalAlpha = this.alpha;
    ctx.drawImage(L.body.c, rx, ry, rw, rh, L.x0 + rx / k - camX, L.y0 + ry / k, rw / k, rh / k);
    ctx.globalAlpha = 1;
  }

  // which way along the stroke (+1 with the brush, -1 against it) the current flows: always onward, toward +x
  static flowDir(p) { return Math.abs(p.tx) > 0.2 ? (p.tx > 0 ? 1 : -1) : (p.ty >= 0 ? 1 : -1); }

  // the living part: a wet sheen while fresh, and glints of water running along the current
  drawFlow(ctx, camX, time, riding) {
    if (this.dead || this.pts.length < 3 || this.alpha < 0.3) return;
    const pts = this.pts, n = pts.length;
    ctx.save(); ctx.translate(-camX, 0); ctx.lineCap = 'round';
    if (this.wet > 0.01) {
      ctx.strokeStyle = `rgba(150,160,190,${0.32 * this.wet * this.alpha})`;
      ctx.beginPath();
      let open = false;
      for (let i = 0; i < n; i++) {
        const p = pts[i]; const ok = p.w > 6 && p.dry < 0.3;
        const x = p.x - p.w * 0.12, y = p.y - p.w * 0.18;
        if (ok) { if (open) ctx.lineTo(x, y); else { ctx.moveTo(x, y); open = true; } } else open = false;
      }
      ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (!riding) { ctx.restore(); return; }
    // glints of water running downstream along the current the koi is riding
    const len = this.len, dir = pts[n - 1].x >= pts[0].x ? 1 : -1;
    for (let k = 0; k < 14; k++) {
      const sp = 110 + hash2(this.id, k, 51) * 90, ph = hash2(this.id, k, 52) * len;
      const s = (ph + time * sp) % len, ss = dir > 0 ? s : len - s;
      const edge = smoothstep(0, 30, ss) * smoothstep(0, 30, len - ss);
      if (edge <= 0.01) continue;
      const q = this.pointAt(ss), half = 2 + hash2(this.id, k, 53) * 5, off = (hash2(this.id, k, 54) - 0.5) * 4;
      ctx.strokeStyle = `rgba(236,232,220,${0.35 * edge * this.alpha})`; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q.x - q.tx * half - q.ty * off, q.y - q.ty * half + q.tx * off);
      ctx.lineTo(q.x + q.tx * half - q.ty * off, q.y + q.ty * half + q.tx * off);
      ctx.stroke();
    }
    ctx.restore();
  }
}
Stroke.RES = 2;
