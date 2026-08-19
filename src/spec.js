// The level spec: the contract between "what a level is" and everything that
// realizes one.
//
// A spec is plain JSON. Natural language compiles *into* this; the track and
// level compilers read *out of* it. Keeping a single declarative form in the
// middle is what lets prose, the URL hash, hand-editing, and the built-in
// examples all be the same kind of thing.
//
// Every numeric field is clamped on the way in, so a spec from an untrusted
// source (a URL, a model, a typo) can be nonsense but never unplayable.

import { clamp } from './math.js';

// The last four move. They are the same axis-aligned boxes as the rest; what
// changes is the frame those boxes live in, which slides or turns over the run.
export const OBSTACLE_KINDS = [
  'pylon', 'fang', 'gate', 'ring', 'stack',
  'pinwheel', 'cross', 'press', 'slider',
];

/** Field ranges. Also the documentation the NL layer and the model are given. */
export const FIELDS = {
  length:    { min: 400,  max: 6000, def: 2000, unit: 'units of track' },
  width:     { min: 26,   max: 150,  def: 62,   unit: 'trench half-width' },
  depth:     { min: 50,   max: 240,  def: 118,  unit: 'rim height above floor' },
  curviness: { min: 0,    max: 1,    def: 0.4 },
  hilliness: { min: 0,    max: 1,    def: 0.35 },
  roughness: { min: 0,    max: 1,    def: 0.5 },
  obstacles: { min: 0,    max: 1,    def: 0.4 },
  turrets:   { min: 0,    max: 1,    def: 0.3 },
  gatlings:  { min: 0,    max: 1,    def: 0.15, unit: 'surface gatling guns' },
  batteries: { min: 0,    max: 1,    def: 0.12, unit: 'surface missile batteries' },
  wallguns:  { min: 0,    max: 1,    def: 0.32 },
  drones:    { min: 0,    max: 1,    def: 0.3 },
  seals:     { min: 0,    max: 6,    def: 0 },
  panels:    { min: 0,    max: 4,    def: 2, unit: 'shootable panels per bulkhead' },
  hue:       { min: 0,    max: 1,    def: 0.5 },
};

const num = (v, f) => (Number.isFinite(+v) ? clamp(+v, f.min, f.max) : f.def);

export function normalizeSection(raw = {}) {
  const kinds = Array.isArray(raw.kinds)
    ? raw.kinds.filter((k) => OBSTACLE_KINDS.includes(k))
    : [];
  return {
    name: String(raw.name ?? 'section').slice(0, 32),
    length: num(raw.length, FIELDS.length),
    width: num(raw.width, FIELDS.width),
    depth: num(raw.depth, FIELDS.depth),
    curviness: num(raw.curviness, FIELDS.curviness),
    hilliness: num(raw.hilliness, FIELDS.hilliness),
    roughness: num(raw.roughness, FIELDS.roughness),
    obstacles: num(raw.obstacles, FIELDS.obstacles),
    kinds: kinds.length ? kinds : ['pylon', 'fang'],
    turrets: num(raw.turrets, FIELDS.turrets),
    gatlings: num(raw.gatlings, FIELDS.gatlings),
    batteries: num(raw.batteries, FIELDS.batteries),
    wallguns: num(raw.wallguns, FIELDS.wallguns),
    drones: num(raw.drones, FIELDS.drones),
    seals: Math.round(num(raw.seals, FIELDS.seals)),
    panels: Math.round(num(raw.panels, FIELDS.panels)),
    hue: num(raw.hue, FIELDS.hue),
  };
}

export function normalizeSpec(raw = {}) {
  const sections = (Array.isArray(raw.sections) && raw.sections.length
    ? raw.sections
    : [{}]
  )
    .slice(0, 24)
    .map(normalizeSection);

  return {
    name: String(raw.name ?? 'UNTITLED RUN').slice(0, 40).toUpperCase(),
    seed: Number.isFinite(+raw.seed) ? (+raw.seed | 0) : 1337,
    speed: {
      start: clamp(+(raw.speed?.start ?? 300) || 300, 120, 700),
      end: clamp(+(raw.speed?.end ?? 430) || 430, 120, 900),
    },
    // A run with no finale just ends; 'port' adds the missile target.
    finale: raw.finale === 'none' ? 'none' : 'port',
    sections,
  };
}

/** Total track length, excluding the finale run-out the compiler appends. */
export const specLength = (spec) => spec.sections.reduce((a, s) => a + s.length, 0);

/** Round-trips through the URL hash so a level is a link. */
export function encodeSpec(spec) {
  const json = JSON.stringify(spec);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSpec(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return normalizeSpec(JSON.parse(new TextDecoder().decode(bytes)));
}

/**
 * Built-in levels. The first is the brief this game was built to: a long,
 * tightening trench run with sealed bulkheads and a port at the end.
 */
export const EXAMPLES = [
  {
    label: 'TRENCH RUN',
    prose:
      'Start wide and open for a bit to get your bearings, then tighten into a ' +
      'deep trench with columns and hanging fangs. Seal the trench once and put ' +
      'heavy turret cover on the surface. Then a long, very tight, twisting ' +
      'section with gates and irises and wall guns. Seal it twice more. ' +
      'Finish with a fast narrow choke and an exhaust port.',
  },
  {
    label: 'CATHEDRAL',
    prose:
      'A huge cavernous shallow canyon, almost straight, with enormous spires ' +
      'and lots of drones. Then a short claustrophobic tunnel section, ' +
      'extremely tight and very twisty, packed with irises. End with a port.',
  },
  {
    label: 'GAUNTLET',
    prose:
      'Very fast. Narrow and hilly the whole way, heavy staggered slabs and ' +
      'gates, wall guns everywhere, sealed four times. Glowing red. ' +
      'Ends with a reactor port.',
  },
  {
    label: 'FIRST LIGHT',
    prose:
      'A gentle wide winding canyon, shallow, a few scattered columns and ' +
      'almost no guns. Icy blue. No port, just fly it.',
  },
];
