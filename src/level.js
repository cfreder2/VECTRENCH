// Realizes a spec into the things you actually collide with and shoot at.
//
// Densities in the spec are per-unit rates rather than counts, so a section can
// be lengthened or shortened without re-tuning its feel. Seals are the one
// authored-by-position element: each is a full bulkhead across the trench, and
// each pulls extra surface batteries toward it, because a forced climb over the
// rim is only interesting if the surface is defended.

import { rng, clamp } from './math.js';
import { SHIP_HY, KNIFE_HX } from './collide.js';

// Everything that shoots can be locked. The obstacles cannot -- they are the
// part of a level you fly around rather than the part you answer.
//
// Obstacles must not crowd a bulkhead's approach, but guns near one are the
// point: they punish the climb the bulkhead forces. Hence two clearances.
// Asymmetric on purpose. The approach to a bulkhead has to be clear air: you
// are climbing out of the trench at full vertical deflection and cannot also be
// dodging, and at 460 units a second even a second of run-up is 460 units of
// track. Past it, normal spacing resumes immediately -- the climb is over.
const OB_CLEARANCE_BEFORE = 1100;
const OB_CLEARANCE_AFTER = 420;
const GUN_CLEARANCE = 220;
const MIN_OB_GAP = 240;      // no unavoidable stacked pairs
export const SEAL_PITCH = 2600;   // minimum track per seal in a section
const PRESS_GAP = 26;      // narrowest a crusher is allowed to close to

function obstacle(t, dz, kind, boxes, extra) {
  return { t, dz, kind, boxes, hit: false, ...extra };
}

function enemy(kind, t, x, y, over) {
  return {
    kind, t, x, y,
    hp: 3, maxHp: 3, alive: true, lockable: false, points: 150,
    cool: 0.5, spin: 0, aim: 0, flash: 0,
    ...over,
  };
}

/**
 * How many tubes a missile battery carries, and what that costs to kill.
 *
 * The big ones are rare and deliberately unmissable: a twelve-tube battery is a
 * ship-sized thing on the skyline that empties itself at you. Density decides
 * how many batteries there are; this decides how frightening each one is, and
 * it leans harder as a section does.
 */
function batterySize(rand, menace) {
  const r = rand() * (0.8 + menace * 1.1);
  const tubes = r > 1.2 ? 12 : r > 0.9 ? 8 : r > 0.62 ? 6 : r > 0.34 ? 4 : 2;
  return {
    tubes,
    hp: 4 + tubes,
    points: 300 + tubes * 120,
  };
}

/**
 * Spacing in track units for a 0..1 density, or Infinity when off.
 *
 * The bases are large because the useful unit here is seconds, not units: at
 * 400 units a second, a 1000-unit gap is two and a half seconds, and anything
 * under about 400 arrives faster than a player can read it. Density picks a
 * rhythm between roughly three seconds and one; it does not pick a wall.
 */
const spacing = (density, base, gain) =>
  density <= 0.001 ? Infinity : base / (0.12 + density * gain);

