// Perigee — hole definitions.
// Coordinates are in the XZ plane. Body types: planet | gas | ice | lava | black | sun | repulsor.
// A body with `orbit` moves: { parent: index|-1, dist, speed (rad/s), phase, cx, cz }.

export const COURSE = [
  {
    name: 'First Light', par: 2,
    hint: 'Drag back from anywhere and release to putt. The tee planet pulls on the ball, so give it some power.',
    bodies: [
      { type: 'planet', x: -16, z: 0, r: 2.6, m: 26, palette: 'terra' },
    ],
    start: { body: 0, angle: 0 },
    goal: { x: 15, z: 0 },
  },
  {
    name: 'Slingshot', par: 2,
    hint: 'The gas giant bends every shot. Aim past it and let gravity swing you round.',
    bodies: [
      { type: 'planet', x: -22, z: -4, r: 2.4, m: 22, palette: 'dune' },
      { type: 'gas', x: 2, z: 5, r: 4.6, m: 95, palette: 'jovian', ring: true },
    ],
    start: { body: 0, angle: 20 },
    goal: { x: 20, z: -12 },
  },
  {
    name: 'Twin Moons', par: 3,
    hint: 'Moons move, and so does anything resting on them. Watch the timing and land where you like.',
    bodies: [
      { type: 'planet', x: 0, z: 0, r: 3.4, m: 60, palette: 'terra' },
      { type: 'ice', r: 1.3, m: 9, palette: 'ice', orbit: { parent: 0, dist: 10, speed: 0.55, phase: 3.2 } },
      { type: 'ice', r: 1.1, m: 7, palette: 'ice', orbit: { parent: 0, dist: 15.5, speed: -0.32, phase: 1.1 } },
      { type: 'planet', x: -27, z: 8, r: 2.2, m: 18, palette: 'dune' },
    ],
    start: { body: 3, angle: 60 },
    goal: { x: 24, z: -9 },
  },
  {
    name: 'Event Horizon', par: 3,
    hint: 'The black hole eats anything that touches it, but its pull makes for a beautiful curve.',
    bodies: [
      { type: 'planet', x: -24, z: 10, r: 2.4, m: 22, palette: 'lava' },
      { type: 'black', x: 0, z: 0, r: 2.2, m: 150 },
      { type: 'planet', x: 22, z: 13, r: 2.0, m: 16, palette: 'dune' },
    ],
    start: { body: 0, angle: -30 },
    goal: { x: 18, z: -14 },
  },
  {
    name: 'Repulse', par: 3,
    hint: 'Purple repulsors push instead of pull. Bounce through the corridor they make.',
    bodies: [
      { type: 'planet', x: -26, z: 0, r: 2.4, m: 22, palette: 'ice' },
      { type: 'repulsor', x: -4, z: 11, r: 2.0, m: -70 },
      { type: 'repulsor', x: 4, z: -11, r: 2.0, m: -70 },
      { type: 'planet', x: 26, z: 2, r: 2.6, m: 24, palette: 'terra' },
      { type: 'repulsor', x: 14, z: 16, r: 1.6, m: -40 },
    ],
    start: { body: 0, angle: 10 },
    goal: { x: 27, z: -9 },
  },
  {
    name: 'Boost Lane', par: 3,
    hint: 'Boost rings fire you along their arrow. Chain them.',
    bodies: [
      { type: 'planet', x: -28, z: -14, r: 2.3, m: 20, palette: 'dune' },
      { type: 'gas', x: 6, z: 2, r: 5, m: 110, palette: 'jovian', ring: true },
      { type: 'planet', x: 28, z: 16, r: 2.0, m: 16, palette: 'lava' },
    ],
    boosts: [
      { x: -12, z: -18, angle: 10, strength: 12 },
      { x: 20, z: -16, angle: 100, strength: 11 },
    ],
    start: { body: 0, angle: 45 },
    goal: { x: 22, z: 4 },
  },
  {
    name: 'Solar Flare', par: 4,
    hint: 'The sun burns. The hole itself is in orbit, so lead your target.',
    bodies: [
      { type: 'planet', x: -30, z: 0, r: 2.4, m: 22, palette: 'ice' },
      { type: 'sun', x: 2, z: 0, r: 4.2, m: 120 },
      { type: 'planet', r: 1.8, m: 14, palette: 'lava', orbit: { parent: 1, dist: 16, speed: 0.35, phase: 2.0 } },
    ],
    start: { body: 0, angle: 30 },
    goal: { orbit: { parent: 1, dist: 24, speed: 0.22, phase: 0.4 } },
  },
  {
    name: 'Binary', par: 4,
    hint: 'Two worlds waltz around an empty centre. Ride one, tee off, and thread the gap.',
    bodies: [
      { type: 'planet', x: -32, z: 6, r: 2.2, m: 18, palette: 'dune' },
      { type: 'planet', r: 3.0, m: 55, palette: 'terra', orbit: { parent: -1, cx: 0, cz: 0, dist: 8, speed: 0.4, phase: 0 } },
      { type: 'ice', r: 3.0, m: 55, palette: 'ice', orbit: { parent: -1, cx: 0, cz: 0, dist: 8, speed: 0.4, phase: Math.PI } },
      { type: 'repulsor', x: 16, z: 18, r: 1.8, m: -50 },
    ],
    start: { body: 0, angle: 0 },
    goal: { x: 30, z: -8 },
  },
  {
    name: 'Perigee', par: 5,
    hint: 'Everything at once. Perigee is the closest point of an orbit; get there in one piece.',
    bodies: [
      { type: 'planet', x: -34, z: -10, r: 2.4, m: 22, palette: 'lava' },
      { type: 'black', x: -6, z: 4, r: 2.0, m: 120 },
      { type: 'gas', x: 16, z: -12, r: 4.4, m: 90, palette: 'jovian', ring: true },
      { type: 'ice', r: 1.4, m: 10, palette: 'ice', orbit: { parent: 2, dist: 9, speed: 0.6, phase: 0.5 } },
      { type: 'repulsor', x: 8, z: 18, r: 1.8, m: -60 },
      { type: 'sun', x: 34, z: 14, r: 3.6, m: 90 },
    ],
    boosts: [{ x: -14, z: -22, angle: 15, strength: 12 }],
    start: { body: 0, angle: 80 },
    goal: { orbit: { parent: 5, dist: 12, speed: -0.4, phase: 2.5 } },
  },
];

