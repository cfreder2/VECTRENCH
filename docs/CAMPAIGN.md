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
| 3 | **OVERGROWTH** | *new* | green 0.30–0.36 | a reclaimed district — vines as rings, pinwheels as windmills | **SAW** |
| 4 | **NEON** | NEON DISTRICT *(exists)* | violet 0.74–0.86 | the power grid at night | **ARC** *(built)* |
| 5 | **BULKHEAD** | BULKHEAD RUN *(exists)* | steel 0.63–0.66 | doors, presses, crushers | **BREACH** |
| 6 | **GLACIER** | *new* | ice 0.56–0.60 | a frozen intake — knife-edge slot country | **FREEZE** |
| 7 | **THE GAUNTLET** | GAUNTLET *(exists)* | gold 0.13–0.16 on black | the armory corridor — wall guns the whole way | **RAIL** |
| 8 | **VOID** | *new* | magenta 0.90–0.94, sparse | a dead district above the rim — inverts the surface-is-lethal rule | **GHOST** |
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
- The meter **trickles**: one diamond per 10 seconds of flying, but only up to
  the starting three. Thirty seconds from empty back to base.
- **Diamond gates** — diamond-shaped, tinted the weapon's color — grant one
  diamond each, instantly, *above* the trickle ceiling, up to a cap of **8**.
- The **recharge gate** is very rare: fly it and the meter fills to 8.
- Firing: **hold SPECIAL**, exactly like the burn — down is the special
  streaming, up is whatever is left, saved. There is no partial diamond spent
  on a tap: a press commits at least one, and holding it dry latches it off
  until the next press.

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
Each is its own ship with special attacks — crushing, ramming, missiles,
spawning escorts you must clear.

**Every warden fights with its own special weapon.** MARIONETTE chains ARC
lightning at you; FURNACE burns you with MAGMA; BROADSIDE fires the RAIL you
will take from it. Beating a warden is how the weapon is earned — the fight
is the demonstration, and what it did to you is what it will do for you.
First-pass identities, to be designed properly one at a time:

| Warden | District | The fight |
| --- | --- | --- |
| **HYDRA** | Riverworks | a segmented river monitor that weaves the bends and crushes you against them; the weak segment cycles |
| **FURNACE** | Reactor | the core on rails — vents plasma walls, rams |
| **MANTIS** | Overgrowth | scythe blades, spawns seed drones that must be shot |
| **MARIONETTE** | Neon | hangs from light-cables strung across the trench and swings |
| **PORTCULLIS** | Bulkhead | a flying gate that screens itself with doors; crush attack |
| **AVALANCHE** | Glacier | a ram ship shedding regrowing ice plates |
| **BROADSIDE** | The Gauntlet | a gun-deck frigate flying parallel — the wall-of-fire fight |
| **REVENANT** | Void | phases through the surface and ambushes |

**When a warden dies, an escape pod flies out and gets away.** That is not
color — it is the setup. *(See the parking lot.)*

## The music map

| Track | Status |
| --- | --- |
| Title / select screen | **anthem** — written, playing: it starts on the first screen after the opening tap and returns whenever a run ends |
| Riverworks | **water** — written, assigned |
| Reactor | **fire** — written, assigned |
| Overgrowth | to write — pastoral but driving, 6/8 |
| Neon | **neon** — written, assigned |
| Bulkhead | to write — industrial ostinato, machine rhythms |
| Glacier | to write — sparse, crystalline, high arpeggios |
| The Gauntlet | to write — a relentless march |
| Void | to write — hollow, tritone-heavy, the empty one |
| **Boss** | **boss** — written, wired: when the port falls on a warden level, the music turns on the spot |
| **Final run** (Citadel) | to write — the biggest track in the game, quoting the anthem's theme |
| Training | **bumblebee** — where the joke belongs |

Six to write, six written. The synth has the full NES palette now
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
5. ~~The boss arena machinery~~ — **done**: `boss` in a spec grows the arena,
   the ascent, the fight, the escape pod, and the boss theme; MARIONETTE is
   the first warden flying it. The remaining wardens, one at a time.
6. The Citadel.
