// Draws the canyon.
//
// The trench is emitted as a ladder of cross-sections: every slice caches the
// world position of a fixed set of canyon-local "tracks" (floor edges, wall
// bands, rim lips, surface plating), and consecutive slices are joined by
// longitudinal lines. That single cache is what keeps the whole canyon inside a
// few thousand segments -- cheap enough to run flat out on a phone.

import { hash2, hsv, clamp, smoothstep } from './math.js';

const SLICE = 14;          // track units between cross-sections
const DRAW = 1180;         // draw distance
const BEHIND = 60;
const NTRACK = 15;
const STARS = 150;

// Canyon-local track layout, resolved per slice against that slice's hw/rim.
// [lateral sign, lateral offset, height fraction of rim, height offset]
const TRACKS = [
  [-1, 0, 0, 0],       // 0  floor left
  [1, 0, 0, 0],        // 1  floor right
  [-1, 0, 0.34, 0],    // 2  wall band low, left
  [1, 0, 0.34, 0],     // 3
  [-1, 0, 0.68, 0],    // 4  wall band high, left
  [1, 0, 0.68, 0],     // 5
  [-1, 0, 1, 0],       // 6  rim lip left
  [1, 0, 1, 0],        // 7
  [-1, 70, 1, 0],      // 8  surface plating
  [1, 70, 1, 0],       // 9
  [-1, 185, 1, 0],     // 10
  [1, 185, 1, 0],      // 11
  [-1, 355, 1, 0],     // 12
  [1, 355, 1, 0],      // 13
  [0, 0, 0, 0],        // 14 floor centreline (chevron strip)
];

export class TerrainRenderer {
  constructor(track) {
    this.track = track;
    this.frames = [];
    this.pts = new Float32Array(0);
    this.meta = [];
    this.stars = new Float32Array(STARS * 3);
    for (let i = 0; i < STARS; i++) {
      // Deterministic points on a hemisphere, biased upward so they read as sky.
      const u = hash2(i, 101) * 2 - 1;
      const a = hash2(i, 102) * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      this.stars[i * 3] = r * Math.cos(a);
      this.stars[i * 3 + 1] = Math.abs(u) * 0.9 + 0.1;
      this.stars[i * 3 + 2] = r * Math.sin(a);
    }
    this.c = { wall: [0, 0, 0], band: [0, 0, 0], rim: [0, 0, 0], floor: [0, 0, 0], deck: [0, 0, 0] };
  }

  /** Palette for a slice, derived from the section's authored hue. */
  palette(h, alarm) {
    const c = this.c;
    hsv(h, 0.78, 0.40, c.wall);
    hsv(h, 0.62, 0.62, c.band);
    hsv(h, 0.30, 1.00, c.rim);
    hsv(h + 0.02, 0.82, 0.34, c.floor);
    // The surface deck flushes hostile while you are exposed on top of it.
    hsv(h - 0.05 + alarm * -0.1, 0.55 + alarm * 0.4, 0.46 + alarm * 0.5, c.deck);
    return c;
  }

  draw(rd, camT, exposed, time, deckAlpha = 1) {
    const tr = this.track;
    const i0 = Math.floor((camT - BEHIND) / SLICE);
    const i1 = Math.ceil((camT + DRAW) / SLICE);
    const n = i1 - i0 + 1;

    if (this.pts.length < n * NTRACK * 3) this.pts = new Float32Array(n * NTRACK * 3);
    while (this.frames.length < n) this.frames.push({ t: 0, p: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], railY: 0 });
    while (this.meta.length < n) this.meta.push({ hw: 0, rim: 0, rough: 0, hue: 0 });

    const alarm = exposed ? 0.5 + 0.5 * Math.sin(time * 11) : 0;
    const out = [0, 0, 0];

    // Pass 1: resolve every slice's tracks into world space.
    for (let k = 0; k < n; k++) {
      const t = (i0 + k) * SLICE;
      const fr = tr.frameAt(t, this.frames[k]);
      const hw = tr.halfWidth(t);
      const rim = tr.rim(t);
      const m = this.meta[k];
      m.hw = hw; m.rim = rim; m.rough = tr.rough(t); m.hue = tr.hue(t);

      const base = k * NTRACK * 3;
      for (let j = 0; j < NTRACK; j++) {
        const [sgn, off, hf, hoff] = TRACKS[j];
        const x = sgn * (hw + off);
        let y = rim * hf + hoff;
        if (hf === 0) y += tr.floorAt(t, x);
        tr.localToWorldF(fr, x, y, out);
        this.pts[base + j * 3] = out[0];
        this.pts[base + j * 3 + 1] = out[1];
        this.pts[base + j * 3 + 2] = out[2];
      }
    }

