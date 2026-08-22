# The campaign

This is the pivot: VECTRENCH stops being a collection of levels and becomes a
game. Eight districts, a warden at the end of each, a weapon earned from every
warden, and a ninth level that only exists once the other eight are beaten.
Everything below is the brief the rest of the work builds against.

## The world

VECTRENCH is a machine world, and the trenches are its circulatory system.
Each of the eight districts is a trench network with a job — coolant rivers,
foundries, freight locks, the power grid — and each district has a **warden**:
a custodian ship that flies its trenches the way you do. The gate at the end
of every level is the district seal. Break it and you are in the warden's
arena, and the music turns.

Beat all eight and the center of the select screen unlocks: the dive to the
core, where the thing that built the wardens is waiting.

## The nine levels

The select screen is the 3×3 grid — built and live on the home screen: eight
districts around the edge, the Citadel sealed in the center until every
warden is down. Cleared districts wear their mark forever and stay replayable;
districts not yet built sit dark on the map, which is honest.

| # | District | Level | Hue | The district's job | Weapon earned |
| --- | --- | --- | --- | --- | --- |
| 1 | **RIVERWORKS** | THE ESSES *(exists)* | cyan 0.48–0.53 | coolant rivers — snaking bends, slots | **WAVE** |
| 2 | **REACTOR** | REACTOR *(exists)* | red 0.0–0.06 | the furnace — everything at once, on fire | **MAGMA** |
| 3 | **OVERGROWTH** | CANOPY RUN *(exists)* | green 0.30–0.36 | a reclaimed district — vines as rings, pinwheels as windmills | **SAW** |
| 4 | **NEON** | NEON DISTRICT *(exists)* | violet 0.74–0.86 | the power grid at night | **ARC** *(built)* |
| 5 | **BULKHEAD** | BULKHEAD RUN *(exists)* | steel 0.63–0.66 | doors, presses, crushers | **BREACH** |
| 6 | **GLACIER** | THE SHEAR *(exists)* | ice 0.56–0.60 | a frozen intake — knife-edge slot country | **FREEZE** |
| 7 | **THE GAUNTLET** | GAUNTLET *(exists)* | gold 0.13–0.16 on black | the armory corridor — wall guns the whole way | **RAIL** |
| 8 | **VOID** | DEAD AIR *(exists)* | magenta 0.90–0.94, sparse | a dead district — long silent flats, then a pocket of everything at once | **GHOST** |
| 9 | **CITADEL** | *new, final* | every hue, shifting per section | the dive to the core — one hazard quoted from each district, then the boss | — |

SHAKEDOWN and PROVING GROUND stay outside the campaign as training.

`hue` is already per-section in the spec — REACTOR drifts gold-to-red today.
The one renderer addition the themes want is a **second hue**, so obstacles
and enemies can sit on a different color than the walls (violet walls, cyan
enemies). Everything else is a field that already exists.

## The special weapon

Every weapon works the same way; only the shot differs.

**The meter is diamonds, and the diamonds are the weapon's color.** A row of
them on the HUD next to the boost chevrons.

- One diamond is **2 seconds** of special fire.
- A run starts with **3 diamonds** — six seconds. Using it is a big deal.
- The meter **recharges**: from empty back to the base three in 20 seconds,
  continuously, whenever you are not firing.
- **Diamond gates** — diamond-shaped, tinted the weapon's color — grant one
  diamond each, instantly, *above* the trickle ceiling, up to a cap of **8**.
- The **recharge gate** is very rare: fly it and the meter fills to 8.
- Firing: **hold SPECIAL**, exactly like the burn — down is the special
  streaming and draining, up is exactly what is left, saved. A tank, not a
  switch. Holding it dry latches it off until the next press.

The wheel below is a damage multiplier (~3×, "melts"), never a key: the
standard gun finishes every level and every warden. That rule is load-bearing
and does not move.

## The weapons and the wheel

One closed 8-cycle, so any starting district works and solving the order is
part of the game. Each entry reads: *the weapon, what it does, and whose
warden it melts.*

