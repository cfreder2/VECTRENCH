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

Run the game from the local server and type the level you want into **DESIGN A
NEW LEVEL**. There is no vocabulary to learn and no grammar to satisfy: the
description goes to `claude`, running on your own machine on your own
subscription, and the agent reads this guide, writes the spec, and checks it.

```bash
node tools/serve.mjs          # then open http://localhost:8000/
```

Describe the shape of the run rather than the numbers: how it opens, how it
narrows, what stands in it, what shoots at you, what colour it is, and how it
ends. Pacing, references and metaphors are fine -- "a frozen cathedral", "the
last two minutes should feel like drowning" -- because a model is reading it,
not a parser.

The agent writes the level to `levels/custom/`, runs the flyability gate over
it, fixes whatever failed, and the level appears on the shelf when it passes.
It usually takes a minute or two. Nothing about this works on the published
page: there is no server there, and the button says so.

Everything below is what the agent is reading while it does that, and what you
would edit by hand to change a level afterwards.

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
| `curviness` | 0–1 | 0.4 | How far the canyon wanders off its line |
| `snaking` | 0–1 | 0 | How *often* it turns, as opposed to how far. At 0 the steering is noise and the canyon drifts; turn it up and it bends about its own line instead, tighter and harder as it rises — a river rather than a road. Maxing `curviness` alone gives the same number of bends, only wider; this is the one that makes switchbacks. Sharp bends cost sightline, so a snaking canyon wants to be a wide one |
| `hilliness` | 0–1 | 0.35 | Vertical relief of the floor |
| `roughness` | 0–1 | 0.5 | Wall detail. Cosmetic; costs no fairness |
| `obstacles` | 0–1 | 0.4 | Rate, not a count — see below |
| `kinds` | list | `["pylon","fang"]` | Which obstacles may appear — see the table below |
| `turrets` | 0–1 | 0.42 | Plain surface guns, above the rim |
| `gatlings` | 0–1 | 0.32 | Surface rotary cannon: spin up, then a stream of tracer |
| `batteries` | 0–1 | 0.28 | Surface missile racks. Density decides how many; the section's own value also decides how big, so a heavy section is where the twelve-tube ones appear |
| `wallguns` | 0–1 | 0.32 | Guns on the trench walls |
| `drones` | 0–1 | 0.3 | Fighter wave rate |
| `seals` | 0–6 | 0 | Bulkheads that force you over the rim. Authored by count, not by `kinds` — there is no `seal` you can put in a kinds list |
| `panels` | 0–4 | 2 | Shootable control panels per bulkhead. 0 welds it shut |
| `ringrate` | 0.06–1 | 0.2 | Seconds between one tentacle of a `ring` firing and the next. Lower is a faster sweep. The number standing at once does not change with it — four, always — so this slows the wall going round rather than thinning it |
| `slotgap` | 2–14 | 4 | Room each side of the ship in a `slot`, in units. The slit is built from the ship's own footprint plus this, so it is authored in the thing that matters. **Above about 4.5 an upright slit stops asking for the roll**: the ship is 14 wide flying level and 5 on edge, so a slit wide enough to give more room than that is a slit the level ship fits through. 4 is the widest that keeps a slot a slot |
| `music` | top level, not a section: which stage theme plays, by name from [`src/songs.js`](../src/songs.js). `bumblebee` (default) or `water`. A song is data — bars of note names, one token per sixteenth, `.` to hold and `-` to rest — plus a chord per bar for the arpeggio, a bass root per bar, a drum pattern and its own mix |
| `armedPort` | top level, not a section: `true` gives the finale the wall of beams described above. Default `false`. |
| `hue` | 0–1 | 0.5 | 0 red, 0.14 gold, 0.33 green, 0.5 cyan, 0.62 blue, 0.79 violet |

**[docs/BESTIARY.md](BESTIARY.md) pictures every one of these.** Each enemy and
obstacle is rendered from the game's own draw code, with what it does, what it
costs to kill, and every number behind it — so you can see what a section is
asking for before you ask for it.

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

### The obstacles

Eleven kinds. Four of them move, which is what makes them read as machinery
rather than as rock, and two of them talk to the ship's own controls.

| `kinds` entry | What stands there |
| --- | --- |
| `pylon` | A column from the floor. The plain one. |
| `fang` | Hanging from the roof, pointing down. |
| `gate` | A wall with one window cut in it; the window is the way through. |
| `ring` | An octagonal hoop with eight orange tentacles round it. The hoop is the way through, and the tentacles throw walls of light outward at the rock -- one after another clockwise from twelve, fading orange to yellow. They are a hazard to fly into rather than a gun that aims: fly the hole and they cost nothing, cut the corner on the way in and they cost about a fifth of a shield. |
| `stack` | Staggered slabs, alternating high and low. |
| `press` | A crusher that opens and closes on a cycle. Timing. |
| `slider` | A wall that slides across the trench and back. |
| `cross` | Four thick arms from the middle, turning. |
| `slot` | A wall with a slit in it, and the slits alternate. Upright ones only take the ship **on edge**; flat ones only take it **level**. See `slotgap` for how much room they leave A run of them in one section shares a single centre line, so a run is a straight line down which only your posture changes rather than a slalom you also have to roll through |
| `boostgate` | A green hexagonal hoop, and the only friendly thing in a canyon. Through the hole is three seconds of 1.5x on a timer of its own -- it neither spends the burn tank nor fills it, and a second hoop adds three more seconds. Not solid: it cannot hurt you, it does not stop shots, and the fairness audit does not treat it as an obstruction |
| `diamond` | A violet diamond-shaped hoop — the shape and color of the special weapon's meter. Through the hole is **+1 diamond** of special charge, stacking past the trickle's ceiling up to eight. Friendly the same way the boostgate is: not solid, does not stop shots, ignored by the fairness audit |
| `prism` | The rare one: a diamond hoop cycling through every color. Through the hole the special's meter **fills outright** to eight diamonds. Place at most one in a level, somewhere earned |
| `pinwheel` | Three or five thin arms from the middle, turning. Geometry, not a gun. |

### An armed port, if you want one

`finale: "port"` puts the exhaust port at the end of the run, and by default it
is what it looks like: a target. Set `"armedPort": true` at the top level of the
spec and it defends itself -- fourteen shafts around its rim firing one after
another around the ring, building a wall of beams in the three hundred units in
front of it that fades orange to yellow with a gap running round it.

The beams start at the shaft mouths rather than at the middle, so the ship's own
axis is the eye of it: come straight up the middle and the wall turns around
you, drift off and it costs you. Holding the axis takes nothing; thirty units
off it takes about half a shield on the way in. It is off unless a level asks,
because an exhaust port is a thing you shoot, not a thing that shoots.

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

# 4. check it is flyable -- every level, or just one file
node tools/levels.mjs
node tools/levels.mjs levels/my-level.json

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

## 4. Keep it

A level is a file. `levels/custom/` is where the agent writes them and it is
not compiled into the game, so those stay yours and stay local. To promote one
to a level everybody gets, move it up to `levels/`, add it to `ORDER` in
`tools/levels.mjs`, and run the sync -- section 3 above.

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
