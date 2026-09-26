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
// 流势 flow: riding, leaping and threading targets builds a score multiplier; a long fall breaks it
const FLOW = {
  MAX: 5, RIDE: 0.07, PEARL: 0.06, RING: 0.3, LEAP: 0.22, CLOSE: 0.2, CATCH: 0.05,
  FALL: 1.0,        // seconds of sinking before the flow breaks by a level
  LEAP_AIR: 0.4,    // airborne at least this long, and rising at some point, to count as a leap
};
const SCORE = { PEARL: 10, LOTUS: 50, RING: 30, GATE: 300, CLOSE: 25, LEAP: 15 };
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const HUD_INK = { x: 62, y: 58 };
// Two stacked canvases: the soft landscape (paper, sky, mountains, the ink field) at a modest resolution behind,
// the crisp things (strokes, koi, HUD) at full resolution in front. Resolution steps down on devices that can't
// hold ~48 fps: fg and bg are fractions of the device pixel ratio (the background never goes above 1x).
const QUALITY = [{ fg: 1, bg: 1 }, { fg: 0.8, bg: 0.85 }, { fg: 0.66, bg: 0.7 }, { fg: 0.55, bg: 0.6 }];
// Each visit starts one step above the last saved level, so a device that was only briefly slow (thermal, power mode) recovers.
const loadQuality = () => { try { return clamp((+localStorage.getItem('moli.quality') || 0) - 1, 0, QUALITY.length - 1); } catch (e) { return 0; } };

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bgCanvas = document.getElementById('bg');
    this.bctx = this.bgCanvas.getContext('2d', { alpha: false });
    this.q = loadQuality(); this.frameLog = []; this.qCool = 4;
    this.seed = (Math.random() * 1e9) | 0;
    this.scenery = new Scenery(this.seed);
    this.state = 'title';
    this.time = 0; this.last = performance.now();
    this.pointer = { x: 0, y: 0, down: false, type: 'mouse', sx: 0, sy: 0, ts: 0, inside: false };
    this.tip = { x: 0, y: 0 }; this.pSpeed = 0;
    this.waterHold = false; this.waterToggle = false;
    this.paused = false;
    this.best = Progress.data.bestScore;
    this.particles = []; this.ripples = []; this.ambient = [];
    this.floaters = [];
    this.purifies = []; // expanding rings of clear water from a lotus
    this.flyers = [];   // pearls flying home to the inkstone
    this.stamps = [];   // daily goals met, stamped on screen
    this.brushW = 8;
    this.resize();
    this.scenery.makePaper(this.bctx); // the paper is only ever painted on the background layer
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
    const Q = QUALITY[this.q], dev = window.devicePixelRatio || 1;
    const dpr = Math.max(0.75, Math.min(2, dev) * Q.fg), bdpr = Math.max(0.5, Math.min(1, dev) * Q.bg);
    // a hidden or zero-size frame reports 0x0; lay out for a nominal size until a real resize arrives
    const W = window.innerWidth || 1280, H = window.innerHeight || 720;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.bgCanvas.width = Math.round(W * bdpr); this.bgCanvas.height = Math.round(H * bdpr);
    this.bgCanvas.style.width = W + 'px'; this.bgCanvas.style.height = H + 'px';
    this.scale = H / LH; this.LW = W / this.scale; this.dpr = dpr;
    this.ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, 0, 0);
    this.bctx.setTransform(bdpr * this.scale, 0, 0, bdpr * this.scale, 0, 0);
    Stroke.RES = Math.min(3, dpr * this.scale);
    if (this.field) this.field.resize(Math.ceil((this.LW + 600) / CELL));
    if (this.scenery.paper) this.scenery.paperPattern = this.bctx.createPattern(this.scenery.paper, 'repeat');
  }

  // Frame-rate governor. If play sits below ~48 fps for a couple of seconds, it tries one resolution step down. A slow
  // frame rate is not always load: a 30 Hz power mode or a throttled frame looks the same. So the step is a trial: it is
  // kept (and saved for this device) only if the next window is clearly faster, otherwise it is undone and the governor
  // stands down for the session. Only gameplay frames count; menus with blurred overlays would mislead it.
  watchFrames(ms) {
    if (this.qDone || document.hidden || this.paused || ms > 120 || this.state !== 'play') return;
    const log = this.frameLog; log.push(ms); if (log.length > 90) log.shift();
    this.qCool -= ms / 1000;
    if (this.qCool > 0 || log.length < 90) return;
    const mean = log.reduce((a, b) => a + b, 0) / log.length;
    const t = this.qTrial;
    if (t) {
      this.qTrial = null;
      if (mean > t.mean * 0.9) { this.q = t.from; this.qDone = true; this.resize(); return; }
      try { localStorage.setItem('moli.quality', String(this.q)); } catch (e) { /* private mode */ }
    }
    if (mean > 1000 / 48 && this.q < QUALITY.length - 1) {
      this.qTrial = { from: this.q, mean };
      this.q++; log.length = 0; this.qCool = 2;
      this.resize();
    }
  }

  // both layers flattened into one image (the cover and video tools capture through this)
  composite(ctx, w, h) { ctx.drawImage(this.bgCanvas, 0, 0, w, h); ctx.drawImage(this.canvas, 0, 0, w, h); }

  reset() {
    this.world = new World(this.seed + ((Math.random() * 1e6) | 0));
    this.world.bestX = Progress.data.bestDist > 0 ? 150 + Progress.data.bestDist * 10 : 0;
    this.field = new InkField(CELL, Math.ceil((this.LW + 600) / CELL), LH / CELL);
    this.koi = new Koi(150, 250, Progress.data.koi);
    this.strokes = [];
    this.cur = null;
    this.ink = 1; this.water = 1; this.dry = false;
    this.camX = 0; this.elapsed = 0;
    this.distance = 0; this.pearls = 0; this.lotusN = 0; this.combo = 0; this.comboT = 0;
    this.points = 0; this.mult = 1; this.flowM = 0; this.fallT = 0; this.flowPop = 0;
    this.run = { dist: 0, pearls: 0, combo: 0, rings: 0, leaps: 0, gates: 0, close: 0, flow: 1, lotus: 0, score: 0, form: 0, growth: 0 };
    this.air = { t: 0, from: null, rose: false }; this.wasOnRail = false;
    this.particles.length = 0; this.ripples.length = 0; this.floaters.length = 0; this.purifies.length = 0;
    this.flyers.length = 0; this.stamps.length = 0; this.trail = [];
    this.deathReason = null; this.dyingT = 0;
    this.seasonIdx = 0; this.seasonFlash = 0;
    this.hintT = 0; this.drewOnce = false; this.waterHintT = 0; this.waterHintShown = false;
    this.shake = 0; this.slowmo = 0; this.inkPulse = 0; this.scorePop = 0; this.banner = null; this.bannerQ = []; this.goalCheckT = 0;
    this.magic = 0; this.flash = 0; this.caption = null; this.dayPart = null; this.celebrated = false;
    // opening stroke: the scroll paints the first current for the koi
    this.guide = { t: 0, dur: 1.1, stroke: new Stroke(), from: { x: 60, y: 330 }, to: { x: 640, y: 372 } };
    this.strokes.push(this.guide.stroke);
    this.field.shiftTo(-150);
  }

  // begin a run. Restarting after a death is a natural break, so that is where the portal may show an ad.
  // The break after a death is where the portal may show an ad, whether the player swims again straight away
  // or goes back to the title first.
  start() {
    if (this.adPending) return;
    if (!this.adBreak) { this.beginRun(); return; }
    const btns = ['btn-again', 'btn-title'].map(id => document.getElementById(id));
    this.adPending = true; btns.forEach(b => b.disabled = true);
    Platform.midgameAd(() => Audio.setDucked(true), () => Audio.setDucked(Platform.muted()))
      .then(() => { this.adPending = false; btns.forEach(b => b.disabled = false); this.beginRun(); });
  }

  // back to the title scroll: pick a koi, check the day's goals
  toTitle() {
    if (this.adPending || this.state !== 'over') return;
    this.reset();
    this.state = 'title'; this.time = 0;
    renderTitleMeta();
    document.getElementById('over').classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    Audio.pluck(3, 0.3);
  }

  beginRun() {
    this.adBreak = false;
    this.reset();
    Progress.beginRun();
    this.state = 'play'; this.paused = false;
    document.getElementById('title').classList.add('hidden');
    document.getElementById('over').classList.add('hidden');
    Audio.init(); Audio.resume();
    Audio.chord(5, 0.35);
  }

  score() { return Math.floor(this.points); }

  runStats() {
    const r = this.run;
    r.dist = Math.floor(this.distance / 10); r.pearls = this.pearls; r.lotus = this.lotusN; r.score = this.score();
    return r;
  }

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
      this.tip.x = p.x; this.tip.y = p.y; this.pSpeed = 0;
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
    // every sample the hardware reported since the last frame, not just the last one: fast strokes stay round
    cv.addEventListener('pointermove', e => {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (evs && evs.length) for (const ev of evs) this.pointerSample(pos(ev), ev.timeStamp, ev.pointerType === 'pen' ? ev.pressure : 0);
      else this.pointerSample(pos(e), e.timeStamp, e.pointerType === 'pen' ? e.pressure : 0);
    });
    const up = e => {
      if (this.cur && this.pointer.down && e && e.clientX !== undefined) {
        // finish exactly where the brush lifted
        const p = pos(e); this.extendStroke(p.x + this.camX, p.y, this.pSpeed, dist(p.x, p.y, this.tip.x, this.tip.y), 0);
      }
      this.pointer.down = false; this.pointer.button = 0; if (this.cur) this.endStroke();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => up(null));
    cv.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    window.addEventListener('keydown', e => {
      if (e.key === 'Shift' || e.key === ' ') { if (!this.waterHold) { this.waterHold = true; if (this.cur) this.endStroke(); } e.preventDefault(); }
      if (e.key === 'm' || e.key === 'M') this.toggleMute();
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { if (this.state === 'play') { this.paused = !this.paused; this.last = performance.now(); } }
      if (e.key === 'Escape' && this.state === 'over') this.toTitle();
      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') { if (this.state === 'over' || this.state === 'title') this.start(); }
    });
    window.addEventListener('keyup', e => { if (e.key === 'Shift' || e.key === ' ') this.waterHold = false; });
    document.getElementById('btn-again').addEventListener('click', () => this.start());
    document.getElementById('btn-title').addEventListener('click', () => this.toTitle());
    document.getElementById('btn-water').addEventListener('click', e => { this.waterToggle = !this.waterToggle; e.currentTarget.classList.toggle('on', this.waterToggle); if (this.cur) this.endStroke(); });
    document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
  }

  pointerSample(p, ts, pressure) {
    this.pointer.inside = true;
    const dt = Math.max(4, ts - this.pointer.ts) / 1000;
    const dl = dist(p.x, p.y, this.pointer.x, this.pointer.y);
    this.pSpeed = lerp(this.pSpeed, dl / dt, 0.3);
    if (this.pointer.down && this.state === 'play' && !this.paused) {
      if (this.isWater()) {
        // the water brush works per frame, not per hardware sample, so a 1000 Hz mouse doesn't wash four times as hard
        if (this.cur) this.endStroke();
        this.waterAcc = (this.waterAcc || 0) + dl;
        if (ts - (this.waterTs || 0) >= 14) { this.applyWater(p.x + this.camX, p.y, this.waterAcc); this.waterAcc = 0; this.waterTs = ts; }
      } else {
        // a light stabiliser: the brush tip trails the pointer a hair, which irons out hand tremor
        const ox = this.tip.x, oy = this.tip.y;
        this.tip.x = lerp(this.tip.x, p.x, 0.6); this.tip.y = lerp(this.tip.y, p.y, 0.6);
        this.extendStroke(this.tip.x + this.camX, this.tip.y, this.pSpeed, dist(ox, oy, this.tip.x, this.tip.y), pressure);
      }
    } else { this.tip.x = p.x; this.tip.y = p.y; }
    this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.ts = ts;
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

  extendStroke(wx, wy, speed, dl, pressure = 0) {
    if (!this.cur) { if (this.ink > 0.05) this.beginStroke(wx, wy); return; }
    let targetW = lerp(BRUSH.WMAX, BRUSH.WMIN, smoothstep(110, 1300, speed));
    // a pen's pressure is the brush's pressure; speed still thins it a little
    if (pressure > 0) targetW = lerp(BRUSH.WMIN, BRUSH.WMAX + 2, Math.pow(pressure, 0.8)) * lerp(1, 0.75, smoothstep(300, 1400, speed));
    this.brushW = lerp(this.brushW, targetW, 0.25);
    const dry = smoothstep(650, 1500, speed);
    const cost = dl * this.brushW * BRUSH.INK_COST;
    if (this.ink < cost) {
      // the brush runs dry mid-stroke: trailing 飞白 then nothing
      const p = this.cur.raw[this.cur.raw.length - 1];
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

  // ---------- flow & scoring ----------
  addFlow(k) {
    if (this.state !== 'play') return;
    if (this.mult >= FLOW.MAX) { this.flowM = Math.min(1, this.flowM + k); return; }
    this.flowM += k / (0.6 + 0.4 * this.mult); // each level takes a little longer than the last
    if (this.flowM >= 1) this.levelUp();
  }

  levelUp() {
    if (this.mult >= FLOW.MAX) return;
    this.mult++; this.flowM = 0.1; this.flowPop = 0.6;
    this.run.flow = Math.max(this.run.flow, this.mult);
    this.koi.glow = Math.max(this.koi.glow, 0.8);
    Audio.arpeggio(3 + this.mult, 3, 0.3, 0.06);
    this.floaters.push({ x: this.koi.x, y: this.koi.y - 34, text: `流势 ×${this.mult}`, en: 'flow rising', life: 1.3, col: 'rgba(184,44,36,', big: true });
  }

  breakFlow() {
    if (this.mult <= this.minMult() && this.flowM <= 0.05) return;
    const lost = this.mult > this.minMult();
    this.mult = Math.max(this.minMult(), this.mult - 1); this.flowM = 0; this.flowPop = -0.5;
    if (lost) this.floaters.push({ x: this.koi.x, y: this.koi.y - 30, text: '流散', en: `flow ×${this.mult}`, life: 1.1, col: 'rgba(70,72,90,' });
  }

  minMult() { return this.koi.form >= 4 ? 2 : 1; }

  award(pts, flat) { const v = flat ? pts : pts * this.mult; this.points += v; if (v >= 10) this.scorePop = 0.3; return Math.round(v); }

  // ---------- update ----------
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000; this.last = now;
    this.watchFrames(dt * 1000);
    if (dt > 0.05) dt = 0.05;
    Platform.setPlaying(this.state === 'play' && !this.paused && !this.adPending);
    // a beat of slow motion on the big moments
    const real = dt;
    if (this.slowmo > 0) { dt *= lerp(1, 0.3, clamp(this.slowmo / 0.3, 0, 1)); this.slowmo -= real; }
    if (!this.paused && this.state !== 'title') this.update(dt);
    else if (this.state === 'title') this.updateTitle(dt);
    Audio.music(this.state === 'play' && !this.paused, clamp((this.mult - 1) / 5 + this.koi.form * 0.1, 0, 1));
    this.render();
  }

  updateTitle(dt) {
    this.time += dt;
    // an idle koi drifts across the title scroll
    const k = this.koi, W = this.LW, t = this.time;
    k.x = this.camX + W * 0.5 + Math.cos(t * 0.45) * W * 0.28;
    k.y = 330 + Math.sin(t * 0.9) * 46;
    const dx = -Math.sin(t * 0.45) * 0.45 * W * 0.28, dy = Math.cos(t * 0.9) * 0.9 * 46;
    k.vx = dx; k.vy = dy; k.time += dt;
    k.heading = angleLerp(k.heading, Math.atan2(dy, dx), Math.min(1, dt * 6));
    k.phase += dt * 5; k.computeSpine(dt);
    this.pushTrail(dt);
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
      this.field.wash(pf.x, pf.y, pf.r * easeOut(pf.t / PICKUP.PURIFY_T), 1 - Math.pow(0.7, dt * 60));
    }
    this.purifies = this.purifies.filter(pf => pf.t < PICKUP.PURIFY_T + 0.5);
    for (const r of this.world.rings) if (r.taken) r.fx += dt;
    this.field.step(dt);
    if (this.state === 'play') {
      const px = koi.x;
      const events = {
        attach: (x, y, impact) => { const k = clamp(impact / 600, 0.15, 1); this.splash(x, y, 4 + k * 8, 'rgba(28,30,42,'); this.ripples.push({ x, y, r: 4, life: 0.6 }); Audio.splash(0.12 + k * 0.3, 0.9 + k * 0.4); },
        mud: (x, y, d) => { if (Math.random() < 0.25) this.splash(x, y, 2, 'rgba(28,30,42,'); },
      };
      koi.update(dt, this.strokes, this.field, events);
      this.updateAir(dt);
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
        if (koi.form >= 2) {
          // the spirit koi's pull: pearls close in 450 px/s faster than the koi can swim away, at any frame rate
          const d = dist(p.x, p.y, koi.x, koi.y);
          if (d < 100 && d > 0.01) { const step = Math.min(d, (koi.speed() + 450) * dt); p.x += (koi.x - p.x) / d * step; p.y += (koi.y - p.y) / d * step; }
        }
        if (dist(p.x, p.y, koi.x, koi.y) < 20) {
          p.taken = true; this.pearls++; this.ink = Math.min(1, this.ink + 0.3); this.dry = false;
          this.comboT = 1.6; this.combo = Math.min(10, this.combo + 1); this.run.combo = Math.max(this.run.combo, this.combo);
          Audio.pluck(2 + this.combo, 0.45);
          // 乘势: each pearl is a push, and a run of them is a slingshot
          koi.surge(PICKUP.SURGE + PICKUP.SURGE_PER_COMBO * this.combo);
          this.streak(koi, 5 + this.combo);
          this.burst(p.x, p.y, 'rgba(60,64,84,', 8); this.ripples.push({ x: p.x, y: p.y, r: 3, life: 0.5 });
          const v = this.award(SCORE.PEARL); this.addFlow(FLOW.PEARL);
          this.flyers.push({ x: p.x - this.camX, y: p.y, t: 0, d: 0.5 + Math.random() * 0.15 });
          this.floaters.push({ x: p.x, y: p.y, text: this.combo > 1 ? `连珠 ×${this.combo}` : '墨', en: `+${v}`, life: 1, col: 'rgba(40,42,56,' });
        }
      }
      for (const l of this.world.lotus) {
        if (l.taken) continue;
        if (dist(l.x, l.y, koi.x, koi.y) < 26) {
          l.taken = true; this.lotusN++; koi.vitality = 1; koi.mud = 0; this.water = Math.min(1, this.water + 0.5); this.ink = Math.min(1, this.ink + 0.2);
          Audio.chord(5, 0.4); this.award(SCORE.LOTUS, true);
          // 出淤泥而不染: clear water spreads from the lotus, and the ink tide ebbs
          this.purifies.push({ x: l.x, y: l.y, t: 0, r: PICKUP.PURIFY_R });
          this.world.ebbTide(PICKUP.EBB, PICKUP.EBB_HOLD);
          this.burst(l.x, l.y, 'rgba(212,82,96,', 14); this.ripples.push({ x: l.x, y: l.y, r: 6, life: 0.8 });
          this.floaters.push({ x: l.x, y: l.y - 30, text: '莲净 · 潮退', en: 'purified · the tide ebbs', life: 1.8, col: 'rgba(190,60,80,' });
        }
      }
      this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
      this.updateRings(px);
      // hooks: a hit knocks the koi off its current; a near miss is worth a little nerve
      for (const h of this.world.hooks) {
        h.cool = Math.max(0, (h.cool || 0) - dt);
        const tip = this.world.hookTip(h, this.time);
        const d = dist(tip.x + 4, tip.y + 8, koi.x, koi.y);
        if (h.cool <= 0 && d < 15) {
          h.cool = 2; h.hit = true; koi.vitality -= 0.45; koi.mud = Math.min(1, koi.mud + 0.5);
          if (koi.rail) koi.detach();
          koi.vy = -260; koi.vx = -80; this.shake = 0.35;
          this.mult = this.minMult(); this.flowM = 0; this.flowPop = -0.5;
          this.burst(koi.x, koi.y, 'rgba(28,30,42,', 12); Audio.splash(0.5, 0.7); Audio.pluck(0, 0.5);
          if (koi.vitality <= 0) this.die('hook');
        } else if (d < 44) h.near = true;
        if (h.near && !h.hit && !h.scored && koi.x > tip.x + 26) {
          h.scored = true; this.run.close++;
          const v = this.award(SCORE.CLOSE); this.addFlow(FLOW.CLOSE);
          Audio.pluck(9, 0.35); Audio.pluck(7, 0.25, 0.06);
          this.floaters.push({ x: koi.x, y: koi.y - 30, text: '险', en: `close call +${v}`, life: 1.1, col: 'rgba(160,40,32,' });
        }
      }
      // wake, and dry-brush speed lines when the koi is really moving
      const spd = koi.speed();
      if (spd > 180 && Math.random() < 0.5) {
        const t = koi.spine[koi.spine.length - 1];
        this.particles.push({ x: t.x, y: t.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.7, r: 1 + Math.random() * 1.5, col: 'rgba(40,44,60,', g: 0 });
      }
      if (spd > 430 && Math.random() < (spd - 430) / 250) {
        this.particles.push({ kind: 'line', x: koi.x + 80 + Math.random() * 260, y: koi.y + (Math.random() - 0.5) * 150, vx: 0, vy: 0, life: 0.45, max: 0.45, len: 24 + Math.random() * 50, r: 0.6 + Math.random(), col: 'rgba(40,44,60,', g: 0 });
      }
      if (koi.form >= 2 && Math.random() < dt * (10 + koi.form * 6)) {
        const tl = koi.spine[koi.spine.length - 1];
        this.particles.push({ x: tl.x + (Math.random() - 0.5) * 10, y: tl.y + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 20, life: 0.9, r: 0.8 + Math.random() * 1.2, col: 'rgba(236,190,90,', g: -15, kind: 'spark' });
      }
      if (koi.form >= 4 && Math.random() < dt * 9) {
        const tl = koi.spine[8 + (Math.random() * 7 | 0)];
        this.particles.push({ x: tl.x, y: tl.y + 6, vx: -20 - Math.random() * 20, vy: -5, life: 1.2, max: 1.2, r: 6 + Math.random() * 6, col: 'rgba(252,248,238,', g: 0, kind: 'wisp' });
      }
      // flow: riding keeps it building; being in thick ink wears it down
      if (koi.rail) this.addFlow(FLOW.RIDE * dt);
      if (koi.mud > 0.5) this.flowM = Math.max(0, this.flowM - 0.4 * dt);
      // deaths
      if (koi.vitality <= 0 && this.state === 'play') this.die(koi.y > LH - 46 ? 'pool' : 'ink');
      if (koi.x < this.world.tideX + 6 && this.state === 'play') this.die('tide');
      // resources
      this.ink = Math.min(1, this.ink + (koi.form >= 1 ? 0.11 : 0.08) * dt);
      if (this.dry && this.ink > 0.1) this.dry = false;
      this.water = Math.min(1, this.water + 0.09 * dt);
      const d = Math.max(0, koi.x - 150 - this.distance);
      if (d > 0) { this.distance += d; this.points += d / 10 * this.mult; }
      // your record, planted on the scroll
      if (!this.world.bestPassed && this.world.bestX > 400 && koi.x > this.world.bestX) {
        this.world.bestPassed = true; this.shake = 0.25; koi.glow = 1;
        this.celebrate();
        Audio.arpeggio(4, 6, 0.4); this.burst(koi.x, koi.y, 'rgba(184,44,36,', 16);
        this.showBanner({ zh: '破纪录', en: 'Farther than ever before', t: 0, dur: 2.2 });
      }
      // season
      const si = this.scenery.seasonIndex(koi.x);
      if (si !== this.seasonIdx) { this.seasonIdx = si; this.seasonFlash = 4; Audio.chord(3 + si, 0.3); }
      this.seasonFlash = Math.max(0, this.seasonFlash - dt);
      // daily goals, checked a few times a second
      this.goalCheckT -= dt;
      if (this.goalCheckT <= 0) {
        this.goalCheckT = 0.3;
        for (const gl of Progress.check(this.runStats())) {
          const txt = Progress.goalText(gl);
          this.stamps.push({ zh: txt.zh, en: txt.en, t: 0 });
          Audio.arpeggio(5, 4, 0.3, 0.09);
        }
      }
      // hints
      if (!this.drewOnce) this.hintT += dt;
      if (!this.waterHintShown && this.field.sample(koi.x + 260, koi.y) > 0.2 && this.elapsed > 6) { this.waterHintShown = true; this.waterHintT = 5; }
      this.waterHintT = Math.max(0, this.waterHintT - dt);
    } else if (this.state === 'dying') {
      this.dyingT += dt; koi.dying = Math.min(1, this.dyingT / 1.6);
      koi.phase += dt * 3; koi.computeSpine(dt);
      this.field.deposit(koi.x + (Math.random() - 0.5) * 20, koi.y + (Math.random() - 0.5) * 20, 26, 1.4 * dt);
      if (Math.random() < 0.6) this.splash(koi.x, koi.y, 3, 'rgba(28,30,42,');
      if (this.dyingT > 2.0) this.gameOver();
    }
    // camera: leads the koi a little more the faster it swims
    const target = koi.x - W * 0.38 + clamp(koi.vx * 0.15, 0, 90);
    const cam = this.camX + (target - this.camX) * Math.min(1, dt * 3.5);
    this.camX = Math.max(this.camX, cam, 0);
    this.field.shiftTo(this.camX - 150);
    // brush sound
    Audio.brush(this.pointer.down ? (this.scratch || 0) : 0);
    this.scratch = (this.scratch || 0) * Math.max(0, 1 - dt * 12);
    this.flashDry = Math.max(0, (this.flashDry || 0) - dt); this.flashWater = Math.max(0, (this.flashWater || 0) - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.inkPulse = Math.max(0, this.inkPulse - dt); this.scorePop = Math.max(0, this.scorePop - dt);
    this.flowPop = this.flowPop > 0 ? Math.max(0, this.flowPop - dt) : Math.min(0, this.flowPop + dt);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = this.bannerQ.shift() || null; }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    // the world blooms toward the koi's form, and the hour of the day is announced as it turns
    this.magic += (this.koi.form - this.magic) * Math.min(1, dt * 0.6);
    if (this.caption) { this.caption.t += dt; if (this.caption.t > 3.5) this.caption = null; }
    const dl = this.scenery.daylight(this.camX + W * 0.5), part = dl.p > 0.95 || dl.p < 0.3 ? 'dawn' : dl.p > 0.64 ? 'night' : dl.p > 0.53 ? 'dusk' : 'day';
    if (this.state === 'play' && part !== this.dayPart) {
      if (this.dayPart && part !== 'day') this.caption = { dawn: { zh: '晨光破晓', en: 'Dawn breaks' }, dusk: { zh: '日暮', en: 'The sun goes down' }, night: { zh: '夜色渐浓', en: 'Night falls: lanterns are lit' } }[part];
      if (this.caption) this.caption.t = 0;
      this.dayPart = part;
    }
    for (const s of this.stamps) s.t += dt;
    this.stamps = this.stamps.filter(s => s.t < 2.6);
    this.pushTrail(dt);
    this.spawnSeasonParticles(dt);
    this.updateParticles(dt);
  }

  // 鲤跃: leaving one current and landing on another after real air is a leap; a long sink breaks the flow
  updateAir(dt) {
    const koi = this.koi, on = !!koi.rail, a = this.air;
    if (this.wasOnRail && !on) {
      a.t = 0; a.from = koi.lastRail; a.rose = koi.vy < -80;
      if (koi.vy < -170) Audio.whoosh(clamp(-koi.vy / 1600, 0.1, 0.3));
    }
    if (!on) {
      a.t += dt; if (koi.vy < -80) a.rose = true;
      if (koi.vy > 150) { this.fallT += dt; if (this.fallT > FLOW.FALL && this.fallT - dt <= FLOW.FALL) this.breakFlow(); }
    } else this.fallT = 0;
    if (!this.wasOnRail && on && a.from && koi.rail !== a.from) {
      if (a.t >= FLOW.LEAP_AIR && a.rose) {
        this.run.leaps++;
        const v = this.award(SCORE.LEAP + Math.round(a.t * 20)); this.addFlow(FLOW.LEAP);
        Audio.pluck(8, 0.35); Audio.pluck(10, 0.25, 0.08);
        this.floaters.push({ x: koi.x, y: koi.y - 30, text: a.t > 1 ? '鲤跃龙腾' : '鲤跃', en: `leap +${v}`, life: 1.2, col: 'rgba(184,44,36,' });
        this.ripples.push({ x: koi.x, y: koi.y, r: 6, life: 0.8 });
      } else if (a.t > 0.25) this.addFlow(FLOW.CATCH);
      a.from = null;
    }
    this.wasOnRail = on;
  }

  // the portal's celebration cue, kept for a broken record: once a run, whether that is distance mid-run or score at the end
  celebrate() { if (this.celebrated) return; this.celebrated = true; Platform.happytime(); }

  showBanner(b) { if (this.banner) this.bannerQ.push(b); else this.banner = b; }

  // 化: the koi takes its next form, the scroll flares with light, and the world around it blooms
  evolve() {
    const koi = this.koi;
    if (koi.form >= FORMS.length - 1) { this.growDragon(); return; }
    koi.form++; koi.formT = 0; this.run.form = koi.form;
    const f = FORMS[koi.form];
    if (koi.form >= 4) this.mult = Math.max(this.mult, 2);
    this.flash = 0.8; koi.glow = 2.5;
    this.burst(koi.x, koi.y, 'rgba(236,190,90,', 30);
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; this.particles.push({ x: koi.x, y: koi.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 1.1, max: 1.1, r: 8, col: 'rgba(252,246,230,', g: 0, kind: 'wisp' }); }
    for (let i = 0; i < 7; i++) Audio.pluck(4 + i, 0.3 - i * 0.02, 1.0 + i * 0.09);
    if (koi.form >= 4) Audio.gong(0.4);
    this.showBanner({ zh: `化为${f.zh}`, en: `Your koi becomes a ${f.desc || f.en}`, sub: `${f.perkZh} · ${f.perk}`, t: 0, dur: 3, gold: true });
  }

  // 龙身渐长: once a dragon, every gate lengthens it and thickens it, up to DRAGON.MAX_GROWTH
  growDragon() {
    const koi = this.koi;
    if (koi.growth >= DRAGON.MAX_GROWTH) return;
    koi.growth++; koi.formT = 0; this.run.growth = koi.growth;
    this.flash = 0.45; koi.glow = 2;
    this.burst(koi.x, koi.y, 'rgba(236,190,90,', 24);
    for (let i = 0; i < 5; i++) Audio.pluck(6 + i, 0.28, 0.9 + i * 0.08);
    Audio.gong(0.3);
    const full = koi.growth >= DRAGON.MAX_GROWTH;
    this.showBanner({ zh: full ? '龙身已成' : '龙身渐长', en: full ? 'Your dragon is full-grown' : `Your dragon grows longer · ${koi.growth} of ${DRAGON.MAX_GROWTH}`, t: 0, dur: 2.4, gold: true });
  }

  // 化龙之路: the five forms along the top-left, the next gate's distance, and how far along the koi is
  drawAscent(ctx, x0, y) {
    const koi = this.koi, f = koi.form, seen = Math.max(Progress.data.bestForm || 0, f), gap = 38;
    const next = GATE.FIRST + Math.max(0, Math.ceil((koi.x - GATE.FIRST + 1) / GATE.EVERY)) * GATE.EVERY;
    const prog = f >= 4 ? 1 : clamp(1 - (next - koi.x) / GATE.EVERY, 0, 1); // the dragon's growth is shown in the text line
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = x0 + 13 + i * gap, b = a + gap;
      ctx.strokeStyle = 'rgba(30,30,40,0.16)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a + 13, y); ctx.lineTo(b - 13, y); ctx.stroke();
      const fill = i < f ? 1 : i === f ? prog : 0;
      if (fill > 0) { ctx.strokeStyle = 'rgba(196,140,50,0.9)'; ctx.beginPath(); ctx.moveTo(a + 13, y); ctx.lineTo(a + 13 + (gap - 26) * fill, y); ctx.stroke(); }
    }
    for (let i = 0; i < 5; i++) {
      const x = x0 + 13 + i * gap, cur = i === f, done = i <= f;
      const r = cur ? 13 + Math.sin(this.time * 4) * 1 : 11;
      if (cur && f > 0) { const g = ctx.createRadialGradient(x, y, 4, x, y, 26); g.addColorStop(0, 'rgba(255,214,140,0.5)'); g.addColorStop(1, 'rgba(255,214,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - 26, y - 26, 52, 52); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = done ? (i === 0 ? 'rgba(184,44,36,0.92)' : 'rgba(190,134,44,0.95)') : 'rgba(241,234,219,0.7)'; ctx.fill();
      ctx.strokeStyle = done ? 'rgba(120,70,20,0.6)' : 'rgba(30,30,40,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = done ? 'rgba(252,246,232,1)' : 'rgba(30,30,40,0.55)';
      ctx.font = `${cur ? 17 : 15}px ${FONT_BRUSH}`; ctx.textAlign = 'center';
      ctx.fillText(i <= seen ? FORMS[i].short : '?', x, y + 5.5);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(30,30,40,0.88)';
    const toGate = Math.max(0, Math.ceil((next - koi.x) / 10));
    const txt = f < 4 ? `化${nextFormLabel(f)} · next gate ${toGate} 丈`
      : koi.growth < DRAGON.MAX_GROWTH ? `龙身渐长 · grows at the next gate, ${toGate} 丈` : '龙身已成 · Full-grown dragon';
    ctx.font = `600 14px ${FONT_TEXT}`; ctx.fillText(txt, x0, y + 32);
    ctx.restore();
  }

  // an arrow at the right edge while the next gate is still off-screen
  drawGatePointer(ctx, W, H) {
    if (this.state !== 'play') return;
    const g = this.world.rings.find(r => r.gate && !r.taken && !r.missed && r.x > this.koi.x);
    if (!g) return;
    const sx = g.x - this.camX; if (sx < W - 40 || sx > W + 2400) return;
    const y = clamp(g.y, 110, H - 110), x = W - 16, pulse = 0.75 + 0.25 * Math.sin(this.time * 5);
    ctx.save();
    ctx.fillStyle = `rgba(184,44,36,${0.9 * pulse})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 14, y - 10); ctx.lineTo(x - 14, y + 10); ctx.closePath(); ctx.fill();
    const label = `龙门 ${Math.ceil((g.x - this.koi.x) / 10)} 丈`;
    ctx.font = `18px ${FONT_BRUSH}`; const w = this.textW(ctx, `18px ${FONT_BRUSH}`, label);
    ctx.fillStyle = 'rgba(241,234,219,0.85)'; ctx.fillRect(x - 24 - w - 8, y - 14, w + 16, 26);
    ctx.fillStyle = 'rgba(184,44,36,0.95)'; ctx.textAlign = 'right'; ctx.fillText(label, x - 24, y + 6);
    ctx.restore();
  }

  // a quiet line of text when the hour turns
  drawCaption(ctx, W, H) {
    const c = this.caption; if (!c) return;
    const a = smoothstep(0, 0.6, c.t) * (1 - smoothstep(2.6, 3.5, c.t));
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(30,30,40,0.85)';
    ctx.font = `30px ${FONT_BRUSH}`; ctx.fillText(c.zh, W / 2, H * 0.14);
    ctx.font = `600 16px ${FONT_TEXT}`; ctx.fillText(c.en, W / 2, H * 0.14 + 24);
    ctx.restore();
  }

  // ensō rings and dragon gates: counted as the koi crosses their centre line
  updateRings(prevX) {
    const koi = this.koi;
    for (const g of this.world.rings) {
      if (g.taken || g.missed || !(prevX < g.x && koi.x >= g.x)) continue;
      if (Math.abs(koi.y - g.y) > g.r * 0.85) {
        g.missed = true;
        if (g.gate) this.floaters.push({ x: g.x, y: g.y - g.r - 10, text: '错过龙门', en: 'missed the gate', life: 1.6, col: 'rgba(70,72,90,' });
        continue;
      }
      g.taken = true; g.fx = 0;
      if (g.gate) {
        this.run.gates++;
        const v = this.award(SCORE.GATE); this.levelUp();
        this.ink = 1; this.water = 1; koi.vitality = 1; koi.mud = 0; koi.glow = 2;
        this.world.ebbTide(420, 2.5);
        this.purifies.push({ x: g.x, y: g.y, t: 0, r: 340 });
        this.slowmo = 0.3; this.shake = 0.3;
        Audio.gong(0.35); Audio.arpeggio(5, 5, 0.3, 0.1);
        this.burst(g.x, g.y, 'rgba(206,70,40,', 26); this.burst(g.x, g.y, 'rgba(226,170,70,', 14);
        this.ripples.push({ x: g.x, y: g.y, r: g.r, life: 1 });
        this.showBanner({ zh: '鲤跃龙门', en: `Dragon Gate ${g.n}  ·  +${v}`, t: 0, dur: 1.9, red: true });
        this.evolve();
      } else {
        this.run.rings++;
        const v = this.award(SCORE.RING); this.addFlow(FLOW.RING);
        Audio.pluck(7, 0.35); Audio.pluck(9, 0.3, 0.05); Audio.pluck(11, 0.2, 0.1);
        this.burst(g.x, g.y, 'rgba(40,42,56,', 10); this.ripples.push({ x: g.x, y: g.y, r: g.r * 0.6, life: 0.7 });
        this.floaters.push({ x: g.x, y: g.y - g.r - 6, text: '圆', en: `ensō +${v}`, life: 1.1, col: 'rgba(40,42,56,' });
      }
    }
  }

  // a ribbon of wash behind the koi; richer as the flow builds
  pushTrail(dt) {
    const k = this.koi, sp = k.spine; if (!sp.length) return;
    const t = sp[sp.length - 1];
    this.trail.push({ x: t.x, y: t.y, life: 0.55 });
    for (const p of this.trail) p.life -= dt;
    while (this.trail.length && this.trail[0].life <= 0) this.trail.shift();
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
    this.state = 'over'; this.adBreak = true;
    const run = this.runStats(), sc = run.score;
    const res = Progress.endRun(run), P = Progress.data;
    this.best = P.bestScore;
    this.overT = 0;
    if (res.newBest) this.celebrate();
    const r = REASONS[this.deathReason] || REASONS.ink;
    document.getElementById('over-reason').textContent = r[0];
    document.getElementById('over-reason-en').textContent = r[1];
    document.getElementById('over-seal').textContent = r[2];
    document.getElementById('over-tip').textContent = r[3];
    document.getElementById('over-tip-en').textContent = r[4];
    document.getElementById('over-newbest').classList.toggle('on', res.newBest);
    document.getElementById('over-score').textContent = sc;
    document.getElementById('over-dist').textContent = run.dist;
    document.getElementById('over-form').textContent = FORMS[run.form].zh + (run.growth ? ` +${run.growth}` : '');
    document.getElementById('over-form-en').textContent = FORMS[run.form].en + (run.growth ? `, grown ${run.growth}×` : '');
    document.getElementById('over-flow').textContent = '×' + run.flow;
    document.getElementById('over-best').textContent = this.best;
    // the nudge back into the water: how close the record was
    const near = document.getElementById('over-near');
    const gap = res.prevBest - sc;
    if (!res.newBest && res.prevBest > 0 && gap > 0 && gap <= res.prevBest * 0.4) {
      near.innerHTML = `离最高分只差 <b>${gap}</b> <span class="en" lang="en">Only <b>${gap}</b> short of your best</span>`;
      near.hidden = false;
    } else if (!res.newBest && res.prevDist > 0 && run.dist > res.prevDist) {
      near.innerHTML = `游得比以往都远 <span class="en" lang="en">Your farthest swim yet</span>`; near.hidden = false;
    } else near.hidden = true;
    // a short run: keep the advice. A good run: make room for progress instead
    document.querySelector('#over .tip').hidden = P.runs > 3 && run.dist > 250;
    renderGoals(document.getElementById('goals-over'));
    renderStreak(document.getElementById('streak-over'));
    renderUnlock(document.getElementById('over-unlock'), res.newKoi);
    document.getElementById('over').classList.remove('hidden');
    if (res.newKoi.length) setTimeout(() => Audio.arpeggio(3, 7, 0.35, 0.08), 500);
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
    for (const f of this.flyers) { f.t += dt; if (f.t >= f.d && !f.done) { f.done = true; this.inkPulse = 0.3; Audio.drip(0.06); } }
    this.flyers = this.flyers.filter(f => f.t < f.d);
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx, b = this.bctx, W = this.LW, H = LH, cam = this.camX, t = this.time;
    const k = this.shake * 6, sx = this.shake > 0 ? (Math.random() - 0.5) * k : 0, sy = this.shake > 0 ? (Math.random() - 0.5) * k : 0;
    // back layer: everything soft
    b.save(); b.translate(sx, sy);
    this.scenery.drawBackground(b, cam, W, H, t);
    this.scenery.drawDaylight(b, W, H, cam, t);
    this.scenery.drawMagic(b, W, H, cam, t, this.magic);
    this.field.render(b, cam, t);
    b.restore();
    // front layer: cleared, then everything crisp
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); ctx.restore();
    ctx.save(); ctx.translate(sx, sy);
    this.world.drawBest(ctx, cam, W, H, t);
    // strokes
    for (const s of this.strokes) s.draw(ctx, cam);
    for (const s of this.strokes) s.drawFlow(ctx, cam, t, s === this.koi.rail);
    this.world.drawRings(ctx, cam, W, t);
    this.world.drawPickups(ctx, cam, W, t);
    this.world.drawHooks(ctx, cam, W, t);
    // ripples
    ctx.save(); ctx.translate(-cam, 0);
    for (const r of this.ripples) { ctx.strokeStyle = `rgba(40,44,60,${r.life * 0.5})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.55, 0, 0, TAU); ctx.stroke(); }
    for (const pf of this.purifies) {
      const k = clamp(pf.t / PICKUP.PURIFY_T, 0, 1), r = pf.r * easeOut(k);
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
    this.drawTrail(ctx);
    ctx.restore();
    this.koi.draw(ctx, cam);
    // particles
    ctx.save(); ctx.translate(-cam, 0);
    for (const p of this.particles) {
      if (p.kind === 'wisp') {
        const u = 1 - p.life / p.max, r = p.r * (1 + u * 1.5), a = Math.sin(Math.PI * (1 - u)) * 0.45;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.col + a + ')'); g.addColorStop(1, p.col + '0)');
        ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        continue;
      }
      if (p.kind === 'spark') {
        const a = Math.min(1, p.life * 1.4);
        ctx.fillStyle = p.col + a * 0.25 + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = p.col + a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        continue;
      }
      if (p.kind === 'line') {
        const a = Math.sin(Math.PI * p.life / p.max) * 0.35;
        ctx.strokeStyle = p.col + a + ')'; ctx.lineWidth = p.r; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y); ctx.stroke();
        continue;
      }
      ctx.fillStyle = p.col + Math.min(1, p.life * 1.6) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    for (const f of this.floaters) {
      const a = Math.min(1, f.life * 1.5), pop = 1 + Math.max(0, f.life - (f.big ? 1.1 : 0.8)) * 1.2;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(pop, pop);
      ctx.font = `${f.big ? 28 : 22}px ${FONT_BRUSH}`; ctx.fillStyle = f.col + a + ')'; ctx.textAlign = 'center'; ctx.fillText(f.text, 0, 0);
      if (f.en) { ctx.font = `600 14px ${FONT_TEXT}`; ctx.fillText(f.en, 0, 17); }
      ctx.restore();
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
    if (hudA > 0) { ctx.save(); ctx.globalAlpha = hudA; this.drawHUD(ctx, W, H); this.drawFlyers(ctx); ctx.restore(); }
    this.drawInscription(ctx, W, H, 1);
    this.drawBanner(ctx, W, H);
    this.drawCaption(ctx, W, H);
    this.drawStamps(ctx, W, H);
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,246,222,${this.flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
    this.drawHints(ctx, W, H);
    this.drawCursor(ctx);
    if (this.paused) {
      ctx.fillStyle = 'rgba(241,234,219,0.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(30,30,40,0.9)'; ctx.font = `64px ${FONT_BRUSH}`; ctx.textAlign = 'center'; ctx.fillText('小憩', W / 2, H / 2);
      ctx.font = `600 26px ${FONT_TEXT}`; ctx.fillText('Paused', W / 2, H / 2 + 44);
      ctx.font = `18px ${FONT_TEXT}`; ctx.fillText('点击继续 · click to resume', W / 2, H / 2 + 74);
    }
  }

  drawTrail(ctx) {
    const tr = this.trail; if (tr.length < 3 || this.koi.dying > 0) return;
    const K = KOI_KINDS[this.koi.kind] || KOI_KINDS.shu;
    const c = this.mult >= 3 ? K.fin : [60, 64, 84];
    const base = 0.05 + 0.04 * this.mult;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i], u = i / tr.length;
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${base * u})`;
      ctx.lineWidth = 1 + u * (3 + this.mult);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
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

  // pearls fly home to the inkstone along an arc
  drawFlyers(ctx) {
    for (const f of this.flyers) {
      const u = easeOut(f.t / f.d), inv = 1 - u;
      const cx = (f.x + HUD_INK.x) / 2, cy = Math.min(f.y, HUD_INK.y) - 120;
      const x = inv * inv * f.x + 2 * inv * u * cx + u * u * HUD_INK.x, y = inv * inv * f.y + 2 * inv * u * cy + u * u * HUD_INK.y;
      const r = lerp(7, 4, u);
      ctx.fillStyle = 'rgba(250,244,226,0.5)'; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(24,26,36,0.95)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  drawHUD(ctx, W, H) {
    // inkstone (ink gauge)
    const ix = HUD_INK.x, iy = HUD_INK.y, pulse = 1 + this.inkPulse * 0.35;
    ctx.save();
    ctx.save(); ctx.translate(ix, iy); ctx.scale(pulse, pulse); ctx.translate(-ix, -iy);
    ctx.fillStyle = 'rgba(30,30,38,0.15)'; ctx.beginPath(); ctx.ellipse(ix + 3, iy + 5, 44, 28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(62,60,66,0.95)'; ctx.beginPath(); ctx.ellipse(ix, iy, 42, 26, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = this.flashDry > 0 ? `rgba(200,60,50,${this.flashDry})` : 'rgba(20,20,26,0.8)'; ctx.lineWidth = this.flashDry > 0 ? 3 : 1.5; ctx.stroke();
    const lvl = clamp(this.ink, 0, 1);
    const g = ctx.createRadialGradient(ix - 8, iy - 6, 2, ix, iy, 34 * Math.max(0.12, lvl));
    g.addColorStop(0, 'rgba(60,64,80,1)'); g.addColorStop(1, 'rgba(10,10,16,1)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ix, iy, 34 * Math.max(0.12, lvl), 20 * Math.max(0.12, lvl), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,236,224,0.6)'; ctx.beginPath(); ctx.ellipse(ix - 10 * lvl, iy - 7 * lvl, 5 * lvl + 1, 2.5 * lvl + 0.5, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
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
    this.drawFlowGauge(ctx, 268, 56);
    this.drawAscent(ctx, 24, 170);
    this.drawGatePointer(ctx, W, H);
    // score
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(30,30,40,0.9)';
    const sp = 1 + this.scorePop * 0.5;
    ctx.save(); ctx.translate(W - 110, 62); ctx.scale(sp, sp); ctx.font = `44px ${FONT_BRUSH}`; ctx.fillText(String(this.score()), 0, 0); ctx.restore();
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
    if (this.best > 0) row('最高', 'Best', String(this.best), 154);
    if (this.combo > 1) {
      ctx.fillStyle = `rgba(200,60,50,${clamp(this.comboT, 0, 1)})`;
      const comboFont = `600 18px ${FONT_TEXT}`, cw = this.textW(ctx, comboFont, `Combo ×${this.combo}`);
      ctx.font = comboFont; ctx.fillText(`Combo ×${this.combo}`, W - 110, 183);
      ctx.font = `24px ${FONT_BRUSH}`; ctx.fillText('连珠', W - 118 - cw, 184);
    }
    ctx.restore();
  }

  // 流势: the multiplier inside an ensō that fills as the flow builds
  drawFlowGauge(ctx, x, y) {
    const m = this.mult, f = clamp(this.flowM, 0, 1), pop = this.flowPop;
    const r = 26 * (1 + Math.max(0, pop) * 0.5);
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(30,30,40,0.14)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    const hot = m >= 3;
    const col = pop < 0 ? `rgba(70,72,90,0.9)` : hot ? 'rgba(184,44,36,0.9)' : 'rgba(30,30,40,0.85)';
    ctx.strokeStyle = col;
    const a0 = -Math.PI / 2 - 0.3, frac = m >= FLOW.MAX ? 1 : f, span = TAU * 0.93 * frac;
    // tapering, as an ensō does
    const n = Math.max(1, Math.ceil(24 * frac));
    ctx.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      ctx.lineWidth = lerp(6.5, 2.5, i / n * frac);
      ctx.beginPath(); ctx.arc(x, y, r, a0 + span * i / n, a0 + span * (i + 1) / n + 0.02); ctx.stroke();
    }
    if (m >= FLOW.MAX) {
      const gl = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
      gl.addColorStop(0, `rgba(255,210,140,${0.25 + 0.1 * Math.sin(this.time * 6)})`); gl.addColorStop(1, 'rgba(255,210,140,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = col; ctx.textAlign = 'center';
    ctx.font = `${m >= 3 ? 30 : 26}px ${FONT_BRUSH}`; ctx.fillText('×' + m, x + 1, y + 10);
    ctx.restore();
    this.label(ctx, '流势', 'Flow', x, y + 52);
  }

  // big moments get the centre of the scroll: dragon gates, a new record
  drawBanner(ctx, W, H) {
    const b = this.banner; if (!b) return;
    const a = smoothstep(0, 0.2, b.t) * (1 - smoothstep(b.dur - 0.5, b.dur, b.t));
    const s = 1 + (1 - smoothstep(0, 0.35, b.t)) * 0.4;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.3); ctx.scale(s, s); ctx.textAlign = 'center';
    ctx.fillStyle = b.gold ? 'rgba(176,120,36,0.97)' : b.red ? 'rgba(184,44,36,0.95)' : 'rgba(30,30,40,0.92)';
    if (b.gold) { ctx.shadowColor = 'rgba(255,220,150,0.9)'; ctx.shadowBlur = 18; }
    ctx.font = `76px ${FONT_BRUSH}`; ctx.fillText(b.zh, 0, 0);
    ctx.font = `600 22px ${FONT_TEXT}`; ctx.fillStyle = 'rgba(30,30,40,0.9)'; ctx.fillText(b.en, 0, 40);
    if (b.sub) { ctx.font = `600 17px ${FONT_TEXT}`; ctx.fillStyle = b.gold ? 'rgba(150,100,30,0.95)' : 'rgba(30,30,40,0.8)'; ctx.fillText(b.sub, 0, 68); }
    ctx.restore();
  }

  // daily goal met: a red seal stamped at the top of the scroll
  drawStamps(ctx, W, H) {
    this.stamps.forEach((s, i) => {
      const a = smoothstep(0, 0.12, s.t) * (1 - smoothstep(2.1, 2.6, s.t));
      const sc = 1 + (1 - smoothstep(0, 0.25, s.t)) * 1.2;
      const x = W / 2, y = 44 + i * 60;
      const w = Math.max(this.textW(ctx, `600 14px ${FONT_TEXT}`, 'Daily goal: ' + s.en), this.textW(ctx, `22px ${FONT_BRUSH}`, '今日 · ' + s.zh)) + 74;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(-0.03);
      ctx.fillStyle = 'rgba(241,234,219,0.9)'; ctx.fillRect(-w / 2, -26, w, 52);
      ctx.strokeStyle = 'rgba(184,44,36,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 3, -23, w - 6, 46);
      ctx.fillStyle = 'rgba(184,44,36,0.95)'; ctx.fillRect(-w / 2 + 10, -18, 36, 36);
      ctx.fillStyle = 'rgba(245,236,220,1)'; ctx.font = `24px ${FONT_BRUSH}`; ctx.textAlign = 'center'; ctx.fillText('成', -w / 2 + 28, 8);
      ctx.fillStyle = 'rgba(30,30,40,0.95)'; ctx.textAlign = 'left';
      ctx.font = `22px ${FONT_BRUSH}`; ctx.fillText('今日 · ' + s.zh, -w / 2 + 56, -3);
      ctx.font = `600 14px ${FONT_TEXT}`; ctx.fillText('Daily goal: ' + s.en, -w / 2 + 56, 16);
      ctx.restore();
    });
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

// ---------- the title card and game-over card: goals, streak, koi varieties ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function renderGoals(el) {
  el.innerHTML = '';
  for (const g of Progress.data.goals) {
    const t = Progress.goalText(g), li = document.createElement('li');
    li.className = g.done ? 'done' : '';
    const pct = Math.round(clamp(g.best / g.n, 0, 1) * 100);
    li.innerHTML = `<span class="mark">${g.done ? '成' : ''}</span><span class="gt"><span class="zh">${esc(t.zh)}</span><span class="en" lang="en">${esc(t.en)}</span></span>`
      + `<span class="gp">${g.done ? '✓' : `${Math.min(g.best, g.n)}/${g.n}`}</span><span class="bar"><i style="width:${pct}%"></i></span>`;
    el.appendChild(li);
  }
}

function renderStreak(el) {
  const n = Progress.data.streak;
  el.textContent = n > 1 ? `连续 ${n} 日 · ${n}-day streak` : '';
}

function renderUnlock(el, fresh) {
  el.innerHTML = '';
  const id = fresh && fresh.length ? fresh[fresh.length - 1] : null, nx = id ? null : Progress.nextUnlock();
  if (!id && !nx) { el.className = 'unlock hidden'; return; }
  const kind = id || nx.id, K = KOI_KINDS[kind];
  el.className = id ? 'unlock new' : 'unlock';
  el.innerHTML = id ? '<div class="uh">新鲤 <span class="en" lang="en">New koi unlocked!</span></div>' : '<div class="uh">下一尾 <span class="en" lang="en">Next koi</span></div>';
  const row = document.createElement('div'); row.className = 'ur';
  row.appendChild(koiPortrait(kind, 84, 42, !id));
  const nm = document.createElement('div'); nm.className = 'un';
  nm.innerHTML = `${esc(K.zh)}<span class="en" lang="en">${esc(K.en)}</span>`;
  row.appendChild(nm); el.appendChild(row);
  const d = document.createElement('div');
  d.innerHTML = id ? '<div class="us"><span class="en" lang="en">Pick it on the title scroll.</span></div>'
    : `<div class="us"><span class="en" lang="en">${esc(nx.u.en)}</span></div><div class="bar"><i style="width:${Math.round(nx.f * 100)}%"></i></div><div class="uv">${Math.min(nx.cur, nx.need)} / ${nx.need}</div>`;
  el.appendChild(d);
}

function renderTitleMeta() {
  const P = Progress.data, panel = document.querySelector('#title .panel');
  panel.classList.toggle('returning', P.runs > 0);
  renderGoals(document.getElementById('goals-title'));
  renderStreak(document.getElementById('streak'));
  renderAscent(document.getElementById('ascent-title'));
  const list = document.getElementById('koi-list'), info = document.getElementById('koi-info');
  list.innerHTML = '';
  const describe = id => {
    const K = KOI_KINDS[id], u = KOI_UNLOCKS[id], open = P.unlocked.includes(id);
    info.innerHTML = open ? `<b>${esc(K.zh)}</b> <span class="en" lang="en">${esc(K.en)}</span>`
      : `<b>${esc(K.zh)}</b> <span class="en" lang="en">${esc(K.en)}</span> · 🔒 ${esc(u.zh)} <span class="en" lang="en">${esc(u.en)} (${Math.min(Math.floor(u.val(P)), u.need)}/${u.need})</span>`;
  };
  for (const id of KOI_ORDER) {
    const open = P.unlocked.includes(id), b = document.createElement('button');
    b.className = 'koi-card' + (open ? '' : ' locked') + (P.koi === id ? ' sel' : '');
    b.title = KOI_KINDS[id].zh + ' ' + KOI_KINDS[id].en;
    b.appendChild(koiPortrait(id, 64, 32, !open));
    b.addEventListener('pointerenter', () => describe(id));
    b.addEventListener('focus', () => describe(id));
    b.addEventListener('pointerleave', () => describe(P.koi));
    b.addEventListener('click', e => {
      e.stopPropagation();
      describe(id);
      if (!open) return;
      Progress.choose(id);
      if (window.game) window.game.koi.kind = id;
      for (const c of list.children) c.classList.remove('sel');
      b.classList.add('sel');
      Audio.init(); Audio.pluck(6, 0.3);
    });
    list.appendChild(b);
  }
  describe(P.koi);
}

// the next form's name, for the HUD line
function nextFormLabel(f) { const n = FORMS[Math.min(FORMS.length - 1, f + 1)]; return n.zh + ' ' + n.en; }

// the road to the dragon on the title card: forms reached so far, and ones not yet seen
function renderAscent(el) {
  const best = Progress.data.bestForm || 0;
  el.innerHTML = FORMS.map((f, i) => `<span class="fp${i <= best ? ' on' : ''}" title="${i <= best ? esc(f.zh + ' ' + f.en) : '?'}">${i <= best ? esc(f.short) : '?'}</span>`).join('<i></i>')
    + `<span class="ft">${best ? `最高化境 ${esc(FORMS[best].zh)} <span class="en" lang="en">Best form: ${esc(FORMS[best].en)}</span>` : '<span class="en" lang="en">Swim through Dragon Gates to evolve</span>'}</span>`;
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
  Progress.load(); // after the SDK, so the portal's synced save is the one read
  // ...unless the SDK was too slow and arrives later: then merge its save in rather than overwrite it
  Platform.onLateStorage(() => {
    Progress.adopt();
    const g = window.game; if (!g) return;
    g.best = Progress.data.bestScore;
    if (g.state === 'title') { g.koi.kind = Progress.data.koi; renderTitleMeta(); }
  });
  const applyMute = m => { Audio.setDucked(m); syncMuteButton(); };
  applyMute(Platform.muted());
  Platform.onMuteChange(applyMute);
  await fonts;
  try {
    window.game = new Game(document.getElementById('game'));
    renderTitleMeta();
    document.getElementById('btn-how').addEventListener('click', e => { e.stopPropagation(); document.querySelector('#title .panel').classList.toggle('show-how'); });
  } finally { Platform.loadingStop(); }
});
