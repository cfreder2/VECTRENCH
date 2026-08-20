// Chip-tune music: Rimsky-Korsakov's Flight of the Bumblebee, played by three
// square waves and a noise channel.
//
// The notes are transcribed from the engraved score rather than written from
// memory, which matters more than it sounds like it should: the theme is not a
// plain chromatic scale. It falls a semitone at a time and keeps stepping back
// up -- e d# d c# *d c#* c b -- and that hitch is what makes it sound like an
// insect rather than a run of a scale. Bars 1-22, the whole opening, at the
// score's Vivace crotchet = 160.
//
// The melody is Rimsky-Korsakov's, and public domain. The bass under it is ours:
// one root per bar taken from the harmony, not the piano arrangement's own
// left hand. Flats in the score are spelled as sharps here because the table
// below is sharp-based; the pitches are identical.
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

// The score: 2/4, sixteen-note runs, eight to a bar, no key signature. Bars 1-4
// are the fall from the top, 5-10 the low buzzing, 11-14 the climb out, and
// 15-22 the hovering figure that answers it.
const BARS = [
  'e6 d#6 d6 c#6 d6 c#6 c6 b5',
  'c6 b5 a#5 a5 g#5 g5 f#5 f5',
  'e5 d#5 d5 c#5 d5 c#5 c5 b4',
  'c5 b4 a#4 a4 g#4 g4 f#4 f4',
  'e4 d#4 d4 c#4 d4 c#4 c4 b3',
  'e4 d#4 d4 c#4 d4 c#4 c4 b3',
  'e4 d#4 d4 c#4 c4 f4 e4 d#4',
  'e4 d#4 d4 c#4 c4 c#4 d4 d#4',
  'e4 d#4 d4 c#4 c4 f4 e4 d#4',
  'e4 d#4 d4 c#4 c4 c#4 d4 d#4',
  'e4 d#4 d4 c#4 d4 c#4 c4 b3',
  'c4 c#4 d4 d#4 e4 f4 e4 d#4',
  'e4 d#4 d4 c#4 d4 c#4 c4 b3',
  'c4 c#4 d4 d#4 e4 f#4 g4 g#4',
  'a4 g#4 g4 f#4 f4 a#4 a4 g#4',
  'a4 g#4 g4 f#4 f4 f#4 g4 g#4',
  'a4 g#4 g4 f#4 f4 a#4 a4 g#4',
  'a4 g#4 g4 f#4 f4 f#4 g4 g#4',
  'a4 g#4 g4 f#4 g4 f#4 f4 e4',
  'f4 f#4 g4 g#4 a4 a#4 a4 g#4',
  'a4 g#4 g4 f#4 g4 f#4 f4 e4',
  'f4 f#4 g4 g#4 a4 a#4 a4 g#4',
];

// One knob for the whole tune, in semitones. -12 drops it an octave; much
// below -5 and the low bars fall under 250Hz, where a phone speaker has
// nothing to reproduce them with, so the melody would vanish on the device
// this game is mostly played on.
const TRANSPOSE = 0;

const MELODY = BARS.flatMap((bar) => bar.split(' ').map((n) => midi(n) + TRANSPOSE));

// One root a bar. Null is a bar the score leaves unaccompanied -- the opening
// descent is nearly solo, and filling it in would trample the best moment in
// the piece.
const ROOTS = ['e3', null, 'e2', null, null, null, 'a2', 'a2', 'a2', 'a2', 'a2',
  'd3', 'c3', 'e3', 'd3', 'd3', 'f3', 'd3', 'f3', 'e3', 'd3', 'c#3']
  .map((n) => (n ? midi(n) : null));

const BEATS = 8;                // sixteenths to the bar, this being 2/4

const STEP = 60 / 160 / 4;      // a sixteenth at the score's 160: eleven a second
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
    tame.frequency.value = 3800;
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
    // A raw square gets shrill fast: the opening sits up at E6 and was the
    // brightest, loudest thing in the mix. Roll the harmonics off as the tune
    // climbs, take a little gain out of the top, and lay a quiet triangle an
    // octave under it -- that last part is what puts weight back where the
    // square lost it, without moving a single note off the score.
    const f = hz(MELODY[i]);
    const tilt = f > 500 ? Math.max(0.6, 1 - (f - 500) / 1500) : 1;
    const cut = Math.min(3200, Math.max(1100, f * 2.4));
    this._pulse(f, t, STEP * 0.92, 0.2 * tilt, 'square', cut);
    this._pulse(f / 2, t, STEP * 0.92, 0.085, 'triangle', 1400);

    const beat = i % BEATS;
    const root = ROOTS[(i / BEATS) | 0];
    // Root on the first beat, fifth on the second: the left hand in the score
    // is staccato chords on the beat, and two hits a bar is that in one voice.
    if (root !== null) {
      if (beat === 0) this._pulse(hz(root), t, STEP * 2.6, 0.17, 'square', 900);
      else if (beat === 4) this._pulse(hz(root + 7), t, STEP * 2.2, 0.14, 'square', 900);
    }
    if (beat === 0) this._kick(t);
    else if (beat === 4) this._hat(t);
    else if (beat === 2 || beat === 6) this._hat(t, 0.03);
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
