// Everything that is not terrain: the ship, the obstacles, the guns, the shots
// and the debris.
//
// Enemy fire and player fire both live in world space, because that is the only
// frame where a shot fired at an angle across a bending trench travels straight.
// Collision with the canyon converts back to canyon-local via Track.worldToLocal.

import { hash2, clamp, hsv, TAU } from './math.js';
import { obstacleToLocal, PORT_BEAM, RING_BEAM } from './collide.js';

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
  // The moving ones read cooler than the rock: they are machinery, not terrain,
  // and a player needs to tell at a glance which things will still be there.
  pinwheel: [0.55, 0.9, 1], cross: [0.6, 0.85, 1],
  press: [1, 0.7, 0.2], slider: [0.75, 0.85, 1],
};

/**
 * One box of an obstacle, in that obstacle's own frame.
 *
 * `ob` and `time` are how a moving obstacle gets drawn where it actually is:
 * the corners go through exactly the transform collision inverts, so what you
 * see and what you hit cannot drift apart.
 */
function box(rd, track, t, dz, x0, x1, y0, y1, col, w, a, ob = null, time = 0, ang = 0) {
  const p = _obp;
  const c = _obc;
  // Front and back rectangles plus the four connecting edges.
  for (const [tt, idx] of [[t, 0], [t + dz, 4]]) {
    for (let k = 0; k < 4; k++) {
      const ox = k === 0 || k === 3 ? x0 : x1;
      const oy = k < 2 ? y0 : y1;
      if (ob) { obstacleToLocal(ob, time, ox, oy, c, ang); track.localToWorld(tt, c[0], c[1], p[idx + k]); }
      else track.localToWorld(tt, ox, oy, p[idx + k]);
    }
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
const _obc = [0, 0];

export function drawObstacles(rd, track, obstacles, cursor, camT, far, time) {
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let i = cursor; i < obstacles.length; i++) {
    const ob = obstacles[i];
    if (ob.t > camT + far) break;
    if (ob.t + ob.dz < camT - 40) continue;
    const col = OB_COL[ob.kind] || OB_COL.pylon;

    if (ob.kind === 'seal') {
      if (ob.gone) continue;
      const [x0, x1, y0, y1] = ob.boxes[0];
      const drop = ob.dropY || 0;
      box(rd, track, ob.t, ob.dz, x0, x1, y0, y1, col, 1.5, 1, ob, time);

      // The face, hatched densely across the trench opening. Wireframe has no
      // fill, so density is the only way a wall says "solid" -- and it has to,
      // because the trench floor behind it draws straight through and otherwise
      // converges to a vanishing point in the middle of the thing, which reads
      // as an open tunnel exactly where the game is shouting CLIMB.
      const hw = ob.hw || (x1 - x0) * 0.25;
      for (let k = -7; k <= 7; k++) {
        const x = (k / 7) * hw;
        track.localToWorld(ob.t, x, y0 + drop, p);
        track.localToWorld(ob.t, x, y1 + drop, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, col[0], col[1], col[2], 0.42);
      }
      for (let k = 0; k <= 9; k++) {
        const y = y0 + drop + ((y1 - y0) * k) / 9;
        track.localToWorld(ob.t, -hw, y, p);
        track.localToWorld(ob.t, hw, y, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, col[0], col[1], col[2], 0.42);
      }

      // Chevrons: two columns of arrows climbing the face, brightest in
      // sequence. A bulkhead is the one obstacle whose answer is a direction
      // rather than a gap, and nothing else on screen can say "up" for it.
      //
      // Every row stays legible and the pulse only picks which is brightest.
      // Unlit rows used to sit at 0.18 and vanished into the wall, so a still
      // frame -- which is what a player actually reads at speed -- carried two
      // arrows out of five.
      const rows = 5;
      const cw = Math.min(30, hw * 0.52);
      const top = y1 + drop;
      for (let k = 0; k < rows; k++) {
        const fy = y0 + drop + ((top - (y0 + drop)) * (k + 0.6)) / (rows + 0.4);
        const phase = (time * 1.7 - k * 0.24) % 1.6;
        const lit = phase > 0 && phase < 0.42 ? 1 : 0.5;
        for (const cx of [-1, 1]) {
          // Outboard of the control panels, which live inside 0.3 of the
          // opening: a chevron arm through a panel made both unreadable.
          const bx = cx * hw * 0.72;
          track.localToWorld(ob.t, bx - cw * 0.5, fy - cw * 0.34, p);
          track.localToWorld(ob.t, bx, fy + cw * 0.3, q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4 + lit * 1.6, 1, 0.78, 0.24, lit);
          track.localToWorld(ob.t, bx + cw * 0.5, fy - cw * 0.34, p);
          rd.line3(q[0], q[1], q[2], p[0], p[1], p[2], 2.4 + lit * 1.6, 1, 0.78, 0.24, lit);
        }
      }
      // Sparse ribs across the buried part of the face, outside the opening.
      for (let k = 1; k < 4; k++) {
        const y = y0 + drop + ((y1 - y0) * k) / 4;
        for (const [a, b] of [[x0, -hw], [hw, x1]]) {
          track.localToWorld(ob.t, a, y, p);
          track.localToWorld(ob.t, b, y, q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 0.9, col[0], col[1], col[2], 0.45);
        }
      }
      // Hazard flashers along the lip: the "go up" instruction.
      const blink = 0.45 + 0.55 * Math.sin(time * 8);
      for (let k = 0; k <= 8; k++) {
        const x = x0 + ((x1 - x0) * k) / 8;
        track.localToWorld(ob.t, x, y1 + drop, p);
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
        const ex = cx + Math.cos(a0) * (r + RING_BEAM.gap);
        const ey = cy + Math.sin(a0) * (r + RING_BEAM.gap);
        track.localToWorld(ob.t, ex, ey, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 0.8, 1, 0.5, 0.2, 0.55);
      }

      // What comes out of the tentacles. Not a line -- a wedge with a mouth and
      // a far end, drawn at both faces of the hoop and joined up, so it is a
      // slab of light standing in the trench rather than a scratch on the
      // glass. Bright orange as it leaves, yellow as it goes.
      if (ob.beams) {
        for (const b of ob.beams) {
          const age = Math.min(1, (time - b.born) / RING_BEAM.life);
          const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
          const nx = -sa, ny = ca;
          const w0 = RING_BEAM.wide;
          const w1 = RING_BEAM.wide + (b.reach - b.from) * RING_BEAM.spread;
          const bright = (1 - age) ** 0.5;
          const g = 0.35 + age * 0.6;
          const wgt = 2.6 - age * 1.4;
          // The four corners of the wedge, at both ends of the hoop's depth.
          const corner = (rad, w, side) => [
            cx + ca * rad + nx * w * side,
            cy + sa * rad + ny * w * side,
          ];
          for (const tt of [ob.t - RING_BEAM.lead, ob.t + ob.dz]) {
            for (const side of [-1, 1]) {
              const A0 = corner(b.from, w0, side), A1 = corner(b.reach, w1, side);
              track.localToWorld(tt, A0[0], A0[1], p);
              track.localToWorld(tt, A1[0], A1[1], q);
              rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], wgt, 1, g, 0.08, bright);
            }
            const M0 = corner(b.from, w0, -1), M1 = corner(b.from, w0, 1);
            track.localToWorld(tt, M0[0], M0[1], p);
            track.localToWorld(tt, M1[0], M1[1], q);
            rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], wgt, 1, g, 0.08, bright);
            const F0 = corner(b.reach, w1, -1), F1 = corner(b.reach, w1, 1);
            track.localToWorld(tt, F0[0], F0[1], p);
            track.localToWorld(tt, F1[0], F1[1], q);
            rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], wgt * 0.7, 1, g, 0.08, bright * 0.7);
          }
          // The four long edges joining the two faces, which is what gives it
          // its thickness, and a hot core down the middle.
          for (const side of [-1, 1]) {
            for (const [rad, w] of [[b.from, w0], [b.reach, w1]]) {
              const C = corner(rad, w, side);
              track.localToWorld(ob.t - RING_BEAM.lead, C[0], C[1], p);
              track.localToWorld(ob.t + ob.dz, C[0], C[1], q);
              rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], wgt * 0.8, 1, g, 0.08, bright * 0.8);
            }
          }
          track.localToWorld(ob.t + ob.dz * 0.5, cx + ca * b.from, cy + sa * b.from, p);
          track.localToWorld(ob.t + ob.dz * 0.5, cx + ca * b.reach, cy + sa * b.reach, q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], wgt * 1.5, 1, 0.75 + age * 0.2, 0.35, bright);
        }
      }
      continue;
    }

    if (ob.kind === 'boostgate' && ob.ring) {
      // Green, and drawn as a hexagon so it never reads as one of the things
      // that will kill you. Two rings and a few spokes, pulsing.
      const { cx, cy, r } = ob.ring;
      const pulse = 0.72 + 0.28 * Math.sin(time * 5 + ob.t * 0.01);
      const g = ob.taken ? [0.25, 0.5, 0.35] : [0.2, 1, 0.45];
      for (const [rad, w] of [[r, 2.2], [r * 0.82, 1.2]]) {
        for (let k = 0; k < 6; k++) {
          const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU;
          for (const tt of [ob.t - RING_BEAM.lead, ob.t + ob.dz]) {
            track.localToWorld(tt, cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad, p);
            track.localToWorld(tt, cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad, q);
            rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, g[0], g[1], g[2], pulse);
          }
        }
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        track.localToWorld(ob.t, cx + Math.cos(a) * r, cy + Math.sin(a) * r, p);
        track.localToWorld(ob.t + ob.dz, cx + Math.cos(a) * r, cy + Math.sin(a) * r, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, g[0], g[1], g[2], pulse * 0.8);
      }
      continue;
    }

    if ((ob.kind === 'gate' || ob.kind === 'slot') && ob.window) {
      const { gx, gy, gw, gh } = ob.window;
      // Draw the window, not the blocks: the gap is the information. A slot's
      // window is the whole message, so it gets a brighter frame.
      const wcol = ob.kind === 'slot' ? [1, 0.75, 0.3] : [0.4, 1, 0.95];
      box(rd, track, ob.t, ob.dz, gx - gw, gx + gw, gy, gy + gh, wcol, ob.kind === 'slot' ? 2.2 : 1.6, 1);
      const hw = track.halfWidth(ob.t);
      const rim = track.rim(ob.t);
      for (const [ax0, ax1] of [[-hw, gx - gw], [gx + gw, hw]]) {
        box(rd, track, ob.t, ob.dz * 0.7, ax0, ax1, 0, rim, col, 1.1, 0.85);
      }
      box(rd, track, ob.t, ob.dz * 0.7, gx - gw, gx + gw, gy + gh, rim, col, 1.1, 0.85);
      box(rd, track, ob.t, ob.dz * 0.7, gx - gw, gx + gw, 0, gy, col, 1.1, 0.85);
      continue;
    }

    for (const [x0, x1, y0, y1, ang] of ob.boxes) {
      box(rd, track, ob.t, ob.dz, x0, x1, y0, y1, col, 1.2, 1, ob, time, ang || 0);
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
      // A plate on the wall with a dome coming out of it.
      //
      // This used to be a flat triangle lying in the plane of the rock, which
      // is the one plane you never get to look at: from inside the trench you
      // only ever see the wall at a glancing angle, so the whole gun collapsed
      // to a sliver. The plate is still flush -- that is where it is bolted --
      // but the dome bulges into the trench, and a half circle seen edge-on is
      // still a half circle. That is the part that says "gun" from down here.
      const sgn = e.x < 0 ? 1 : -1;      // which way is out into the trench
      const R = 9;
      const corners = [[-R, -R], [R, -R], [R, R], [-R, R]];
      for (let k = 0; k < 4; k++) {
        const a = corners[k], b = corners[(k + 1) & 3];
        track.localToWorld(e.t + a[0], e.x, e.y + a[1], p);
        track.localToWorld(e.t + b[0], e.x, e.y + b[1], q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, col[0], col[1], col[2], A * 0.8);
      }
      // Two arcs, one upright and one flat, both bulging out of the plate.
      const N = 6;
      for (let k = 0; k < N; k++) {
        const a0 = Math.PI * (k / N - 0.5), a1 = Math.PI * ((k + 1) / N - 0.5);
        const dome = (a, out) => {
          const r = Math.cos(a) * R * 0.92;
          return out
            ? [e.t, e.x + sgn * r, e.y + Math.sin(a) * R * 0.92]
            : [e.t + Math.sin(a) * R * 0.92, e.x + sgn * r, e.y];
        };
        for (const upright of [true, false]) {
          const A0 = dome(a0, upright), A1 = dome(a1, upright);
          track.localToWorld(A0[0], A0[1], A0[2], p);
          track.localToWorld(A1[0], A1[1], A1[2], q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.2, col[0], col[1], col[2], A);
        }
      }
      // Barrel out of the dome, swung toward where it last aimed.
      track.localToWorld(e.t, e.x + sgn * R * 0.5, e.y, p);
      track.localToWorld(e.t + Math.sin(e.aim || 0) * R * 0.8,
        e.x + sgn * R * 1.9, e.y + (e.aim ? Math.sin(e.aim) * 2 : 0), q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.7, col[0], col[1], col[2], A);
      rd.dot3(q[0], q[1], q[2], 2, 1, 0.8, 0.4, (0.75 + 0.25 * Math.sin(time * 9)) * A);
    } else if (e.kind === 'battery') {
      drawBattery(rd, track, e, col, time, A);
    } else if (e.kind === 'gatling') {
      drawGatling(rd, track, e, col, time, A);
    } else if (e.kind === 'panel') {
      drawPanel(rd, track, e, time, A);
    } else if (e.kind === 'port') {
      drawPort(rd, track, e, time, A);
    } else if (e.kind === 'drone') {
      drawDrone(rd, track, e, col, time, A);
    }
  }
}


