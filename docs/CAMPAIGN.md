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

The select screen is the 3×3 grid: eight districts around the edge, the
Citadel locked in the center until all eight wardens are down.

| # | District | Level | Hue | The district's job | Weapon earned |
| --- | --- | --- | --- | --- | --- |
| 1 | **RIVERWORKS** | THE ESSES *(exists)* | cyan 0.5 → blue | coolant rivers — snaking bends, slots | **WAVE** |
| 2 | **FOUNDRY** | REACTOR *(exists)* | gold 0.14 → red 0.0 | the furnace — everything at once, on fire | **MAGMA** |
| 3 | **OVERGROWTH** | *new* | green 0.33 | a reclaimed district — vines as rings, pinwheels as windmills | **SAW** |
| 4 | **NEON DISTRICT** | *new* | violet 0.79 | the power grid at night | **ARC** |
| 5 | **FREIGHT LOCKS** | BULKHEAD RUN *(exists)* | steel 0.6, desaturated | doors, presses, crushers | **BREACH** |
| 6 | **GLACIER** | *new* | ice 0.55 + white | a frozen intake — knife-edge slot country | **FREEZE** |
| 7 | **THE GAUNTLET** | GAUNTLET *(exists)* | gold 0.14 on black | the armory corridor — wall guns the whole way | **RAIL** |
| 8 | **THE NULL** | *new* | magenta 0.9, sparse | a dead district above the rim — inverts the surface-is-lethal rule | **GHOST** |
| 9 | **THE CITADEL** | *new, final* | every hue, shifting per section | the dive to the core — one hazard quoted from each district, then the boss | — |

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
- Firing: press SPECIAL and the normal gun *becomes* the special shot while
  the meter drains; press again to conserve what is left. There is no partial
  diamond spent on a tap — activation commits at least one.

The wheel below is a damage multiplier (~3×, "melts"), never a key: the
standard gun finishes every level and every warden. That rule is load-bearing
and does not move.

## The weapons and the wheel

One closed 8-cycle, so any starting district works and solving the order is
part of the game. Each entry reads: *the weapon, what it does, and whose
warden it melts.*

| Weapon | From | The shot | Melts |
| --- | --- | --- | --- |
| **WAVE** | Riverworks | a rising wall of light — your version of the ring's beam; clears anything wide | FURNACE (douses the Foundry warden) |
| **MAGMA** | Foundry | short-range burning flak, damage over time; armor-killer | MANTIS (burns the Overgrowth warden) |
| **SAW** | Overgrowth | a returning blade; shreds anything that spins | MARIONETTE (severs the Neon warden's cables) |
| **ARC** | Neon District | chain lightning that jumps between painted locks — built on paint-to-lock | PORTCULLIS (conducts through the Freight warden's doors) |
| **BREACH** | Freight Locks | a charge shot that blows seals early and staggers presses | AVALANCHE (shatters the Glacier warden's ice) |
| **FREEZE** | Glacier | stops mechanisms — pinwheels stop, presses halt mid-cycle, sliders lock | BROADSIDE (freezes the Gauntlet warden's batteries) |
| **RAIL** | The Gauntlet | a piercing lance through everything in a line | REVENANT (the only thing that catches The Null's phasing warden) |
| **GHOST** | The Null | passes through walls and hits what hides behind them | HYDRA (reaches the Riverworks warden inside its river) |

## The wardens

You fly *alongside* each one, 1943-style, in a dedicated arena past the gate.
Each is its own ship with special attacks — crushing, ramming, missiles,
spawning escorts you must clear. First-pass identities, to be designed
properly one at a time:

| Warden | District | The fight |
| --- | --- | --- |
| **HYDRA** | Riverworks | a segmented river monitor that weaves the bends and crushes you against them; the weak segment cycles |
| **FURNACE** | Foundry | the core on rails — vents plasma walls, rams |
| **MANTIS** | Overgrowth | scythe blades, spawns seed drones that must be shot |
| **MARIONETTE** | Neon District | hangs from light-cables strung across the trench and swings |
| **PORTCULLIS** | Freight Locks | a flying gate that screens itself with doors; crush attack |
| **AVALANCHE** | Glacier | a ram ship shedding regrowing ice plates |
| **BROADSIDE** | The Gauntlet | a gun-deck frigate flying parallel — the wall-of-fire fight |
| **REVENANT** | The Null | phases through the surface and ambushes |

**When a warden dies, an escape pod flies out and gets away.** That is not
color — it is the setup. *(See the parking lot.)*

## The music map

| Track | Status |
| --- | --- |
| Title / select screen | **anthem** — written |
| Riverworks | **water** — written, assigned |
| Foundry | **fire** — written, assigned |
| Overgrowth | to write — pastoral but driving, 6/8 |
| Neon District | to write — synthwave, chromatic bass |
| Freight Locks | to write — industrial ostinato, machine rhythms |
| Glacier | to write — sparse, crystalline, high arpeggios |
| The Gauntlet | to write — a relentless march |
| The Null | to write — hollow, tritone-heavy, the empty one |
| **Boss** | to write — ominous and driving; when the gate falls, `setSong('boss')` on the spot. The engine already switches songs cleanly mid-play |
| **Final run** (Citadel) | to write — the biggest track in the game, quoting the anthem's theme |
| Training | **bumblebee** — where the joke belongs |

Eight to write, four written. The synth has the full NES palette now
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

1. The diamond meter and one weapon end-to-end (WAVE, since THE ESSES and its
   song exist) — meter, gates, HUD, the shot.
2. The second hue, so districts look like districts.
3. The remaining districts one at a time, each level + song + weapon together.
4. The 3×3 select screen and the unlock state.
5. The boss arena machinery and the wardens, one at a time.
6. The Citadel.
