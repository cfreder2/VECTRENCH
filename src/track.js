// Compiles a level spec into queryable canyon geometry.
//
// The centreline is C(t) = (X(t), Y(t), t): the world z axis doubles as the
// track parameter, so every cross-section is a plane of constant t and terrain
// slices, obstacle collision and the ship's position all share one coordinate.
//
// Curviness is applied to the centreline's *slope* rather than its position,
// then clamped and smoothed before being integrated. That is what makes the
// spec safe: a section can ask for maximum curviness and still produce a track
// whose walls never fold back through the camera.
//
// Canyon-local coordinates are (x, y): x is lateral offset from the centreline,
// y is height above the trench floor. The rim sits at y = rim(t).

import { hash2, clamp, smoothstep, lerp, TAU } from './math.js';
import { specLength } from './spec.js';

const G = 20;              // grid step for the precomputed profile
const RUNOUT = 1100;       // extra track past the last section, for the finale
const MAX_SLOPE_X = 0.55;
const SNAKE_PULL = 0.22;   // how hard a snaking canyon is drawn back to its own line
const MAX_SLOPE_Y = 0.30;
const BLEND = 260;         // transition length between sections
const TIME_STEP = 40;      // grid for the position-to-seconds table

function vnoise(t, wl, salt) {
  const p = t / wl;
  const i = Math.floor(p);
  const f = p - i;
  const a = hash2(i, salt) * 2 - 1;
  const b = hash2(i + 1, salt) * 2 - 1;
  return a + (b - a) * (f * f * (3 - 2 * f));
}

/** Catmull-Rom over a uniform grid, clamped at the ends. */
function sample(arr, gi, f) {
  const n = arr.length;
  const i1 = clamp(gi, 0, n - 1);
  const i0 = clamp(gi - 1, 0, n - 1);
  const i2 = clamp(gi + 1, 0, n - 1);
  const i3 = clamp(gi + 2, 0, n - 1);
  const p0 = arr[i0], p1 = arr[i1], p2 = arr[i2], p3 = arr[i3];
  const a = 0.5 * (p2 - p0);
  const b = 2 * p0 - 5 * p1 + 4 * p2 - p3;
  const c = -p0 + 3 * p1 - 3 * p2 + p3;
  return p1 + f * a + f * f * 0.5 * b + f * f * f * 0.5 * c;
}

function smoothPass(arr, passes) {
  const n = arr.length;
  const tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      const a = arr[Math.max(0, i - 1)];
      const b = arr[i];
      const c = arr[Math.min(n - 1, i + 1)];
      tmp[i] = (a + 2 * b + c) * 0.25;
    }
    arr.set(tmp);
  }
}

export function makeFrame() {
  return { t: 0, p: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1], railY: 56 };
}

export class Track {
  constructor(spec) {
    this.spec = spec;
    this.bodyLength = specLength(spec);
    this.total = this.bodyLength + RUNOUT;
    this.portT = spec.finale === 'port' ? this.bodyLength + 720 : -1;
    // A level with a warden gets an arena past the runout: a stretch of open
    // ground the boss fight lives on. It is flat, straight, and uniform on
    // purpose -- the fight loops through it, and a loop through terrain with
    // no features in it is a loop nobody can see.
    this.arenaStart = -1;
    this.arenaLen = 0;
    if (spec.boss) {
      this.arenaStart = this.total;
      this.arenaLen = 6000;
      this.total += this.arenaLen;
    }

    // Section boundaries, so a t can be resolved back to authored intent.
    this.bounds = [0];
    for (const s of spec.sections) this.bounds.push(this.bounds[this.bounds.length - 1] + s.length);

    const n = Math.ceil(this.total / G) + 4;
    this.n = n;
    const width = new Float32Array(n);
    const depth = new Float32Array(n);
    const rough = new Float32Array(n);
    const hue = new Float32Array(n);
    const curv = new Float32Array(n);
    const snake = new Float32Array(n);
    const hill = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const t = i * G;
      const p = this.blendParams(t);
      // A gentle breathing term keeps an authored constant width from reading
      // as a corridor extruded by a machine.
      width[i] = p.width * (1 + 0.11 * vnoise(t, 520, 11));
      depth[i] = p.depth * (1 + 0.07 * vnoise(t, 900, 12));
      rough[i] = p.roughness;
      hue[i] = p.hue;
      curv[i] = p.curviness;
      snake[i] = p.snaking;
      hill[i] = p.hilliness;
    }