// How a battery's tubes are laid out on its deck: columns along the trench by
// rows across it. The shape is the readout -- you are meant to see a twelve
// coming and decide, from the skyline, whether you want to be up there.
const TUBE_GRID = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 6: [3, 2], 12: [4, 3] };

/**
 * A surface missile battery: a hull on the skyline with a grid of vertical
 * launch cells in its deck, one per tube.
 *
 * Drawn big on purpose. The trench is the safe place and the surface is the
 * bargain you make to get past a bulkhead, and that only reads if the things up
 * there look like they were built to end you.
 */
function drawBattery(rd, track, e, col, time, A = 1) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const [cols, rows] = TUBE_GRID[e.tubes] || [1, 1];
  const L = 15 + e.tubes * 2.0;
  const W = 7 + rows * 5;
  const H = 7 + rows * 3;
  const inboard = e.x < 0 ? 1 : -1;
  const line = (t0, x0, y0, t1, x1, y1, w, a, r = col[0], g = col[1], b = col[2]) => {
    track.localToWorld(e.t + t0, e.x + x0, e.y + y0, p);
    track.localToWorld(e.t + t1, e.x + x1, e.y + y1, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, r, g, b, a * A);
  };

  // Hull: a deck plate lifted off the surface, chamfered toward the trench so
  // it reads as facing you rather than as a crate someone left there.
  const nose = L * 0.72;
  const deck = [[-L, -W], [-nose, W * inboard * 0.15 + W], [nose, W * inboard * 0.15 + W], [L, -W]];
  for (const dy of [1, H]) {
    for (let i = 0; i < 4; i++) {
      const a = deck[i], b = deck[(i + 1) & 3];
      line(a[0], a[1] * inboard, dy, b[0], b[1] * inboard, dy, 1.4, 0.95);
    }
  }
  for (const d of deck) line(d[0], d[1] * inboard, 1, d[0], d[1] * inboard, H, 1.1, 0.75);

  // Launch cells. A loaded cell glows; the one about to fire flares.
  const firing = e.salvo > 0;
  for (let c = 0; c < cols; c++) {
    for (let r2 = 0; r2 < rows; r2++) {
      const ct = cols === 1 ? 0 : (-0.62 + (1.24 * c) / (cols - 1)) * L;
      const cx = (rows === 1 ? 0 : (-0.5 + (1.0 * r2) / (rows - 1)) * W) * inboard;
      const s2 = Math.min(L / cols, W / rows) * 0.34;
      const idx = c * rows + r2;
      const spent = e.tubes - (e.salvo || 0);
      const live = idx >= spent;
      const glow = live ? (firing && idx === spent ? 1 : 0.55) : 0.12;
      for (let k = 0; k < 4; k++) {
        const a = [[-s2, -s2], [s2, -s2], [s2, s2], [-s2, s2]][k];
        const b = [[-s2, -s2], [s2, -s2], [s2, s2], [-s2, s2]][(k + 1) & 3];
        line(ct + a[0], cx + a[1], H, ct + b[0], cx + b[1], H, 1.1, glow, 1, 0.75, 0.35);
      }
      if (live) {
        track.localToWorld(e.t + ct, e.x + cx, e.y + H + 1, p);
        rd.dot3(p[0], p[1], p[2], 2.2 + (firing && idx === spent ? 3 : 0),
          1, 0.7, 0.3, (firing && idx === spent ? 1 : 0.6) * A);
      }
    }
  }

  // A mast, so it has a silhouette against the sky at distance.
  line(-L * 0.5, 0, H, -L * 0.5, 0, H + 13 + e.tubes * 0.6, 1.2, 0.7);
  track.localToWorld(e.t - L * 0.5, e.x, e.y + H + 13 + e.tubes * 0.6, p);
  rd.dot3(p[0], p[1], p[2], 2.4, 1, 0.35, 0.25,
    (0.45 + 0.55 * Math.abs(Math.sin(time * 3 + e.t))) * A);
}

