# Making a level

Every level in VECTRENCH is the same object: a **spec**. Prose compiles into one,
a link carries one, the pre-built levels are ones written by hand. Nothing
downstream can tell which route a spec arrived by, so anything you can build one
way you can build the others.

```
prose  ─┐
JSON   ─┼──> spec ──> track.js ──> canyon geometry
link   ─┘            level.js ──> obstacles, guns, drones, bulkheads, port
```

There are three ways in. Start with prose, move to JSON when you want a level to
stay exactly as you tuned it.

---

## 1. Describe it

Type a description, press **BUILD**. The parser runs entirely in the browser and
is a fixed grammar rather than a guess-the-meaning machine: it reports every
phrase it recognized, so when a level is not what you meant you can see which
word did it.

**Prose is split into sections.** The split happens on sequence markers — `then`,
`and then`, `after that`, `followed by`, `next`, `finally`, `later`, plus
semicolons, newlines, `1.`/`2.` and bullets. Each segment becomes one section of
the run, flown in the order you wrote it.

> Start wide and open, **then** tighten into a deep twisting trench packed with
> hanging fangs, **finally** a narrow choke with an exhaust port.

That is three sections. Anything a segment does not mention is inherited from the
segment before it, so you only have to write what changes.

### The vocabulary

| What | Words | Result |
| --- | --- | --- |
| **Width** | `claustrophobic`, `needle`, `coffin` | 30 |
| | `tight`, `narrow`, `cramped`, `tunnel`, `slot`, `confined`, `choked` | 40 |
| | `snug` | 48 |
| | `tightens`, `narrows`, `closes in`, `chokes down` | 44 |
| | `wide`, `open`, `broad`, `roomy`, `spacious` | 88 |
| | `cavernous`, `enormous`, `vast`, `huge`, `massive`, `colossal` | 125 |
| **Depth** | `shallow`, `ditch`, `gully`, `scratch` | 66 |
| | `deep` | 152 |
| | `bottomless`, `abyssal`, `chasm`, `fathomless` | 210 |
| **Turning** | `straight`, `dead straight`, `linear`, `ruler` | 0.02 |
| | `lazy`, `sweeping`, `gentle curve`, `meandering` | 0.28 |
| | `winding`, `curving`, `curvy`, `bending` | 0.55 |
| | `twisty`, `serpentine`, `snaking`, `corkscrew` | 0.82 |
| | `hairpin`, `switchback`, `violent turns` | 1.0 |
| **Relief** | `flat`, `level`, `even` | 0.05 |
| | `rolling`, `undulating`, `wavy`, `billowing` | 0.5 |
| | `hilly`, `steep`, `plunging`, `diving`, `rollercoaster` | 0.82 |
| **Surface** | `smooth`, `clean`, `polished`, `bare`, `featureless` | 0.12 |
| | `detailed`, `greebled`, `industrial`, `mechanical`, `cluttered` | 0.8 |
| | `rough`, `jagged`, `broken`, `shattered`, `craggy` | 0.92 |
| **Obstacles** | `empty`, `clear`, `no obstacles`, `unobstructed` | 0 |
| | `sparse`, `scattered`, `a few`, `light`, `occasional`, `the odd` | 0.18 |
| | `some`, `moderate`, `a fair few` | 0.4 |
| | `dense`, `lots of`, `packed`, `heavy`, `thick`, `full of`, `forest of` | 0.75 |
| | `wall to wall`, `relentless`, `nonstop`, `unbroken`, `solid` | 1.0 |
| **Length** | `brief`, `short`, `quick` | 900 |
| | `long`, `extended`, `sustained` | 3000 |
| | `the whole way`, `throughout` | 3200 |
| | `endless`, `marathon`, `interminable` | 5000 |

**Obstacle kinds.** Naming one places it, and also raises obstacle density to at
least 0.5 — asking for stalactites and getting none would be a strange reading.

| Kind | Words | What it is |
| --- | --- | --- |
| `pylon` | `column`, `pillar`, `spire`, `tower`, `stalagmite`, `obelisk`, `girder` | Grows up from the floor |
| `fang` | `stalactite`, `icicle`, `tooth`, `hanging`, `dropper`, `pendant` | Hangs down from the rim |
| `gate` | `bulkhead`, `door`, `hatch`, `window`, `blast door`, `shutter` | A wall with one rectangular hole |
| `ring` | `iris`, `hoop`, `aperture`, `portal`, `eye` | A wall with one circular hole |
| `stack` | `slab`, `staggered`, `zigzag`, `chicane`, `alternating`, `stepped` | Alternating half-blocks, in pairs |
| `pinwheel` | `pinwheel`, `windmill`, `rotor`, `turnstile`, `propeller` | Three or five arms, turning |
| `cross` | `giant x`, `spinning cross`, `saltire`, `spinner` | A heavy four-armed X, turning |
| `press` | `crusher`, `press`, `vice`, `jaws`, `closing walls` | Two walls that close and open |
| `slider` | `slider`, `piston`, `shuttle`, `sweeper`, `hammer` | A block tracking side to side, or up and down |

