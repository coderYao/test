'use strict';
// ---------- progress between runs: lifetime totals, koi varieties to unlock, daily goals and the streak ----------
// Saved as one JSON blob through Platform.storage (the portal's synced data module, or localStorage).
const KOI_UNLOCKS = {
  shu:    null,
  kohaku: { zh: '累计游 1000 丈', en: 'Swim 1,000 丈 in total', val: d => d.dist, need: 1000 },
  tancho: { zh: '累计收 100 墨珠', en: 'Collect 100 pearls in total', val: d => d.pearls, need: 100 },
  asagi:  { zh: '一局连珠 ×8', en: 'Chain an ×8 pearl combo', val: d => d.bestCombo, need: 8 },
  showa:  { zh: '累计过 3 道龙门', en: 'Swim through 3 Dragon Gates', val: d => d.gates, need: 3 },
  ogon:   { zh: '一局得 3000 分', en: 'Score 3,000 in one run', val: d => d.bestScore, need: 3000 },
  sumi:   { zh: '完成 6 个每日目标', en: 'Complete 6 daily goals', val: d => d.seals, need: 6 },
};

// daily goals: one stat per goal, measured within a single run; the tier is picked by the day's seed
const GOAL_POOL = [
  { stat: 'dist',   tiers: [400, 700, 1000], zh: n => `一局游 ${n} 丈`, en: n => `Swim ${n} 丈 in one run` },
  { stat: 'pearls', tiers: [15, 25, 40],     zh: n => `一局收 ${n} 墨珠`, en: n => `Collect ${n} pearls in one run` },
  { stat: 'combo',  tiers: [5, 7, 9],        zh: n => `连珠 ×${n}`, en: n => `Chain an ×${n} pearl combo` },
  { stat: 'rings',  tiers: [4, 7, 10],       zh: n => `穿过 ${n} 个圆相`, en: n => `Swim through ${n} ensō rings` },
  { stat: 'leaps',  tiers: [3, 6, 10],       zh: n => `鲤跃 ${n} 次`, en: n => `Leap between strokes ${n} times` },
  { stat: 'form',   tiers: [1, 2, 3],        zh: n => `一局化为${FORMS[n].zh}`, en: n => `Evolve into a ${FORMS[n].en} in one run` },
  { stat: 'close',  tiers: [2, 3, 5],        zh: n => `险过鱼钩 ${n} 次`, en: n => `Slip past ${n} hooks by a whisker` },
  { stat: 'flow',   tiers: [3, 4, 5],        zh: n => `流势达 ×${n}`, en: n => `Reach a ×${n} flow` },
];