    // The finale choke: walls close in on the port regardless of what the last
    // section asked for, so the missile shot always reads as threading a needle.
    if (this.portT > 0) {
      for (let i = 0; i < n; i++) {
        const t = i * G;
        const k = smoothstep(this.portT - 950, this.portT - 150, t);
        if (k > 0) width[i] = lerp(width[i], 34, k);
      }
    }

    // The arena: blend out of whatever the last section was into a shallow
    // open basin, then hold it exactly constant so the wrap is invisible.
    if (this.arenaStart > 0) {
      for (let i = 0; i < n; i++) {
        const t = i * G;
        const k = smoothstep(this.arenaStart - 400, this.arenaStart + 700, t);
        if (k <= 0) continue;
        width[i] = lerp(width[i], 150, k);
        depth[i] = lerp(depth[i], 44, k);
        rough[i] = lerp(rough[i], 0.12, k);
        curv[i] = lerp(curv[i], 0, k);
        snake[i] = lerp(snake[i], 0, k);
        hill[i] = lerp(hill[i], 0, k);
      }
    }

    smoothPass(width, 2);
    smoothPass(depth, 2);

    // Slope-first construction: noise -> scale by curviness -> clamp -> smooth
    // -> integrate. Bounded turns by construction.
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i * G;
      // `curviness` says how far the canyon wanders; `snaking` says how often.
      // Scaling only the amplitude is what made a maximum-curviness section
      // read as one long lazy sweep instead of a river: the bends have to come
      // closer together as well, and lean harder when they do.
      // Noise makes a canyon that wanders; a river bends. Snaking crossfades
      // the steering from one to the other -- a wave with a wavelength, plus
      // enough noise left in that it does not read as a machined sine -- and
      // shortens the wave as it rises, so the bends come closer together.
      const k = snake[i];
      const drift = 0.55 * vnoise(t, 1400, 1) + 0.3 * vnoise(t, 620, 2)
        + 0.15 * vnoise(t, 300, 3);
      const wl = 1500 * (1 - 0.45 * k);
      const river = 0.84 * Math.sin((t / wl) * TAU + 1.7) + 0.16 * vnoise(t, 480, 6);
      const nx = drift + (river - drift) * k;
      const ny = 0.6 * vnoise(t, 1700, 4) + 0.4 * vnoise(t, 700, 5);
      const lean = MAX_SLOPE_X * (1 + 0.65 * k);
      sx[i] = clamp(curv[i] * nx * 1.35 * (1 + 0.5 * k), -lean, lean);
      sy[i] = clamp(hill[i] * ny * 0.9, -MAX_SLOPE_Y, MAX_SLOPE_Y);
    }
    smoothPass(sx, 3);
    smoothPass(sy, 3);

    const X = new Float32Array(n);
    const Y = new Float32Array(n);
    for (let i = 1; i < n; i++) {
      // A slope integrated from noise is a random walk: it wanders off in one
      // direction and never comes back, which reads as a long diagonal with
      // kinks in it rather than as a river. Snaking adds a pull back toward
      // the line it started on, so the bends have something to bend about --
      // applied to the slope itself, not to the finished path, because the
      // heading is read from the slope and the two have to stay the same
      // curve.
      const pull = SNAKE_PULL * snake[i - 1] * (X[i - 1] / 800);
      if (pull) {
        const lean = MAX_SLOPE_X * (1 + 0.65 * snake[i - 1]);
        sx[i - 1] = clamp(sx[i - 1] - pull, -lean, lean);
      }
      X[i] = X[i - 1] + sx[i - 1] * G;
      Y[i] = Y[i - 1] + sy[i - 1] * G;
    }

    this.W = width; this.D = depth; this.R = rough; this.H = hue;
    this.X = X; this.Y = Y; this.SX = sx; this.SY = sy;
    this._scratch = makeFrame();
    this._scratch2 = makeFrame();
  }

  /**
   * Section parameters at t, smoothly blended across boundaries so the canyon
   * morphs between authored shapes instead of stepping.
   */
  blendParams(t) {
    const secs = this.spec.sections;
    let i = 0;
    while (i < secs.length - 1 && t >= this.bounds[i + 1]) i++;
    const cur = secs[i];
    const start = this.bounds[i];
    const end = this.bounds[i + 1];
    const out = { ...cur };

    const half = Math.min(BLEND, cur.length * 0.45);
    if (i > 0 && t - start < half) {
      const k = smoothstep(0, 1, (t - start) / half) * 0.5 + 0.5;
      const prev = secs[i - 1];
      for (const key of NUMERIC) out[key] = lerp(prev[key], cur[key], k);
    } else if (i < secs.length - 1 && end - t < half) {
      const k = smoothstep(0, 1, (end - t) / half) * 0.5 + 0.5;
      const next = secs[i + 1];
      for (const key of NUMERIC) out[key] = lerp(next[key], cur[key], k);
    }
    return out;
  }

  sectionIndexAt(t) {
    let i = 0;
    while (i < this.spec.sections.length - 1 && t >= this.bounds[i + 1]) i++;
    return i;
  }

  sectionAt(t) {
    return this.spec.sections[this.sectionIndexAt(t)];
  }

  _gi(t) {
    const p = clamp(t / G, 0, this.n - 1);
    const gi = Math.floor(p);
    return [gi, p - gi];
  }

  x(t) { const [i, f] = this._gi(t); return sample(this.X, i, f); }
  y(t) { const [i, f] = this._gi(t); return sample(this.Y, i, f); }
  dx(t) { const [i, f] = this._gi(t); return sample(this.SX, i, f); }
  dy(t) { const [i, f] = this._gi(t); return sample(this.SY, i, f); }
  halfWidth(t) { const [i, f] = this._gi(t); return sample(this.W, i, f); }
  rim(t) { const [i, f] = this._gi(t); return sample(this.D, i, f); }
  rough(t) { const [i, f] = this._gi(t); return sample(this.R, i, f); }
  hue(t) { const [i, f] = this._gi(t); return sample(this.H, i, f); }

  /** Height of the rail itself: a little under half-way up the trench. */
  railY(t) { return this.rim(t) * 0.46; }

  /**
   * How fast the ship travels at t.
   *
   * The run accelerates to the spec's end speed, then eases off on the final
   * approach to the port. Without that easing the port is visible for about a
   * second and a half and the lock takes one -- technically possible, and no
   * fun. The slowdown is also the beat the whole level has been building to.
   */
  /**
   * Seconds from the start of the run to track position `t`.
   *
   * Speed depends only on position, so this is fixed for every player -- which
   * is what lets a moving obstacle be animated off it and still present the
   * same face to everyone, and lets the audit know which face that is.
   */
  timeAt(t) {
    const tb = this._timeTable || this._buildTimeTable();
    const k = clamp(t / TIME_STEP, 0, tb.length - 1);
    const i = Math.floor(k);
    const f = k - i;
    const a = tb[i];
    const b = tb[Math.min(tb.length - 1, i + 1)];
    return a + (b - a) * f;
  }

  _buildTimeTable() {
    const n = Math.ceil(this.total / TIME_STEP) + 2;
    const tb = new Float32Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const t = (i - 0.5) * TIME_STEP;
      acc += TIME_STEP / Math.max(1, this.speedAt(t));
      tb[i] = acc;
    }
    this._timeTable = tb;
    return tb;
  }

  speedAt(t) {
    const k = clamp(t / Math.max(1, this.bodyLength), 0, 1);
    let v = lerp(this.spec.speed.start, this.spec.speed.end, k);
    if (this.portT > 0) {
      const ease = smoothstep(this.portT - 1050, this.portT - 250, t);
      v *= 1 - 0.46 * ease;
    }
    return v;
  }

  /** Curvature signal, for banking the camera into turns. */
  curveAt(t) { return (this.dx(t + 70) - this.dx(t - 70)) / 140; }

  /** Fills an orthonormal frame at track position t. */
  frameAt(t, fr) {
    const dx = this.dx(t);
    const dy = this.dy(t);
    const L = Math.hypot(dx, dy, 1);
    const fx = dx / L, fy = dy / L, fz = 1 / L;
    fr.f[0] = fx; fr.f[1] = fy; fr.f[2] = fz;

    // right = normalize(cross(worldUp, fwd)); has no y term, so lateral motion
    // stays horizontal however the track pitches.
    const rl = Math.hypot(fz, fx);
    fr.r[0] = fz / rl; fr.r[1] = 0; fr.r[2] = -fx / rl;

    // up = cross(fwd, right)
    fr.u[0] = fy * fr.r[2] - fz * fr.r[1];
    fr.u[1] = fz * fr.r[0] - fx * fr.r[2];
    fr.u[2] = fx * fr.r[1] - fy * fr.r[0];

    fr.t = t;
    fr.p[0] = this.x(t);
    fr.p[1] = this.y(t);
    fr.p[2] = t;
    fr.railY = this.railY(t);
    return fr;
  }

  localToWorldF(fr, x, y, out) {
    const h = y - fr.railY;
    out[0] = fr.p[0] + fr.r[0] * x + fr.u[0] * h;
    out[1] = fr.p[1] + fr.r[1] * x + fr.u[1] * h;
    out[2] = fr.p[2] + fr.r[2] * x + fr.u[2] * h;
    return out;
  }

  localToWorld(t, x, y, out) {
    return this.localToWorldF(this.frameAt(t, this._scratch), x, y, out);
  }

  /**
   * World -> canyon-local (t, x, y). Because the centreline's z *is* t, world z
   * is already a good first guess; one refinement along the local forward axis
   * is enough for collision work.
   */
  worldToLocal(wx, wy, wz, out) {
    let t = wz;
    const fr = this._scratch2;
    for (let i = 0; i < 2; i++) {
      this.frameAt(t, fr);
      const dx = wx - fr.p[0], dy = wy - fr.p[1], dz = wz - fr.p[2];
      t += dx * fr.f[0] + dy * fr.f[1] + dz * fr.f[2];
    }
    this.frameAt(t, fr);
    const dx = wx - fr.p[0], dy = wy - fr.p[1], dz = wz - fr.p[2];
    out[0] = t;
    out[1] = dx * fr.r[0] + dy * fr.r[1] + dz * fr.r[2];
    out[2] = dx * fr.u[0] + dy * fr.u[1] + dz * fr.u[2] + fr.railY;
    return out;
  }

  /** Floor relief: small, but enough that the trench bottom is not a mirror. */
  floorAt(t, x) {
    const i = Math.floor(t / 240);
    const f = t / 240 - i;
    const a = hash2(i, 7) - 0.5;
    const b = hash2(i + 1, 7) - 0.5;
    return (a + (b - a) * (f * f * (3 - 2 * f))) * 9 + Math.sin(x * 0.05) * 1.5;
  }
}

const NUMERIC = ['width', 'depth', 'curviness', 'hilliness', 'roughness', 'hue'];
