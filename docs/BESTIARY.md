# The Bestiary

Everything in the canyon that is not rock: what it is called, what it looks
like, what it does to you, and every number that decides how it behaves.

Each picture is rendered by `tools/portraits.mjs`, which imports `drawEnemies`,
`drawObstacles` and `drawShip` straight out of [`src/entities.js`](../src/entities.js)
and points a camera at them. Nothing here is drawn by hand, so nothing here can
quietly stop being true — change a shape and re-run it:

```bash
node tools/portraits.mjs          # all of them, into docs/assets/
node tools/portraits.mjs turret   # just the ones whose id matches
```

---

## The roster

**Bad guys** — things with hit points, which shoot at you, which you can shoot
and lock. The name in `code` is the `kind` string. That string is the identity:
`level.js` places on it, `game.js` picks a firing routine on it, `entities.js`
picks a shape on it. Nothing else is the name.

| | Name | `kind` | Lives | Fires | Spawned by |
| --- | --- | --- | --- | --- | --- |
| <img src="assets/turret.png" width="130"> | **Turret** | `turret` | On the rim | Only when you break the rim | `turrets` |
| <img src="assets/gatling.png" width="130"> | **Gatling** | `gatling` | On the rim, near the lip | Spins up, then a stream | `gatlings` |
| <img src="assets/battery.png" width="130"> | **Battery** | `battery` | On the rim, set back | A rack of homing missiles | `batteries` |
| <img src="assets/wallgun.png" width="130"> | **Wall gun** | `wallgun` | On the trench wall | Only when you stay *low* | `wallguns` |
| <img src="assets/drone.png" width="130"> | **Drone** | `drone` | In the trench, moving | Closes and shoots | `drones` |
| <img src="assets/emplacement.png" width="130"> | **Emplacement** | `emplacement` | In the trench, near the port | Always | automatic, before the port |
| <img src="assets/panel.png" width="130"> | **Panel** | `panel` | On a bulkhead face | Never — it is a switch | `panels`, per `seals` |
| <img src="assets/port.png" width="130"> | **Port** | `port` | The end of the run | Only if the level arms it | `finale: "port"`, `armedPort` |

**The ship** — the only thing on your side.

| | Name | Notes |
| --- | --- | --- |
| <img src="assets/ship.png" width="130"> | **Interceptor** | One hull, two wingtip cannons, eight missile locks |

