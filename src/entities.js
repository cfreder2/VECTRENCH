// Everything that is not terrain: the ship, the obstacles, the guns, the shots
// and the debris.
//
// Enemy fire and player fire both live in world space, because that is the only
// frame where a shot fired at an angle across a bending trench travels straight.
// Collision with the canyon converts back to canyon-local via Track.worldToLocal.

import { hash2, clamp, hsv, TAU } from './math.js';

// --- ship ---------------------------------------------------------------

// Polylines in ship-local space: x right, y up, z forward.
// Seen from behind at maybe fifty pixels tall, so it is drawn as a silhouette
// rather than a model: a hull outline, the wings, the cannons, two fins. The
// earlier version had a second fuselage shell and a canopy, and at this size
// they only added overlapping strokes that read as noise.
const SHIP = [
  // hull
  [0, 0, 15, -2.6, 1.4, 2, -2.6, 1.4, -9, 2.6, 1.4, -9, 2.6, 1.4, 2, 0, 0, 15],
  [-2.6, 1.4, 2, -2.2, -1.2, -1, -2.2, -1.2, -9, -2.6, 1.4, -9],
  [2.6, 1.4, 2, 2.2, -1.2, -1, 2.2, -1.2, -9, 2.6, 1.4, -9],
  // wings, swept back
  [-2.6, 0.6, 1, -15, -1.4, -5, -12.5, -1.4, -10, -2.6, 0.6, -9],
  [2.6, 0.6, 1, 15, -1.4, -5, 12.5, -1.4, -10, 2.6, 0.6, -9],
  // wingtip cannons
  [-15, -1.4, -5, -14.4, -1.4, 6], [15, -1.4, -5, 14.4, -1.4, 6],
  // fins
  [-2.4, 1.4, -8, -4.6, 8.5, -10, -2, 8.5, -10],
  [2.4, 1.4, -8, 4.6, 8.5, -10, 2, 8.5, -10],
];

export const MUZZLES = [[-14.4, -1.4, 6], [14.4, -1.4, 6]];

/**
 * Builds the ship's orientation basis: the rail frame rolled by `bank` and
 * pitched by `pitch`. Written into `basis` as [r, u, f] triples.
 */
const _a = [0, 0, 0], _b = [0, 0, 0];

/**
 * The ship's orientation, as yaw then roll then pitch off the track frame.
 *
 * Yaw is what lets the nose point somewhere other than straight down the
 * trench, and the nose is where the guns look -- so this is not only how the
 * model sits, it is the aim.
 */
export function shipBasis(fr, bank, pitch, yaw, basis) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cb = Math.cos(bank), sb = Math.sin(bank);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const r = basis.r, u = basis.u, f = basis.f;
  // Yaw about the frame's up axis.
  const ry = _a, fy = _b;
  for (let i = 0; i < 3; i++) {
    ry[i] = fr.r[i] * cy - fr.f[i] * sy;
    fy[i] = fr.r[i] * sy + fr.f[i] * cy;
  }
  // Roll about the (yawed) forward axis.
  for (let i = 0; i < 3; i++) {
    r[i] = ry[i] * cb + fr.u[i] * sb;
    u[i] = -ry[i] * sb + fr.u[i] * cb;
  }
  // Pitch about the (rolled) right axis.
  for (let i = 0; i < 3; i++) {
    const fi = fy[i] * cp + u[i] * sp;
    const ui = -fy[i] * sp + u[i] * cp;
    f[i] = fi; u[i] = ui;
  }
  return basis;
}

export function shipLocalToWorld(pos, basis, lx, ly, lz, out) {
  out[0] = pos[0] + basis.r[0] * lx + basis.u[0] * ly + basis.f[0] * lz;
  out[1] = pos[1] + basis.r[1] * lx + basis.u[1] * ly + basis.f[1] * lz;
  out[2] = pos[2] + basis.r[2] * lx + basis.u[2] * ly + basis.f[2] * lz;
  return out;
}


