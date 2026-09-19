'use strict';
// ---------- the koi: rides ink strokes as currents, sinks when it has none ----------
const KOI = {
  G: 430,            // gravity (px/s^2) - the koi sinks without a current
  THRUST: 150,       // swim thrust along the current, always toward +x
  FRICTION: 0.55,    // per-second drag along a current
  MAXSPEED: 780,
  ATTACH_R: 17,
  DRAG_AIR: 0.35,
  TERMINAL: 470,
  REATTACH_COOLDOWN: 0.3,
};

class Koi {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 60; this.vy = 0;
    this.rail = null; this.s = 0; this.sp = 0;
    this.lastRail = null; this.detachT = -9;
    this.heading = 0; this.phase = 0;
    this.vitality = 1; this.mud = 0; // mud: visual darkening
    this.size = 1.25;
    this.time = 0;
    this.spine = [];
    this.alive = true;
    this.dying = 0;
    this.sinceAttach = 9;
  }

  speed() { return Math.hypot(this.vx, this.vy); }

  attachTo(stroke, s) {
    this.rail = stroke; this.s = s;
    const p = stroke.pointAt(s);
    let sp = this.vx * p.tx + this.vy * p.ty;
    if (Math.abs(sp) < 70) sp = p.tx >= 0 ? 70 : -70;
    this.sp = sp;
    this.sinceAttach = 0;
  }

  detach() {
    if (!this.rail) return;
    const p = this.rail.pointAt(this.s);
    this.vx = p.tx * this.sp; this.vy = p.ty * this.sp;
    this.lastRail = this.rail; this.rail = null; this.detachT = this.time;
  }

  update(dt, strokes, field, events) {
    this.time += dt; this.sinceAttach += dt;
    if (this.rail) {
      const r = this.rail;
      if (r.dead || r.alpha < 0.28 || r.pts.length < 2) { this.detach(); }
      else {
        const p = r.pointAt(this.s);
        const a = KOI.THRUST * p.tx + KOI.G * p.ty;
        this.sp += a * dt;
        this.sp *= Math.max(0, 1 - KOI.FRICTION * dt);
        this.sp = clamp(this.sp, -KOI.MAXSPEED, KOI.MAXSPEED);
        this.s += this.sp * dt;
        if (this.s < 0 || this.s > r.len) {
          this.s = clamp(this.s, 0, r.len);
          const q = r.pointAt(this.s); this.x = q.x; this.y = q.y;
          this.detach();
          // a little hop off the end of the stroke
          this.vy -= 40;
        } else {
          const q = r.pointAt(this.s);
          this.x = q.x; this.y = q.y;
          this.vx = q.tx * this.sp; this.vy = q.ty * this.sp;
        }
      }
    }
    if (!this.rail) {
      this.vy += KOI.G * dt;
      if (this.vy > KOI.TERMINAL) this.vy = KOI.TERMINAL;
      this.vx *= Math.max(0, 1 - KOI.DRAG_AIR * dt);
      // a sinking koi still paddles a little forward
      this.vx += (35 - this.vx) * 0.25 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y < 14) { this.y = 14; if (this.vy < 0) this.vy = 0; }
      // look for a current to ride
      let best = null, bs = 0, bd = 1e9;
      for (const st of strokes) {
        if (st.dead || st.alpha < 0.3) continue;
        if (st === this.lastRail && this.time - this.detachT < KOI.REATTACH_COOLDOWN) continue;
        const s = st.nearest(this.x, this.y, KOI.ATTACH_R);
        if (s < 0) continue;
        const p = st.pointAt(s); const d = dist(p.x, p.y, this.x, this.y);
        if (d < bd) { bd = d; best = st; bs = s; }
      }
      if (best) {
        const impact = this.speed();
        this.attachTo(best, bs);
        if (events) events.attach(this.x, this.y, impact);
      }
    }
    // heading & wiggle
    const target = Math.atan2(this.vy, this.vx);
    this.heading = angleLerp(this.heading, target, Math.min(1, dt * 9));
    const spd = this.speed();
    this.phase += dt * (5 + spd * 0.02);
    // ink hazard
    const dens = field.sample(this.x, this.y);
    if (dens > 0.38) {
      this.vitality -= (dens - 0.28) * 1.5 * dt;
      this.mud = Math.min(1, this.mud + dt * 2.5);
      if (events) events.mud(this.x, this.y, dens);
    } else {
      this.vitality = Math.min(1, this.vitality + 0.22 * dt);
      this.mud = Math.max(0, this.mud - dt * 0.9);
    }
    // spine for rendering
    this.computeSpine();
  }

  computeSpine() {
    const N = 12, L = 6.3 * this.size;
    const spd = Math.min(1, this.speed() / 700);
    const amp = (2.2 + spd * 5.5) * this.size;
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    const nx = -hy, ny = hx;
    this.spine.length = 0;
    for (let i = 0; i < N; i++) {
      const off = Math.sin(this.phase - i * 0.6) * amp * (i / N) * (i / N + 0.2);
      this.spine.push({ x: this.x - hx * i * L + nx * off, y: this.y - hy * i * L + ny * off });
    }
  }

  draw(ctx, camX, seasonAccent) {
    const sp = this.spine; if (sp.length < 2) return;
    const s = this.size;
    const prof = [3.6, 5.3, 6.3, 6.6, 6.4, 5.9, 5.1, 4.2, 3.2, 2.3, 1.6, 1.1];
    const fade = this.dying > 0 ? 1 - this.dying : 1;
    const mud = this.mud;
    // colour: vermilion koi darkening into ink when muddied
    const R = lerp(214, 40, mud), Gc = lerp(78, 42, mud), B = lerp(40, 52, mud);
    ctx.save(); ctx.translate(-camX, 0);
    // build outline
    const left = [], right = [];
    for (let i = 0; i < sp.length; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const hw = prof[i] * s * 1.15;
      left.push({ x: sp[i].x - ty * hw, y: sp[i].y + tx * hw });
      right.push({ x: sp[i].x + ty * hw, y: sp[i].y - tx * hw });
    }
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) { const p = left[i - 1], q = left[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      const tail = sp[sp.length - 1]; ctx.lineTo(tail.x, tail.y);
      for (let i = right.length - 1; i >= 1; i--) { const p = right[i], q = right[i - 1]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      // head is rounded
      const h = sp[0]; const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      ctx.quadraticCurveTo(h.x + hx * prof[0] * s * 1.6, h.y + hy * prof[0] * s * 1.6, left[0].x, left[0].y);
      ctx.closePath();
    };
    // tail fins (two soft flaring strokes)
    const tail = sp[sp.length - 1], pre = sp[sp.length - 3];
    let tx = tail.x - pre.x, ty = tail.y - pre.y; const TL = Math.hypot(tx, ty) || 1; tx /= TL; ty /= TL;
    const flare = Math.sin(this.phase * 1.1) * 0.35;
    const fin = (sign, len, wid, alpha) => {
      const ang = Math.atan2(ty, tx) + sign * (0.55 + flare * sign) ;
      const ex = tail.x + Math.cos(ang) * len, ey = tail.y + Math.sin(ang) * len;
      const cx = tail.x + Math.cos(ang + sign * 0.5) * len * 0.7, cy = tail.y + Math.sin(ang + sign * 0.5) * len * 0.7;
      ctx.fillStyle = `rgba(${R},${Gc},${B},${alpha * fade})`;
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.quadraticCurveTo(tail.x + Math.cos(ang - sign * 0.4) * len * 0.5, tail.y + Math.sin(ang - sign * 0.4) * len * 0.5, tail.x, tail.y);
      ctx.fill();
      ctx.strokeStyle = `rgba(30,30,40,${0.35 * fade})`; ctx.lineWidth = 1; ctx.stroke();
    };
    fin(1, 17 * s, 6, 0.55); fin(-1, 15 * s, 5, 0.5);
    // pectoral fins
    const pf = (i, sign) => {
      const a = sp[i], b = sp[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const px = -dy * sign, py = dx * sign;
      const w = Math.sin(this.phase * 0.9 + sign) * 0.25;
      ctx.fillStyle = `rgba(${R},${Gc},${B},${0.45 * fade})`;
      ctx.beginPath(); ctx.moveTo(a.x + px * 5 * s, a.y + py * 5 * s);
      ctx.quadraticCurveTo(a.x + px * 15 * s - dx * 6 * s * (1 + w), a.y + py * 15 * s - dy * 6 * s * (1 + w), a.x + px * 7 * s - dx * 11 * s, a.y + py * 7 * s - dy * 11 * s);
      ctx.closePath(); ctx.fill();
    };
    pf(2, 1); pf(2, -1);
    // soft ink shadow / wash under the body
    ctx.save(); ctx.translate(2, 3); body(); ctx.fillStyle = `rgba(40,40,55,${0.13 * fade})`; ctx.fill(); ctx.restore();
    // body wash
    body();
    ctx.fillStyle = `rgba(${R},${Gc},${B},${0.88 * fade})`; ctx.fill();
    // white patch (红白锦鲤) - a lighter wash over the mid body
    ctx.save(); body(); ctx.clip();
    const m = sp[4];
    const grad = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 20 * s);
    grad.addColorStop(0, `rgba(250,242,226,${0.75 * (1 - mud) * fade})`);
    grad.addColorStop(1, 'rgba(250,242,226,0)');
    ctx.fillStyle = grad; ctx.fillRect(m.x - 30 * s, m.y - 30 * s, 60 * s, 60 * s);
    // ink spots on the back
    ctx.fillStyle = `rgba(30,30,42,${0.55 * fade})`;
    for (let i = 1; i < 8; i += 2) {
      const q = sp[i]; ctx.beginPath(); ctx.arc(q.x + (i % 3 - 1) * 2, q.y + (i % 2) * 2, (2.2 + (i % 3)) * s * 0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // outline in ink, broken like a brush
    body();
    ctx.strokeStyle = `rgba(28,28,40,${0.55 * fade})`; ctx.lineWidth = 1.4; ctx.stroke();
    // eye
    const h = sp[0]; const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    ctx.fillStyle = `rgba(20,20,28,${0.9 * fade})`;
    ctx.beginPath(); ctx.arc(h.x + hx * 2 - hy * 3.2 * s, h.y + hy * 2 + hx * 3.2 * s, 1.5 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(h.x + hx * 2 + hy * 3.2 * s, h.y + hy * 2 - hx * 3.2 * s, 1.5 * s, 0, TAU); ctx.fill();
    // barbels
    ctx.strokeStyle = `rgba(28,28,40,${0.5 * fade})`; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(h.x + hx * 4, h.y + hy * 4); ctx.lineTo(h.x + hx * 9 - hy * 4, h.y + hy * 9 + hx * 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(h.x + hx * 4, h.y + hy * 4); ctx.lineTo(h.x + hx * 9 + hy * 4, h.y + hy * 9 - hx * 4); ctx.stroke();
    ctx.restore();
  }
}
