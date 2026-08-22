// The parts of the NES's sound hardware that a plain oscillator cannot do.
//
// Everything else about this synth is ahead of the 2A03 -- unlimited voices,
// smooth envelopes, real filters, correct pitch -- so parity is not a matter of
// catching up in general. It is four specific things the hardware did that a
// browser oscillator has no equivalent for, and each of them is audible:
//
//   the noise channel      is not white noise. It is a shift register, and in
//                          its short mode it repeats every 93 bits, which the
//                          ear hears as a pitch. That is the metallic buzz.
//   the triangle           is not a triangle. It is a staircase of sixteen
//                          levels up and sixteen down, and the corners of those
//                          steps are why it has a rasp a pure triangle lacks.
//   the sweep unit         slid a channel's pitch in hardware, by halving or
//                          adding a fraction of its period on a timer.
//   the period register    is eleven bits, so pitch is quantised -- and coarsely
//                          at the top of the range, where a semitone can be
//                          fewer than one step wide.

const CPU_HZ = 1789773;         // NTSC 2A03 clock

/** The noise channel's sixteen periods, in CPU cycles. Index 0 is the highest. */
export const NOISE_PERIODS = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
];

/**
 * The noise channel, as an audio buffer.
 *
 * A fifteen-bit shift register, clocked at the chosen period, feeding back bit
 * 0 exclusive-ored with bit 1 -- or with bit 6 in short mode, which shortens
 * the sequence from 32767 steps to 93 and turns hiss into a pitched, metallic
 * rasp. The output is bit 0, inverted.
 */
export function lfsrBuffer(ctx, { short = false, period = 8, seconds = 1 } = {}) {
  const rate = CPU_HZ / period;              // shift register clocks a second
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const out = buf.getChannelData(0);
  let reg = 1;
  let acc = 0;
  const per = ctx.sampleRate / rate;         // samples per shift
  let level = 1;
  for (let i = 0; i < len; i++) {
    acc += 1;
    while (acc >= per) {
      acc -= per;
      const bit = (reg ^ (reg >> (short ? 6 : 1))) & 1;
      reg = (reg >> 1) | (bit << 14);
      level = (reg & 1) ? -1 : 1;
    }
    out[i] = level;
  }
  return buf;
}

/**
 * The triangle channel's actual waveform: a staircase of 32 levels, not a
 * smooth ramp. Built as a PeriodicWave from the steps' own Fourier series, so
 * the browser band-limits it per note and the corners stay clean.
 */
export function stepTriangle(ctx) {
  if (ctx._nesTriangle) return ctx._nesTriangle;
  const STEPS = 32, N = 64;
  const shape = new Float32Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    const v = i < 16 ? i : 31 - i;           // 0..15 up, 15..0 down
    shape[i] = (v / 7.5) - 1;                // to -1..1
  }
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    let re = 0, im = 0;
    for (let i = 0; i < STEPS; i++) {
      const a = (2 * Math.PI * n * i) / STEPS;
      re += shape[i] * Math.cos(a);
      im -= shape[i] * Math.sin(a);
    }
    real[n] = (2 / STEPS) * re;
    imag[n] = (2 / STEPS) * im;
  }
  ctx._nesTriangle = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  return ctx._nesTriangle;
}

/**
 * A frequency as the hardware could actually have played it.
 *
 * The pulse channels divide the CPU clock by a eleven-bit period, so the
 * playable pitches are a fixed grid that gets coarse at the top: around C7 the
 * gap between one period and the next is most of a semitone, which is why NES
 * music so often sounds slightly sour up there.
 */
export function quantize(f) {
  if (!(f > 0)) return f;
  const period = Math.round(CPU_HZ / (16 * f)) - 1;
  if (period < 8) return CPU_HZ / (16 * 9);   // the hardware mutes below this
  if (period > 2047) return f;
  return CPU_HZ / (16 * (period + 1));
}

/** How far off the wanted pitch that grid puts you, in cents. */
export function quantizeError(f) {
  return 1200 * Math.log2(quantize(f) / f);
}

/**
 * The sweep unit: the pitch slide, in hardware.
 *
 * Every tick it adds or subtracts the period shifted right by `shift`, which is
 * a change of a fixed *fraction* -- so a slide covers the same musical interval
 * wherever it starts, and accelerates in Hz as it rises. Returned as a list of
 * (time, frequency) points to schedule, because that is the shape, and easing
 * smoothly between the endpoints is not.
 */
export function sweepPoints(f0, { up = true, shift = 4, ticks = 8, rate = 120 }) {
  const pts = [];
  let period = CPU_HZ / (16 * f0) - 1;
  for (let i = 0; i < ticks; i++) {
    const delta = Math.floor(period) >> shift;
    period += up ? -delta : delta;
    if (period < 8 || period > 2047) break;
    pts.push({ t: (i + 1) / rate, f: CPU_HZ / (16 * (period + 1)) });
  }
  return pts;
}

/** The envelope's fifteen steps, as the hardware counted them down. */
export function envelopeSteps(peak, ticks = 15) {
  const out = [];
  for (let i = 0; i < ticks; i++) out.push((peak * (ticks - i)) / ticks);
  return out;
}
