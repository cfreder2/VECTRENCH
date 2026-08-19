// Chip-tune music: Rimsky-Korsakov's Flight of the Bumblebee, played by three
// square waves and a noise channel.
//
// The piece is one long chromatic run in sixteenth notes, which is exactly what
// a chip lead is good at, and its restlessness suits a trench at 400 units a
// second. It is public domain (1900), and the arrangement here is a reduction:
// the melody as written, a root-fifth bass under it, and two percussion hits a
// bar to keep the beat when the melody is busy.
//
// Notes are scheduled ahead of time against the audio clock rather than played
// from a timer tick, because a setInterval on a busy frame drifts by tens of
// milliseconds and at eleven notes a second that is audible.

const SEMI = { c: 0, 'c#': 1, d: 2, 'd#': 3, e: 4, f: 5, 'f#': 6, g: 7, 'g#': 8, a: 9, 'a#': 10, b: 11 };

/** 'a#4' -> MIDI number. */
const midi = (name) => {
  const m = /^([a-g]#?)(-?\d)$/.exec(name);
  return SEMI[m[1]] + (+m[2] + 1) * 12;
};

const hz = (n) => 440 * 2 ** ((n - 69) / 12);

// Sixteenth notes, sixteen to a bar, in A minor. Bars 1-4 are the theme -- the
// octave chromatic fall, the turn at the bottom, the climb back -- and 5-8 are
// the answering phrase that hovers around the top before dropping again.
const BARS = [
  'a5 g#5 g5 f#5 f5 e5 d#5 d5 c#5 c5 b4 a#4 a4 g#4 g4 f#4',
  'f4 e4 d#4 e4 f4 e4 d#4 e4 f4 f#4 g4 g#4 a4 a#4 b4 c5',
  'c#5 d5 d#5 e5 f5 e5 d#5 e5 f5 e5 d#5 d5 c#5 c5 b4 a#4',
  'a4 g#4 a4 a#4 b4 c5 c#5 d5 d#5 e5 f5 f#5 g5 g#5 a5 g#5',
  'a5 g#5 g5 f#5 f5 e5 f5 f#5 g5 g#5 a5 g#5 g5 f#5 f5 e5',
  'd#5 e5 f5 e5 d#5 e5 f5 e5 d#5 d5 c#5 c5 b4 c5 c#5 d5',
  'd#5 e5 f5 f#5 g5 g#5 a5 g#5 g5 f#5 f5 e5 d#5 d5 c#5 c5',
  'b4 a#4 a4 g#4 a4 a#4 b4 c5 c#5 d5 d#5 e5 f5 f#5 g5 g#5',
];

const theme = BARS.flatMap((bar) => bar.split(' ').map(midi));
// Bars 9-12 are the opening four an octave down, so the loop comes back around
// somewhere other than where it left, the way the orchestral one changes register.
const MELODY = theme.concat(theme.slice(0, 64).map((n) => n - 12));

// One chord a bar under the melody, and the eighth-note figure played on it.
const ROOTS = ['a2', 'a2', 'e2', 'e2', 'a2', 'e2', 'a2', 'e2', 'a2', 'a2', 'e2', 'e2'].map(midi);
const BASS_STEPS = [0, 2, 4, 6, 8, 10, 12, 14];
const BASS_OFFSET = [0, 0, 7, 0, 0, 12, 7, 0];

const STEP = 60 / 168 / 4;      // a sixteenth at 168bpm: about eleven notes a second
const LOOKAHEAD = 0.25;         // schedule this far past the clock, every tick
const TOTAL = MELODY.length;

export class Music {
  /** @param noise a looping-safe noise buffer, shared with the sound effects. */
  constructor(ctx, dest, noise) {
    this.ctx = ctx;
    this.noise = noise;
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
    tame.frequency.value = 5200;
    this.bus.connect(tame);
    tame.connect(dest);
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
      this.step = (this.step + 1) % TOTAL;
      this.next += STEP;
    }
  }

  _emit(i, t) {
    this._pulse(hz(MELODY[i]), t, STEP * 0.92, 0.2, 'square');

    const beat = i % 16;
    const b = BASS_STEPS.indexOf(beat);
    if (b >= 0) {
      const root = ROOTS[(i / 16) | 0] + BASS_OFFSET[b];
      this._pulse(hz(root), t, STEP * 1.7, 0.17, 'square', 900);
    }
    if (beat === 0 || beat === 8) this._kick(t);
    else if (beat === 4 || beat === 12) this._hat(t);
  }

  _pulse(f, t, dur, gain, type, cut = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
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
  _hat(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t);
    s.stop(t + 0.08);
    s.onended = () => { try { g.disconnect(); f.disconnect(); } catch {} };
  }
}
