// The score book: one song per level.
//
// The synth this plays through is the NES's, near enough -- two pulse voices, a
// triangle, and noise -- which is the palette every Mega Man stage was written
// for. What made those tracks sound bigger than four voices was never more
// instruments; it was technique. All of it is here:
//
//   arpeggios     a chord is not a chord, it is one voice cycling three notes
//                 faster than the ear separates them. It is where the shimmer
//                 comes from, and it costs one channel instead of three.
//   vibrato       a held note that does not waver sounds like a test tone.
//   a bass line   roots on the beat is a metronome. A bass that walks is a
//                 part -- and a song may write its own with `bassLine`, bar by
//                 bar, which is how a gallop gets written.
//   fills         `drums` as a list is one pattern per bar: a drummer, not a
//                 loop. `k` kick, `h` hat, `x` a hard hit, `m` the metallic
//                 short-register noise.
//   sweeps        a note ending in / rises and \ falls, stepped the way the
//                 hardware's sweep unit stepped. The siren and the dive-bomb.
//
// A song is data. Bars are strings of note names, one token per sixteenth, `.`
// to hold and `-` to rest -- so the shape of a phrase is visible in the source
// rather than buried in an array of numbers.

/** Chords for the arpeggio channel, lowest note first. */
export const CHORDS = {
  am: 'a3 c4 e4', am7: 'a3 c4 g4', dm: 'd3 f3 a3', dm7: 'd3 f3 c4',
  em: 'e3 g3 b3', e7: 'e3 g#3 d4', f: 'f3 a3 c4', fmaj7: 'f3 a3 e4',
  c: 'c3 e3 g3', g: 'g3 b3 d4', g7: 'g3 b3 f4', bdim: 'b2 d3 f3',
  b7: 'b2 d#3 f#3', d: 'd3 f#3 a3',
};

