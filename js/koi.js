'use strict';
// ---------- the koi: rides ink strokes as currents, sinks when it has none ----------
const KOI = {
  G: 430,            // gravity (px/s^2) - the koi sinks without a current
  THRUST: 170,       // swim thrust along the current, in the direction the koi is riding it
  FRICTION: 0.55,    // per-second drag along a current
  MAXSPEED: 780,
  ATTACH_R: 17,
  DRAG_AIR: 0.35,
  TERMINAL: 470,
  MIN_RIDE: 70,      // the koi always joins a current with at least this much speed
  TURN_KEEP: 0.5,    // share of its speed the koi keeps when it has to turn into a current
  REATTACH_COOLDOWN: 0.3,
  STALL_COOLDOWN: 0.8, // after stalling on a climb it won't grab the same stroke for this long
  SWITCH_ROOM: 14,   // fresh ink must have this much stroke ahead before the koi will switch to it
};

// Koi varieties. Colours are [r,g,b]; patches sit on the body: t = along it (0 snout .. 1 tail),
// o = across it (-1..1 of the half-width), r = radius at size 1. Unlock rules live in js/progress.js.
const KOI_KINDS = {
  shu:    { zh: '朱鲤', en: 'Vermilion', body: [216, 80, 42], fin: [232, 120, 80], patch: [252, 238, 214], patches: [{ t: 0.38, o: 0, r: 12, soft: 1 }], spots: 'ink' },
  kohaku: { zh: '红白', en: 'Kohaku', body: [253, 252, 248], fin: [236, 238, 240], patch: [204, 46, 28], patches: [{ t: 0.08, o: 0.05, r: 5.5 }, { t: 0.3, o: -0.2, r: 7.5 }, { t: 0.52, o: 0.25, r: 7 }, { t: 0.72, o: -0.1, r: 4.5 }] },
  tancho: { zh: '丹顶', en: 'Tancho', body: [253, 252, 250], fin: [232, 236, 240], patch: [212, 36, 32], patches: [{ t: 0.12, o: 0, r: 4.8, round: 1 }] },
  asagi:  { zh: '浅黄', en: 'Asagi', body: [112, 134, 160], fin: [232, 132, 80], patch: [228, 112, 56], patches: [{ t: 0.25, o: 1.05, r: 5 }, { t: 0.25, o: -1.05, r: 5 }, { t: 0.45, o: 1.05, r: 5 }, { t: 0.45, o: -1.05, r: 5 }, { t: 0.02, o: 0, r: 4 }], scales: true },
  showa:  { zh: '昭和', en: 'Showa', body: [36, 34, 42], fin: [60, 54, 62], patch: [206, 58, 34], patches: [{ t: 0.08, o: 0.15, r: 5.5 }, { t: 0.36, o: -0.3, r: 7 }, { t: 0.62, o: 0.3, r: 5.5 }], patch2: [246, 240, 228], patches2: [{ t: 0.24, o: 0.5, r: 5 }, { t: 0.5, o: -0.45, r: 4.5 }] },
  ogon:   { zh: '黄金', en: 'Ogon', body: [228, 178, 72], fin: [240, 204, 116], patch: [255, 236, 170], patches: [], metal: true },
  sumi:   { zh: '墨龙', en: 'Ink Dragon', body: [26, 26, 34], fin: [50, 48, 60], patch: [0, 0, 0], patches: [], dragon: true },
};
// top-view outline of a koi: a blunt snout, broad shoulders, a long taper to a slim tail root
const KOI_N = 16;
function koiWidth(t) {
  if (t < 0.24) return 0.6 + 0.4 * Math.sin(t / 0.24 * Math.PI / 2);
  return lerp(1, 0.16, Math.pow((t - 0.24) / 0.76, 1.3));
}
// the dragon: a slim neck behind the head, an even serpentine body, a long taper into the flame of the tail
function dragonWidth(t) { return t < 0.18 ? 0.72 + 0.28 * smoothstep(0, 0.18, t) : lerp(1, 0.22, Math.pow(smoothstep(0.55, 1, t), 1.1)); }
// after becoming a dragon, every further gate makes it grow: more body segments (longer) and a heavier build
const DRAGON = { SEGS: 22, SEGS_PER_GROWTH: 5, MAX_GROWTH: 8 };
const KOI_ORDER = ['shu', 'kohaku', 'tancho', 'asagi', 'showa', 'ogon', 'sumi'];

// 鲤跃龙门: every dragon gate passed in a run carries the koi one form closer to a dragon.
// Each form looks grander and brings a perk; the perks are applied in Koi.update and Game.update.
const FORMS = [
  { zh: '鲤', short: '鲤', en: 'Carp' },
  { zh: '锦鲤', short: '锦', en: 'Brocade Koi', perkZh: '回墨更快', perk: 'Ink refills faster' },
  { zh: '灵鲤', short: '灵', en: 'Spirit Koi', perkZh: '墨珠自来', perk: 'Pearls drift toward you' },
  { zh: '蛟', short: '蛟', en: 'Jiao', desc: 'Jiao, the horned one', perkZh: '浓墨难伤', perk: 'Thick ink hurts less' },
  { zh: '龙', short: '龙', en: 'Dragon', perkZh: '御风而行', perk: 'Glide on the wind; flow never falls below ×2' },
];