export function drawShip(rd, pos, basis, thrust, time, hurt) {
  const r = 0.35 + hurt * 0.65;
  const g = 0.95 - hurt * 0.55;
  const b = 1 - hurt * 0.5;
  for (const pl of SHIP) {
    for (let i = 0; i + 5 < pl.length; i += 3) {
      shipLocalToWorld(pos, basis, pl[i], pl[i + 1], pl[i + 2], _a);
      shipLocalToWorld(pos, basis, pl[i + 3], pl[i + 4], pl[i + 5], _b);
      rd.line3(_a[0], _a[1], _a[2], _b[0], _b[1], _b[2], 1.25, r, g, b, 1);
    }
  }
  // Engine flare: length tracks throttle, flicker keeps it alive.
  const flick = 0.75 + 0.25 * Math.sin(time * 47) + 0.15 * hash2((time * 60) | 0, 3);
  const len = (10 + thrust * 22) * flick;
  for (const sx of [-3, 3]) {
    shipLocalToWorld(pos, basis, sx, 0, -9, _a);
    shipLocalToWorld(pos, basis, sx, 0, -9 - len, _b);
    rd.line3(_a[0], _a[1], _a[2], _b[0], _b[1], _b[2], 2, 0.4, 0.72, 1, 0.7);
    rd.dot3(_a[0], _a[1], _a[2], 2.8, 0.75, 0.92, 1, 0.95);
  }
}

// --- obstacles ----------------------------------------------------------

const OB_COL = {
  pylon: [1, 0.45, 0.14], fang: [1, 0.38, 0.2], gate: [1, 0.52, 0.16],
  ring: [0.4, 0.95, 1], stack: [1, 0.48, 0.15], seal: [1, 0.22, 0.16],
};

function box(rd, track, t, dz, x0, x1, y0, y1, col, w, a) {
  const p = _obp;
  // Front and back rectangles plus the four connecting edges.
  for (const [tt, idx] of [[t, 0], [t + dz, 4]]) {
    track.localToWorld(tt, x0, y0, p[idx]);
    track.localToWorld(tt, x1, y0, p[idx + 1]);
    track.localToWorld(tt, x1, y1, p[idx + 2]);
    track.localToWorld(tt, x0, y1, p[idx + 3]);
  }
  for (const o of [0, 4]) {
    for (let i = 0; i < 4; i++) {
      const A = p[o + i], B = p[o + ((i + 1) & 3)];
      rd.line3(A[0], A[1], A[2], B[0], B[1], B[2], w, col[0], col[1], col[2], a);
    }
  }
  for (let i = 0; i < 4; i++) {
    const A = p[i], B = p[4 + i];
    rd.line3(A[0], A[1], A[2], B[0], B[1], B[2], w * 0.8, col[0], col[1], col[2], a * 0.8);
  }
}
const _obp = Array.from({ length: 8 }, () => [0, 0, 0]);

export function drawObstacles(rd, track, obstacles, cursor, camT, far, time) {
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let i = cursor; i < obstacles.length; i++) {
    const ob = obstacles[i];
    if (ob.t > camT + far) break;
    if (ob.t + ob.dz < camT - 40) continue;
    const col = OB_COL[ob.kind] || OB_COL.pylon;

    if (ob.kind === 'seal') {
      const [x0, x1, y0, y1] = ob.boxes[0];
      box(rd, track, ob.t, ob.dz, x0, x1, y0, y1, col, 1.5, 1);
      // Panel grid, so a bulkhead reads as built rather than as a hole.
      for (let k = 1; k < 6; k++) {
        const x = x0 + ((x1 - x0) * k) / 6;
        track.localToWorld(ob.t, x, y0, p);
        track.localToWorld(ob.t, x, y1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 0.9, col[0], col[1], col[2], 0.55);
      }
      for (let k = 1; k < 4; k++) {
        const y = y0 + ((y1 - y0) * k) / 4;
        track.localToWorld(ob.t, x0, y, p);
        track.localToWorld(ob.t, x1, y, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 0.9, col[0], col[1], col[2], 0.55);
      }
      // Hazard flashers along the lip: the "go up" instruction.
      const blink = 0.45 + 0.55 * Math.sin(time * 8);
      for (let k = 0; k <= 8; k++) {
        const x = x0 + ((x1 - x0) * k) / 8;
        track.localToWorld(ob.t, x, y1, p);
        rd.dot3(p[0], p[1], p[2], 2.6, 1, 0.75, 0.2, blink);
      }
      continue;
    }

    if (ob.kind === 'ring' && ob.ring) {
      const { cx, cy, r } = ob.ring;
      // Aperture: an octagon at both ends, plus a bright inner lip.
      for (const tt of [ob.t, ob.t + ob.dz]) {
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
          track.localToWorld(tt, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, p);
          track.localToWorld(tt, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.4, col[0], col[1], col[2], 1);
        }
      }
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * TAU;
        const px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
        track.localToWorld(ob.t, px, py, p);
        track.localToWorld(ob.t + ob.dz, px, py, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, col[0], col[1], col[2], 0.7);
        // Radial struts out to the surrounding rock.
        const ex = cx + Math.cos(a0) * (r + 22), ey = cy + Math.sin(a0) * (r + 22);
        track.localToWorld(ob.t, ex, ey, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 0.8, 1, 0.5, 0.2, 0.55);
      }
      continue;
    }

    if (ob.kind === 'gate' && ob.window) {
      const { gx, gy, gw, gh } = ob.window;
      // Draw the window, not the blocks: the gap is the information.
      box(rd, track, ob.t, ob.dz, gx - gw, gx + gw, gy, gy + gh, [0.4, 1, 0.95], 1.6, 1);
      const hw = track.halfWidth(ob.t);
      const rim = track.rim(ob.t);
      for (const [ax0, ax1] of [[-hw, gx - gw], [gx + gw, hw]]) {
        box(rd, track, ob.t, ob.dz * 0.7, ax0, ax1, 0, rim, col, 1.1, 0.85);
      }
      box(rd, track, ob.t, ob.dz * 0.7, gx - gw, gx + gw, gy + gh, rim, col, 1.1, 0.85);
      box(rd, track, ob.t, ob.dz * 0.7, gx - gw, gx + gw, 0, gy, col, 1.1, 0.85);
      continue;
    }

    for (const [x0, x1, y0, y1] of ob.boxes) {
      box(rd, track, ob.t, ob.dz, x0, x1, y0, y1, col, 1.2, 1);
    }
  }
}

