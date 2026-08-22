// The warden: the boss machinery, and the first warden to use it.
//
// A warden is opt-in per level ("boss" in the spec). Kill the port and instead
// of the result screen the flyout carries you up out of the canyon and into
// the arena -- open ground above the district, where the warden is waiting.
// It is a ship like the ones in 1943: you fly alongside it, it takes locks and
// missiles and gunfire like anything else, and it fights back with the special
// weapon its district would hand you for beating it.
//
// The fight has a shape, so it has progress: six tentacle pods orbit the core,
// they are what spawns the escorts, and while any of them lives the core is
// shielded. Break the pods -- each one is a small, lockable target -- and the
// core opens. That is the fight: the crowd first, then the duel.
//
// Everything generic lives in the entity and the attack timers; everything
// MARIONETTE lives in how they are set. A second warden is a second block of
// numbers and a draw function, not a second system.

import { clamp, lerp, TAU, hash2 } from './math.js';

// How hard its attacks hit. Tuned so the fight is the run's final exam, not a
// damage sponge: unbroken attention beats it with shields to spare.
const BOLT_DAMAGE = 16;       // the arc strike, if you are where it aimed
const BOLT_RADIUS = 30;       // how close counts as hit
const SWEEP_DAMAGE = 24;      // flying into the hull during a sweep
const TELEGRAPH = 0.85;       // seconds of charge glow before a strike lands
const BOLT_LOCK = 0.3;        // the aim TRACKS you until this long before the
                              // strike, then freezes -- so the dodge is a late
                              // reaction, not a stroll taken during the charge
const PART_HP = 6;            // one tentacle pod
const PART_ORBIT = 58;        // how far the pods ride from the core

/** The warden entity: shaped like an enemy so every existing system works. */
export function makeWarden(def, t) {
  const b = {
    kind: 'boss',
    def,
    name: def.name,
    alive: true,
    hp: def.hp,
    maxHp: def.hp,
    lockable: true,
    points: 3000,
    t: t + 460,
    x: 0,
    y: 0,
    world: [0, 0, 0],
    flash: 0,
    paint: 0,
    los: 1,
    shielded: true,
    // Motion: it floats and swings. Phase-driven, so it is readable and fair.
    sway: 0,
    swayRate: 0.9,
    bob: 0,
    // Attack clocks. Each fires when it hits zero and re-arms by boss phase.
    boltIn: 3.2,
    boltAt: 0,          // when > 0, a strike lands at that moment
    boltAim: { x: 0, y: 0 },
    missilesIn: 8,
    dronesIn: 4,
    sweepIn: 8,
    sweeping: 0,
    parts: [],
  };
  // The six pods. Each is its own small target with its own paint and locks.
  for (let i = 0; i < 6; i++) {
    b.parts.push({
      kind: 'bosspart', boss: b, idx: i, alive: true,
      hp: PART_HP, maxHp: PART_HP, lockable: true, points: 400,
      t: b.t, x: 0, y: 0, world: [0, 0, 0],
      flash: 0, paint: 0, los: 1,
    });
  }
  return b;
}

const partsAlive = (b) => b.parts.filter((p) => p.alive).length;

/** 0, 1, 2 as the fight escalates: pods mostly up, pods falling, core open. */
const stage = (b) => {
  const n = partsAlive(b);
  return n > 3 ? 0 : n > 0 ? 1 : 2;
};

/**
 * One tick of the warden. `game` is the whole game on purpose: a boss is a
 * choreographer, and it reaches for the ship, the track, the weapons and the
 * drones the way the level compiler never needs to.
 */
