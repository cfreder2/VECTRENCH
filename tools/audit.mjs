// Fairness audit: is there any flyable line through a compiled level, given the
// ship's actual lateral and vertical speed limits? Forward reachability DP over
// the cross-section at each obstacle.
//
// Run directly, this sweeps the prose examples and many seeds. `audit()` is also
// the check `tools/levels.mjs` runs over the pre-built levels, which is why it
// is exported and why the sweep below is guarded.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseProse } from '../src/nl.js';
import { EXAMPLES } from '../src/spec.js';
import { Track } from '../src/track.js';
import { buildLevel } from '../src/level.js';
// The real limits, not a copy of them: if the ship gets faster and this file
// does not hear about it, the audit keeps proving a harder game than shipped.
import { MAX_VX, MAX_VY } from '../src/game.js';

const SHIP_HX = 7, SHIP_HY = 5;
const NX = 49, NY = 37;

export function audit(spec) {
  const track = new Track(spec);
  const lv = buildLevel(spec, track);
  const obs = lv.obstacles.slice().sort((a, b) => a.t - b.t);
  if (!obs.length) return { ok: true, blocked: [], tight: [] };

  let reach = null, prevT = 0;
  const blocked = [], tight = [];

  for (const ob of obs) {
    const hw = track.halfWidth(ob.t);
    const rim = track.rim(ob.t);
    const ceil = rim + 92;
    const xs = [], ys = [];
    for (let i = 0; i < NX; i++) xs.push(-(hw - 8) + ((hw - 8) * 2 * i) / (NX - 1));
    for (let j = 0; j < NY; j++) ys.push(7 + ((ceil - 7) * j) / (NY - 1));

    // Free cells at this obstacle.
    const free = new Uint8Array(NX * NY);
    let freeCount = 0;
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NY; j++) {
        let hit = false;
        for (const [x0, x1, y0, y1] of ob.boxes) {
          if (xs[i] + SHIP_HX > x0 && xs[i] - SHIP_HX < x1 &&
              ys[j] + SHIP_HY > y0 && ys[j] - SHIP_HY < y1) { hit = true; break; }
        }
        if (!hit) { free[i * NY + j] = 1; freeCount++; }
      }
    }
    if (freeCount === 0) { blocked.push({ t: Math.round(ob.t), kind: ob.kind, reason: 'no free cell' }); return { ok: false, blocked, tight, track, lv }; }

    if (reach === null) {
      reach = free;
    } else {
      const T = Math.max(0.001, (ob.t - prevT) / track.speedAt(ob.t));
      const dxMax = MAX_VX * T, dyMax = MAX_VY * T;
      const next = new Uint8Array(NX * NY);
      let n = 0;
      for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
        if (!free[i * NY + j]) continue;
        let can = false;
        for (let a = 0; a < NX && !can; a++) {
          if (Math.abs(xs[a] - xs[i]) > dxMax) continue;
          for (let b = 0; b < NY; b++) {
            if (!reach[a * NY + b]) continue;
            if (Math.abs(ys[b] - ys[j]) > dyMax) continue;
            can = true; break;
          }
        }
        if (can) { next[i * NY + j] = 1; n++; }
      }
      if (n === 0) {
        blocked.push({ t: Math.round(ob.t), kind: ob.kind, reason: `unreachable (gap ${Math.round(ob.t - prevT)}u, ${T.toFixed(2)}s)` });
        return { ok: false, blocked, tight, track, lv };
      }
      if (n <= 6) tight.push({ t: Math.round(ob.t), kind: ob.kind, cells: n });
      reach = next;
    }
    prevT = ob.t;
  }
  return { ok: true, blocked, tight, track, lv };
}

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);

if (isMain) {
  for (const ex of EXAMPLES) {
    const { spec } = parseProse(ex.prose);
    const r = audit(spec);
    console.log(`${ex.label.padEnd(12)} clearable=${r.ok}` +
      (r.blocked.length ? `  BLOCKED: ${JSON.stringify(r.blocked)}` : '') +
      (r.tight.length ? `  tight(${r.tight.length}): ${JSON.stringify(r.tight.slice(0,4))}` : ''));
  }

  // Sweep many seeds: how often does the generator produce an unclearable level?
  console.log('\n--- seed sweep on TRENCH RUN shape ---');
  const { spec: base } = parseProse(EXAMPLES[0].prose);
  let bad = 0, tightTotal = 0;
  const reasons = {};
  for (let s = 1; s <= 60; s++) {
    const r = audit({ ...base, seed: s });
    if (!r.ok) { bad++; for (const b of r.blocked) reasons[b.reason.split('(')[0].trim()] = (reasons[b.reason.split('(')[0].trim()] || 0) + 1; }
    tightTotal += r.tight.length;
  }
  console.log(`unclearable: ${bad}/60   reasons: ${JSON.stringify(reasons)}   avg tight spots: ${(tightTotal/60).toFixed(1)}`);
}