export function buildLevel(spec, track) {
  const rand = rng(spec.seed);
  let slotFlip = 0;             // slits alternate upright and flat
  const obstacles = [];
  const enemies = [];
  const drones = [];
  const seals = [];

  // Seals first: everything else is placed around them.
  spec.sections.forEach((sec, si) => {
    if (sec.seals <= 0) return;
    const start = track.bounds[si];
    const count = Math.max(1, Math.min(sec.seals, Math.floor(sec.length / SEAL_PITCH)));
    for (let k = 0; k < count; k++) {
      const t = start + (sec.length * (k + 0.5)) / count;
      if (track.portT > 0 && t > track.portT - 1200) continue;
      const hw = track.halfWidth(t);
      const rim = track.rim(t);
      const seal = obstacle(t, 46, 'seal', [[-hw - 60, hw + 60, -30, rim - 1]]);
      seal.panelCount = sec.panels;
      // The face is wider than the trench opening; the renderer needs the
      // opening to know where markings will actually be seen.
      seal.hw = hw;
      obstacles.push(seal);
      seals.push(t);

      // Control panels on the face. Shooting every one drops the bulkhead into
      // the floor and you keep your altitude -- which is the other way through,
      // and the reason a bulkhead is a decision rather than a toll. With none
      // authored, the only way is over the top.
      // Laid out as a grid, not a run: a flat index spread across x while the
      // height alternated on k % 2 put four panels in a staircase, which reads
      // as misaligned rather than as deliberate.
      const cols = sec.panels <= 3 ? sec.panels : 2;
      const prows = Math.ceil(sec.panels / Math.max(1, cols));
      for (let k = 0; k < sec.panels; k++) {
        const c = k % cols;
        const r = Math.floor(k / cols);
        const px = cols === 1 ? 0 : (-0.3 + (0.6 * c) / (cols - 1)) * hw;
        const py = rim * (prows === 1 ? 0.46 : 0.34 + 0.3 * r);
        enemies.push(enemy('panel', t - 3, px, py, {
          hp: 2, maxHp: 2, lockable: true, points: 200, sealT: t, cool: 1e9,
        }));
      }

      // Cover fire for the forced climb: this is the moment the surface is
      // supposed to be the worst place in the level, so it gets the heavy kit.
      const n = 3 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        const side = j % 2 === 0 ? -1 : 1;
        enemies.push(enemy('turret', t - 360 + j * 200 + rand() * 90,
          side * (hw + 28 + rand() * 190), track.rim(t),
          { hp: 3, maxHp: 3, lockable: true, points: 250, cool: 0.5 + rand() }));
      }
      enemies.push(enemy('gatling', t - 120 + rand() * 240,
        (rand() < 0.5 ? -1 : 1) * (hw + 22 + rand() * 60), track.rim(t),
        { hp: 5, maxHp: 5, lockable: true, points: 400, cool: 0.4, wind: 0, burst: 0 }));
      const bb = batterySize(rand, 0.55 + sec.batteries * 0.45);
      enemies.push(enemy('battery', t - 500 + rand() * 260,
        (rand() < 0.5 ? -1 : 1) * (hw + 40 + rand() * 120), track.rim(t),
        { hp: bb.hp, maxHp: bb.hp, lockable: true, points: bb.points,
          tubes: bb.tubes, salvo: 0, salvoTimer: 0, cool: 0.9 + rand() }));
    }
  });

  const nearSeal = (t) =>
    seals.some((s) => t > s - OB_CLEARANCE_BEFORE && t < s + OB_CLEARANCE_AFTER);
  const nearSealGun = (t) => seals.some((s) => Math.abs(s - t) < GUN_CLEARANCE);
  const nearPort = (t) => track.portT > 0 && t > track.portT - 620;

  // Per-section placement.
  spec.sections.forEach((sec, si) => {
    const start = track.bounds[si];
    const end = track.bounds[si + 1];

    // Trench obstacles.
    const og = spacing(sec.obstacles, 2500, 6.2);
    let lastOb = -Infinity;
    for (let t = start + og * rand(); t < end; t += og * (0.72 + rand() * 0.56)) {
      if (nearSeal(t) || nearPort(t)) continue;
      if (t - lastOb < MIN_OB_GAP) continue;
      lastOb = t;
      const hw = track.halfWidth(t);
      const rim = track.rim(t);
      const kind = sec.kinds[Math.floor(rand() * sec.kinds.length) % sec.kinds.length];

      if (kind === 'pylon') {
        const boxes = [];
        const n = 1 + Math.floor(rand() * 2.4);
        for (let i = 0; i < n; i++) {
          const w = 11 + rand() * 15;
          const cx = -hw + 18 + rand() * (hw * 2 - 36);
          boxes.push([cx - w, cx + w, -12, 38 + rand() * (rim - 48)]);
        }
        obstacles.push(obstacle(t, 22 + rand() * 18, 'pylon', boxes));
      } else if (kind === 'fang') {
        const boxes = [];
        const n = 1 + Math.floor(rand() * 2.4);
        for (let i = 0; i < n; i++) {
          const w = 11 + rand() * 16;
          const cx = -hw + 18 + rand() * (hw * 2 - 36);
          boxes.push([cx - w, cx + w, 26 + rand() * (rim * 0.45), rim + 14]);
        }
        obstacles.push(obstacle(t, 22 + rand() * 18, 'fang', boxes));
      } else if (kind === 'gate') {
        const gw = clamp(24 + rand() * 16, 20, hw - 10);
        const gh = 32 + rand() * 20;
        const gx = (rand() * 2 - 1) * Math.max(0, hw - gw - 8);
        const gy = 14 + rand() * Math.max(8, rim - gh - 28);
        obstacles.push(obstacle(t, 16, 'gate', [
          [-hw - 30, gx - gw, -30, rim + 14],
          [gx + gw, hw + 30, -30, rim + 14],
          [gx - gw, gx + gw, gy + gh, rim + 14],
          [gx - gw, gx + gw, -30, gy],
        ], { window: { gx, gy, gw, gh } }));
      } else if (kind === 'slot') {
        // A wall with a slit in it, and the slit alternates: upright ones are
        // narrower than the ship is wide and only take it on edge, flat ones
        // are shallower than the ship is tall and only take it level. That is
        // the whole conversation between this and the roll.
        slotFlip++;
        const upright = slotFlip % 2 === 1;
        // The slit is the ship's own footprint plus a margin each side, so it
        // is authored in the units that matter -- how much room you have --
        // rather than in absolute width. It was five units of half width,
        // which is two and a half each side of a ship on edge, and that is
        // threading a needle at four hundred units a second.
        //
        // The ceiling on that margin is what keeps a slot a slot: an upright
        // slit has to stay narrower than the ship is wide when level, or it
        // stops asking for the roll at all. Half of (14 - 5) is 4.5.
        const gap = sec.slotgap;
        const gw = upright ? KNIFE_HX + gap : clamp(38 + rand() * 10, 20, hw - 12);
        const gh = upright ? 44 + rand() * 12 : SHIP_HY + gap;
        const gx = (rand() * 2 - 1) * Math.max(0, hw - gw - 14);
        const gy = clamp(26 + rand() * 40, gh + 8, Math.max(gh + 9, rim - gh - 12));
        obstacles.push(obstacle(t, 16, 'slot', [
          [-hw - 30, gx - gw, -30, rim + 14],
          [gx + gw, hw + 30, -30, rim + 14],
          [gx - gw, gx + gw, gy + gh, rim + 14],
          [gx - gw, gx + gw, -30, gy - gh],
        ], { window: { gx, gy: gy - gh, gw, gh: gh * 2 }, upright }));
      } else if (kind === 'boostgate') {
        // A hoop to fly through rather than around. The frame is four boxes
        // like every other aperture; the hexagon is only how it is drawn.
        const r = clamp(26 + rand() * 10, 20, Math.max(21, hw - 14));
        const cx = (rand() * 2 - 1) * Math.max(0, hw - r - 16);
        const cy = clamp(34 + rand() * 40, r + 6, Math.max(r + 7, rim - r - 6));
        obstacles.push(obstacle(t, 12, 'boostgate', [
          [-hw - 30, cx - r, -30, rim + 14],
          [cx + r, hw + 30, -30, rim + 14],
          [cx - r, cx + r, cy + r, rim + 14],
          [cx - r, cx + r, -30, cy - r],
        ], { ring: { cx, cy, r }, taken: false }));
      } else if (kind === 'ring') {
        const r = clamp(28 + rand() * 12, 22, hw - 12);
        const cx = (rand() * 2 - 1) * Math.max(0, hw - r - 12);
        const cy = clamp(30 + rand() * 46, r + 4, rim - r - 4);
        obstacles.push(obstacle(t, 14, 'ring', [
          [-hw - 30, cx - r, -30, rim + 14],
          [cx + r, hw + 30, -30, rim + 14],
          [cx - r, cx + r, cy + r, rim + 14],
          [cx - r, cx + r, -30, cy - r],
        ], { ring: { cx, cy, r }, beamRate: sec.ringrate }));
      } else if (kind === 'pinwheel' || kind === 'cross') {
        // Arms radiating from the trench centre, turning. Collision keeps the
        // arms as plain boxes and turns the frame instead, so a pinwheel costs
        // no more to hit-test than a pylon does.
        const arms = kind === 'cross' ? 4 : (rand() < 0.5 ? 3 : 5);
        const reach = Math.min(hw - 6, rim * 0.62);
        const thick = kind === 'cross' ? 13 : 9;
        const cy = rim * 0.5;
        // One rectangle per blade, carrying its own angle. Written as a chain
        // of five squares marching outward -- which is what it used to be --
        // an arm reads as a row of beads rather than a blade, and a five-armed
        // pinwheel costs twenty-five boxes and three hundred drawn lines.
        const boxes = [];
        for (let i = 0; i < arms; i++) {
          const a = (i / arms) * Math.PI * 2;
          boxes.push([-thick * 0.7, reach, cy - thick, cy + thick, a]);
        }
        obstacles.push(obstacle(t, 16, kind, boxes, {
          cx: 0, cy,
          anim: { rate: 0, phase: rand() * 6.283, spin: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.7) },
        }));
      } else if (kind === 'press') {
        // Two walls closing on the centre. They are two obstacles rather than
        // one with two boxes, because they travel in opposite directions and a
        // frame can only carry the pair one way -- and two counter-sliding
        // walls is exactly what a frame each expresses.
        //
        // The gap never shuts past what the ship can thread. A crusher with no
        // opening is just a wall that arrives late, and the run-out over the
        // top is the other answer: these stop at the rim, not at the ceiling.
        const open = Math.min(hw - 8, 48);
        const travel = Math.max(6, open - PRESS_GAP * 0.5);
        const rate = 0.85 + rand() * 0.5;
        const phase = rand() * 6.283;
        for (const side of [-1, 1]) {
          obstacles.push(obstacle(t, 20, 'press',
            side < 0 ? [[-hw - 40, -open, -30, rim + 6]] : [[open, hw + 40, -30, rim + 6]], {
              cx: 0, cy: 0,
              anim: { dx: side * travel, dy: 0, rate, phase, spin: 0 },
            }));
        }
      } else if (kind === 'slider') {
        // A block tracking side to side, or up and down.
        const vertical = rand() < 0.4;
        const w = 16 + rand() * 14;
        const h = 26 + rand() * 34;
        const amp = vertical ? Math.max(10, rim * 0.3) : Math.max(12, hw - w - 12);
        obstacles.push(obstacle(t, 18, 'slider', [
          [-w, w, rim * 0.45 - h, rim * 0.45 + h],
        ], {
          cx: 0, cy: rim * 0.45,
          anim: {
            dx: vertical ? 0 : amp, dy: vertical ? amp : 0,
            rate: 0.8 + rand() * 0.7, phase: rand() * 6.283, spin: 0,
          },
        }));
      } else {
        // Staggered slabs: two half-blocks in quick succession, alternating.
        const low = rand() < 0.5;
        const mid = rim * 0.45;
        obstacles.push(obstacle(t, 18, 'stack',
          [low ? [-hw - 30, 5, -30, mid] : [-hw - 30, 5, mid, rim + 14]]));
        // Far enough apart to be a chicane rather than a coin flip: at 450
        // units a second this is two thirds of a second to cross the trench.
        const t2 = t + 300;
        lastOb = t2;
        if (!nearSeal(t2) && !nearPort(t2)) {
          obstacles.push(obstacle(t2, 18, 'stack',
            [low ? [-5, hw + 30, mid, rim + 14] : [-5, hw + 30, -30, mid]]));
        }
      }
    }

    // Surface batteries.
    const tg = spacing(sec.turrets, 1750, 4.2);
    for (let t = start + tg * rand(); t < end; t += tg * (0.7 + rand() * 0.6)) {
      if (nearPort(t)) continue;
      const hw = track.halfWidth(t);
      enemies.push(enemy('turret', t, (rand() < 0.5 ? -1 : 1) * (hw + 24 + rand() * 200),
        track.rim(t), { hp: 3, maxHp: 3, lockable: true, points: 250, cool: 0.6 + rand() }));
    }

    // Surface gatlings: they sit close to the lip, because their job is to make
    // the few seconds above the rim expensive rather than to snipe.
    const gg = spacing(sec.gatlings, 1900, 5.0);
    for (let t = start + gg * rand(); t < end; t += gg * (0.7 + rand() * 0.6)) {
      if (nearPort(t)) continue;
      const hw = track.halfWidth(t);
      enemies.push(enemy('gatling', t, (rand() < 0.5 ? -1 : 1) * (hw + 18 + rand() * 90),
        track.rim(t), {
          hp: 5, maxHp: 5, lockable: true, points: 400,
          cool: 0.8 + rand() * 1.2, wind: 0, burst: 0,
        }));
    }

    // Surface missile batteries.
    const bg = spacing(sec.batteries, 2300, 4.0);
    for (let t = start + bg * rand(); t < end; t += bg * (0.7 + rand() * 0.6)) {
      if (nearPort(t)) continue;
      const hw = track.halfWidth(t);
      const b = batterySize(rand, sec.batteries);
      enemies.push(enemy('battery', t, (rand() < 0.5 ? -1 : 1) * (hw + 34 + rand() * 150),
        track.rim(t), {
          hp: b.hp, maxHp: b.hp, lockable: true, points: b.points,
          tubes: b.tubes, salvo: 0, salvoTimer: 0,
          cool: 1.4 + rand() * 1.6,
        }));
    }

    // Wall guns inside the trench.
    const wg = spacing(sec.wallguns, 2600, 6.5);
    for (let t = start + wg * rand(); t < end; t += wg * (0.7 + rand() * 0.6)) {
      if (nearSealGun(t) || nearPort(t)) continue;
      const hw = track.halfWidth(t);
      const rim = track.rim(t);
      enemies.push(enemy('wallgun', t, (rand() < 0.5 ? -1 : 1) * (hw - 4),
        22 + rand() * (rim - 40),
        { hp: 2, maxHp: 2, lockable: true, points: 120, cool: 1 + rand() * 1.4 }));
    }

    // Drone waves.
    const dg = spacing(sec.drones, 2800, 2.6);
    for (let t = start + dg * rand(); t < end; t += dg * (0.7 + rand() * 0.6)) {
      if (nearPort(t)) continue;
      drones.push({ t, n: 1 + Math.floor(rand() * 3), spawned: false });
    }
  });

  // Two heavy emplacements ahead of the port, to teach the lock before it counts.
  if (track.portT > 0) {
    for (const off of [1750, 1050]) {
      const t = track.portT - off;
      if (t < 400) continue;
      const hw = track.halfWidth(t);
      const side = off === 1750 ? -1 : 1;
      // Bolted to the trench wall, not standing on anything, so it is drawn
      // lying on its side with the wide base against the rock.
      enemies.push(enemy('emplacement', t, side * (hw - 4), track.rim(t) * 0.5,
        { hp: 14, maxHp: 14, lockable: true, points: 900, cool: 1.2, mount: 'wall' }));
    }
  }

  const port = track.portT > 0
    ? enemy('port', track.portT, 0, track.rim(track.portT) * 0.44,
      { hp: 1, maxHp: 1, lockable: true, points: 5000, iris: 0 })
    : null;

  obstacles.sort((a, b) => a.t - b.t);
  enemies.sort((a, b) => a.t - b.t);
  drones.sort((a, b) => a.t - b.t);
  return { obstacles, enemies, drones, port, seals };
}
