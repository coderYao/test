'use strict';
// ---------- game loop, input, HUD, particles, states ----------
const LH = 720;          // logical height; width follows the aspect ratio
const CELL = 10;
const FONT_BRUSH = '"Ma Shan Zheng", "Zhi Mang Xing", "KaiTi", "STKaiti", "Noto Serif SC", serif';
const FONT_TEXT = '"Noto Serif SC", "Songti SC", "SimSun", serif';
const POEMS = ['春水初生', '夏荷听雨', '秋叶染霜', '冬雪归寂'];
const POEMS_EN = ['Spring waters rise', 'Summer lotus, listening to rain', 'Autumn leaves, touched by frost', 'Winter snow, returning to stillness'];
// cause of death: [Chinese, English, seal glyph, tip (Chinese), tip (English)]
const REASONS = {
  tide: ['被墨潮吞没', 'Swallowed by the ink tide', '潮', '墨潮不等鱼，顺势而下方能疾游。', 'The tide never waits. Paint downhill strokes to build speed.'],
  ink: ['溺于浓墨', 'Drowned in thick ink', '墨', '浓墨伤神：以清水化开，或绕行留白。', 'Thick ink drains Spirit. Wash it away with water, or steer through blank paper.'],
  hook: ['为渔翁所获', 'Taken by the fisherman', '钩', '钩自天降，俯身从下方游过。', 'Hooks hang from above. Dive under them.'],
  pool: ['沉入墨潭', 'Sank into the ink pool', '潭', '鱼离墨则沉：笔要落在鱼的前下方。', 'Off the ink, the koi sinks. Keep a stroke just ahead of it and below.'],
};
const PICKUP = {
  SURGE: 45, SURGE_PER_COMBO: 10,   // pearl: speed kick (px/s), growing along a 连珠 run
  PURIFY_R: 260, PURIFY_T: 0.9,     // lotus: radius and spread time of the ring of clear water
  EBB: 300, EBB_HOLD: 2,            // lotus: how far the ink tide ebbs, and how long it rests there
};
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.seed = (Math.random() * 1e9) | 0;
    this.scenery = new Scenery(this.seed);
    this.state = 'title';
    this.time = 0; this.last = performance.now();
    this.pointer = { x: 0, y: 0, down: false, type: 'mouse', sx: 0, sy: 0, ts: 0, inside: false };
    this.waterHold = false; this.waterToggle = false;
    this.paused = false;
    this.best = +(Platform.storage.get('moli.best') || 0);
    this.particles = []; this.ripples = []; this.ambient = [];
    this.floaters = [];
    this.purifies = []; // expanding rings of clear water from a lotus
    this.brushW = 8;
    this.resize();
    this.scenery.makePaper(this.ctx);
    this.reset();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (this.state === 'play') this.paused = true;
      Platform.setPlaying(false); // frames stop while hidden, so loop() cannot report this
    });
    requestAnimationFrame(t => this.loop(t));
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // a hidden or zero-size frame reports 0x0; lay out for a nominal size until a real resize arrives
    const W = window.innerWidth || 1280, H = window.innerHeight || 720;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.scale = H / LH; this.LW = W / this.scale; this.dpr = dpr;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    Stroke.RES = Math.min(3, dpr * this.scale);
    if (!this.liveSurf) { const c = document.createElement('canvas'); this.liveSurf = { canvas: c, ctx: c.getContext('2d'), k: 1 }; }
    this.liveSurf.canvas.width = this.canvas.width; this.liveSurf.canvas.height = this.canvas.height; this.liveSurf.k = dpr * this.scale;
    if (this.field) this.field.resize(Math.ceil((this.LW + 600) / CELL));
    if (this.scenery.paper) this.scenery.paperPattern = this.ctx.createPattern(this.scenery.paper, 'repeat');
  }

  reset() {
    this.world = new World(this.seed + ((Math.random() * 1e6) | 0));
    this.field = new InkField(CELL, Math.ceil((this.LW + 600) / CELL), LH / CELL);
    this.koi = new Koi(150, 250);
    this.strokes = [];
    this.cur = null;
    this.ink = 1; this.water = 1; this.dry = false;
    this.camX = 0; this.elapsed = 0;
    this.distance = 0; this.pearls = 0; this.lotusN = 0; this.combo = 0; this.comboT = 0;
    this.particles.length = 0; this.ripples.length = 0; this.floaters.length = 0; this.purifies.length = 0;
    this.deathReason = null; this.dyingT = 0;
    this.seasonIdx = 0; this.seasonFlash = 0;
    this.hintT = 0; this.drewOnce = false; this.waterHintT = 0; this.waterHintShown = false;
    this.shake = 0;
    // opening stroke: the scroll paints the first current for the koi
    this.guide = { t: 0, dur: 1.1, stroke: new Stroke(), from: { x: 60, y: 330 }, to: { x: 640, y: 372 } };
    this.strokes.push(this.guide.stroke);
    this.field.shiftTo(-150);
  }

  // begin a run. Restarting after a death is a natural break, so that is where the portal may show an ad.
  start() {
    if (this.adPending) return;
    if (this.state !== 'over') { this.beginRun(); return; }
    const again = document.getElementById('btn-again');
    this.adPending = true; again.disabled = true;
    Platform.midgameAd(() => Audio.setDucked(true), () => Audio.setDucked(Platform.muted()))
      .then(() => { this.adPending = false; again.disabled = false; this.beginRun(); });
  }

  beginRun() {
    this.reset();
    this.state = 'play'; this.paused = false;
    document.getElementById('title').classList.add('hidden');
    document.getElementById('over').classList.add('hidden');
    Audio.init(); Audio.resume();
    Audio.chord(5, 0.35);
  }

  score() { return Math.floor(this.distance / 10) + this.pearls * 10 + this.lotusN * 50; }

  // ---------- input ----------
  bindInput() {
    const cv = this.canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    const pos = e => ({ x: e.clientX / this.scale, y: e.clientY / this.scale });
    cv.addEventListener('pointerdown', e => {
      Audio.init(); Audio.resume();
      const p = pos(e);
      this.pointer.type = e.pointerType; this.pointer.inside = true;
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.ts = e.timeStamp;
      if (this.state === 'title') { this.start(); return; }
      if (this.state === 'over') { return; }
      if (this.paused) { this.paused = false; this.last = performance.now(); return; }
      if (this.state !== 'play') return;
      cv.setPointerCapture(e.pointerId);
      this.pointer.down = true;
      this.pointer.button = e.button;
      if (this.isWater()) { this.applyWater(p.x + this.camX, p.y, 0); }
      else this.beginStroke(p.x + this.camX, p.y);
    });
    cv.addEventListener('pointermove', e => {
      const p = pos(e);
      this.pointer.inside = true;
      const dt = Math.max(1, e.timeStamp - this.pointer.ts) / 1000;
      const dl = dist(p.x, p.y, this.pointer.x, this.pointer.y);
      const speed = dl / dt;
      if (this.pointer.down && this.state === 'play' && !this.paused) {
        if (this.isWater()) { if (this.cur) this.endStroke(); this.applyWater(p.x + this.camX, p.y, dl); }
        else this.extendStroke(p.x + this.camX, p.y, speed, dl);
      }
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.ts = e.timeStamp;
    });
    const up = e => { this.pointer.down = false; this.pointer.button = 0; if (this.cur) this.endStroke(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift' || e.key === ' ') { if (!this.waterHold) { this.waterHold = true; if (this.cur) this.endStroke(); } e.preventDefault(); }
      if (e.key === 'm' || e.key === 'M') this.toggleMute();
      if (e.key === 'p' || e.key === 'P') { if (this.state === 'play') { this.paused = !this.paused; this.last = performance.now(); } }
      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') { if (this.state === 'over' || this.state === 'title') this.start(); }
    });
    window.addEventListener('keyup', e => { if (e.key === 'Shift' || e.key === ' ') this.waterHold = false; });
    document.getElementById('btn-again').addEventListener('click', () => this.start());
    document.getElementById('btn-water').addEventListener('click', e => { this.waterToggle = !this.waterToggle; e.currentTarget.classList.toggle('on', this.waterToggle); if (this.cur) this.endStroke(); });
    document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
  }

  toggleMute() {
    Audio.init(); Audio.setMuted(!Audio.isMuted());
    syncMuteButton();
  }

  isWater() { return this.waterHold || this.waterToggle || this.pointer.button === 2; }

  beginStroke(wx, wy) {
    if (this.ink <= 0.02) { this.dry = true; this.flashDry = 0.6; return; }
    this.cur = new Stroke();
    this.cur.add(wx, wy, this.brushW, 0);
    this.strokes.push(this.cur);
    this.drewOnce = true;
    this.scratch = 0.4;
  }

  extendStroke(wx, wy, speed, dl) {
    if (!this.cur) { if (this.ink > 0.05) this.beginStroke(wx, wy); return; }
    const targetW = lerp(BRUSH.WMAX, BRUSH.WMIN, smoothstep(110, 1300, speed));
    this.brushW = lerp(this.brushW, targetW, 0.35);
    const dry = smoothstep(650, 1500, speed);
    const cost = dl * this.brushW * BRUSH.INK_COST;
    if (this.ink < cost) {
      // the brush runs dry mid-stroke: trailing 飞白 then nothing
      const p = this.cur.pts[this.cur.pts.length - 1];
      this.cur.add(lerp(p.x, wx, 0.6), lerp(p.y, wy, 0.6), this.brushW * 0.6, 0.9);
      this.ink = 0; this.dry = true; this.flashDry = 0.8;
      this.endStroke();
      return;
    }
    if (this.cur.add(wx, wy, this.brushW, dry)) this.ink -= cost;
    this.scratch = Math.max(this.scratch || 0, clamp(speed / 1400, 0.15, 1));
  }

  endStroke() {
    if (!this.cur) return;
    this.cur.finish();
    if (this.cur.pts.length < 2) this.strokes.splice(this.strokes.indexOf(this.cur), 1);
    this.cur = null;
  }

  applyWater(wx, wy, dl) {
    if (this.water <= 0.01) { this.flashWater = 0.5; return; }
    const cost = 0.004 + dl * 0.0011;
    this.water = Math.max(0, this.water - cost);
    const removed = this.field.water(wx, wy, 34, 0.55);
    for (const s of this.strokes) if (!s.dead && s.nearest(wx, wy, 26) >= 0) s.erode += 0.03 + dl * 0.012;
    if (removed > 0.4 && Math.random() < 0.3) this.splash(wx, wy, 2, 'rgba(90,96,120,');
    this.scratch = 0.2;
    if (Math.random() < 0.06) Audio.drip(0.08);
  }

  // ---------- update ----------
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.05) dt = 0.05;
    Platform.setPlaying(this.state === 'play' && !this.paused && !this.adPending);
    if (!this.paused && this.state !== 'title') this.update(dt);
    else if (this.state === 'title') this.updateTitle(dt);
    this.render();
  }

  updateTitle(dt) {
    this.time += dt;
    // an idle koi drifts across the title scroll
    const k = this.koi, W = this.LW, t = this.time;
    k.x = this.camX + W * 0.5 + Math.cos(t * 0.45) * W * 0.28;
    k.y = 330 + Math.sin(t * 0.9) * 46;
    const dx = -Math.sin(t * 0.45) * 0.45 * W * 0.28, dy = Math.cos(t * 0.9) * 0.9 * 46;
    k.vx = dx; k.vy = dy;
    k.heading = angleLerp(k.heading, Math.atan2(dy, dx), Math.min(1, dt * 6));
    k.phase += dt * 5; k.computeSpine();
    this.spawnSeasonParticles(dt);
    this.updateParticles(dt);
  }

  update(dt) {
    if (this.state === 'over') this.overT = (this.overT || 0) + dt;
    this.time += dt; this.elapsed += dt;
    const koi = this.koi, W = this.LW;
    // guide stroke
    const g = this.guide;
    if (g && g.t < g.dur) {
      const t0 = g.t; g.t += dt;
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const u = Math.min(1, (t0 + (g.t - t0) * i / steps) / g.dur);
        const x = lerp(g.from.x, g.to.x, u), y = lerp(g.from.y, g.to.y, u) + Math.sin(u * Math.PI) * -38;
        g.stroke.add(x, y, 11.5 - u * 3, 0);
      }
      if (g.t >= g.dur) { g.stroke.finish(); this.guide = null; }
    }
    // strokes
    for (const s of this.strokes) s.update(dt);
    this.strokes = this.strokes.filter(s => !s.dead);
    // world
    this.world.ensure(this.camX, this.camX + W + 900);
    this.world.depositClouds(this.field);
    this.world.prune(this.camX - 600);
    for (const pf of this.purifies) {
      pf.t += dt;
      this.field.wash(pf.x, pf.y, PICKUP.PURIFY_R * easeOut(pf.t / PICKUP.PURIFY_T), 1 - Math.pow(0.7, dt * 60));
    }
    this.purifies = this.purifies.filter(pf => pf.t < PICKUP.PURIFY_T + 0.5);
    this.field.step(dt);
    if (this.state === 'play') {
      const events = {
        attach: (x, y, impact) => { const k = clamp(impact / 600, 0.15, 1); this.splash(x, y, 4 + k * 8, 'rgba(28,30,42,'); this.ripples.push({ x, y, r: 4, life: 0.6 }); Audio.splash(0.12 + k * 0.3, 0.9 + k * 0.4); },
        mud: (x, y, d) => { if (Math.random() < 0.25) this.splash(x, y, 2, 'rgba(28,30,42,'); },
      };
      koi.update(dt, this.strokes, this.field, events);
      // the deep pool
      if (koi.y > LH - 46) {
        koi.vitality -= 1.7 * dt; koi.mud = Math.min(1, koi.mud + dt * 3);
        if (koi.rail) koi.detach();
        koi.vy = Math.min(koi.vy, 30); koi.y = Math.min(koi.y, LH - 26);
      }
      // tide
      const grace = Math.max(0, 9 - this.elapsed) * 24;
      this.world.updateTide(dt, this.camX - grace, koi.x);
      // pickups
      for (const p of this.world.pearls) {
        if (p.taken) continue;
        if (dist(p.x, p.y, koi.x, koi.y) < 19) {
          p.taken = true; this.pearls++; this.ink = Math.min(1, this.ink + 0.3); this.dry = false;
          this.comboT = 1.6; this.combo = Math.min(10, this.combo + 1);
          Audio.pluck(2 + this.combo, 0.45);
          // 乘势: each pearl is a push, and a run of them is a slingshot
          koi.surge(PICKUP.SURGE + PICKUP.SURGE_PER_COMBO * this.combo);
          this.streak(koi, 5 + this.combo);
          this.burst(p.x, p.y, 'rgba(60,64,84,', 8); this.ripples.push({ x: p.x, y: p.y, r: 3, life: 0.5 });
          this.floaters.push({ x: p.x, y: p.y, text: '墨', en: this.combo > 1 ? 'surge' : 'ink', life: 1, col: 'rgba(40,42,56,' });
        }
      }
      for (const l of this.world.lotus) {
        if (l.taken) continue;
        if (dist(l.x, l.y, koi.x, koi.y) < 24) {
          l.taken = true; this.lotusN++; koi.vitality = 1; koi.mud = 0; this.water = Math.min(1, this.water + 0.5); this.ink = Math.min(1, this.ink + 0.2);
          Audio.chord(5, 0.4);
          // 出淤泥而不染: clear water spreads from the lotus, and the ink tide ebbs
          this.purifies.push({ x: l.x, y: l.y, t: 0 });
          this.world.ebbTide(PICKUP.EBB, PICKUP.EBB_HOLD);
          this.burst(l.x, l.y, 'rgba(212,82,96,', 14); this.ripples.push({ x: l.x, y: l.y, r: 6, life: 0.8 });
          this.floaters.push({ x: l.x, y: l.y - 30, text: '莲净 · 潮退', en: 'purified · the tide ebbs', life: 1.8, col: 'rgba(190,60,80,' });
        }
      }
      this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
      // hooks
      for (const h of this.world.hooks) {
        h.cool = Math.max(0, (h.cool || 0) - dt);
        const tip = this.world.hookTip(h, this.time);
        if (h.cool <= 0 && dist(tip.x + 4, tip.y + 8, koi.x, koi.y) < 15) {
          h.cool = 2; koi.vitality -= 0.45; koi.mud = Math.min(1, koi.mud + 0.5);
          if (koi.rail) koi.detach();
          koi.vy = -260; koi.vx = -80; this.shake = 0.35;
          this.burst(koi.x, koi.y, 'rgba(28,30,42,', 12); Audio.splash(0.5, 0.7); Audio.pluck(0, 0.5);
          if (koi.vitality <= 0) this.die('hook');
        }
      }
      // wake
      if (koi.speed() > 180 && Math.random() < 0.5) {
        const t = koi.spine[koi.spine.length - 1];
        this.particles.push({ x: t.x, y: t.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.7, r: 1 + Math.random() * 1.5, col: 'rgba(40,44,60,', g: 0 });
      }
      // deaths
      if (koi.vitality <= 0 && this.state === 'play') this.die(koi.y > LH - 46 ? 'pool' : 'ink');
      if (koi.x < this.world.tideX + 6 && this.state === 'play') this.die('tide');
      // resources
      this.ink = Math.min(1, this.ink + 0.08 * dt);
      if (this.dry && this.ink > 0.1) this.dry = false;
      this.water = Math.min(1, this.water + 0.09 * dt);
      this.distance = Math.max(this.distance, koi.x - 150);
      // season
      const si = this.scenery.seasonIndex(koi.x);
      if (si !== this.seasonIdx) { this.seasonIdx = si; this.seasonFlash = 4; Audio.chord(3 + si, 0.3); }
      this.seasonFlash = Math.max(0, this.seasonFlash - dt);
      // hints
      if (!this.drewOnce) this.hintT += dt;
      if (!this.waterHintShown && this.field.sample(koi.x + 260, koi.y) > 0.2 && this.elapsed > 6) { this.waterHintShown = true; this.waterHintT = 5; }
      this.waterHintT = Math.max(0, this.waterHintT - dt);
    } else if (this.state === 'dying') {
      this.dyingT += dt; koi.dying = Math.min(1, this.dyingT / 1.6);
      koi.phase += dt * 3; koi.computeSpine();
      this.field.deposit(koi.x + (Math.random() - 0.5) * 20, koi.y + (Math.random() - 0.5) * 20, 26, 1.4 * dt);
      if (Math.random() < 0.6) this.splash(koi.x, koi.y, 3, 'rgba(28,30,42,');
      if (this.dyingT > 2.0) this.gameOver();
    }
    // camera
    const target = koi.x - W * 0.38;
    const cam = this.camX + (target - this.camX) * Math.min(1, dt * 4);
    this.camX = Math.max(this.camX, cam, 0);
    this.field.shiftTo(this.camX - 150);
    // brush sound
    Audio.brush(this.pointer.down ? (this.scratch || 0) : 0);
    this.scratch = (this.scratch || 0) * Math.max(0, 1 - dt * 12);
    this.flashDry = Math.max(0, (this.flashDry || 0) - dt); this.flashWater = Math.max(0, (this.flashWater || 0) - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.spawnSeasonParticles(dt);
    this.updateParticles(dt);
  }

  die(reason) {
    this.state = 'dying'; this.deathReason = reason; this.dyingT = 0;
    if (this.koi.rail) this.koi.detach();
    this.koi.vx *= 0.2; this.koi.vy = 0;
    if (this.cur) this.endStroke();
    this.pointer.down = false;
    Audio.dissolve();
    this.shake = 0.5;
  }

  gameOver() {
    this.state = 'over';
    const sc = this.score();
    // re-read the stored best: if the portal SDK came up late, the account's record may beat the one read at boot
    this.best = Math.max(this.best, +(Platform.storage.get('moli.best') || 0));
    const newBest = this.best > 0 && sc > this.best;
    this.overT = 0;
    if (newBest) Platform.happytime();
    if (sc > this.best) { this.best = sc; Platform.storage.set('moli.best', String(sc)); }
    const r = REASONS[this.deathReason] || REASONS.ink;
    document.getElementById('over-reason').textContent = r[0];
    document.getElementById('over-reason-en').textContent = r[1];
    document.getElementById('over-seal').textContent = r[2];
    document.getElementById('over-tip').textContent = r[3];
    document.getElementById('over-tip-en').textContent = r[4];
    document.getElementById('over-newbest').classList.toggle('on', newBest);
    document.getElementById('over-score').textContent = sc;
    document.getElementById('over-dist').textContent = Math.floor(this.distance / 10);
    document.getElementById('over-pearls').textContent = this.pearls;
    document.getElementById('over-lotus').textContent = this.lotusN;
    document.getElementById('over-best').textContent = this.best;
    document.getElementById('over').classList.remove('hidden');
  }

  // ---------- particles ----------
  splash(x, y, n, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 40 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.5, r: 1 + Math.random() * 2.6, col, g: 500 });
    }
  }
  // ink flung back off the koi's tail as it surges
  streak(koi, n) {
    const hx = Math.cos(koi.heading), hy = Math.sin(koi.heading);
    for (let i = 0; i < n; i++) {
      const v = 120 + Math.random() * 200, side = (Math.random() - 0.5) * 70;
      this.particles.push({ x: koi.x - hx * 10, y: koi.y - hy * 10, vx: -hx * v - hy * side, vy: -hy * v + hx * side, life: 0.35 + Math.random() * 0.3, r: 1 + Math.random() * 1.8, col: 'rgba(40,44,60,', g: 40 });
    }
  }

  burst(x, y, col, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 60 + Math.random() * 120;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, r: 1.5 + Math.random() * 2, col, g: 120 });
    }
  }
  spawnSeasonParticles(dt) {
    const s = this.seasonIdx;
    const rate = [5, 22, 5, 14][s];
    if (Math.random() < rate * dt) {
      const W = this.LW;
      const kind = SEASONS[s].particle;
      this.ambient.push({
        kind, x: Math.random() * (W + 200) - 100, y: -20, life: 1,
        vx: kind === 'rain' ? -90 : kind === 'snow' ? -20 : -35 - Math.random() * 30,
        vy: kind === 'rain' ? 520 : kind === 'snow' ? 40 + Math.random() * 30 : 45 + Math.random() * 40,
        r: kind === 'rain' ? 1 : 2 + Math.random() * 3, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 3, ph: Math.random() * TAU,
      });
    }
    for (const p of this.ambient) {
      p.x += p.vx * dt + (p.kind === 'rain' ? 0 : Math.sin(this.time * 1.5 + p.ph) * 25 * dt);
      p.y += p.vy * dt; p.rot += p.spin * dt;
      if (p.y > LH + 30) p.life = 0;
    }
    this.ambient = this.ambient.filter(p => p.life > 0);
  }
  updateParticles(dt) {
    for (const p of this.particles) { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.ripples) { r.r += 60 * dt; r.life -= dt; }
    this.ripples = this.ripples.filter(r => r.life > 0);
    for (const f of this.floaters) { f.y -= 28 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter(f => f.life > 0);
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, W = this.LW, H = LH, cam = this.camX, t = this.time;
    ctx.save();
    if (this.shake > 0) { const k = this.shake * 6; ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k); }
    this.scenery.drawBackground(ctx, cam, W, H, t);
    this.field.render(ctx, cam, t);
    // strokes
    for (const s of this.strokes) s.draw(ctx, cam, this.liveSurf);
    this.world.drawPickups(ctx, cam, W, t);
    this.world.drawHooks(ctx, cam, W, t);
    // ripples
    ctx.save(); ctx.translate(-cam, 0);
    for (const r of this.ripples) { ctx.strokeStyle = `rgba(40,44,60,${r.life * 0.5})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.55, 0, 0, TAU); ctx.stroke(); }
    for (const pf of this.purifies) {
      const k = clamp(pf.t / PICKUP.PURIFY_T, 0, 1), r = PICKUP.PURIFY_R * easeOut(k);
      const a = 1 - smoothstep(0.55, 1, pf.t / (PICKUP.PURIFY_T + 0.5));
      // a wet, pale wash with a brighter rim, and a second ring trailing behind it
      const g = ctx.createRadialGradient(pf.x, pf.y, r * 0.55, pf.x, pf.y, r);
      g.addColorStop(0, 'rgba(150,182,196,0)'); g.addColorStop(0.85, `rgba(150,182,196,${0.2 * a})`); g.addColorStop(1, 'rgba(150,182,196,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pf.x, pf.y, r, 0, TAU); ctx.fill();
      // rims wobble like water creeping across paper, not compass circles
      const rim = (rr, seed) => {
        ctx.beginPath();
        for (let i = 0; i <= 48; i++) {
          const ang = i / 48 * TAU, c = Math.cos(ang), sn = Math.sin(ang);
          const q = rr * (1 + (fbm(c * 1.3 + seed, sn * 1.3 + pf.t * 0.8, 2, 3) - 0.5) * 0.12);
          if (i) ctx.lineTo(pf.x + c * q, pf.y + sn * q); else ctx.moveTo(pf.x + c * q, pf.y + sn * q);
        }
        ctx.closePath(); ctx.stroke();
      };
      ctx.strokeStyle = `rgba(86,120,140,${0.5 * a})`; ctx.lineWidth = 1.6; rim(r * 0.97, 3);
      ctx.strokeStyle = `rgba(200,70,90,${0.35 * a})`; ctx.lineWidth = 1; rim(r * 0.7, 11);
    }
    ctx.restore();
    this.koi.draw(ctx, cam);
    // particles
    ctx.save(); ctx.translate(-cam, 0);
    for (const p of this.particles) { ctx.fillStyle = p.col + Math.min(1, p.life * 1.6) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
    for (const f of this.floaters) {
      ctx.font = `22px ${FONT_BRUSH}`; ctx.fillStyle = f.col + Math.min(1, f.life) + ')'; ctx.textAlign = 'center'; ctx.fillText(f.text, f.x, f.y);
      if (f.en) { ctx.font = `600 14px ${FONT_TEXT}`; ctx.fillText(f.en, f.x, f.y + 17); }
    }
    ctx.restore();
    this.world.drawTide(ctx, cam, W, H, t);
    this.drawAmbient(ctx);
    ctx.restore();
    // vignette when hurt
    const hurt = 1 - clamp(this.koi.vitality, 0, 1);
    if (hurt > 0.02 && this.state !== 'title') {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
      vg.addColorStop(0, 'rgba(20,20,30,0)'); vg.addColorStop(1, `rgba(20,20,30,${hurt * 0.75})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
    if (this.state === 'title') { this.drawInscription(ctx, W, H, 0.6); return; }
    const hudA = this.state === 'over' ? clamp(1 - (this.overT || 0) / 0.45, 0, 1) : 1; // fades as the game-over card fades in
    if (hudA > 0) { ctx.save(); ctx.globalAlpha = hudA; this.drawHUD(ctx, W, H); ctx.restore(); }
    this.drawInscription(ctx, W, H, 1);
    this.drawHints(ctx, W, H);
    this.drawCursor(ctx);
    if (this.paused) {
      ctx.fillStyle = 'rgba(241,234,219,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(30,30,40,0.9)'; ctx.font = `64px ${FONT_BRUSH}`; ctx.textAlign = 'center'; ctx.fillText('小憩', W / 2, H / 2);
      ctx.font = `600 26px ${FONT_TEXT}`; ctx.fillText('Paused', W / 2, H / 2 + 44);
      ctx.font = `18px ${FONT_TEXT}`; ctx.fillText('点击继续 · click to resume', W / 2, H / 2 + 74);
    }
  }

  drawAmbient(ctx) {
    for (const p of this.ambient) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      switch (p.kind) {
        case 'petal': ctx.fillStyle = 'rgba(214,88,110,0.55)'; ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.8, 0, 0, TAU); ctx.fill(); break;
        case 'leaf': ctx.fillStyle = 'rgba(200,84,30,0.55)'; ctx.beginPath(); ctx.moveTo(-p.r * 1.6, 0); ctx.quadraticCurveTo(0, -p.r, p.r * 1.6, 0); ctx.quadraticCurveTo(0, p.r, -p.r * 1.6, 0); ctx.fill(); break;
        case 'snow': ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, TAU); ctx.fill(); break;
        case 'rain': ctx.strokeStyle = 'rgba(70,76,96,0.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3, -22); ctx.stroke(); break;
      }
      ctx.restore();
    }
  }

  drawHUD(ctx, W, H) {
    // inkstone (ink gauge)
    const ix = 62, iy = 58;
    ctx.save();
    ctx.fillStyle = 'rgba(30,30,38,0.15)'; ctx.beginPath(); ctx.ellipse(ix + 3, iy + 5, 44, 28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(62,60,66,0.95)'; ctx.beginPath(); ctx.ellipse(ix, iy, 42, 26, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = this.flashDry > 0 ? `rgba(200,60,50,${this.flashDry})` : 'rgba(20,20,26,0.8)'; ctx.lineWidth = this.flashDry > 0 ? 3 : 1.5; ctx.stroke();
    const lvl = clamp(this.ink, 0, 1);
    const g = ctx.createRadialGradient(ix - 8, iy - 6, 2, ix, iy, 34 * Math.max(0.12, lvl));
    g.addColorStop(0, 'rgba(60,64,80,1)'); g.addColorStop(1, 'rgba(10,10,16,1)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, 34 * Math.max(0.12, lvl), 20 * Math.max(0.12, lvl), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,236,224,0.6)'; ctx.beginPath(); ctx.ellipse(ix - 10 * lvl, iy - 7 * lvl, 5 * lvl + 1, 2.5 * lvl + 0.5, -0.4, 0, TAU); ctx.fill();
    this.label(ctx, '墨', 'Ink', ix - 6, iy + 54);
    // water bowl
    const wx = 150, wy = 58;
    ctx.strokeStyle = this.flashWater > 0 ? `rgba(200,60,50,${this.flashWater})` : 'rgba(30,30,40,0.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(wx, wy + 4, 30, 24, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(241,234,219,0.5)'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.ellipse(wx, wy + 4, 29, 23, 0, 0, TAU); ctx.clip();
    const wl = wy + 28 - 48 * clamp(this.water, 0, 1);
    ctx.fillStyle = 'rgba(110,130,160,0.45)'; ctx.beginPath(); ctx.moveTo(wx - 40, wl);
    for (let x = -40; x <= 40; x += 8) ctx.lineTo(wx + x, wl + Math.sin(x * 0.2 + this.time * 3) * 1.5);
    ctx.lineTo(wx + 40, wy + 40); ctx.lineTo(wx - 40, wy + 40); ctx.closePath(); ctx.fill();
    ctx.restore();
    this.label(ctx, '水', 'Water', wx + 16, wy + 54);
    if (this.isWater()) { ctx.strokeStyle = 'rgba(110,130,160,0.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(wx, wy + 4, 33, 27, 0, 0, TAU); ctx.stroke(); }
    // vitality: a vermilion line
    const v = clamp(this.koi.vitality, 0, 1);
    ctx.strokeStyle = 'rgba(30,30,40,0.25)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(24, 128); ctx.lineTo(180, 128); ctx.stroke();
    ctx.strokeStyle = `rgba(${lerp(60, 214, v)},${lerp(60, 78, v)},${lerp(70, 40, v)},0.9)`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(24, 128); ctx.lineTo(24 + 156 * v, 128); ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,40,0.92)'; ctx.font = `20px ${FONT_BRUSH}`; ctx.textAlign = 'left'; ctx.fillText('神', 188, 135);
    ctx.font = `600 17px ${FONT_TEXT}`; ctx.fillText('Spirit', 212, 134);
    // score
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(30,30,40,0.9)'; ctx.font = `44px ${FONT_BRUSH}`;
    ctx.fillText(String(this.score()), W - 110, 62);
    // labelled rows: brush glyphs, then the English, then the value
    const row = (zh, en, val, y) => {
      ctx.fillStyle = 'rgba(30,30,40,0.92)';
      const valFont = `600 17px ${FONT_TEXT}`, enFont = `600 16px ${FONT_TEXT}`;
      const ex = val ? W - 120 - this.textW(ctx, valFont, val) : W - 110;
      ctx.font = valFont; ctx.fillText(val, W - 110, y);
      ctx.fillStyle = 'rgba(30,30,40,0.8)';
      ctx.font = enFont; ctx.fillText(en, ex, y);
      ctx.font = `19px ${FONT_BRUSH}`; ctx.fillText(zh, ex - 6 - this.textW(ctx, enFont, en), y + 1);
    };
    row('得分', 'Score', '', 84);
    row('行', 'Distance', `${Math.floor(this.distance / 10)} 丈`, 110);
    row('墨珠', 'Pearls', String(this.pearls), 132);
    if (this.best > 0) row('最远', 'Best', String(this.best), 154);
    if (this.combo > 1) {
      ctx.fillStyle = `rgba(200,60,50,${clamp(this.comboT, 0, 1)})`;
      const comboFont = `600 18px ${FONT_TEXT}`, cw = this.textW(ctx, comboFont, `Combo ×${this.combo}`);
      ctx.font = comboFont; ctx.fillText(`Combo ×${this.combo}`, W - 110, 183);
      ctx.font = `24px ${FONT_BRUSH}`; ctx.fillText('连珠', W - 118 - cw, 184);
    }
    ctx.restore();
  }

  // a HUD label: brush glyph with its English beside it, centred as a pair on x
  label(ctx, zh, en, x, y) {
    const enFont = `600 17px ${FONT_TEXT}`, zhFont = `22px ${FONT_BRUSH}`;
    const ew = this.textW(ctx, enFont, en), zw = this.textW(ctx, zhFont, zh);
    const x0 = x - (zw + 6 + ew) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(30,30,40,0.92)'; ctx.textAlign = 'left';
    ctx.font = zhFont; ctx.fillText(zh, x0, y);
    ctx.font = enFont; ctx.fillText(en, x0 + zw + 6, y - 1);
    ctx.restore();
  }

  // measured text width, remembered: HUD labels are the same strings every frame
  textW(ctx, font, text) {
    const key = font + '|' + text, memo = this.textWidths || (this.textWidths = new Map());
    let w = memo.get(key);
    if (w === undefined) { if (memo.size > 300) memo.clear(); ctx.font = font; w = ctx.measureText(text).width; memo.set(key, w); }
    return w;
  }

  // centred text that never runs off a narrow canvas: shrinks to fit the width
  fitText(ctx, text, px, font, y, W, weight = '', max = W - 48) {
    const w = this.textW(ctx, `${weight}${px}px ${font}`, text);
    ctx.font = `${weight}${w > max ? Math.floor(px * max / w) : px}px ${font}`;
    ctx.fillText(text, W / 2, y);
  }

  drawInscription(ctx, W, H, alpha) {
    // 题款: season poem written vertically, with a red seal
    const si = this.state === 'title' ? 0 : this.seasonIdx;
    const x = W - 46, y0 = 150;
    ctx.save();
    ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.min(1, this.seasonFlash));
    ctx.fillStyle = 'rgba(30,30,40,0.85)'; ctx.font = `30px ${FONT_BRUSH}`; ctx.textAlign = 'center';
    const poem = POEMS[si];
    for (let i = 0; i < poem.length; i++) ctx.fillText(poem[i], x, y0 + i * 36);
    ctx.font = `16px ${FONT_BRUSH}`;
    const sub = '墨鲤';
    for (let i = 0; i < sub.length; i++) ctx.fillText(sub[i], x, y0 + poem.length * 36 + 12 + i * 20);
    ctx.save(); ctx.translate(x - 36, y0 - 22); ctx.rotate(Math.PI / 2);
    ctx.font = `14px ${FONT_TEXT}`; ctx.textAlign = 'left'; ctx.fillText(POEMS_EN[si], 0, 0);
    ctx.restore();
    ctx.textAlign = 'center';
    // seal
    const sy = y0 + poem.length * 36 + 12 + sub.length * 20 + 8;
    ctx.fillStyle = 'rgba(190,50,40,0.85)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 13, sy, 26, 26, 3) : ctx.rect(x - 13, sy, 26, 26); ctx.fill();
    ctx.fillStyle = 'rgba(241,234,219,0.95)'; ctx.font = `11px ${FONT_BRUSH}`;
    ctx.fillText('鲤', x - 5, sy + 12); ctx.fillText('墨', x + 6, sy + 12); ctx.fillText('印', x - 5, sy + 23); ctx.fillText('之', x + 6, sy + 23);
    ctx.restore();
    // season banner
    if (this.seasonFlash > 0 && this.state !== 'title') {
      const a = Math.min(1, this.seasonFlash) * smoothstep(4, 3.4, this.seasonFlash);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(30,30,40,0.9)'; ctx.font = `72px ${FONT_BRUSH}`; ctx.textAlign = 'center';
      ctx.fillText(SEASONS[si].name, W / 2, H * 0.4);
      ctx.font = `600 34px ${FONT_TEXT}`; ctx.fillText(SEASONS[si].en, W / 2, H * 0.4 + 48);
      this.fitText(ctx, POEMS[si] + ' · ' + POEMS_EN[si], 20, FONT_TEXT, H * 0.4 + 82, W, '', W - 210); // centred, so clear of the inscription column on both sides
      ctx.restore();
    }
  }

  drawHints(ctx, W, H) {
    ctx.save(); ctx.textAlign = 'center';
    if (!this.drewOnce && this.state === 'play') {
      const a = 0.6 + 0.4 * Math.sin(this.time * 3);
      ctx.fillStyle = `rgba(30,30,40,${a})`;
      this.fitText(ctx, '画一笔，锦鲤便顺着墨流而去', 26, FONT_BRUSH, H * 0.22, W);
      this.fitText(ctx, 'Draw a stroke. The koi rides your ink as a current.', 21, FONT_TEXT, H * 0.22 + 34, W, '600 ');
    }
    if (this.waterHintT > 0) {
      const a = Math.min(1, this.waterHintT);
      ctx.fillStyle = `rgba(30,30,40,${a})`;
      this.fitText(ctx, '浓墨伤鱼 · 按住 Shift 以清水化开', 24, FONT_BRUSH, H * 0.22, W);
      const hurt = 'Thick ink hurts the koi.', wash = 'Hold Shift, right-drag, or tap 水 to wash it away.';
      if (this.textW(ctx, `600 20px ${FONT_TEXT}`, hurt + ' ' + wash) <= W - 48) this.fitText(ctx, hurt + ' ' + wash, 20, FONT_TEXT, H * 0.22 + 32, W, '600 ');
      else { this.fitText(ctx, hurt, 20, FONT_TEXT, H * 0.22 + 32, W, '600 '); this.fitText(ctx, wash, 20, FONT_TEXT, H * 0.22 + 58, W, '600 '); }
    }
    ctx.restore();
  }

  drawCursor(ctx) {
    if (this.pointer.type !== 'mouse' || !this.pointer.inside) return;
    const { x, y } = this.pointer;
    ctx.save();
    if (this.isWater()) {
      ctx.strokeStyle = 'rgba(110,130,160,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(110,130,160,0.5)'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + 5, y + 2, x, y + 5); ctx.quadraticCurveTo(x - 5, y + 2, x, y - 6); ctx.fill();
    } else {
      const r = this.brushW * 0.5 + 2;
      ctx.strokeStyle = this.dry ? 'rgba(200,60,50,0.9)' : 'rgba(30,30,40,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(30,30,40,${0.3 + this.ink * 0.6})`; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}

// the 音 / Sound button shows silence from either source: the player's own toggle, or the portal's mute setting
function syncMuteButton() {
  const b = document.getElementById('btn-mute'), site = Platform.muted(), off = site || Audio.isMuted();
  b.querySelector('.glyph').textContent = off ? '默' : '音';
  b.querySelector('.en').textContent = off ? 'Muted' : 'Sound';
  b.classList.toggle('site-muted', site);
  b.title = site ? '已由网站静音 · Muted by the site' : '音 Sound (M)';
}

window.addEventListener('load', async () => {
  // fonts and the portal SDK load side by side; neither may hold the game up for long
  const faces = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('30px "Ma Shan Zheng"'), document.fonts.load('16px "Noto Serif SC"')]).catch(() => {})
    : Promise.resolve();
  const fonts = Promise.race([faces, new Promise(r => setTimeout(r, 2500))]); // blocked or slow: fallback faces
  await Platform.init();
  Platform.loadingStart();
  const applyMute = m => { Audio.setDucked(m); syncMuteButton(); };
  applyMute(Platform.muted());
  Platform.onMuteChange(applyMute);
  await fonts;
  try { window.game = new Game(document.getElementById('game')); }
  finally { Platform.loadingStop(); }
});
