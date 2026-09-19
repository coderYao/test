// Headless solvability check: grid-search angle x power for a hole-in-one from the tee,
// then from every distinct rest point reached by a first shot, check a second shot.
import { COURSE, generateHole } from '../src/levels.js';
import { CFG, createState, simulateShot, bodyPositions, goalPosition } from '../src/physics.js';

const ANG = 72, POW = 10;

function search(level, state) {
  let holes = 0, total = 0, lostN = 0, rests = [];
  const b = state.ball;
  for (let ai = 0; ai < ANG; ai++) {
    const a = ai / ANG * Math.PI * 2;
    for (let pi = 0; pi < POW; pi++) {
      const p = CFG.minPower + (CFG.maxPower - CFG.minPower) * (pi + 0.5) / POW;
      const r = simulateShot(level, state, Math.cos(a), Math.sin(a), p);
      total++;
      if (r.state.ball.state === 'holed') holes++;
      else if (r.state.ball.state === 'lost') lostN++;
      else if (r.state.ball.state === 'rest') rests.push(r.state);
    }
  }
  return { holes, total, lostN, rests };
}

function check(level, label) {
  const s = createState(level);
  const first = search(level, s);
  // sample a few rest states for second-shot success
  let second = 0, sampled = 0;
  const sample = first.rests.filter((_, i) => i % Math.max(1, Math.floor(first.rests.length / 12)) === 0).slice(0, 12);
  for (const rs of sample) {
    const r2 = search(level, rs);
    if (r2.holes > 0) second++;
    sampled++;
  }
  const pct = (100 * first.holes / first.total).toFixed(1);
  console.log(`${label.padEnd(16)} par ${level.par}  HIO ${String(first.holes).padStart(3)}/${first.total} (${pct}%)  lost ${(100 * first.lostN / first.total).toFixed(0)}%  2nd-shot ok ${second}/${sampled}`);
  return first.holes;
}

let bad = 0;
COURSE.forEach((l, i) => { if (check(l, `${i + 1}. ${l.name}`) === 0 && l.par <= 3) bad++; });
console.log('--- random holes ---');
for (let s = 1; s <= 6; s++) check(generateHole(s * 7919, 1 + s * 0.4), `seed ${s * 7919}`);
if (bad) { console.log(`\n${bad} short hole(s) have no hole-in-one line`); process.exit(1); }
