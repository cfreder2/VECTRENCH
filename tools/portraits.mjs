// Portraits: every enemy, obstacle and the ship, rendered to PNG from the same
// draw code the game runs.
//
// The point is that these pictures cannot go stale in the way a hand-drawn
// diagram does. `drawEnemies`, `drawObstacles` and `drawShip` are imported from
// src/entities.js and called with a straight stub trench, so if a gun grows a
// second barrel tomorrow, re-running this shows the second barrel. Nothing here
// re-describes a shape; it only decides where the camera stands.
//
// There is no WebGL in node, so the vector display is reimplemented in software
// below -- the same near-clip, the same quad expansion, the same core-plus-halo
// falloff as renderer.js's fragment shader, accumulated additively into a float
// buffer. It is slow and it does not have to be fast.
//
//   node tools/portraits.mjs            # all of them, into docs/assets/
//   node tools/portraits.mjs turret     # just the ones whose id matches
//
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { drawEnemies, drawObstacles, drawShip, shipBasis } from '../src/entities.js';
import { makeWarden, updateWarden, drawWarden } from '../src/boss.js';
import { drawText } from '../src/font.js';
import { TAU } from '../src/math.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/assets');

// Portrait size, and how much bigger it is rendered before being averaged down.
// The renderer has no antialiasing of its own -- the halo hides that on a
// moving 60fps display and does not hide it in a still.
const W = 560, H = 420, SS = 2;
const NEAR = 1.2;

// --- the stub trench ------------------------------------------------------
//
// Straight, level, and infinite: canyon-local (t, x, y) is world (x, y, t).
// Every draw function works through this interface and never sees a real
// track, so a portrait is the shape itself with the canyon's bend taken out.
const HALF_WIDTH = 62, RIM = 118;
const track = {
  localToWorld(t, x, y, out) { out[0] = x; out[1] = y; out[2] = t; return out; },
  halfWidth: () => HALF_WIDTH,
  rim: () => RIM,
};

// --- the vector display, in software --------------------------------------

/** Collects world-space points so the camera can be fitted to what is drawn. */
class Bounds {
  constructor() { this.pts = []; }
  line3(x0, y0, z0, x1, y1, z1) { this.pts.push([x0, y0, z0], [x1, y1, z1]); }
  dot3(x, y, z) { this.pts.push([x, y, z]); }
  line2() {}
}