/**
 * A surface gatling: a rotating barrel cluster that spins up before it fires.
 *
 * The spin-up is the whole point of drawing it this way. It is the only warning
 * the player gets, and it has to be legible from across the canyon.
 */
function drawGatling(rd, track, e, col, time, A = 1) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const inboard = e.x < 0 ? 1 : -1;
  const wind = e.wind || 0;
  const line = (t0, x0, y0, t1, x1, y1, w, a, r = col[0], g = col[1], b = col[2]) => {
    track.localToWorld(e.t + t0, e.x + x0, e.y + y0, p);
    track.localToWorld(e.t + t1, e.x + x1, e.y + y1, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, r, g, b, a * A);
  };
  // Mount.
  for (const d of [[-9, -7], [9, -7], [9, 7], [-9, 7]]) line(d[0], d[1], 0, d[0], d[1], 7, 1.1, 0.7);
  for (let k = 0; k < 4; k++) {
    const a = [[-9, -7], [9, -7], [9, 7], [-9, 7]][k];
    const b = [[-9, -7], [9, -7], [9, 7], [-9, 7]][(k + 1) & 3];
    line(a[0], a[1], 7, b[0], b[1], 7, 1.2, 0.85);
  }
  // Six barrels around the axis, turning with the spin-up.
  const spin = (e.barrel || 0);
  const R = 5.2;
  const reach = 15;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + spin;
    const by = 11 + Math.sin(a) * R;
    const bt = Math.cos(a) * R;
    const hot = 0.45 + 0.55 * wind;
    line(bt, 0, by, bt + inboard * 2, inboard * reach, by, 1.5, hot, 1, 0.55 + 0.35 * wind, 0.2);
  }
  // Muzzle glow, and hot air over it while it is spun up.
  track.localToWorld(e.t + 2, e.x + inboard * reach, e.y + 11, p);
  rd.dot3(p[0], p[1], p[2], 2.5 + wind * 6, 1, 0.55 + 0.4 * wind, 0.15, (0.4 + 0.6 * wind) * A);
  if (wind > 0.15) {
    track.localToWorld(e.t, e.x, e.y + 20 + wind * 8, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, 1, 0.6, 0.2, wind * 0.5 * A);
  }
}

