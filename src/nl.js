// Natural language -> level spec, entirely in the browser.
//
// This is a deliberate grammar rather than a guess-the-meaning machine: prose is
// split into ordered segments on sequence markers ("then", "after that",
// "finally"), and each segment votes on the parameters of one section. Because
// the spec clamps everything, a misread produces a different level, never a
// broken one.
//
// Every recognized phrase is reported back to the player, so the interface can
// show what it actually understood instead of silently inventing a level.

import { clamp, lerp } from './math.js';
import { FIELDS, normalizeSpec } from './spec.js';

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, a: 1, an: 1, once: 1,
  twice: 2, thrice: 3, single: 1, double: 2, triple: 3, couple: 2, few: 3,
};

const AMPLIFY = /\b(?:very|extremely|insanely|super|really|absurdly|utterly|brutally|incredibly|impossibly|ridiculously|totally|completely|hugely|massively)\b/;
const DIMINISH = /\b(?:slightly|somewhat|mildly|fairly|barely|a bit|a little|kind of|sort of|moderately|gently|reasonably)\b/;

// param, phrase pattern, target value. Order matters only in that every match
// is applied; later matches on the same param win.
const RULES = [
  // --- trench half-width ---
  ['width', /\b(?:claustrophobic|needle|hairline|suffocating|coffin)\b/, 30],
  ['width', /\b(?:tight|narrow|cramped|tunnel|slot|close|confined|choked?)\b/, 40],
  ['width', /\b(?:snug|moderate width)\b/, 48],
  ['width', /\b(?:tighten(?:s|ing)?|narrow(?:s|ing)|closes? in|chokes? (?:down|in))\b/, 44],
  ['width', /\b(?:wide|open|broad|roomy|spacious)\b/, 88],
  ['width', /\b(?:cavernous|enormous|vast|colossal|immense|gigantic|huge|massive)\b/, 125],

  // --- rim height (how deep the trench is) ---
  ['depth', /\b(?:shallow|ditch|gully|gutter|scratch)\b/, 66],
  ['depth', /\b(?:deep)\b/, 152],
  ['depth', /\b(?:bottomless|abyss(?:al)?|chasm|fathomless|cavern deep)\b/, 210],

  // --- lateral curvature ---
  ['curviness', /\b(?:dead straight|straight|arrow[- ]?straight|linear|ruler)\b/, 0.02],
  ['curviness', /\b(?:lazy|sweeping|gentle curve|meandering)\b/, 0.28],
  ['curviness', /\b(?:winding|curving|curvy|bending|bendy|curved)\b/, 0.55],
  ['curviness', /\b(?:twisty|twisting|serpentine|snaking|writhing|corkscrew)\b/, 0.82],
  ['curviness', /\b(?:hairpin|switchback|violent turns?)\b/, 1],

  // --- vertical relief ---
  ['hilliness', /\b(?:flat|level|even)\b/, 0.05],
  ['hilliness', /\b(?:rolling|undulating|wavy|swelling|billowing)\b/, 0.5],
  ['hilliness', /\b(?:hilly|steep|plunging|diving|climbing|rollercoaster)\b/, 0.82],

  // --- surface detail ---
  ['roughness', /\b(?:smooth|clean|polished|bare|blank|featureless)\b/, 0.12],
  ['roughness', /\b(?:detailed|greebled?|industrial|mechanical|technical|cluttered|busy)\b/, 0.8],
  ['roughness', /\b(?:rough|jagged|broken|shattered|ragged|craggy)\b/, 0.92],

  // --- obstacle density ---
  ['obstacles', /\b(?:no obstacles|empty|clear|nothing in the way|unobstructed|obstacle[- ]free)\b/, 0],
  ['obstacles', /\b(?:sparse|scattered|a few|few|light|occasional|the odd|handful)\b/, 0.18],
  ['obstacles', /\b(?:some|moderate|a fair (?:few|amount))\b/, 0.4],
  ['obstacles', /\b(?:dense|lots of|plenty of|packed|heavy|thick|full of|loads of|littered|studded|forest of)\b/, 0.75],
  ['obstacles', /\b(?:wall[- ]to[- ]wall|relentless|brutal|nonstop|non[- ]stop|unbroken|solid)\b/, 1],

  // --- enemy density ---
  ['turrets', /\b(?:no turrets|undefended|no guns|unguarded|no defen[cs]es)\b/, 0],
  ['turrets', /\b(?:turret|batter(?:y|ies)|emplacement|surface gun|anti[- ]air|flak|ack[- ]ack|triple[- ]?a|defen[cs]es|cannon)\b/, 0.45],
  ['wallguns', /\b(?:wall ?gun|gun ?port|wall turret|side gun|embrasure|pill ?box|wall[- ]mounted)\b/, 0.5],
  ['gatlings', /\b(?:gatling|chain ?gun|mini ?gun|vulcan|auto ?cannon|rotary cannon|hot lead)\b/, 0.55],
  ['batteries', /\b(?:missile batter(?:y|ies)|missile rack|launcher|silo|sam site|missile site|rocket batter(?:y|ies)|seeker|heat[- ]seek(?:er|ing))\b/, 0.5],
  ['gatlings', /\b(?:no gatlings?|no chain ?guns?)\b/, 0],
  ['batteries', /\b(?:no missiles?|no launchers?|no batteries)\b/, 0],
  ['drones', /\b(?:no drones|no fighters)\b/, 0],
  ['drones', /\b(?:drone|fighter|interceptor|tie|enemy ship|bogey|swarm|squadron|wing of)\b/, 0.5],

  // --- length ---
  ['length', /\b(?:brief|short|quick|snap|momentary)\b/, 900],
  ['length', /\b(?:long|extended|drawn[- ]out|lengthy|sustained)\b/, 3000],
  ['length', /\b(?:the whole way|throughout|all the way)\b/, 3200],
  ['length', /\b(?:endless|interminable|marathon|forever)\b/, 5000],
];