**The last four move**, and that is the only difference: they are the same
axis-aligned boxes as everything else, in a frame that slides or turns. A
pinwheel is four still arms on a turning frame, a crusher is two still walls on
frames sliding toward each other. Collision transforms one query point into that
frame rather than transforming eight corners out of it, which is why a spinning
five-arm rotor costs no more to hit-test than a pylon.

Their phase comes from **where they are on the track**, not from when you happen
to arrive. Speed depends only on position, so arrival time is the same for every
player: a pinwheel presents one specific face to everyone, the audit knows which
face that is, and "there is a way through" stays a provable claim. A crusher
never closes past 26 units, and none of them reach the ceiling — over the top is
always the other answer.

**Enemies.** `turret`, `emplacement`, `flak`, `anti-air`, `cannon` put plain
guns on the surface. `gatling`, `chaingun`, `minigun`, `vulcan`, `autocannon`
put rotary cannon up there, and `missile battery`, `launcher`, `silo`, `rocket
battery`, `SAM site` put missile racks up there. `wall gun`, `gun port`,
`embrasure`, `pillbox` put guns inside the trench. `drone`, `fighter`,
`interceptor`, `swarm`, `squadron` send waves at you. Negations work:
`undefended`, `no guns`, `no drones`, `no gatlings`, `no missiles`.

All of them can be locked, so enemy density is also missile density: a section
that puts several guns within sight of each other is a section that hands the
player a salvo. The clusters the compiler makes on its own — a drone wave, the
cover fire it places around every bulkhead — are already shaped for that.

**Bulkheads.** `seal`, `sealed`, `walled off`, `blocked off`, `dead end`,
`forced over`, `no way through` place a full-height barrier. A count comes along
for the ride: `sealed three times`, `two bulkheads`, `sealed twice`.

Every bulkhead carries **control panels** — shoot them all out and it sinks into
the floor and you keep your altitude, which is the alternative to climbing into
the guns. `three control panels`, `1 panel`, or `no panels` to weld it shut so
that over the top is the only way. The count has to sit directly against the
word: `sealed twice with three panels` reads as three, because the general
"number before a word" search would otherwise find `twice` first.

**Colour.** `red`/`molten`/`lava`, `orange`/`amber`/`rust`, `yellow`/`gold`,
`green`/`toxic`/`acid`, `cyan`/`icy`/`glacial`, `blue`/`cobalt`,
`purple`/`violet`/`neon`, `white`/`chrome`/`steel`.

**Whole-run directives.** These apply to the level, not a section:

- Speed: `slow`, `fast`, `very fast`, `ludicrous`, `breakneck`
- Finale: `exhaust port`, `reactor`, `core`, `vent` add the port; `no port`,
  `just fly`, `free flight` leave the run open-ended
- Name: `called "SPINE"`, or put the name in quotes at the very start
- Seed: `seed 4211`

### Intensifiers and numbers

`very`, `extremely`, `brutally`, `insanely`, `absurdly` push a matched value 60%
further toward its limit. `slightly`, `barely`, `moderately`, `gently` pull it
halfway back to the default. They only modify the word right after them: in
`very tight twisty`, `very` applies to `tight`.

Explicit numbers beat adjectives entirely:

- `for 2000 units`, `1500 long`, `40 seconds` — section length
- `60 wide`, `48 across` — half-width
- `180 deep` — rim height
- `six turrets`, `4 drones`, `three wall guns` — read as a density hint

---

## 2. Write the spec

A spec is plain JSON, and it is what the pre-built levels in [`levels/`](../levels)
are. Writing one directly is the difference between a level that is *described*
and a level that is *tuned*: no parser sits between what you wrote and what you
fly, and the seed is pinned, so it is the same run every time.

```json
{
  "name": "SHAKEDOWN",
  "blurb": "Shown as the button's tooltip. Not part of the spec.",
  "seed": 4211,
  "speed": { "start": 250, "end": 330 },
  "finale": "port",
  "sections": [ { "...": "one object per section, flown in order" } ]
}
```

