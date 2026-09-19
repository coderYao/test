// Perigee — game loop, input, HUD and hole flow.
import * as PHY from './physics.js';
import { COURSE, generateHole, dailySeed } from './levels.js';
import { World } from './scene.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('c');
const world = new World(canvas);
const audio = new Audio();

const ui = {
  hud: $('hud'), holeNum: $('holeNum'), holeName: $('holeName'), par: $('par'), strokes: $('strokes'), total: $('total'),
  msg: $('msg'), hint: $('hint'), power: document.querySelector('.power'), powerFill: $('powerFill'),
  title: $('title'), result: $('result'), scorecard: $('scorecard'),
};

const game = {
  mode: 'title',          // title | play
  course: [], holeIndex: 0, level: null, state: null,
  strokes: 0, scores: [],
  phase: 'play',          // play | holed | lost | done
  aiming: false, dragStart: { x: 0, z: 0 }, dragNow: { x: 0, z: 0 }, dragPx: { x: 0, y: 0 }, dirX: 1, dirZ: 0, power01: 0,
  overview: false, autoOverviewUntil: 0, zoom: 40, lastRest: null, hideBallUntil: 0,
  positions: [], goalPos: { x: 0, z: 0 }, msgTimer: 0, resultTimer: 0, courseLabel: 'course',
};

// ---------- helpers ----------

function scoreName(strokes, par) {
  if (strokes === 1) return 'HOLE IN ONE';
  const d = strokes - par;
  if (d <= -3) return 'ALBATROSS';
  if (d === -2) return 'EAGLE';
  if (d === -1) return 'BIRDIE';
  if (d === 0) return 'PAR';
  if (d === 1) return 'BOGEY';
  if (d === 2) return 'DOUBLE BOGEY';
  return `+${d}`;
}
const fmtRel = (d) => d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;

function flash(text, sub = '', ms = 1600) {
  ui.msg.innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  ui.msg.classList.add('show');
  game.msgTimer = ms / 1000;
}

function totalRel() {
  let d = 0;
  for (let i = 0; i < game.scores.length; i++) d += game.scores[i] - game.course[i].par;
  return d;
}

function updateHud() {
  ui.holeNum.textContent = `HOLE ${game.holeIndex + 1} / ${game.course.length}`;
  ui.holeName.textContent = game.level.name;
  ui.par.textContent = game.level.par;
  ui.strokes.textContent = game.strokes;
  ui.total.textContent = fmtRel(totalRel());
}

function frameLevel(level) {
  let ext = 10;
  const pos = PHY.bodyPositions(level, 0, []);
  level.bodies.forEach((b, i) => { const r = Math.hypot(pos[i].x, pos[i].z) + b.r + (b.orbit ? b.orbit.dist : 0); ext = Math.max(ext, r); });
  const g = PHY.goalPosition(level, 0, pos);
  ext = Math.max(ext, Math.hypot(g.x, g.z) + 4);
  const aspect = world.camera.aspect;
  const fov = world.camera.fov * Math.PI / 180;
  const fit = ext / Math.tan(fov / 2) * (aspect < 1 ? 1 / aspect : 1) * 0.72 + 10;
  return { dist: Math.min(140, fit), center: { x: 0, z: 0 } };
}

// ---------- course / hole flow ----------

function startCourse(kind) {
  audio.unlock();
  if (kind === 'course') { game.course = COURSE.map(l => ({ ...l })); game.courseLabel = 'course'; }
  else {
    const seed = kind === 'daily' ? dailySeed() : (Math.random() * 1e9) >>> 0;
    game.course = [];
    for (let i = 0; i < 9; i++) game.course.push(generateHole((seed + i * 7919) >>> 0, 0.8 + i * 0.4));
    game.courseLabel = kind;
  }
  game.scores = [];
  game.holeIndex = 0;
  game.mode = 'play';
  ui.title.classList.add('hidden');
  ui.scorecard.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startHole();
}