class Display {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.buf = new Float32Array(width * height * 3);
    this.cx = width * 0.5;
    this.cy = height * 0.5;
    this.ex = 0; this.ey = 0; this.ez = 0;
    this.rx = 1; this.ry = 0; this.rz = 0;
    this.ux = 0; this.uy = 1; this.uz = 0;
    this.fx = 0; this.fy = 0; this.fz = 1;
    this.focal = 500;
    this.far = 1e6;
    this.fogNear = 1e6;   // portraits are lit evenly; distance fade is a run thing
    this.widthScale = 1;
  }

  get scale() { return this.height / 720; }

  setCamera(eye, right, up, fwd, fovY) {
    this.ex = eye[0]; this.ey = eye[1]; this.ez = eye[2];
    this.rx = right[0]; this.ry = right[1]; this.rz = right[2];
    this.ux = up[0]; this.uy = up[1]; this.uz = up[2];
    this.fx = fwd[0]; this.fy = fwd[1]; this.fz = fwd[2];
    this.focal = this.height * 0.5 / Math.tan(fovY * 0.5);
  }

  project(x, y, z, out) {
    const dx = x - this.ex, dy = y - this.ey, dz = z - this.ez;
    const vz = dx * this.fx + dy * this.fy + dz * this.fz;
    if (vz < NEAR) return vz;
    const vx = dx * this.rx + dy * this.ry + dz * this.rz;
    const vy = dx * this.ux + dy * this.uy + dz * this.uz;
    const k = this.focal / vz;
    out[0] = this.cx + vx * k;
    out[1] = this.cy - vy * k;
    return vz;
  }

  /** Same near-plane clip as renderer.js: clip the segment, never drop it. */
  line3(x0, y0, z0, x1, y1, z1, w, r, g, b, a = 1) {
    let ax = x0 - this.ex, ay = y0 - this.ey, az = z0 - this.ez;
    let bx = x1 - this.ex, by = y1 - this.ey, bz = z1 - this.ez;
    let az_ = ax * this.fx + ay * this.fy + az * this.fz;
    let bz_ = bx * this.fx + by * this.fy + bz * this.fz;
    if (az_ < NEAR && bz_ < NEAR) return;
    if (az_ < NEAR) {
      const t = (NEAR - az_) / (bz_ - az_);
      ax += (bx - ax) * t; ay += (by - ay) * t; az += (bz - az) * t;
      az_ = NEAR;
    } else if (bz_ < NEAR) {
      const t = (NEAR - bz_) / (az_ - bz_);
      bx += (ax - bx) * t; by += (ay - by) * t; bz += (az - bz) * t;
      bz_ = NEAR;
    }
    const ka = this.focal / az_, kb = this.focal / bz_;
    this.line2(
      this.cx + (ax * this.rx + ay * this.ry + az * this.rz) * ka,
      this.cy - (ax * this.ux + ay * this.uy + az * this.uz) * ka,
      this.cx + (bx * this.rx + by * this.ry + bz * this.rz) * kb,
      this.cy - (bx * this.ux + by * this.uy + bz * this.uz) * kb,
      w, r, g, b, a, a,
    );
  }

  dot3(x, y, z, w, r, g, b, a = 1) {
    const p = [0, 0];
    if (this.project(x, y, z, p) < NEAR) return;
    this.line2(p[0], p[1], p[0], p[1], w, r, g, b, a, a);
  }

  /**
   * One screen-space segment, rasterized the way the shader shades it: a quad
   * widened well past the core, `u` running -1..1 across it, and every pixel
   * lit by smoothstep(1, 0, |u| * 3.1) + exp(-|u| * 3.4) * 0.42.
   */
  line2(x0, y0, x1, y1, w, r, g, b, a0, a1) {
    const hw = (w * this.widthScale) * 2.3 + 0.75;
    let dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
    const cap = hw * 0.55;
    // The quad, from one cap to the other.
    const ax = x0 - dx * cap, ay = y0 - dy * cap;
    const L = len + cap * 2;

    const px = -dy * hw, py = dx * hw;
    const cs = [
      [ax + px, ay + py], [ax - px, ay - py],
      [ax + dx * L + px, ay + dy * L + py], [ax + dx * L - px, ay + dy * L - py],
    ];
    let lo = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))));
    let hi = Math.min(this.width - 1, Math.ceil(Math.max(...cs.map((c) => c[0]))));
    let bo = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))));
    let bi = Math.min(this.height - 1, Math.ceil(Math.max(...cs.map((c) => c[1]))));

    for (let y = bo; y <= bi; y++) {
      for (let x = lo; x <= hi; x++) {
        const qx = x + 0.5 - ax, qy = y + 0.5 - ay;
        const s = qx * dx + qy * dy;
        if (s < 0 || s > L) continue;
        const u = Math.abs(qx * -dy + qy * dx) / hw;
        if (u > 1) continue;
        const t = Math.min(1, Math.max(0, (s - cap) / (len || 1)));
        const a = a0 + (a1 - a0) * t;
        const e = Math.min(1, Math.max(0, 1 - u * 3.1));
        const core = e * e * (3 - 2 * e);
        const A = (core + Math.exp(-u * 3.4) * 0.42) * a;
        const o = (y * this.width + x) * 3;
        this.buf[o] += r * A;
        this.buf[o + 1] += g * A;
        this.buf[o + 2] += b * A;
      }
    }
  }

  /** Average down, then the composite pass: vignette and a faint scanline. */
  resolve(ss) {
    const w = (this.width / ss) | 0, h = (this.height / ss) | 0;
    const px = Buffer.alloc(w * h * 3);
    const n = ss * ss;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < ss; j++) {
          for (let i = 0; i < ss; i++) {
            const o = (((y * ss + j) * this.width) + x * ss + i) * 3;
            // Clamped per sample: the framebuffer is 8-bit and saturates, so a
            // pile of overlapping strokes is white, not arbitrarily bright.
            r += Math.min(1, this.buf[o]);
            g += Math.min(1, this.buf[o + 1]);
            b += Math.min(1, this.buf[o + 2]);
          }
        }
        const ux = (x + 0.5) / w - 0.5, uy = (y + 0.5) / h - 0.5;
        const vig = 1 - (ux * ux + uy * uy) * 0.75;
        const scan = 1 - 0.08 * (0.5 - 0.5 * Math.cos((y + 0.5) * Math.PI));
        const k = (vig * scan * 255) / n;
        const o = (y * w + x) * 3;
        px[o] = Math.min(255, r * k);
        px[o + 1] = Math.min(255, g * k);
        px[o + 2] = Math.min(255, b * k);
      }
    }
    return { w, h, px };
  }
}

