# VECTRENCH

A vector-graphics rails shooter for phones. Describe a canyon in plain language,
and the game builds it and lets you fly it.

Tilt the phone to move within the trench. You do not aim: the crosshair sits
where the nose points, and flying it across a target paints it. Touch anywhere
to fire the gun, and launch missiles at everything you have painted at once.

**[Play it](https://cfreder2.github.io/VECTRENCH/)** — no install, no account, nothing to download. It runs
from the page. Open it on a phone if you want the tilt controls.

## The pre-built levels

Three levels ship finished, in the order they are meant to be flown. They are
hand-tuned specs rather than parsed prose, so the seed is pinned and the run is
the same every time. Each one opens almost empty — the first fifteen seconds of
any of them is one obstacle and barely a gun — and gets harder the whole way
down. All three are machine-checked: for a flyable line, and for taking between
one and two minutes to fly (see [Testing](#testing)).

| | Time to fly | Bulkheads | Speed | |
| --- | --- | --- | --- | --- |
| **[SHAKEDOWN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiU0hBS0VET1dOIiwic2VlZCI6NDIxMSwic3BlZWQiOnsic3RhcnQiOjIzMCwiZW5kIjozMDB9LCJmaW5hbGUiOiJwb3J0Iiwic2VjdGlvbnMiOlt7Im5hbWUiOiJvcGVuIGFwcHJvYWNoIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6MTEyLCJkZXB0aCI6ODgsImN1cnZpbmVzcyI6MC4wOCwiaGlsbGluZXNzIjowLjE1LCJyb3VnaG5lc3MiOjAuMywib2JzdGFjbGVzIjowLjEsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAsIndhbGxndW5zIjowLCJkcm9uZXMiOjAuMTUsInNlYWxzIjowLCJodWUiOjAuNX0seyJuYW1lIjoiZmlyc3QgY29sdW1ucyIsImxlbmd0aCI6MzAwMCwid2lkdGgiOjEwMCwiZGVwdGgiOjk2LCJjdXJ2aW5lc3MiOjAuMTgsImhpbGxpbmVzcyI6MC4yMiwicm91Z2huZXNzIjowLjM2LCJvYnN0YWNsZXMiOjAuMjIsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAuMSwid2FsbGd1bnMiOjAsImRyb25lcyI6MC4yNSwic2VhbHMiOjAsImh1ZSI6MC41fSx7Im5hbWUiOiJ0aGUgYmVuZCIsImxlbmd0aCI6MzAwMCwid2lkdGgiOjg4LCJkZXB0aCI6MTA4LCJjdXJ2aW5lc3MiOjAuMzgsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNDIsIm9ic3RhY2xlcyI6MC4zLCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC4xOCwid2FsbGd1bnMiOjAuMTIsImRyb25lcyI6MC4yOCwic2VhbHMiOjAsImh1ZSI6MC41MX0seyJuYW1lIjoiaGFuZ2luZyBmYW5ncyIsImxlbmd0aCI6MzAwMCwid2lkdGgiOjgwLCJkZXB0aCI6MTE2LCJjdXJ2aW5lc3MiOjAuNDIsImhpbGxpbmVzcyI6MC4zNSwicm91Z2huZXNzIjowLjQ2LCJvYnN0YWNsZXMiOjAuMzgsImtpbmRzIjpbInB5bG9uIiwiZmFuZyJdLCJ0dXJyZXRzIjowLjI1LCJ3YWxsZ3VucyI6MC4yLCJkcm9uZXMiOjAuMywic2VhbHMiOjAsImh1ZSI6MC41MX0seyJuYW1lIjoib25lIGJ1bGtoZWFkIiwibGVuZ3RoIjozMDAwLCJ3aWR0aCI6NzQsImRlcHRoIjoxMjQsImN1cnZpbmVzcyI6MC4zNiwiaGlsbGluZXNzIjowLjMyLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC4zLCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC41LCJ3YWxsZ3VucyI6MC4xOCwiZHJvbmVzIjowLjI1LCJzZWFscyI6MSwiaHVlIjowLjUyfSx7Im5hbWUiOiJydW4gdG8gdGhlIHBvcnQiLCJsZW5ndGgiOjMwMDAsIndpZHRoIjo2OCwiZGVwdGgiOjEyMCwiY3VydmluZXNzIjowLjQsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNDUsIm9ic3RhY2xlcyI6MC4zNiwia2luZHMiOlsiZmFuZyIsImdhdGUiXSwidHVycmV0cyI6MC4zLCJ3YWxsZ3VucyI6MC4zLCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsImh1ZSI6MC41Mn1dfQ)** | ~75s | 1 | 230-300 | The first minute of this game. It opens almost empty and wide on purpose: nothing shoots at you until you have flown a while, and the one bulkhead waits until you have already learned to climb. |
| **[BULKHEAD RUN](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiQlVMS0hFQUQgUlVOIiwic2VlZCI6OTAyMTAsInNwZWVkIjp7InN0YXJ0IjoyNjAsImVuZCI6NDMwfSwiZmluYWxlIjoicG9ydCIsInNlY3Rpb25zIjpbeyJuYW1lIjoid2lkZSBtb3V0aCIsImxlbmd0aCI6NDM1MCwid2lkdGgiOjExOCwiZGVwdGgiOjExMCwiY3VydmluZXNzIjowLjEyLCJoaWxsaW5lc3MiOjAuMiwicm91Z2huZXNzIjowLjM1LCJvYnN0YWNsZXMiOjAuMTIsImtpbmRzIjpbInB5bG9uIl0sInR1cnJldHMiOjAuMDUsIndhbGxndW5zIjowLCJkcm9uZXMiOjAuMiwic2VhbHMiOjAsImh1ZSI6MC4xM30seyJuYW1lIjoiZmlyc3QgbmFycm93aW5nIiwibGVuZ3RoIjo0MzUwLCJ3aWR0aCI6OTYsImRlcHRoIjoxMjgsImN1cnZpbmVzcyI6MC4zLCJoaWxsaW5lc3MiOjAuMjgsInJvdWdobmVzcyI6MC40NSwib2JzdGFjbGVzIjowLjI2LCJraW5kcyI6WyJweWxvbiIsImZhbmciXSwidHVycmV0cyI6MC4xNSwid2FsbGd1bnMiOjAuMTIsImRyb25lcyI6MC4yNSwic2VhbHMiOjAsImh1ZSI6MC4xM30seyJuYW1lIjoidGhlIG5hcnJvd3MiLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo3NCwiZGVwdGgiOjE0NSwiY3VydmluZXNzIjowLjUsImhpbGxpbmVzcyI6MC40LCJyb3VnaG5lc3MiOjAuNTIsIm9ic3RhY2xlcyI6MC40LCJraW5kcyI6WyJweWxvbiIsImZhbmciLCJnYXRlIl0sInR1cnJldHMiOjAuMywid2FsbGd1bnMiOjAuMywiZHJvbmVzIjowLjMsInNlYWxzIjoxLCJodWUiOjAuMTJ9LHsibmFtZSI6ImRlZXAgd2F0ZXIiLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo2MiwiZGVwdGgiOjE1OCwiY3VydmluZXNzIjowLjYyLCJoaWxsaW5lc3MiOjAuNDUsInJvdWdobmVzcyI6MC41OCwib2JzdGFjbGVzIjowLjQ4LCJraW5kcyI6WyJmYW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjQ1LCJ3YWxsZ3VucyI6MC40LCJkcm9uZXMiOjAuMjgsInNlYWxzIjoxLCJodWUiOjAuMTF9LHsibmFtZSI6InNlYWxlZCBkZWVwIiwibGVuZ3RoIjo0MzUwLCJ3aWR0aCI6NTQsImRlcHRoIjoxNjgsImN1cnZpbmVzcyI6MC42NiwiaGlsbGluZXNzIjowLjQ4LCJyb3VnaG5lc3MiOjAuNiwib2JzdGFjbGVzIjowLjQ0LCJraW5kcyI6WyJmYW5nIiwiZ2F0ZSIsInJpbmciXSwidHVycmV0cyI6MC42LCJ3YWxsZ3VucyI6MC4zNSwiZHJvbmVzIjowLjI0LCJzZWFscyI6MSwiaHVlIjowLjF9LHsibmFtZSI6InRoZSBjaG9rZSIsImxlbmd0aCI6NDM1MCwid2lkdGgiOjQ0LCJkZXB0aCI6MTU2LCJjdXJ2aW5lc3MiOjAuNSwiaGlsbGluZXNzIjowLjM1LCJyb3VnaG5lc3MiOjAuNTIsIm9ic3RhY2xlcyI6MC41LCJraW5kcyI6WyJyaW5nIiwiZ2F0ZSJdLCJ0dXJyZXRzIjowLjM1LCJ3YWxsZ3VucyI6MC40NSwiZHJvbmVzIjowLjIsInNlYWxzIjowLCJodWUiOjAuMDl9LHsibmFtZSI6Imxhc3QgbGlnaHQiLCJsZW5ndGgiOjQzNTAsIndpZHRoIjo0MCwiZGVwdGgiOjE1MCwiY3VydmluZXNzIjowLjQyLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ4LCJvYnN0YWNsZXMiOjAuNDUsImtpbmRzIjpbInJpbmciXSwidHVycmV0cyI6MC4zLCJ3YWxsZ3VucyI6MC40LCJkcm9uZXMiOjAuMTgsInNlYWxzIjowLCJodWUiOjAuMDh9XX0)** | ~95s | 3 | 260-430 | The brief this game was built to. A wide mouth that narrows for the rest of your life, sealed three times, with the surface guns waiting every time you are forced over the rim. |
| **[REACTOR](https://cfreder2.github.io/VECTRENCH/#lvl=eyJuYW1lIjoiUkVBQ1RPUiIsInNlZWQiOjY2NjEzLCJzcGVlZCI6eyJzdGFydCI6MzAwLCJlbmQiOjUwMH0sImZpbmFsZSI6InBvcnQiLCJzZWN0aW9ucyI6W3sibmFtZSI6InRoZSBkZXNjZW50IiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6MTAwLCJkZXB0aCI6MTMwLCJjdXJ2aW5lc3MiOjAuMTUsImhpbGxpbmVzcyI6MC4zLCJyb3VnaG5lc3MiOjAuNSwib2JzdGFjbGVzIjowLjE0LCJraW5kcyI6WyJweWxvbiJdLCJ0dXJyZXRzIjowLjA4LCJ3YWxsZ3VucyI6MCwiZHJvbmVzIjowLjI1LCJzZWFscyI6MCwiaHVlIjowLjAyfSx7Im5hbWUiOiJpbnRvIHRoZSByZWQiLCJsZW5ndGgiOjUyMDAsIndpZHRoIjo4MiwiZGVwdGgiOjE1MCwiY3VydmluZXNzIjowLjM1LCJoaWxsaW5lc3MiOjAuNDUsInJvdWdobmVzcyI6MC42LCJvYnN0YWNsZXMiOjAuMywia2luZHMiOlsicHlsb24iLCJzdGFjayJdLCJ0dXJyZXRzIjowLjIsIndhbGxndW5zIjowLjIsImRyb25lcyI6MC4zLCJzZWFscyI6MCwiaHVlIjowLjAyfSx7Im5hbWUiOiJzbGFiIGZpZWxkIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NjYsImRlcHRoIjoxNjgsImN1cnZpbmVzcyI6MC41LCJoaWxsaW5lc3MiOjAuNTUsInJvdWdobmVzcyI6MC42NSwib2JzdGFjbGVzIjowLjQ1LCJraW5kcyI6WyJzdGFjayIsInB5bG9uIl0sInR1cnJldHMiOjAuMywid2FsbGd1bnMiOjAuMzUsImRyb25lcyI6MC4zNSwic2VhbHMiOjEsImh1ZSI6MC4wMX0seyJuYW1lIjoiZ2F1bnRsZXQiLCJsZW5ndGgiOjUyMDAsIndpZHRoIjo1NiwiZGVwdGgiOjE4MCwiY3VydmluZXNzIjowLjY1LCJoaWxsaW5lc3MiOjAuNTUsInJvdWdobmVzcyI6MC42NSwib2JzdGFjbGVzIjowLjU1LCJraW5kcyI6WyJzdGFjayIsImdhdGUiLCJmYW5nIl0sInR1cnJldHMiOjAuNDUsIndhbGxndW5zIjowLjQ1LCJkcm9uZXMiOjAuMzUsInNlYWxzIjowLCJodWUiOjAuMDF9LHsibmFtZSI6InNlYWxlZCBjb3JlIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NTAsImRlcHRoIjoxOTIsImN1cnZpbmVzcyI6MC43LCJoaWxsaW5lc3MiOjAuNSwicm91Z2huZXNzIjowLjYsIm9ic3RhY2xlcyI6MC41LCJraW5kcyI6WyJnYXRlIiwiZmFuZyIsInJpbmciXSwidHVycmV0cyI6MC42Miwid2FsbGd1bnMiOjAuNDIsImRyb25lcyI6MC4zLCJzZWFscyI6MiwiaHVlIjowLjAxfSx7Im5hbWUiOiJpcmlzIGNoYWluIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NDQsImRlcHRoIjoxOTYsImN1cnZpbmVzcyI6MC43NSwiaGlsbGluZXNzIjowLjQ1LCJyb3VnaG5lc3MiOjAuNTUsIm9ic3RhY2xlcyI6MC41NSwia2luZHMiOlsicmluZyIsImdhdGUiXSwidHVycmV0cyI6MC41NSwid2FsbGd1bnMiOjAuNSwiZHJvbmVzIjowLjI4LCJzZWFscyI6MCwiaHVlIjowLjA0fSx7Im5hbWUiOiJsYXN0IGJ1bGtoZWFkIiwibGVuZ3RoIjo1MjAwLCJ3aWR0aCI6NDAsImRlcHRoIjoxOTAsImN1cnZpbmVzcyI6MC42LCJoaWxsaW5lc3MiOjAuNCwicm91Z2huZXNzIjowLjU1LCJvYnN0YWNsZXMiOjAuNSwia2luZHMiOlsicmluZyIsImdhdGUiXSwidHVycmV0cyI6MC42LCJ3YWxsZ3VucyI6MC41LCJkcm9uZXMiOjAuMjYsInNlYWxzIjoxLCJodWUiOjAuMDN9LHsibmFtZSI6ImNvcmUgYXBwcm9hY2giLCJsZW5ndGgiOjUyMDAsIndpZHRoIjozNiwiZGVwdGgiOjE4MCwiY3VydmluZXNzIjowLjQyLCJoaWxsaW5lc3MiOjAuMywicm91Z2huZXNzIjowLjQ1LCJvYnN0YWNsZXMiOjAuNDIsImtpbmRzIjpbInJpbmciXSwidHVycmV0cyI6MC40LCJ3YWxsZ3VucyI6MC41LCJkcm9uZXMiOjAuMjIsInNlYWxzIjowLCJodWUiOjB9XX0)** | ~110s | 4 | 300-500 | Everything at once, on fire, at speed. It still starts gently -- then staggered slabs, an iris chain, four bulkheads, and a core that will not open until you hold the lock. |

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

**Tilt is relative, not absolute.** Neutral is whatever posture you are holding
when a run starts — there is no "upright", and lying on your back works as well
as sitting up. The game takes that neutral as soon as the phone is *still*
rather than the instant you press FLY IT, because pressing FLY IT is also when
it asks for landscape and half the time you are mid-turn; it shows **HOLD THE
PHONE STEADY** until it has one. **CALIBRATE TILT** on the setup panel re-takes
it whenever you want.

No tilt sensor, or permission denied? Drag one finger to steer and touch with a
second to fire. On a desktop, arrow keys or WASD steer, click or SPACE fires, and
SHIFT or M launches.

## The idea

Inside the trench you dodge geometry. Above the rim you are safe from geometry
but exposed to surface batteries — and only up there can you see them well
enough to shoot back.

A **bulkhead** is the solid red wall that seals the trench from floor to rim.
There is no gap and no way to shoot it: the only way past is over the top, into
the guns. The HUD calls it **3.6 seconds out** — timed rather than measured in
distance, because a fixed distance gets shorter exactly as a level gets faster —
and it stays red until you are actually above the lip, at which point it flips
to **BULKHEAD — CLEAR**. The approach is kept free of obstacles so the climb is
the only thing you have to do. Several times a run the trench is sealed by a
bulkhead and the only way through is over the top — into the guns. That trade is
the game.

The run ends at an exhaust port that guns will not breach. It is a missile
target and nothing else, so the last thing a run asks of you is the thing every
gun on the way there was teaching: put the crosshair on it, and launch.

## Weapons

There is no aiming. The marker sits on the ship's nose — literally, it is a
point seven hundred units down the ship's forward axis, projected — so steering
swings it across the frame and holding a turn holds it out to one side. Putting
it on something is a flying problem, which is the problem the game is already
about. It is drawn as a pair of brackets sized to the range of whatever it is
over, so a marker on something far away is small and one on something close
fills the frame.

Anything the marker rests on is painted, and a painted target is locked until
you spend it — but only if you can actually see it. Wireframe has no occlusion,
so without a sight test the rock in front of you hides nothing and a turret on
the surface could be painted from the trench floor, through a wall. Sight is
checked against the canyon itself, which means the surface batteries cannot be
answered from cover: to paint them you have to break the rim, and breaking the
rim is what puts you in their fire. The trade the level design is built on is
the same trade the targeting enforces.

Locks survive losing sight, though. Climb, paint what is up there, drop back
into the trench and launch from cover — the missiles will go over the top. The
exposure was already paid for.

**The gun** fires while you touch the screen, anywhere. Ammunition is infinite
and heat is not: about two and a half seconds of held fire overheats it, and it
will not fire again until it has cooled most of the way back. It is the answer
to whatever is in front of you right now.

**Missiles** cost nothing to fire and never miss, but everything they hit has
to be painted first. Up to eight locks are held at once and a launch spends all
of them simultaneously, then the launcher reloads for five seconds. It is the
answer to a group — a drone wave, or the cover fire waiting above a bulkhead —
and the five seconds is why you cannot make it the answer to everything.

The two weapons are shaped as opposites on purpose. The gun is always available
and always costs something; missiles cost nothing at the moment you fire them
and everything in the twenty seconds of flying it took to line them up.

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
| `game.js` | Physics, camera, collision, enemy fire, both weapons, scoring |
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

The second one is the gate on a pre-built level. It checks four things and exits
non-zero on any of them:

- a flyable line exists on the shipped seed, and under 40 **other** seeds too,
  because **RESEED** re-rolls the seed in play — a shape that is only clearable
  on the seed it shipped with is a shape that will betray somebody
- the level takes between 60 and 135 seconds to fly
- every authored bulkhead actually got placed (the compiler caps them at one per
  2600 units of section)
- `src/levels.js` still matches `levels/*.json`

The reachability search runs against `MAX_VX` and `MAX_VY` imported from
`game.js` rather than copies, so making the ship faster re-proves the levels
instead of quietly invalidating the proof.

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
