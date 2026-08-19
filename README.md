# VECTRENCH

A vector-graphics rails shooter for phones. Describe a canyon in plain language,
and the game builds it and lets you fly it.

Tilt the phone to move within the trench, tap to shoot at where you tapped, and
hold on a target long enough to lock a missile.

## Running it

It is a static page with no build step and no dependencies. Serve the directory
over HTTP (ES modules do not load from `file://`) and open it:

```bash
cd game
python3 -m http.server 8000     # or: npx http-server -p 8000
```

Then open `http://<your-machine>:8000/` on the phone. Tap **TAP TO BEGIN** — that
first gesture is what lets the browser grant motion access and start audio, both
of which require a user gesture. Use **CALIBRATE TILT** while holding the phone
the way you intend to play; that posture becomes neutral.

No tilt sensor, or permission denied? Hold one finger to aim and shoot, and drag
a second finger anywhere to steer. On a desktop, arrow keys or WASD steer and the
mouse aims.

## The idea

Inside the trench you dodge geometry. Above the rim you are safe from geometry
but exposed to surface batteries. Three times a run the trench is sealed by a
bulkhead and the only way through is over the top — into the guns. That trade is
the game.

The run ends at an exhaust port that guns will not breach. You have to hold the
reticle on it long enough to lock, and the approach slows down to give you the
time.

## Describing levels

Type a description and press **BUILD**. Prose is split on sequence markers
("then", "after that", "finally") and each segment becomes one section of the
run, flown in order. So:

> Start wide and open, then tighten into a deep twisting trench packed with
> hanging fangs and irises, seal it twice with heavy turret cover on the
> surface, finish with a narrow choke and an exhaust port.

The vocabulary covers width (`tight`, `cavernous`, `claustrophobic`), depth
(`shallow`, `bottomless chasm`), turning (`straight`, `serpentine`, `hairpin`),
relief (`flat`, `rolling`, `hilly`), density (`sparse`, `wall to wall`),
obstacles (`columns`, `stalactites`, `bulkheads`, `irises`, `staggered slabs`),
enemies (`turrets`, `wall guns`, `drones`), bulkheads (`sealed three times`),
speed (`ludicrous speed`), colour (`molten red`, `icy blue`, `toxic green`), and
length (`short`, `long`, `for 2000 units`). Intensifiers work: `very tight` is
tighter than `tight`. Explicit numbers win over adjectives.

**BUILD** shows you what it understood and, below the plan and elevation
schematic, what it actually placed. **SCHEMATIC** collapses the panel so you can
study the whole run before flying it. **RESEED** keeps the shape and re-rolls
placement. **COPY LINK** puts the entire level in the URL, so a level is a link.

### Using Claude instead

The offline parser understands a fixed vocabulary and always works, including
with no network. Ticking **USE CLAUDE** sends your prose to Claude instead, which
fills in the same level spec from arbitrary description. It needs an Anthropic
API key, which is stored only in your browser's localStorage and sent only to
Anthropic's API from your own device. If the call fails for any reason the game
falls back to the offline parser and still gives you a level.

This path loads the official SDK from a CDN on demand, so it is the one feature
that needs network access. The game itself never does.

## How it fits together

```
prose ──> nl.js  (offline grammar)  ──┐
                                      ├──> spec (JSON) ──> track.js  ──> geometry
prose ──> llm.js (Claude, optional) ──┘        │           level.js  ──> obstacles, enemies, port
                                               └──> URL hash, so a spec is shareable
```

The spec is the contract. Everything upstream of it is a front-end, everything
downstream consumes it, and `spec.js` clamps every field — so a spec from a link,
a model, or a typo can be strange but never unplayable.

| File | Owns |
| --- | --- |
| `spec.js` | The level spec: fields, ranges, clamping, URL encoding, examples |
| `nl.js` | Prose → spec, offline, deterministic |
| `llm.js` | Prose → spec via Claude (optional) |
| `track.js` | Spec → canyon geometry; the rail, widths, rim heights |
| `level.js` | Spec → obstacles, guns, drone waves, the port |
| `terrain.js` | Drawing the canyon |
| `entities.js` | Ship, obstacles, enemies, projectiles, particles |
| `game.js` | Physics, camera, collision, enemy fire, lock-on, scoring |
| `renderer.js` | The vector display: batched glowing lines, phosphor trails |
| `hud.js` | HUD and the level schematic |
| `font.js` | Stroke font |
| `input.js` | Tilt, touch, keyboard |
| `audio.js` | Synthesised sound, no samples |
| `collide.js` | Swept segment-sphere tests |
| `ui.js` | Screens and the authoring panel |
| `main.js` | Bootstrap and the frame loop |

### Rendering

Everything visible is a glowing line segment. Segments are transformed and
near-clipped on the CPU, emitted as screen-space quads into one buffer, and drawn
in a single additive pass. Additive blending is order-independent, so there is no
depth buffer and no sorting. The scene renders into a framebuffer that is only
partly faded each frame; that leftover light is the phosphor trail, and it does
most of the work of selling speed.

Wireframe has no occlusion, so the surface deck is faded by altitude: below the
rim you cannot see the plane a solid renderer would hide behind rock, and
breaking the rim reveals it.

## Testing

`tools/audit.mjs` is a fairness check, not a smoke test: it walks a compiled
level and runs a reachability search over the trench cross-section at each
obstacle, using the ship's real lateral and vertical speed limits, to prove a
flyable line exists. Run it over a spread of seeds before changing the generator.

```bash
node tools/audit.mjs            # clearability across the built-in levels and 60 seeds
```

## Single-file build

`dist/vectrench.html` is the whole game inlined into one file — open it directly
from disk, no server needed. Rebuild it after changing anything under `src/`:

```bash
node tools/bundle.mjs
```

The bundler is a concatenator, not a real bundler: it emits the modules in
dependency order into one scope with imports and exports stripped. It aborts if
two modules declare the same top-level name, so the shortcut stays honest.

Two things in it are load-order-sensitive rather than merely tidy, and both would
fail silently if reordered: `game.js` reads `CANYON` from `terrain.js` at
definition time, and `llm.js` builds its system prompt from `spec.js`'s `FIELDS`
at definition time. Top-level `const` is not hoisted.