// --- PNG ------------------------------------------------------------------

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png({ w, h, px }) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;   // filter: none
    px.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- framing --------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
function norm(v) {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Puts the camera on `view` looking at what `draw` drew, as close as it can get
 * with all of it still inside `fill` of the frame.
 *
 * Solved rather than searched: sliding the camera along its own forward axis
 * only adds to every point's depth, so the closest distance that still fits a
 * point is one division, and the answer is the largest of those.
 */
function fit(rd, draw, view, fov, fill) {
  const bb = new Bounds();
  draw(bb);
  if (!bb.pts.length) throw new Error('nothing drawn');

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of bb.pts) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < lo[i]) lo[i] = p[i];
      if (p[i] > hi[i]) hi[i] = p[i];
    }
  }
  const mid = [0, 1, 2].map((i) => (lo[i] + hi[i]) * 0.5);

  const f = norm(view);
  const r = norm(cross([0, 1, 0], f));
  const u = cross(f, r);
  const focal = rd.height * 0.5 / Math.tan(fov * 0.5);
  const halfW = rd.width * 0.5 * fill, halfH = rd.height * 0.5 * fill;

  let D = 1;
  const local = bb.pts.map((p) => {
    const d = sub(p, mid);
    return [
      d[0] * r[0] + d[1] * r[1] + d[2] * r[2],
      d[0] * u[0] + d[1] * u[1] + d[2] * u[2],
      d[0] * f[0] + d[1] * f[1] + d[2] * f[2],
    ];
  });
  for (const [a, b, c] of local) {
    D = Math.max(D, Math.abs(a) * focal / halfW - c, Math.abs(b) * focal / halfH - c, NEAR + 2 - c);
  }

  const eye = [0, 1, 2].map((i) => mid[i] - f[i] * D);
  rd.setCamera(eye, r, u, f, fov);

  // Perspective does not centre a box on its own centre; nudge the principal
  // point so the drawn thing sits in the middle of the picture.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const p = [0, 0];
  for (const q of bb.pts) {
    if (rd.project(q[0], q[1], q[2], p) < NEAR) continue;
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  if (x1 > x0) {
    rd.cx += rd.width * 0.5 - (x0 + x1) * 0.5;
    rd.cy += rd.height * 0.5 - (y0 + y1) * 0.5;
  }
}

// --- staging a warden ------------------------------------------------------
//
// A warden poses itself: build it, give it a stub game to fly against, tick
// its own update until it settles into station, then hand it to its own draw.
// Deterministic because the stub clock never moves, so every hash the update
// rolls comes up the same on both of fit()'s passes.

const stubGame = () => ({
  track, time: 0.4, t: -400, speed: 0,
  shipX: 0, shipY: 60, shipPos: [0, 60, -400],
  drones: [],
  weapons: { fireBolt() {}, fireSeeker() {} },
  audio: { zap() {}, hit() {}, smallBoom() {}, bigBoom() {}, specialOn() {} },
  particles: { burst() {} },
  say() {}, damage() {}, boomAt() {}, wardenBolt() {},
  shake: 0,
});

const showWarden = (kind, pose) => (rd) => {
  const g = stubGame();
  const b = makeWarden({ kind, name: kind.toUpperCase(), hp: 90 }, -430);
  for (let i = 0; i < 90; i++) updateWarden(b, 1 / 60, g);
  if (pose) pose(b, g);
  drawWarden(rd, b, track, 0.4);
};

// --- the cast -------------------------------------------------------------

const enemy = (over) => ({
  t: 0, x: 0, y: 0, hp: 3, maxHp: 3, alive: true, lockable: true,
  points: 150, cool: 0.5, spin: 0, aim: 0, flash: 0, los: 1, ...over,
});

/** One enemy, alone, drawn through the real drawEnemies. */
const showEnemy = (e, time = 0.4) => (rd) => drawEnemies(rd, track, [e], -1e5, 1e9, time);

/** One obstacle, alone, drawn through the real drawObstacles. */
const showObstacle = (ob, time = 0.4) => (rd) => drawObstacles(rd, track, [ob], 0, -1e5, 1e9, time);

