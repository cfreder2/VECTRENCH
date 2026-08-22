// The wardens: the boss machinery, and the eight ships that use it.
//
// A warden is opt-in per level ("boss" in the spec). Kill the port and the
// flyout carries you into the arena, where the district's warden is waiting.
// Every warden fights with the special weapon its district yields, and every
// fight has a SHAPE -- a visible structure broken before the kill shot exists
// -- because a boss with legible progress is a fight, and one without is a
// health bar.
//
// The registry at the bottom is the whole architecture: a warden is an init
// that lays out its parts, an update that runs its attacks, and a draw. The
// entity underneath is shaped like an enemy, so paint, locks, lasers,
// missiles and the arc all already understand it.

import { clamp, lerp, TAU, hash2 } from './math.js';

const TELEGRAPH = 0.85;       // seconds of charge before a strike lands
const BOLT_LOCK = 0.3;        // the aim tracks until this long before impact
const BOLT_DAMAGE = 16;
const BOLT_RADIUS = 30;
const SWEEP_DAMAGE = 24;

// --- the shared body -------------------------------------------------------

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
    openMsg: 'THE CORE IS OPEN',
    sway: 0,
    swayRate: 0.9,
    bob: 0,
    boltIn: 3.2,
    boltAt: 0,
    boltAim: { x: 0, y: 0 },
    missilesIn: 8,
    dronesIn: 4,
    sweepIn: 8,
    sweeping: 0,
    parts: [],
    walls: [],
    clouds: [],
    blades: [],
    lanes: [],
    timers: {},
  };
  (WARDENS[def.kind] || WARDENS.marionette).init(b);
  return b;
}

function mkPart(b, label, hp, over = {}) {
  const part = {
    kind: 'bosspart', boss: b, idx: b.parts.length, alive: true, label,
    hp, maxHp: hp, lockable: true, points: 400,
    t: b.t, x: 0, y: 0, world: [0, 0, 0],
    flash: 0, paint: 0, los: 1, guarded: false, regrows: 0, regrowIn: 0,
    ...over,
  };
  b.parts.push(part);
  return part;
}

const partsAlive = (b) => b.parts.filter((p) => p.alive).length;

/** 0, 1, 2 as the fight escalates. Default: by parts, then the open core. */
const stageOf = (b) => {
  if (!b.parts.length) return b.hp > b.maxHp * 0.5 ? 1 : 2;
  const n = partsAlive(b);
  return n > b.parts.length / 2 ? 0 : n > 0 ? 1 : 2;
};

/** Station ahead of the ship, swinging. The base motion most wardens share. */
function ride(b, dt, game, ahead = 420, swayFrac = 0.7, height = 52) {
  const tr = game.track;
  const st = stageOf(b);
  b.t = lerp(b.t, game.t + ahead - st * 40, dt * 1.4);
  b.sway += dt * (b.swayRate + st * 0.45) * (b.sweeping > 0 ? 2.6 : 1);
  b.bob += dt * 1.3;
  const hw = tr.halfWidth(b.t);
  b.x = Math.sin(b.sway) * (hw * swayFrac - 20);
  b.y = tr.rim(b.t) + height + Math.sin(b.bob) * 9;
  tr.localToWorld(b.t, b.x, b.y, b.world);
  b.los = 1;
}

/**
 * Dead parts tick toward regrowth, if their warden allows them any. The timer
 * arms fresh at each death -- without that, a part's second death finds the
 * old expired timer and revives it the same frame, which is not a race, it is
 * an unkillable boss.
 */
function regrow(b, dt, game, fraction = 0.5) {
  for (const p of b.parts) {
    if (p.alive) { p.down = false; continue; }
    if (p.regrows <= 0) continue;
    if (!p.down) { p.down = true; p.regrowIn = p.regrowDelay || 7; }
    p.regrowIn -= dt;
    if (p.regrowIn <= 0) {
      p.regrows -= 1;
      p.down = false;
      p.alive = true;
      p.hp = Math.max(1, Math.round(p.maxHp * fraction));
      p.flash = 1;
      game.say(`ITS ${p.label} GROWS BACK`, 1.2);
    }
  }
}

/** The tracked-aim arc strike MARIONETTE proved out; several wardens use it. */
function boltVolley(b, dt, game, st, cadence = 3.4) {
  const tr = game.track;
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
      b.boltIn = cadence - st * 0.8;
      b.boltAt = game.time + TELEGRAPH;
      game.audio.zap();
    }
  }
}

function seekerPair(b, game) {
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

function spawnEscorts(b, game, at, n) {
  const tr = game.track;
  const hw = tr.halfWidth(at.t);
  for (let i = 0; i < n; i++) {
    game.drones.push({
      kind: 'drone', t: at.t - 30 - i * 36, alive: true,
      x: clamp(at.x + (i ? 18 : -18), -hw + 14, hw - 14),
      y: at.y,
      hp: 2, maxHp: 2, lockable: true, points: 200,
      cool: 0.8 + hash2((game.time * 7) | 0, i + 9),
      phase: hash2((game.time * 7) | 0, i + 13) * TAU,
      pace: 0.97,
      spin: 0, aim: 0, flash: 0, world: [0, 0, 0],
    });
  }
}

// --- walls of light: HYDRA's waves, PORTCULLIS's closing doors -------------

/** A cross-trench sheet with one gap, telegraphed, then armed until crossed. */
function wallSpawn(b, game, { gx, gy, gr, dmg = 18, lead = 380, color }) {
  b.walls.push({
    t: game.t + lead + 240, gx, gy, gr, dmg,
    armAt: game.time + 0.6, until: game.time + 12, hit: false,
    color: color || [0.4, 0.8, 1],
  });
}

function wallsUpdate(b, dt, game) {
  const prevT = game.t - game.speed * dt;
  b.walls = b.walls.filter((w) => {
    if (game.time > w.until || w.t < game.t - 80) return false;
    if (!w.hit && game.time >= w.armAt && prevT < w.t && game.t >= w.t) {
      w.hit = true;
      const d = Math.hypot(game.shipX - w.gx, game.shipY - w.gy);
      if (d > w.gr) {
        game.damage(w.dmg);
        game.say('THROUGH THE GAP', 1);
      }
    }
    return true;
  });
}

function wallsDraw(rd, tr, b, time) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  for (const w of b.walls) {
    const hw = tr.halfWidth(w.t);
    const rim = tr.rim(w.t);
    const armed = time >= w.armAt;
    const a = armed ? 0.75 + 0.25 * Math.sin(time * 18) : 0.25;
    const [cr, cg, cb] = w.color;
    for (let i = 0; i <= 8; i++) {
      const x = -hw + (i / 8) * hw * 2;
      if (Math.abs(x - w.gx) < w.gr * 0.8) continue;
      tr.localToWorld(w.t, x, 2, p);
      tr.localToWorld(w.t, x, rim + 40, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], armed ? 2 : 1, cr, cg, cb, a);
    }
    // The gap, ringed so it reads as the way through rather than a hole.
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
      tr.localToWorld(w.t, w.gx + Math.cos(a0) * w.gr, w.gy + Math.sin(a0) * w.gr, p);
      tr.localToWorld(w.t, w.gx + Math.cos(a1) * w.gr, w.gy + Math.sin(a1) * w.gr, q);
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.6, 1, 1, 1, a);
    }
  }
}

// --- hanging fire: FURNACE's magma ----------------------------------------

function cloudSpawn(b, game, r = 30, ttl = 8, dps = 12) {
  b.clouds.push({ w: [b.world[0], b.world[1], b.world[2]], r, ttl, dps });
}

function cloudsUpdate(b, dt, game) {
  b.clouds = b.clouds.filter((c) => {
    c.ttl -= dt;
    if (c.ttl <= 0) return false;
    const d = Math.hypot(game.shipPos[0] - c.w[0], game.shipPos[1] - c.w[1],
      game.shipPos[2] - c.w[2]);
    if (d < c.r) game.damage(c.dps * dt, false);
    return true;
  });
}

