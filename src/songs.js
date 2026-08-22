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
};

/**
 * How loud each voice sits, per song, because the balance is part of the
 * writing. A theme carried by its bass and one carried by its lead do not want
 * the same mix, and eight stages will not either.
 */
export const MIX = { lead: 0.2, under: 0.075, arp: 0.07, bass: 0.17, sub: 0.085 };

/** The song a level asks for, or the default. */
export const songFor = (name) => SONGS[name] || SONGS.bumblebee;
