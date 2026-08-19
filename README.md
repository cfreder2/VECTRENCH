# VECTRENCH

A vector-graphics rails shooter for phones. Describe a canyon in plain language,
and the game builds it and lets you fly it.

Tilt the phone to move within the trench, tap to shoot at where you tapped, and
hold on a target long enough to lock a missile.

**[Play it](https://cfreder2.github.io/VECTRENCH/)** — no install, no account, nothing to download. It runs
from the page. Open it on a phone if you want the tilt controls.

## The pre-built levels

Three levels ship finished, in the order they are meant to be flown. They are
hand-tuned specs rather than parsed prose, so the seed is pinned and the run is
the same every time — and every one of them is machine-checked to be flyable
(see [Testing](#testing)).

| | Length | Bulkheads | Speed | |
| --- | --- | --- | --- | --- |
| **[SHAKEDOWN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiU0hBS0VET1dOIiwic2VlZCI6NDIxMSwic3BlZWQiOnsic3RhcnQiOjI1MCwiZW5kIjozMzB9LCJmaW5hbGUiOiJwb3J0Iiwic2VjdGlvbnMiOlt7Im5hbWUiOiJvcGVuIGFwcHJvYWNoIiwibGVuZ3RoIjo5MDAsIndpZHRoIjoxMDQsImRlcHRoIjo5MiwiY3VydmluZXNzIjowLjE0LCJoaWxsaW5lc3MiOjAuMiwicm91Z2huZXNzIjowLjMsIm9ic3RhY2xlcyI6MC4zNSwia2luZHMiOlsicHlsb24iXSwidHVycmV0cyI6MC4xLCJ3YWxsZ3VucyI6MCwiZHJvbmVzIjowLjMsInNlYWxzIjowLCJodWUiOjAuNX0seyJuYW1lIjoiZmlyc3QgZmFuZ3MiLCJsZW5ndGgiOjExMDAsIndpZHRoIjo3OCwiZGVwdGgiOjExMiwiY3VydmluZXNzIjowLjM0LCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQyLCJvYnN0YWNsZXMiOjAuNTUsImtpbmRzIjpbInB5bG9uIiwiZmFuZyJdLCJ0dXJyZXRzIjowLjIsIndhbGxndW5zIjowLjE2LCJkcm9uZXMiOjAuNDIsInNlYWxzIjowLCJodWUiOjAuNX0seyJuYW1lIjoib25lIGJ1bGtoZWFkIiwibGVuZ3RoIjoxMTAwLCJ3aWR0aCI6NzAsImRlcHRoIjoxMjIsImN1cnZpbmVzcyI6MC4zLCJoaWxsaW5lc3MiOjAuMzIsInJvdWdobmVzcyI6MC40NSwib2JzdGFjbGVzIjowLjUsImtpbmRzIjpbInB5bG9uIiwiZmFuZyJdLCJ0dXJyZXRzIjowLjQ2LCJ3YWxsZ3VucyI6MC4yLCJkcm9uZXMiOjAuNCwic2VhbHMiOjEsImh1ZSI6MC41Mn1dfQ)** | 3100u | 1 | 250-330 | Wide, bright and forgiving. One bulkhead near the end, so you meet the climb before it can kill you. |
| **[BULKHEAD RUN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiQlVMS0hFQUQgUlVOIiwic2VlZCI6OTAyMTAsInNwZWVkIjp7InN0YXJ0IjozMDAsImVuZCI6NDcwfSwiZmluYWxlIjoicG9ydCIsInNlY3Rpb25zIjpbeyJuYW1lIjoid2lkZSBtb3V0aCIsImxlbmd0aCI6ODAwLCJ3aWR0aCI6MTEyLCJkZXB0aCI6MTI4LCJjdXJ2aW5lc3MiOjAuMiwiaGlsbGluZXNzIjowLjI4LCJyb3VnaG5lc3MiOjAuNCwib2JzdGFjbGVzIjowLjM2LCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC4yLCJ3YWxsZ3VucyI6MC4xNCwiZHJvbmVzIjowLjI2LCJzZWFscyI6MCwiaHVlIjowLjEzfSx7Im5hbWUiOiJ0aGUgbmFycm93cyIsImxlbmd0aCI6MTQwMCwid2lkdGgiOjU2LCJkZXB0aCI6MTUwLCJjdXJ2aW5lc3MiOjAuNiwiaGlsbGluZXNzIjowLjQ0LCJyb3VnaG5lc3MiOjAuNTUsIm9ic3RhY2xlcyI6MC42Niwia2luZHMiOlsicHlsb24iLCJmYW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjM2LCJ3YWxsZ3VucyI6MC40MiwiZHJvbmVzIjowLjMsInNlYWxzIjoxLCJodWUiOjAuMTJ9LHsibmFtZSI6InNlYWxlZCBkZWVwIiwibGVuZ3RoIjoxODAwLCJ3aWR0aCI6NDgsImRlcHRoIjoxNjgsImN1cnZpbmVzcyI6MC42OCwiaGlsbGluZXNzIjowLjUsInJvdWdobmVzcyI6MC42LCJvYnN0YWNsZXMiOjAuNjIsImtpbmRzIjpbImZhbmciLCJnYXRlIiwicmluZyJdLCJ0dXJyZXRzIjowLjY4LCJ3YWxsZ3VucyI6MC4zOCwiZHJvbmVzIjowLjI0LCJzZWFscyI6MiwiaHVlIjowLjF9LHsibmFtZSI6InRoZSBjaG9rZSIsImxlbmd0aCI6OTAwLCJ3aWR0aCI6MzgsImRlcHRoIjoxNDgsImN1cnZpbmVzcyI6MC40OCwiaGlsbGluZXNzIjowLjM1LCJyb3VnaG5lc3MiOjAuNSwib2JzdGFjbGVzIjowLjU4LCJraW5kcyI6WyJyaW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjMsIndhbGxndW5zIjowLjQ4LCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsImh1ZSI6MC4wOH1dfQ)** | 4900u | 3 | 300-470 | The brief this game was built to. A wide mouth that narrows for the rest of your life, sealed three times, guns waiting each time you are forced over the rim. |
| **[REACTOR](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiUkVBQ1RPUiIsInNlZWQiOjY2NjEzLCJzcGVlZCI6eyJzdGFydCI6MzgwLCJlbmQiOjU2MH0sImZpbmFsZSI6InBvcnQiLCJzZWN0aW9ucyI6W3sibmFtZSI6ImRlc2NlbnQiLCJsZW5ndGgiOjEwMDAsIndpZHRoIjo2MiwiZGVwdGgiOjE2OCwiY3VydmluZXNzIjowLjUsImhpbGxpbmVzcyI6MC41OCwicm91Z2huZXNzIjowLjY4LCJvYnN0YWNsZXMiOjAuNzUsImtpbmRzIjpbInN0YWNrIiwicHlsb24iXSwidHVycmV0cyI6MC4zLCJ3YWxsZ3VucyI6MC40OCwiZHJvbmVzIjowLjUsInNlYWxzIjoxLCJodWUiOjAuMDJ9LHsibmFtZSI6InNsYWIgZ2F1bnRsZXQiLCJsZW5ndGgiOjE4MDAsIndpZHRoIjo0NiwiZGVwdGgiOjE4NiwiY3VydmluZXNzIjowLjcyLCJoaWxsaW5lc3MiOjAuNTgsInJvdWdobmVzcyI6MC42NSwib2JzdGFjbGVzIjowLjk1LCJraW5kcyI6WyJzdGFjayIsImdhdGUiLCJmYW5nIl0sInR1cnJldHMiOjAuNSwid2FsbGd1bnMiOjAuNTYsImRyb25lcyI6MC42LCJzZWFscyI6MiwiaHVlIjowLjAxfSx7Im5hbWUiOiJpcmlzIGNoYWluIiwibGVuZ3RoIjoxMzAwLCJ3aWR0aCI6NDAsImRlcHRoIjoxOTYsImN1cnZpbmVzcyI6MC43OCwiaGlsbGluZXNzIjowLjQ2LCJyb3VnaG5lc3MiOjAuNTUsIm9ic3RhY2xlcyI6MC45LCJraW5kcyI6WyJyaW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjU4LCJ3YWxsZ3VucyI6MC41MiwiZHJvbmVzIjowLjU1LCJzZWFscyI6MSwiaHVlIjowLjA0fSx7Im5hbWUiOiJjb3JlIGFwcHJvYWNoIiwibGVuZ3RoIjo4MDAsIndpZHRoIjozNCwiZGVwdGgiOjE3NiwiY3VydmluZXNzIjowLjQyLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ1LCJvYnN0YWNsZXMiOjAuNjIsImtpbmRzIjpbInJpbmciXSwidHVycmV0cyI6MC40LCJ3YWxsZ3VucyI6MC41OCwiZHJvbmVzIjowLjQsInNlYWxzIjowLCJodWUiOjB9XX0)** | 4900u | 4 | 380-560 | Everything at once, on fire, at speed. Staggered slabs, an iris chain, four bulkheads, and a core that will not open until you hold the lock. |

They are also the first row of buttons in the game, and they live as plain JSON
in [`levels/`](levels) — read them, copy one, change a number. That is the whole
authoring format.

## Running it locally

It is a static page with no build step and no dependencies. Serve the directory
over HTTP (ES modules do not load from `file://`) and open it:

```bash
git clone https://github.com/cfreder2/VECTRENCH.git
cd VECTRENCH
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

## Making a level

**[docs/LEVELS.md](docs/LEVELS.md) is the full authoring guide** — the whole prose
vocabulary, every spec field and its range, the rules the compiler enforces, and
how to add a level of your own to the game. What follows is the short version.

### Describing one

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

### Writing one by hand

Prose is a way in, not the format. A level is a spec — plain JSON, every field
clamped — and you can write one directly instead:

```bash
$EDITOR levels/my-level.json     # copy one of the three and change numbers
node tools/levels.mjs --sync     # compile levels/ into src/levels.js
node tools/levels.mjs            # prove it is flyable, print its share link
```

It then appears as a button in the game alongside the other three.
[docs/LEVELS.md](docs/LEVELS.md#2-write-the-spec) documents every field.

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
| `levels.js` | The pre-built levels. Generated from `levels/*.json` — do not edit |
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

Outside `src/`: [`levels/`](levels) holds the pre-built levels as plain spec
JSON — the source of truth for them — and `tools/levels.mjs` compiles that
directory into `src/levels.js`, because the single-file build has no directory
to read at runtime.

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
node tools/audit.mjs            # clearability across the prose examples and 60 seeds
node tools/levels.mjs           # the same proof over each pre-built level, plus 40 reseeds
node tools/levels.mjs --check   # src/levels.js still matches levels/*.json
```

The second one is the gate on a pre-built level. It re-audits each level under 40
different seeds, not just its own, because **RESEED** re-rolls the seed in play —
a shape that is only clearable on the seed it shipped with is a shape that will
betray somebody. It also reports realized bulkheads against authored ones, since
the compiler caps them at one per 900 units of section. Any of those failing
exits non-zero.

## Single-file build

`dist/vectrench.html` is the whole game inlined into one file — open it directly
from disk, no server needed. Rebuild it after changing anything under `src/`:

```bash
node tools/levels.mjs --sync    # only if levels/*.json changed
node tools/bundle.mjs
```

The bundler is a concatenator, not a real bundler: it emits the modules in
dependency order into one scope with imports and exports stripped. It aborts if
two modules declare the same top-level name, so the shortcut stays honest.

Two things in it are load-order-sensitive rather than merely tidy, and both would
fail silently if reordered: `game.js` reads `CANYON` from `terrain.js` at
definition time, and `llm.js` builds its system prompt from `spec.js`'s `FIELDS`
at definition time. Top-level `const` is not hoisted.