// Views are unit directions from the camera toward the subject, in world axes:
// +x across the trench, +y up, +z down the track. So [0.4, -0.25, 1] is the
// player's own view -- from behind, from one side, from below.
const AHEAD = [0.42, -0.2, 1];
const SURFACE = [0.5, -0.34, 1];   // looking up at something standing on the rim
const HEADON = [0.3, -0.12, 1];

const SUBJECTS = [
  {
    id: 'hydra', name: 'HYDRA', fov: 1.0, view: [-0.8, -0.3, 1], fill: 0.72,
    draw: showWarden('hydra'),
  },
  {
    id: 'furnace', name: 'FURNACE', fov: 1.0, view: [0.35, -0.2, 1], fill: 0.66,
    draw: showWarden('furnace'),
  },
  {
    id: 'mantis', name: 'MANTIS', fov: 1.0, view: [0.28, -0.16, 1], fill: 0.62,
    draw: showWarden('mantis'),
  },
  {
    id: 'marionette', name: 'MARIONETTE', fov: 1.0, view: [0.3, -0.2, 1], fill: 0.66,
    draw: showWarden('marionette'),
  },
  {
    id: 'portcullis', name: 'PORTCULLIS', fov: 1.0, view: [0.3, -0.12, 1], fill: 0.68,
    draw: showWarden('portcullis'),
  },
  {
    id: 'avalanche', name: 'AVALANCHE', fov: 1.0, view: [0.4, -0.25, 1], fill: 0.62,
    draw: showWarden('avalanche'),
  },
  {
    id: 'broadside', name: 'BROADSIDE', fov: 1.0, view: [-1, -0.3, 0.35], fill: 0.74,
    draw: showWarden('broadside'),
  },
  {
    id: 'revenant', name: 'REVENANT', fov: 1.0, view: [0.34, -0.22, 1], fill: 0.78,
    // Caught mid-charge, which is the state that matters: the warning.
    draw: showWarden('revenant', (b) => {
      b.cannon.state = 'charging';
      b.cannon.charge = 0.4;
      b.debris = [
        { t: 250, x: 34, size: 8 },
        { t: 360, x: -28, size: 12, car: true },
        { t: 470, x: 8, size: 6 },
      ];
    }),
  },
  {
    id: 'ship', name: 'INTERCEPTOR', fov: 0.9, view: [-0.42, -0.6, -1], fill: 0.74,
    draw: (rd) => {
      const fr = { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] };
      const basis = shipBasis(fr, 0.1, 0.02, 0.06, { r: [], u: [], f: [] });
      drawShip(rd, [0, 0, 0], basis, 0.35, 0.31, 0);
    },
  },
  {
    id: 'turret', name: 'TURRET', fov: 1.0, view: SURFACE, fill: 0.66,
    draw: showEnemy(enemy({ kind: 'turret', y: RIM, aim: 0.45, spin: 0.6 })),
  },
  {
    id: 'wallgun', name: 'WALL GUN', fov: 1.0, view: [-1, -0.42, 0.5], fill: 0.62,
    draw: showEnemy(enemy({ kind: 'wallgun', x: -HALF_WIDTH, y: 60, hp: 2, maxHp: 2, aim: 0.3 })),
  },
  {
    id: 'gatling', name: 'GATLING', fov: 1.0, view: SURFACE, fill: 0.7,
    // Caught spun up, which is the state that matters: it is the warning.
    draw: showEnemy(enemy({
      kind: 'gatling', x: -HALF_WIDTH - 26, y: RIM, hp: 5, maxHp: 5, wind: 1, barrel: 0.7,
    })),
  },
  {
    id: 'battery', name: 'BATTERY', fov: 1.0, view: SURFACE, fill: 0.72,
    // The twelve, mid-rack, because that is the one you have to recognise.
    draw: showEnemy(enemy({
      kind: 'battery', x: -HALF_WIDTH - 44, y: RIM, hp: 16, maxHp: 16,
      tubes: 12, salvo: 7, salvoTimer: 0.05,
    })),
  },
  {
    id: 'battery-2', name: 'BATTERY 2', fov: 1.0, view: SURFACE, fill: 0.66,
    draw: showEnemy(enemy({
      kind: 'battery', x: -HALF_WIDTH - 40, y: RIM, hp: 6, maxHp: 6,
      tubes: 2, salvo: 0, salvoTimer: 0,
    })),
  },
  {
    id: 'emplacement', name: 'EMPLACEMENT', fov: 1.0, view: HEADON, fill: 0.68,
    draw: showEnemy(enemy({
      kind: 'emplacement', x: -HALF_WIDTH + 14, y: RIM * 0.5, hp: 14, maxHp: 14,
      mount: 'wall',
      aim: -0.3, spin: 1.1,
    })),
  },
  {
    id: 'drone', name: 'DRONE', fov: 1.0, view: [0.2, -0.08, 1], fill: 0.55,
    draw: showEnemy(enemy({ kind: 'drone', y: 60, hp: 2, maxHp: 2 })),
  },
  {
    id: 'panel', name: 'PANEL', fov: 1.0, view: HEADON, fill: 0.58,
    draw: showEnemy(enemy({ kind: 'panel', y: 54, hp: 2, maxHp: 2, sealT: 0 })),
  },
  {
    id: 'port', name: 'PORT', fov: 1.0, view: [0.12, -0.06, 1], fill: 0.7,
    draw: showEnemy(enemy({
      kind: 'port', y: RIM * 0.44, hp: 1, maxHp: 1, spin: 0.8, iris: 0,
    })),
  },

  // --- obstacles ---
  {
    id: 'pylon', name: 'PYLON', fov: 1.0, view: AHEAD, fill: 0.66,
    draw: showObstacle({
      t: 0, dz: 30, kind: 'pylon', boxes: [[-34, -12, -12, 70], [8, 30, -12, 46]],
    }),
  },
  {
    id: 'fang', name: 'FANG', fov: 1.0, view: AHEAD, fill: 0.66,
    draw: showObstacle({
      t: 0, dz: 30, kind: 'fang', boxes: [[-30, -8, 44, RIM + 14], [14, 38, 62, RIM + 14]],
    }),
  },
  {
    id: 'gate', name: 'GATE', fov: 1.05, view: HEADON, fill: 0.78,
    draw: showObstacle(gateLike('gate', { gx: 6, gy: 30, gw: 30, gh: 42 })),
  },
  {
    id: 'slot-upright', name: 'SLOT UPRIGHT', fov: 1.05, view: HEADON, fill: 0.78,
    draw: showObstacle({
      ...gateLike('slot', { gx: -10, gy: 20, gw: 6.5, gh: 50 }), upright: true,
    }),
  },
  {
    id: 'slot-flat', name: 'SLOT FLAT', fov: 1.05, view: HEADON, fill: 0.78,
    draw: showObstacle({
      ...gateLike('slot', { gx: 0, gy: 46, gw: 42, gh: 18 }), upright: false,
    }),
  },
  {
    id: 'ring', name: 'RING', fov: 1.05, view: HEADON, fill: 0.76,
    draw: showObstacle({
      ...apertureLike('ring', 14, { cx: -4, cy: 52, r: 32 }),
      // Mid-sweep: four of the eight tentacles lit, at the ages they would
      // actually be, so the picture shows the fade as well as the shape.
      beams: [0, 1, 2, 3].map((n) => ({
        ang: ((2 - n + 8) % 8) / 8 * Math.PI * 2,
        born: 0.4 - n * 0.1,
        from: 32 + 22,
        reach: 210,
        hit: false,
      })),
    }),
  },
  {
    id: 'boostgate', name: 'BOOST GATE', fov: 1.05, view: HEADON, fill: 0.72,
    draw: showObstacle(apertureLike('boostgate', 12, { cx: 0, cy: 52, r: 30 })),
  },
  {
    id: 'stack', name: 'STACK', fov: 1.25, view: [0.55, -0.3, 1], fill: 0.8,
    draw: (rd) => drawObstacles(rd, track, [
      { t: 0, dz: 18, kind: 'stack', boxes: [[-HALF_WIDTH - 30, 5, -30, RIM * 0.45]] },
      { t: 300, dz: 18, kind: 'stack', boxes: [[-5, HALF_WIDTH + 30, RIM * 0.45, RIM + 14]] },
    ], 0, -1e5, 1e9, 0.4),
  },
  {
    id: 'press', name: 'PRESS', fov: 1.0, view: HEADON, fill: 0.8,
    draw: (rd) => drawObstacles(rd, track, [-1, 1].map((side) => ({
      t: 0, dz: 20, kind: 'press', cx: 0, cy: 0,
      boxes: side < 0
        ? [[-HALF_WIDTH - 40, -48, -30, RIM + 6]]
        : [[48, HALF_WIDTH + 40, -30, RIM + 6]],
      anim: { dx: side * 35, dy: 0, rate: 1, phase: 0, spin: 0 },
    })), 0, -1e5, 1e9, 0.4),
  },
  {
    id: 'slider', name: 'SLIDER', fov: 1.0, view: AHEAD, fill: 0.68,
    draw: showObstacle({
      t: 0, dz: 18, kind: 'slider', cx: 0, cy: RIM * 0.45,
      boxes: [[-22, 22, RIM * 0.45 - 40, RIM * 0.45 + 40]],
      anim: { dx: 30, dy: 0, rate: 1, phase: 0.6, spin: 0 },
    }),
  },
  {
    id: 'cross', name: 'CROSS', fov: 1.0, view: HEADON, fill: 0.7,
    draw: showObstacle(wheel('cross', 4, 13)),
  },
  {
    id: 'pinwheel', name: 'PINWHEEL', fov: 1.0, view: HEADON, fill: 0.78,
    // Mid-cycle, with three beams hanging: the fan, and the gap in it.
    draw: showObstacle(wheel('pinwheel', 5, 9, [
      { born: 0.0, life: 1.2, ang: 0.0, reach: 96 },
      { born: 0.4, life: 1.2, ang: TAU / 5, reach: 96 },
      { born: 0.8, life: 1.2, ang: (TAU / 5) * 2, reach: 96 },
    ]), 1.05),
  },
  {
    id: 'seal', name: 'BULKHEAD', fov: 1.05, view: HEADON, fill: 0.84,
    draw: (rd) => drawObstacles(rd, track, [{
      t: 0, dz: 46, kind: 'seal', hw: HALF_WIDTH, panelCount: 2,
      boxes: [[-HALF_WIDTH - 60, HALF_WIDTH + 60, -30, RIM - 1]],
    }], 0, -1e5, 1e9, 0.32),
  },
];