// --- enemies ------------------------------------------------------------

/**
 * `e.los` is how much of the enemy the rock is not hiding, 0 to 1, maintained
 * by the targeting pass. Wireframe has no depth buffer, so without this a
 * surface turret reads exactly as bright from the trench floor as it does from
 * above the rim -- and the game's whole trade is that you have to come up into
 * their fire to fight them. Faded rather than culled so the reveal on breaking
 * the rim is a reveal and not a pop.
 */
export function drawEnemies(rd, track, enemies, camT, far, time) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const col = [0, 0, 0];
  for (const e of enemies) {
    if (!e.alive) continue;
    if (e.t > camT + far || e.t < camT - 60) continue;
    const hurt = 1 - e.hp / e.maxHp;
    const flash = e.flash > 0 ? 1 : 0;
    hsv(0.02 + hurt * 0.02, 0.85 - flash * 0.85, 1, col);
    const A = 0.1 + 0.9 * (e.los === undefined ? 1 : e.los);

    if (e.kind === 'turret' || e.kind === 'emplacement') {
      const R = e.kind === 'emplacement' ? 17 : 9;
      const n = e.kind === 'emplacement' ? 8 : 6;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU + e.spin, a1 = ((k + 1) / n) * TAU + e.spin;
        track.localToWorld(e.t + Math.sin(a0) * R * 0.6, e.x + Math.cos(a0) * R, e.y, p);
        track.localToWorld(e.t + Math.sin(a1) * R * 0.6, e.x + Math.cos(a1) * R, e.y, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.2, col[0], col[1], col[2], A);
      }
      // Barrel, swung toward the aim angle it last computed.
      track.localToWorld(e.t, e.x, e.y + R * 0.4, p);
      track.localToWorld(e.t + Math.cos(e.aim) * R * 1.1,
        e.x + Math.sin(e.aim) * R * 1.1, e.y + R * 1.3, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.6, col[0], col[1], col[2], A);
      rd.dot3(q[0], q[1], q[2], 2, 1, 0.8, 0.4, (0.8 + 0.2 * Math.sin(time * 9)) * A);
    } else if (e.kind === 'wallgun') {
      const sgn = e.x < 0 ? 1 : -1;
      track.localToWorld(e.t - 7, e.x, e.y - 6, p);
      track.localToWorld(e.t + 7, e.x, e.y - 6, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, col[0], col[1], col[2], A);
      track.localToWorld(e.t, e.x, e.y + 8, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, col[0], col[1], col[2], A);
      track.localToWorld(e.t + 7, e.x, e.y - 6, p);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, col[0], col[1], col[2], A);
      track.localToWorld(e.t, e.x, e.y, p);
      track.localToWorld(e.t + 4, e.x + sgn * 11, e.y, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.5, col[0], col[1], col[2], A);
    } else if (e.kind === 'port') {
      drawPort(rd, track, e, time, A);
    } else if (e.kind === 'drone') {
      drawDrone(rd, track, e, col, time, A);
    }
  }
}

