// Quick smoke test: shoot a few times on the first hole and print what happens.
import { COURSE } from '../src/levels.js';
import { createState, simulateShot } from '../src/physics.js';
const s = createState(COURSE[0]);
for (const p of [6, 12, 18, 24, 30]) {
  const r = simulateShot(COURSE[0], s, 1, 0, p);
  console.log(`power ${p}: ${r.state.ball.state} after ${r.state.ball.flightTime.toFixed(2)}s  events=${r.events.map(e => e.type + (e.reason ? ':' + e.reason : '')).join(',')}`);
}