export const SONGS = {
  /**
   * The Flight of the Bumblebee, from the engraved score. Bars 1-22 at the
   * marked Vivace crotchet = 160. Public domain (1900); the bass under it is
   * ours, one root a bar taken from the harmony.
   */
  bumblebee: {
    name: 'BUMBLEBEE',
    bpm: 160,
    beats: 8,             // sixteenths to the bar: this is 2/4
    lead: [
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
    ],
    // Written as the left hand plays it: alternating eighths, root and fifth.
    // A bar of rests is a bar the score leaves unaccompanied -- the opening
    // descent is nearly solo and filling it in would trample the best moment
    // in the piece.
    bassLine: [
      'e3 .  .  .  .  .  .  . ',
      '-  -  -  -  -  -  -  - ',
      'e2 .  .  .  e2 .  .  . ',
      '-  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  - ',
      'a2 .  e3 .  a2 .  e3 . ',
      'a2 .  e3 .  a2 .  e3 . ',
      'a2 .  e3 .  a2 .  e3 . ',
      'a2 .  e3 .  a2 .  e3 . ',
      'a2 .  e3 .  a2 .  e3 . ',
      'd3 .  a3 .  d3 .  a3 . ',
      'c3 .  g3 .  c3 .  g3 . ',
      'e3 .  b3 .  e3 .  b3 . ',
      'd3 .  a3 .  d3 .  a3 . ',
      'd3 .  a3 .  d3 .  a3 . ',
      'f3 .  c4 .  f3 .  c4 . ',
      'd3 .  a3 .  d3 .  a3 . ',
      'f3 .  c4 .  f3 .  c4 . ',
      'e3 .  b3 .  e3 .  b3 . ',
      'd3 .  a3 .  d3 .  a3 . ',
      'c#3 . e3 .  c#3 . e3 . ',
    ],
    bass: null,
    arp: null,            // it has no room for one: the lead never stops
    drums: 'k...h...',
    lead2: null,
  },

  /**
   * WATER. A flowing stage: mid-tempo, minor, and built on a running arpeggio
   * that never stops moving, the way a current does not. The lead sits high and
   * sings over it in long notes with vibrato, and the bass walks rather than
   * marking time. Written for this game, in the idiom.
   *
   * A minor, 4/4, and the phrase is eight bars: four that sink and four that
   * climb back out, so the loop breathes instead of merely repeating.
   */
  water: {
    name: 'WATER',
    bpm: 132,
    beats: 16,            // sixteenths to the bar: 4/4
    loopFrom: 2,          // the droplets fall once; the loop is bars 3-18
    lead: [
      // Droplets: short high notes with rising sweeps, which is what a water
      // drop sounds like, over the arpeggio running alone.
      '-  -  -  -  a5/ .  -  -  -  -  -  -  e6/ .  -  - ',
      '-  -  c6/ .  -  -  -  -  g5/ .  -  -  -  -  b4 . ',
      // A: four bars that sink, four that climb back out.
      'e5 .  .  .  a5 .  .  .  g5 .  e5 .  d5 .  .  . ',
      'c5 .  .  .  e5 .  .  .  d5 .  c5 .  b4 .  .  . ',
      'a4 .  .  .  c5 .  .  .  e5 .  .  .  d5 .  c5 . ',
      'b4 .  .  .  .  .  -  -  e5 .  d5 .  c5 .  b4 . ',
      'a4 .  b4 .  c5 .  d5 .  e5 .  .  .  .  .  g5 . ',
      'f5 .  .  .  e5 .  d5 .  c5 .  .  .  d5 .  e5 . ',
      'g5 .  .  .  f5 .  e5 .  d5 .  c5 .  b4 .  a4 . ',
      'a4 .  .  .  .  .  .  .  e5 .  .  .  .  .  .  . ',
      // B: out into open water -- the circle of fifths, rising to the one
      // high note in the piece and settling back onto the dominant.
      'f5 .  .  .  e5 .  f5 .  a5 .  .  .  g5 .  f5 . ',
      'g5 .  .  .  b4 .  d5 .  g5 .  .  .  a5 .  b5 . ',
      'c6 .  .  .  b5 .  g5 .  e5 .  .  .  g5 .  c5 . ',
      'a5 .  .  .  .  .  g5 .  f5 .  e5 .  f5 .  a5 . ',
      'g5 .  .  .  f5 .  e5 .  d5 .  .  .  f5 .  e5 . ',
      'd5 .  .  .  .  .  f5 .  b4 .  .  .  d5 .  f5 . ',
      'e5 .  .  .  .  .  g#5 .  b5 .  .  .  .  .  g#5 . ',
      'a5 .  g#5 .  .  .  e5 .  b4 .  c5 .  d5 .  .  . ',
    ],
    // A second pulse voice, a fifth or a third under the lead where it holds --
    // the trick that makes two channels sound like a section.
    lead2: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'c5 .  .  .  e5 .  .  .  d5 .  c5 .  a4 .  .  . ',
      'a4 .  .  .  c5 .  .  .  b4 .  a4 .  g4 .  .  . ',
      'e4 .  .  .  a4 .  .  .  c5 .  .  .  b4 .  a4 . ',
      'g4 .  .  .  .  .  -  -  c5 .  b4 .  a4 .  g4 . ',
      '-  -  -  -  -  -  -  -  c5 .  .  .  .  .  e5 . ',
      'd5 .  .  .  c5 .  b4 .  a4 .  .  .  b4 .  c5 . ',
      'e5 .  .  .  d5 .  c5 .  b4 .  a4 .  g4 .  f4 . ',
      'f4 .  .  .  .  .  .  .  c5 .  .  .  .  .  .  . ',
      'd5 .  .  .  c5 .  d5 .  f5 .  .  .  e5 .  d5 . ',
      'd5 .  .  .  -  -  b4 .  d5 .  .  .  f5 .  g5 . ',
      'e5 .  .  .  g5 .  e5 .  c5 .  .  .  e5 .  g4 . ',
      'f5 .  .  .  .  .  e5 .  c5 .  .  .  c5 .  f5 . ',
      'e5 .  .  .  d5 .  c5 .  a4 .  .  .  d5 .  c5 . ',
      'b4 .  .  .  .  .  d5 .  f4 .  .  .  b4 .  d5 . ',
      'b4 .  .  .  .  .  e5 .  g#5 .  .  .  .  .  e5 . ',
      'c5 .  e5 .  .  .  c5 .  g#4 .  a4 .  b4 .  .  . ',
    ],
    // A: i i VI v III V7 iv V7. B: the circle -- iv VII III VI iv ii-dim V7 V7.
    arp: ['am', 'am',
      'am', 'am', 'f', 'em', 'c', 'g7', 'dm', 'e7',
      'dm', 'g', 'c', 'fmaj7', 'dm', 'bdim', 'e7', 'e7'],
    // Written out as a current, not a pulse: quarters that drift through each
    // chord and hand the bar to the next one with a passing tone.
    bassLine: [
      'a2 .  .  .  .  .  .  .  e3 .  .  .  .  .  .  . ',
      'a2 .  .  .  .  .  .  .  e3 .  .  .  g3 .  .  . ',
      'a2 .  .  .  e3 .  .  .  a3 .  .  .  e3 .  .  . ',
      'a2 .  .  .  e3 .  .  .  a3 .  g3 .  f3 .  e3 . ',
      'f2 .  .  .  c3 .  .  .  f3 .  .  .  e3 .  .  . ',
      'e2 .  .  .  b2 .  .  .  e3 .  .  .  d3 .  c3 . ',
      'c3 .  .  .  g2 .  .  .  c3 .  .  .  e3 .  f3 . ',
      'g2 .  .  .  d3 .  .  .  g3 .  f3 .  e3 .  d3 . ',
      'd3 .  .  .  a2 .  .  .  d3 .  c3 .  b2 .  .  . ',
      'e2 .  .  .  b2 .  .  .  g#2 .  .  .  b2 .  c3 . ',
      'd3 .  .  .  a2 .  .  .  d3 .  .  .  f3 .  .  . ',
      'g2 .  .  .  d3 .  .  .  g3 .  .  .  b2 .  .  . ',
      'c3 .  .  .  g2 .  .  .  c3 .  .  .  e3 .  .  . ',
      'f2 .  .  .  c3 .  .  .  f3 .  .  .  e3 .  d3 . ',
      'd3 .  .  .  a2 .  .  .  d3 .  .  .  c3 .  .  . ',
      'b2 .  .  .  f3 .  .  .  d3 .  .  .  b2 .  .  . ',
      'e2 .  .  .  b2 .  .  .  e3 .  .  .  d3 .  .  . ',
      'e2 .  .  .  g#2 .  .  .  b2 .  c3 .  d3 .  e3 . ',
    ],
    bass: null,
    // Nothing under the droplets; a soft fill hands A to B, and another hands
    // the loop back to its start.
    drums: [
      '................',
      '................',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k..hh.h.',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...k...h...',
      'k...h...h.h.h.h.',
    ],
    drumsFrom: 2,
    // The arpeggio is carrying the harmony here, so the bass gets out of its
    // way and the lead comes forward: rendered with the default mix, 85% of the
    // energy sat under 250Hz and the tune was somewhere beneath it.
    mix: { lead: 0.3, under: 0.11, arp: 0.085, bass: 0.1, sub: 0.05 },
  },

  /**
   * FIRE. Written like the stage themes worth stealing from: not a loop, a
   * song. Sixteen bars in E minor at 176 -- a two-bar alarm that plays once,
   * a driving theme stated bare and then restated with its harmony, a chorus
   * that lifts to the relative major and soars, and a climax that runs down
   * the harmonic minor and dive-bombs back into the loop.
   *
   * What it leans on, by voice:
   *
   *   lead     duty 12.5% -- the siren -- with hardware sweeps: the intro
   *            alarms rise (/) and the bar-16 dive falls (\). The theme is a
   *            3+3+2 cell, the engine of every driving chip track: it pulls
   *            against the beat without ever losing it.
   *   lead2    silent for the first statement, harmony from the restatement
   *            on -- thirds and sixths below, the two-pulses-as-a-section
   *            trick. It even dives in parallel at the end.
   *   bass     written out, not generated: the gallop -- root, rest, root,
   *            octave -- with a walk at every corner so each chord change is
   *            arrived at, not jumped to. The intro pounds quarters, then
   *            eighths, then sixteenths: a launch ramp.
   *   drums    a different bar where it matters: fills into each section,
   *            metallic short-register noise ticking through the groove,
   *            double-time under the climax run.
   *
   * The D sharp is still the hottest note in it -- the raised seventh, a
   * semitone off the tonic -- and the whole last bar leans on it.
   */
  fire: {
    name: 'FIRE',
    bpm: 176,
    beats: 16,
    loopFrom: 2,          // the alarm plays once; the loop is bars 3-16
    lead: [
      // The alarm: three rising sweeps, the third tumbling down a run that
      // lands on the theme's doorstep.
      'e5/ .  .  .  -  -  -  -  g5/ .  .  .  -  -  -  - ',
      'b5/ .  .  .  b5 a5 g5 f#5 e5 d#5 e5 d#5 b4 .  d#5 . ',
      // A: the 3+3+2 cell, stated bare.
      'e5 .  .  g5 .  .  b5 .  .  .  a5 .  g5 .  a5 . ',
      'b5 .  .  .  .  .  .  .  g5 .  e5 .  g5 .  b4 . ',
      'c5 .  .  e5 .  .  g5 .  .  .  a5 .  g5 .  e5 . ',
      'f#5 .  .  d#5 .  .  b4 .  .  .  f#5 .  a5 .  b5 . ',
      // A restated, harmony underneath now, the tail climbing instead.
      'e5 .  .  g5 .  .  b5 .  .  .  a5 .  g5 .  a5 . ',
      'b5 .  .  .  .  .  .  .  c6 .  b5 .  a5 .  g5 . ',
      'a5 .  .  g5 .  .  e5 .  .  .  g5 .  a5 .  b5 . ',
      'b5 .  .  .  .  .  a5 .  f#5 .  d#5 .  b4 .  c5 d5 ',
      // B: the lift. Long notes, big intervals, the relative major.
      'e5 .  .  .  .  .  .  .  g5 .  .  .  .  .  a5 . ',
      'b5 .  .  .  .  .  .  .  a5 .  .  .  f#5 .  d5 . ',
      'g5 .  .  .  .  .  b5 .  d6 .  .  .  .  .  b5 . ',
      'c6 .  .  .  b5 .  a5 .  f#5 .  .  .  d#5 .  f#5 . ',
      // The climax: down the octave at full speed, back up the arpeggio,
      // and a dive-bomb on the dominant into the loop.
      'b5 a5 g5 f#5 e5 d5 c5 b4 a4 .  c5 .  e5 .  a5 . ',
      'b5\\ .  .  .  .  .  .  .  -  -  -  -  b4 .  d#5 . ',
    ],
    lead2: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'g5 .  .  .  .  .  .  .  e5 .  c5 .  e5 .  g4 . ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'd#5 .  .  b4 .  .  f#4 .  .  .  d#5 .  f#5 .  g5 . ',
      'g4 .  .  b4 .  .  g5 .  .  .  f#5 .  e5 .  f#5 . ',
      'g5 .  .  .  .  .  .  .  a5 .  g5 .  f#5 .  e5 . ',
      'e5 .  .  e5 .  .  c5 .  .  .  e5 .  f#5 .  g5 . ',
      'f#5 .  .  .  .  .  f#5 .  d#5 .  b4 .  f#4 .  a4 b4 ',
      'c5 .  .  .  .  .  .  .  e5 .  .  .  .  .  f#5 . ',
      'd5 .  .  .  .  .  .  .  f#5 .  .  .  d5 .  a4 . ',
      'b4 .  .  .  .  .  d5 .  g5 .  .  .  .  .  g5 . ',
      'a5 .  .  .  f#5 .  f#5 .  d#5 .  .  .  b4 .  d#5 . ',
      'c5 .  .  .  .  .  .  .  e5 .  .  .  .  .  .  . ',
      'f#5\\ .  .  .  .  .  .  .  -  -  -  -  g4 .  a4 . ',
    ],
    arp: ['em', 'em', 'em', 'em', 'c', 'b7', 'em', 'em', 'c', 'b7',
      'c', 'd', 'g', 'b7', 'am', 'b7'],
    // The gallop, written out. Root - rest - root - octave, and a walk into
    // every chord change: the corner is approached, never jumped.
    bassLine: [
      'e2 .  .  .  e2 .  .  .  e2 .  .  .  e2 .  .  . ',
      'e2 .  e2 .  e2 .  e2 .  e2 .  e2 .  e2 e2 e2 e2 ',
      'e2 .  e2 e3 e2 .  e2 e3 e2 .  e2 e3 e2 .  e2 e3 ',
      'e2 .  e2 e3 e2 .  e2 e3 e2 .  g2 .  a2 .  b2 . ',
      'c3 .  c3 c4 c3 .  c3 c4 c3 .  c3 c4 c3 .  c3 c4 ',
      'b2 .  b2 b3 b2 .  a2 .  g2 .  f#2 .  e2 .  d#2 . ',
      'e2 .  e2 e3 e2 .  e2 e3 e2 .  e2 e3 e2 .  e2 e3 ',
      'e2 .  e2 e3 e2 .  e2 e3 g2 .  g2 g3 a2 .  b2 . ',
      'c3 .  c3 c4 c3 .  c3 c4 c3 .  c3 c4 a2 .  b2 . ',
      'b2 .  b2 b3 b2 .  b2 b3 b2 .  a2 .  g2 .  a2 b2 ',
      'c3 .  c3 c4 c3 .  c3 c4 c3 .  c3 c4 c3 .  d3 . ',
      'd3 .  d3 d4 d3 .  d3 d4 d3 .  d3 d4 d3 .  e3 f#3 ',
      'g2 .  g2 g3 g2 .  g2 g3 g2 .  g2 g3 a2 .  b2 . ',
      'b2 .  b2 b3 b2 .  b2 b3 b2 .  b2 b3 b2 .  a2 . ',
      'a2 .  a2 a3 a2 .  a2 a3 a2 .  a2 a3 g2 .  a2 . ',
      'b2 .  b2 b3 b2 .  b2 .  b2 .  a2 .  g2 .  f#2 d#2 ',
    ],
    bass: null,           // the written line above replaces the generator
    // One bar of drums per bar of song: quarters under the alarm, a snare
    // ramp, then kick on one and three, snare on two and four, the metallic
    // short-mode noise ticking sixteenths between -- with a fill at the end
    // of every section and double-time under the climax run.
    drums: [
      'k...k...k...k...',
      'k...k...x.x.x.xx',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhk.x.x.xx',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhk.mhx.mh',
      'k.mhx.mhx.x.xxxx',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk.x.x.x.',
      'k.x.k.x.k.x.k.x.',
      'k...x.......x.xx',
    ],
    // The siren lead, the reedy harmony.
    duty: { lead: 0.125, under: 0.25, arp: 0.5, bass: 0.5 },
    mix: { lead: 0.34, under: 0.09, arp: 0.032, bass: 0.115, sub: 0.065 },
  },
  /**
   * NEON. The power grid at night: synthwave in the chip idiom. Sixteen bars
   * in A minor at 138 -- slower than FIRE on paper and relentless anyway,
   * because the engine is the bass: the lament descent, a-g-f-e, pumped in
   * eighths with a chromatic slip into every change. The intro IS that bass:
   * alone in the dark with the metallic noise ticking like a live rail, then
   * a chromatic climb up into the hook. No sweeps until the turnaround dives
   * on one -- the rising-blip opening belongs to WATER, and two songs that
   * start with the same gesture are the same song for eight seconds.
   *
   * The lead is the one duty no other song uses: the plain 50% square, hollow
   * and cold, which against the reedy harmony underneath is the PWM-synth
   * sound every night-drive record is built on. Drums are the backbeat with
   * the metallic short-register noise ticking the off-beats -- electricity in
   * the hi-hat.
   */
  neon: {
    name: 'NEON',
    bpm: 138,
    beats: 16,
    loopFrom: 2,          // the arcs jump once; the loop is bars 3-16
    lead: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'e4 .  g4 .  a4 .  a#4 .  b4 .  .  .  d5 .  c5 . ',
      // A: the hook, low and terse.
      'a4 .  .  .  e5 .  d5 .  c5 .  .  .  b4 .  c5 . ',
      'b4 .  .  .  d5 .  .  .  g4 .  .  .  a4 .  b4 . ',
      'c5 .  .  .  f5 .  e5 .  c5 .  .  .  a4 .  .  . ',
      'b4 .  .  .  g#4 .  .  .  e4 .  .  .  d5 .  b4 . ',
      // A restated, climbing out of the basement this time.
      'a4 .  .  .  e5 .  d5 .  c5 .  .  .  b4 .  c5 . ',
      'b4 .  .  .  d5 .  g5 .  b5 .  .  .  a5 .  g5 . ',
      'a5 .  .  .  f5 .  .  .  c5 .  .  .  f5 .  a5 . ',
      'g#5 .  .  .  e5 .  .  .  b4 .  d5 .  e5 .  g5 . ',
      // B: the long lights. Held notes over the descent still running below.
      'a5 .  .  .  .  .  .  .  g5 .  .  .  f5 .  .  . ',
      'g5 .  .  .  .  .  e5 .  g5 .  .  .  c6 .  .  . ',
      'a5 .  .  .  f5 .  .  .  d5 .  .  .  e5 .  f5 . ',
      'e5 .  .  .  .  .  g#5 .  b5 .  .  .  .  .  .  . ',
      // The run down through the leading tone, and the dive home.
      'a5 g5 f5 e5 d5 c5 b4 a4 g#4 .  b4 .  e5 .  d5 . ',
      'b4\\ .  .  .  -  -  -  -  e5 .  d5 .  c5 .  b4 . ',
    ],
    lead2: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'e4 .  .  .  c5 .  b4 .  a4 .  .  .  g4 .  a4 . ',
      'g4 .  .  .  b4 .  d5 .  g5 .  .  .  f5 .  d5 . ',
      'f5 .  .  .  c5 .  .  .  a4 .  .  .  c5 .  f5 . ',
      'e5 .  .  .  b4 .  .  .  g#4 .  b4 .  c5 .  e5 . ',
      'f5 .  .  .  .  .  .  .  e5 .  .  .  c5 .  .  . ',
      'e5 .  .  .  .  .  c5 .  e5 .  .  .  g5 .  .  . ',
      'f5 .  .  .  d5 .  .  .  a4 .  .  .  c5 .  d5 . ',
      'b4 .  .  .  .  .  e5 .  g#5 .  .  .  .  .  .  . ',
      'c5 .  .  .  .  .  .  .  a4 .  .  .  .  .  .  . ',
      'g#4\\ .  .  .  -  -  -  -  c5 .  b4 .  a4 .  g#4 . ',
    ],
    arp: ['am', 'am',
      'am', 'g', 'f', 'e7', 'am', 'g', 'f', 'e7',
      'f', 'c', 'dm', 'e7', 'am', 'e7'],
    // The lament, pumped: eighths on the root with the octave popping, and a
    // chromatic slip -- g#, f#, c#, d# -- into nearly every change.
    bassLine: [
      'a2 .  .  .  a2 .  g#2 .  a2 .  .  .  a2 .  g2 . ',
      'a2 .  a2 .  a2 .  a2 .  a2 .  a2 .  a2 a2 g#2 . ',
      'a2 .  a2 .  a3 .  a2 .  a2 .  a3 .  a2 .  g#2 . ',
      'g2 .  g2 .  g3 .  g2 .  g2 .  g3 .  g2 .  f#2 . ',
      'f2 .  f2 .  f3 .  f2 .  f2 .  f3 .  f2 .  f2 . ',
      'e2 .  e2 .  e3 .  e2 .  e2 .  e3 .  e2 .  g#2 . ',
      'a2 .  a2 .  a3 .  a2 .  a2 .  a3 .  a2 .  g#2 . ',
      'g2 .  g2 .  g3 .  g2 .  g2 .  g3 .  g2 .  f#2 . ',
      'f2 .  f2 .  f3 .  f2 .  f2 .  f3 .  f2 .  e2 . ',
      'e2 .  e2 .  e3 .  e2 .  g#2 .  b2 .  d3 .  e3 . ',
      'f2 .  f2 .  f3 .  f2 .  f2 .  f3 .  f2 .  e2 . ',
      'c3 .  c3 .  c2 .  c3 .  c3 .  c2 .  c3 .  c#3 . ',
      'd3 .  d3 .  d2 .  d3 .  d3 .  d2 .  d3 .  d#3 . ',
      'e2 .  e2 .  e3 .  e2 .  e2 .  e3 .  e2 .  e2 . ',
      'a2 .  a2 .  a3 .  a2 .  g2 .  f2 .  e2 .  d2 . ',
      'e2 .  e2 .  e3 .  e2 .  e2 .  g#2 .  b2 .  g#2 . ',
    ],
    bass: null,
    // Backbeat with the metallic tick on the off-beats; fills into each
    // section, double-time under the run.
    drums: [
      'k...m...k...m...',
      'k.m.k.m.k.m.x.x.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.h.x.x.x.x.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.m.k.h.x.m.',
      'k.h.x.h.x.x.xxxx',
      'k.h.x.h.kkh.x.h.',
      'k.h.x.h.kkh.x.h.',
      'k.h.x.h.kkh.x.h.',
      'k.h.x.h.k.x.x.x.',
      'k.x.k.x.k.x.k.x.',
      'k...x.....x.x.x.',
    ],
    // The hollow square lead -- no other song uses 50% -- over a reedy 25%
    // harmony: the PWM pair, which is the synthwave sound.
    duty: { lead: 0.5, under: 0.25, arp: 0.5, bass: 0.5 },
    mix: { lead: 0.3, under: 0.1, arp: 0.06, bass: 0.14, sub: 0.06 },
  },

  /**
   * ANTHEM. The opening-theme shape: a melody in long notes with big intervals,
   * carried over an arpeggio going four times as fast. That contrast is the
   * whole trick -- the tune sounds unhurried and enormous precisely because
   * something underneath it is sprinting.
   *
   * A minor, and the progression is the heroic one: i VI III VII, which is four
   * chords that keep rising away from the tonic instead of settling onto it.
   * The second half turns to iv and the dominant so the loop lands rather than
   * merely coming round again.
   *
   * The first two bars play once and never return. An opening arrives from
   * somewhere: bare octaves on the bass, no drums, the arpeggio starting alone,
   * and then the theme.
   */
  anthem: {
    name: 'ANTHEM',
    bpm: 152,
    beats: 16,
    loopFrom: 2,          // bars 1-2 are the way in; the loop is bars 3-18
    drumsFrom: 1,         // and the drums arrive a bar after the arpeggio does
    lead: [
      '-  -  -  -  -  -  -  -  -  -  -  -  a4 .  b4 . ',
      'c5 .  .  .  .  .  .  .  e5 .  .  .  .  .  g5 . ',
      // The theme: long notes, big intervals, unhurried over the sprint.
      'a5 .  .  .  .  .  g5 .  e5 .  .  .  .  .  .  . ',
      'f5 .  .  .  .  .  .  .  e5 .  d5 .  c5 .  .  . ',
      'e5 .  .  .  g5 .  .  .  .  .  a5 .  g5 .  e5 . ',
      'd5 .  .  .  .  .  .  .  b4 .  d5 .  g5 .  .  . ',
      'a5 .  .  .  .  .  .  .  f5 .  a5 .  .  .  .  . ',
      'g5 .  .  .  e5 .  .  .  a5 .  .  .  .  .  .  . ',
      'f5 .  .  .  e5 .  d5 .  c5 .  d5 .  e5 .  .  . ',
      'b4 .  .  .  d5 .  .  .  e5 .  .  .  .  .  .  . ',
      // The second strain: the same tune's promise kept -- higher, wider, and
      // a sweep flare on the dominant before it hands the loop back.
      'f5 .  .  .  .  .  e5 .  f5 .  a5 .  .  .  .  . ',
      'g5 .  .  .  .  .  d5 .  g5 .  b5 .  .  .  .  . ',
      'c6 .  .  .  .  .  b5 .  a5 .  .  .  e5 .  .  . ',
      'a5 .  .  .  .  .  .  .  .  .  .  .  g5 .  e5 . ',
      'f5 .  .  .  a5 .  .  .  c6 .  .  .  a5 .  f5 . ',
      'd6 .  .  .  b5 .  .  .  g5 .  .  .  b5 .  d6 . ',
      'e5/ .  .  .  a5 .  .  .  b5 .  .  .  g#5 .  .  . ',
      'a5 .  .  .  g#5 .  .  .  b4 .  c5 .  d5 .  e5 . ',
    ],
    // A sixth or a third under, which is how two pulse channels were made to
    // sound like a brass section on hardware that had two pulse channels.
    lead2: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'a4 .  .  .  .  .  .  .  c5 .  .  .  .  .  e5 . ',
      'e5 .  .  .  .  .  e5 .  c5 .  .  .  .  .  .  . ',
      'c5 .  .  .  .  .  .  .  c5 .  a4 .  a4 .  .  . ',
      'c5 .  .  .  e5 .  .  .  .  .  e5 .  e5 .  c5 . ',
      'b4 .  .  .  .  .  .  .  g4 .  b4 .  d5 .  .  . ',
      'f5 .  .  .  .  .  .  .  d5 .  f5 .  .  .  .  . ',
      'e5 .  .  .  c5 .  .  .  e5 .  .  .  .  .  .  . ',
      'a4 .  .  .  a4 .  a4 .  a4 .  b4 .  c5 .  .  . ',
      'g#4 . .  .  b4 .  .  .  b4 .  .  .  .  .  .  . ',
      'c5 .  .  .  .  .  c5 .  c5 .  f5 .  .  .  .  . ',
      'b4 .  .  .  .  .  b4 .  b4 .  g5 .  .  .  .  . ',
      'e5 .  .  .  .  .  e5 .  e5 .  .  .  c5 .  .  . ',
      'c5 .  .  .  .  .  .  .  .  .  .  .  e5 .  c5 . ',
      'c5 .  .  .  f5 .  .  .  a5 .  .  .  f5 .  c5 . ',
      'b5 .  .  .  g5 .  .  .  d5 .  .  .  g5 .  b5 . ',
      '-  -  -  -  e5 .  .  .  g#5 .  .  .  e5 .  .  . ',
      'c5 .  .  .  e5 .  .  .  g#4 .  a4 .  b4 .  c5 . ',
    ],
    // The theme keeps the heroic i VI III VII; the strain is VI VII i, twice,
    // then the dominant held for two bars.
    arp: ['am', 'am', 'am', 'f', 'c', 'g', 'dm', 'am', 'f', 'e7',
      'f', 'g', 'am', 'am', 'f', 'g', 'e7', 'e7'],
    // Pumping eighths, written: the engine an anthem drives on, with a walk
    // into every chord and the dominant rising home at the end.
    bassLine: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'a2 .  .  .  .  .  .  .  a2 .  .  .  a3 .  .  . ',
      'a2 .  a2 .  a2 .  a3 .  a2 .  a2 .  a3 .  a2 . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  a2 .  b2 .  .  . ',
      'c3 .  c3 .  c3 .  c2 .  c3 .  c3 .  b2 .  .  . ',
      'g2 .  g2 .  g2 .  g3 .  g2 .  a2 .  b2 .  c3 . ',
      'd3 .  d3 .  d3 .  d2 .  d3 .  d3 .  c3 .  b2 . ',
      'a2 .  a2 .  a2 .  a3 .  a2 .  a2 .  g2 .  .  . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  f2 .  f2 .  e2 . ',
      'e2 .  e2 .  e2 .  e3 .  g#2 .  b2 .  e3 .  e2 . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  f2 .  f3 .  f2 . ',
      'g2 .  g2 .  g2 .  g3 .  g2 .  g2 .  g3 .  g2 . ',
      'a2 .  a2 .  a2 .  a3 .  a2 .  a2 .  a3 .  a2 . ',
      'a2 .  a2 .  a2 .  a3 .  a2 .  a2 .  g2 .  g2 . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  f2 .  f3 .  f2 . ',
      'g2 .  g2 .  g2 .  g3 .  g2 .  a2 .  b2 .  d3 . ',
      'e2 .  e2 .  e2 .  e3 .  e2 .  e2 .  e3 .  e2 . ',
      'e2 .  e2 .  g#2 .  g#2 .  b2 .  b2 .  d3 .  e3 . ',
    ],
    bass: null,
    // The strain earns a backbeat the theme does not have, a fill hands each
    // section over, and the last bar spills back into the loop.
    drums: [
      '................',
      'k.......k.....x.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.k..hk.h.',
      'k..hk.h.x.x.x.xx',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hk..hx..h',
      'k..hx..hx.x.x.x.',
    ],
    // Long notes put less energy in the melody band than a busy lead does --
    // measured, the first mix left the tune at 40.8% of what the ear hears
    // against about 70 for the other two. The lead comes up and the parts
    // running underneath it come down.
    mix: { lead: 0.36, under: 0.085, arp: 0.055, bass: 0.115, sub: 0.055 },
  },

  /**
   * BOSS. What plays when the gate falls and the flyout stops being an
   * ending. One track for every warden, and it earns that by being about the
   * *situation* rather than any one of them: E minor leaning hard on F -- the
   * Neapolitan, a semitone above home, the oldest menace in the book -- with
   * the lead stabbing tritones and the drums hitting more than anything else
   * in the game. No intro. A boss fight starts mid-sentence.
   *
   * Twelve bars so it loops fast: fights are heard on repeat, and a short
   * loop with two builds beats a long one heard once.
   */
  boss: {
    name: 'BOSS',
    bpm: 148,
    beats: 16,
    lead: [
      'e4 .  .  .  a#4 .  .  .  e4 .  g4 .  a#4 .  b4 . ',
      'e4 .  .  .  a#4 .  .  .  b4 .  g4 .  e4 .  .  . ',
      'f4 .  .  .  c5 .  .  .  f4 .  g#4 .  c5 .  d5 . ',
      'b4 .  a#4 .  b4 .  a#4 .  b4 .  .  .  -  -  -  - ',
      'e5 .  .  .  .  .  d5 .  a#4 .  .  .  b4 .  .  . ',
      'e5 .  .  .  .  .  f5 .  e5 .  d5 .  a#4 .  b4 . ',
      'f5 .  .  .  e5 .  .  .  c5 .  .  .  g#4 .  a4 . ',
      'f#4 .  a#4 .  b4 .  d#5 .  e5 .  .  .  -  -  -  - ',
      'e5 f5 e5 d5 e5 .  .  .  -  -  b4 c5 b4 a#4 b4 . ',
      'e5 f5 e5 d5 e5 .  .  .  g5 .  f5 .  e5 .  d#5 . ',
      'f5 .  .  .  f5 .  e5 .  d5 .  c5 .  b4 .  a#4 . ',
      'b4 .  .  .  d#5 .  .  .  f#5 .  .  .  b4\\ .  .  . ',
    ],
    lead2: [
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'c4 .  .  .  f4 .  .  .  c4 .  f4 .  g#4 .  a#4 . ',
      'g#4 .  g4 .  g#4 .  g4 .  g#4 .  .  .  -  -  -  - ',
      'b4 .  .  .  .  .  b4 .  g4 .  .  .  g#4 .  .  . ',
      'b4 .  .  .  .  .  c5 .  b4 .  b4 .  g4 .  g#4 . ',
      'c5 .  .  .  c5 .  .  .  g#4 .  .  .  f4 .  f4 . ',
      'd#4 .  f#4 .  g#4 .  a4 .  b4 .  .  .  -  -  -  - ',
      '-  -  -  -  -  -  -  -  -  -  -  -  -  -  -  - ',
      'b4 c5 b4 a4 b4 .  .  .  d5 .  c5 .  b4 .  a4 . ',
      'c5 .  .  .  c5 .  b4 .  a4 .  g#4 .  g4 .  f#4 . ',
      'f#4 .  .  .  a4 .  .  .  d#5 .  .  .  f#4\\ .  .  . ',
    ],
    // i i bII V -- and the last bar is the dominant with the floor dropping.
    arp: ['em', 'em', 'f', 'b7', 'em', 'em', 'f', 'b7', 'em', 'em', 'f', 'b7'],
    // A pedal that will not let go: eighths hammering the root, the semitone
    // shove up to F and back, and the tritone a# walking through.
    bassLine: [
      'e2 .  e2 .  e2 .  e3 .  e2 .  e2 .  a#2 .  b2 . ',
      'e2 .  e2 .  e2 .  e3 .  e2 .  e2 .  d2 .  d#2 . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  f2 .  g#2 .  g2 . ',
      'b2 .  b2 .  b2 .  b3 .  b2 .  a#2 .  a2 .  g#2 . ',
      'e2 .  e2 .  e2 .  e3 .  e2 .  e2 .  a#2 .  b2 . ',
      'e2 .  e2 .  e2 .  e3 .  e2 .  e2 .  d2 .  d#2 . ',
      'f2 .  f2 .  f2 .  f3 .  f2 .  f2 .  g#2 .  g2 . ',
      'b2 .  b2 .  b2 .  b3 .  a#2 .  a2 .  g#2 .  g2 . ',
      'e2 .  e2 e2 e2 .  e3 .  e2 .  e2 e2 e2 .  e3 . ',
      'e2 .  e2 e2 e2 .  e3 .  e2 .  e2 e2 e2 .  d#2 . ',
      'f2 .  f2 f2 f2 .  f3 .  f2 .  f2 f2 f2 .  f2 . ',
      'b2 .  b2 .  b2 .  b2 .  b1 .  .  .  .  .  .  . ',
    ],
    bass: null,
    // The heaviest kit in the game. Kick doubled, the metallic rasp on the
    // upbeats, and the last bar of each pass opens into a roll.
    drums: [
      'k.m.x.m.k.m.x.m.',
      'k.m.x.m.k.m.x.m.',
      'k.m.x.m.k.m.x.m.',
      'k.m.x.m.x.x.x.xx',
      'kkm.x.m.k.m.x.m.',
      'kkm.x.m.k.m.x.m.',
      'kkm.x.m.k.m.x.m.',
      'kkm.x.m.x.x.xxxx',
      'k.x.k.x.k.x.k.x.',
      'k.x.k.x.k.x.k.x.',
      'k.x.k.x.k.x.kkxx',
      'k...x...k...xxxx',
    ],
    // The snarl: the thin lead over a hollow harmony.
    duty: { lead: 0.125, under: 0.5, arp: 0.5, bass: 0.5 },
    mix: { lead: 0.3, under: 0.09, arp: 0.05, bass: 0.15, sub: 0.07 },
  },
};


/**
 * How loud each voice sits, per song, because the balance is part of the
 * writing. A theme carried by its bass and one carried by its lead do not want
 * the same mix, and eight stages will not either.
 */
export const MIX = { lead: 0.2, under: 0.075, arp: 0.07, bass: 0.17, sub: 0.085 };

/**
 * The shape of each pulse voice, as a duty cycle.
 *
 * 0.5 is a plain square and the hollow one -- it has no even harmonics at all.
 * 0.25 is reedy and 0.125 is thin and nasal, and those two are what a chip lead
 * actually sounds like. Giving the lead and the harmony different duties is
 * also what stops two pulse voices from fusing into one thicker voice.
 */
export const DUTY = { lead: 0.25, under: 0.125, arp: 0.5, bass: 0.5 };

/** The song a level asks for, or the default. */
export const songFor = (name) => SONGS[name] || SONGS.bumblebee;
