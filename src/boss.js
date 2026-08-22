// The warden: the boss machinery, and the first warden to use it.
//
// A warden is opt-in per level ("boss" in the spec). Kill the port and instead
// of the result screen the flyout carries you up out of the canyon and into
// the arena -- open ground above the district, where the warden is waiting.
// It is a ship like the ones in 1943: you fly alongside it, it takes locks and
// missiles and gunfire like anything else, and it fights back with the special
// weapon its district would hand you for beating it.
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

/** The warden entity: shaped like an enemy so every existing system works. */
export function makeWarden(def, t) {
  return {
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
    // Motion: a marionette swings. Phase-driven, so it is readable and fair.
    sway: 0,
    swayRate: 0.9,
    bob: 0,
    // Attack clocks. Each fires when it hits zero and re-arms by boss phase.
    boltIn: 3.2,
    boltAt: 0,          // when > 0, a strike is telegraphed for that moment
    boltAim: { x: 0, y: 0 }, // remembered laterally: the rails carry everyone
                        // forward together, so "where you were" is a lane and
                        // a height, not a point in space. Dodge sideways.
    missilesIn: 8,
    dronesIn: 6,
    sweepIn: 14,
    sweeping: 0,
  };
}

/** 0, 1, 2 as the fight escalates -- the third of its health it has lost. */
const stage = (b) => (b.hp > b.maxHp * 0.66 ? 0 : b.hp > b.maxHp * 0.33 ? 1 : 2);

/**
 * One tick of the warden. `game` is the whole game on purpose: a boss is a
 * choreographer, and it reaches for the ship, the track, the weapons and the
 * drones the way the level compiler never needs to.
 */
export function updateWarden(b, dt, game) {
  const tr = game.track;
  b.flash = Math.max(0, b.flash - dt * 6);
  const st = stage(b);

  // Position: ahead of the ship, hanging from its cables, swinging across the
  // arena. The swing is the dodge problem; it accelerates as the fight goes.
  b.t = lerp(b.t, game.t + 420 - st * 40, dt * 1.4);
  b.sway += dt * (b.swayRate + st * 0.45) * (b.sweeping > 0 ? 2.6 : 1);
  b.bob += dt * 1.3;
  const hw = tr.halfWidth(b.t);
  b.x = Math.sin(b.sway) * (hw - 34);
  b.y = tr.rim(b.t) + 46 + Math.sin(b.bob) * 9;
  tr.localToWorld(b.t, b.x, b.y, b.world);
  b.los = 1;

  if (b.sweeping > 0) b.sweeping -= dt;

  // The arc volley: telegraph, then strike where it aimed when it charged.
  // The charge is the tell; moving after it is the answer.
  if (b.boltAt > 0) {
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
      b.boltAim = { x: game.shipX, y: game.shipY };
      game.audio.zap();
    }
  }

  // Seeker missiles, from stage 1 on.
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

  // Escorts: a handful of drones, the small problem layered over the big one.
  b.dronesIn -= dt;
  if (b.dronesIn <= 0) {
    b.dronesIn = 12 - st * 2.5;
    for (let i = 0; i < 2 + st; i++) {
      game.drones.push({
        kind: 'drone', t: b.t - 60 - i * 40, alive: true,
        x: (hash2((game.time * 7) | 0, i) * 2 - 1) * (hw - 20),
        y: tr.rim(b.t) + 20 + hash2((game.time * 7) | 0, i + 4) * 40,
        hp: 2, maxHp: 2, lockable: true, points: 200,
        cool: 0.8 + hash2((game.time * 7) | 0, i + 9),
        phase: hash2((game.time * 7) | 0, i + 13) * TAU,
        // Trench drones let the ship overrun them; an escort has to keep up.
        pace: 0.97,
        spin: 0, aim: 0, flash: 0, world: [0, 0, 0],
      });
    }
  }

  // The sweep: from the last third, it doubles its swing and drops to ship
  // height -- the arena itself becomes the thing to dodge.
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
 * The warden drawn: a hull, a core, the eight arms, and the cables it hangs
 * from. All line primitives, like everything else in the world.
 */
export function drawWarden(rd, b, track, time) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const col = b.flash > 0 ? [1, 1, 1] : [0.78, 0.42, 1];
  const R = 24;

  // Cables: up and out of frame. The thing is held, not flying.
  for (const side of [-0.5, 0.5]) {
    track.localToWorld(b.t, b.x + side * R * 1.2, b.y + R * 0.6, p);
    track.localToWorld(b.t, b.x + side * R * 3.2, b.y + 420, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.1, col[0], col[1], col[2], 0.5);
  }

  // The hull: an octagon in the cross-track plane.
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
    track.localToWorld(b.t, b.x + Math.cos(a0) * R, b.y + Math.sin(a0) * R, p);
    track.localToWorld(b.t, b.x + Math.cos(a1) * R, b.y + Math.sin(a1) * R, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, col[0], col[1], col[2], 1);
  }

  // Arms: eight short tentacles, waving. The nod to the ring it commands.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    const wob = Math.sin(time * 3 + k * 1.7) * 4;
    track.localToWorld(b.t, b.x + Math.cos(a) * R, b.y + Math.sin(a) * R, p);
    track.localToWorld(b.t, b.x + Math.cos(a) * (R + 13 + wob), b.y + Math.sin(a) * (R + 13 - wob), q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.5, 1, 0.55, 0.25, 0.9);
  }

  // The core, pulsing -- and blazing through a telegraph so the charge reads.
  const charging = b.boltAt > 0;
  const pulse = charging ? 0.7 + 0.3 * Math.sin(time * 30) : 0.5 + 0.2 * Math.sin(time * 4);
  track.localToWorld(b.t, b.x, b.y, p);
  rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], charging ? 12 : 7,
    charging ? 1 : col[0], charging ? 0.9 : col[1] * 0.8, charging ? 0.5 : col[2], pulse);
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