// Obstacle kinds. A mention implies presence, so matching one also lifts density.
const KIND_RULES = [
  ['pylon', /\b(?:pylon|column|pillar|spire|tower|stalagmite|obelisk|monolith|post|mast|girder)(?:e?s)?\b/],
  ['fang', /\b(?:fang|stalactite|icicle|tooth|teeth|hanging|dangling|overhead spike|dropper|pendant)(?:e?s)?\b/],
  ['gate', /\b(?:gate|bulkhead|door|hatch|window|blast ?door|panel|shutter|barricade)(?:e?s)?\b/],
  ['ring', /\b(?:ring|iris|hoop|torus|aperture|portal|donut|doughnut|eye)(?:e?s)?\b/],
  ['stack', /\b(?:slab|stagger(?:ed)?|zigzag|zig[- ]zag|chicane|alternating|stepped|step|block)(?:e?s)?\b/],
  // The moving ones. Naming any of them is how a description asks for
  // machinery rather than rock.
  ['pinwheel', /\b(?:pinwheel|windmill|rotor|turnstile|fan blade|whirl(?:igig)?|propeller)(?:e?s)?\b/],
  ['cross', /\b(?:spinning cross|giant x|big x|saltire|spinner|rotating cross|crossbar)(?:e?s)?\b/],
  ['press', /\b(?:crusher|press|vice|vise|jaws|clamp|closing walls?|crushing walls?|masher|squeeze)(?:e?s)?\b/],
  ['slider', /\b(?:slider|piston|shuttle|sweeper|tracking block|sliding block|hammer)(?:e?s)?\b/],
];

const SEAL_RE = /\b(?:seal(?:ed|s|ing)?|walled off|blocked off|closed off|bulkhead across|barrier across|dead ?end|no way through|forced (?:up|over)|must (?:go|fly) (?:up|over)|completely blocks?)\b/;