export function updateWarden(b, dt, game) {
  const tr = game.track;
  b.flash = Math.max(0, b.flash - dt * 6);
  const st = stage(b);
  b.shielded = st < 2;
  // A shielded core refuses locks: a salvo that cannot land is a lie the HUD
  // should not tell. The pods take the locks instead -- that is the fight.
  b.lockable = !b.shielded;

  // Position: ahead of the ship, swinging across the arena. The swing is the
  // dodge problem; it accelerates as the fight goes.
  b.t = lerp(b.t, game.t + 420 - st * 40, dt * 1.4);
  b.sway += dt * (b.swayRate + st * 0.45) * (b.sweeping > 0 ? 2.6 : 1);
  b.bob += dt * 1.3;
  const hw = tr.halfWidth(b.t);
  b.x = Math.sin(b.sway) * (hw - 40 - PART_ORBIT * 0.5);
  b.y = tr.rim(b.t) + 52 + Math.sin(b.bob) * 9;
  tr.localToWorld(b.t, b.x, b.y, b.world);
  b.los = 1;

  // The pods ride an ellipse around the core, each with a slow wobble in
  // depth so the ring reads as a volume rather than a decal.
  for (const part of b.parts) {
    if (!part.alive) continue;
    part.flash = Math.max(0, part.flash - dt * 6);
    const a = game.time * 0.7 + (part.idx / 6) * TAU;
    part.t = b.t + Math.sin(a * 0.5 + part.idx) * 14;
    part.x = clamp(b.x + Math.cos(a) * PART_ORBIT, -hw + 14, hw - 14);
    part.y = Math.max(tr.rim(part.t) + 14, b.y + Math.sin(a) * PART_ORBIT * 0.55);
    tr.localToWorld(part.t, part.x, part.y, part.world);
    part.los = 1;
  }

  if (b.sweeping > 0) b.sweeping -= dt;

  // The arc volley. The aim follows the ship through most of the charge and
  // freezes for the last window: dodging early buys nothing, dodging late is
  // the skill. The core burns white the moment the aim locks.
  if (b.boltAt > 0) {
    if (b.boltAt - game.time > BOLT_LOCK) {
      b.boltAim.x = game.shipX;
      b.boltAim.y = game.shipY;
    }
    if (game.time >= b.boltAt) {
      b.boltAt = 0;
      const aimW = [0, 0, 0];
      tr.localToWorld(game.t, b.boltAim.x, b.boltAim.y, aimW);
      const d = Math.hypot(game.shipPos[0] - aimW[0],
        game.shipPos[1] - aimW[1], game.shipPos[2] - aimW[2]);
      game.wardenBolt(b, aimW, d < BOLT_RADIUS ? BOLT_DAMAGE : 0);
    }
  } else {
    b.boltIn -= dt;
    if (b.boltIn <= 0) {
      b.boltIn = 3.4 - st * 0.8;
      b.boltAt = game.time + TELEGRAPH;
      game.audio.zap();
    }
  }

  // Seeker missiles, once the ring starts thinning.
  if (st >= 1) {
    b.missilesIn -= dt;
    if (b.missilesIn <= 0) {
      b.missilesIn = 9 - st * 2;
      for (const side of [-1, 1]) {
        const fx = game.shipPos[0] - b.world[0];
        const fy = game.shipPos[1] - b.world[1];
        const fz = game.shipPos[2] - b.world[2];
        const l = Math.hypot(fx, fy, fz) || 1;
        game.weapons.fireSeeker(b.world[0] + side * 22, b.world[1], b.world[2],
          fx / l + side * 0.3, fy / l, fz / l);
      }
      game.say('MISSILES', 0.8);
    }
  }

  // Escorts come FROM the pods: a living tentacle births them at its own
  // position. Kill the pods and the drones stop coming -- that is the reward
  // for working the ring, felt before the core even opens.
  const live = b.parts.filter((p) => p.alive);
  if (live.length) {
    b.dronesIn -= dt;
    if (b.dronesIn <= 0) {
      b.dronesIn = 9 - (6 - live.length);
      const src = live[(hash2((game.time * 11) | 0, 2) * live.length) | 0];
      for (let i = 0; i < 2; i++) {
        game.drones.push({
          kind: 'drone', t: src.t - 30 - i * 36, alive: true,
          x: clamp(src.x + (i ? 18 : -18), -hw + 14, hw - 14),
          y: src.y,
          hp: 2, maxHp: 2, lockable: true, points: 200,
          cool: 0.8 + hash2((game.time * 7) | 0, i + 9),
          phase: hash2((game.time * 7) | 0, i + 13) * TAU,
          pace: 0.97,
          spin: 0, aim: 0, flash: 0, world: [0, 0, 0],
        });
      }
      game.particles.burst(src.world[0], src.world[1], src.world[2], 8, 120, 0.78, 0.42, 1, 0.35, 1.4);
    }
  }

  // The sweep: with the core open it drops to ship height and swings hard --
  // the duel phase is the arena itself becoming the thing to dodge.
  if (st >= 2 && b.sweeping <= 0) {
    b.sweepIn -= dt;
    if (b.sweepIn <= 0) {
      b.sweepIn = 11;
      b.sweeping = 3.2;
      game.say('IT SWINGS LOW', 1.2);
    }
  }
  if (b.sweeping > 0) {
    b.y = lerp(b.y, tr.rim(b.t) + 14, 0.6);
    tr.localToWorld(b.t, b.x, b.y, b.world);
    const d = Math.hypot(game.shipPos[0] - b.world[0],
      game.shipPos[1] - b.world[1], game.shipPos[2] - b.world[2]);
    if (d < 26) game.damage(SWEEP_DAMAGE * dt * 4);
  }
}

