'use strict';
// ---------- procedural audio: guqin plucks, water, brush scratch, ambience ----------
const Audio = (() => {
  let ac = null, master = null, muted = false, ducked = false, ready = false;
  let brushGain = null, brushSrc = null, ambGain = null;
  const pluckCache = new Map();
  // D major pentatonic across two octaves (D E F# A B)
  const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];

  function init() {
    if (ready) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ac.createGain();
    master.gain.value = muted || ducked ? 0 : 0.8;
    master.connect(ac.destination);
    ready = true;
    startAmbience();
    startBrushNoise();
  }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }

  function noiseBuffer(sec, brown) {
    const len = Math.floor(ac.sampleRate * sec);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return buf;
  }

  // Karplus-Strong string, softened to sound like a silk-string guqin
  function pluckBuffer(freq) {
    if (pluckCache.has(freq)) return pluckCache.get(freq);
    const sr = ac.sampleRate, N = Math.round(sr / freq), dur = 2.2;
    const len = Math.floor(sr * dur);
    const buf = ac.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(N);
    let p = 0;
    for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; p = p * 0.6 + w * 0.4; ring[i] = p; }
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx], nxt = ring[(idx + 1) % N];
      out[i] = cur;
      ring[idx] = (cur + nxt) * 0.5 * 0.9965;
      idx = (idx + 1) % N;
    }
    pluckCache.set(freq, buf);
    return buf;
  }

  function pluck(noteIdx, vol = 0.5, when = 0) {
    if (!ready || muted) return;
    const freq = SCALE[clamp(noteIdx | 0, 0, SCALE.length - 1)];
    const src = ac.createBufferSource();
    src.buffer = pluckBuffer(freq);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5;
    const g = ac.createGain();
    const t = ac.currentTime + Math.max(0, when);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(t); src.stop(t + 2.1);
  }

  function splash(vol = 0.4, pitch = 1) {
    if (!ready || muted) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(0.4, false);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 * pitch; bp.Q.value = 0.8;
    const g = ac.createGain(); const t = ac.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + 0.45);
    // a small drip on top
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(900 * pitch, t); o.frequency.exponentialRampToValueAtTime(380 * pitch, t + 0.09);
    const og = ac.createGain(); og.gain.setValueAtTime(vol * 0.4, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 0.15);
  }

  function drip(vol = 0.25) {
    if (!ready || muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1200, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.07);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.12);
  }

  function chord(base, vol = 0.4) {
    pluck(base, vol, 0); pluck(base + 2, vol * 0.8, 0.07); pluck(base + 4, vol * 0.7, 0.14);
  }

  function dissolve() {
    if (!ready || muted) return;
    pluck(4, 0.5, 0); pluck(2, 0.45, 0.25); pluck(0, 0.45, 0.5);
    splash(0.5, 0.6);
  }

  // 鲤跃: a breathy rush of air as the koi leaves the water
  function whoosh(vol = 0.25) {
    if (!ready || muted) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(0.5, false);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + 0.5);
  }

  // a temple gong for the dragon gate: inharmonic partials that bloom and fade slowly
  function gong(vol = 0.35) {
    if (!ready || muted) return;
    const t = ac.currentTime;
    [[98, 1], [98 * 2.76, 0.45], [98 * 5.4, 0.2], [98 * 1.5, 0.3]].forEach(([f, a]) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.01, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.6);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * a, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 3.2);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 3.3);
    });
    splash(0.2, 0.5);
  }

  // rising run up the scale: new records, new koi, goals met
  function arpeggio(from = 3, n = 5, vol = 0.4, gap = 0.07) {
    for (let i = 0; i < n; i++) pluck(from + i, vol * (1 - i * 0.08), i * gap);
  }

  // ---- generative music: sparse guqin phrases over a soft drone, busier as the flow builds ----
  let drone = null, droneLevel = -1, beatT = 0, beat = 0, note = 5, musicOn = false, intensity = 0;
  const BEAT = 0.44;
  function startDrone() {
    const g = ac.createGain(); g.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    [73.42, 110, 146.83].forEach((f, i) => {
      const o = ac.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const og = ac.createGain(); og.gain.value = [0.5, 0.3, 0.12][i];
      const wob = ac.createOscillator(); wob.frequency.value = 0.09 + i * 0.05; const wg = ac.createGain(); wg.gain.value = f * 0.004;
      wob.connect(wg); wg.connect(o.frequency); wob.start();
      o.connect(og); og.connect(lp); o.start();
    });
    lp.connect(g); g.connect(master);
    drone = g;
  }
  // call every frame. on: whether the scroll is in play; k: 0..1, how hot the run is
  function music(on, k) {
    if (!ready) return;
    if (!drone) { startDrone(); beatT = ac.currentTime + 0.5; }
    intensity = k; musicOn = on;
    const level = muted ? 0 : on ? 0.05 : 0.018;
    if (level !== droneLevel) { droneLevel = level; drone.gain.setTargetAtTime(level, ac.currentTime, muted ? 0.1 : 1.2); }
    if (muted) return;
    const now = ac.currentTime;
    if (beatT < now - 1) beatT = now + 0.05;  // tab was asleep: don't spray a backlog of notes
    while (beatT < now + 0.12) {
      const bar = beat % 8;
      const p = musicOn ? 0.28 + intensity * 0.5 : 0.16;
      if (bar === 0) pluck(musicOn ? [0, 3, 1, 4][(beat / 8 | 0) % 4] : 0, 0.13, beatT - now);
      else if (Math.random() < p) {
        note = clamp(note + [-2, -1, -1, 1, 1, 2, 0][Math.random() * 7 | 0], 3, 10);
        if (note >= 9 && Math.random() < 0.5) note -= 3;
        pluck(note, 0.07 + intensity * 0.05, beatT - now);
        if (musicOn && intensity > 0.6 && Math.random() < 0.3) pluck(note + 2, 0.05, beatT - now + BEAT / 2);
      }
      beat++; beatT += BEAT * (musicOn ? 1 : 1.5);
    }
  }

  function startAmbience() {
    const src = ac.createBufferSource(); src.buffer = noiseBuffer(4, true); src.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ac.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    ambGain = ac.createGain(); ambGain.gain.value = 0.0;
    src.connect(lp); lp.connect(ambGain); ambGain.connect(master); src.start();
    ambGain.gain.linearRampToValueAtTime(0.11, ac.currentTime + 3);
  }

  function startBrushNoise() {
    brushSrc = ac.createBufferSource(); brushSrc.buffer = noiseBuffer(2, false); brushSrc.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6;
    brushGain = ac.createGain(); brushGain.gain.value = 0;
    brushSrc.connect(bp); bp.connect(brushGain); brushGain.connect(master); brushSrc.start();
  }

  // 0..1 intensity of brush scratching this frame
  function brush(intensity) {
    if (!ready || !brushGain) return;
    const target = muted ? 0 : clamp(intensity, 0, 1) * 0.07;
    brushGain.gain.setTargetAtTime(target, ac.currentTime, 0.04);
  }

  const applyGain = () => { if (master) master.gain.setTargetAtTime(muted || ducked ? 0 : 0.8, ac.currentTime, 0.05); };
  function setMuted(m) { muted = m; applyGain(); }
  // silence imposed from outside (an ad is playing, the portal's mute setting); independent of the player's own mute
  function setDucked(d) { ducked = d; applyGain(); }

  return { init, resume, pluck, splash, drip, chord, dissolve, brush, whoosh, gong, arpeggio, music, setMuted, setDucked, isMuted: () => muted, isReady: () => ready };
})();
