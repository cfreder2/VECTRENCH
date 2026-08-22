// The score book: one song per level.
//
// The synth this plays through is the NES's, near enough -- two pulse voices, a
// triangle, and noise -- which is the palette every Mega Man stage was written
// for. What made those tracks sound bigger than four voices was never more
// instruments; it was technique. Three of them, all here:
//
//   arpeggios     a chord is not a chord, it is one voice cycling three notes
//                 faster than the ear separates them. It is where the shimmer
//                 comes from, and it costs one channel instead of three.
//   vibrato       a held note that does not waver sounds like a test tone.
//   a bass line   roots on the beat is a metronome. A bass that walks is a part.
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
    // Null is a bar the score leaves unaccompanied. The opening descent is
    // nearly solo and filling it in would trample the best moment in the piece.
    bass: ['e3', null, 'e2', null, null, null, 'a2', 'a2', 'a2', 'a2', 'a2',
      'd3', 'c3', 'e3', 'd3', 'd3', 'f3', 'd3', 'f3', 'e3', 'd3', 'c#3'],
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
    lead: [
      'e5 .  .  .  a5 .  .  .  g5 .  e5 .  d5 .  .  . ',
      'c5 .  .  .  e5 .  .  .  d5 .  c5 .  b4 .  .  . ',
      'a4 .  .  .  c5 .  .  .  e5 .  .  .  d5 .  c5 . ',
      'b4 .  .  .  .  .  -  -  e5 .  d5 .  c5 .  b4 . ',
      'a4 .  b4 .  c5 .  d5 .  e5 .  .  .  .  .  g5 . ',
      'f5 .  .  .  e5 .  d5 .  c5 .  .  .  d5 .  e5 . ',
      'g5 .  .  .  f5 .  e5 .  d5 .  c5 .  b4 .  a4 . ',
      'a4 .  .  .  .  .  .  .  e5 .  .  .  .  .  .  . ',
    ],
    // A second pulse voice, a fifth or a third under the lead where it holds --
    // the trick that makes two channels sound like a section.
    lead2: [
      'c5 .  .  .  e5 .  .  .  d5 .  c5 .  a4 .  .  . ',
      'a4 .  .  .  c5 .  .  .  b4 .  a4 .  g4 .  .  . ',
      'e4 .  .  .  a4 .  .  .  c5 .  .  .  b4 .  a4 . ',
      'g4 .  .  .  .  .  -  -  c5 .  b4 .  a4 .  g4 . ',
      '-  -  -  -  -  -  -  -  c5 .  .  .  .  .  e5 . ',
      'd5 .  .  .  c5 .  b4 .  a4 .  .  .  b4 .  c5 . ',
      'e5 .  .  .  d5 .  c5 .  b4 .  a4 .  g4 .  f4 . ',
      'f4 .  .  .  .  .  .  .  c5 .  .  .  .  .  .  . ',
    ],
    // i i VI v III V7 iv V7. Bar four carries a B in the tune, which is a
    // tritone against an F -- E minor holds it instead. Bar six leans on an F,
    // which is the seventh of a G rather than a clash with one.
    arp: ['am', 'am', 'f', 'em', 'c', 'g7', 'dm', 'e7'],
    // The arpeggio is carrying the harmony here, so the bass gets out of its
    // way and the lead comes forward: rendered with the default mix, 85% of the
    // energy sat under 250Hz and the tune was somewhere beneath it.
    mix: { lead: 0.3, under: 0.11, arp: 0.085, bass: 0.1, sub: 0.05 },
    bass: ['a2', 'a2', 'f2', 'e2', 'c3', 'g2', 'd3', 'e2'],
    // Softer than a march: the kick on one and three, hats on the offbeats.
    drums: 'k...h...k...h...',
  },

  /**
   * FIRE. The opposite of the water stage in every choice: fast where that
   * flows, hammered where that drifts, and short notes where that holds.
   *
   * E minor, but the dominant is a B7 -- which carries a D sharp, the raised
   * seventh of the harmonic minor. That one note is what makes a stage sound
   * hot rather than merely dark: it is a semitone from the tonic and it will
   * not sit still. The bar before every return to E minor leans on it.
   *
   * The lead is rhythm rather than song. Stabs and runs, nothing held longer
   * than a beat except at the end of a phrase, so there is no room to breathe.
   */
  fire: {
    name: 'FIRE',
    bpm: 172,
    beats: 16,
    lead: [
      'e5 .  d5 .  e5 .  g5 .  b5 .  .  .  a5 g5 f#5 . ',
      'e5 .  d5 .  e5 .  b4 .  e5 .  .  .  -  -  -  - ',
      'g5 .  f5 .  e5 .  c5 .  g5 .  .  .  f5 e5 d5 . ',
      'd#5 . e5 .  f#5 .  d#5 .  b4 .  .  .  -  -  -  - ',
      'e5 .  g5 .  b5 .  a5 .  b5 .  g5 .  e5 .  b4 . ',
      'a5 .  .  .  g5 .  e5 .  c5 .  e5 .  a5 .  .  . ',
      'b5 .  a5 .  g5 .  f5 .  e5 .  d5 .  c5 .  b4 . ',
      'b4 .  d#5 .  f#5 .  b5 .  b5 .  .  .  .  .  .  . ',
    ],
    lead2: [
      'b4 .  a4 .  b4 .  e5 .  g5 .  .  .  e5 d5 b4 . ',
      'b4 .  a4 .  b4 .  g4 .  b4 .  .  .  -  -  -  - ',
      'e5 .  d5 .  c5 .  g4 .  e5 .  .  .  d5 c5 b4 . ',
      'f#4 . g4 .  b4 .  f#4 .  f#4 .  .  .  -  -  -  - ',
      'b4 .  e5 .  g5 .  e5 .  g5 .  e5 .  b4 .  g4 . ',
      'e5 .  .  .  e5 .  c5 .  a4 .  c5 .  e5 .  .  . ',
      'g5 .  f5 .  e5 .  d5 .  c5 .  b4 .  a4 .  g4 . ',
      'f#4 . b4 .  d#5 .  f#5 .  f#5 .  .  .  .  .  .  . ',
    ],
    arp: ['em', 'em', 'c', 'b7', 'em', 'am', 'c', 'b7'],
    bass: ['e2', 'e2', 'c3', 'b2', 'e2', 'a2', 'c3', 'b2'],
    // Four on the floor. A stage that is on fire does not have a backbeat.
    drums: 'k..hk..hk..hk..h',
    mix: { lead: 0.26, under: 0.085, arp: 0.055, bass: 0.16, sub: 0.07 },
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
    loopFrom: 2,          // bars 1-2 are the way in; the loop is bars 3-10
    drumsFrom: 1,         // and the drums arrive a bar after the arpeggio does
    lead: [
      '-  -  -  -  -  -  -  -  -  -  -  -  a4 .  b4 . ',
      'c5 .  .  .  .  .  .  .  e5 .  .  .  .  .  g5 . ',
      'a5 .  .  .  .  .  g5 .  e5 .  .  .  .  .  .  . ',
      'f5 .  .  .  .  .  .  .  e5 .  d5 .  c5 .  .  . ',
      'e5 .  .  .  g5 .  .  .  .  .  a5 .  g5 .  e5 . ',
      'd5 .  .  .  .  .  .  .  b4 .  d5 .  g5 .  .  . ',
      'a5 .  .  .  .  .  .  .  f5 .  a5 .  .  .  .  . ',
      'g5 .  .  .  e5 .  .  .  a5 .  .  .  .  .  .  . ',
      'f5 .  .  .  e5 .  d5 .  c5 .  d5 .  e5 .  .  . ',
      'b4 .  .  .  d5 .  .  .  e5 .  .  .  .  .  .  . ',
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
    ],
    arp: ['am', 'am', 'am', 'f', 'c', 'g', 'dm', 'am', 'f', 'e7'],
    // Nothing under the first bar at all: the arpeggio starts it alone.
    bass: [null, 'a2', 'a2', 'f2', 'c3', 'g2', 'd3', 'a2', 'f2', 'e2'],
    // Nothing under the first bar: the drums arrive with the theme.
    drums: 'k..hk.h.k..hk.h.',
    // Long notes put less energy in the melody band than a busy lead does --
    // measured, the first mix left the tune at 40.8% of what the ear hears
    // against about 70 for the other two. The lead comes up and the parts
    // running underneath it come down.
    mix: { lead: 0.36, under: 0.085, arp: 0.055, bass: 0.13, sub: 0.055 },
  },
};


/**
 * How loud each voice sits, per song, because the balance is part of the
 * writing. A theme carried by its bass and one carried by its lead do not want
 * the same mix, and eight stages will not either.
 */
export const MIX = { lead: 0.2, under: 0.075, arp: 0.07, bass: 0.17, sub: 0.085 };

/** The song a level asks for, or the default. */
export const songFor = (name) => SONGS[name] || SONGS.bumblebee;
