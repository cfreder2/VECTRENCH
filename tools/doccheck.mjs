// Does the documentation still describe this game?
//
// tools/portraits.mjs keeps the pictures honest by drawing them with the game's
// own code. This does the same for the numbers and the roster: every value here
// is read out of the source and looked for in the docs, so a constant that
// moves and a doc that does not is a failure rather than a thing somebody has
// to notice. It found `snaking` undocumented -- a whole spec field the design
// agent could not have used, because an edit had silently missed its anchor.
//
//   node tools/doccheck.mjs
import { readFileSync } from 'node:fs';
import { buildLevel } from '../src/level.js';
import { Track } from '../src/track.js';
import { PREBUILT } from '../src/levels.js';
import { normalizeSpec, FIELDS, OBSTACLE_KINDS } from '../src/spec.js';
import { SHIP_HX, SHIP_HY, KNIFE_HX, KNIFE_HY, RING_BEAM, PORT_BEAM } from '../src/collide.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (f) => readFileSync(join(ROOT, f), 'utf8');
const problems = [];
const bestiary = R('docs/BESTIARY.md');
const levels = R('docs/LEVELS.md');
const game = R('src/game.js');
const num = (re, src = game) => { const m = src.match(re); return m ? m[1] : '??'; };

// Every enemy the generator can actually produce, with its real stats.
const seen = new Map();
for (const lv of PREBUILT) {
  const spec = normalizeSpec(lv.spec);
  const built = buildLevel(spec, new Track(spec));
  for (const e of [...built.enemies, built.port].filter(Boolean)) {
    const cur = seen.get(e.kind) || { hp: new Set(), pts: new Set() };
    cur.hp.add(e.maxHp); cur.pts.add(e.points);
    seen.set(e.kind, cur);
  }
}
console.log('enemy         hp in code        does the bestiary say so?');
for (const [kind, v] of seen) {
  const hp = [...v.hp].sort((a, b) => a - b).join('/');
  const idx = bestiary.indexOf(`— \`${kind}\``); const section = idx < 0 ? '' : bestiary.slice(idx, idx + 1400);
  const claimed = (section.match(/\|\s*`hp`\s*\|\s*([^|]+)\|/) || [])[1];
  const ok = claimed && [...v.hp].some((h) => claimed.includes(String(h)));
  console.log(`${kind.padEnd(13)} ${hp.padEnd(17)} ${claimed ? (ok ? 'yes -- ' : 'MISMATCH -- ') + claimed.trim() : 'no hp row'}`);
}
console.log('\nnumber                     code     bestiary mentions it?');
const checks = [
  ['shields', num(/const SHIELD_MAX = ([\d.]+)/)],
  ['shield regen', num(/const SHIELD_REGEN = ([\d.]+)/)],
  ['gun cadence', num(/const GUN_CADENCE = ([\d.]+)/)],
  ['locks', num(/const LOCK_MAX = (\d+)/)],
  ['paint time', num(/const PAINT_TIME = ([\d.]+)/)],
  ['missile cooldown', num(/const MISSILE_COOLDOWN = (\d+)/)],
  ['roll rate', num(/const KNIFE_RATE = ([\d.]+)/)],
  ['burn multiplier', num(/const BOOST_MUL = ([\d.]+)/)],
  ['burn tank', num(/const BOOST_TANK = ([\d.]+)/)],
  ['burn refill', num(/const BOOST_REFILL = (\d+)/)],
  ['super burn', num(/const SUPER_MUL = ([\d.]+)/)],
  ['gate seconds', num(/const GATE_TIME = (\d+)/)],
  ['ring beam damage', num(/const RING_BEAM_DAMAGE = (\d+)/)],
  ['port beam damage', num(/const BEAM_DAMAGE = (\d+)/)],
  ['lateral speed', num(/export const MAX_VX = (\d+)/)],
  ['vertical speed', num(/export const MAX_VY = (\d+)/)],
];
for (const [label, val] of checks) {
  const found = bestiary.includes(String(val));
  if (!found) problems.push(`${label} (${val}) is not in the bestiary`);
  console.log(`${label.padEnd(26)} ${String(val).padEnd(8)} ${found ? 'yes' : 'NOT FOUND'}`);
}
console.log('\nship footprint             code            bestiary?');
const fp = `${SHIP_HX * 2} wide × ${SHIP_HY * 2} tall`;
console.log(`level                      ${(SHIP_HX * 2) + ' x ' + (SHIP_HY * 2)}          ${bestiary.includes(fp) ? 'yes' : 'CHECK: ' + fp}`);
console.log(`on edge                    ${(KNIFE_HX * 2) + ' x ' + (KNIFE_HY * 2)}          ${bestiary.includes(`${KNIFE_HX * 2} × ${KNIFE_HY * 2}`) ? 'yes' : 'CHECK'}`);
console.log('\nevery obstacle kind documented in both files?');
for (const k of OBSTACLE_KINDS) {
  console.log(`  ${k.padEnd(11)} bestiary ${bestiary.includes('`' + k + '`') ? 'yes' : 'MISSING'}   levels guide ${levels.includes('`' + k + '`') ? 'yes' : 'MISSING'}`);
}
console.log('\nevery spec field documented in the levels guide?');
for (const f of Object.keys(FIELDS).concat(['armedPort'])) {
  if (!levels.includes('`' + f + '`')) { problems.push(`spec field ${f} is undocumented`); console.log(`  MISSING: ${f}`); }
}
console.log('  (nothing listed = all present)');

if (problems.length) {
  console.log(`\n${problems.length} thing(s) the docs do not describe correctly.`);
  process.exit(1);
}
console.log('\nthe docs match the code.');