/** The finale: a recessed exhaust vent. Concentric rings and a live core. */
function drawPort(rd, track, e, time, A = 1) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const pulse = 0.55 + 0.45 * Math.sin(time * 4);
  for (let ri = 0; ri < 3; ri++) {
    const R = 13 + ri * 9;
    const seg = 10;
    const spin = e.spin * (ri % 2 === 0 ? 1 : -1);
    const br = ri === 0 ? 1 : 0.7;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * TAU + spin, a1 = ((k + 1) / seg) * TAU + spin;
      track.localToWorld(e.t, e.x + Math.cos(a0) * R, e.y + Math.sin(a0) * R, p);
      track.localToWorld(e.t, e.x + Math.cos(a1) * R, e.y + Math.sin(a1) * R, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.5, 1, 0.55 * br, 0.15, br * A);
    }
  }
  for (let k = 0; k < 6; k++) {
    const a0 = (k / 6) * TAU + e.spin * 0.5;
    track.localToWorld(e.t, e.x + Math.cos(a0) * 13, e.y + Math.sin(a0) * 13, p);
    track.localToWorld(e.t - 22, e.x + Math.cos(a0) * 5, e.y + Math.sin(a0) * 5, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.2, 1, 0.7, 0.25, 0.85 * A);
  }
  track.localToWorld(e.t - 26, e.x, e.y, p);
  rd.dot3(p[0], p[1], p[2], 6 + pulse * 5, 1, 0.95, 0.6, pulse * A);
}

function drawDrone(rd, track, e, col, time, A = 1) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const R = 8;
  // A blunt delta: two swept wings and a bright core.
  const pts = [[-R, 0], [0, R * 0.6], [R, 0], [0, -R * 0.5]];
  for (let k = 0; k < 4; k++) {
    const a = pts[k], b = pts[(k + 1) & 3];
    track.localToWorld(e.t, e.x + a[0], e.y + a[1], p);
    track.localToWorld(e.t, e.x + b[0], e.y + b[1], q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.3, col[0], col[1], col[2], A);
  }
  track.localToWorld(e.t + 8, e.x, e.y, p);
  rd.dot3(p[0], p[1], p[2], 2.6, 1, 0.6, 0.9, (0.7 + 0.3 * Math.sin(time * 12)) * A);
}

// --- projectiles --------------------------------------------------------

export class Weapons {
  constructor() {
    this.lasers = [];   // player fire
    this.bolts = [];    // enemy fire
    this.missiles = [];
  }

  fireLaser(x, y, z, dx, dy, dz, speed = 1500) {
    this.lasers.push({ x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed, life: 1.1 });
  }

  fireBolt(x, y, z, dx, dy, dz, speed = 430, heavy = false) {
    this.bolts.push({ x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed, life: 3.2, heavy });
  }

  fireMissile(x, y, z, dx, dy, dz, target) {
    this.missiles.push({
      x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed: 620, life: 6, target,
    });
  }

  update(dt) {
    for (const arr of [this.lasers, this.bolts]) {
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        s.life -= dt;
        if (s.life <= 0) continue;
        const d = s.speed * dt;
        // Previous position is kept so hit tests can sweep the whole step.
        s.px = s.x; s.py = s.y; s.pz = s.z;
        s.x += s.dx * d; s.y += s.dy * d; s.z += s.dz * d;
        arr[w++] = s;
      }
      arr.length = w;
    }