/** A bulkhead control panel: small, bright, and the reason to look down. */
function drawPanel(rd, track, e, time, A = 1) {
  const p = [0, 0, 0], q = [0, 0, 0];
  const w = 9, h = 7;
  const pulse = 0.6 + 0.4 * Math.sin(time * 6 + e.t * 0.05);
  const hit = e.flash > 0 ? 1 : 0;
  const cr = 1, cg = hit ? 0.25 : 0.85, cb = hit ? 0.2 : 0.35;
  const line = (x0, y0, x1, y1, lw, a) => {
    track.localToWorld(e.t, e.x + x0, e.y + y0, p);
    track.localToWorld(e.t, e.x + x1, e.y + y1, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], lw, cr, cg, cb, a * A);
  };
  line(-w, -h, w, -h, 1.5, 1); line(w, -h, w, h, 1.5, 1);
  line(w, h, -w, h, 1.5, 1); line(-w, h, -w, -h, 1.5, 1);
  line(-w * 0.5, 0, w * 0.5, 0, 1.2, pulse);
  line(0, -h * 0.5, 0, h * 0.5, 1.2, pulse);
  track.localToWorld(e.t - 3, e.x, e.y, p);
  rd.dot3(p[0], p[1], p[2], 3.4, cr, cg, cb, pulse * A);
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

  // The shafts: short tubes stood off the rim all the way round, which is what
  // the beams come out of. Fixed -- the ring turns, these do not.
  const N = PORT_BEAM.shafts;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const nx = -sa * 1.7, ny = ca * 1.7;      // across the shaft, for its walls
    const lit = e.beams && e.beams.some((b) => Math.abs(b.ang - a) < 0.01
      && time - b.born < 0.12);
    const g = lit ? [1, 0.85, 0.35] : [1, 0.6, 0.2];
    for (const off of [-1, 1]) {
      track.localToWorld(e.t, e.x + ca * 31 + nx * off, e.y + sa * 31 + ny * off, p);
      track.localToWorld(e.t, e.x + ca * 40 + nx * off, e.y + sa * 40 + ny * off, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.2, g[0], g[1], g[2], (lit ? 1 : 0.8) * A);
    }
    track.localToWorld(e.t, e.x + ca * 40 + nx, e.y + sa * 40 + ny, p);
    track.localToWorld(e.t, e.x + ca * 40 - nx, e.y + sa * 40 - ny, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.4, g[0], g[1], g[2], (lit ? 1 : 0.8) * A);
  }

  // And the wall they build: each beam stands in a slab in front of the port,
  // drawn front and back so it has depth to fly into rather than a line to
  // cross. Orange when it is fired, yellow as it goes.
  if (e.beams) {
    for (const b of e.beams) {
      const age = Math.min(1, (time - b.born) / PORT_BEAM.life);
      const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
      const w = 2.8 - age * 1.5;
      const A2 = 0.95 * (1 - age) ** 0.55 * A;
      const r0 = PORT_BEAM.inner, r1 = b.reach;
      for (const tt of [e.t, e.t - PORT_BEAM.slab]) {
        track.localToWorld(tt, e.x + ca * r0, e.y + sa * r0, p);
        track.localToWorld(tt, e.x + ca * r1, e.y + sa * r1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, 1, 0.42 + age * 0.5, 0.06 + age * 0.22, A2);
      }
      track.localToWorld(e.t, e.x + ca * r1, e.y + sa * r1, p);
      track.localToWorld(e.t - PORT_BEAM.slab, e.x + ca * r1, e.y + sa * r1, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w * 0.7, 1, 0.5 + age * 0.4, 0.1, A2 * 0.7);
    }
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
    this.missiles = []; // player missiles, one per lock
    this.seekers = [];  // enemy missiles, from the surface batteries
  }

  /**
   * An enemy heat-seeker. It out-runs the ship -- it used to top out at 430,
   * under REACTOR's 500, which meant the hardest level's missiles could not
   * catch anyone and the surface there was the safest place in the game. It is
   * still slower to turn than the ship can bank, so it is beaten by flying, and
   * it can be shot out of the air, which is what the gun is for when a battery
   * empties itself at you.
   */
  fireSeeker(x, y, z, dx, dy, dz) {
    this.seekers.push({
      x, y, z, px: x, py: y, pz: z, dx, dy, dz,
      speed: 300, accel: 265, maxSpeed: 640, turn: 2.05, life: 7, arm: 0.35,
    });
  }

  fireLaser(x, y, z, dx, dy, dz, speed = 1500) {
    this.lasers.push({ x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed, life: 1.1 });
  }

  fireBolt(x, y, z, dx, dy, dz, speed = 430, heavy = false, tracer = false) {
    this.bolts.push({ x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed, life: 3.2, heavy, tracer });
  }

  fireMissile(x, y, z, dx, dy, dz, target) {
    this.missiles.push({
      x, y, z, px: x, py: y, pz: z, dx, dy, dz, speed: 620, life: 6, target,
    });
  }

  update(dt, chase) {
    // Enemy seekers, homing on wherever the ship is now.
    let sw = 0;
    for (let i = 0; i < this.seekers.length; i++) {
      const m = this.seekers[i];
      m.life -= dt;
      m.arm -= dt;
      if (m.life <= 0) continue;
      if (chase && m.arm <= 0) {
        let ax = chase[0] - m.x, ay = chase[1] - m.y, az = chase[2] - m.z;
        const L = Math.hypot(ax, ay, az) || 1;
        ax /= L; ay /= L; az /= L;
        const k = clamp(m.turn * dt, 0, 1);
        m.dx += (ax - m.dx) * k; m.dy += (ay - m.dy) * k; m.dz += (az - m.dz) * k;
        const n = Math.hypot(m.dx, m.dy, m.dz) || 1;
        m.dx /= n; m.dy /= n; m.dz /= n;
      }
      m.speed = Math.min(m.maxSpeed, m.speed + m.accel * dt);
      const d = m.speed * dt;
      m.px = m.x; m.py = m.y; m.pz = m.z;
      m.x += m.dx * d; m.y += m.dy * d; m.z += m.dz * d;
      this.seekers[sw++] = m;
    }
    this.seekers.length = sw;

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
    for (const m of this.seekers) {
      // A hot head and a long tail, so a salvo of twelve reads as weather.
      rd.line3(m.x, m.y, m.z, m.x - m.dx * 26, m.y - m.dy * 26, m.z - m.dz * 26,
        2.2, 1, 0.42, 0.14, 1);
      rd.line3(m.x - m.dx * 26, m.y - m.dy * 26, m.z - m.dz * 26,
        m.x - m.dx * 54, m.y - m.dy * 54, m.z - m.dz * 54, 1.4, 1, 0.3, 0.1, 0.35);
      rd.dot3(m.x, m.y, m.z, 3.4, 1, 0.8, 0.4, 1);
    }
    for (const s of this.lasers) {
      const L = 30;
      rd.line3(s.x, s.y, s.z, s.x - s.dx * L, s.y - s.dy * L, s.z - s.dz * L,
        2.2, 0.6, 1, 0.75, 1);
    }
    for (const s of this.bolts) {
      // Gatling rounds are drawn long and pale-hot: at that cadence they are a
      // stream rather than a series of shots, and they should read as one.
      const L = s.tracer ? 34 : s.heavy ? 22 : 14;
      const w = s.tracer ? 1.6 : s.heavy ? 2.6 : 1.8;
      rd.line3(s.x, s.y, s.z, s.x - s.dx * L, s.y - s.dy * L, s.z - s.dz * L,
        w, 1, s.tracer ? 0.7 : s.heavy ? 0.35 : 0.55, s.tracer ? 0.3 : 0.2, 1);
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
    this.seekers.length = 0;
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
