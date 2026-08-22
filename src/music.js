// The chip-tune player. One song at a time, from the score book in songs.js.
//
// Five voices, which is the NES's set and no accident: a pulse lead, a second
// pulse under it, a triangle sub, a bass, and noise. What makes a stage theme
// sound bigger than that is technique rather than more channels -- arpeggios
// standing in for chords, vibrato on anything held, and a bass that walks.
//
// Notes are scheduled ahead against the audio clock rather than played from a
// timer tick, because a setInterval on a busy frame drifts by tens of
// milliseconds, and at ten notes a second that is audible.

import { songFor, CHORDS, MIX } from './songs.js';

const SEMI = { c: 0, 'c#': 1, d: 2, 'd#': 3, e: 4, f: 5, 'f#': 6, g: 7, 'g#': 8, a: 9, 'a#': 10, b: 11 };

/** 'a#4' -> MIDI number. */
const midi = (name) => {
  const m = /^([a-g]#?)(-?\d)$/.exec(name);
  return m ? SEMI[m[1]] + (+m[2] + 1) * 12 : null;
};

const hz = (n) => 440 * 2 ** ((n - 69) / 12);

/**
 * A bar string into one entry per sixteenth.
 *
 * `.` holds the note before it and `-` rests, so a phrase's shape is legible in
 * the source: 'e5 . . . a5 . . .' is two half-notes, not eight sixteenths with
 * six of them missing. Holding is what gives the lead something long enough to
 * put vibrato on.
 */
function parseVoice(bars, beats) {
  const out = [];
  for (const bar of bars) {
    const tokens = bar.trim().split(/\s+/);
    const row = new Array(beats).fill(null);
    let last = null;
    for (let i = 0; i < beats; i++) {
      const tok = tokens[i] || '-';
      if (tok === '.') { if (last) last.steps++; continue; }
      if (tok === '-') { last = null; continue; }
      const n = midi(tok);
      if (n === null) { last = null; continue; }
      last = { note: n, steps: 1 };
      row[i] = last;
    }
    out.push(...row);
  }
  return out;
}

const LOOKAHEAD = 0.25;         // schedule this far past the clock, every tick

export class Music {
  /** @param noise a looping-safe noise buffer, shared with the sound effects. */
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.setSong('bumblebee');
    this.enabled = true;
    this.playing = false;
    this.level = 1;
    this.step = 0;
    this.next = 0;
    this.timer = null;

    // The lead is a raw square, which is brittle on a phone speaker at these
    // pitches; the bus filter takes the top off without dulling the runs.
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 3800;
    this.bus.connect(tame);
    tame.connect(dest);
  }

  /**
   * Load a song. Safe while playing: the new one starts from its own first bar
   * rather than wherever the old one had got to.
   */
  setSong(name) {
    if (this.songName === name) return;
    const song = songFor(name);
    this.songName = name;
    this.song = song;
    this.beats = song.beats;
    this.stepTime = 60 / song.bpm / 4;
    this.lead = parseVoice(song.lead, song.beats);
    this.lead2 = song.lead2 ? parseVoice(song.lead2, song.beats) : null;
    this.arp = song.arp
      ? song.arp.map((c) => (CHORDS[c] || c).split(/\s+/).map(midi))
      : null;
    this.bassRoots = song.bass.map((n) => (n ? midi(n) : null));
    this.drums = song.drums;
    this.mix = { ...MIX, ...(song.mix || {}) };
    this.total = this.lead.length;
    this.step = 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop();
  }

  /** Ducks the music without losing the beat -- used while a run is ending. */
  setLevel(v) {
    if (v === this.level) return;
    this.level = v;
    if (this.playing) this._fade(v * 0.22);
  }

  start() {
    if (!this.enabled || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.1;
    this._fade(this.level * 0.22);
    this.timer = setInterval(() => this._pump(), 40);
    this._pump();
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    this._fade(0);
  }

  _fade(to) {
    this.bus.gain.setTargetAtTime(to, this.ctx.currentTime, 0.15);
  }

  _pump() {
    const now = this.ctx.currentTime;
    // A backgrounded tab throttles the timer to about a second. Rather than
    // dumping every missed note out at once, pick the bar back up from here.
    if (this.next < now) this.next = now + 0.02;
    while (this.next < now + LOOKAHEAD) {
      this._emit(this.step, this.next);
      this.step = (this.step + 1) % this.total;
      this.next += this.stepTime;
    }
  }

  _emit(i, t) {
    const step = this.stepTime;
    const beat = i % this.beats;
    const bar = (i / this.beats) | 0;

    // The lead. A raw square gets shrill fast up high, so the harmonics roll
    // off as the tune climbs and the top of the range loses a little gain --
    // and a triangle an octave under puts back the body the square lacks.
    const lead = this.lead[i];
    if (lead) {
      const f = hz(lead.note);
      const tilt = f > 500 ? Math.max(0.6, 1 - (f - 500) / 1500) : 1;
      const cut = Math.min(3200, Math.max(1100, f * 2.4));
      const dur = step * (lead.steps - 0.08);
      this._pulse(f, t, dur, this.mix.lead * tilt, 'square', cut, dur > 0.26);
      this._pulse(f / 2, t, dur, this.mix.sub, 'triangle', 1400);
    }

    // The second pulse: harmony under the lead, quieter and duller so it reads
    // as one instrument thickening rather than two competing.
    const under = this.lead2 && this.lead2[i];
    if (under) {
      const dur = step * (under.steps - 0.08);
      this._pulse(hz(under.note), t, dur, this.mix.under, 'square', 1800, dur > 0.26);
    }

    // The arpeggio: one voice cycling a chord fast enough that the ear hears a
    // chord instead of a run. An octave up, quiet, and always moving.
    if (this.arp) {
      const chord = this.arp[bar % this.arp.length];
      this._pulse(hz(chord[i % chord.length] + 12), t, step * 0.85, this.mix.arp, 'square', 2600);
    }

    // The bass: root, then its fifth halfway through the bar.
    const root = this.bassRoots[bar % this.bassRoots.length];
    if (root != null) {
      const half = this.beats >> 1;
      const quarter = this.beats >> 2;
      if (beat === 0) this._pulse(hz(root), t, step * quarter * 0.9, this.mix.bass, 'square', 900);
      else if (beat === half) this._pulse(hz(root + 7), t, step * quarter * 0.8, this.mix.bass * 0.82, 'square', 900);
      else if (this.beats >= 16 && (beat === quarter * 3)) {
        this._pulse(hz(root + 12), t, step * quarter * 0.7, this.mix.bass * 0.6, 'square', 900);
      }
    }

    const hit = this.drums[beat % this.drums.length];
    if (hit === 'k') this._kick(t);
    else if (hit === 'h') this._hat(t);
    else if (beat % 2 === 0) this._hat(t, 0.025);
  }

  /**
   * One note. `wobble` puts vibrato on it, delayed a little the way a player
   * would: a held note that does not waver sounds like a test tone, and a note
   * that wavers from the instant it starts sounds seasick.
   */
  _pulse(f, t, dur, gain, type, cut = 0, wobble = false) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (wobble) {
      const start = t + Math.min(0.16, dur * 0.35);
      const period = 1 / 5.5;
      for (let k = 0; start + k * period < t + dur; k++) {
        o.detune.linearRampToValueAtTime(k % 2 ? -13 : 13, start + k * period);
      }
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    if (cut) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cut;
      g.connect(lp);
      lp.connect(this.bus);
      o.onended = () => { try { g.disconnect(); lp.disconnect(); } catch {} };
    } else {
      g.connect(this.bus);
      o.onended = () => { try { g.disconnect(); } catch {} };
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Beat one and three: a sine dropped off a cliff. */
  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(this.bus);
    o.start(t);
    o.stop(t + 0.16);
    o.onended = () => { try { g.disconnect(); } catch {} };
  }

  /** The offbeats: a tick of noise, quiet enough to sit under the gun. */
  _hat(t, gain = 0.06) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t);
    s.stop(t + 0.08);
    s.onended = () => { try { g.disconnect(); f.disconnect(); } catch {} };
  }
}