function startHole() {
  const level = game.course[game.holeIndex];
  game.level = level;
  game.state = PHY.createState(level);
  game.strokes = 0;
  game.phase = 'play';
  game.aiming = false;
  game.lastRest = { body: level.start.body, angle: game.state.ball.restAng };
  world.buildLevel(level);
  world.hideAim();
  world.ball.visible = true;
  ui.hint.textContent = level.hint || '';
  ui.hint.style.opacity = 1;
  ui.result.classList.add('hidden');
  updateHud();
  const f = frameLevel(level);
  world.cam.targetGoal.set(f.center.x, 0, f.center.z);
  world.cam.distGoal = f.dist;
  world.cam.target.copy(world.cam.targetGoal);
  world.cam.dist = f.dist * 1.3;
  game.overview = false;
  game.autoOverviewUntil = performance.now() / 1000 + 2.2;
  game.zoom = Math.min(44, Math.max(26, f.dist * 0.5));
  flash(`HOLE ${game.holeIndex + 1}`, `${level.name.toUpperCase()} · PAR ${level.par}`, 2200);
}

function finishHole() {
  game.scores[game.holeIndex] = game.strokes;
  const name = scoreName(game.strokes, game.level.par);
  $('resultHole').textContent = `HOLE ${game.holeIndex + 1} · ${game.level.name.toUpperCase()}`;
  $('resultTitle').textContent = name;
  $('resultLine').textContent = `${game.strokes} stroke${game.strokes === 1 ? '' : 's'} · par ${game.level.par} · round ${fmtRel(totalRel())}`;
  $('btnNext').textContent = game.holeIndex + 1 < game.course.length ? 'Next hole' : 'Scorecard';
  ui.msg.classList.remove('show');
  ui.result.classList.remove('hidden');
  updateHud();
}

function nextHole() {
  audio.click();
  if (game.holeIndex + 1 < game.course.length) { game.holeIndex++; startHole(); }
  else showScorecard();
}

function showScorecard() {
  const rel = totalRel();
  const total = game.scores.reduce((a, b) => a + b, 0);
  $('scoreTitle').textContent = rel === 0 ? 'EVEN PAR' : rel < 0 ? `${Math.abs(rel)} UNDER PAR` : `${rel} OVER PAR`;
  let html = '<tr><th>#</th><th style="text-align:left">HOLE</th><th>PAR</th><th>YOU</th><th>±</th></tr>';
  game.course.forEach((l, i) => {
    const d = game.scores[i] - l.par;
    html += `<tr><td>${i + 1}</td><td class="name">${l.name}</td><td>${l.par}</td><td>${game.scores[i]}</td><td class="${d < 0 ? 'under' : d > 0 ? 'over' : ''}">${fmtRel(d)}</td></tr>`;
  });
  const parTotal = game.course.reduce((a, l) => a + l.par, 0);
  html += `<tr><td></td><td class="name"><b>Total</b></td><td><b>${parTotal}</b></td><td><b>${total}</b></td><td><b>${fmtRel(rel)}</b></td></tr>`;
  $('scoreTable').innerHTML = html;
  const key = `perigee.best.${game.courseLabel === 'course' ? 'course' : 'random'}`;
  const prev = localStorage.getItem(key);
  let bestLine = '';
  if (game.courseLabel === 'course') {
    if (prev === null || rel < Number(prev)) { localStorage.setItem(key, String(rel)); bestLine = prev === null ? 'First round recorded.' : `New personal best! Previous best ${fmtRel(Number(prev))}.`; }
    else bestLine = `Personal best ${fmtRel(Number(prev))}.`;
  } else bestLine = 'Procedural rounds are not ranked. Every seed is a new sky.';
  $('scoreBest').textContent = bestLine;
  ui.result.classList.add('hidden');
  ui.scorecard.classList.remove('hidden');
  game.phase = 'done';
}

function showTitle() {
  game.mode = 'title';
  ui.scorecard.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.title.classList.remove('hidden');
  const best = localStorage.getItem('perigee.best.course');
  $('bestLabel').textContent = best !== null ? `BEST ROUND ${fmtRel(Number(best))}` : '';
}

function resetBall(penalty, why) {
  const s = game.state;
  s.ball.state = 'rest';
  s.ball.restBody = game.lastRest.body;
  s.ball.restAng = game.lastRest.angle;
  PHY.placeAtRest(game.level, s);
  world.trail.length = 0;
  if (penalty) { game.strokes += penalty; updateHud(); }
  game.phase = 'play';
  world.ball.visible = true;
  world.emit(s.ball.x, 0, s.ball.z, 30, 0x9fd4ff, 4, { life: 0.6 });
}