const Progress = (() => {
  const KEY = 'moli.progress';
  const dayNum = (t = Date.now()) => { const d = new Date(t); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); };
  const fresh = () => ({
    v: 1, runs: 0, dist: 0, pearls: 0, lotus: 0, rings: 0, gates: 0, leaps: 0,
    bestScore: 0, bestDist: 0, bestCombo: 0, bestForm: 0, seals: 0,
    koi: 'shu', unlocked: ['shu'], seen: ['shu'],
    goalDay: -1, goals: [], streak: 0, lastDay: -1,
  });
  let d = fresh();

  function load() {
    let saved = null;
    try { saved = JSON.parse(Platform.storage.get(KEY) || 'null'); } catch (e) { saved = null; }
    d = Object.assign(fresh(), saved && typeof saved === 'object' ? saved : {});
    // players from before progress existed keep their best score
    const old = +(Platform.storage.get('moli.best') || 0);
    if (old > d.bestScore) d.bestScore = old;
    rollDay();
    return d;
  }
  // The portal's synced save turned up after the game started from local data. Fold the two together, keeping the
  // better of every record, so neither side's progress is lost, then write the result back.
  function adopt() {
    let acct = null;
    try { acct = JSON.parse(Platform.storage.get(KEY) || 'null'); } catch (e) { acct = null; }
    const a = Object.assign(fresh(), acct && typeof acct === 'object' ? acct : {}), b = d;
    a.bestScore = Math.max(a.bestScore, +(Platform.storage.get('moli.best') || 0));
    const m = Object.assign(fresh(), a);
    for (const k of ['runs', 'dist', 'pearls', 'lotus', 'rings', 'gates', 'leaps', 'seals', 'bestScore', 'bestDist', 'bestCombo', 'bestForm']) m[k] = Math.max(a[k] || 0, b[k] || 0);
    m.unlocked = [...new Set([...a.unlocked, ...b.unlocked])];
    m.koi = m.unlocked.includes(a.koi) ? a.koi : 'shu';
    // streak: the later record wins, but a play on the day after the other record's last day continues its run
    const late = b.lastDay > a.lastDay ? b : a, early = late === b ? a : b;
    m.lastDay = late.lastDay;
    m.streak = a.lastDay === b.lastDay ? Math.max(a.streak, b.streak) : late.lastDay - early.lastDay === 1 ? Math.max(late.streak, early.streak + 1) : late.streak;
    if (a.goalDay === b.goalDay && a.goals.length === b.goals.length) {
      m.goals = a.goals.map((g, i) => ({ ...g, best: Math.max(g.best, b.goals[i].best), done: g.done || b.goals[i].done }));
    } else { const g = b.goalDay > a.goalDay ? b : a; m.goalDay = g.goalDay; m.goals = g.goals; }
    d = m;
    rollDay(); save();
    return d;
  }

  function save() {
    Platform.storage.set(KEY, JSON.stringify(d));
    Platform.storage.set('moli.best', String(d.bestScore));
  }

  function rollDay() {
    const today = dayNum();
    // keep today's goals, unless they were drawn from an older pool this version no longer has
    if (d.goalDay === today && d.goals.length === 3 && d.goals.every(g => GOAL_POOL.some(p => p.stat === g.stat))) return;
    const rng = mulberry32(today * 2654435761 >>> 0);
    const pool = GOAL_POOL.slice();
    const goals = [];
    for (let i = 0; i < 3; i++) {
      const g = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      // the first goal of the day is gentle, the last is a stretch
      const n = g.tiers[Math.min(g.tiers.length - 1, i)];
      goals.push({ stat: g.stat, n, best: 0, done: false });
    }
    d.goalDay = today; d.goals = goals;
  }

  const goalText = g => { const def = GOAL_POOL.find(p => p.stat === g.stat); return { zh: def.zh(g.n), en: def.en(g.n) }; };

  // called when a run begins: counts the streak of days played
  function beginRun() {
    rollDay();
    const today = dayNum();
    if (d.lastDay !== today) { d.streak = d.lastDay === today - 1 ? d.streak + 1 : 1; d.lastDay = today; save(); }
  }

  // live check during a run: returns goals completed just now, so the game can stamp them on screen
  function check(run) {
    const done = [];
    for (const g of d.goals) {
      const v = run[g.stat] || 0;
      if (v > g.best) g.best = v;
      if (!g.done && v >= g.n) { g.done = true; d.seals++; done.push(g); }
    }
    if (done.length) save();
    return done;
  }

  // the run is over: fold it into the lifetime totals and report what it unlocked
  function endRun(run) {
    check(run);
    d.runs++; d.dist += run.dist; d.pearls += run.pearls; d.lotus += run.lotus;
    d.rings += run.rings; d.gates += run.gates; d.leaps += run.leaps;
    const prevBest = d.bestScore, prevDist = d.bestDist;
    d.bestScore = Math.max(d.bestScore, run.score);
    d.bestDist = Math.max(d.bestDist, run.dist);
    d.bestCombo = Math.max(d.bestCombo, run.combo);
    d.bestForm = Math.max(d.bestForm, run.form || 0);
    const fresh = [];
    for (const id of KOI_ORDER) {
      const u = KOI_UNLOCKS[id];
      if (!u || d.unlocked.includes(id)) continue;
      if (u.val(d) >= u.need) { d.unlocked.push(id); fresh.push(id); }
    }
    save();
    return { newKoi: fresh, newBest: prevBest > 0 && run.score > prevBest, prevBest, prevDist };
  }

  // the locked variety closest to being earned, with its progress
  function nextUnlock() {
    let best = null;
    for (const id of KOI_ORDER) {
      const u = KOI_UNLOCKS[id];
      if (!u || d.unlocked.includes(id)) continue;
      const f = clamp(u.val(d) / u.need, 0, 0.999);
      if (!best || f > best.f) best = { id, f, cur: Math.floor(u.val(d)), need: u.need, u };
    }
    return best;
  }

  function choose(id) { if (d.unlocked.includes(id)) { d.koi = id; save(); } }

  return { load, adopt, save, beginRun, check, endRun, nextUnlock, choose, goalText, get data() { return d; } };
})();
