// Perigee — renderer-free physics core.
// The play field is the XZ plane. Everything here is deterministic given (level, t),
// so the same code drives the live simulation, the aim preview and the offline validator.

export const CFG = {
  G: 1.0,
  ballR: 0.38,
  dt: 1 / 240,
  restitution: 0.42,      // normal bounce factor
  tangentDamp: 0.78,      // tangential velocity kept on a hard bounce
  bounceThreshold: 1.4,   // below this normal speed a contact is a roll, not a bounce
  rollFriction: 1.9,      // per-second rolling friction on a surface
  restSpeed: 0.55,        // rolling slower than this = the ball comes to rest
  minPower: 3.0,
  maxPower: 30,
  bounds: 80,
  maxFlightTime: 28,
  goalR: 1.45,
  boostR: 1.35,
  boostCooldown: 0.6,
};

const TAU = Math.PI * 2;

// ---------- body / goal kinematics ----------

export function bodyCount(level) { return level.bodies.length; }

// Fills out[i] = {x, z} for every body at time t. Parents must be declared before children.
export function bodyPositions(level, t, out) {
  const bs = level.bodies;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    const o = out[i] || (out[i] = { x: 0, z: 0 });
    if (b.orbit) {
      const a = (b.orbit.phase || 0) + b.orbit.speed * t;
      let px, pz;
      if (b.orbit.parent === -1 || b.orbit.parent === undefined) { px = b.orbit.cx || 0; pz = b.orbit.cz || 0; }
      else { px = out[b.orbit.parent].x; pz = out[b.orbit.parent].z; }
      o.x = px + Math.cos(a) * b.orbit.dist;
      o.z = pz + Math.sin(a) * b.orbit.dist;
    } else { o.x = b.x; o.z = b.z; }
  }
  return out;
}

export function goalPosition(level, t, bodiesAt, out) {
  const g = level.goal;
  out = out || { x: 0, z: 0 };
  if (g.orbit) {
    const a = (g.orbit.phase || 0) + g.orbit.speed * t;
    const p = g.orbit.parent >= 0 ? bodiesAt[g.orbit.parent] : { x: g.orbit.cx || 0, z: g.orbit.cz || 0 };
    out.x = p.x + Math.cos(a) * g.orbit.dist;
    out.z = p.z + Math.sin(a) * g.orbit.dist;
  } else { out.x = g.x; out.z = g.z; }
  return out;
}

// velocity of body i via finite difference (moons carry the ball with them)
function bodyVelocity(level, i, t, scratchA, scratchB, out) {
  const e = 1 / 120;
  bodyPositions(level, t - e, scratchA);
  bodyPositions(level, t + e, scratchB);
  out.x = (scratchB[i].x - scratchA[i].x) / (2 * e);
  out.z = (scratchB[i].z - scratchA[i].z) / (2 * e);
  return out;
}

// ---------- state ----------

export function createState(level) {
  const s = {
    t: 0,
    ball: { x: 0, z: 0, vx: 0, vz: 0, state: 'rest', restBody: level.start.body, restAng: level.start.angle * Math.PI / 180, flightTime: 0, rolling: false, contactBody: -1 },
    boostCd: (level.boosts || []).map(() => 0),
    _pos: [], _pa: [], _pb: [], _bv: { x: 0, z: 0 },
  };
  placeAtRest(level, s);
  return s;
}

export function cloneState(s) {
  return {
    t: s.t,
    ball: { ...s.ball },
    boostCd: s.boostCd.slice(),
    _pos: [], _pa: [], _pb: [], _bv: { x: 0, z: 0 },
  };
}

export function placeAtRest(level, s) {
  const b = s.ball;
  const pos = bodyPositions(level, s.t, s._pos);
  const body = level.bodies[b.restBody];
  const p = pos[b.restBody];
  b.x = p.x + Math.cos(b.restAng) * (body.r + CFG.ballR);
  b.z = p.z + Math.sin(b.restAng) * (body.r + CFG.ballR);
  b.vx = 0; b.vz = 0; b.rolling = false; b.contactBody = -1;
}

export function shoot(level, s, dirX, dirZ, power) {
  const b = s.ball;
  const len = Math.hypot(dirX, dirZ) || 1;
  const v = bodyVelocity(level, b.restBody, s.t, s._pa, s._pb, s._bv);
  b.vx = (dirX / len) * power + v.x;
  b.vz = (dirZ / len) * power + v.z;
  b.state = 'flying';
  b.flightTime = 0;
  b.rolling = false;
  b.contactBody = -1;
}

// ---------- integration ----------