// ---------- simulation events ----------

function handleEvent(e) {
  const s = game.state;
  switch (e.type) {
    case 'bounce': {
      const k = Math.min(1, e.speed / 14);
      audio.bounce(e.speed);
      world.shake(k * 0.55);
      const body = game.level.bodies[e.body];
      const col = { terra: 0x7fc8ff, dune: 0xffc27a, ice: 0xdff4ff, lava: 0xff7a3a, jovian: 0xffe0b0 }[body.palette] || 0xc9a0ff;
      world.emit(e.x, 0, e.z, 6 + Math.floor(k * 28), col, 3 + k * 9, { nx: e.nx, nz: e.nz, life: 0.7, size: 1.2 });
      break;
    }
    case 'rest': {
      audio.rest();
      game.lastRest = { body: e.body, angle: s.ball.restAng };
      world.emit(e.x, 0, e.z, 10, 0xffffff, 1.5, { life: 0.5, size: 0.9 });
      ui.hint.style.opacity = 0;
      break;
    }
    case 'boost': {
      audio.boost();
      world.shake(0.25);
      world.emit(e.x, 0, e.z, 40, 0xffb030, 8, { life: 0.8, size: 1.4 });
      flash('BOOST', '', 700);
      break;
    }
    case 'holed': {
      audio.holed(game.level.par - game.strokes);
      world.shake(0.5);
      world.emit(e.x, 0, e.z, 160, 0x6ef3ff, 12, { life: 1.4, size: 1.6, up: 6 });
      world.emit(e.x, 0, e.z, 80, 0xffffff, 6, { life: 1.0, size: 1.2, up: 10 });
      world.ball.visible = false;
      world.trail.length = 0;
      s.ball.vx = 0; s.ball.vz = 0;
      game.phase = 'holed';
      game.resultTimer = 1.3;
      flash(scoreName(game.strokes, game.level.par), `${game.strokes} STROKE${game.strokes === 1 ? '' : 'S'}`, 2400);
      world.cam.targetGoal.set(e.x, 0, e.z);
      world.cam.distGoal = 18;
      break;
    }
    case 'lost': {
      audio.lost(e.reason);
      world.ball.visible = false;
      game.phase = 'lost';
      let penalty = 0;
      if (e.reason === 'black') { penalty = 1; flash('SWALLOWED', '+1 PENALTY STROKE'); world.shake(0.9); world.emit(e.x, 0, e.z, 90, 0xff8040, 10, { life: 0.9 }); }
      else if (e.reason === 'sun') { penalty = 1; flash('BURNED UP', '+1 PENALTY STROKE'); world.shake(0.9); world.emit(e.x, 0, e.z, 120, 0xffd070, 14, { life: 1.0, up: 5 }); }
      else if (e.reason === 'oob') { flash('LOST IN SPACE', 'BALL RETURNED'); }
      else if (e.reason === 'drift') { flash('ADRIFT', 'BALL RETURNED'); }
      else if (e.reason === 'recall') { flash('RECALLED', ''); }
      game.resultTimer = 0.9;
      game.pendingPenalty = penalty;
      break;
    }
  }
}

// ---------- input ----------

const pointers = new Map();
let orbiting = false, lastOrbit = { x: 0, y: 0 }, pinch = null;

function beginAim(cx, cy) {
  if (game.mode !== 'play' || game.phase !== 'play' || game.state.ball.state !== 'rest') return;
  if (!world.pick(cx, cy, game.dragStart)) return;
  game.aiming = true;
  game.dragPx = { x: cx, y: cy };
  game.dragNow.x = game.dragStart.x; game.dragNow.z = game.dragStart.z;
  game.power01 = 0;
  ui.power.classList.add('on');
}

function moveAim(cx, cy) {
  if (!game.aiming) return;
  world.pick(cx, cy, game.dragNow);
  const dx = game.dragStart.x - game.dragNow.x, dz = game.dragStart.z - game.dragNow.z;
  const len = Math.hypot(dx, dz);
  const px = Math.hypot(cx - game.dragPx.x, cy - game.dragPx.y);
  const maxPx = Math.min(window.innerWidth, window.innerHeight) * 0.42;
  game.power01 = Math.min(1, Math.max(0, (px - 8) / maxPx));
  if (len > 0.001) { game.dirX = dx / len; game.dirZ = dz / len; }
  ui.powerFill.style.width = `${(game.power01 * 100).toFixed(1)}%`;
}

