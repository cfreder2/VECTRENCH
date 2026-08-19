// The pre-built levels: check them, publish them, and keep the game's copy of
// them honest.
//
// `levels/*.json` is where a pre-built level actually lives -- plain spec JSON,
// hand-editable, the same shape a link or the parser produces. The game cannot
// fetch them (the single-file build has no directory to fetch from), so this
// tool compiles them into `src/levels.js`, which is checked in and imported
// like any other module. That generated file is the only copy that can drift,
// so `--check` exists and CI-of-one is `node tools/levels.mjs --check`.
//
//   node tools/levels.mjs           audit each level and print its share link
//   node tools/levels.mjs --sync    regenerate src/levels.js from levels/*.json
//   node tools/levels.mjs --check   fail if src/levels.js is out of date
import { readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeSpec, encodeSpec, specLength } from '../src/spec.js';
import { Track } from '../src/track.js';
import { buildLevel } from '../src/level.js';
import { audit } from './audit.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DIR = join(ROOT, 'levels');
const OUT = join(ROOT, 'src', 'levels.js');

// Easiest first. Anything in levels/ that is not listed here still loads, but
// lands at the end -- the order is the shelf order in the game, so it is
// authored rather than alphabetical.
const ORDER = ['shakedown.json', 'bulkhead-run.json', 'reactor.json'];

const SWEEP = 40;   // seeds tried per level, because RESEED re-rolls in play

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

export const LEVELS = files.map((file) => {
  const raw = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  return {
    file,
    label: String(raw.name ?? file.replace(/\.json$/, '')).toUpperCase(),
    blurb: String(raw.blurb ?? ''),
    spec: normalizeSpec(raw),
  };
});

function generate() {
  const body = LEVELS.map((l) =>
    `  {\n` +
    `    label: ${JSON.stringify(l.label)},\n` +
    `    blurb: ${JSON.stringify(l.blurb)},\n` +
    `    spec: ${JSON.stringify(l.spec, null, 2).replace(/\n/g, '\n    ')},\n` +
    `  },`
  ).join('\n');

  return `// GENERATED FILE -- do not edit.
//
// Source of truth is levels/*.json; regenerate with \`node tools/levels.mjs --sync\`.
// These are the pre-built levels: authored specs rather than parsed prose, so
// they are exactly what was tuned and audited, seed included.

export const PREBUILT = [
${body}
];
`;
}

const args = process.argv.slice(2);
const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);

if (!isMain) {
  // Imported for LEVELS alone; the CLI below is not wanted.
} else if (args.includes('--sync')) {
  writeFileSync(OUT, generate());
  console.log(`wrote src/levels.js (${LEVELS.length} levels)`);
} else if (args.includes('--check')) {
  const want = generate();
  const have = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })();
  if (want !== have) {
    console.error('src/levels.js is out of date -- run: node tools/levels.mjs --sync');
    process.exit(1);
  }
  console.log('src/levels.js is in sync with levels/*.json');
} else {
  let failed = 0;
  for (const l of LEVELS) {
    const track = new Track(l.spec);
    const lv = buildLevel(l.spec, track);
    const r = audit(l.spec);

    // Authored seals are capped at one per SEAL_PITCH of section, and dropped
    // near the port. A level that asks for four bulkheads and gets three is not
    // broken, but it is not the level that was written down either.
    const asked = l.spec.sections.reduce((a, sec) => a + sec.seals, 0);
    const got = lv.seals.length;

    // The pre-built levels ship one fixed seed, but RESEED re-rolls it in play,
    // so the shape has to be clearable and not merely this roll of it.
    let reseedFail = 0;
    for (let seed = 1; seed <= SWEEP; seed++) {
      if (!audit({ ...l.spec, seed }).ok) reseedFail++;
    }

    const bad = !r.ok || got !== asked || reseedFail > 0;
    if (bad) failed++;
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${l.label.padEnd(14)} ${String(specLength(l.spec)).padStart(5)}u  ` +
      `${l.spec.sections.length} sections, ${lv.obstacles.length} obstacles, ` +
      `${got}/${asked} seals, ${lv.enemies.length} guns, reseed ${SWEEP - reseedFail}/${SWEEP} clearable`);
    if (r.blocked.length) console.log(`     blocked: ${JSON.stringify(r.blocked)}`);
    if (got !== asked) console.log(`     ${asked - got} authored seal(s) did not fit -- lengthen the section (one seal per 900u)`);
    console.log(`     #lvl=${encodeSpec(l.spec)}`);
  }
  if (failed) process.exit(1);
}