    let w = 0;
    for (let i = 0; i < this.missiles.length; i++) {
      const m = this.missiles[i];
      m.life -= dt;
      if (m.life <= 0) continue;
      // Limited-rate homing, so a missile can be outrun but rarely is.
      const tg = m.target;
      if (tg && tg.alive && tg.world) {
        let ax = tg.world[0] - m.x, ay = tg.world[1] - m.y, az = tg.world[2] - m.z;
        const L = Math.hypot(ax, ay, az) || 1;
        ax /= L; ay /= L; az /= L;
        const k = clamp(4.2 * dt, 0, 1);
        m.dx += (ax - m.dx) * k; m.dy += (ay - m.dy) * k; m.dz += (az - m.dz) * k;
        const n = Math.hypot(m.dx, m.dy, m.dz) || 1;
        m.dx /= n; m.dy /= n; m.dz /= n;
      }
      const d = m.speed * dt;
      m.px = m.x; m.py = m.y; m.pz = m.z;
      m.x += m.dx * d; m.y += m.dy * d; m.z += m.dz * d;
      this.missiles[w++] = m;
    }
    this.missiles.length = w;
  }

  draw(rd) {
    for (const s of this.lasers) {
      const L = 30;
      rd.line3(s.x, s.y, s.z, s.x - s.dx * L, s.y - s.dy * L, s.z - s.dz * L,
        2.2, 0.6, 1, 0.75, 1);
    }
    for (const s of this.bolts) {
      const L = s.heavy ? 22 : 14;
      const w = s.heavy ? 2.6 : 1.8;
      rd.line3(s.x, s.y, s.z, s.x - s.dx * L, s.y - s.dy * L, s.z - s.dz * L,
        w, 1, s.heavy ? 0.35 : 0.55, 0.2, 1);
    }
    for (const m of this.missiles) {
      rd.line3(m.x, m.y, m.z, m.x - m.dx * 14, m.y - m.dy * 14, m.z - m.dz * 14,
        2.4, 1, 0.9, 0.7, 1);
      rd.dot3(m.x - m.dx * 16, m.y - m.dy * 16, m.z - m.dz * 16, 4, 1, 0.6, 0.25, 0.8);
    }
  }

  clear() {
    this.lasers.length = 0;
    this.bolts.length = 0;
    this.missiles.length = 0;
  }
}

// --- particles ----------------------------------------------------------

const PMAX = 900;

export class Particles {
  constructor() {
    this.n = 0;
    this.d = new Float32Array(PMAX * 12); // x y z vx vy vz life max r g b w
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, w) {
    if (this.n >= PMAX) return;
    const o = this.n * 12;
    const d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z;
    d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life;
    d[o + 8] = r; d[o + 9] = g; d[o + 10] = b; d[o + 11] = w;
    this.n++;
  }

  /** Radial burst. `kind` shifts colour and spread for different impacts. */
  burst(x, y, z, count, speed, r, g, b, life = 0.8, w = 1.6) {
    for (let i = 0; i < count; i++) {
      const u = hash2(i, (x * 13) | 0) * 2 - 1;
      const a = hash2(i, ((y * 17) | 0) + 7) * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const v = speed * (0.35 + hash2(i, 31) * 0.9);
      this.spawn(x, y, z, s * Math.cos(a) * v, u * v, s * Math.sin(a) * v,
        life * (0.55 + hash2(i, 41) * 0.75), r, g, b, w);
    }
  }

  update(dt) {
    const d = this.d;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 12;
      const life = d[o + 6] - dt;
      if (life <= 0) continue;
      const wo = w * 12;
      // Slight drag, so debris decelerates instead of flying forever.
      const k = 1 - 1.1 * dt;
      d[wo] = d[o] + d[o + 3] * dt;
      d[wo + 1] = d[o + 1] + d[o + 4] * dt;
      d[wo + 2] = d[o + 2] + d[o + 5] * dt;
      d[wo + 3] = d[o + 3] * k;
      d[wo + 4] = d[o + 4] * k;
      d[wo + 5] = d[o + 5] * k;
      d[wo + 6] = life;
      d[wo + 7] = d[o + 7];
      d[wo + 8] = d[o + 8]; d[wo + 9] = d[o + 9]; d[wo + 10] = d[o + 10]; d[wo + 11] = d[o + 11];
      w++;
    }
    this.n = w;
  }

  draw(rd) {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      const o = i * 12;
      const f = d[o + 6] / d[o + 7];
      // Drawn as a short streak along velocity: a moving spark, not a dot.
      const s = 0.045;
      rd.line3(d[o], d[o + 1], d[o + 2],
        d[o] - d[o + 3] * s, d[o + 1] - d[o + 4] * s, d[o + 2] - d[o + 5] * s,
        d[o + 11] * (0.4 + f * 0.6), d[o + 8], d[o + 9], d[o + 10], f);
    }
  }

  clear() { this.n = 0; }
}