function endAim() {
  if (!game.aiming) return;
  game.aiming = false;
  ui.power.classList.remove('on');
  world.hideAim();
  if (game.power01 < 0.04) return;
  const power = PHY.CFG.minPower + game.power01 * (PHY.CFG.maxPower - PHY.CFG.minPower);
  PHY.shoot(game.level, game.state, game.dirX, game.dirZ, power);
  game.strokes++;
  updateHud();
  audio.shoot(game.power01);
  world.trail.length = 0;
  const b = game.state.ball;
  world.emit(b.x, 0, b.z, 14 + Math.floor(game.power01 * 20), 0xffffff, 2 + game.power01 * 6, { nx: -game.dirX, nz: -game.dirZ, life: 0.5, size: 1.0 });
  world.shake(0.08 + game.power01 * 0.18);
  ui.hint.style.opacity = 0;
}

canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (e.pointerType === 'touch') {
    if (pointers.size === 2) {
      if (game.aiming) { game.aiming = false; ui.power.classList.remove('on'); world.hideAim(); }
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), zoom: game.zoom, yaw: world.cam.yaw };
    } else if (pointers.size === 1) beginAim(e.clientX, e.clientY);
    return;
  }
  if (e.button === 0 && !e.ctrlKey) beginAim(e.clientX, e.clientY);
  else { orbiting = true; lastOrbit = { x: e.clientX, y: e.clientY }; }
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    game.zoom = Math.min(120, Math.max(12, pinch.zoom * pinch.d / Math.max(20, d)));
    world.cam.yaw = pinch.yaw - (ang - pinch.ang);
    return;
  }
  if (orbiting) {
    world.cam.yaw -= (e.clientX - lastOrbit.x) * 0.005;
    world.cam.pitch = Math.min(1.45, Math.max(0.35, world.cam.pitch + (e.clientY - lastOrbit.y) * 0.004));
    lastOrbit = { x: e.clientX, y: e.clientY };
    return;
  }
  moveAim(e.clientX, e.clientY);
});
const up = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (e.button === 0 || e.pointerType === 'touch') endAim();
  orbiting = false;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); game.zoom = Math.min(120, Math.max(12, game.zoom * (1 + e.deltaY * 0.0012))); }, { passive: false });

function recall() {
  if (game.mode !== 'play' || game.phase !== 'play' || game.state.ball.state !== 'flying' || game.state.ball.flightTime < 1.5) return;
  game.state.ball.state = 'lost';
  handleEvent({ type: 'lost', reason: 'recall', x: game.state.ball.x, z: game.state.ball.z });
}

window.addEventListener('keydown', (e) => {
  if (game.mode !== 'play') { if (e.key === 'Enter' && !ui.title.classList.contains('hidden')) startCourse('course'); return; }
  switch (e.key) {
    case 'Escape': if (game.aiming) { game.aiming = false; game.power01 = 0; ui.power.classList.remove('on'); world.hideAim(); } break;
    case 'r': case 'R': if (game.phase === 'play' || game.phase === 'lost') { audio.click(); startHole(); } break;
    case 'Tab': e.preventDefault(); game.overview = !game.overview; break;
    case 'm': case 'M': toggleMute(); break;
    case ' ': e.preventDefault(); recall(); break;
    case 'Enter': case 'n': case 'N': if (game.phase === 'holed' && !ui.result.classList.contains('hidden')) nextHole(); else if (game.phase === 'done') startCourse(game.courseLabel); break;
  }
});

function toggleMute() { audio.unlock(); audio.setMuted(!audio.muted); $('btnMute').classList.toggle('off', audio.muted); }
$('btnMute').classList.toggle('off', audio.muted);
$('btnMute').addEventListener('click', toggleMute);
$('btnRecall').addEventListener('click', () => { audio.click(); recall(); });
$('btnRestart').addEventListener('click', () => { if (game.phase === 'play' || game.phase === 'lost') { audio.click(); startHole(); } });
$('btnView').addEventListener('click', () => { audio.click(); game.overview = !game.overview; });
$('btnPlay').addEventListener('click', () => startCourse('course'));
$('btnDaily').addEventListener('click', () => startCourse('daily'));
$('btnRandom').addEventListener('click', () => startCourse('random'));
$('btnNext').addEventListener('click', nextHole);
$('btnAgain').addEventListener('click', () => startCourse(game.courseLabel));
$('btnMenu').addEventListener('click', () => { audio.click(); showTitle(); });
$('dailyLabel').textContent = `#${String(dailySeed() % 10000).padStart(4, '0')}`;
window.addEventListener('resize', () => world.resize());