/** A wall with an opening: four blocks, and the window they leave. */
function gateLike(kind, window) {
  const { gx, gy, gw, gh } = window;
  return {
    t: 0, dz: 16, kind, window,
    boxes: [
      [-HALF_WIDTH - 30, gx - gw, -30, RIM + 14],
      [gx + gw, HALF_WIDTH + 30, -30, RIM + 14],
      [gx - gw, gx + gw, gy + gh, RIM + 14],
      [gx - gw, gx + gw, -30, gy],
    ],
  };
}

/** A plate with a hole in it: the ring, and the boost gate that copies it. */
function apertureLike(kind, dz, ring) {
  const { cx, cy, r } = ring;
  return {
    t: 0, dz, kind, ring, taken: false,
    boxes: [
      [-HALF_WIDTH - 30, cx - r, -30, RIM + 14],
      [cx + r, HALF_WIDTH + 30, -30, RIM + 14],
      [cx - r, cx + r, cy + r, RIM + 14],
      [cx - r, cx + r, -30, cy - r],
    ],
  };
}

/** Turning arms from the middle of the trench. */
function wheel(kind, arms, thick, beams) {
  const reach = Math.min(HALF_WIDTH - 6, RIM * 0.62);
  const cy = RIM * 0.5;
  const boxes = [];
  for (let i = 0; i < arms; i++) {
    boxes.push([-thick * 0.7, reach, cy - thick, cy + thick, (i / arms) * TAU]);
  }
  return {
    t: 0, dz: 16, kind, boxes, cx: 0, cy, beams,
    anim: { rate: 0, phase: 0.9, spin: 0.8 },
  };
}

// --- run ------------------------------------------------------------------

const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const want = SUBJECTS.filter((s) => !filter.length || filter.some((f) => s.id.includes(f)));
if (!want.length) {
  console.error(`no subject matches ${filter.join(' ')}`);
  console.error(`have: ${SUBJECTS.map((s) => s.id).join(' ')}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const s of want) {
  const rd = new Display(W * SS, H * SS);
  rd.widthScale = SS * 1.15;
  fit(rd, s.draw, s.view, s.fov ?? 1.0, s.fill ?? 0.7);
  rd.cy -= 16 * SS;      // clear of the caption strip along the bottom
  s.draw(rd);

  // The name, in the game's own stroke font, so a portrait is self-labelling
  // when it turns up on its own in someone's context window.
  drawText(rd, s.name, rd.width * 0.5, rd.height - 20 * SS,
    16 * SS, 1.2, 0.55, 0.8, 1, 0.8, 0);

  const file = join(OUT, `${s.id}.png`);
  writeFileSync(file, png(rd.resolve(SS)));
  console.log(`${s.id.padEnd(14)} docs/assets/${s.id}.png`);
}