function cloudsDraw(rd, b, time) {
  for (const c of b.clouds) {
    const fade = Math.min(1, c.ttl / 2);
    for (const [rad, sp] of [[c.r, 2.1], [c.r * 0.6, -3.2]]) {
      for (let k = 0; k < 6; k++) {
        const a0 = (k / 6) * TAU + time * sp;
        const a1 = ((k + 0.7) / 6) * TAU + time * sp;
        rd.line3(c.w[0] + Math.cos(a0) * rad, c.w[1] + Math.sin(a0) * rad * 0.5, c.w[2],
          c.w[0] + Math.cos(a1) * rad, c.w[1] + Math.sin(a1) * rad * 0.5, c.w[2],
          1.6, 1, 0.45, 0.15, (0.35 + 0.2 * Math.sin(time * 9 + k)) * fade);
      }
    }
  }
}

// --- returning blades: MANTIS ---------------------------------------------

function bladeThrow(b, game) {
  const tr = game.track;
  const hw = tr.halfWidth(b.t);
  b.blades.push({
    from: b.x, dir: b.x > 0 ? -1 : 1, span: hw * 1.6,
    y: clamp(game.shipY, 14, tr.rim(b.t) + 60),
    yBack: clamp(game.shipY + (hash2((game.time * 9) | 0, 3) - 0.5) * 60, 14, tr.rim(b.t) + 60),
    age: 0, dur: 2.6, hit: false, spin: 0,
  });
  game.audio.hit();
}

function bladesUpdate(b, dt, game) {
  const tr = game.track;
  b.blades = b.blades.filter((bl) => {
    bl.age += dt;
    bl.spin += dt * 14;
    if (bl.age > bl.dur) return false;
    const k = bl.age / bl.dur;
    const out = k < 0.5 ? k * 2 : (1 - k) * 2;    // out, then back
    const x = bl.from + bl.dir * bl.span * out;
    const y = k < 0.5 ? bl.y : bl.yBack;
    const bt = b.t - 140;
    const w = [0, 0, 0];
    tr.localToWorld(bt, x, y, w);
    bl.wx = w[0]; bl.wy = w[1]; bl.wz = w[2]; bl.lx = x; bl.ly = y; bl.lt = bt;
    const d = Math.hypot(game.shipPos[0] - w[0], game.shipPos[1] - w[1], game.shipPos[2] - w[2]);
    if (d < 15 && !bl.hit) { bl.hit = true; game.damage(14); }
    if (k > 0.6) bl.hit = false;                  // the return pass hits again
    return true;
  });
}

function bladesDraw(rd, b, time) {
  for (const bl of b.blades) {
    if (bl.wx === undefined) continue;
    for (let k = 0; k < 3; k++) {
      const a = bl.spin + (k / 3) * TAU;
      rd.line3(bl.wx, bl.wy, bl.wz,
        bl.wx + Math.cos(a) * 13, bl.wy + Math.sin(a) * 13, bl.wz,
        2, 0.55, 1, 0.45, 0.95);
    }
  }
}

// --- lanes: BROADSIDE's rail, AVALANCHE's rams and freeze beams ------------

/** A flashing line across the arena, then the strike along it. */
function laneFire(b, game, { axis, v, dmg = 20, width = 16, effect = null, color }) {
  b.lanes.push({
    axis, v, dmg, width, effect,
    armAt: game.time + 0.7, fireAt: game.time + 0.7 + 0.35,
    until: game.time + 0.7 + 0.55, done: false,
    color: color || [1, 0.85, 0.3],
  });
  game.audio.zap();
}

function lanesUpdate(b, dt, game) {
  b.lanes = b.lanes.filter((ln) => {
    if (game.time > ln.until) return false;
    if (!ln.done && game.time >= ln.fireAt) {
      ln.done = true;
      const at = ln.axis === 'y' ? game.shipY : game.shipX;
      if (Math.abs(at - ln.v) < ln.width) {
        game.damage(ln.dmg);
        if (ln.effect === 'ice') {
          game.iced = 1.2;
          game.say('CONTROLS ICED', 1.2);
        }
      }
    }
    return true;
  });
}

function lanesDraw(rd, tr, b, game, time) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  for (const ln of b.lanes) {
    const firing = time >= ln.fireAt && time <= ln.until;
    const a = firing ? 1 : 0.3 + 0.25 * Math.sin(time * 22);
    const [cr, cg, cb] = ln.color;
    for (let seg = 0; seg < 5; seg++) {
      const t0 = game.t - 60 + seg * 120;
      const t1 = t0 + 100;
      if (ln.axis === 'y') {
        const hw = tr.halfWidth(t0);
        tr.localToWorld(t0, -hw, ln.v, p);
        tr.localToWorld(t1, hw, ln.v, q);
      } else {
        tr.localToWorld(t0, ln.v, 6, p);
        tr.localToWorld(t1, ln.v, tr.rim(t0) + 50, q);
      }
      rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], firing ? 3 : 1.2, cr, cg, cb, a);
    }
  }
}

// --- the eight -------------------------------------------------------------