// ---------- title background (attract mode) ----------

function loadAttract() {
  const lvl = COURSE[6];
  game.level = lvl;
  game.state = PHY.createState(lvl);
  world.buildLevel(lvl);
  world.ball.visible = false;
  world.cam.target.set(0, 0, 0); world.cam.targetGoal.set(0, 0, 0);
  world.cam.dist = 70; world.cam.distGoal = 70;
}
loadAttract();
showTitle();

// Debug / deep links: ?hole=4 jumps straight into the course at that hole.
const qs = new URLSearchParams(location.search);
if (qs.has('hole')) {
  startCourse(qs.get('mode') || 'course');
  game.holeIndex = Math.min(game.course.length - 1, Math.max(0, (parseInt(qs.get('hole'), 10) || 1) - 1));
  startHole();
}
window.perigee = { game, world, startCourse, startHole, nextHole, PHY };

// ---------- main loop ----------

let last = performance.now(), acc = 0;
const events = [];

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.mode === 'title') {
    game.state.t += dt;
    world.cam.yaw += dt * 0.05;
    PHY.bodyPositions(game.level, game.state.t, game.positions);
    PHY.goalPosition(game.level, game.state.t, game.positions, game.goalPos);
    world.updateLevel(game.level, game.positions, game.goalPos, dt);
    world.updateCamera(dt);
    world.render();
    return;
  }

  const level = game.level, s = game.state;
  const ball = s.ball;

  // fixed-step physics
  if (game.phase !== 'done') {
    acc += dt;
    events.length = 0;
    while (acc >= PHY.CFG.dt) {
      PHY.step(level, s, events);
      acc -= PHY.CFG.dt;
      if (events.length && (ball.state === 'holed' || ball.state === 'lost')) { acc = 0; break; }
    }
    for (const e of events) handleEvent(e);
  }

  // timers
  if (game.msgTimer > 0) { game.msgTimer -= dt; if (game.msgTimer <= 0) ui.msg.classList.remove('show'); }
  if (game.phase === 'holed' && game.resultTimer > 0) { game.resultTimer -= dt; if (game.resultTimer <= 0) finishHole(); }
  if (game.phase === 'lost' && game.resultTimer > 0) { game.resultTimer -= dt; if (game.resultTimer <= 0) resetBall(game.pendingPenalty, ''); }

  // aim preview
  if (game.aiming && ball.state === 'rest') {
    const power = PHY.CFG.minPower + game.power01 * (PHY.CFG.maxPower - PHY.CFG.minPower);
    const pred = PHY.predict(level, s, game.dirX, game.dirZ, power, 2.6, 5);
    world.showAim(ball, game.dirX, game.dirZ, game.power01, pred, game.dragStart, game.dragNow);
  }

  // world update
  PHY.bodyPositions(level, s.t, game.positions);
  PHY.goalPosition(level, s.t, game.positions, game.goalPos);
  world.updateLevel(level, game.positions, game.goalPos, dt);
  world.updateBall(ball, ball.state === 'flying', dt);
  audio.roll(Math.hypot(ball.vx, ball.vz), ball.rolling && ball.state === 'flying');

  // camera
  const overview = game.overview || performance.now() / 1000 < game.autoOverviewUntil;
  if (game.phase === 'holed') { /* camera set by event */ }
  else if (overview) {
    const f = frameLevel(level);
    world.cam.targetGoal.set(f.center.x, 0, f.center.z);
    world.cam.distGoal = f.dist;
  } else {
    world.cam.targetGoal.set(ball.x, 0, ball.z);
    const sp = Math.hypot(ball.vx, ball.vz);
    world.cam.distGoal = game.zoom * (game.aiming ? 1.25 : 1) + (ball.state === 'flying' ? Math.min(18, sp * 0.7) : 0);
  }
  world.updateCamera(dt);
  world.render();
}
requestAnimationFrame(frame);
