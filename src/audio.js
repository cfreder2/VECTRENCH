// Synthesised sound. No samples to load, which keeps the whole game one small
// download and means audio survives being opened offline.
//
// The engine drone and the music are the only persistent voices; everything
// else is a fire-and-forget node graph that disconnects itself when it finishes.

import { Music } from './music.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.music = null;
    this.musicWanted = true;
    this._flying = false;
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
    ng.gain.value = 0.055;
    n.connect(ng); ng.connect(filt);
    n.start();
    this.engineGain = g;
    this.engineFilter = filt;

    this.music = new Music(ctx, master, this._noise(2));
    this.music.setEnabled(this.musicWanted);
    this._watchPage();
  }

  /**
   * Come back from being away.
   *
   * A browser suspends the audio context when the page stops being visible --
   * switching apps on a phone, locking it, another tab -- and nothing resumes
   * it on the way back, so the game returned silent and stayed silent for the
   * rest of the run. The scheduler and the engine survive it; only the clock
   * they are hung on stops, so resuming is the whole repair.
   */
  _watchPage() {
    const back = () => this.resume();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) back(); });
    window.addEventListener('pageshow', back);
    window.addEventListener('focus', back);
    // iOS can refuse a resume that is not inside a gesture, so try the first
    // touch after coming back as well. Resuming a running context is a no-op.
    for (const ev of ['pointerdown', 'touchend', 'keydown']) {
      window.addEventListener(ev, back, { passive: true });
    }
  }

  /** Safe to call at any time, from anywhere, however often. */
  resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') {
      try { this.ctx.resume()?.catch?.(() => {}); } catch { /* not resumable yet */ }
    }
    // If the run is still going, the music should be too. start() is a no-op
    // when it never stopped, so this only revives a scheduler that was killed.
    if (this._flying && this.musicWanted) this.music?.start();
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
    this.engineGain.gain.setTargetAtTime(level * 0.085, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.15);
    for (const o of this.engine) {
      o.frequency.setTargetAtTime(48 + throttle * 44, t, 0.15);
    }
  }

  /** The checkbox: remembered even if it is flipped before audio exists. */
  setMusicEnabled(on) {
    this.musicWanted = on;
    if (this.music) {
      this.music.setEnabled(on);
      if (on && this._flying) this.music.start();
    }
  }

  musicStart(song) {
    this._flying = true;
    if (song) this.music?.setSong(song);
    this.music?.setLevel(1);
    this.music?.start();
  }
  musicStop() { this._flying = false; this.music?.stop(); }
  /** The score keeps pace with the ship. 1 is the written tempo. */
  setMusicRate(r) { this.music?.setRate(r); }
  /** 0 while a run is ending, so the win and loss stings play in the clear. */
  setMusicLevel(v) { this.music?.setLevel(v); }

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

  // Three voices, all short: the crack of the discharge, a square body that
  // falls too fast to read as a pitch, and a thump underneath. Each shot is
  // detuned a little, because eleven identical rounds a second stop sounding
  // like a gun and start sounding like a note.
  gun() {
    const v = 0.9 + Math.random() * 0.2;
    this._noiseBurst(0.07, 0.8, 3000 * v, 320, 1.2);
    this._tone('square', 300 * v, 60, 0.085, 0.45);
    this._tone('sine', 96 * v, 42, 0.13, 0.3);
  }
  enemyShot() { this._tone('sawtooth', 620, 180, 0.14, 0.1); }
  hit() { this._noiseBurst(0.13, 0.22, 2600, 700, 2); }

  /**
   * One spark of a live arc stream: tiny, bright, and randomized, fired
   * thirty-odd times a second while the weapon is held. The crackle is the
   * irregularity -- evenly spaced ticks read as a motor, not lightning.
   */
  crackle() {
    const v = 0.7 + Math.random() * 0.6;
    this._noiseBurst(0.025 + Math.random() * 0.02, 0.32, 7200 * v, 2400, 3);
    if (Math.random() < 0.35) this._tone('square', 2400 * v, 300, 0.04, 0.08);
  }

  /** The arc: a crackle and a falling whine, over before the next one. */
  zap() {
    const v = 0.92 + Math.random() * 0.16;
    this._noiseBurst(0.06, 0.5, 5200 * v, 900, 2);
    this._tone('sawtooth', 1900 * v, 240, 0.11, 0.22);
    this._tone('square', 640 * v, 90, 0.07, 0.14);
  }

  /** A diamond gate taken: two quick notes up. A prism: three, higher. */
  diamond(prism = false) {
    const base = prism ? 880 : 660;
    this._tone('triangle', base, base, 0.09, 0.3);
    setTimeout(() => this._tone('triangle', base * 1.5, base * 1.5, 0.11, 0.3), 70);
    if (prism) setTimeout(() => this._tone('triangle', base * 2, base * 2, 0.14, 0.3), 140);
  }

  /** The exit: everything winds up and out. */
  lightspeed() {
    this._tone('sawtooth', 160, 2400, 1.5, 0.22);
    this._tone('square', 80, 1200, 1.5, 0.12);
    this._noiseBurst(1.5, 0.3, 900, 8000, 0.8);
  }

  /**
   * The weapon-get fanfare: the one melody in the game that is not in the
   * score book, because it is not a song -- it is a jingle, and a jingle is
   * an event. Rising arpeggio twice, then the long note with the harmony a
   * third under it. About three seconds, played over a quiet screen.
   */
  weaponGet() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    const note = (f, at, dur, gain, type = 'square') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t0 + at);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(gain, t0 + at + 0.01);
      g.gain.setValueAtTime(gain, t0 + at + dur - 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0 + at);
      o.stop(t0 + at + dur + 0.05);
      o.onended = () => { try { g.disconnect(); } catch {} };
    };
    // e5 g5 b5 e6, twice, quick -- then d6 c6, and the held e6 over c6.
    const E5 = 659.26, G5 = 783.99, B5 = 987.77, E6 = 1318.5, D6 = 1174.7, C6 = 1046.5;
    let at = 0;
    for (let r = 0; r < 2; r++) {
      for (const f of [E5, G5, B5, E6]) { note(f, at, 0.11, 0.16); at += 0.09; }
      at += 0.06;
    }
    note(D6, at, 0.14, 0.16); at += 0.14;
    note(C6, at, 0.14, 0.16); at += 0.14;
    note(E6, at, 1.1, 0.18);
    note(C6, at, 1.1, 0.1);          // the third under, the harmony
    note(E5 / 2, at, 1.1, 0.12, 'triangle');   // and the floor
  }

  /** The special coming online: a rising charge. */
  specialOn() {
    this._tone('sawtooth', 220, 1400, 0.28, 0.2);
    this._noiseBurst(0.2, 0.18, 3200, 1400, 1.5);
  }
  scrape() { this._noiseBurst(0.3, 0.3, 1400, 200, 6); }
  smallBoom() { this._noiseBurst(0.55, 0.42, 1500, 60); this._tone('triangle', 180, 40, 0.4, 0.2); }
  bigBoom() {
    this._noiseBurst(1.5, 0.6, 1900, 35);
    this._tone('triangle', 130, 24, 1.1, 0.34);
    this._tone('sawtooth', 90, 20, 1.4, 0.18);
  }
  lockTick() { this._tone('sine', 1250, 1250, 0.045, 0.1); }
  lockOn() { this._tone('sine', 900, 1750, 0.16, 0.15); }
  /**
   * The launch, in two halves: air swelling as the tube empties, then the
   * motor running away from you. The swell is what makes it a swish rather
   * than a hiss -- a noise burst that starts at full volume reads as static.
   *
   * `vol` also shortens it, because a battery empties a rack of twelve at
   * one sixth of a second apart and full-length swishes pile into a wash.
   */
  missile(vol = 1) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.42 + 0.34 * vol;
    const s = ctx.createBufferSource();
    s.buffer = this._noise(1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    // Up as it clears the rail, then down as it opens the distance.
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.3);
    bp.frequency.exponentialRampToValueAtTime(380, t + dur);
    s.connect(bp);
    const g = this._env(bp, 0.55 * vol, dur, dur * 0.24);
    s.start(t);
    s.stop(t + dur + 0.03);
    s.onended = () => { try { g.disconnect(); } catch {} };
    this._tone('sine', 160, 46, 0.24, 0.2 * vol);       // ignition
    this._tone('sawtooth', 430, 120, dur, 0.07 * vol);  // motor, pitching away
  }

  /**
   * The arrival. Most of the weight sits between 80 and 200Hz on purpose: a
   * boom built out of sub-bass measures huge and is inaudible on the phone
   * speaker this game is meant to be played through. The sub is still there
   * underneath it for anyone on headphones.
   */
  missileHit() {
    this._noiseBurst(0.1, 0.85, 6000, 900, 1);    // the crack of it arriving
    this._noiseBurst(1.1, 1.15, 1200, 190, 1);    // the rumble that carries
    this._tone('triangle', 190, 44, 0.55, 0.75);  // chest
    this._tone('sine', 95, 30, 0.85, 0.5);        // sub, for headphones
  }
  /** A sunburst arm letting go: short, thin, and low enough to sit under the gun. */
  beam() {
    this._tone('sawtooth', 900, 240, 0.13, 0.075);
    this._noiseBurst(0.1, 0.1, 5200, 1400, 2);
  }

  /** The burn lighting: a rising sweep with air behind it. */
  boost() {
    this._noiseBurst(0.55, 0.34, 700, 3600, 1.4);
    this._tone('sawtooth', 180, 620, 0.5, 0.16);
    this._tone('sine', 90, 300, 0.45, 0.14);
  }

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