| Top-level | Range | Meaning |
| --- | --- | --- |
| `name` | 40 chars | Uppercased for display |
| `seed` | any integer | Fixes every random placement. Same seed, same level |
| `speed.start` | 120–700 | Units per second at the mouth |
| `speed.end` | 120–900 | Units per second at the end; it ramps between |
| `finale` | `port` \| `none` | `port` adds the exhaust port, which only missiles open |
| `sections` | 1–24 | The run, in order |

Each section:

| Field | Range | Default | Meaning |
| --- | --- | --- | --- |
| `name` | 32 chars | `section` | For your benefit; never shown in flight |
| `length` | 400–6000 | 2000 | Track units this section occupies |
| `width` | 26–150 | 62 | Trench **half**-width. 40 is tight; 110 is a plaza |
| `depth` | 50–240 | 118 | Rim height above the floor — how far the climb is |
| `curviness` | 0–1 | 0.4 | Lateral turning |
| `hilliness` | 0–1 | 0.35 | Vertical relief of the floor |
| `roughness` | 0–1 | 0.5 | Wall detail. Cosmetic; costs no fairness |
| `obstacles` | 0–1 | 0.4 | Rate, not a count — see below |
| `kinds` | list | `["pylon","fang"]` | Which of `pylon` `fang` `gate` `ring` `stack` may appear |
| `turrets` | 0–1 | 0.42 | Plain surface guns, above the rim |
| `gatlings` | 0–1 | 0.32 | Surface rotary cannon: spin up, then a stream of tracer |
| `batteries` | 0–1 | 0.28 | Surface missile racks. Density decides how many; the section's own value also decides how big, so a heavy section is where the twelve-tube ones appear |
| `wallguns` | 0–1 | 0.32 | Guns on the trench walls |
| `drones` | 0–1 | 0.3 | Fighter wave rate |
| `seals` | 0–6 | 0 | Bulkheads that force you over the rim |
| `panels` | 0–4 | 2 | Shootable control panels per bulkhead. 0 welds it shut |
| `hue` | 0–1 | 0.5 | 0 red, 0.14 gold, 0.33 green, 0.5 cyan, 0.62 blue, 0.79 violet |

**Everything is clamped on the way in.** A field out of range, of the wrong type,
or missing entirely is replaced with a legal value rather than rejected. That is
deliberate: a spec from a link, a typo, or a model can be strange, but it cannot
be unplayable.

### How long should a level be?

Long enough to have a shape, short enough that dying is cheap: **one to two
minutes**, which `node tools/levels.mjs` enforces. Length in units is the wrong
handle for that, because speed varies — a 30,000-unit run at 430 units a second
is a minute and a half, and the same track at 250 would be two. Write the
sections you want, run the tool, and scale them until the time is right.

As a starting point: six to eight sections of 3000–5500 units each.

### Densities are rates

`obstacles: 0.6` does not mean "six obstacles". It sets a spacing — roughly
`2500 / (0.12 + density * 6.2)` units between placements, jittered — so
lengthening a section makes it longer without making it different. Tune the feel
once, then set `length` freely.

The number that matters is not units, it is **seconds**, because that is what a
player experiences. At 400 units a second:

| `obstacles` | Gap | Feels like |
| --- | --- | --- |
| 0.15 | ~2400u | 6s — empty, which is what an opening section wants |
| 0.30 | ~1250u | 3s — read it, move, breathe |
| 0.50 | ~780u | 2s — busy |
| 0.75 | ~520u | 1.3s — hard |
| 1.00 | ~400u | 1s — the ceiling, and only worth it late in a run |

The shipped levels average one obstacle every 5.0s, 3.0s and 2.1s respectively,
and each of them opens far gentler than its own average.

### What the compiler will do to your section

These rules are why a level can be aggressive without being unfair, and why
what you author is sometimes not exactly what you get:

- **One bulkhead per 2600 units of section.** A 4000-unit section asking for two
  seals realizes one. Lengthen the section, or split the seals across two — the
  audit tells you which authored seals did not make it.
- **No bulkhead within 1200 units of the port.** The finale is a lock, not a wall.
- **No obstacle within 420 units of a bulkhead**, so the forced climb is never
  also a dodge. Guns are only kept 220 units clear — punishing that climb is the
  entire point of a bulkhead.
- **No obstacle within 240 units of another**, so you never meet an unavoidable
  stacked pair.
- **Nothing in the last 620 units before the port.**
- Two heavy emplacements are placed 1750 and 1050 units ahead of the port,
  whatever you asked for, so the lock is taught before it decides the run.
- Every bulkhead gets a gatling and a missile battery of its own on top of
  whatever the section asked for, because a forced climb with nothing waiting
  is not a decision. The battery's size leans on the section's `batteries`
  value, so a heavy section is where the twelve-tube ones stand.