    this.drawStars(rd);

    // Pass 2: join consecutive slices, and add per-slice detail.
    const P = this.pts;
    for (let k = 0; k < n - 1; k++) {
      const a = k * NTRACK * 3;
      const b = (k + 1) * NTRACK * 3;
      const m = this.meta[k];
      const c = this.palette(m.hue, alarm);
      const gi = i0 + k;

      // Longitudinal rails. The rim lips are brightest because they are the
      // line the player is judging their altitude against.
      this.rail(rd, P, a, b, 0, c.floor, 1.0);
      this.rail(rd, P, a, b, 1, c.floor, 1.0);
      this.rail(rd, P, a, b, 2, c.wall, 0.9);
      this.rail(rd, P, a, b, 3, c.wall, 0.9);
      this.rail(rd, P, a, b, 4, c.band, 1.0);
      this.rail(rd, P, a, b, 5, c.band, 1.0);
      this.rail(rd, P, a, b, 6, c.rim, 1.45);
      this.rail(rd, P, a, b, 7, c.rim, 1.45);
      for (let j = 8; j <= 13; j++) this.rail(rd, P, a, b, j, c.deck, 0.85, deckAlpha);

      // Cross ties on the floor.
      if (gi % 2 === 0) {
        rd.line3(P[a], P[a + 1], P[a + 2], P[a + 3], P[a + 4], P[a + 5],
          0.9, c.floor[0], c.floor[1], c.floor[2], 0.75);
      }

      // Wall ribs, floor to rim.
      if (gi % 3 === 0) {
        rd.line3(P[a], P[a + 1], P[a + 2], P[a + 18], P[a + 19], P[a + 20],
          0.85, c.wall[0], c.wall[1], c.wall[2], 0.85);
        rd.line3(P[a + 3], P[a + 4], P[a + 5], P[a + 21], P[a + 22], P[a + 23],
          0.85, c.wall[0], c.wall[1], c.wall[2], 0.85);
      }

      // Surface deck cross-plating, outward from each rim lip.
      if (gi % 4 === 0) {
        rd.line3(P[a + 18], P[a + 19], P[a + 20], P[a + 36], P[a + 37], P[a + 38],
          0.8, c.deck[0], c.deck[1], c.deck[2], 0.8 * deckAlpha);
        rd.line3(P[a + 21], P[a + 22], P[a + 23], P[a + 39], P[a + 40], P[a + 41],
          0.8, c.deck[0], c.deck[1], c.deck[2], 0.8 * deckAlpha);
      }

      if (m.rough > 0.05) this.greeble(rd, gi, m, this.frames[k], c);
      if (m.rough > 0.25 && gi % 5 === 0 && deckAlpha > 0.12) {
        this.tower(rd, gi, m, this.frames[k], c, deckAlpha);
      }
    }