const HUES = [
  [/\b(?:red|crimson|molten|lava|blood|scarlet|ember|hellish|infernal)\b/, 0.01],
  [/\b(?:orange|amber|rust|copper|bronze|sodium)\b/, 0.07],
  [/\b(?:yellow|gold(?:en)?|sulphur|sulfur|brass)\b/, 0.14],
  [/\b(?:green|toxic|acid|emerald|jade|radioactive|viridian)\b/, 0.33],
  [/\b(?:cyan|teal|aqua|ice|icy|frozen|glacial|turquoise)\b/, 0.5],
  [/\b(?:blue|cobalt|azure|sapphire)\b/, 0.62],
  [/\b(?:indigo|violet|purple|magenta|pink|neon|ultraviolet)\b/, 0.79],
  [/\b(?:white|silver|chrome|steel|monochrome|grey|gray|bone)\b/, 0.46],
];

const SPLIT_RE = /\b(?:and then|then|after that|after which|followed by|finally|next up|next|later on|later)\b|[;\n]|(?:\s|^)\d+[.)]\s|(?:^|\s)[-*•]\s/i;

const numberBefore = (text, re) => {
  const m = text.match(new RegExp(
    `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:\\w+\\s+){0,2}?${re.source}`, 'i'));
  if (!m) return null;
  return Number.isFinite(+m[1]) ? +m[1] : NUMBER_WORDS[m[1].toLowerCase()] ?? null;
};

const numberAfter = (text, re) => {
  const m = text.match(new RegExp(
    `${re.source}\\s+(?:\\w+\\s+){0,2}?(\\d+|${Object.keys(NUMBER_WORDS).join('|')})`, 'i'));
  if (!m) return null;
  return Number.isFinite(+m[1]) ? +m[1] : NUMBER_WORDS[m[1].toLowerCase()] ?? null;
};

/** Nudge a matched value further out or back toward the default. */
function applyIntensity(text, idx, param, value) {
  const f = FIELDS[param];
  if (!f) return value;
  const before = text.slice(Math.max(0, idx - 26), idx);
  // Adjacent only: in "very tight twisty", "very" modifies "tight".
  const adjacent = (re) => new RegExp(`(?:${re.source})\\s*$`).test(before);
  if (adjacent(AMPLIFY)) {
    const target = value >= f.def ? f.max : f.min;
    return lerp(value, target, 0.6);
  }
  if (adjacent(DIMINISH)) return lerp(value, f.def, 0.5);
  return value;
}