| Weapon | From | The shot | Melts |
| --- | --- | --- | --- |
| **WAVE** | Riverworks | a rising wall of light — your version of the ring's beam; clears anything wide | FURNACE (douses the Reactor warden) |
| **MAGMA** | Reactor | short-range burning flak, damage over time; armor-killer | MANTIS (burns the Overgrowth warden) |
| **SAW** | Overgrowth | a returning blade; shreds anything that spins | MARIONETTE (severs the Neon warden's cables) |
| **ARC** | Neon | chain lightning that jumps between painted locks — built on paint-to-lock | PORTCULLIS (conducts through the Bulkhead warden's doors) |
| **BREACH** | Bulkhead | a charge shot that blows seals early and staggers presses | AVALANCHE (shatters the Glacier warden's ice) |
| **FREEZE** | Glacier | stops mechanisms — pinwheels stop, presses halt mid-cycle, sliders lock | BROADSIDE (freezes the Gauntlet warden's batteries) |
| **RAIL** | The Gauntlet | a piercing lance through everything in a line | REVENANT (the only thing that catches VOID's phasing warden) |
| **GHOST** | Void | passes through walls and hits what hides behind them | HYDRA (reaches the Riverworks warden inside its river) |

## The wardens

You fly *alongside* each one, 1943-style, in a dedicated arena past the gate.
Every warden fights with its own special weapon — the fight is the
demonstration, and what it did to you is what it will do for you once you
take it. And every fight has a **shape**: a visible structure you break
before the kill shot exists, because MARIONETTE taught us that progress the
eye can count is what makes a boss a fight instead of a health bar. When a
warden dies, an escape pod flies out and gets away — that is not color, it
is the setup *(see the parking lot)*.

The machinery is generic and proven, and **all eight wardens fly**: each is
a block of numbers, a draw function, and an attack script in the registry,
verified end to end -- gate falls, fight, shape breaks, core dies, pod away,
lightspeed, weapon in hand.

### HYDRA — Riverworks · yields WAVE · melted by GHOST
A river monitor in segments, and the one fight that stays **in the trench**:
the arena is its river, widened, and the thing weaves bend to bend trying to
put its body between you and the gap. It raises WAVE walls — rising sheets
of light with one hole — timed to arrive as the bends do. **The shape:** its
spine. Segments glow weak one at a time, back to front; each one broken
shortens it, and a shorter HYDRA corners harder. GHOST reaches through hull
and water alike, which is why it melts; guns must wait for the glowing
segment to surface.

### FURNACE — Reactor · yields MAGMA · melted by WAVE
The core on rails, dragging its heat with it over open foundry ground. It
vents MAGMA — hanging clouds of burning flak that stay where they were
poured, damage over time for as long as you fly in them — and it rams on a
straight telegraphed line when you linger level with it. **The shape:** four
heat regulators around the core. Each one broken makes the venting wilder
but the core hotter and more exposed; all four down and it runs glowing,
shedding fire, killable. WAVE douses a vent cloud on contact, which is why
it melts.

### MANTIS — Overgrowth · yields SAW · melted by MAGMA
A scythe ship over the canopy. It throws SAW — returning blades that cross
the arena in a flat arc and come back along a different line, so every throw
is dodged twice — and it seeds the air with drone pods that hatch if you
leave them. **The shape:** the two scythe arms. Each arm is its own target;
one arm down halves the blade throws, both down and the body fights alone —
and desperate, ramming in figure-eights. The arms regrow once, at half
strength, so the fight teaches you its rhythm and then asks again faster.
MAGMA burns growth, which is why it melts.

### MARIONETTE — Neon · yields ARC · melted by SAW
The one that flies today. A floating core ringed by six tentacle pods; the
pods spawn the escorts and hold the shield lattice — the core refuses locks
and sheds gunfire until the ring is broken, and the HUD counts the pods down
as diamonds going dark. Its ARC strike telegraphs for 0.85 seconds and the
aim FOLLOWS you, freezing only for the last 0.3 — the core burns white at
the lock, and the late sidestep is the skill. Seeker pairs from its second
third; a low sweep once the core is open. SAW severs what it hangs from,
which is why it melts.

### PORTCULLIS — Bulkhead · yields BREACH · melted by ARC
A flying gate: a bulkhead that got up. It screens itself behind its own
doors and fights by **closing the arena** — sliding wall sections in from
the sides so the open ground becomes a slot you thread while it shells the
gap with BREACH charges that detonate in a spread behind their point of
impact. **The shape:** the door panels, exactly like the bulkhead panels the
whole game has taught — shoot the panels to strip its screen, one face at a
time, until the hinge is bare. ARC conducts across a closed door and finds
the works behind it, which is why it melts.

### AVALANCHE — Glacier · yields FREEZE · melted by BREACH
A ram ship armored in ice that grows back. It fights close: long telegraphed
rams the width of the arena, shard bursts on the turn, and FREEZE beams that
stiffen your controls for a heartbeat if they touch you — the one attack in
the game aimed at the pilot rather than the ship, always telegraphed, always
a lane you can leave. **The shape:** the armor. Plates crack and shed under
fire and regrow from the edges, so the fight is a race for the gap you just
made; BREACH shatters every plate at once, which is why it melts. Under the
ice it is small, fast, and fragile.

### BROADSIDE — Gauntlet · yields RAIL · melted by FREEZE
A gun-deck frigate that takes up station beside you and simply *fires*: the
wall-of-fire fight. Its deck guns cycle in ranks, and from its second third
it adds RAIL — piercing lances the length of the arena, lanes that flash
before they fire, the whole fight becoming a grid of places not to be.
**The shape:** the deck itself. Every battery is a target; every battery
down is one less stream in the wall, and the HUD counts the deck. When the
deck is silent the magazine opens. FREEZE stops a cycling battery mid-cycle,
which is why it melts.

### REVENANT — Void · yields GHOST · melted by RAIL
The dead district's last war machine, driving backwards down a road it
crushes as it goes. The hull carries no guns any more: it **launches** them —
waves of aerial escorts circling it, machine-gun drones then missile
batteries, cycling every sixteen seconds, killed ones replaced from the
launch bays. Clearing the sky is pressure relief, never progress.

**Progress is the hull.** Pour fire into the armor — the HUD's pips count it
down — until it cracks and the core stands exposed for a five-second window,
then it seals and regrows and asks again. Missiles crack armor eight times
faster than guns.

**The cannon locks, and then it lands.** Six tail-lights count the charge
while the hull shakes; then BEAM LOCKED — the mark is taken where you are,
drawn in blinking red with a tracking line back to the muzzle — and one
second is what you get to roll off it. Then BOOF, BOOF, BOOF: three thick
columns of light on the mark, each a whole-body impact with a subwoofer
thump, twenty-eight apiece for standing on it and nothing at all for
having left. RAIL pierces the armor without asking, which is why it
melts.

### The ninth fight
The Citadel's boss is the eight escape pods, assembled. Parked in the
parking lot until the eight wardens fly.

## The music map

| Track | Status |
| --- | --- |
| Title / select screen | **anthem** — written, playing: it starts on the first screen after the opening tap and returns whenever a run ends |
| Riverworks | **water** — written, assigned |
| Reactor | **fire** — written, assigned |
| Overgrowth | **overgrowth** — written, assigned |
| Neon | **neon** — written, assigned |
| Bulkhead | to write — industrial ostinato, machine rhythms |
| Glacier | **glacier** — written, assigned |
| The Gauntlet | to write — a relentless march |
| Void | **void** — written, assigned |
| **Boss** | **boss** — written, wired: when the port falls on a warden level, the music turns on the spot |
| **Final run** (Citadel) | to write — the biggest track in the game, quoting the anthem's theme |
| Training | **bumblebee** — where the joke belongs |

Three to write (Bulkhead, Gauntlet, the Citadel run), nine written. The synth has the full NES palette now
([BESTIARY — the music](BESTIARY.md#the-music)); keeping eight districts
audibly distinct is what the duty cycles, sweeps, and written basslines
are *for*.

## The parking lot — the final boss

Noted so it is not lost, deliberately not the current focus:

- The Citadel's boss arena has a **ring of diamonds** you can fly through at
  various spots — each grants a burst of a *particular* special, the one that
  helps with whatever phase of the fight you are in.
- The eight escape pods that got away are the final boss: they **assemble** —
  all eight forming one monster ship, and the fight takes it apart the way
  it was put together.

## The order of work

The focus now: **the eight levels, their themes, their soundtrack, and the
special weapon system.** In build order:

1. ~~The diamond meter and one weapon end-to-end~~ — **done**, and it was ARC,
   not WAVE: the Neon District shipped first as level + song + weapon
   together, which is the per-district pattern from here on.
2. The second hue, so districts look like districts.
3. The remaining districts one at a time, each level + song + weapon together.
4. ~~The 3×3 select screen and the unlock state~~ — **done**: the home screen
   is the grid — eight districts around a sealed Citadel counting wardens
   down, cells cleared forever in localStorage and freely replayable, the
   weapon rack under it, and the ship above the map wearing whatever is
   fitted. Beating a warden's district hands its weapon over on the spot;
   until the first one falls, the ship flies clean and the SPECIAL button
   does not exist.
5. ~~The boss arena machinery and the wardens~~ — **done, all eight**: every
   district's gate now opens on its warden, each with its own shape, attacks,
   and weapon to take. What remains of the fights is tuning against real
   thumbs.
6. The Citadel.