class Koi {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.vx = 60; this.vy = 0;
    this.rail = null; this.s = 0; this.sp = 0; this.dir = 1;
    this.lastRail = null; this.detachT = -9; this.cooldown = KOI.REATTACH_COOLDOWN;
    this.heading = 0; this.phase = 0;
    this.vitality = 1; this.mud = 0; // mud: visual darkening
    this.size = 1.35;
    this.time = 0;
    this.spine = [];
    this.alive = true;
    this.dying = 0;
    this.sinceAttach = 9;
    this.kind = kind || 'shu';
    this.ox = 0; this.oy = 0;     // render offset: eases the jump onto a current instead of snapping
    this.tailAng = 0;             // the tail trails the body a little, like silk in water
    this.path = [];               // where the head has been: the body follows it
    this.glow = 0;                // brief halo after a surge or a gate
    this.form = 0;                // index into FORMS
    this.growth = 0;              // gates passed since becoming a dragon
    this.formT = 9;               // seconds since the last transformation
  }

  speed() { return Math.hypot(this.vx, this.vy); }

  // which way along the stroke (+1 with the brush, -1 against it) carries the koi onward, toward +x
  forwardDir(stroke, s) { return Stroke.flowDir(stroke.pointAt(s)); }

  attachTo(stroke, s) {
    const dir = this.forwardDir(stroke, s);
    const p = stroke.pointAt(s);
    // the koi never rides a current backwards: it turns into it, keeping part of its speed
    // ...but less of it the more squarely it was heading the other way, so a fall never bounces back up a slope
    const spd = this.speed(), along = (this.vx * p.tx + this.vy * p.ty) * dir;
    const turned = spd * KOI.TURN_KEEP * clamp(1 + along / (spd || 1), 0, 1);
    this.ox += this.x - p.x; this.oy += this.y - p.y;
    this.rail = stroke; this.s = s; this.dir = dir;
    this.sp = dir * Math.max(KOI.MIN_RIDE, along, turned);
    this.sinceAttach = 0;
  }

  detach(cooldown) {
    if (!this.rail) return;
    const p = this.rail.pointAt(this.s);
    this.vx = p.tx * this.sp; this.vy = p.ty * this.sp;
    this.lastRail = this.rail; this.rail = null; this.detachT = this.time;
    this.cooldown = cooldown || KOI.REATTACH_COOLDOWN;
  }

  // a burst of speed along whatever the koi is doing (ink pearls)
  surge(amount) {
    if (this.rail) this.sp = clamp(this.sp + this.dir * amount, -KOI.MAXSPEED, KOI.MAXSPEED);
    else { this.vx = Math.min(KOI.MAXSPEED, this.vx + amount); this.vy = Math.min(this.vy, this.vy * 0.4); }
    this.glow = Math.max(this.glow, 0.5);
  }

  // nearest rideable stroke within reach, or null. A stroke the koi just left is off limits until its cooldown ends.
  findRail(strokes, accept) {
    let best = null, bs = 0, bd = 1e9;
    for (const st of strokes) {
      if (st.dead || st.alpha < 0.3 || st.pts.length < 2) continue;
      if (st === this.lastRail && this.time - this.detachT < this.cooldown) continue;
      const s = st.nearest(this.x, this.y, KOI.ATTACH_R);
      if (s < 0 || (accept && !accept(st, s))) continue;
      const p = st.pointAt(s); const d = dist(p.x, p.y, this.x, this.y);
      if (d < bd) { bd = d; best = st; bs = s; }
    }
    return best ? { stroke: best, s: bs } : null;
  }

  // fresh ink painted across a riding koi takes over: this is how the player redirects it
  findNewerRail(strokes) {
    const rail = this.rail;
    return this.findRail(strokes, (st, s) => st.id > rail.id && (this.forwardDir(st, s) > 0 ? st.len - s : s) >= KOI.SWITCH_ROOM);
  }

  update(dt, strokes, field, events) {
    this.time += dt; this.sinceAttach += dt; this.formT += dt;
    if (this.rail) {
      const r = this.rail;
      if (r.dead || r.alpha < 0.28 || r.pts.length < 2) { this.detach(); }
      else {
        const p = r.pointAt(this.s);
        const a = KOI.THRUST * this.dir + KOI.G * p.ty;
        this.sp += a * dt;
        this.sp *= Math.max(0, 1 - KOI.FRICTION * dt);
        this.sp = clamp(this.sp, -KOI.MAXSPEED, KOI.MAXSPEED);
        if (this.sp * this.dir <= 0) {
          // out of momentum on a climb: slip off the current and sink rather than slide back
          this.sp = 0;
          this.detach(KOI.STALL_COOLDOWN);
          this.vx = 30;
        } else {
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
            const next = this.findNewerRail(strokes);
            if (next) {
              this.attachTo(next.stroke, next.s);
              if (events) events.attach(this.x, this.y, 0);
            }
          }
        }
      }
    }
    if (!this.rail) {
      // a dragon glides: it sinks slowly off a current
      const glide = this.form >= 4;
      this.vy += KOI.G * (glide ? 0.55 : 1) * dt;
      if (this.vy > KOI.TERMINAL * (glide ? 0.6 : 1)) this.vy = KOI.TERMINAL * (glide ? 0.6 : 1);
      this.vx *= Math.max(0, 1 - KOI.DRAG_AIR * dt);
      // a sinking koi still paddles a little forward
      this.vx += (35 - this.vx) * 0.25 * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y < 14) { this.y = 14; if (this.vy < 0) this.vy = 0; }
      // look for a current to ride
      const found = this.findRail(strokes);
      if (found) {
        const impact = this.speed();
        this.attachTo(found.stroke, found.s);
        if (events) events.attach(this.x, this.y, impact);
      }
    }
    // heading & wiggle
    const target = Math.atan2(this.vy, this.vx);
    this.heading = angleLerp(this.heading, target, Math.min(1, dt * 9));
    const spd = this.speed();
    this.phase += dt * (5 + spd * 0.02);
    const ease = Math.exp(-dt * 12); this.ox *= ease; this.oy *= ease;
    this.glow = Math.max(0, this.glow - dt);
    // ink hazard
    const dens = field.sample(this.x, this.y);
    if (dens > 0.38) {
      this.vitality -= (dens - 0.28) * 1.5 * (this.form >= 3 ? 0.6 : 1) * dt;
      this.mud = Math.min(1, this.mud + dt * 2.5);
      if (events) events.mud(this.x, this.y, dens);
    } else {
      this.vitality = Math.min(1, this.vitality + 0.22 * dt);
      this.mud = Math.max(0, this.mud - dt * 0.9);
    }
    // spine for rendering
    this.computeSpine(dt);
  }

  // The spine follows the path the head actually swam, so the body bends along a curving current
  // instead of staying a stiff rod; the swimming wave rides on top of that.
  // spine points: a koi's fixed count, or a dragon's, which lengthens as it grows
  segs() { return this.form >= 4 ? DRAGON.SEGS + DRAGON.SEGS_PER_GROWTH * Math.min(this.growth, DRAGON.MAX_GROWTH) : KOI_N; }

  computeSpine(dt = 1 / 60) {
    const dragon = this.form >= 4;
    const N = this.segs(), L = 5 * this.size * (dragon ? 1.2 + 0.03 * Math.min(this.growth, DRAGON.MAX_GROWTH) : 1), len = L * (N - 1);
    const hx0 = this.x + this.ox, hy0 = this.y + this.oy;
    const P = this.path, last = P[P.length - 1];
    if (!last || Math.hypot(hx0 - last.x, hy0 - last.y) > 2) P.push({ x: hx0, y: hy0 });
    // forget path older than the body is long
    let acc = Math.hypot(hx0 - P[P.length - 1].x, hy0 - P[P.length - 1].y), cut = 0;
    for (let i = P.length - 1; i > 0; i--) { acc += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); if (acc > len + 20) { cut = i - 1; break; } }
    if (cut > 0) P.splice(0, cut);
    // sample the path back from the head at even spacing; beyond its end, continue straight behind the heading
    const base = [{ x: hx0, y: hy0 }];
    let px = hx0, py = hy0, j = P.length - 1, need = L;
    let bx = -Math.cos(this.heading), by = -Math.sin(this.heading);
    while (base.length < N) {
      const q = j >= 0 ? P[j] : null;
      const d = q ? Math.hypot(q.x - px, q.y - py) : Infinity;
      if (q && d < need) { need -= d; if (d > 0.01) { bx = (q.x - px) / d; by = (q.y - py) / d; } px = q.x; py = q.y; j--; continue; }
      if (q) { px += (q.x - px) * need / d; py += (q.y - py) * need / d; }
      else { px += bx * need; py += by * need; }
      base.push({ x: px, y: py }); need = L;
    }
    // soften kinks (a hook knocking the koi backwards, say) so the body never folds
    for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N - 1; i++) {
      base[i].x = (base[i - 1].x + base[i].x * 2 + base[i + 1].x) / 4; base[i].y = (base[i - 1].y + base[i].y * 2 + base[i + 1].y) / 4;
    }
    const spd = Math.min(1, this.speed() / 700);
    const amp = (2.0 + spd * 5) * this.size * (dragon ? 1.5 : 1), wave = dragon ? 0.5 : 0.42;
    this.spine.length = 0;
    for (let i = 0; i < N; i++) {
      const a = base[Math.max(0, i - 1)], b = base[Math.min(N - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const u = i / (N - 1), off = Math.sin(this.phase - i * wave) * amp * u * (u + 0.2);
      this.spine.push({ x: base[i].x - ty * off, y: base[i].y + tx * off });
    }
    const t = this.spine[N - 1], pre = this.spine[N - 4];
    this.tailAng = angleLerp(this.tailAng, Math.atan2(t.y - pre.y, t.x - pre.x), Math.min(1, dt * 7));
  }

  draw(ctx, camX) {
    if (this.form >= 4) return this.drawDragon(ctx, camX);
    const sp = this.spine, N = sp.length; if (N < 4) return;
    const K = KOI_KINDS[this.kind] || KOI_KINDS.shu;
    const F = this.form;
    const swell = this.formT < 1.2 ? 1 + 0.22 * Math.sin(this.formT / 1.2 * Math.PI) : 1;
    const s = this.size * (1 + 0.04 * F) * swell, W = 7.6 * s;
    const gold = F >= 1 || K.dragon, goldA = K.dragon ? 0.45 : 0.3 + 0.1 * F;
    const fade = this.dying > 0 ? 1 - this.dying : 1;
    const mud = this.mud;
    // colours darken into ink when the koi is muddied
    const mix = (c, k) => [lerp(c[0], 40, mud) * k, lerp(c[1], 42, mud) * k, lerp(c[2], 52, mud) * k];
    const tone = (c, a, k = 1) => { const m = mix(c, k); return `rgba(${m[0] | 0},${m[1] | 0},${m[2] | 0},${a * fade})`; };
    const lum = (K.body[0] + K.body[1] + K.body[2]) / 3, pale = lum > 180, dark = lum < 70;
    ctx.save(); ctx.translate(-camX, 0);
    // a frame along the spine: tangent toward the tail, normal, half-width
    const T = [], Nn = [], hw = [], left = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      T.push({ x: tx, y: ty }); Nn.push({ x: -ty, y: tx });
      hw.push(koiWidth(i / (N - 1)) * W);
      left.push({ x: sp[i].x - ty * hw[i], y: sp[i].y + tx * hw[i] });
      right.push({ x: sp[i].x + ty * hw[i], y: sp[i].y - tx * hw[i] });
    }
    const hx = -T[0].x, hy = -T[0].y, h = sp[0];
    // a point on the body: t along it (0 snout .. 1 tail), o across it (-1..1 of the half-width)
    const at = (t, o) => {
      const fi = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(fi)), f = fi - i;
      const w = lerp(hw[i], hw[i + 1], f), n = Nn[i];
      return { x: lerp(sp[i].x, sp[i + 1].x, f) + n.x * o * w, y: lerp(sp[i].y, sp[i + 1].y, f) + n.y * o * w, i };
    };
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < N; i++) { const p = left[i - 1], q = left[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      const e = sp[N - 1], tx = T[N - 1].x, ty = T[N - 1].y;
      ctx.quadraticCurveTo(e.x + tx * hw[N - 1] * 1.4, e.y + ty * hw[N - 1] * 1.4, right[N - 1].x, right[N - 1].y);
      for (let i = N - 1; i >= 1; i--) { const p = right[i], q = right[i - 1]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      ctx.lineTo(right[0].x, right[0].y);
      // a blunt, rounded snout
      const r0 = hw[0], fx = h.x + hx * r0 * 1.15, fy = h.y + hy * r0 * 1.15;
      ctx.quadraticCurveTo(right[0].x + hx * r0 * 0.95, right[0].y + hy * r0 * 0.95, fx, fy);
      ctx.quadraticCurveTo(left[0].x + hx * r0 * 0.95, left[0].y + hy * r0 * 0.95, left[0].x, left[0].y);
      ctx.closePath();
    };
    const rot = (v, a) => { const c = Math.cos(a), sn = Math.sin(a); return { x: v.x * c - v.y * sn, y: v.x * sn + v.y * c }; };
    const norm = v => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
    // a translucent fin: a fan from its root between two edge directions, with rays
    const fin = (R, e1, e2, len, bulge, alpha) => {
      const P1 = { x: R.x + e1.x * len * 0.92, y: R.y + e1.y * len * 0.92 }, P2 = { x: R.x + e2.x * len * 0.82, y: R.y + e2.y * len * 0.82 };
      const em = norm({ x: e1.x + e2.x, y: e1.y + e2.y });
      const g = ctx.createRadialGradient(R.x, R.y, 0, R.x, R.y, len * 1.1);
      g.addColorStop(0, tone(K.fin, alpha)); g.addColorStop(0.55, tone(K.fin, alpha * 0.55)); g.addColorStop(1, tone(K.fin, alpha * 0.12));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(R.x, R.y);
      ctx.quadraticCurveTo(R.x + e1.x * len * 0.5 - em.x * len * 0.05, R.y + e1.y * len * 0.5 - em.y * len * 0.05, P1.x, P1.y);
      ctx.quadraticCurveTo(R.x + em.x * len * bulge, R.y + em.y * len * bulge, P2.x, P2.y);
      ctx.quadraticCurveTo(R.x + e2.x * len * 0.45, R.y + e2.y * len * 0.45, R.x, R.y);
      ctx.fill();
      ctx.strokeStyle = gold ? `rgba(214,164,70,${goldA * fade})` : `rgba(40,34,40,${0.16 * fade})`; ctx.lineWidth = gold ? 0.8 : 0.6; ctx.stroke();
      ctx.strokeStyle = dark ? `rgba(230,226,215,${0.14 * fade})` : `rgba(40,34,40,${0.13 * fade})`; ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let k = 1; k <= 5; k++) {
        const d = norm({ x: lerp(e1.x, e2.x, k / 6), y: lerp(e1.y, e2.y, k / 6) }), r = len * (0.85 + 0.2 * Math.sin(k / 6 * Math.PI) * (bulge - 0.9));
        ctx.moveTo(R.x + d.x * 2 * s, R.y + d.y * 2 * s); ctx.lineTo(R.x + d.x * r, R.y + d.y * r);
      }
      ctx.stroke();
    };

    // halo after a surge, a gate, or always for the ink dragon
    const glow = Math.max(this.glow * 2, K.dragon ? 0.5 : 0, F >= 2 ? 0.55 + 0.1 * (F - 2) : 0, this.formT < 2 ? 2 - this.formT : 0) * fade;
    if (glow > 0.01) {
      const m = sp[5], gr = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, 50 * s);
      const gc = K.dragon || F >= 2 ? '236,190,90' : '255,226,160';
      gr.addColorStop(0, `rgba(${gc},${0.35 * Math.min(1, glow)})`); gr.addColorStop(1, `rgba(${gc},0)`);
      ctx.fillStyle = gr; ctx.fillRect(m.x - 55 * s, m.y - 55 * s, 110 * s, 110 * s);
    }
    // soft shadow on the riverbed, doubled for a blurred edge
    for (const [dx, dy, a] of [[3, 6, 0.07], [5, 9, 0.05]]) { ctx.save(); ctx.translate(dx * s, dy * s); body(); ctx.fillStyle = `rgba(36,38,52,${a * fade})`; ctx.fill(); ctx.restore(); }

    // tail: two long lobes in a V with a notch between them, flaring and following through behind the body's wave
    const P = sp[N - 1], tb = { x: Math.cos(this.tailAng), y: Math.sin(this.tailAng) };
    const sway = Math.sin(this.phase - 2.4) * 0.24, flare = 0.08 * Math.sin(this.phase * 0.7);
    for (const sg of [1, -1]) {
      const Lt = (sg > 0 ? 25 : 23.5) * s * [1, 1.12, 1.35, 1.42][F], d = rot(tb, sway + sg * (0.36 + flare)), out = rot(d, sg * 0.42), inn = rot(d, -sg * 0.3);
      const tip = { x: P.x + d.x * Lt, y: P.y + d.y * Lt };
      const notch = rot(tb, sway * 1.3);
      const Nt = { x: P.x + notch.x * Lt * 0.42, y: P.y + notch.y * Lt * 0.42 };
      const g = ctx.createLinearGradient(P.x, P.y, tip.x, tip.y);
      g.addColorStop(0, tone(K.fin, 0.7)); g.addColorStop(0.6, tone(K.fin, 0.4)); g.addColorStop(1, tone(K.fin, 0.12));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(P.x + out.x * 2 * s, P.y + out.y * 2 * s);
      // outer edge sweeps wide, the tip is rounded, the trailing edge curves in to the notch
      ctx.bezierCurveTo(P.x + out.x * Lt * 0.55, P.y + out.y * Lt * 0.55, tip.x + out.x * Lt * 0.12, tip.y + out.y * Lt * 0.12, tip.x, tip.y);
      ctx.quadraticCurveTo(P.x + inn.x * Lt * 0.72, P.y + inn.y * Lt * 0.72, Nt.x, Nt.y);
      ctx.lineTo(P.x, P.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = gold ? `rgba(214,164,70,${(goldA + 0.05) * fade})` : `rgba(40,34,40,${0.18 * fade})`; ctx.lineWidth = gold ? 0.8 : 0.6; ctx.stroke();
      if (F >= 2) {
        // 灵: silk streamers ripple back from each lobe tip
        ctx.strokeStyle = `rgba(226,184,96,${0.5 * fade})`; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
        const sl = 18 * s;
        for (let j = 1; j <= 8; j++) {
          const d = sl * j / 8, lat = Math.sin(this.phase * 1.5 - j * 0.9 + sg) * j * 0.45 * s;
          ctx.lineTo(tip.x + tb.x * d - tb.y * lat, tip.y + tb.y * d + tb.x * lat);
        }
        ctx.stroke();
      }
      // rays fan from the root to the trailing edge
      ctx.strokeStyle = dark ? `rgba(230,226,215,${0.14 * fade})` : `rgba(40,34,40,${0.12 * fade})`; ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const u = k / 5, e = { x: lerp(tip.x, Nt.x, u * 0.85), y: lerp(tip.y, Nt.y, u * 0.85) };
        ctx.moveTo(P.x, P.y); ctx.quadraticCurveTo(lerp(P.x, e.x, 0.5) + out.x * 1.5 * s * (1 - u), lerp(P.y, e.y, 0.5) + out.y * 1.5 * s * (1 - u), e.x, e.y);
      }
      ctx.stroke();
    }
    // pelvic fins, small, then the big pectoral fans that row as it swims
    for (const [t, len0, row0] of [[0.52, 8.5, 0.6], [0.2, 15, 0]]) {
      const len = len0 * [1, 1.1, 1.25, 1.3][F];
      const i = Math.round(t * (N - 1)), n = Nn[i], back = T[i];
      for (const sg of [1, -1]) {
        const row = 0.5 + 0.5 * Math.sin(this.phase * 0.8 + sg * 1.4 + row0);
        const R = { x: sp[i].x + n.x * sg * hw[i] * 0.7, y: sp[i].y + n.y * sg * hw[i] * 0.7 };
        const e1 = norm({ x: n.x * sg + back.x * (0.1 + row * 0.45), y: n.y * sg + back.y * (0.1 + row * 0.45) });
        const e2 = norm({ x: n.x * sg * 0.25 + back.x, y: n.y * sg * 0.25 + back.y });
        fin(R, e1, e2, len * s, 1.3, 0.55);
      }
    }

    // body wash
    body(); ctx.fillStyle = tone(K.body, 0.96); ctx.fill();
    ctx.save(); body(); ctx.clip();
    // patterns: each patch laid twice, a faint bleed and then the pigment, like colour on wet paper
    const blot = (list, col) => {
      for (const p of list) {
        const c = at(p.t, p.o), r = p.r * s;
        if (p.soft) {
          const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, r * 1.5);
          g.addColorStop(0, tone(col, 0.75 * (1 - mud))); g.addColorStop(1, tone(col, 0));
          ctx.fillStyle = g; ctx.fillRect(c.x - r * 2, c.y - r * 2, r * 4, r * 4);
          continue;
        }
        const n = Nn[c.i], ang = Math.atan2(n.y, n.x);
        for (const [grow, a] of [[1.22, 0.28], [1, 0.92]]) {
          ctx.fillStyle = tone(col, a);
          ctx.beginPath();
          for (let k = 0; k <= 18; k++) {
            const q = k / 18 * TAU, wob = p.round ? 1 : 0.8 + 0.4 * vnoise(Math.cos(q) * 1.4 + p.t * 9, Math.sin(q) * 1.4, 5);
            const rx = r * grow * wob * (p.round ? 1 : 1.25), ry = r * grow * wob * (p.round ? 1 : 0.85);
            const lx = Math.cos(q) * ry, ly = Math.sin(q) * rx; // long axis runs along the body
            const x = c.x + lx * Math.cos(ang) - ly * Math.sin(ang), y = c.y + lx * Math.sin(ang) + ly * Math.cos(ang);
            if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.fill();
        }
      }
    };
    blot(K.patches, K.patch);
    if (K.patches2) blot(K.patches2, K.patch2);
    if (K.spots === 'ink') {
      ctx.fillStyle = `rgba(30,28,38,${0.55 * fade})`;
      for (const [t, o, r] of [[0.3, 0.35, 1.8], [0.42, -0.4, 1.3], [0.55, 0.2, 2.1], [0.68, -0.25, 1.4], [0.78, 0.3, 1]]) {
        const q = at(t, o); ctx.beginPath(); ctx.ellipse(q.x, q.y, r * s * 1.2, r * s, this.tailAng, 0, TAU); ctx.fill();
      }
    }
    // scales: a fine net of arcs, their open side toward the head
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = F >= 1 && !K.scales ? `rgba(${dark ? '226,178,80' : '196,140,50'},${(dark ? 0.2 : 0.12) + 0.04 * F})` : K.scales ? `rgba(226,234,244,${0.42 * fade})` : dark ? `rgba(220,215,205,${0.07 * fade})` : K.metal ? `rgba(255,246,210,${0.3 * fade})` : `rgba(60,30,24,${(pale ? 0.05 : 0.08) * fade})`;
    ctx.beginPath();
    for (let t = 0.2, row = 0; t < 0.8; t += 0.05, row++) {
      for (let o = -0.5 + (row % 2) * 0.17; o <= 0.52; o += 0.34) {
        const q = at(t, o), tt = T[q.i], a = Math.atan2(tt.y, tt.x), r = 2.1 * s * koiWidth(t);
        ctx.moveTo(q.x + Math.cos(a - 1.2) * r, q.y + Math.sin(a - 1.2) * r); ctx.arc(q.x, q.y, r, a - 1.2, a + 1.2);
      }
    }
    ctx.stroke();
    if (K.metal) {
      // a band of light slides along the gold as the koi swims
      const q = at(((this.time * 0.6) % 1.6) - 0.3, 0);
      const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, 18 * s);
      g.addColorStop(0, `rgba(255,250,220,${0.75 * fade * (1 - mud)})`); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.fillRect(q.x - 22 * s, q.y - 22 * s, 44 * s, 44 * s);
    }
    // roundness: the back is shaded down the middle, the rim darkens, the flank toward the light shines
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const spinePath = (from, to, o) => { ctx.beginPath(); for (let i = from; i <= to; i++) { const q = at(i / (N - 1), o); if (i === from) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); } };
    const shade = dark ? '0,0,0' : '60,24,20';
    spinePath(1, N - 3, 0); ctx.strokeStyle = `rgba(${shade},${0.08 * fade})`; ctx.lineWidth = W * 0.9; ctx.stroke();
    ctx.lineWidth = W * 0.4; ctx.stroke();
    body(); ctx.strokeStyle = pale ? `rgba(90,100,120,${0.2 * fade})` : `rgba(${shade},${0.2 * fade})`; ctx.lineWidth = 3.4 * s; ctx.stroke();
    const lightSide = Nn[3].y > 0 ? -1 : 1; // the flank facing up-screen catches the light
    spinePath(1, Math.round(N * 0.62), 0.5 * lightSide); ctx.strokeStyle = `rgba(255,252,240,${(dark ? 0.2 : 0.32) * fade * (1 - mud * 0.7)})`; ctx.lineWidth = 2.6 * s; ctx.stroke();
    const hs = at(0.1, 0.25 * lightSide), hg = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, 6 * s);
    hg.addColorStop(0, `rgba(255,252,242,${0.4 * fade * (1 - mud)})`); hg.addColorStop(1, 'rgba(255,252,242,0)');
    ctx.fillStyle = hg; ctx.fillRect(hs.x - 7 * s, hs.y - 7 * s, 14 * s, 14 * s);
    ctx.restore();
    // dorsal fin: a ridge of translucent fin along the back, rippling side to side
    ctx.beginPath();
    for (let i = 4; i <= 10; i++) {
      const r = Math.sin(this.phase * 1.3 - i * 0.5) * 0.18, q = at(i / (N - 1), r);
      if (i === 4) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = tone(K.fin, pale ? 0.35 : 0.5, dark ? 1.2 : 0.85); ctx.lineWidth = 2.2 * s; ctx.stroke();
    ctx.strokeStyle = K.dragon ? `rgba(226,178,80,${0.7 * fade})` : `rgba(40,30,36,${(pale ? 0.16 : 0.3) * fade})`; ctx.lineWidth = 0.6; ctx.stroke();
    if (F >= 3) this.drawMane(ctx, at, s, tone, K, fade);
    // outline: a broken ink line, heavier along one side, as a brush would leave it
    body();
    ctx.setLineDash([26 * s, 2.5 * s, 11 * s, 1.5 * s]);
    ctx.strokeStyle = K.dragon || F >= 1 ? `rgba(${pale ? '186,132,40' : '214,164,70'},${(0.6 + 0.08 * F) * fade})` : `rgba(30,26,34,${(pale ? 0.6 : 0.42) * fade})`; ctx.lineWidth = pale || F >= 1 ? 1.1 : 0.9; ctx.stroke();
    ctx.setLineDash([]);
    // gill covers
    ctx.strokeStyle = `rgba(${shade},${0.22 * fade})`; ctx.lineWidth = 0.7;
    for (const sg of [1, -1]) {
      const a = at(0.1, 0.75 * sg), b = at(0.16, 0.25 * sg), c = at(0.2, 0.8 * sg);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, c.x, c.y); ctx.stroke();
    }
    // eyes, set into the sides of the head, each with a glint
    for (const sg of [1, -1]) {
      const e = at(0.035, 0.72 * sg);
      ctx.fillStyle = K.dragon ? `rgba(240,196,90,${fade})` : `rgba(18,18,24,${0.92 * fade})`;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, 1.45 * s, 1.15 * s, Math.atan2(hy, hx), 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.8 * fade})`; ctx.beginPath(); ctx.arc(e.x + hx * 0.4 * s, e.y + hy * 0.4 * s - 0.3 * s, 0.45 * s, 0, TAU); ctx.fill();
    }
    if (F >= 3) this.drawHorns(ctx, at, T, Nn, s, fade);
    // barbels: two short whiskers at the mouth, swept back and wavering with the swim
    const bw = Math.sin(this.phase * 1.3) * 0.25, bl = F >= 3 ? 2.6 : K.dragon ? 2.2 : 1;
    ctx.strokeStyle = K.dragon || F >= 3 ? `rgba(214,164,70,${0.8 * fade})` : `rgba(28,28,40,${0.4 * fade})`; ctx.lineWidth = bl > 2 ? 1 : 0.75; ctx.lineCap = 'round';
    const heading = Math.atan2(hy, hx);
    for (const sg of [1, -1]) {
      const m = at(0, 0.45 * sg), mx = m.x + hx * hw[0] * 0.8, my = m.y + hy * hw[0] * 0.8;
      const a = heading + sg * (2.2 + bw), L = 6 * s * bl, ux = Math.cos(a), uy = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(mx, my);
      // long whiskers ripple like ribbons in a current
      for (let j = 1; j <= 8; j++) {
        const d = L * j / 8, lat = Math.sin(this.phase * 1.6 - j * 0.8) * j * 0.3 * s * (bl > 1.5 ? 1 : 0.3) - sg * j * 0.25 * s;
        ctx.lineTo(mx + ux * d - uy * lat, my + uy * d + ux * lat);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // 蛟: a crest of flame-like fin down the back, rippling
  drawMane(ctx, at, s, tone, K, fade) {
    const tips = [];
    for (let t = 0.1, k = 0; t < 0.84; t += 0.05, k++) {
      const side = k % 2 ? 1 : -1, reach = 1.35 + 0.3 * Math.sin(this.phase * 2 - t * 18);
      tips.push([at(t, side * 0.05), at(t + 0.035, side * reach), at(t + 0.075, side * 0.05)]);
    }
    ctx.fillStyle = tone(K.fin, 0.55, 0.9);
    ctx.strokeStyle = `rgba(214,164,70,${0.7 * fade})`; ctx.lineWidth = 0.7;
    for (const [a, b, c] of tips) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(lerp(a.x, b.x, 0.7), lerp(a.y, b.y, 0.3), b.x, b.y);
      ctx.quadraticCurveTo(lerp(c.x, b.x, 0.4), lerp(c.y, b.y, 0.6), c.x, c.y);
      ctx.fill(); ctx.stroke();
    }
  }

  // 蛟: ivory antlers sweeping back from the brow, with a tine
  drawHorns(ctx, at, T, Nn, s, fade) {
    const len = 7 * s, back = T[1], n = Nn[1];
    ctx.lineCap = 'round';
    for (const sg of [1, -1]) {
      const r = at(0.1, 0.35 * sg);
      const d = { x: back.x * 0.45 + n.x * sg * 0.9, y: back.y * 0.45 + n.y * sg * 0.9 };
      const mid = { x: r.x + d.x * len * 0.55, y: r.y + d.y * len * 0.55 };
      const tip = { x: r.x + d.x * len + back.x * len * 0.35, y: r.y + d.y * len + back.y * len * 0.35 };
      const tine = { x: mid.x + d.x * len * 0.3 - back.x * len * 0.25, y: mid.y + d.y * len * 0.3 - back.y * len * 0.25 };
      const core = `rgba(232,220,192,${fade})`;
      for (const [w, c] of [[2 * s, `rgba(50,38,28,${0.7 * fade})`], [0.9 * s, core]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
        ctx.moveTo(mid.x, mid.y); ctx.lineTo(tine.x, tine.y);
        ctx.stroke();
      }
    }
  }

  // 龙: once the koi has become a dragon it is painted as one, seen from above as the koi is: a long serpentine body
  // of scales under a crest of spines, a horned and whiskered head with a flame mane, four clawed legs, a tail that
  // ends in flame, and the flaming pearl it chases. It grows longer and heavier with every gate after (see segs()).
  drawDragon(ctx, camX) {
    const sp = this.spine, N = sp.length; if (N < 4) return;
    const K = KOI_KINDS[this.kind] || KOI_KINDS.shu;
    const g = Math.min(this.growth, DRAGON.MAX_GROWTH);
    const swell = this.formT < 1.2 ? 1 + 0.18 * Math.sin(this.formT / 1.2 * Math.PI) : 1;
    const s = this.size * (1.05 + 0.07 * g) * swell, W = 5.8 * s;
    const fade = this.dying > 0 ? 1 - this.dying : 1, mud = this.mud;
    const mix = (c, k) => [lerp(c[0], 40, mud) * k, lerp(c[1], 42, mud) * k, lerp(c[2], 52, mud) * k];
    const tone = (c, a, k = 1) => { const m = mix(c, k); return `rgba(${Math.min(255, m[0]) | 0},${Math.min(255, m[1]) | 0},${Math.min(255, m[2]) | 0},${a * fade})`; };
    const lum = (K.body[0] + K.body[1] + K.body[2]) / 3, dark = lum < 70, pale = lum > 180;
    const goldC = pale ? '176,120,36' : '222,176,80', gold = a => `rgba(${goldC},${a * fade})`;
    const t0 = this.time;
    // flames (mane, elbows, tail) lean toward gold so they stand out from any body colour
    const flameC = [lerp(K.fin[0], 240, 0.55), lerp(K.fin[1], 178, 0.55), lerp(K.fin[2], 80, 0.55)];
    ctx.save(); ctx.translate(-camX, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // frame along the spine
    const T = [], Nn = [], hw = [], left = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(N - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      T.push({ x: tx, y: ty }); Nn.push({ x: -ty, y: tx });
      hw.push(dragonWidth(i / (N - 1)) * W);
      left.push({ x: sp[i].x - ty * hw[i], y: sp[i].y + tx * hw[i] });
      right.push({ x: sp[i].x + ty * hw[i], y: sp[i].y - tx * hw[i] });
    }
    const hx = -T[0].x, hy = -T[0].y, H = sp[0];
    const at = (t, o) => {
      const fi = clamp(t, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(fi)), f = fi - i;
      const w = lerp(hw[i], hw[i + 1], f), n = Nn[i];
      return { x: lerp(sp[i].x, sp[i + 1].x, f) + n.x * o * w, y: lerp(sp[i].y, sp[i + 1].y, f) + n.y * o * w, i };
    };
    // head space: u forward, v to the side, in units of s
    const hs = s * 1.35, hp = (u, v) => ({ x: H.x + (hx * u - hy * v) * hs, y: H.y + (hy * u + hx * v) * hs });
    const body = () => {
      ctx.beginPath(); ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < N; i++) { const p = left[i - 1], q = left[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      const e = sp[N - 1]; ctx.quadraticCurveTo(e.x + T[N - 1].x * hw[N - 1] * 1.5, e.y + T[N - 1].y * hw[N - 1] * 1.5, right[N - 1].x, right[N - 1].y);
      for (let i = N - 1; i >= 1; i--) { const p = right[i], q = right[i - 1]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
      ctx.lineTo(right[0].x, right[0].y); ctx.closePath();
    };
    // a tapering flame tongue from a root along a direction, bending as it goes
    const flame = (x, y, dx, dy, len, wid, bend, a, col = flameC, k = 1) => {
      const nx = -dy, ny = dx, tx = x + dx * len + nx * bend, ty = y + dy * len + ny * bend;
      const gr = ctx.createLinearGradient(x, y, tx, ty);
      gr.addColorStop(0, tone(col, 0.95 * a, k)); gr.addColorStop(1, tone(col, 0.2 * a, k));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x + nx * wid, y + ny * wid);
      ctx.quadraticCurveTo(x + dx * len * 0.55 + nx * (wid + bend * 0.8), y + dy * len * 0.55 + ny * (wid + bend * 0.8), tx, ty);
      ctx.quadraticCurveTo(x + dx * len * 0.5 + nx * bend * 0.2, y + dy * len * 0.5 + ny * bend * 0.2, x - nx * wid, y - ny * wid);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = gold(0.55 * a); ctx.lineWidth = 0.7; ctx.stroke();
    };

    // an aura of gold along the body, and the shadow it casts
    for (const t of [0.12, 0.45, 0.8]) {
      const c = at(t, 0), r = (46 + 6 * g) * s;
      const gr = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, r);
      gr.addColorStop(0, `rgba(236,190,90,${(0.2 + (this.formT < 2 ? (2 - this.formT) * 0.2 : 0)) * fade})`); gr.addColorStop(1, 'rgba(236,190,90,0)');
      ctx.fillStyle = gr; ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }
    for (const [dx, dy, a] of [[3, 7, 0.07], [6, 11, 0.05]]) { ctx.save(); ctx.translate(dx * s, dy * s); body(); ctx.fillStyle = `rgba(36,38,52,${a * fade})`; ctx.fill(); ctx.restore(); }

    // tail: a fan of flame tongues that lash with the body's wave
    const tb = { x: Math.cos(this.tailAng), y: Math.sin(this.tailAng) }, E = sp[N - 1];
    for (let k = -2; k <= 2; k++) {
      const a = k * 0.28 + Math.sin(this.phase * 1.3 - 1.5 + k) * 0.18, c = Math.cos(a), sn = Math.sin(a);
      const dx = tb.x * c - tb.y * sn, dy = tb.x * sn + tb.y * c;
      flame(E.x, E.y, dx, dy, (24 - Math.abs(k) * 4) * s * (1 + 0.05 * g), 2.4 * s, Math.sin(this.phase * 1.7 + k) * 5 * s, 1);
    }
    // four legs, striding in turn: shoulder, elbow with a tuft of flame, a foot of four claws
    for (const [t, ph] of [[0.2, 0], [0.56, 1.7]]) {
      const i = Math.round(t * (N - 1)), n = Nn[i], b = T[i];
      for (const sg of [1, -1]) {
        const st = Math.sin(this.phase * 0.9 + ph + (sg > 0 ? 0 : Math.PI));
        const sh = { x: sp[i].x + n.x * sg * hw[i] * 0.6, y: sp[i].y + n.y * sg * hw[i] * 0.6 };
        const el = { x: sh.x + (n.x * sg * 6 + b.x * (2.5 + st * 2.5)) * s, y: sh.y + (n.y * sg * 6 + b.y * (2.5 + st * 2.5)) * s };
        const ft = { x: el.x + (n.x * sg * 2 - b.x * (3 + st * 2)) * s, y: el.y + (n.y * sg * 2 - b.y * (3 + st * 2)) * s };
        flame(el.x, el.y, b.x * 0.8 + n.x * sg * 0.6, b.y * 0.8 + n.y * sg * 0.6, 9 * s, 1.6 * s, sg * 2.5 * s, 0.95);
        ctx.strokeStyle = tone(K.body, 0.95, 0.85); ctx.lineWidth = 4.4 * s;
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.quadraticCurveTo(el.x, el.y, ft.x, ft.y); ctx.stroke();
        ctx.strokeStyle = gold(0.5); ctx.lineWidth = 0.8; ctx.stroke();
        ctx.strokeStyle = gold(0.95); ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (const a of [-0.9, -0.3, 0.3, 0.9]) {
          const c = Math.cos(a), sn = Math.sin(a), fx = -b.x * c + b.y * sn * sg, fy = -b.y * c - b.x * sn * sg;
          const tipx = ft.x + (fx * 3 + n.x * sg * 0.6) * s, tipy = ft.y + (fy * 3 + n.y * sg * 0.6) * s;
          ctx.moveTo(ft.x, ft.y); ctx.quadraticCurveTo(ft.x + fx * 2.2 * s, ft.y + fy * 2.2 * s, tipx + n.x * sg * 0.8 * s, tipy + n.y * sg * 0.8 * s);
        }
        ctx.stroke();
      }
    }

    // body: a wash of the variety's colour, then scales, a darker ridge down the back, a gold rim
    body(); ctx.fillStyle = tone(K.body, 0.96); ctx.fill();
    ctx.save(); body(); ctx.clip();
    for (const p of K.patches) {
      if (p.soft) continue;
      const c = at(p.t, p.o * 0.6), r = p.r * s * 1.4;
      ctx.fillStyle = tone(K.patch, 0.85); ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 1.6, r, Math.atan2(T[c.i].y, T[c.i].x), 0, TAU); ctx.fill();
    }
    if (K.patches2) for (const p of K.patches2) { const c = at(p.t, p.o * 0.6), r = p.r * s * 1.3; ctx.fillStyle = tone(K.patch2, 0.85); ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 1.5, r, Math.atan2(T[c.i].y, T[c.i].x), 0, TAU); ctx.fill(); }
    // scales: rows of overlapping arcs, one row per half segment, so a longer dragon simply has more of them
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = dark ? gold(0.45) : pale ? `rgba(150,110,60,${0.35 * fade})` : `rgba(90,30,20,${0.3 * fade})`;
    ctx.beginPath();
    for (let fi = 1, row = 0; fi < N - 2; fi += 0.5, row++) {
      const t = fi / (N - 1), rr = Math.max(1.2 * s, hw[Math.round(fi)] * 0.34);
      for (let o = -0.72 + (row % 2) * 0.24; o <= 0.73; o += 0.48) {
        const q = at(t, o), tt = T[q.i], a = Math.atan2(tt.y, tt.x);
        ctx.moveTo(q.x + Math.cos(a - 1.3) * rr, q.y + Math.sin(a - 1.3) * rr); ctx.arc(q.x, q.y, rr, a - 1.3, a + 1.3);
      }
    }
    ctx.stroke();
    // roundness: shade down the middle of the back, light along the upper flank
    const line = (o, from, to) => { ctx.beginPath(); for (let i = from; i <= to; i++) { const q = at(i / (N - 1), o); if (i === from) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); } };
    line(0, 0, N - 2); ctx.strokeStyle = `rgba(0,0,0,${0.14 * fade})`; ctx.lineWidth = W * 0.8; ctx.stroke();
    const lightSide = Nn[Math.min(3, N - 1)].y > 0 ? -1 : 1;
    line(0.55 * lightSide, 0, Math.round(N * 0.8)); ctx.strokeStyle = `rgba(255,248,226,${(dark ? 0.18 : 0.3) * fade})`; ctx.lineWidth = 2 * s; ctx.stroke();
    ctx.restore();
    body(); ctx.strokeStyle = gold(0.75); ctx.lineWidth = 1.2; ctx.stroke();
    // the crest: a row of backswept spines down the back, rippling
    for (let fi = 1.2; fi < N - 1.5; fi += 0.9) {
      const t = fi / (N - 1), q = at(t, 0), tt = T[q.i], w = hw[q.i];
      const lean = Math.sin(this.phase * 1.6 - fi * 0.7) * 0.35, len = w * (1.25 - 0.5 * t);
      const bx = tt.x * Math.cos(lean) - tt.y * Math.sin(lean), by = tt.x * Math.sin(lean) + tt.y * Math.cos(lean);
      ctx.fillStyle = tone(K.fin, 0.9, dark ? 1.3 : 0.9);
      ctx.beginPath(); ctx.moveTo(q.x - tt.y * w * 0.22, q.y + tt.x * w * 0.22);
      ctx.quadraticCurveTo(q.x + bx * len * 0.5, q.y + by * len * 0.5 + 0, q.x + bx * len, q.y + by * len);
      ctx.lineTo(q.x + tt.y * w * 0.22, q.y - tt.x * w * 0.22); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = gold(0.7); ctx.lineWidth = 0.6; ctx.stroke();
    }
    // mane: flames sweeping back from the jaw and neck on both sides
    for (const sg of [1, -1]) for (let k = 0; k < 5; k++) {
      const r = hp(-3 - k * 2.2, sg * (6.4 - k * 0.5)), w = Math.sin(this.phase * 2 + k + sg) * 0.22;
      const a = Math.atan2(-hy, -hx) + sg * (0.85 - k * 0.1 + w);
      // the mane is a deep shade of the body, so it reads against paper and gold alike
      flame(r.x, r.y, Math.cos(a), Math.sin(a), (22 - k * 2) * s, 2.8 * s, sg * 4 * s, 1, K.body, dark ? 1.9 : 0.62);
    }

    // head: a long snout, cheeks, brows, and slit-eyed gaze
    const half = [[-8, 5.4], [-4.5, 7.2], [-0.5, 7], [3, 5.6], [6.5, 4.3], [9.5, 3.8], [12, 3], [13.6, 1.6], [14.2, 0]];
    const outline = [...half.map(([u, v]) => hp(u, v)), ...half.slice(0, -1).reverse().map(([u, v]) => hp(u, -v))];
    ctx.beginPath(); ctx.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) { const p = outline[i - 1], q = outline[i]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    ctx.closePath();
    const snout = hp(12, 0), hg = ctx.createLinearGradient(H.x, H.y, snout.x, snout.y);
    hg.addColorStop(0, tone(K.body, 0.98)); hg.addColorStop(1, tone(K.body, 0.98, pale ? 0.92 : 1.15));
    ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = gold(0.9); ctx.lineWidth = 1.2; ctx.stroke();
    // snout ridge and nostrils
    ctx.strokeStyle = `rgba(0,0,0,${0.18 * fade})`; ctx.lineWidth = 1.4 * s;
    ctx.beginPath(); const r0 = hp(2, 0), r1 = hp(11, 0); ctx.moveTo(r0.x, r0.y); ctx.lineTo(r1.x, r1.y); ctx.stroke();
    ctx.strokeStyle = gold(0.9); ctx.lineWidth = 1;
    for (const sg of [1, -1]) { const c = hp(11.6, sg * 1.9); ctx.beginPath(); ctx.arc(c.x, c.y, 1.1 * s, 0, TAU * 0.8); ctx.stroke(); }
    // brows: heavy ridges over the eyes, flaring back into tufts
    for (const sg of [1, -1]) {
      const a = hp(3.5, sg * 3.8), b = hp(0, sg * 6.4), c = hp(-5, sg * 8.6);
      ctx.strokeStyle = tone(K.body, 1, dark ? 1.8 : 0.6); ctx.lineWidth = 2.2 * s;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(b.x, b.y, c.x, c.y); ctx.stroke();
      ctx.strokeStyle = gold(0.9); ctx.lineWidth = 0.8; ctx.stroke();
    }
    // eyes: gold, with a dark slit and a glint
    for (const sg of [1, -1]) {
      const e = hp(1.8, sg * 4.2), ang = Math.atan2(hy, hx);
      ctx.fillStyle = `rgba(246,206,96,${fade})`; ctx.beginPath(); ctx.ellipse(e.x, e.y, 2.2 * s, 1.5 * s, ang, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(40,24,10,${0.8 * fade})`; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.fillStyle = `rgba(16,12,10,${fade})`; ctx.beginPath(); ctx.ellipse(e.x, e.y, 0.5 * s, 1.35 * s, ang, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * fade})`; ctx.beginPath(); ctx.arc(e.x + hx * 0.8 * s, e.y + hy * 0.8 * s - 0.4 * s, 0.45 * s, 0, TAU); ctx.fill();
    }
    // antlers: long beams sweeping back over the neck, each with two tines curling outward
    const hl = (15 + 1.2 * g) * s;
    for (const sg of [1, -1]) {
      const n2 = { x: -hy * sg, y: hx * sg }, back = { x: -hx, y: -hy };
      const r = hp(-4.5, sg * 3.4);
      const at2 = (f, out) => ({ x: r.x + back.x * hl * f + n2.x * hl * out, y: r.y + back.y * hl * f + n2.y * hl * out });
      const mid = at2(0.5, 0.26), tip = at2(1, 0.3);
      const tines = [[0.34, 0.19], [0.66, 0.27]].map(([f, o]) => [at2(f, o), at2(f + 0.24, o + 0.16)]);
      for (const [w, c] of [[3 * s, `rgba(60,40,20,${0.7 * fade})`], [1.7 * s, `rgba(236,198,112,${fade})`]]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
        for (const [a, b] of tines) { ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(lerp(a.x, b.x, 0.3) + back.x * hl * 0.04, lerp(a.y, b.y, 0.3) + back.y * hl * 0.04, b.x, b.y); }
        ctx.stroke();
      }
    }
    // whiskers: two long ribbons from the nostrils, and a pair from the jaw
    for (const [u, v, len, lw] of [[11, 2.4, 30 + 2.5 * g, 1.2], [6, 4.6, 16, 0.8]]) for (const sg of [1, -1]) {
      const m = hp(u, sg * v), a = Math.atan2(hy, hx) + sg * 2.1, ux = Math.cos(a), uy = Math.sin(a);
      ctx.strokeStyle = gold(0.85); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(m.x, m.y);
      for (let j = 1; j <= 12; j++) {
        const d = len * s * j / 12, lat = Math.sin(this.phase * 1.4 - j * 0.6 + sg) * j * 0.45 * s - sg * j * 0.35 * s;
        ctx.lineTo(m.x + ux * d - uy * lat, m.y + uy * d + ux * lat);
      }
      ctx.stroke();
    }

    // the flaming pearl it chases, a little ahead of the snout
    const pd = (26 + 2 * g) * s, sway = Math.sin(t0 * 1.3) * 8 * s;
    const px = H.x + hx * pd - hy * sway, py = H.y + hy * pd + hx * sway, pr = 4.5 * s;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 4);
    pg.addColorStop(0, `rgba(255,236,190,${0.6 * fade})`); pg.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = pg; ctx.fillRect(px - pr * 4, py - pr * 4, pr * 8, pr * 8);
    ctx.strokeStyle = `rgba(226,120,50,${0.7 * fade})`; ctx.lineWidth = 1.2;
    for (let k = 0; k < 3; k++) {
      const a0 = t0 * 2.2 + k * TAU / 3; ctx.beginPath();
      for (let j = 0; j <= 10; j++) { const a = a0 + j * 0.28, r = pr * (1.2 + j * 0.12); if (j) ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); else ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r); }
      ctx.stroke();
    }
    const pb = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0.5, px, py, pr);
    pb.addColorStop(0, `rgba(255,255,250,${fade})`); pb.addColorStop(0.6, `rgba(250,226,170,${fade})`); pb.addColorStop(1, `rgba(214,150,70,${fade})`);
    ctx.fillStyle = pb; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
    ctx.restore();
  }

}

// a still koi painted into its own little canvas: the variety picker and unlock cards use this
function koiPortrait(kind, w, h, locked) {
  const cv = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const c = cv.getContext('2d');
  const k = new Koi(0, 0, kind);
  const sc = Math.min(w / 130, h / 65);
  k.size = 1.02; k.heading = -0.28; k.tailAng = -0.28; k.phase = 1.2; k.vx = 200; k.vy = -60; k.mud = locked ? 0.55 : 0;
  k.x = 108; k.y = 22; k.computeSpine(1);
  c.setTransform(dpr * sc, 0, 0, dpr * sc, (w * dpr - 130 * dpr * sc) / 2, (h * dpr - 65 * dpr * sc) / 2);
  if (locked) c.globalAlpha = 0.55;
  k.draw(c, 0);
  return cv;
}