**Obstacles** — no hit points, cannot be shot, cannot be locked. You fly around
them or you do not. They are listed in full [further down](#obstacles).

`pylon` · `fang` · `gate` · `slot` · `ring` · `boostgate` · `stack` · `press` ·
`slider` · `cross` · `pinwheel` · `seal`

---

## How a bad guy is put together

Every enemy is one object, built by the same factory in
[`level.js`](../src/level.js), and every field on it is an argument you can set
per instance:

```js
enemy('turret', t, x, y, { hp: 3, maxHp: 3, lockable: true, points: 250, cool: 0.6 })
```

### Fields every enemy has

| Field | Type | What it means |
| --- | --- | --- |
| `kind` | string | Which one it is. Drives shape, firing routine, hit radius, everything |
| `t` | units | Where along the track it stands. 0 is the start line |
| `x` | units | Across the trench. 0 is the centre line, negative is one wall, positive the other. Beyond `±halfWidth` is on the surface |
| `y` | units | Height above the trench floor. `rim` is the lip |
| `hp` / `maxHp` | number | Gun hits to kill — the cannons do exactly 1 each. A missile does **8**, so anything above that takes two, or one and a few seconds of the gun |
| `points` | number | Score for killing it |
| `cool` | seconds | Time until it may fire again. Set at build time so a cluster does not fire in lockstep |
| `lockable` | bool | Whether the crosshair can paint it. False means missiles will not go near it |
| `alive` | bool | Cleared on death; a dead enemy is skipped, not removed |
| `aim`, `spin`, `flash` | — | Written every frame. Barrel angle, idle rotation, white hit-flash |
| `los` | 0–1 | How much of it the rock is *not* hiding. Faded rather than culled, so breaking the rim is a reveal |
| `world` | vec3 | Cached world position, written by the targeting pass |

### Size and colour are not arguments

Two things you might expect to be tunable are not, on purpose.

**Size** is baked into each draw function — a turret's drum is `R = 9`, an
emplacement's is `R = 17`, a wall gun's plate is `R = 9`. The one exception is
the battery, which is genuinely sized by its `tubes` count, because how big it
looks on the skyline *is* the warning about how much is about to be fired at
you.

**Colour** is derived, never authored. Every gun runs through one line in
[`entities.js`](../src/entities.js):

```js
hsv(0.02 + hurt * 0.02, 0.85 - flash * 0.85, 1, col)
```

so all of them are the same hostile red-orange, they shift as they take damage
(`hurt = 1 - hp / maxHp`), and they go white for a frame when hit. That is the
whole colour language: **red-orange is a thing that shoots**, cool blue is
machinery that only crushes you, green is the one thing that helps. A section's
`hue` field colours the *canyon*, not the things standing on it.

---

## The bad guys

### Turret — `turret`

<img src="assets/turret.png" width="420">

A hexagonal drum on the surface with a short barrel that swings to track you.
The plainest thing in the game, and the most numerous. It **only fires at a ship
that has broken the rim**, which is the deal the whole level is built on: the
trench is cover, and the moment you climb out of it the skyline answers.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 3 | Three cannon hits |
| `points` | 250 | |
| shape | 6-sided drum, R 9, 8 tall | It has *height*: drawn as one flat ring it was a horizontal disc, and you fight these from the rim looking along the surface, where a horizontal disc is a line |
| `cool` | `0.6 + rand()` | Initial delay, so a row of them staggers |
| reload | 0.85 s × 0.75–1.35 | Jittered per shot |
| bolt speed | 520 u/s | Leads your ship by 0.85 of its velocity |
| damage | 12 | Of 100 shields |
| engages | `exposed`, ahead < 940, behind > −60 | |
| hit radius | 13 | |
| shape | `R = 9`, 6 sides | Barrel reaches `R * 1.1` |

**Placement.** Density `turrets` (0–1, default 0.42) → one every
`1750 / (0.12 + turrets * 4.2)` units. Stands at `x = ±(halfWidth + 24 + rand() * 200)`,
`y = rim`. Every bulkhead additionally pulls 3–5 of them to within ±450 units,
as cover fire for the climb it forces.

---

### Gatling — `gatling`

<img src="assets/gatling.png" width="420">

A six-barrel rotary cannon on a box mount, sitting close to the lip. It **spins
up in plain sight before it fires** — the barrels turn faster, the muzzle
brightens, hot air rises off it — and that 0.55 seconds is the only warning you
get. It is deliberately long enough to duck back under the rim, which is the
decision the surface exists to keep asking. Individual rounds are cheap;
standing in the stream is not.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 5 | |
| `points` | 400 | |
| `wind` | 0–1 | Spin-up state. Climbs at `1 / 0.55` per second while it wants to fire, falls at 1.1 |
| `barrel` | radians | Barrel rotation, `2 + wind * 26` rad/s — the visible tell |
| cadence | 0.04 s | 25 rounds a second, once wound |
| bolt speed | 700 u/s | Drawn long and pale as tracer |
| damage | 6 | Per round |
| spread | 0.78 | Scatter, so the stream connects without being hitscan |
| engages | `exposed`, ahead < 1020, behind > −160 | |
| shape | mount 18 × 14 × 7, 6 barrels at `R = 5.2`, reach 15 | |

**Placement.** Density `gatlings` (default 0.32) → one every
`1900 / (0.12 + gatlings * 5.0)` units, at `x = ±(halfWidth + 18 + rand() * 90)`,
`y = rim`. Close to the lip on purpose: its job is to make the seconds above the
rim expensive, not to snipe. **Every bulkhead gets one of its own.**

---

### Battery — `battery`

<img src="assets/battery.png" width="420">

A missile deck: a chamfered hull on the skyline with a grid of vertical launch
cells in it, one per tube, a lit cell for every missile still loaded and a mast
so it has a silhouette at distance. It empties the whole rack at you one tube at
a time, 0.11 seconds apart, so twelve missiles arrive as a stream you have to
keep answering rather than one wall you either dodge or do not.

The missiles are heat-seekers that out-run the ship. They can be **shot down**
(+40 each) and they **die on rock**, so a rack emptied at you has several
answers — none of which is outflying it.

<img src="assets/battery-2.png" width="300">

*The two-tube version. Same object, different `tubes`, and the deck grows with it.*

| Argument | Value | Meaning |
| --- | --- | --- |
| `tubes` | 2, 4, 6, 8 or 12 | Missiles per rack. Also sets hull length, deck width, mast height |
| `hp` | `4 + tubes` | 6 to 16 |
| `points` | `300 + tubes * 120` | 540 to 1740 |
| `salvo` | int | Tubes left in the current rack. Non-zero means mid-launch and it will finish regardless of what you do |
| `salvoTimer` | seconds | 0.11 between tubes |
| reload | 3.2 s × 0.85–1.25 | After a rack empties |
| engages | `exposed`, ahead < 1600, behind > −420 | The longest reach of anything |
| ≥ 6 tubes | alarm + "`N` INBOUND" | |

**The missile** (`fireSeeker`): launches at 300 u/s straight up out of the cell,
accelerates at 265 to a top speed of **640**, turn rate 2.05 rad/s, 7-second
life, 0.35 s before it arms. Damage **26**. It is faster than you and slower to
turn than you, so it is beaten by flying, not by running.

**Placement.** Density `batteries` (default 0.28) → one every
`2300 / (0.12 + batteries * 4.0)` units, at `x = ±(halfWidth + 34 + rand() * 150)`,
`y = rim`. The section's `batteries` value *also* decides how big each one is —
`batterySize()` rolls `rand() * (0.8 + menace * 1.1)` and steps 12 / 8 / 6 / 4 /
2 — so a heavy section is where the twelve-tube ones live. Every bulkhead gets
one, rolled at a raised menace of `0.55 + batteries * 0.45`.

---

### Wall gun — `wallgun`

<img src="assets/wallgun.png" width="420">

A plate bolted flush to the trench wall with a dome bulging out of it and a
barrel out of the dome. It is the mirror image of everything on the surface: it
**only fires at a ship that is still down in the trench**. Between the wall guns
below and the batteries above there is no altitude that is free.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 2 | The most fragile gun |
| `points` | 120 | |
| `cool` | `1 + rand() * 1.4` | |
| reload | 1.7 s × 0.75–1.35 | The slowest of the light guns |
| bolt speed | 520 u/s | |
| damage | 12 | |
| engages | **not** `exposed`, ahead < 620, behind > 30 | Short reach |
| hit radius | 11 | |
| shape | plate `R = 9`, dome 0.92 R, barrel to 1.9 R | Dome faces the trench centre |

**Placement.** Density `wallguns` (default 0.32) → one every
`2600 / (0.12 + wallguns * 6.5)` units, mounted at `x = ±(halfWidth − 4)`,
`y = 22 + rand() * (rim − 40)` — anywhere up the wall. Suppressed within 220
units of a bulkhead, where the fight is supposed to be overhead.

---

### Drone — `drone`

<img src="assets/drone.png" width="420">

The only enemy that moves. A blunt delta with a bright core, spawned in waves
ahead of you, weaving as it comes. It advances **at 42% of your speed** — which
means it is closing at 58% of it, and a wave you ignore arrives whether or not
you were interested.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 2 | |
| `points` | 200 | |
| `cool` | `0.7 + h * 1.1` | Hashed off the wave, so a trio does not volley |
| reload | 1.5 s × 0.75–1.35 | |
| bolt speed | 520 u/s | |
| damage | 12 | |
| engages | ahead < 520, behind > 20 | Regardless of your altitude |
| advance | `speed * 0.42` | |
| weave | ±46 u/s across, ±34 u/s vertical, `phase` at 1.7 rad/s | Clamped inside the trench |
| hit radius | 11 | |
| shape | delta, `R = 8` | |

**Placement.** Density `drones` (default 0.3) → a wave every
`2800 / (0.12 + drones * 2.6)` units. Each wave is **1–3 drones**, 34 units
apart, spawned when you are within 950 units and cleared 90 units behind you.

---

### Emplacement — `emplacement`

**The one thing a single lock will not kill.** That is the whole point of it:
killing outright meant it died 697 units out, having fired eight shells from
maximum range and landed none of them — not a threat, because it was never
alive while you were close. Spend the second missile, or finish it with the gun,
or accept the 19 damage it does to you on the way past.


<img src="assets/emplacement.png" width="420">

The turret's big brother: eight sides instead of six, nearly twice the radius,
and it stands *inside* the trench at half rim height rather than on the surface.
There are exactly two per level and you cannot author them — they are placed
1750 and 1050 units before the port, to teach you the missile lock while it is
still only expensive to get wrong.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 14 | Fourteen cannon hits, or **two missiles** — or one missile and six cannon hits. It is the only thing in the trench that survives a lock |
| fire | 3 heavy shells 0.17 s apart, then 1.15 s | 19 each, at 560 u/s |
| missile | one per pass, from 560 units | 26. Slower and blunter than a battery's — a trench is not open air |
| shape | 8-sided drum, R 17, 15 tall | Mounted on a wall rather than standing on the floor, so it is drawn lying on its side with the wide base against the rock and the barrel across the trench |
| `points` | 900 | |
| `cool` | 1.2 | |
| reload | 1.5 s × 0.75–1.35 | |
| bolt speed | 420 u/s | `heavy` — slower, fatter, drawn thick |
| damage | **19** | |
| engages | ahead < 900, behind > −40 | **Always.** Altitude does not help |
| hit radius | 21 | |
| shape | `R = 17`, 8 sides | Death is a big boom and a screen shake |

**Placement.** Automatic when `finale` is `"port"`, at `portT − 1750` and
`portT − 1050`, `x = ±(halfWidth − 14)`, `y = rim * 0.5`.

---

### Panel — `panel`

<img src="assets/panel.png" width="420">

Not a gun — a switch. A small bright yellow plate on the face of a bulkhead,
pulsing. Shoot every panel on one bulkhead and it sinks into the floor and you
keep your altitude. That is what makes a bulkhead a decision rather than a toll:
climb into the guns waiting on the surface, or stay low and spend the time and
the fire it takes to open it. A bulkhead authored with `panels: 0` is welded
shut and the only way is over the top.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 2 | |
| `points` | 200 | Plus 800 for the bulkhead when the last one goes |
| `cool` | `1e9` | It never fires |
| `sealT` | units | Which bulkhead it belongs to |
| `lockable` | true | Missiles work, and a four-panel bulkhead is four locks |
| shape | 18 × 14 plate, cross, centre dot | Goes red when hit |

**Placement.** `panels` per section (0–4, default 2), laid out as a grid on the
face at `t − 3`: columns at `x = (−0.3 + 0.6c/(cols−1)) * halfWidth`, rows at
`y = rim * (0.34 + 0.3r)`.

---

### Port — `port`

<img src="assets/port.png" width="420">

The finale. A recessed exhaust vent: three counter-rotating rings, six spokes
running back into the shaft, fourteen short shafts standing around the rim, and
a live core. **Guns will not breach it** — a laser hit says so and bounces. It
has to be painted and hit with a missile, which is the one moment the game asks
for the other weapon.

**It can be armed.** `"armedPort": true` at the top level of a spec turns those
fourteen shafts into guns: they fire one after another around the ring — the
port does not turn, the firing does — and each beam hangs in the 340 units in
front of it, fading orange to yellow. Nine stand at once, so five shafts are
always dark and there is a gap running round the wall at about 154°. The beams
start at the shaft mouths rather than at the middle, so the port's own axis is
the eye of it: hold that line and the wall turns around you for nothing, drift
thirty units off it and it costs about half a shield on the way in. **Off unless
a level asks** — an exhaust port is a thing you shoot, not a thing that shoots.

| Argument | Value | Meaning |
| --- | --- | --- |
| `hp` | 1 | To a missile. Immune to cannon fire entirely |
| `points` | 5000 | Plus 5000 for the win |
| `spin` | 0.9 rad/s | Faster than anything else's idle spin |
| hit radius | 20 | |
| shape | rings at `R = 13, 22, 31`, shafts from 31 to 40 | |
| armed | `armedPort`, default off. 16 damage a beam, 0.13 s apart |

**Placement.** `finale: "port"` puts it at the end of the track, `y = rim * 0.44`.
Nothing else is placed in the last 620 units, and no bulkhead within 1200.

---

## The music

One theme per level, named by the spec's `music` field and written in
[`src/songs.js`](../src/songs.js). The synth is the NES's set and not by
accident — two pulse voices, a triangle and noise — which is the palette every
stage theme of that era was written for. What made those sound bigger than four
channels was technique, and it is the technique that is implemented here rather
than more voices:

| | |
| --- | --- |
| **arpeggio** | a chord is one voice cycling three notes faster than the ear separates them. One channel instead of three, and it is where the shimmer comes from |
| **vibrato** | anything held longer than a quarter of a second wavers, delayed slightly the way a player would. A held note that does not is a test tone |
| **a second pulse** | harmony under the lead, quieter and duller, so two channels read as one instrument thickening |
| **a walking bass** | roots on the beat is a metronome; a bass that moves is a part |
| **per-song mix** | the balance is part of the writing. A theme carried by its bass and one carried by its lead do not want the same one |
| **pulse width** | the voices are pulse waves of a chosen duty, built as PeriodicWaves. A 50% pulse has *no even harmonics* — it is the hollow one. 25% is reedy, 12.5% is thin and nasal, and those are what a chip lead is actually made of. Giving the lead and the harmony different duties is also what stops two pulse voices fusing into one |
| **a voice per song** | duty cycles, but also per-song `vibrato` (depth and rate — water wavers deep and slow, fire shimmers fast and shallow, neon and glacier hold dead straight), `arpOctave` (glacier's bells ring two octaves up), and a lead that may be the staircase triangle itself — overgrowth's recorder. Nine songs, nine instruments, one engine |
| **tempo follows the throttle** | the score plays up to a fifth faster as the run speeds up — the level's own ramp, the burn, the gates all push it. The scheduler reads the step fresh every note, so the beat never drops |
| **the jukebox** | in SETUP: the score book with its hands on the live mixer — every song a button, every voice a slider writing into what is already playing |
| **a written bass** | a song may carry `bassLine` — the bass part written out bar by bar like the lead — instead of `bass` roots the engine walks itself. The gallop is a written figure, not a setting |
| **fills** | `drums` may be a list, one pattern per bar. One pattern is a loop; a list is a drummer, and a fill at a section's end is what makes the next section arrive |
| **sweeps** | a note ending in `/` rises and `\` falls, stepped the way the 2A03's sweep unit stepped — a fixed fraction of the period per tick, so the slide covers the same interval wherever it starts. The alarm and the dive-bomb |

**How this compares to the hardware it imitates.** More capable than the NES in
most respects: any number of simultaneous voices against its five, real filters
where it had none. And as of [`src/nes.js`](../src/nes.js), everything the 2A03
did that a browser oscillator cannot is emulated by construction, not by ear —
so the parity now runs in both directions:

| the hardware's trick | how it is done here |
| --- | --- |
| the noise channel is a 15-bit shift register, not white noise | the register itself, clocked and fed back exactly, rendered to a buffer. `h` in a drum pattern is the long mode |
| its *short mode* repeats every 93 bits — a pitched, metallic rasp | the same register with the tap moved to bit 6, measured 0.85 self-correlated at 93 clocks: a real ~300Hz tone. `m` in a drum pattern |
| the triangle is a staircase of 32 levels, with a rasp a smooth ramp lacks | the staircase's own Fourier series as a PeriodicWave, so the browser band-limits the corners per note |
| the sweep unit slides pitch by a fraction of the period per tick | `sweepPoints()`, scheduled as steps, never eased — the steps are the sound |
| the envelope is 4-bit: fifteen audible steps down | in authentic mode (the default) note decays are that staircase, not a smooth ramp |
| the period register is 11 bits, so pitch is a grid — 0.1 cents off at A2, **14.5 cents** at C7 | every note is snapped to that grid, which is where the era's slightly sour top octave comes from |

A song may opt out with `authentic: false` and play on the modern smooth grid;
none do.

| Song | | |
| --- | --- | --- |
| `bumblebee` | 160bpm, 2/4 | Rimsky-Korsakov at the score's tempo, and now with the accompaniment written as the left hand plays it — alternating eighths, root and fifth — where before a generator marked the roots. The bars the score leaves unaccompanied stay unaccompanied. No arpeggio — the lead never stops long enough for one |
| `water` | 132bpm, A minor | Eighteen bars. It opens with droplets — short high notes on rising sweeps, which is what a water drop sounds like — falling once over the arpeggio running alone. Then the eight bars that sink and climb back out, and a new eight-bar B section that heads into open water around the circle of fifths — iv–VII–III–VI — rising to the one c6 in the piece and settling home through a ♯7 dominant. The bass is written as a current: quarters that drift through each chord and hand every bar to the next with a passing tone |
| `anthem` | 152bpm, A minor | Eighteen bars. The opening-theme shape: long notes with big intervals over an arpeggio going four times as fast — the tune sounds unhurried and enormous *because* something underneath it is sprinting. The theme keeps the heroic i–VI–III–VII; a new second strain answers it — VI–VII–i twice, peaking a step higher each phrase to d6, then a rising sweep flare on the dominant, the brass gesture, before the loop is handed back. The bass is written pumping eighths with a walk into every chord change, and the strain earns a backbeat the theme does not have. The first two bars still play once and never return |
| `fire` | 176bpm, E minor | Sixteen bars with a form, not a loop: a two-bar alarm of rising hardware sweeps that plays once, a driving 3+3+2 theme stated bare then restated with its harmony, a chorus lifting to the relative major, and a climax that runs down the octave at full speed and dive-bombs back into the loop on a falling sweep. The bass is a written gallop — root, rest, root, octave — that walks into every chord change; the drums fill into each section and go double-time under the run, metallic short-register noise ticking through the groove. Its dominant is still a **B7** carrying the D♯ of the harmonic minor, and the chorus's biggest note is a ♭9 over it |
| `neon` | 138bpm, A minor | Synthwave in the chip idiom: the lament descent — a, g, f, e — pumped in eighths with a chromatic slip into nearly every change. The intro is three rising zap sweeps, arcs jumping a substation; the turnaround dives on one. The lead is the one duty no other song uses — the hollow 50% square over a reedy 25% harmony, the PWM pair — and the metallic short-register noise ticks the off-beats: electricity in the hi-hat |
| `boss` | 148bpm, E minor | One track for every warden: the situation, not the ship. E minor leaning hard on **F** — the Neapolitan, a semitone above home, the oldest menace in the book — with the lead stabbing the tritone and the heaviest drums in the game, kick doubled and the metallic rasp on every upbeat. No intro: a boss fight starts mid-sentence. Twelve bars, because fights are heard on repeat and a short loop with two builds beats a long one heard once |
| `overgrowth` | 138bpm, C major, 6/8 | The one major-key stage theme and the one in compound time: twelve sixteenths to the bar, two big beats with a lilt between them, because a district full of windmills sways rather than marches. The arpeggio never stops turning, the way the windmills do not. 97% of its strong beats sit on chord tones — the pastoral one is also the most consonant thing in the game |
| `glacier` | 112bpm, A minor | Crystalline means empty: long high notes over an arpeggio that rings rather than runs, a bass in half-notes, an echo an octave down arriving late like sound off ice, and almost no drums — the metallic tick, like ice settling. The slow one, with the hollow 50% lead used cold: at this register it reads as glass |
| `void` | 96bpm, E minor | The hollow one: the only stage theme with no arpeggio at all, because a dead district does not shimmer. Built on the tritone — e against a♯, f against b — the interval that refuses to settle, over a pedal that shudders a half-step and returns. The drums are a heartbeat and a static tick |

All three written ones are checked as music before anyone hears them: every bar
the right length, every token a note, and the strong beats landing on chord
tones — 66% for `water`, which floats on maj7 colors and suspensions, against
88% for `anthem` and 87% for `fire`, which do not. The audit's remaining flags
are all deliberate: the ♭9 over `fire`'s dominant, the 4–3 suspension over
`anthem`'s final cadence, walking-bass passing tones. The mixes are measured,
not guessed — each song rendered voice by voice and A-weighted, the lead holds
39–44% of what the ear hears everywhere, and the sweeps are verified in the
rendered audio itself: `fire`'s dive measurably falls 988→558Hz, `water`'s
droplets rise 945→1570, `anthem`'s flare 725→1190.

The average lead note says what a theme is as clearly as its tempo does:
5.0 sixteenths for `anthem`, which sings, and short stabs for `fire`, which
hammers.

## The ship

### Interceptor

<img src="assets/ship.png" width="480">

<table><tr><td width="50%">

Drawn as a silhouette rather than a model, because you see it from behind at
about fifty pixels tall: a hull, two swept wings, a cannon on each wingtip, two
fins, and an engine flare whose length tracks the throttle.

</td><td>

| | |
| --- | --- |
| Shields | 100, regenerating 7.5/s below the rim after 3 clean seconds |
| Hull | 14 wide × 10 tall (`SHIP_HX/HY`), 5 × 18 on edge (`KNIFE_HX/HY`). What it is at any moment comes from \|sin\| of the roll angle, so it is thinnest a quarter turn round either way and back to normal at a half turn |
| Lateral | 145 u/s |
| Vertical | 160 u/s — faster, because the climb is what kills you |

</td></tr></table>

| Weapon | Numbers |
| --- | --- |
| **Cannon** | 0.09 s cadence, 1500 u/s, 1 damage. Heat 0.38/s up, 0.5/s down; overheats at 1 and will not fire again until 0.25 |
| **Missiles** | Up to **8** locks, 5 s cooldown, 620 u/s, **8 damage** — which kills everything light outright and leaves the heavies standing. Free to fire — you buy them by flying, since painting means holding the crosshair on a target for 0.24 s |
| **Roll** | Hold **LR** or **RR** — the pair of buttons in the lower left — and the ship goes over on that edge: 7.5 rad/s, on edge in about 150ms, trading the 14×10 footprint for 5×18 — width for height. **Signed** by which button you hold, because rolling only ever one way is no use when the thing you are avoiding is on that side. (The old gesture — double-tap the screen on the side you want, hold the second tap — lives on as a setting: ROLL BUTTONS off) |
| **Barrel roll** | Tap LR or RR **twice**. A whole turn at 11 rad/s, about half a second, at a steady rate rather than easing out — and it is a *dodge*: 165 u/s sideways while it goes round, so it moves the ship and not only the model. It passes through the knife edge twice on the way. The press starts the knife immediately either way — both moves begin identically, so nothing is lost by not waiting to find out which one it is |
| **Burn** | Held. 1.5× for as long as the button is down and the tank has charge: 2.4 s of it, refilling over 8 s, and letting go early keeps what is left. Run it dry and it latches off until you release. Both it and gate time spool in and out rather than switching |
| **Gate time** | A separate 1.5× that a turbo gate grants for 3 s and stacks. Independent of the tank in both directions. Burning *and* gated is 2.1× |

The crosshair is not aimed. It sits where the nose points, and the nose yaws up
to 0.52 rad with your steering — so *flying* is how you put it on things, and a
lock is bought with flight path.

**PAINT TO LOCK**, on by default, decides how much of that is required. On, a
target paints only while it is inside the drawn brackets — what you see is what
you paint. Off, anything within 108 scale units paints, which is a quarter of
the screen's short side, and pointing the ship down the canyon paints most of
what is in front of it: it plays as an auto-lock. Measured over a run with a
pilot who never aims, strict paints 0.70 targets in an average frame against
1.81 loose.

**Line of sight is real.** A surface gun cannot be seen, painted or locked from
the trench floor: the sight line clips the rim. Fighting the surface means
climbing into its fire.

---

## The special weapon

The gun with a second identity. Each district's warden fights with its own
special weapon — and beating it takes that weapon from it, fitted to the ship
from then on. **Hold SPECIAL to fire it**, exactly like the burn: down is the
special streaming, up is whatever charge is left, saved. The normal gun is
untouched underneath and comes back the moment you let go. The standard gun
still finishes everything — a special is a multiplier, never a key.

**The meter is diamonds**, drawn on the SPECIAL button in the weapon's color:

| | |
| --- | --- |
| one diamond | **2 seconds** of special fire |
| a run starts with | **3** |
| the drain | continuous: it spends for exactly as long as you hold, and keeps exactly what is left when you let go — a tank, not a switch |
| the recharge | from bone dry back to base three in **20 seconds**, always ticking when you are not firing |
| a `diamond` gate | **+1**, past the base, up to **8** |
| a `prism` | fills it to **8** |
| held dry | it latches off; release and press again to relight |

### ARC — the Neon District's weapon

A live stream of chain lightning, held rather than fired. The head of the
chain is **the cursor's choice** — whatever sits closest to the crosshair, not
closest to the ship, so pointing at a far gun arcs the far gun. From there it
jumps to whatever is closest to the last ship struck, **three jumps at most**,
each landing at 65% of the one before: 2 / 1.3 / 0.85 / 0.55 per tick, eight
ticks a second, out to 900 units with 260 between jumps. The bolt is torn down
and rebuilt every frame — a zigzag whose displacement flips side at every
vertex, with short dead-end branches — so it *crackles*, and the audio
crackles with it: thirty-odd randomized sparks a second, only while the stream
is live. It ignores gun heat entirely; the diamonds are its whole economy.
The port shrugs it off the same way it shrugs off the gun.

MARIONETTE — the Neon warden — fights with ARC itself. What it does to you in
the arena is exactly what the weapon does for you afterward.

## The warden

A level may put a boss past its port (`boss` in the spec — optional, so every
track still works as a plain timed run). Kill the door and the climb out of
the canyon stops being an ending: the music slams to the boss theme on the
spot, the walls fall away into open ground above the district, and the warden
is up there waiting. You fly alongside it, 1943-style. It paints, locks, and
eats missiles like anything else — a big target with 90-odd health against
your one-per-laser and eight-per-missile — and it fights back with the
special weapon its district would hand you for beating it, which is the
campaign's rule: the fight is the demonstration.

The machinery is generic — an entity the existing paint, lock, laser, and
missile systems already understand, attack clocks that tighten as it loses
thirds of its health, and an arena that loops invisibly because it is flat
and straight on purpose. A new warden is a block of numbers and a draw
function, not a new system. The full roster — all eight wardens, their
fights' shapes, and the wheel that connects them — is designed in
[CAMPAIGN.md](CAMPAIGN.md#the-wardens); this file documents the ones that
exist in code.

| | | | |
| --- | --- | --- | --- |
| <img src="assets/hydra.png" width="190"><br>**HYDRA** — Riverworks. The spine takes damage one glowing segment at a time, rear to front | <img src="assets/furnace.png" width="190"><br>**FURNACE** — Reactor. Four regulators around a core that vents fire which stays where poured | <img src="assets/mantis.png" width="190"><br>**MANTIS** — Overgrowth. Scythe arms that regrow once; blades that come back | <img src="assets/marionette.png" width="190"><br>**MARIONETTE** — Neon. Six pods hold the lattice; the strike tracks you to the last third of a second |
| <img src="assets/portcullis.png" width="190"><br>**PORTCULLIS** — Bulkhead. A gate that got up: strip the panels, thread the doors | <img src="assets/avalanche.png" width="190"><br>**AVALANCHE** — Glacier. Ice that regrows from the edges; the freeze beam ices your controls | <img src="assets/broadside.png" width="190"><br>**BROADSIDE** — Gauntlet. The wall-of-fire frigate; silence the deck a battery at a time | <img src="assets/revenant.png" width="190"><br>**REVENANT** — Void. The backwards-driving juggernaut; six lights count to a triple blast whose only refuge is dead center |

**All eight wardens fly.** The full designs live in the
[campaign roster](CAMPAIGN.md#the-wardens); in code they share one registry —
HYDRA weaving its trench with one glowing segment takeable at a time,
FURNACE pouring magma clouds that stay where poured, MANTIS throwing blades
that come back and regrowing its arms once, PORTCULLIS closing the arena
into a slot while you strip its panels, AVALANCHE racing your fire with
regrowing ice, BROADSIDE's deck going silent a battery at a time, REVENANT the
juggernaut tank driving backwards down its dead road, turret patterns that
change with every mount you destroy, shotgun volleys of missiles that are
themselves lockable targets, and six tail-lights counting up to a triple
blast whose only safe place is dead center. Two mechanics worth knowing everywhere: a
**shielded core blocks with a sliver of its hull**, so shots aimed at parts
mounted against it reach them; and parts are checked **before** the core, so
an overlapping hitbox never eats the shot you lined up.

**MARIONETTE** — the Neon warden, and the first one built — is a floating
core ringed by **six tentacle pods**, each a small lockable target of its
own. The pods are what spawn the drone escorts, and while any pod lives the
core is **shielded**: guns splash off, missiles refuse the lock, and a
lattice drawn between the live pods says so on sight. Break the ring — the
HUD counts the pods down as diamonds going dark — and the core opens, the
bar lights, and the duel starts: it drops to ship height and sweeps.

Its ARC strike telegraphs for 0.85 seconds, and the aim **follows you**
through the charge, freezing only for the last 0.3 — the core burns
white-hot at that instant, and that is the moment to move. Dodging early
buys nothing; the late sidestep is the skill.

When it dies, an escape pod flies out and gets away — and then the ship
goes to **lightspeed**: the arena streaks past, and the other side of it is
the SPECIAL WEAPON ACQUIRED screen, fanfare and all, with the weapon already
fitted by the time the menu returns.

## Aim, and what speed buys you

Every gun that throws a shell -- turret, gatling, wall gun, drone, emplacement --
lays each shot either properly or deliberately wide, and how often it manages
the first is what boosting changes:

| You are | Shots laid properly |
| --- | --- |
| flying normally | **80%** |
| burning, or gated (1.5×) | **60%** |
| both at once (2.1×) | **50%** |

A shot laid properly *solves* the intercept — where the ship will be when the
shell gets there, given its whole velocity — rather than aiming at where it is
now. A thrown one goes wide **across** the line of fire rather than short,
because a shell that lands behind you reads as the gun being slow and one past
your wing reads as the gun missing.

Even a proper shot is not a perfect one. Its error grows with the shell's flight
time — 6 units at the muzzle, 110 more for every second in the air — which is
what a gunner's error actually does: a shot across the trench is nearly certain
and one at the far end of its range is a guess. Solving the intercept exactly
and leaving it at that made every gun a marksman, 44% of shots landing where
15% had, and the whole game twice as lethal.

Shells fly faster in proportion to the boost, too, which is arithmetic rather
than flavour: at 2.1× the ship was outrunning a 520 u/s shell and one per cent
of them landed.

| Above the rim, same line | Damage a second | Shots that land |
| --- | --- | --- |
| not boosting | 26.8 | 24% |
| burning | 13.1 | 27% |
| super burn | 5.9 | 23% |

The fraction landing barely moves — the geometry is fair at any speed now. What
speed buys is *fewer shots fired at you*, because you spend less time inside each
gun's reach. It used to buy immunity: 0.2 damage a second and one shot in a
hundred.

## What hurts, and how much

| Source | Damage |
| --- | --- |
| Gatling tracer | 6 |
| Turret / wall gun / drone bolt | 12 |
| Emplacement bolt (`heavy`) | 19 |
| Battery seeker | 26 |
| Ring beam | 20 |
| Port beam (armed ports only) | 16 |
| Hitting any obstacle | 34 |
| Hitting a bulkhead | 48 |
| Shields | 100, +7.5/s below the rim after 3 seconds without a hit |

---

## Obstacles

No hit points. They cannot be shot, painted or locked — they are the part of a
level you fly *around*, not the part you answer. Which kinds may appear in a
section is the `kinds` list; how often is `obstacles` (0–1), which spaces them
every `2500 / (0.12 + obstacles * 6.2)` units with a hard floor of 240 between
any two.

Colour is the tell: **warm orange is rock**, cool blue is machinery that moves,
amber is an opening that needs a specific posture, green is help.

### Static

| | Kind | What it is |
| --- | --- | --- |
| <img src="assets/pylon.png" width="150"> | `pylon` | A column up from the floor. 1–3 per obstacle, 22–52 wide, up to the rim |
| <img src="assets/fang.png" width="150"> | `fang` | The same thing hanging from the roof, pointing down |
| <img src="assets/stack.png" width="150"> | `stack` | Staggered half-blocks, alternating high and low, 300 units apart — a chicane, not a coin flip |
| <img src="assets/gate.png" width="150"> | `gate` | A wall with one window in it. The window is drawn bright and the blocks are dim, because the gap is the information |

### Posture

These want the ship held a particular way. `slot` alternates between the two
forms as a level places them, so the roll is a conversation rather than a trick.

The room in a slit is `slotgap` (2–14, default **4**), measured each side of the
ship's own footprint rather than as an absolute width — so the field says the
thing that matters. Four is also the ceiling that keeps a slot a slot: an
upright slit has to stay narrower than the 14 the ship is wide flying level, and
half of (14 − 5) is 4.5. Ask for more and it becomes an ordinary window that
does not need the roll at all.

| | Kind | What it is |
| --- | --- | --- |
| <img src="assets/slot-upright.png" width="150"> | `slot` upright | A slit **13** units wide against a ship that is 5 wide on edge and 14 wide level: it only takes the ship **on edge**, with 4 units of room each side |
| <img src="assets/slot-flat.png" width="150"> | `slot` flat | A slit **18** units tall against a ship 10 tall level and 18 on edge: it only takes the ship **level**, with 4 units above and below |
| <img src="assets/boostgate.png" width="150"> | `boostgate` | Green, hexagonal, and the only thing out here that helps. Fly through the hoop for +150 and **three seconds of speed**, on a stopwatch of its own: it does not spend the burn tank and does not fill it, so a gate is never wasted on a full one, and a second gate adds three more seconds to whatever is left. Take one while holding the burn as well and the two together make the super burn, 2.1×. Nothing about it is solid — the frame stops neither the ship nor a shot, and clipping it simply means you did not go through |
| | `diamond` | A diamond-shaped hoop in the equipped special weapon's color. Fly through it for **+1 diamond** on the special's meter — the only way the meter climbs past its base of three, up to the cap of eight. Like the boostgate, nothing about it is solid |
| | `prism` | A diamond hoop cycling through every color, and very rare — a level places one, if any. Through the hole the special's meter **fills to eight**. Not solid |

### Moving

Drawn cool blue, so at a glance you can tell what will still be there when you
arrive.

| | Kind | What it is |
| --- | --- | --- |
| <img src="assets/press.png" width="150"> | `press` | Two walls closing on the centre and opening again at 0.85–1.35 rad/s — a 4.6 to 7.4 second cycle. The gap never shuts past 26 units: a crusher with no opening is just a wall that arrives late |
| <img src="assets/slider.png" width="150"> | `slider` | A block tracking side to side at 0.8–1.5 rad/s, or (40% of the time) up and down |
| <img src="assets/cross.png" width="150"> | `cross` | Four thick arms from the middle of the trench, turning at 0.5–1.2 rad/s |
| <img src="assets/pinwheel.png" width="150"> | `pinwheel` | The same idea thinner: three or five arms, turning. Geometry, not a gun |

### The two that fight back


| | Kind | What it is |
| --- | --- | --- |
| <img src="assets/ring.png" width="150"> | `ring` | An iris: a hole in a plate, radius 28–40, with **eight orange tentacles** standing off the rim — and they fire. One after another clockwise from twelve, `ringrate` seconds apart (default **0.2**), each throwing a wedge of light outward at the rock that fades orange to yellow. Four always stand at once — a beam's life is derived from that ring's own rate — so slowing a ring slows the sweep going round rather than thinning the wall. They are a hazard to fly *through*, not a gun that aims: the hole stays clean, and beams stand 90 units in front of the hoop so cutting the corner on the way in costs 20. Flying the hole properly costs nothing — measured across all 21 rings in the shipped levels |
| <img src="assets/seal.png" width="150"> | `seal` | A bulkhead: a full wall across the trench, hatched dense so it cannot read as a tunnel, with chevrons climbing it saying **up**. Not in `kinds` — authored by count with `seals` (0–6), one per 2600 units of section, and it pulls a gatling, a battery and 3–5 turrets to the surface above it. 48 damage if you hit it. The other way through is its [panels](#panel--panel) |

---

## Adding one

The `kind` string is the spine. A new enemy needs a branch in each of four
places, and nothing else:

| File | What to add |
| --- | --- |
| [`level.js`](../src/level.js) | Where it is placed, and its `enemy()` overrides |
| [`game.js`](../src/game.js) | Its firing routine in `updateEnemies`, and a `RADIUS` entry |
| [`entities.js`](../src/entities.js) | Its shape, as a branch in `drawEnemies` |
| [`spec.js`](../src/spec.js) | A density field in `FIELDS`, if a level should be able to ask for it |

Then add it to `SUBJECTS` in [`tools/portraits.mjs`](../tools/portraits.mjs) and
re-run it, and it has a portrait in here too.

`node tools/doccheck.mjs` reads the constants out of the source and checks this
file still quotes them, that every enemy's hit points match, and that every
obstacle kind and spec field is written down somewhere. It exits non-zero when
they are not, so a number that moves without its documentation is a failure
rather than something somebody has to spot.
