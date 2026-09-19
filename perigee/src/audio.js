// Perigee — tiny procedural WebAudio synth. No samples, everything is generated.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('perigee.muted') === '1';
    this.master = null;
    this.rollGain = null;
    this.rollFilter = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(this.ctx.destination);
    this._ambient();
    this._rollLoop();
  }

  setMuted(m) {
    this.muted = m;
    localStorage.setItem('perigee.muted', m ? '1' : '0');
    if (this.master) this.master.gain.linearRampToValueAtTime(m ? 0 : 0.8, this.ctx.currentTime + 0.1);
  }

  _ambient() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.045;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.7;
    const freqs = [55, 82.4, 110.2, 164.6];
    freqs.forEach((fr, i) => {
      const o = c.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = fr * (1 + (i - 1.5) * 0.0015);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.05 + i * 0.013;
      const lg = c.createGain(); lg.gain.value = fr * 0.004;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      o.connect(f); o.start();
    });
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.07;
    const lg2 = c.createGain(); lg2.gain.value = 120;
    lfo2.connect(lg2); lg2.connect(f.frequency); lfo2.start();
    f.connect(g); g.connect(this.master);
  }

  _rollLoop() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    this.rollFilter = c.createBiquadFilter(); this.rollFilter.type = 'bandpass'; this.rollFilter.frequency.value = 220; this.rollFilter.Q.value = 1.2;
    this.rollGain = c.createGain(); this.rollGain.gain.value = 0;
    src.connect(this.rollFilter); this.rollFilter.connect(this.rollGain); this.rollGain.connect(this.master);
    src.start();
  }

  roll(speed, rolling) {
    if (!this.ctx) return;
    const target = rolling ? Math.min(0.25, speed * 0.03) : 0;
    this.rollGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
    this.rollFilter.frequency.setTargetAtTime(160 + speed * 40, this.ctx.currentTime, 0.05);
  }

  _env(node, t, a, d, peak = 1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g); g.connect(this.master);
    return g;
  }

  _noise(dur) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(); s.buffer = buf; return s;
  }

  shoot(power01) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const n = this._noise(0.4);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400 + power01 * 800, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.25);
    n.connect(f); this._env(f, t, 0.01, 0.35, 0.35 + power01 * 0.3); n.start(t);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880 + power01 * 600, t + 0.18);
    this._env(o, t, 0.005, 0.22, 0.25); o.start(t); o.stop(t + 0.3);
  }

  bounce(speed) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = Math.min(1, speed / 12);
    const o = c.createOscillator(); o.type = 'sine';
    const f0 = 90 + Math.random() * 30 + s * 60;
    o.frequency.setValueAtTime(f0 * 2.2, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
    this._env(o, t, 0.003, 0.18 + s * 0.15, 0.25 + s * 0.5); o.start(t); o.stop(t + 0.4);
    const n = this._noise(0.08);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200 + s * 2000;
    n.connect(f); this._env(f, t, 0.002, 0.07, 0.15 + s * 0.2); n.start(t);
  }

  boost() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.3);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(5000, t + 0.3);
    o.connect(f); this._env(f, t, 0.01, 0.35, 0.3); o.start(t); o.stop(t + 0.4);
  }

  holed(strokesUnderPar) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const base = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const extra = strokesUnderPar > 0 ? [1567.98, 2093] : [];
    [...base, ...extra].forEach((fr, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = fr;
      this._env(o, t + i * 0.07, 0.01, 0.6, 0.22); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.7);
    });
    const n = this._noise(1.2);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
    n.connect(f); this._env(f, t, 0.05, 1.0, 0.08); n.start(t);
  }

  lost(reason) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    if (reason === 'black' || reason === 'sun') {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.7);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      o.connect(f); this._env(f, t, 0.01, 0.7, 0.35); o.start(t); o.stop(t + 0.8);
      const n = this._noise(0.6);
      const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.setValueAtTime(4000, t); nf.frequency.exponentialRampToValueAtTime(100, t + 0.6);
      n.connect(nf); this._env(nf, t, 0.005, 0.55, 0.3); n.start(t);
    } else {
      [440, 349.2, 261.6].forEach((fr, i) => {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = fr;
        this._env(o, t + i * 0.12, 0.01, 0.3, 0.18); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.35);
      });
    }
  }

  click() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1200;
    this._env(o, t, 0.002, 0.05, 0.08); o.start(t); o.stop(t + 0.07);
  }

  rest() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 660;
    this._env(o, t, 0.005, 0.12, 0.12); o.start(t); o.stop(t + 0.15);
  }
}