/**
 * The warden drawn: the core, the shield lattice while the pods hold it, and
 * the six tentacles -- each a waving line ending in a pod, alive until it is
 * not. All line primitives, like everything else in the world.
 */
export function drawWarden(rd, b, track, time) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const col = b.flash > 0 ? [1, 1, 1] : [0.78, 0.42, 1];
  const R = 22;

  // The hull: an octagon in the cross-track plane.
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
    track.localToWorld(b.t, b.x + Math.cos(a0) * R, b.y + Math.sin(a0) * R, p);
    track.localToWorld(b.t, b.x + Math.cos(a1) * R, b.y + Math.sin(a1) * R, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, col[0], col[1], col[2], 1);
  }

  // The tentacles: from the hull out to each living pod, drawn as two bowed
  // segments so they read as reaching rather than as spokes.
  for (const part of b.parts) {
    if (!part.alive) continue;
    const midX = (b.x + part.x) / 2 + Math.sin(time * 2.6 + part.idx * 2.1) * 7;
    const midY = (b.y + part.y) / 2 + Math.cos(time * 2.2 + part.idx * 1.7) * 6;
    const midT = (b.t + part.t) / 2;
    const pc = part.flash > 0 ? [1, 1, 1] : [1, 0.55, 0.25];
    track.localToWorld(b.t, b.x, b.y, p);
    track.localToWorld(midT, midX, midY, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.6, pc[0], pc[1], pc[2], 0.8);
    track.localToWorld(part.t, part.x, part.y, p);
    rd.line3(q[0], q[1], q[2], p[0], p[1], p[2], 1.6, pc[0], pc[1], pc[2], 0.8);
    // The pod: a small diamond, and the part you shoot.
    const D = [[0, 7], [7, 0], [0, -7], [-7, 0]];
    for (let k = 0; k < 4; k++) {
      track.localToWorld(part.t, part.x + D[k][0], part.y + D[k][1], p);
      track.localToWorld(part.t, part.x + D[(k + 1) % 4][0], part.y + D[(k + 1) % 4][1], q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2, pc[0], pc[1], pc[2], 1);
    }
  }

  // The shield lattice: the live pods joined in a ring while they hold the
  // core -- so the mechanic is drawn, not explained.
  const live = b.parts.filter((x) => x.alive);
  if (live.length > 1) {
    const pulse = 0.2 + 0.12 * Math.sin(time * 7);
    for (let i = 0; i < live.length; i++) {
      const a = live[i], c = live[(i + 1) % live.length];
      track.localToWorld(a.t, a.x, a.y, p);
      track.localToWorld(c.t, c.x, c.y, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, 0.5, 0.8, 1, pulse);
    }
  }

  // The core: pulsing violet -- blazing white-hot exactly when the strike's
  // aim locks, which is the moment to move.
  const charging = b.boltAt > 0;
  const locked = charging && (b.boltAt - time < 0.3);
  const pulse = locked ? 1 : charging ? 0.7 + 0.3 * Math.sin(time * 30) : 0.5 + 0.2 * Math.sin(time * 4);
  track.localToWorld(b.t, b.x, b.y, p);
  rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], locked ? 15 : charging ? 11 : 7,
    locked ? 1 : charging ? 1 : col[0], locked ? 1 : charging ? 0.9 : col[1] * 0.8,
    locked ? 0.9 : charging ? 0.5 : col[2], pulse);
}

/** The escape pod: what flies away when the warden does not. */
export function drawPod(rd, pod) {
  const [x, y, z] = pod.world;
  rd.line3(x - 4, y - 3, z, x, y + 6, z, 1.8, 1, 0.85, 0.5, 1);
  rd.line3(x, y + 6, z, x + 4, y - 3, z, 1.8, 1, 0.85, 0.5, 1);
  rd.line3(x + 4, y - 3, z, x - 4, y - 3, z, 1.8, 1, 0.85, 0.5, 1);
  // The trail.
  rd.line3(x, y - 3, z, x - pod.vel[0] * 0.14, y - 3 - pod.vel[1] * 0.14, z - pod.vel[2] * 0.14,
    1.2, 1, 0.6, 0.2, 0.6);
}