function parseSegment(text) {
  const found = {};
  const notes = [];
  const kinds = [];

  for (const [param, re, value] of RULES) {
    const m = text.match(re);
    if (!m) continue;
    found[param] = applyIntensity(text, m.index, param, value);
    notes.push(m[0].trim());
  }

  for (const [kind, re] of KIND_RULES) {
    const m = text.match(re);
    if (!m) continue;
    kinds.push(kind);
    notes.push(m[0].trim());
  }
  if (kinds.length) {
    found.kinds = kinds;
    // Naming an obstacle implies you want to meet some.
    if (found.obstacles === undefined || found.obstacles < 0.3) {
      found.obstacles = Math.max(found.obstacles ?? 0, 0.5);
    }
  }

  // Seals, with a count if one is given ("sealed three times", "two bulkheads").
  const sealM = text.match(SEAL_RE);
  if (sealM) {
    const n = numberAfter(text, SEAL_RE)
      ?? numberBefore(text, /times?/)
      ?? numberBefore(text, SEAL_RE)
      ?? 1;
    found.seals = clamp(Math.round(n), 1, FIELDS.seals.max);
    notes.push(`${found.seals}x sealed`);
  }

  // Colour.
  for (const [re, hue] of HUES) {
    const m = text.match(re);
    if (!m) continue;
    found.hue = hue;
    notes.push(m[0].trim());
    break;
  }

  // Explicit magnitudes override the qualitative reads.
  const units = text.match(/(\d{3,5})\s*(?:units?|long|metres?|meters?|m\b)/i);
  if (units) { found.length = +units[1]; notes.push(`${units[1]} long`); }
  const secs = text.match(/(\d{1,3})\s*(?:seconds?|secs?|s)\b/i);
  if (secs && !units) { found.length = +secs[1] * 360; notes.push(`${secs[1]}s`); }
  const wideN = text.match(/(\d{2,3})\s*(?:wide|across)/i);
  if (wideN) { found.width = +wideN[1]; notes.push(`width ${wideN[1]}`); }
  const deepN = text.match(/(\d{2,3})\s*deep/i);
  if (deepN) { found.depth = +deepN[1]; notes.push(`depth ${deepN[1]}`); }

  // Bulkhead control panels: an explicit count, or none at all.
  if (/\b(?:no panels?|sealed shut|no way to open|welded)\b/.test(text)) {
    found.panels = 0;
    notes.push('no panels');
  } else {
    // Adjacent only. The general "number before a word" search scans from the
    // left and would happily read "sealed twice with three panels" as two,
    // because "twice" is also a number and comes first.
    const pm = text.match(new RegExp(
      `(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(?:control\\s+)?panels?`, 'i'));
    if (pm) {
      const n = Number.isFinite(+pm[1]) ? +pm[1] : NUMBER_WORDS[pm[1].toLowerCase()];
      if (n !== undefined) {
        found.panels = clamp(Math.round(n), 0, 4);
        notes.push(`${found.panels} panels`);
      }
    }
  }

  for (const [param, re] of [['turrets', /turrets?|emplacements?/],
    ['drones', /drones?|fighters?|interceptors?/],
    ['wallguns', /wall ?guns?|gun ?ports?/],
    ['gatlings', /gatlings?|chain ?guns?|mini ?guns?/],
    ['batteries', /missile batter(?:y|ies)|launchers?|silos?/]]) {
    const n = numberBefore(text, new RegExp(re.source));
    if (n !== null && n > 0) {
      // A count is a rate hint: more named guns means a denser section.
      found[param] = clamp(n / 8, 0.08, 1);
      notes.push(`${n} ${param}`);
    }
  }

  return { found, notes, recognized: notes.length };
}