// ---------- seeded random holes ----------

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const PALETTES = ['terra', 'dune', 'ice', 'lava'];

export function generateHole(seed, difficulty = 1) {
  const rnd = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const range = (a, b) => a + rnd() * (b - a);
  const bodies = [];
  const teeAngle = range(0, Math.PI * 2);
  const teeDist = 26 + difficulty * 2;
  const tee = { type: 'planet', x: Math.cos(teeAngle) * teeDist, z: Math.sin(teeAngle) * teeDist, r: range(2.0, 2.8), m: range(18, 26), palette: pick(PALETTES) };
  bodies.push(tee);
  const goalAngle = teeAngle + Math.PI + range(-0.6, 0.6);
  const goalDist = 22 + difficulty * 2;
  const goal = { x: Math.cos(goalAngle) * goalDist, z: Math.sin(goalAngle) * goalDist };
  const placed = [{ x: tee.x, z: tee.z, r: tee.r }, { x: goal.x, z: goal.z, r: 3 }];
  const n = 2 + Math.min(4, Math.floor(difficulty * 1.2 + rnd() * 2));
  const types = ['planet', 'planet', 'gas', 'ice', 'repulsor', 'black', 'sun'];
  let tries = 0;
  while (bodies.length < n + 1 && tries++ < 200) {
    const type = difficulty < 1.5 ? pick(types.slice(0, 5)) : pick(types);
    const r = type === 'gas' ? range(3.6, 5) : type === 'sun' ? range(3, 4) : type === 'black' ? range(1.8, 2.4) : range(1.4, 2.8);
    const x = range(-22, 22), z = range(-22, 22);
    if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 6)) continue;
    const m = type === 'repulsor' ? -range(40, 80) : type === 'black' ? range(100, 160) : type === 'gas' ? range(70, 110) : type === 'sun' ? range(80, 120) : r * range(7, 11);
    const body = { type, x, z, r, m, palette: type === 'ice' ? 'ice' : type === 'gas' ? 'jovian' : pick(PALETTES), ring: type === 'gas' && rnd() < 0.7 };
    if ((type === 'planet' || type === 'ice') && rnd() < 0.5 && difficulty > 0.8) {
      // turn into a moon of an existing big body if there is one
      const parentIdx = bodies.findIndex(b => b.type === 'gas' || (b.type === 'planet' && b.r > 2.6));
      if (parentIdx > 0) {
        const parent = bodies[parentIdx];
        delete body.x; delete body.z;
        body.orbit = { parent: parentIdx, dist: parent.r + r + range(3, 7), speed: range(0.3, 0.7) * (rnd() < 0.5 ? -1 : 1), phase: range(0, 6.28) };
        body.r = Math.min(body.r, 1.6); body.m = body.r * 7;
        bodies.push(body);
        continue;
      }
    }
    bodies.push(body);
    placed.push({ x, z, r });
  }
  const boosts = [];
  if (rnd() < 0.5 * difficulty) {
    boosts.push({ x: range(-18, 18), z: range(-18, 18), angle: range(0, 360), strength: 11 });
  }
  const par = Math.min(5, 2 + Math.round(difficulty));
  return {
    name: `Sector ${(seed % 9000 + 1000)}`,
    par, seed,
    hint: 'A procedurally generated hole. Every seed is a new sky.',
    bodies, boosts,
    start: { body: 0, angle: (goalAngle * 180 / Math.PI) },
    goal,
  };
}

export function dailySeed() {
  const d = new Date();
  return hashSeed(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`);
}
