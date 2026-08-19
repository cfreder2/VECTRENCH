// Realizes a spec into the things you actually collide with and shoot at.
//
// Densities in the spec are per-unit rates rather than counts, so a section can
// be lengthened or shortened without re-tuning its feel. Seals are the one
// authored-by-position element: each is a full bulkhead across the trench, and
// each pulls extra surface batteries toward it, because a forced climb over the
// rim is only interesting if the surface is defended.

import { rng, clamp } from './math.js';

// Obstacles must not crowd a bulkhead's approach, but guns near one are the
// point: they punish the climb the bulkhead forces. Hence two clearances.
const OB_CLEARANCE = 260;
const GUN_CLEARANCE = 150;
const MIN_OB_GAP = 110;      // no unavoidable stacked pairs
const SEAL_PITCH = 900;      // minimum track per seal in a section

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

/** Spacing in track units for a 0..1 density, or Infinity when off. */
const spacing = (density, base, gain) =>
  density <= 0.001 ? Infinity : base / (0.12 + density * gain);

export function buildLevel(spec, track) {
  const rand = rng(spec.seed);
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
      obstacles.push(obstacle(t, 46, 'seal', [[-hw - 60, hw + 60, -30, rim - 1]]));
      seals.push(t);
      // Cover fire for the forced climb.
      const n = 3 + Math.floor(rand() * 3);
      for (let j = 0; j < n; j++) {
        const side = j % 2 === 0 ? -1 : 1;
        enemies.push(enemy('turret', t - 360 + j * 200 + rand() * 90,
          side * (hw + 28 + rand() * 190), track.rim(t),
          { hp: 3, maxHp: 3, lockable: true, points: 250, cool: 0.5 + rand() }));
      }
    }
  });

  const nearSeal = (t) => seals.some((s) => Math.abs(s - t) < OB_CLEARANCE);
  const nearSealGun = (t) => seals.some((s) => Math.abs(s - t) < GUN_CLEARANCE);
  const nearPort = (t) => track.portT > 0 && t > track.portT - 620;

  // Per-section placement.
  spec.sections.forEach((sec, si) => {
    const start = track.bounds[si];
    const end = track.bounds[si + 1];

    // Trench obstacles.
    const og = spacing(sec.obstacles, 1000, 6.2);
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
      } else if (kind === 'ring') {
        const r = clamp(28 + rand() * 12, 22, hw - 12);
        const cx = (rand() * 2 - 1) * Math.max(0, hw - r - 12);
        const cy = clamp(30 + rand() * 46, r + 4, rim - r - 4);
        obstacles.push(obstacle(t, 14, 'ring', [
          [-hw - 30, cx - r, -30, rim + 14],
          [cx + r, hw + 30, -30, rim + 14],
          [cx - r, cx + r, cy + r, rim + 14],
          [cx - r, cx + r, -30, cy - r],
        ], { ring: { cx, cy, r } }));
      } else {
        // Staggered slabs: two half-blocks in quick succession, alternating.
        const low = rand() < 0.5;
        const mid = rim * 0.45;
        obstacles.push(obstacle(t, 18, 'stack',
          [low ? [-hw - 30, 5, -30, mid] : [-hw - 30, 5, mid, rim + 14]]));
        const t2 = t + 95;
        lastOb = t2;
        if (!nearSeal(t2) && !nearPort(t2)) {
          obstacles.push(obstacle(t2, 18, 'stack',
            [low ? [-5, hw + 30, mid, rim + 14] : [-5, hw + 30, -30, mid]]));
        }
      }
    }

    // Surface batteries.
    const tg = spacing(sec.turrets, 1200, 4.2);
    for (let t = start + tg * rand(); t < end; t += tg * (0.7 + rand() * 0.6)) {
      if (nearPort(t)) continue;
      const hw = track.halfWidth(t);
      enemies.push(enemy('turret', t, (rand() < 0.5 ? -1 : 1) * (hw + 24 + rand() * 200),
        track.rim(t), { hp: 3, maxHp: 3, lockable: true, points: 250, cool: 0.6 + rand() }));
    }

    // Wall guns inside the trench.
    const wg = spacing(sec.wallguns, 1400, 6.5);
    for (let t = start + wg * rand(); t < end; t += wg * (0.7 + rand() * 0.6)) {
      if (nearSealGun(t) || nearPort(t)) continue;
      const hw = track.halfWidth(t);
      const rim = track.rim(t);
      enemies.push(enemy('wallgun', t, (rand() < 0.5 ? -1 : 1) * (hw - 4),
        22 + rand() * (rim - 40),
        { hp: 2, maxHp: 2, points: 120, cool: 1 + rand() * 1.4 }));
    }

    // Drone waves.
    const dg = spacing(sec.drones, 1600, 2.6);
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
      enemies.push(enemy('emplacement', t, side * (hw - 14), track.rim(t) * 0.5,
        { hp: 14, maxHp: 14, lockable: true, points: 900, cool: 1.2 }));
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