export const WARDENS = {
  /** Six tentacle pods shield the core; the pods spawn the escorts. */
  marionette: {
    init(b) {
      b.openMsg = 'THE CORE IS OPEN';
      for (let i = 0; i < 6; i++) mkPart(b, 'TENTACLE', 6);
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = st < 2;
      b.lockable = !b.shielded;
      ride(b, dt, game);
      const hw = tr.halfWidth(b.t);
      for (const part of b.parts) {
        if (!part.alive) continue;
        const a = game.time * 0.7 + (part.idx / 6) * TAU;
        part.t = b.t + Math.sin(a * 0.5 + part.idx) * 14;
        part.x = clamp(b.x + Math.cos(a) * 58, -hw + 14, hw - 14);
        part.y = Math.max(tr.rim(part.t) + 14, b.y + Math.sin(a) * 32);
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      }
      if (b.sweeping > 0) b.sweeping -= dt;
      boltVolley(b, dt, game, st);
      if (st >= 1) {
        b.missilesIn -= dt;
        if (b.missilesIn <= 0) { b.missilesIn = 9 - st * 2; seekerPair(b, game); }
      }
      const live = b.parts.filter((p) => p.alive);
      if (live.length) {
        b.dronesIn -= dt;
        if (b.dronesIn <= 0) {
          b.dronesIn = 9 - (6 - live.length);
          const src = live[(hash2((game.time * 11) | 0, 2) * live.length) | 0];
          spawnEscorts(b, game, src, 2);
          game.particles.burst(src.world[0], src.world[1], src.world[2], 8, 120, 0.78, 0.42, 1, 0.35, 1.4);
        }
      }
      if (st >= 2 && b.sweeping <= 0) {
        b.sweepIn -= dt;
        if (b.sweepIn <= 0) { b.sweepIn = 11; b.sweeping = 3.2; game.say('IT SWINGS LOW', 1.2); }
      }
      if (b.sweeping > 0) {
        b.y = lerp(b.y, tr.rim(b.t) + 14, 0.6);
        tr.localToWorld(b.t, b.x, b.y, b.world);
        const d = Math.hypot(game.shipPos[0] - b.world[0],
          game.shipPos[1] - b.world[1], game.shipPos[2] - b.world[2]);
        if (d < 26) game.damage(SWEEP_DAMAGE * dt * 4);
      }
    },
    draw(rd, b, tr, time) {
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      const col = b.flash > 0 ? [1, 1, 1] : [0.78, 0.42, 1];
      octagon(rd, tr, b.t, b.x, b.y, 22, col, 2.4);
      for (const part of b.parts) {
        if (!part.alive) continue;
        const midX = (b.x + part.x) / 2 + Math.sin(time * 2.6 + part.idx * 2.1) * 7;
        const midY = (b.y + part.y) / 2 + Math.cos(time * 2.2 + part.idx * 1.7) * 6;
        const pc = part.flash > 0 ? [1, 1, 1] : [1, 0.55, 0.25];
        tr.localToWorld(b.t, b.x, b.y, p);
        tr.localToWorld((b.t + part.t) / 2, midX, midY, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.6, pc[0], pc[1], pc[2], 0.8);
        tr.localToWorld(part.t, part.x, part.y, p);
        rd.line3(q[0], q[1], q[2], p[0], p[1], p[2], 1.6, pc[0], pc[1], pc[2], 0.8);
        diamond(rd, tr, part.t, part.x, part.y, 7, pc, 2);
      }
      lattice(rd, tr, b, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** A river monitor in segments; only the glowing one takes damage. */
  hydra: {
    init(b) {
      b.openMsg = 'THE HEAD IS BARE';
      for (let i = 0; i < 5; i++) mkPart(b, 'SEGMENT', 7, { guarded: true });
      b.parts[b.parts.length - 1].guarded = false;   // the tail glows first
      b.weakIdx = b.parts.length - 1;
      b.guardMsg = 'HIT THE ONE THAT GLOWS';
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      // The head rides low in its river, weaving hard; the spine trails it.
      ride(b, dt, game, 400, 0.85, 26 - tr.rim(b.t) * 0);
      b.y = tr.rim(b.t) * 0.5 + 18 + Math.sin(b.bob) * 6;
      tr.localToWorld(b.t, b.x, b.y, b.world);
      // Advance the glow to the rearmost living segment.
      const living = b.parts.filter((p) => p.alive);
      for (const p of b.parts) p.guarded = true;
      if (living.length) living[living.length - 1].guarded = false;
      let px = b.x, py = b.y, pt = b.t;
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        const lag = (i + 1) * 34;
        part.t = b.t - lag;
        part.x = Math.sin(b.sway - (i + 1) * 0.55) * (tr.halfWidth(part.t) * 0.8 - 18);
        part.y = tr.rim(part.t) * 0.5 + 16 + Math.sin(b.bob - i * 0.8) * 5;
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
        px = part.x; py = part.y; pt = part.t;
      });
      wallsUpdate(b, dt, game);
      b.timers.wave = (b.timers.wave ?? 4) - dt;
      if (b.timers.wave <= 0) {
        b.timers.wave = 6.5 - st * 1.2;
        const hw = tr.halfWidth(game.t + 500);
        wallSpawn(b, game, {
          gx: (hash2((game.time * 13) | 0, 2) * 2 - 1) * (hw - 30),
          gy: 20 + hash2((game.time * 13) | 0, 5) * (tr.rim(game.t) - 30),
          gr: 26 - st * 3,
          color: [0.35, 0.85, 1],
        });
        game.say('WAVE WALL', 0.9);
      }
      if (st >= 1) boltVolley(b, dt, game, st, 4.2);
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [0.3, 0.85, 1];
      // The head: a jawed wedge.
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      for (const [dx0, dy0, dx1, dy1] of [
        [-16, 0, 0, 12], [0, 12, 16, 0], [16, 0, 0, -10], [0, -10, -16, 0],
        [16, 0, 26, 5], [16, 0, 26, -5],
      ]) {
        tr.localToWorld(b.t, b.x + dx0, b.y + dy0, p);
        tr.localToWorld(b.t, b.x + dx1, b.y + dy1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, col[0], col[1], col[2], 1);
      }
      let prev = { t: b.t, x: b.x, y: b.y };
      for (const part of b.parts) {
        if (!part.alive) continue;
        const glow = !part.guarded;
        const pc = part.flash > 0 ? [1, 1, 1] : glow ? [1, 0.8, 0.3] : [0.25, 0.6, 0.8];
        octagon(rd, tr, part.t, part.x, part.y, glow ? 12 : 10, pc, glow ? 2.6 : 1.6,
          glow ? 0.8 + 0.2 * Math.sin(time * 10) : 0.85);
        tr.localToWorld(prev.t, prev.x, prev.y, p);
        tr.localToWorld(part.t, part.x, part.y, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1.4, 0.3, 0.7, 0.9, 0.7);
        prev = part;
      }
      wallsDraw(rd, tr, b, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** The core on rails: four regulators, and fire that stays where poured. */
  furnace: {
    init(b) {
      b.openMsg = 'THE CORE RUNS BARE';
      for (let i = 0; i < 4; i++) mkPart(b, 'REGULATOR', 8);
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      ride(b, dt, game, 430, 0.6);
      const hw = tr.halfWidth(b.t);
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        const a = time4(game) * 0.5 + (i / 4) * TAU + Math.PI / 4;
        part.t = b.t;
        part.x = clamp(b.x + Math.cos(a) * 44, -hw + 12, hw - 12);
        part.y = Math.max(tr.rim(part.t) + 12, b.y + Math.sin(a) * 30);
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      });
      cloudsUpdate(b, dt, game);
      b.timers.vent = (b.timers.vent ?? 3) - dt;
      if (b.timers.vent <= 0) {
        b.timers.vent = 5 - st * 1.2 - (4 - partsAlive(b)) * 0.4;
        cloudSpawn(b, game, 30 + st * 6);
        game.say('IT VENTS', 0.8);
        game.audio.smallBoom();
      }
      lanesUpdate(b, dt, game);
      b.timers.ram = (b.timers.ram ?? 6) - dt;
      if (b.timers.ram <= 0) {
        b.timers.ram = 8 - st * 1.5;
        laneFire(b, game, { axis: 'y', v: game.shipY, dmg: 22, width: 18, color: [1, 0.5, 0.2] });
      }
      if (st >= 1) boltVolley(b, dt, game, st, 4.6);
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [1, 0.45, 0.2];
      octagon(rd, tr, b.t, b.x, b.y, 24, col, 2.6);
      octagon(rd, tr, b.t, b.x, b.y, 14, [1, 0.7, 0.3], 1.4, 0.7 + 0.3 * Math.sin(time * 8));
      for (const part of b.parts) {
        if (!part.alive) continue;
        const pc = part.flash > 0 ? [1, 1, 1] : [1, 0.65, 0.25];
        diamond(rd, tr, part.t, part.x, part.y, 8, pc, 2);
      }
      cloudsDraw(rd, b, time);
      lanesDraw(rd, tr, b, { t: b.t - 420 }, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** Two scythe arms that regrow once; blades that come back. */
  mantis: {
    init(b) {
      b.openMsg = 'ITS ARMS ARE GONE';
      for (let i = 0; i < 2; i++) mkPart(b, 'ARM', 12, { regrows: 1, regrowDelay: 9 });
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      ride(b, dt, game, 410, 0.75);
      const hw = tr.halfWidth(b.t);
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        const side = i === 0 ? -1 : 1;
        part.t = b.t - 10;
        part.x = clamp(b.x + side * (34 + Math.sin(game.time * 2.4) * 8), -hw + 12, hw - 12);
        part.y = b.y - 6;
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      });
      regrow(b, dt, game);
      bladesUpdate(b, dt, game);
      b.timers.blade = (b.timers.blade ?? 3) - dt;
      if (b.timers.blade <= 0 && partsAlive(b) > 0) {
        b.timers.blade = 4.4 - partsAlive(b) * 0 - st * 0.8;
        bladeThrow(b, game);
      }
      b.timers.seed = (b.timers.seed ?? 6) - dt;
      if (b.timers.seed <= 0) {
        b.timers.seed = 10 - st * 2;
        spawnEscorts(b, game, b, 2 + st);
        game.say('SEEDS', 0.8);
      }
      // Armless, it rams in crossing figure-eights.
      if (st >= 2) {
        b.sway += dt * 1.6;
        b.y = tr.rim(b.t) + 24 + Math.sin(b.bob * 2.3) * 26;
        tr.localToWorld(b.t, b.x, b.y, b.world);
        const d = Math.hypot(game.shipPos[0] - b.world[0],
          game.shipPos[1] - b.world[1], game.shipPos[2] - b.world[2]);
        if (d < 24) game.damage(SWEEP_DAMAGE * dt * 4);
      }
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [0.5, 1, 0.4];
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      // A narrow thorax, head up.
      for (const [dx0, dy0, dx1, dy1] of [
        [0, 18, 6, 0], [6, 0, 0, -16], [0, -16, -6, 0], [-6, 0, 0, 18],
      ]) {
        tr.localToWorld(b.t, b.x + dx0, b.y + dy0, p);
        tr.localToWorld(b.t, b.x + dx1, b.y + dy1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.2, col[0], col[1], col[2], 1);
      }
      for (const part of b.parts) {
        if (!part.alive) continue;
        const side = part.idx === 0 ? -1 : 1;
        const pc = part.flash > 0 ? [1, 1, 1] : [0.7, 1, 0.5];
        // The scythe: shoulder out, then the hook down.
        tr.localToWorld(b.t, b.x, b.y + 8, p);
        tr.localToWorld(part.t, part.x, part.y + 10, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2, pc[0], pc[1], pc[2], 0.95);
        tr.localToWorld(part.t, part.x, part.y + 10, p);
        tr.localToWorld(part.t, part.x + side * 8, part.y - 14, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, pc[0], pc[1], pc[2], 1);
      }
      bladesDraw(rd, b, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** A bulkhead that got up: strip the panels, thread the doors. */
  portcullis: {
    init(b) {
      b.openMsg = 'THE HINGE IS BARE';
      for (let i = 0; i < 6; i++) mkPart(b, 'PANEL', 7);
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      ride(b, dt, game, 440, 0.4, 60);
      const hw = tr.halfWidth(b.t);
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        const col = i % 3, row = (i / 3) | 0;
        part.t = b.t;
        part.x = clamp(b.x + (col - 1) * 26, -hw + 12, hw - 12);
        part.y = b.y + (row === 0 ? -16 : 16);
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      });
      wallsUpdate(b, dt, game);
      b.timers.door = (b.timers.door ?? 4) - dt;
      if (b.timers.door <= 0) {
        b.timers.door = 7 - st * 1.4;
        wallSpawn(b, game, {
          gx: (hash2((game.time * 17) | 0, 2) * 2 - 1) * (hw - 34),
          gy: 22 + hash2((game.time * 17) | 0, 5) * (tr.rim(game.t) - 34),
          gr: 24 - st * 3, dmg: 20,
          color: [0.5, 0.65, 0.9],
        });
        game.say('THE DOORS CLOSE', 1);
      }
      // Breach shells: a heavy bolt that bursts into fragments short of you.
      b.timers.shell = (b.timers.shell ?? 3) - dt;
      if (b.timers.shell <= 0) {
        b.timers.shell = 4.5 - st;
        const fx = game.shipPos[0] - b.world[0];
        const fy = game.shipPos[1] - b.world[1];
        const fz = game.shipPos[2] - b.world[2];
        const l = Math.hypot(fx, fy, fz) || 1;
        for (const s of [-0.18, 0, 0.18]) {
          game.weapons.fireBolt(b.world[0], b.world[1], b.world[2],
            fx / l + s, fy / l + Math.abs(s) * 0.4, fz / l, 470, true);
        }
      }
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [0.55, 0.7, 0.95];
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      for (const [dx0, dy0, dx1, dy1] of [
        [-42, -30, 42, -30], [42, -30, 42, 30], [42, 30, -42, 30], [-42, 30, -42, -30],
      ]) {
        tr.localToWorld(b.t, b.x + dx0, b.y + dy0, p);
        tr.localToWorld(b.t, b.x + dx1, b.y + dy1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.6, col[0], col[1], col[2], 1);
      }
      for (const part of b.parts) {
        if (!part.alive) continue;
        const pc = part.flash > 0 ? [1, 1, 1] : [0.7, 0.85, 1];
        square(rd, tr, part.t, part.x, part.y, 10, pc, 1.8);
      }
      wallsDraw(rd, tr, b, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** Ice that grows back; the race is for the gap you just made. */
  avalanche: {
    init(b) {
      b.openMsg = 'THE ICE IS OFF IT';
      for (let i = 0; i < 6; i++) mkPart(b, 'PLATE', 6, { regrows: 99, regrowDelay: 7 });
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      ride(b, dt, game, 400, 0.7);
      const hw = tr.halfWidth(b.t);
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        const a = (i / 6) * TAU + game.time * 0.4;
        part.t = b.t;
        part.x = clamp(b.x + Math.cos(a) * 30, -hw + 10, hw - 10);
        part.y = Math.max(tr.rim(part.t) + 10, b.y + Math.sin(a) * 26);
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      });
      regrow(b, dt, game, 1);
      lanesUpdate(b, dt, game);
      b.timers.ram = (b.timers.ram ?? 5) - dt;
      if (b.timers.ram <= 0) {
        b.timers.ram = 7.5 - st * 1.4;
        laneFire(b, game, { axis: 'y', v: game.shipY, dmg: 22, width: 18, color: [0.8, 0.95, 1] });
      }
      b.timers.freeze = (b.timers.freeze ?? 7) - dt;
      if (b.timers.freeze <= 0) {
        b.timers.freeze = 9 - st * 1.5;
        laneFire(b, game, { axis: 'x', v: game.shipX, dmg: 10, width: 16, effect: 'ice', color: [0.7, 0.9, 1] });
        game.say('FREEZE BEAM', 0.9);
      }
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [0.75, 0.92, 1];
      octagon(rd, tr, b.t, b.x, b.y, 13, [0.9, 0.98, 1], 2, 0.95);
      for (const part of b.parts) {
        if (!part.alive) continue;
        const pc = part.flash > 0 ? [1, 1, 1] : [0.6, 0.85, 1];
        // A jagged shard: an uneven diamond.
        const j = 2 + (part.idx % 3);
        diamond(rd, tr, part.t, part.x, part.y, 8 + j, pc, 1.8, 0.85);
      }
      lanesDraw(rd, tr, b, { t: b.t - 400 }, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /** The wall of fire: silence the deck one battery at a time. */
  broadside: {
    init(b) {
      b.openMsg = 'THE MAGAZINE IS OPEN';
      for (let i = 0; i < 8; i++) mkPart(b, 'BATTERY', 5);
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = stageOf(b);
      b.shielded = partsAlive(b) > 0;
      b.lockable = !b.shielded;
      // It keeps station beside you, not ahead: the broadside is the point.
      const hw = tr.halfWidth(game.t + 260);
      b.t = lerp(b.t, game.t + 260, dt * 1.6);
      b.x = lerp(b.x, -hw + 26, dt * 1.2);
      b.y = tr.rim(b.t) + 44 + Math.sin(game.time * 1.1) * 6;
      game.track.localToWorld(b.t, b.x, b.y, b.world);
      b.los = 1;
      b.parts.forEach((part, i) => {
        if (!part.alive) return;
        // Four batteries fore, four aft; the magazine amidships stays clear,
        // so no shot at the deck has to thread the core to land.
        part.t = b.t - 120 + i * 24 + (i >= 4 ? 48 : 0);
        part.x = b.x;
        part.y = b.y + (i % 2 ? 12 : -6);
        tr.localToWorld(part.t, part.x, part.y, part.world);
        part.los = 1;
      });
      // The deck fires in ranks: each living battery takes its turn.
      b.timers.rank = (b.timers.rank ?? 1.6) - dt;
      if (b.timers.rank <= 0) {
        const live = b.parts.filter((p) => p.alive);
        b.timers.rank = Math.max(0.5, 1.7 - st * 0.35);
        if (live.length) {
          const gun = live[((b.timers.gun = (b.timers.gun || 0) + 1)) % live.length];
          const fx = game.shipPos[0] - gun.world[0];
          const fy = game.shipPos[1] - gun.world[1];
          const fz = game.shipPos[2] - gun.world[2];
          const l = Math.hypot(fx, fy, fz) || 1;
          game.weapons.fireBolt(gun.world[0], gun.world[1], gun.world[2],
            fx / l, fy / l, fz / l, 500);
        }
      }
      lanesUpdate(b, dt, game);
      if (st >= 1) {
        b.timers.rail = (b.timers.rail ?? 5) - dt;
        if (b.timers.rail <= 0) {
          b.timers.rail = 6.5 - st * 1.4;
          laneFire(b, game, { axis: 'y', v: game.shipY, dmg: 20, width: 14, color: [1, 0.85, 0.3] });
          game.say('RAIL', 0.8);
        }
      }
    },
    draw(rd, b, tr, time) {
      const col = b.flash > 0 ? [1, 1, 1] : [1, 0.85, 0.35];
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      // The hull: a long slab beside the lane.
      for (const [t0, y0, t1, y1] of [
        [-132, -14, 110, -14], [110, -14, 120, 0], [120, 0, 110, 16],
        [110, 16, -132, 16], [-132, 16, -132, -14],
      ]) {
        tr.localToWorld(b.t + t0, b.x, b.y + y0, p);
        tr.localToWorld(b.t + t1, b.x, b.y + y1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, col[0], col[1], col[2], 1);
      }
      for (const part of b.parts) {
        if (!part.alive) continue;
        const pc = part.flash > 0 ? [1, 1, 1] : [1, 0.7, 0.3];
        square(rd, tr, part.t, part.x, part.y, 6, pc, 1.8);
      }
      lanesDraw(rd, tr, b, { t: b.t - 260 }, time);
      coreGlow(rd, tr, b, time, col);
    },
  },

  /**
   * The dead district's last war machine. The hull carries no guns any more:
   * it LAUNCHES them. Waves of aerial escorts circle it -- machine-gun
   * drones, then missile batteries, cycling -- and killed ones are replaced
   * from the launch bays, so clearing the sky is pressure relief, never
   * progress. Progress is the hull itself: pour fire into the armor until it
   * cracks and the core stands exposed for a window, then it seals and asks
   * again.
   *
   * And the cannon: charge on six counting lights, lock with one second of
   * warning, then the turret SPINS -- a solid, ship-wide beam sweeping the
   * full arc of the road like a lighthouse. The eye of it is dead center;
   * everything else is in the weather.
   */
  revenant: {
    init(b) {
      b.openMsg = 'THE CORE STANDS EXPOSED';
      b.guardMsg = 'POUR IT INTO THE ARMOR';
      b.armorMax = 26;
      b.armor = b.armorMax;
      b.exposedFor = 0;
      b.cannon = { state: 'idle', tIn: 6, charge: 0 };
      b.yaw = 0;
      b.rangeT = 560;
      b.laneSide = 1;
      b.debris = [];
      b.missilesLive = [];
      b.escorts = [];
      b.waveType = 'mg';
      b.waveIn = 16;
      b.respawnIn = 2;
      b.swerveIn = 0;
      b.xT = 0;
    },
    update(b, dt, game) {
      const tr = game.track;
      const st = b.hp > b.maxHp * 0.66 ? 0 : b.hp > b.maxHp * 0.33 ? 1 : 2;
      const c = b.cannon;

      // The armor cycle: shielded until cracked, exposed for a window, then
      // sealed and regrown. The HUD's pips count the armor down.
      if (b.exposedFor > 0) {
        b.exposedFor -= dt;
        b.shielded = false;
        if (b.exposedFor <= 0) {
          b.armor = b.armorMax;
          game.say('IT SEALS', 1.1);
        }
      } else {
        b.shielded = true;
        if (b.armor <= 0) {
          b.exposedFor = 5;
          game.say(b.openMsg, 1.6);
          game.audio.specialOn();
          b.flash = 1;
        }
      }
      b.lockable = !b.shielded;

      // The stand-off, spent by intent: long for cannon work, long to give a
      // battery wave its air, closer when the gun drones are on the wing.
      let wantRange = 560;
      if (c.state !== 'idle') wantRange = 700;
      else if (b.waveType === 'battery') wantRange = 660;
      else wantRange = 470;
      b.rangeT = lerp(b.rangeT, wantRange, dt * 1.1);

      b.swerveIn -= dt;
      const hw = tr.halfWidth(b.t);
      if (b.swerveIn <= 0) {
        b.swerveIn = 1.8 + hash2((game.time * 7) | 0, 1) * 1.6;
        b.laneSide = hash2((game.time * 7) | 0, 4) < 0.72 ? -b.laneSide : b.laneSide;
        b.xT = b.laneSide * (0.3 + hash2((game.time * 7) | 0, 2) * 0.65) * (hw - 72);
      }
      b.t = lerp(b.t, game.t + b.rangeT + game.speed / 1.4, dt * 1.4);
      b.x = lerp(b.x, b.xT, dt * 1.1);
      b.y = 20;
      tr.localToWorld(b.t, b.x, b.y, b.world);
      b.los = 1;
      b.tShip = game.t;

      // The bearing: on you, unless the cannon is spinning it.
      const dpT = game.t - b.t, dpX = game.shipX - b.x;
      if (c.state !== 'firing') {
        const want = clamp(Math.atan2(dpX, -dpT), -Math.PI / 2, Math.PI / 2);
        b.yaw += clamp(want - b.yaw, -1.5 * dt, 1.5 * dt);
      }
      b.asm = { fT: -Math.cos(b.yaw), fX: Math.sin(b.yaw), sT: Math.sin(b.yaw), sX: Math.cos(b.yaw) };

      // --- the escort waves: launched, orbiting, respawned, cycled --------
      b.waveIn -= dt;
      if (b.waveIn <= 0) {
        b.waveIn = 16;
        b.waveType = b.waveType === 'mg' ? 'battery' : 'mg';
        b.waveFull = false;
        for (const e of b.escorts) e.retiring = true;
        game.say(b.waveType === 'mg' ? 'GUN DRONES OUT' : 'BATTERIES OUT', 1.2);
      }
      const target = b.waveType === 'mg' ? 4 : 3;
      const active = b.escorts.filter((e) => e.alive && !e.retiring);
      if (active.length >= target) b.waveFull = true;
      if (active.length < target) {
        b.respawnIn -= dt;
        if (b.respawnIn <= 0) {
          // A fresh wave scrambles fast; replacing losses takes real time.
          b.respawnIn = b.waveFull ? 5.5 - st : 1.1;
          const i = active.length;
          b.escorts.push({
            kind: 'bossdrone', type: b.waveType, alive: true,
            hp: 3, maxHp: 3, lockable: true, points: 250,
            label: b.waveType === 'mg' ? 'GUN DRONE' : 'BATTERY',
            slot: i, ang: hash2((game.time * 13) | 0, i) * TAU,
            t: b.t - 30, x: b.x, y: 40, world: [0, 0, 0],
            flash: 0, paint: 0, los: 1, fireIn: 1 + i * 0.4, retiring: false, age: 0,
          });
          const w = [0, 0, 0];
          tr.localToWorld(b.t - 30, b.x, 58, w);
          game.particles.burst(w[0], w[1], w[2], 10, 140, 1, 0.5, 0.9, 0.4, 1.5);
          game.audio.smallBoom();
        }
      }
      b.escorts = b.escorts.filter((e) => {
        if (!e.alive) return false;
        e.age += dt;
        e.flash = Math.max(0, e.flash - dt * 6);
        if (e.retiring) {
          e.y += 70 * dt;
          tr.localToWorld(e.t, e.x, e.y, e.world);
          return e.y < 220;
        }
        // The orbit: a slow ring around the hull, high enough to be sky.
        e.ang += dt * (0.7 + e.slot * 0.07);
        const R = 120;
        e.t = b.t + Math.cos(e.ang) * R * 0.7;
        e.x = clamp(b.x + Math.sin(e.ang) * R, -hw + 12, hw - 12);
        e.y = 62 + Math.sin(game.time * 1.3 + e.slot * 2) * 12;
        tr.localToWorld(e.t, e.x, e.y, e.world);
        e.los = 1;
        e.fireIn -= dt;
        if (e.fireIn <= 0) {
          if (e.type === 'mg') {
            e.fireIn = 0.9 - st * 0.15;
            for (let k = 0; k < 4; k++) {
              const fx = game.shipPos[0] - e.world[0];
              const fy = game.shipPos[1] - e.world[1];
              const fz = game.shipPos[2] - e.world[2];
              const l = Math.hypot(fx, fy, fz) || 1;
              game.weapons.fireBolt(e.world[0] + k * fx / l * 8, e.world[1], e.world[2],
                fx / l, fy / l, fz / l, 520, false, true);
            }
            game.audio.enemyShot();
          } else {
            e.fireIn = 7 - st;
            for (let k = -1; k <= 1; k++) {
              const aim = [0, 0, 0];
              tr.localToWorld(game.t + 240, clamp(game.shipX + k * 44, -hw, hw),
                clamp(game.shipY + (k ? -20 : 22), 10, tr.rim(game.t) + 70), aim);
              const dx = aim[0] - e.world[0];
              const dy = aim[1] - e.world[1];
              const dz = aim[2] - e.world[2];
              const l = Math.hypot(dx, dy, dz) || 1;
              b.missilesLive.push({
                kind: 'bossmissile', alive: true, hp: 1, maxHp: 1,
                lockable: true, points: 50, label: 'MISSILE',
                world: [e.world[0], e.world[1], e.world[2]],
                vel: [dx / l * 205, dy / l * 205, dz / l * 205],
                t: e.t, x: e.x, y: e.y,
                flash: 0, paint: 0, los: 1, ttl: 14,
              });
            }
            game.say('VOLLEY', 0.8);
            game.audio.smallBoom();
          }
        }
        return true;
      });

      b.missilesLive = b.missilesLive.filter((m) => {
        if (!m.alive) return false;
        m.ttl -= dt;
        if (m.ttl <= 0) return false;
        m.world[0] += m.vel[0] * dt;
        m.world[1] += m.vel[1] * dt;
        m.world[2] += m.vel[2] * dt;
        m.flash = Math.max(0, m.flash - dt * 6);
        m.t -= 205 * dt;
        const d = Math.hypot(game.shipPos[0] - m.world[0],
          game.shipPos[1] - m.world[1], game.shipPos[2] - m.world[2]);
        if (d < 16) {
          game.damage(13);
          game.boomAt(m.world, 20, 130, 1, 0.5, 0.3, 0.6);
          return false;
        }
        return true;
      });

      // --- the road it does not steer around ------------------------------
      b.timers.junk = (b.timers.junk ?? 0.4) - dt;
      if (b.timers.junk <= 0 && b.debris.length < 12) {
        b.timers.junk = 0.55;
        const car = hash2((game.time * 19) | 0, 5) < 0.4;
        b.debris.push({
          t: b.t + 240 + hash2((game.time * 19) | 0, 3) * 520,
          x: (hash2((game.time * 19) | 0, 7) * 2 - 1) * (hw - 30),
          size: car ? 12 : 5 + hash2((game.time * 19) | 0, 11) * 6,
          car,
        });
      }
      b.debris = b.debris.filter((d) => {
        if (d.t < game.t - 120) return false;
        if (Math.abs(b.t - d.t) < 175 && Math.abs(b.x - d.x) < 66) {
          const w = [0, 0, 0];
          tr.localToWorld(d.t, d.x, 8, w);
          game.boomAt(w, d.car ? 34 : 20, d.car ? 190 : 140, 1, 0.6, 0.25, 0.8);
          game.audio.smallBoom();
          return false;
        }
        return true;
      });

      // --- the cannon: charge, lock, and the lighthouse sweep -------------
      const rim = tr.rim(game.t);
      const C = { x: 0, y: (12 + rim + 62) / 2 };
      b.eye = C;
      if (c.state === 'idle') {
        c.tIn -= dt;
        c.charge = Math.max(0, c.charge - dt * 2);
        if (c.tIn <= 0) {
          c.state = 'charging';
          c.tIn = 3.2;
          c.charge = 0;
          game.say('THE CANNON CHARGES', 1.4);
          game.audio.specialOn();
        }
      } else if (c.state === 'charging') {
        c.tIn -= dt;
        c.charge = Math.min(1, c.charge + dt / 3.0);
        if (c.tIn <= 0) {
          c.state = 'locked';
          c.tIn = 1.0;
        }
      } else if (c.state === 'locked') {
        // The mark is taken at the moment of the call: BEAM LOCKED, one
        // second, and the spot it locked is the spot to not be. Roll.
        if (!c.lock) {
          c.lock = { x: game.shipX, y: game.shipY };
          game.say('BEAM LOCKED -- ROLL', 1.1);
          game.audio.zap();
        }
        c.tIn -= dt;
        if (c.tIn <= 0) {
          c.state = 'firing';
          c.shots = 3;
          c.nextShot = 0;
        }
      } else {
        // BOOF. BOOF. BOOF -- and after each one the mark JUMPS to wherever
        // you are now, so every shot is its own lock and its own roll. Keep
        // moving and none of them ever owns you; stop and the next one does.
        c.nextShot -= dt;
        if (c.nextShot <= 0 && c.shots > 0) {
          c.shots -= 1;
          c.nextShot = 0.65;
          c.flashAt = game.time;
          const d = Math.hypot(game.shipX - c.lock.x, game.shipY - c.lock.y);
          if (d < 34) game.damage(28);
          game.shake = Math.min(1.9, game.shake + 0.85);
          game.audio.boof();
          if (c.shots > 0) {
            c.lock = { x: game.shipX, y: game.shipY };
            game.audio.zap();
          }
        }
        if (c.shots <= 0 && c.nextShot <= -0.35) {
          c.state = 'idle';
          c.tIn = 8 - st * 2;
          c.charge = 0;
          c.lock = null;
        }
      }
    },
    draw(rd, b, tr, time) {
      const p = [0, 0, 0];
      const q = [0, 0, 0];
      const c = b.cannon;
      const jx = (hash2((time * 60) | 0, 3) - 0.5) * c.charge * 7;
      const jy = (hash2((time * 60) | 0, 7) - 0.5) * c.charge * 4;
      const exposed = !b.shielded;
      const col = b.flash > 0 ? [1, 1, 1] : exposed ? [1, 0.6, 0.3] : [0.75, 0.4, 1];
      const dim = [col[0] * 0.55, col[1] * 0.55, col[2] * 0.62];
      const X = b.x + jx, Y = jy;
      const seg = (t0, x0, y0, t1, x1, y1, w = 2, cl = col, a = 1) => {
        tr.localToWorld(b.t + t0, X + x0, Y + y0, p);
        tr.localToWorld(b.t + t1, X + x1, Y + y1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, cl[0], cl[1], cl[2], a);
      };
      const ring = (t0, cx, cy, r, n, w = 2, cl = col, a = 1) => {
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
          seg(t0, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r,
            t0, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, w, cl, a);
        }
      };

      // --- hull, skirts, nose, deck (the sheet's slab) --------------------
      for (const sx of [-1, 1]) {
        seg(-170, sx * 48, 34, 140, sx * 48, 34, 2.4);
        seg(-170, sx * 56, 20, 140, sx * 56, 20, 2, dim);
        seg(-170, sx * 60, 8, 140, sx * 60, 8, 2, dim);
        seg(-170, sx * 48, 34, -170, sx * 56, 20, 2, dim);
        seg(-170, sx * 56, 20, -170, sx * 60, 8, 2, dim);
        seg(140, sx * 48, 34, 140, sx * 56, 20, 2, dim);
        seg(140, sx * 56, 20, 140, sx * 60, 8, 2, dim);
        for (const st2 of [-120, -60, 0, 60]) {
          seg(st2, sx * 56, 20, st2, sx * 60, 8, 1.3, dim, 0.8);
        }
        seg(140, sx * 48, 34, 200, sx * 18, 24, 2.2);
        seg(140, sx * 56, 20, 200, sx * 20, 16, 2, dim);
        seg(140, sx * 60, 8, 200, sx * 22, 10, 2, dim);
      }
      seg(200, -18, 24, 200, 18, 24, 2.2);
      seg(200, -20, 16, 200, 20, 16, 2, dim);
      seg(200, -22, 10, 200, 22, 10, 2, dim);
      seg(200, -18, 24, 200, -22, 10, 2, dim);
      seg(200, 18, 24, 200, 22, 10, 2, dim);
      seg(-170, -48, 34, -170, 48, 34, 2.4);
      seg(140, -48, 34, 140, 48, 34, 2.2);

      // --- four tread pods, racetracks rolling ----------------------------
      for (const [pt, sxs] of [[-115, -1], [-115, 1], [95, -1], [95, 1]]) {
        const px = sxs * 74;
        const face = sxs * 7;
        for (const [rl, ry0, ry1] of [[52, 8, 26], [40, 12, 22]]) {
          seg(pt - rl, px + face, ry0, pt + rl, px + face, ry0, 2, col, 0.95);
          seg(pt - rl, px + face, ry1, pt + rl, px + face, ry1, 2, col, 0.95);
          seg(pt - rl, px + face, ry0, pt - rl - 7, px + face, (ry0 + ry1) / 2, 2, col, 0.95);
          seg(pt - rl - 7, px + face, (ry0 + ry1) / 2, pt - rl, px + face, ry1, 2, col, 0.95);
          seg(pt + rl, px + face, ry0, pt + rl + 7, px + face, (ry0 + ry1) / 2, 2, col, 0.95);
          seg(pt + rl + 7, px + face, (ry0 + ry1) / 2, pt + rl, px + face, ry1, 2, col, 0.95);
        }
        for (let k = 0; k < 5; k++) {
          const roll = ((b.t * 0.14 + k * 21) % 100) - 50;
          seg(pt + roll, px + face, 26, pt + roll + 8, px + face, 26, 1.7, [1, 0.5, 0.9], 0.85);
          const roll2 = ((-b.t * 0.14 + k * 21) % 100) - 50;
          seg(pt + roll2, px + face, 8, pt + roll2 + 8, px + face, 8, 1.7, [1, 0.5, 0.9], 0.85);
        }
      }

      // --- the launch bays: the hex pods, now doors the escorts come from -
      for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          const a0 = (k / 6) * TAU + TAU / 12, a1 = ((k + 1) / 6) * TAU + TAU / 12;
          seg(-30 - Math.sin(a0) * 3, side * 52 + Math.cos(a0) * 11, 52 + Math.sin(a0) * 9,
            -30 - Math.sin(a1) * 3, side * 52 + Math.cos(a1) * 11, 52 + Math.sin(a1) * 9, 1.8, dim, 0.9);
        }
      }

      // --- the superstructure on its bearing, spinning when it spins ------
      const A = b.asm || { fT: -1, fX: 0, sT: 0, sX: 1 };
      const asmSeg = (a0, s0, h0, a1, s1, h1, w = 2, cl = col, al = 1) => {
        tr.localToWorld(b.t + a0 * A.fT + s0 * A.sT, X + a0 * A.fX + s0 * A.sX, Y + h0, p);
        tr.localToWorld(b.t + a1 * A.fT + s1 * A.sT, X + a1 * A.fX + s1 * A.sX, Y + h1, q);
        rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, cl[0], cl[1], cl[2], al);
      };
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * TAU + b.yaw, a1 = ((k + 1) / 8) * TAU + b.yaw;
        seg(Math.cos(a0) * 32, Math.sin(a0) * 32, 35, Math.cos(a1) * 32, Math.sin(a1) * 32, 35, 1.6, dim, 0.9);
      }
      const S = 26;
      const CORN = [[S, S], [S, -S], [-S, -S], [-S, S]];
      for (let k = 0; k < 4; k++) {
        const [a0, s0] = CORN[k], [a1, s1] = CORN[(k + 1) % 4];
        asmSeg(a0, s0, 36, a1, s1, 36, 2, dim, 0.95);
        asmSeg(a0, s0, 52, a1, s1, 52, 2.2, col, 1);
        asmSeg(a0, s0, 36, a0, s0, 52, 2, col, 0.95);
      }
      for (const h of [52, 63]) {
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
          asmSeg(Math.cos(a0) * 14, Math.sin(a0) * 14, h,
            Math.cos(a1) * 14, Math.sin(a1) * 14, h, h === 63 ? 2.2 : 2, col, 1);
        }
      }
      for (const ss of [-4, 4]) {
        asmSeg(12, ss, 58, 132, ss * 1.25, 62, 2.4, col, 1);
      }
      asmSeg(132, -5, 62, 132, 5, 62, 2, col, 1);
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
        asmSeg(134, Math.cos(a0) * 6, 62 + Math.sin(a0) * 6,
          134, Math.cos(a1) * 6, 62 + Math.sin(a1) * 6, 2, c.charge > 0.6 ? [1, 0.8, 1] : col, 0.95);
      }
      if (c.charge > 0) {
        tr.localToWorld(b.t + 136 * A.fT, X + 136 * A.fX, Y + 62, p);
        rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], 5 + c.charge * 22,
          1, 0.6 + c.charge * 0.4, 1, 0.4 + c.charge * 0.6);
      }

      // --- the weak point, when the armor is off it -----------------------
      if (exposed) {
        const pulse2 = 0.7 + 0.3 * Math.sin(time * 12);
        ring(-40, 0, 30, 12, 8, 2.6, [1, 0.7, 0.3], pulse2);
        tr.localToWorld(b.t - 40, X, Y + 30, p);
        rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], 14, 1, 0.75, 0.35, pulse2);
      }

      // --- the tail lights, counting the charge ---------------------------
      const lit = Math.round(c.charge * 6);
      for (const side of [-1, 1]) {
        seg(-170.5, side * 44, 10, -170.5, side * 10, 10, 1.5, dim, 0.9);
        seg(-170.5, side * 44, 22, -170.5, side * 10, 22, 1.5, dim, 0.9);
        seg(-170.5, side * 44, 10, -170.5, side * 44, 22, 1.5, dim, 0.9);
        seg(-170.5, side * 10, 10, -170.5, side * 10, 22, 1.5, dim, 0.9);
      }
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const slot = i % 3;
        const on = i < lit || c.state === 'locked' || c.state === 'firing';
        const blink = c.state === 'locked' && Math.sin(time * 26) > 0;
        tr.localToWorld(b.t - 171, X + side * (17 + slot * 10), Y + 16, p);
        rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], on ? 4.6 : 2.6,
          1, blink ? 1 : 0.35, blink ? 1 : 0.8, on ? 1 : 0.25);
      }
      seg(-60, -24, 50, -52, -28, 84, 1.2, dim, 0.8);
      tr.localToWorld(b.t - 52, X - 28, Y + 84, p);
      rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], 2.4, col[0], col[1], col[2], 0.8);

      // --- the escorts on the wing ----------------------------------------
      for (const e of b.escorts) {
        if (!e.alive) continue;
        const ec = e.flash > 0 ? [1, 1, 1]
          : e.type === 'mg' ? [1, 0.6, 0.9] : [0.9, 0.5, 1];
        const w = e.world;
        if (e.type === 'mg') {
          for (let k = 0; k < 8; k++) {
            const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
            rd.line3(w[0] + Math.cos(a0) * 8, w[1] + Math.sin(a0) * 6, w[2],
              w[0] + Math.cos(a1) * 8, w[1] + Math.sin(a1) * 6, w[2], 1.8, ec[0], ec[1], ec[2], 0.95);
          }
          rd.line3(w[0], w[1] - 6, w[2], w[0], w[1] - 12, w[2], 1.6, ec[0], ec[1], ec[2], 0.9);
        } else {
          for (let k = 0; k < 6; k++) {
            const a0 = (k / 6) * TAU + TAU / 12, a1 = ((k + 1) / 6) * TAU + TAU / 12;
            rd.line3(w[0] + Math.cos(a0) * 9, w[1] + Math.sin(a0) * 8, w[2],
              w[0] + Math.cos(a1) * 9, w[1] + Math.sin(a1) * 8, w[2], 2, ec[0], ec[1], ec[2], 0.95);
          }
          rd.line3(w[0], w[1], w[2], w[0], w[1], w[2], 4, ec[0], ec[1], ec[2], 0.9);
        }
        // The rotor shimmer that says "aircraft".
        const ra = time * 9 + e.slot;
        rd.line3(w[0] - Math.cos(ra) * 11, w[1] + 8, w[2] - Math.sin(ra) * 11,
          w[0] + Math.cos(ra) * 11, w[1] + 8, w[2] + Math.sin(ra) * 11, 1, ec[0], ec[1], ec[2], 0.35);
      }

      // --- the volley in the air ------------------------------------------
      for (const m of b.missilesLive) {
        const r = 5 + Math.sin(time * 8 + m.world[2] * 0.01) * 2;
        for (let k = 0; k < 6; k++) {
          const a0 = (k / 6) * TAU, a1 = ((k + 1) / 6) * TAU;
          rd.line3(m.world[0] + Math.cos(a0) * r, m.world[1] + Math.sin(a0) * r, m.world[2],
            m.world[0] + Math.cos(a1) * r, m.world[1] + Math.sin(a1) * r, m.world[2],
            1.8, 1, m.flash > 0 ? 1 : 0.45, m.flash > 0 ? 1 : 0.75, 0.95);
        }
      }

      // --- the beam: the mark while locked, the columns while it lands ----
      const tS = b.tShip ?? b.t - 560;
      if ((c.state === 'locked' || c.state === 'firing') && c.lock) {
        // The tracking line and the mark: exactly where, in red, blinking.
        const blink = Math.sin(time * 22) > 0 ? 1 : 0.45;
        const mz = [0, 0, 0];
        tr.localToWorld(b.t + 136 * A.fT, X + 136 * A.fX, Y + 62, mz);
        tr.localToWorld(tS, c.lock.x, c.lock.y, q);
        rd.line3(mz[0], mz[1], mz[2], q[0], q[1], q[2], 1.4, 1, 0.25, 0.25, 0.55 * blink);
        for (const r of [34, 20]) {
          for (let k = 0; k < 10; k++) {
            const a0 = (k / 10) * TAU, a1 = ((k + 0.7) / 10) * TAU;
            tr.localToWorld(tS, c.lock.x + Math.cos(a0) * r, c.lock.y + Math.sin(a0) * r, p);
            tr.localToWorld(tS, c.lock.x + Math.cos(a1) * r, c.lock.y + Math.sin(a1) * r, q);
            rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 2.4, 1, 0.3, 0.3, blink);
          }
        }
      }
      if (c.state === 'firing' && c.lock && c.flashAt && time - c.flashAt < 0.34) {
        // The column: seven rails fused into one thick shaft of light from
        // the muzzle to the mark, a blown-out core, and the impact blooming.
        const k2 = 1 - (time - c.flashAt) / 0.34;
        const mz = [0, 0, 0];
        tr.localToWorld(b.t + 136 * A.fT, X + 136 * A.fX, Y + 62, mz);
        for (let k = -3; k <= 3; k++) {
          tr.localToWorld(tS, c.lock.x + k * 4.6, c.lock.y, q);
          rd.line3(mz[0], mz[1], mz[2], q[0], q[1], q[2], k === 0 ? 4 : 8,
            1, k === 0 ? 1 : 0.5, k === 0 ? 0.95 : 0.9, (k === 0 ? 1 : 0.55) * k2);
        }
        tr.localToWorld(tS, c.lock.x, c.lock.y, q);
        rd.line3(q[0], q[1], q[2], q[0], q[1], q[2], 30 * k2 + 8, 1, 0.8, 0.6, k2);
        const bloom = (1 - k2) * 46 + 20;
        for (let k = 0; k < 12; k++) {
          const a0 = (k / 12) * TAU, a1 = ((k + 1) / 12) * TAU;
          tr.localToWorld(tS, c.lock.x + Math.cos(a0) * bloom, c.lock.y + Math.sin(a0) * bloom, p);
          tr.localToWorld(tS, c.lock.x + Math.cos(a1) * bloom, c.lock.y + Math.sin(a1) * bloom, q);
          rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 3, 1, 0.65, 0.35, k2);
        }
      }

      // --- the road ---------------------------------------------------------
      for (const d of b.debris) {
        square(rd, tr, d.t, d.x, 8, d.size, [0.85, 0.45, 0.8], 1.3, 0.7);
        if (d.car) {
          tr.localToWorld(d.t - d.size * 0.7, d.x, 3, p);
          rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], 3, 0.85, 0.45, 0.8, 0.7);
          tr.localToWorld(d.t + d.size * 0.7, d.x, 3, q);
          rd.line3(q[0], q[1], q[2], q[0], q[1], q[2], 3, 0.85, 0.45, 0.8, 0.7);
        }
      }
      coreGlow(rd, tr, b, time, col);
    },
  },
};