- **The rim is never unwatched.** Every shipped section carries at least 0.22
  turrets, 0.26 gatlings and 0.2 batteries, because a stretch with an empty
  surface is a stretch where climbing out of the trench is free, and free is
  the one thing the surface must never be. Sustained flight above the rim kills
  in three to seven seconds depending on the level; a climb over a bulkhead and
  straight back down costs a tenth to a third of a shield.
- The track runs 1100 units past your last section, and the port sits 720 units
  into that run-out.

---

## 3. Add it to the game

`levels/*.json` is the source of truth, but the game cannot read a directory —
the single-file build has no directory to read. So the levels are compiled into
`src/levels.js`, which is checked in.

```bash
# 1. write it
$EDITOR levels/my-level.json

# 2. (optional) put it in the shelf order
$EDITOR tools/levels.mjs        # the ORDER array; unlisted levels sort to the end

# 3. compile it into the game
node tools/levels.mjs --sync

# 4. check it is flyable
node tools/levels.mjs

# 5. rebuild the single-file version
node tools/bundle.mjs
```

Step 4 is the one that matters. It reports, per level:

```
ok   SHAKEDOWN    75s   18000u  6 sections, 15 obstacles (one per 5.0s), 1/1 seals, 21 guns, reseed 40/40 clearable
```

- **`75s`** — how long the level takes to fly. Levels outside 60–135 seconds
  fail: under a minute is a demo, and much over two minutes means a death near
  the end costs more than it teaches.
- **`1/1 seals`** — realized versus authored. `3/4` means a bulkhead did not fit.
- **`reseed 40/40 clearable`** — the level is re-audited under 40 different seeds,
  because **RESEED** re-rolls the seed in play. A shape that only works on its
  own seed is a shape that will betray somebody.
- **`FAIL`** on any of those exits non-zero, so it is usable as a check:
  `node tools/levels.mjs && node tools/levels.mjs --check`.

`--check` verifies `src/levels.js` matches `levels/*.json`, which is the one
thing in this arrangement that can silently drift.

### What "clearable" actually means

[`tools/audit.mjs`](../tools/audit.mjs) is a fairness proof, not a smoke test. It
walks the compiled level and runs a forward reachability search over the trench
cross-section at every obstacle, using the ship's real lateral and vertical speed
limits and its real hitbox. If it says a level is clearable, a line through it
exists. If it says `BLOCKED`, no amount of skill gets through and the level is
wrong.

It also flags **tight** spots — obstacles where six or fewer cells of the
cross-section remain reachable. A few are drama. Many mean the run is a lottery.

---

## 4. Share it

**COPY LINK** puts the whole spec in the URL as `#lvl=<base64>`. There is no
server and nothing is uploaded: the level travels inside the link. Anyone opening
it gets exactly your spec, seed included, and can **RESEED** or edit from there.

`node tools/levels.mjs` prints the same hash for each pre-built level, which is
where the play links in the README come from.

---

## A worked example

Say you want: a fast, red, three-part descent that seals twice and ends at a
reactor.

**As prose:**

> A fast run down a wide molten red canyon with scattered columns, then a very
> tight twisting section packed with irises and wall guns, sealed twice with
> heavy turret cover, finally a short narrow choke into a reactor core.

**As a spec**, once you have flown that and want to keep it exactly:

```json
{
  "name": "DESCENT",
  "seed": 7,
  "speed": { "start": 330, "end": 470 },
  "finale": "port",
  "sections": [
    { "name": "mouth",  "length": 4000, "width": 96, "depth": 130,
      "curviness": 0.3, "hilliness": 0.35, "roughness": 0.5,
      "obstacles": 0.3, "kinds": ["pylon"],
      "turrets": 0.2, "wallguns": 0.1, "drones": 0.3, "seals": 0, "hue": 0.01 },

    { "name": "irises", "length": 5400, "width": 42, "depth": 170,
      "curviness": 0.82, "hilliness": 0.5, "roughness": 0.6,
      "obstacles": 0.7, "kinds": ["ring", "gate"],
      "turrets": 0.65, "wallguns": 0.5, "drones": 0.3, "seals": 2, "hue": 0.02 },

    { "name": "choke",  "length": 3200, "width": 34, "depth": 150,
      "curviness": 0.45, "hilliness": 0.3, "roughness": 0.45,
      "obstacles": 0.5, "kinds": ["ring"],
      "turrets": 0.35, "wallguns": 0.55, "drones": 0.2, "seals": 0, "hue": 0.0 }
  ]
}
```

Note `irises` is 5400 units long. It has to be, to hold two bulkheads — and the
three sections together have to add up to a minute or more of flying, which at
these speeds is a lot more track than it looks.
