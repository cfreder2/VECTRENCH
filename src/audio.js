// Synthesised sound. No samples to load, which keeps the whole game one small
// download and means audio survives being opened offline.
//
// The engine drone is the only persistent voice; everything else is a
// fire-and-forget node graph that disconnects itself when it finishes.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.engineFilter = null;
  }

  /** Must run inside a user gesture, or the context starts suspended. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // Engine: two detuned saws under a lowpass, plus a breath of noise.
    const g = ctx.createGain();
    g.gain.value = 0;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    filt.Q.value = 3;
    g.connect(filt);
    filt.connect(master);
    for (const detune of [-9, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 62;
      o.detune.value = detune;
      o.connect(g);
      o.start();
      if (!this.engine) this.engine = [];
      this.engine.push(o);
    }
    const n = ctx.createBufferSource();
    n.buffer = this._noise(2);
    n.loop = true;
    const ng = ctx.createGain();
    ng.gain.value = 0.09;
    n.connect(ng); ng.connect(filt);
    n.start();
    this.engineGain = g;
    this.engineFilter = filt;
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  /** `throttle` 0..1 drives pitch and brightness; `level` fades the whole voice. */
  setEngine(throttle, level) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(level * 0.13, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.15);
    for (const o of this.engine) {
      o.frequency.setTargetAtTime(48 + throttle * 44, t, 0.15);
    }
  }

  _env(node, gain, dur, attack = 0.005) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  _tone(type, f0, f1, dur, gain) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._env(o, gain, dur);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => { try { g.disconnect(); } catch {} };
  }

  _noiseBurst(dur, gain, f0, f1, q = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this._noise(Math.max(0.25, dur));
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    s.connect(f);
    const g = this._env(f, gain, dur, 0.002);
    s.start(t);
    s.stop(t + dur + 0.02);
    s.onended = () => { try { g.disconnect(); } catch {} };
  }

  laser() { this._tone('square', 1500, 260, 0.1, 0.16); }
  enemyShot() { this._tone('sawtooth', 620, 180, 0.14, 0.1); }
  hit() { this._noiseBurst(0.13, 0.22, 2600, 700, 2); }
  scrape() { this._noiseBurst(0.3, 0.3, 1400, 200, 6); }
  smallBoom() { this._noiseBurst(0.55, 0.42, 1500, 60); this._tone('triangle', 180, 40, 0.4, 0.2); }
  bigBoom() {
    this._noiseBurst(1.5, 0.6, 1900, 35);
    this._tone('triangle', 130, 24, 1.1, 0.34);
    this._tone('sawtooth', 90, 20, 1.4, 0.18);
  }
  lockTick() { this._tone('sine', 1250, 1250, 0.045, 0.1); }
  lockOn() { this._tone('sine', 900, 1750, 0.16, 0.15); }
  missile() { this._noiseBurst(0.7, 0.3, 400, 2400, 3); this._tone('sawtooth', 200, 900, 0.5, 0.12); }
  alarm() { this._tone('square', 520, 380, 0.22, 0.09); }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._tone('triangle', f, f, 0.3, 0.18), i * 130);
    });
  }
  lose() {
    [400, 320, 250, 170].forEach((f, i) => {
      setTimeout(() => this._tone('sawtooth', f, f * 0.8, 0.35, 0.16), i * 160);
    });
  }
}