// --- shared drawing --------------------------------------------------------

function octagon(rd, tr, t, x, y, r, col, w = 2, a = 1) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * TAU, a1 = ((k + 1) / 8) * TAU;
    tr.localToWorld(t, x + Math.cos(a0) * r, y + Math.sin(a0) * r, p);
    tr.localToWorld(t, x + Math.cos(a1) * r, y + Math.sin(a1) * r, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, col[0], col[1], col[2], a);
  }
}

function diamond(rd, tr, t, x, y, r, col, w = 2, a = 1) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const D = [[0, r], [r * 0.75, 0], [0, -r], [-r * 0.75, 0]];
  for (let k = 0; k < 4; k++) {
    tr.localToWorld(t, x + D[k][0], y + D[k][1], p);
    tr.localToWorld(t, x + D[(k + 1) % 4][0], y + D[(k + 1) % 4][1], q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, col[0], col[1], col[2], a);
  }
}

function square(rd, tr, t, x, y, r, col, w = 2, a = 1) {
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const D = [[-r, -r], [r, -r], [r, r], [-r, r]];
  for (let k = 0; k < 4; k++) {
    tr.localToWorld(t, x + D[k][0], y + D[k][1], p);
    tr.localToWorld(t, x + D[(k + 1) % 4][0], y + D[(k + 1) % 4][1], q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], w, col[0], col[1], col[2], a);
  }
}