// Advances one fixed step. Returns null or an event object.
export function step(level, s, events) {
  const dt = CFG.dt;
  const b = s.ball;
  const bodies = level.bodies;

  if (b.state !== 'flying') {
    s.t += dt;
    if (b.state === 'rest') placeAtRest(level, s);
    return;
  }

  const pos = bodyPositions(level, s.t, s._pos);

  // gravity
  let ax = 0, az = 0;
  for (let i = 0; i < bodies.length; i++) {
    const bd = bodies[i];
    const dx = pos[i].x - b.x, dz = pos[i].z - b.z;
    const d2 = dx * dx + dz * dz;
    const soft = bd.r * 0.6;
    const d = Math.sqrt(d2);
    const f = CFG.G * bd.m / Math.max(d2, soft * soft);
    ax += f * dx / d; az += f * dz / d;
  }
  b.vx += ax * dt; b.vz += az * dt;
  b.x += b.vx * dt; b.z += b.vz * dt;
  b.flightTime += dt;
  b.rolling = false;
  b.contactBody = -1;

  // collisions
  for (let i = 0; i < bodies.length; i++) {
    const bd = bodies[i];
    const dx = b.x - pos[i].x, dz = b.z - pos[i].z;
    const d = Math.hypot(dx, dz);
    const minD = bd.r + CFG.ballR;
    if (d >= minD) continue;
    if (bd.type === 'black') { b.state = 'lost'; events && events.push({ type: 'lost', reason: 'black', x: b.x, z: b.z }); s.t += dt; return; }
    if (bd.type === 'sun') { b.state = 'lost'; events && events.push({ type: 'lost', reason: 'sun', x: b.x, z: b.z }); s.t += dt; return; }
    const nx = dx / (d || 1), nz = dz / (d || 1);
    b.x = pos[i].x + nx * minD; b.z = pos[i].z + nz * minD;
    const bv = bodyVelocity(level, i, s.t, s._pa, s._pb, s._bv);
    let rvx = b.vx - bv.x, rvz = b.vz - bv.z;
    const vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      let tx = rvx - nx * vn, tz = rvz - nz * vn;
      if (-vn > CFG.bounceThreshold) {
        tx *= CFG.tangentDamp; tz *= CFG.tangentDamp;
        rvx = tx + nx * (-vn * CFG.restitution);
        rvz = tz + nz * (-vn * CFG.restitution);
        events && events.push({ type: 'bounce', speed: -vn, x: b.x, z: b.z, nx, nz, body: i });
      } else {
        const k = Math.max(0, 1 - CFG.rollFriction * dt);
        rvx = tx * k; rvz = tz * k;
        b.rolling = true; b.contactBody = i;
        const sp = Math.hypot(rvx, rvz);
        if (sp < CFG.restSpeed) {
          b.state = 'rest'; b.restBody = i; b.restAng = Math.atan2(nz, nx);
          b.vx = 0; b.vz = 0;
          events && events.push({ type: 'rest', body: i, x: b.x, z: b.z });
          s.t += dt; return;
        }
      }
      b.vx = rvx + bv.x; b.vz = rvz + bv.z;
    }
  }

  // boosts
  const boosts = level.boosts || [];
  for (let i = 0; i < boosts.length; i++) {
    if (s.boostCd[i] > 0) { s.boostCd[i] -= dt; continue; }
    const bo = boosts[i];
    const d = Math.hypot(b.x - bo.x, b.z - bo.z);
    if (d < CFG.boostR) {
      const a = bo.angle * Math.PI / 180;
      const dx = Math.cos(a), dz = Math.sin(a);
      const along = b.vx * dx + b.vz * dz;
      const target = Math.max(along, 0) + (bo.strength || 10);
      // redirect: keep a little of the perpendicular component, push hard along the ring
      const px = b.vx - dx * along, pz = b.vz - dz * along;
      b.vx = dx * target + px * 0.3; b.vz = dz * target + pz * 0.3;
      s.boostCd[i] = CFG.boostCooldown;
      events && events.push({ type: 'boost', index: i, x: bo.x, z: bo.z });
    }
  }

  // goal
  const g = goalPosition(level, s.t, pos, s._bv);
  const gd = Math.hypot(b.x - g.x, b.z - g.z);
  if (gd < CFG.goalR) {
    b.state = 'holed';
    events && events.push({ type: 'holed', x: g.x, z: g.z, speed: Math.hypot(b.vx, b.vz) });
    s.t += dt; return;
  }

  // out of bounds / drift
  const bounds = level.bounds || CFG.bounds;
  if (b.x * b.x + b.z * b.z > bounds * bounds) {
    b.state = 'lost'; events && events.push({ type: 'lost', reason: 'oob', x: b.x, z: b.z });
  } else if (b.flightTime > CFG.maxFlightTime) {
    b.state = 'lost'; events && events.push({ type: 'lost', reason: 'drift', x: b.x, z: b.z });
  }
  s.t += dt;
}

// Simulates a shot from the current state without touching it. Returns sample points.
export function predict(level, s, dirX, dirZ, power, maxTime = 3.2, every = 6) {
  const c = cloneState(s);
  shoot(level, c, dirX, dirZ, power);
  const pts = [];
  const ev = [];
  const n = Math.floor(maxTime / CFG.dt);
  for (let i = 0; i < n; i++) {
    step(level, c, ev);
    if (i % every === 0) pts.push({ x: c.ball.x, z: c.ball.z, v: Math.hypot(c.ball.vx, c.ball.vz) });
    if (c.ball.state !== 'flying') break;
  }
  return { points: pts, end: c.ball.state, events: ev };
}

// Runs a shot to completion; used by the validator.
export function simulateShot(level, s, dirX, dirZ, power, maxTime = CFG.maxFlightTime + 1) {
  const c = cloneState(s);
  shoot(level, c, dirX, dirZ, power);
  const ev = [];
  const n = Math.floor(maxTime / CFG.dt);
  for (let i = 0; i < n; i++) {
    step(level, c, ev);
    if (c.ball.state !== 'flying') break;
  }
  return { state: c, events: ev };
}

export { TAU };