/** Global directives that are not per-section. */
function parseGlobals(text) {
  const g = { notes: [] };

  if (/\b(?:ludicrous|insane|blistering|breakneck|hypersonic|absurdly fast)\b/.test(text)) {
    g.speed = { start: 400, end: 600 }; g.notes.push('ludicrous speed');
  } else if (/\b(?:very fast|extremely fast|flat out|balls out|screaming)\b/.test(text)) {
    g.speed = { start: 370, end: 540 }; g.notes.push('very fast');
  } else if (/\bfast\b/.test(text)) {
    g.speed = { start: 330, end: 470 }; g.notes.push('fast');
  } else if (/\b(?:slow|gentle pace|relaxed|leisurely|sedate)\b/.test(text)) {
    g.speed = { start: 200, end: 270 }; g.notes.push('slow');
  }

  if (/\b(?:no port|no boss|no target|no finale|just fly|free ?flight|endless)\b/.test(text)) {
    g.finale = 'none'; g.notes.push('no finale');
  } else if (/\b(?:exhaust port|reactor|thermal exhaust|vent|core|port|boss|target at the end|final target)\b/.test(text)) {
    g.finale = 'port'; g.notes.push('port finale');
  }

  const named = text.match(/\b(?:called|named|titled)\s+["']?([\w '-]{2,32})["']?/i)
    || text.match(/^["']([^"']{2,32})["']/);
  if (named) { g.name = named[1].trim(); g.notes.push(`name "${g.name}"`); }

  const seed = text.match(/\bseed\s*[:=]?\s*(\d{1,9})\b/i);
  if (seed) { g.seed = +seed[1]; g.notes.push(`seed ${seed[1]}`); }

  return g;
}

/**
 * Compiles prose into a spec.
 * Returns { spec, report } where report explains what was understood.
 */
export function parseProse(prose) {
  const text = String(prose || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const report = [];
  if (!text) {
    return { spec: normalizeSpec({ name: 'EMPTY RUN' }), report: ['nothing to read'] };
  }

  const globals = parseGlobals(text);

  const rawSegments = text.split(SPLIT_RE).map((s) => (s || '').trim()).filter(Boolean);
  const parsed = [];
  for (const seg of rawSegments) {
    const r = parseSegment(seg);
    // A fragment that says nothing about shape is not a section. But keep it if
    // it is the only thing we have.
    if (r.recognized === 0 && seg.length < 24) continue;
    parsed.push({ seg, ...r });
  }
  if (parsed.length === 0) parsed.push({ seg: text, ...parseSegment(text) });

  // Carry values forward: "then tighter, then twisty" should keep the earlier
  // depth and colour rather than snapping back to defaults.
  const sections = [];
  let carry = {};
  parsed.forEach((p, i) => {
    const merged = { ...carry, ...p.found };
    // Seals and explicit lengths are per-section, never inherited.
    delete carry.seals;
    merged.name = `S${i + 1}`;
    if (p.found.seals === undefined) delete merged.seals;
    sections.push(merged);
    carry = { ...merged };
    delete carry.length;
    delete carry.seals;
    report.push(`${i + 1}. ${p.notes.length ? p.notes.join(', ') : 'default shape'}`);
  });

  // A stated progression with only one segment becomes a real arc.
  const progresses = /\b(?:tighten(?:s|ing)?|narrow(?:s|ing)?|closes? in|gets? (?:tighter|narrower|worse|harder)|escalat|ramps? up|builds? up|deteriorat)\b/.test(text);
  if (progresses && sections.length < 3) {
    const base = sections[0];
    const w0 = base.width ?? FIELDS.width.def;
    // Spread the requested seals over the later sections; piling them all into
    // the last one just loses the overflow to the compiler's spacing floor.
    const totalSeals = base.seals ?? 0;
    const share = [0, Math.floor(totalSeals / 3), totalSeals - Math.floor(totalSeals / 3)];
    const out = [];
    for (let i = 0; i < 3; i++) {
      const k = i / 2;
      out.push({
        ...base,
        name: `S${i + 1}`,
        width: lerp(Math.max(w0, 78), 34, k),
        obstacles: clamp((base.obstacles ?? 0.4) * (0.55 + k), 0, 1),
        curviness: clamp((base.curviness ?? 0.4) * (0.7 + 0.6 * k), 0, 1),
        seals: share[i],
        length: (base.length ?? FIELDS.length.def),
      });
    }
    sections.length = 0;
    sections.push(...out);
    report.push('progression detected: expanded into three tightening sections');
  }

  const spec = normalizeSpec({
    name: globals.name || deriveName(text),
    seed: globals.seed,
    speed: globals.speed,
    finale: globals.finale ?? 'port',
    sections,
  });

  if (globals.notes.length) report.unshift(globals.notes.join(', '));
  report.unshift(`${spec.sections.length} section${spec.sections.length === 1 ? '' : 's'}, ${Math.round(specTotal(spec))} units`);
  return { spec, report };
}

const specTotal = (spec) => spec.sections.reduce((a, s) => a + s.length, 0);

function deriveName(text) {
  const words = text.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return (words.slice(0, 3).join(' ') || 'untitled run').toUpperCase();
}

const STOP = new Set(['then', 'with', 'that', 'this', 'into', 'over', 'from', 'they',
  'have', 'been', 'were', 'will', 'your', 'start', 'starts', 'after', 'some', 'very',
  'lots', 'just', 'like', 'make', 'want', 'good', 'more', 'also', 'much', 'along',
  'while', 'about', 'their', 'there', 'where', 'which', 'what', 'when']);