function lattice(rd, tr, b, time) {
  const live = b.parts.filter((x) => x.alive);
  if (live.length < 2) return;
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  const pulse = 0.2 + 0.12 * Math.sin(time * 7);
  for (let i = 0; i < live.length; i++) {
    const a = live[i], c = live[(i + 1) % live.length];
    tr.localToWorld(a.t, a.x, a.y, p);
    tr.localToWorld(c.t, c.x, c.y, q);
    rd.line3(p[0], p[1], p[2], q[0], q[1], q[2], 1, 0.5, 0.8, 1, pulse);
  }
}

function coreGlow(rd, tr, b, time, col) {
  const p = [0, 0, 0];
  const charging = b.boltAt > 0;
  const locked = charging && (b.boltAt - time < BOLT_LOCK);
  const pulse = locked ? 1 : charging ? 0.7 + 0.3 * Math.sin(time * 30) : 0.5 + 0.2 * Math.sin(time * 4);
  tr.localToWorld(b.t, b.x, b.y, p);
  rd.line3(p[0], p[1], p[2], p[0], p[1], p[2], locked ? 15 : charging ? 11 : 7,
    locked ? 1 : col[0], locked ? 1 : col[1] * 0.85, locked ? 0.9 : col[2], pulse);
}

const time4 = (game) => game.time;

// --- the dispatch ----------------------------------------------------------

export function updateWarden(b, dt, game) {
  b.flash = Math.max(0, b.flash - dt * 6);
  for (const p of b.parts) p.flash = Math.max(0, p.flash - dt * 6);
  (WARDENS[b.def.kind] || WARDENS.marionette).update(b, dt, game);
}

export function drawWarden(rd, b, track, time) {
  (WARDENS[b.def.kind] || WARDENS.marionette).draw(rd, b, track, time);
}

/** The escape pod: what flies away when the warden does not. */
export function drawPod(rd, pod) {
  const [x, y, z] = pod.world;
  rd.line3(x - 4, y - 3, z, x, y + 6, z, 1.8, 1, 0.85, 0.5, 1);
  rd.line3(x, y + 6, z, x + 4, y - 3, z, 1.8, 1, 0.85, 0.5, 1);
  rd.line3(x + 4, y - 3, z, x - 4, y - 3, z, 1.8, 1, 0.85, 0.5, 1);
  rd.line3(x, y - 3, z, x - pod.vel[0] * 0.14, y - 3 - pod.vel[1] * 0.14, z - pod.vel[2] * 0.14,
    1.2, 1, 0.6, 0.2, 0.6);
}