    this.chevrons(rd, camT, i0 * SLICE, (i1) * SLICE);
  }

  rail(rd, P, a, b, j, col, w, a1 = 1) {
    const o = j * 3;
    rd.line3(P[a + o], P[a + o + 1], P[a + o + 2], P[b + o], P[b + o + 1], P[b + o + 2],
      w, col[0], col[1], col[2], a1);
  }

  /** Panel detail on the wall faces. Cheap, hash-driven, stable frame to frame. */
  greeble(rd, gi, m, fr, c) {
    const tr = this.track;
    const count = m.rough > 0.6 ? 2 : 1;
    const p0 = [0, 0, 0], p1 = [0, 0, 0], p2 = [0, 0, 0], p3 = [0, 0, 0];
    for (let s = 0; s < 2; s++) {
      const sgn = s === 0 ? -1 : 1;
      for (let i = 0; i < count; i++) {
        const h = hash2(gi * 7 + i, s * 31 + 5);
        if (h > m.rough) continue;
        const y0 = 8 + hash2(gi + i, s + 17) * (m.rim - 30);
        const hh = 6 + hash2(gi + i, s + 23) * 16;
        const dz = 5 + hash2(gi + i, s + 29) * 7;
        const x = sgn * (m.hw - 1);
        const t = fr.t;
        tr.localToWorld(t, x, y0, p0);
        tr.localToWorld(t, x, y0 + hh, p1);
        tr.localToWorld(t + dz, x, y0 + hh, p2);
        tr.localToWorld(t + dz, x, y0, p3);
        const a = 0.7;
        rd.line3(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.7, c.band[0], c.band[1], c.band[2], a);
        rd.line3(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 0.7, c.band[0], c.band[1], c.band[2], a);
        rd.line3(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.7, c.band[0], c.band[1], c.band[2], a);
        rd.line3(p3[0], p3[1], p3[2], p0[0], p0[1], p0[2], 0.7, c.band[0], c.band[1], c.band[2], a);
      }
    }
  }

  /** Spires on the surface deck: the reason being up top feels like a place. */
  tower(rd, gi, m, fr, c, alpha = 1) {
    const tr = this.track;
    const h = hash2(gi, 71);
    if (h > 0.35) return;
    const sgn = hash2(gi, 72) < 0.5 ? -1 : 1;
    const x = sgn * (m.hw + 130 + hash2(gi, 73) * 260);
    const height = 60 + hash2(gi, 74) * 190;
    const w = 9 + hash2(gi, 75) * 13;
    const t = fr.t;
    const a = [0, 0, 0], b = [0, 0, 0];
    for (const dx of [-w, w]) {
      tr.localToWorld(t, x + dx, m.rim, a);
      tr.localToWorld(t, x + dx, m.rim + height, b);
      rd.line3(a[0], a[1], a[2], b[0], b[1], b[2], 0.9,
        c.deck[0], c.deck[1], c.deck[2], 0.95 * alpha);
    }
    tr.localToWorld(t, x - w, m.rim + height, a);
    tr.localToWorld(t, x + w, m.rim + height, b);
    rd.line3(a[0], a[1], a[2], b[0], b[1], b[2], 0.9,
      c.deck[0], c.deck[1], c.deck[2], 0.95 * alpha);
    // A blinking hazard lamp on top.
    if (hash2(gi, 76) < 0.45) {
      tr.localToWorld(t, x, m.rim + height + 6, a);
      rd.dot3(a[0], a[1], a[2], 2.2, 1, 0.35, 0.2, 0.9 * alpha);
    }
  }

  /** Amber chevrons streaming down the trench floor: the speed cue. */
  chevrons(rd, camT, tStart, tEnd) {
    const tr = this.track;
    const STEP = 64;
    const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    let t = Math.ceil(tStart / STEP) * STEP;
    for (; t < tEnd; t += STEP) {
      const fade = smoothstep(0, 120, t - camT);
      if (fade <= 0) continue;
      tr.localToWorld(t, -20, tr.floorAt(t, -20), a);
      tr.localToWorld(t + 30, 0, tr.floorAt(t + 30, 0), b);
      tr.localToWorld(t, 20, tr.floorAt(t, 20), c);
      rd.line3(a[0], a[1], a[2], b[0], b[1], b[2], 1.2, 1, 0.55, 0.12, fade * 0.8);
      rd.line3(b[0], b[1], b[2], c[0], c[1], c[2], 1.2, 1, 0.55, 0.12, fade * 0.8);
    }
  }

  /**
   * Stars, projected straight from direction. They bypass the depth pipeline
   * because a star has no distance -- it is a bearing.
   */
  drawStars(rd) {
    const S = this.stars;
    for (let i = 0; i < STARS; i++) {
      const dx = S[i * 3], dy = S[i * 3 + 1], dz = S[i * 3 + 2];
      const vz = dx * rd.fx + dy * rd.fy + dz * rd.fz;
      if (vz < 0.08) continue;
      const vx = dx * rd.rx + dy * rd.ry + dz * rd.rz;
      const vy = dx * rd.ux + dy * rd.uy + dz * rd.uz;
      const k = rd.focal / vz;
      const sx = rd.cx + vx * k;
      const sy = rd.cy - vy * k;
      const b = 0.3 + hash2(i, 55) * 0.7;
      rd.line2(sx, sy, sx, sy, 0.8 + b * 0.7, 0.75, 0.85, 1, b * 0.5, b * 0.5);
    }
  }
}

export const CANYON = { SLICE, DRAW };
