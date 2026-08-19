// Optional: compile prose into a level spec with Claude.
//
// The offline interpreter in nl.js handles the vocabulary it knows and always
// works. This path handles arbitrary prose -- metaphors, references, pacing
// described in prose rather than adjectives -- by asking a model to fill in the
// same spec the rest of the game already consumes. Nothing downstream can tell
// which front-end produced a spec.
//
// The SDK is imported lazily from an ESM CDN so the game stays a self-contained
// offline page unless the player actually turns this on. The key lives only in
// this browser's localStorage.

import { normalizeSpec, OBSTACLE_KINDS, FIELDS } from './spec.js';

const SDK_URL = 'https://esm.sh/@anthropic-ai/sdk@0.119.0';
const MODEL = 'claude-opus-5';
const KEY_STORE = 'vectrench.apikey';

export const getKey = () => {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
};

export const setKey = (k) => {
  try {
    if (k) localStorage.setItem(KEY_STORE, k);
    else localStorage.removeItem(KEY_STORE);
  } catch { /* private browsing; the key just will not persist */ }
};

// Structured outputs reject numeric bounds, so ranges are stated in the prompt
// and enforced by normalizeSpec on the way back in.
const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'length', 'width', 'depth', 'curviness', 'hilliness',
    'roughness', 'obstacles', 'kinds', 'turrets', 'wallguns', 'drones', 'seals', 'hue'],
  properties: {
    name: { type: 'string' },
    length: { type: 'number' },
    width: { type: 'number' },
    depth: { type: 'number' },
    curviness: { type: 'number' },
    hilliness: { type: 'number' },
    roughness: { type: 'number' },
    obstacles: { type: 'number' },
    kinds: { type: 'array', items: { type: 'string', enum: OBSTACLE_KINDS } },
    turrets: { type: 'number' },
    wallguns: { type: 'number' },
    drones: { type: 'number' },
    seals: { type: 'integer' },
    hue: { type: 'number' },
  },
};

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'seed', 'speed', 'finale', 'sections', 'notes'],
  properties: {
    name: { type: 'string' },
    seed: { type: 'integer' },
    speed: {
      type: 'object',
      additionalProperties: false,
      required: ['start', 'end'],
      properties: { start: { type: 'number' }, end: { type: 'number' } },
    },
    finale: { type: 'string', enum: ['port', 'none'] },
    sections: { type: 'array', items: SECTION_SCHEMA },
    notes: { type: 'string' },
  },
};

const SYSTEM = `You design levels for a vector-graphics rails shooter. The player flies a fixed
path at 300-500 units per second down a canyon trench. They tilt to move within the
cross-section, tap to shoot, and hold on a target to lock a missile.

The core tension: inside the trench you must dodge geometry; above the rim you are safe
from geometry but exposed to surface turrets. A "seal" is a bulkhead across the whole
trench that forces the player up over the rim, so seals and turrets are a pair -- a seal
with no turrets near it is free, and that is boring.

Translate the player's description into a sequence of sections, flown in order.

Field meanings and ranges (values outside these are clamped):
- length ${FIELDS.length.min}-${FIELDS.length.max}: track units. At ~380 u/s, 1800 units is roughly 5 seconds.
- width ${FIELDS.width.min}-${FIELDS.width.max}: trench half-width. 30 is a knife-edge slot, 62 normal, 125 cavernous.
- depth ${FIELDS.depth.min}-${FIELDS.depth.max}: rim height above the floor. Deeper means climbing out takes longer and costs more.
- curviness 0-1: lateral turning. 0 is dead straight, 1 is continuous hard turns.
- hilliness 0-1: vertical rise and fall of the whole canyon.
- roughness 0-1: surface panel detail and spires on the deck. Visual only.
- obstacles 0-1: density of blocking geometry in the trench.
- kinds: which obstacles appear. pylon = column from the floor. fang = spike from the
  ceiling down. gate = bulkhead with one window to thread. ring = circular aperture.
  stack = staggered half-height slabs, alternating sides.
- turrets 0-1: density of surface batteries, which only fire when the player is above the rim.
- wallguns 0-1: density of guns mounted on the trench walls, which fire when the player is below the rim.
- drones 0-1: density of flying enemy waves inside the trench.
- seals 0-6: full bulkheads in this section, spaced evenly. Each forces a climb over the rim.
- hue 0-1: colour wheel. 0 red, 0.08 orange, 0.33 green, 0.5 cyan, 0.62 blue, 0.79 violet.

Design guidance:
- Use 3 to 7 sections for a described run. One section is flat and dull.
- Build an arc: open and legible first so the player learns the controls, then escalate.
- Vary the axis of difficulty between sections. Two sections that are both "tighter and
  denser" feel like one long section.
- Put turrets near every seal.
- Honour what the player asked for, including when it is extreme. If they ask for
  claustrophobic, go to 30, not 45.
- Set finale to "port" unless they say they do not want an end target.
- notes: one short sentence on the intended arc. Keep it under 140 characters.`;

/**
 * Compiles prose into a spec with Claude.
 * Throws an Error with a human-readable message on any failure.
 */
export async function parseProseLLM(prose, { key, onStatus } = {}) {
  const apiKey = key || getKey();
  if (!apiKey) throw new Error('No API key set.');

  onStatus?.('loading sdk');
  let Anthropic;
  try {
    const mod = await import(/* @vite-ignore */ SDK_URL);
    Anthropic = mod.default ?? mod.Anthropic;
  } catch {
    throw new Error('Could not load the Claude SDK (offline or blocked). Use the offline parser.');
  }
  if (!Anthropic) throw new Error('Claude SDK loaded but exported nothing usable.');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  onStatus?.('designing');
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SPEC_SCHEMA },
      },
      messages: [{ role: 'user', content: `Design this level:\n\n${prose}` }],
    });
  } catch (err) {
    const status = err?.status;
    if (status === 401) throw new Error('API key rejected (401).');
    if (status === 429) throw new Error('Rate limited (429). Try again shortly.');
    if (status === 400) throw new Error(`Request rejected: ${err?.message ?? '400'}`);
    throw new Error(err?.message || 'Network error talking to the API.');
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined this request.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Response was cut off. Try a shorter description.');
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('No level came back.');

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The level came back malformed.');
  }

  const spec = normalizeSpec(raw);
  const report = [
    `${spec.sections.length} sections, ${spec.sections.reduce((a, s) => a + s.length, 0) | 0} units`,
    `designed by ${MODEL}`,
  ];
  if (raw.notes) report.push(String(raw.notes).slice(0, 160));
  for (const s of spec.sections) {
    report.push(`${s.name}: w${Math.round(s.width)} d${Math.round(s.depth)} ` +
      `cur${s.curviness.toFixed(1)} obs${s.obstacles.toFixed(1)} ` +
      `${s.kinds.join('/')}${s.seals ? ` seal x${s.seals}` : ''}`);
  }
  return { spec, report };
}
