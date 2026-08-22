// The run itself: ship physics on the rail, the camera, collision, enemy fire,
// and the lock-on that ends the level.
//
// Steering is absolute-position control, not thrust: the tilt of the phone maps
// to where in the cross-section the ship sits. That is what makes an on-rails
// flyer feel precise at speed -- the ship goes where you point it and re-centres
// when you let go.

import { clamp, lerp, approach, hash2, smoothstep, TAU } from './math.js';
import { makeWarden, updateWarden, drawWarden, drawPod } from './boss.js';
import { Track, makeFrame } from './track.js';
import { buildLevel } from './level.js';
import { TerrainRenderer, CANYON } from './terrain.js';
import {
  Weapons, Particles, drawShip, drawObstacles, drawEnemies,
  shipBasis, shipLocalToWorld, MUZZLES,
} from './entities.js';
import { drawHud, drawReticle, drawTargetBox } from './hud.js';
import {
  segSphere, hitsObstacle, frameOf, PORT_BEAM, RING_BEAM, ringBeamLife,
  SHIP_HX, SHIP_HY, KNIFE_HX, KNIFE_HY,
} from './collide.js';
import { drawText } from './font.js';

// The ship's motion limits. Exported because tools/audit.mjs proves levels are
// flyable against them -- a copy of these numbers that drifted would make the
// audit confidently wrong.
//
// Vertical is the faster axis, which looks backwards until you count what each
// one is for: lateral movement crosses a trench 50 to 300 wide, while vertical
// movement has to climb a rim up to 240 tall and do it inside the warning a
// bulkhead gives you. At parity the climb is the thing that kills you.
export const MAX_VX = 145;
export const MAX_VY = 160;

/** How fast steering input becomes velocity. 1/rate is the lag, in seconds. */
const STEER_RATE = 14;
const FAR = CANYON.DRAW;
const CAM_BACK = 66;
const SHIELD_MAX = 100;
// The trench is cover, and cover is what turns the surface into a choice rather
// than a toll. Shields come back only below the rim and only after a few clean
// seconds, so diving back in to heal is a move you can actually make -- and the
// price of staying up top is that you never get to make it.
const SHIELD_REGEN = 7.5;
const SHIELD_CALM = 3;

// --- weapons ------------------------------------------------------------
//
// Two weapons with opposite shapes, so choosing between them is a real choice
// rather than a preference. The gun is always available and always costs heat.
// Missiles cost nothing to fire and never miss, but everything they will hit
// has to be painted first, and painting is done by flying -- which is the part
// that is already hard.

const GUN_CADENCE = 0.09;
const HEAT_PER_SEC = 0.38;    // ~2.6 seconds of held fire from cold to overheat
const COOL_PER_SEC = 0.5;
const HEAT_RESUME = 0.25;     // overheated: must cool back to this to fire again

const LOCK_MAX = 8;
// You can paint exactly as far as you can see, and no further -- a lock box
// hanging in the air over an enemy the renderer has not reached yet is a lie.
// It also sets how many locks a moment can offer: guns are spaced about a
// thousand units apart, so open stretches give you one at a time and the
// clusters -- a drone wave, the cover fire around a bulkhead -- give you five.
// That is the shape of the weapon: it pays off exactly where it is needed.
const TARGET_RANGE = FAR;
const PAINT_TIME = 0.24;      // crosshair dwell that turns a target into a lock
// How wide the crosshair paints. The loose number is a quarter of the screen's
// short side, which is generous enough that pointing the ship down the canyon
// paints most of what is in front of it -- it plays as an auto-lock, and it is
// fun, so it stays as a setting. The strict one is the reticle itself: a target
// is painted when it is actually inside the brackets.
const PAINT_RADIUS = 108;     // loose, in scale units
const PAINT_TIGHT = 26;       // strict: the smallest the brackets ever draw
const CROSSHAIR_PULL = 0.35;  // how far the crosshair drifts toward a target
const MISSILE_COOLDOWN = 5;

// How far the nose swings off the trench axis at full steer. This is what makes
// the crosshair something you point rather than something you carry: holding
// the steer holds it off to one side, centring the stick brings it back.
const YAW_MAX = 0.52;
const AIM_DIST = 700;         // where along the nose the crosshair is reckoned
const RETICLE_WORLD = 34;     // its size in world units, so distance shrinks it
const LOS_SAMPLES = 9;        // points tested along a sight line
const LOS_FADE = 7;           // how fast a target fades in when it comes into view
const SEAL_WARN_SECS = 3.6;   // how long before a bulkhead the alarm starts

// The surface. These are the numbers that decide whether breaking the rim
// feels like a decision or like a formality.
const SALVO_INTERVAL = 0.11;  // seconds between tubes of one rack
const BATTERY_RELOAD = 3.2;
const GATLING_SPINUP = 0.55;  // long enough to see it and duck back under
const GATLING_CADENCE = 0.04;
const GATLING_SPREAD = 0.78;  // tighter: the stream is meant to connect
// On edge. The ship is a wide flat thing, so turning it ninety degrees trades
// the width it needs for height it needs -- which is the whole point: a slot
// too narrow to fly through level is easy sideways, and vice versa.
const KNIFE_RATE = 7.5;       // 1/rate is the lag: about a seventh of a second
const BARREL_RATE = 11;       // radians a second: a whole turn in about half of one
const BARREL_SLIDE = 165;     // units a second sideways while it goes round       // how fast it goes over, and comes back

// The burn: a tank you hold open rather than a shot you fire. It runs for as
// long as the button is down and there is charge left, and it fills back up
// when it is not. Letting go early keeps what is left, which makes it a thing
// you spend in pieces across a run instead of once.
const BOOST_MUL = 1.5;
const BOOST_TANK = 2.4;       // seconds of burn in a full tank
const BOOST_REFILL = 8;       // seconds to fill it from empty
const BURN_SPOOL_UP = 4;      // 1/rate is the lag in seconds, so about a third of one
const BURN_SPOOL_DOWN = 6;
const SUPER_MUL = 2.1;        // burning and gated at the same time
const GATE_TIME = 3;          // seconds a turbo gate is worth, and they add up

// The special weapon. It meters in diamonds, and a diamond is two seconds of
// fire: three to start, a slow trickle back up to three, diamond gates that
// stack it to eight, and a prism -- very rare -- that fills it outright. The
// trickle refills only to base, so passive flying never banks a long burst:
// anything past three diamonds was flown through a gate to get.
const DIAMOND_SECONDS = 2;    // one diamond is this much special fire
const DIAMOND_BASE = 3;       // a run starts here, and the trickle stops here
const DIAMOND_CAP = 8;        // gates can stack it to here
const DIAMOND_TRICKLE = 10;   // seconds of flying per diamond earned back

// ARC: the Neon District's weapon. Hold SPECIAL and a live stream of chain
// lightning pours out of the ship: it strikes whatever is closest to the
// crosshair, then whatever is closest to *that*, and so on -- three jumps at
// most, each landing softer than the last. The bolt itself is rebuilt every
// frame, so it crackles; damage lands on a fixed tick underneath, so the DPS
// is exact no matter the framerate.
const ARC_TICK = 0.12;        // seconds between damage ticks
const ARC_DAMAGE = 2;         // at the head of the chain, per tick
const ARC_FALLOFF = 0.65;     // each jump lands this fraction of the last
const ARC_LINKS = 4;          // the first strike plus three jumps
const ARC_RANGE = 900;        // furthest first strike
const ARC_JUMP = 260;         // furthest jump between ships

// Each special is its district's color: the diamonds, the bolt, the HUD.
export const SPECIAL_COLORS = {
  arc: [0.75, 0.4, 1],
};

/**
 * A lightning path from a to b: subdivided, with the displacement flipping
 * side at every vertex -- which is what makes it a zigzag rather than a
 * wobble -- plus a couple of short dead-end branches. Reseeded by the caller
 * every frame, so a standing bolt crackles instead of hanging like a wire.
 */
export function boltPath(a, b, seed) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  // Two axes perpendicular to the bolt, for the zigzag to live in.
  let ux = -dy, uy = dx, uz = 0;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 0.01) { ux = 1; uy = 0; uz = 0; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  const vx = (dy * uz - dz * uy) / len;
  const vy = (dz * ux - dx * uz) / len;
  const vz = (dx * uy - dy * ux) / len;

  const segs = Math.max(5, Math.min(9, Math.round(len / 55)));
  const amp = Math.min(16, len * 0.09);
  const pts = [[a[0], a[1], a[2]]];
  const branches = [];
  for (let i = 1; i < segs; i++) {
    const f = i / segs;
    const side = (i % 2 ? 1 : -1) * (0.5 + hash2(seed, i * 7));
    const slip = (hash2(seed, i * 13) - 0.5) * 0.8;
    const px = a[0] + dx * f + ux * amp * side + vx * amp * slip;
    const py = a[1] + dy * f + uy * amp * side + vy * amp * slip;
    const pz = a[2] + dz * f + uz * amp * side + vz * amp * slip;
    pts.push([px, py, pz]);
    // A branch: a short fork off this vertex, going nowhere on purpose.
    if (hash2(seed, i * 29) < 0.3) {
      const bl = amp * (0.8 + hash2(seed, i * 31));
      const bs = hash2(seed, i * 37) - 0.5;
      branches.push([[px, py, pz], [
        px + ux * bl * bs * 2 + dx / segs * 0.4,
        py + uy * bl * bs * 2 + dy / segs * 0.4,
        pz + uz * bl * bs * 2 + dz / segs * 0.4,
      ]]);
    }
  }
  pts.push([b[0], b[1], b[2]]);
  return { pts, branches };
}

// The one heavy thing that lives in the trench with you: two shots and a
// missile, on a cycle short enough to matter in the three seconds you are
// inside its reach.
const EMP_BURST = 3;           // heavy shells in a burst
const EMP_BURST_STEP = 0.17;   // seconds between them
const EMP_BURST_GAP = 1.15;    // and between bursts
const EMP_MISSILE_RANGE = 560; // it launches its one missile from about here

// How well the guns lead you, and what boosting does to that.
//
// The lead was computed from the ship's speed with a flat 0.85 fudge on it,
// which is a fixed *fraction* of a distance that grows with speed -- so the
// faster you went the further the shells fell behind, and at 2.1x nothing could
// touch you at all. Aim is now a roll: a shot is either laid properly, velocity
// and all, or thrown deliberately wide. Speed buys a worse roll rather than
// geometric immunity.
const AIM_BASE = 0.8;         // shots laid properly when you are not boosting
const AIM_BOOST = 0.6;        // and when you are
const AIM_DROP = 0.1;         // less again for each further boost stacked on
const AIM_MISS = 26;          // how far wide a thrown shot goes, in units
// Even a shot laid properly is not laid perfectly. Solving the intercept
// exactly made every gun a marksman -- 44% of shots landing where 15% had, and
// the whole game twice as lethal.
//
// The error grows with the shell's flight time, which is what a gunner's error
// actually does: a shot across the width of the trench is nearly a certainty
// and one at the far end of its range is a guess. It also puts the danger where
// it belongs, close in, instead of spread evenly over a thousand units.
const AIM_JITTER = 6;         // units, at zero range
const AIM_DRIFT = 110;         // units more per second the shell is in the air
// A shell has to outrun the thing it is shooting at. At a burn the ship was
// doing 567 units a second against shells doing 520, and one per cent of them
// landed: not a matter of aim, a matter of arithmetic.
//
// Scaled by the burn rather than by the ship's speed outright, so that a gun
// firing at a ship going its normal speed throws exactly the shell it always
// did. Only the boost is compensated for.
const SHELL_BOOST = 1.7;      // extra shell speed per unit of boost multiplier

// What a missile takes off what it hits. Everything light dies to one; the
// heavies -- an emplacement at 14, the bigger batteries at 10 and up -- take
// two, or one and a few seconds of the gun.
const MISSILE_DAMAGE = 8;

const SEAL_DROP_SPEED = 190;  // how fast a bulkhead sinks once its panels go

// The port's defence. It does not turn -- the shafts around its rim are fixed,
// and it fires out of them one after another around the ring, so what turns is
// the firing and not the gun. What that builds in front of it is a wall of
// beams with a gap running round it, which is the way in.
const BEAM_INTERVAL = 0.13;   // one shaft after another: pew pew pew
const BEAM_HALF = 4.5;        // how close counts as flying into one
const BEAM_DAMAGE = 16;
const RING_BEAM_DAMAGE = 20;
// Twelve o'clock is a quarter turn round from the zero the arms are numbered
// from, and counting down from it sweeps clockwise: twelve, three, six, nine.
const RING_TOP_ARM = 2;

const RADIUS = { turret: 13, wallgun: 11, emplacement: 21, drone: 11, port: 20, boss: 26, bosspart: 9 };

export class Game {
  constructor(rd, input, audio) {
    this.rd = rd;
    this.input = input;
    this.audio = audio;
    this.terrain = null;
    this.weapons = new Weapons();
    this.particles = new Particles();

    this.camFrame = makeFrame();
    this.lookFrame = makeFrame();
    this.shipFrame = makeFrame();
    this.basis = { r: [0, 0, 0], u: [0, 0, 0], f: [0, 0, 0] };
    this.eye = [0, 0, 0];
    this.look = [0, 0, 0];
    this.camR = [0, 0, 0];
    this.camU = [0, 0, 0];
    this.camF = [0, 0, 0];
    this.shipPos = [0, 0, 0];
    this._p = [0, 0, 0];
    this._q = [0, 0, 0];
    this._frame = [0, 0, 1, 0];
    this._aim = [0, 0, 0];
    this._l = [0, 0, 0];

    this.phase = 'idle';
    // The fitted special weapon is equipment, not run state: a reset starts
    // the level over, it does not strip the ship. The UI sets this from what
    // the campaign has earned; null until a warden has handed one over.
    this.special = null;
    this.spec = null;
    this.track = null;
    this.level = null;
  }

  load(spec) {
    this.spec = spec;
    this.bossDef = spec.boss || null;
    this.track = new Track(spec);
    this.level = buildLevel(spec, this.track);
    this.terrain = new TerrainRenderer(this.track);
    this.reset();
  }

  reset() {
    const tr = this.track;
    this.t = 40;
    this.speed = this.spec.speed.start;
    this.shipX = 0;
    this.shipY = tr.railY(this.t);
    this.velX = 0;
    this.velY = 0;
    this.bank = 0;
    this.paintToLock = true;    // must the crosshair be on it, or merely near it
    this.knife = 0;             // 0 level, 1 fully on edge -- |sin| of the roll
    this.rollAng = 0;           // signed, so the ship can go over either way
    this.rollTarget = 0;
    this.barreling = false;
    this.barrelDir = 0;         // a barrel roll is a dodge: it takes you sideways
    this.boost = BOOST_TANK;    // seconds of burn left in the tank
    this.burning = false;
    this.burnSpent = false;
    this.gateTime = 0;
    this.speedMul = 1;
    this.diamonds = DIAMOND_BASE;
    this.specialOn = false;
    this.specialEntry = 0;      // the meter at activation: a tap commits one
    this.zapTimer = 0;
    this.arcs = [];             // live bolts, drawn for a few frames each
    this.pitch = 0;
    this.yaw = 0;
    this.shield = SHIELD_MAX;
    this.shieldMax = SHIELD_MAX;
    this.calm = 0;
    this.score = 0;
    this.time = 0;
    this.shake = 0;
    this.hurt = 0;
    this.fireTimer = 0;
    this.heat = 0;
    this.overheated = false;
    this.locks = [];
    this.paintTarget = null;
    this.paintProgress = 0;
    this.missileCooldown = 0;
    this.portReloaded = false;
    this.lockedFlash = 0;
    this.message = '';
    this.messageTimer = 0;
    this.obCursor = 0;
    this.grinding = false;
    this.wallWarn = 0;
    this.exposed = false;
    this.deathTimer = 0;
    this.winTimer = 0;
    this.kills = 0;
    this.hitsTaken = 0;
    this.droppedSeals = new Set();

    this.drones = [];
    for (const w of this.level.drones) w.spawned = false;
    for (const ob of this.level.obstacles) {
      ob.dropY = 0; ob.gone = false; ob.dropping = false; ob.taken = false;
      ob.beams = null;
    }
    for (const e of this.level.enemies) {
      e.alive = true;
      e.hp = e.maxHp;
      e.flash = 0;
      e.paint = 0;
      e.los = 1;
      e.salvo = 0;
      e.wind = 0;
      e.barrel = 0;
      e.spin = hash2((e.t * 3) | 0, 9) * TAU;
      e.launched = false;
      e.burst = 0;
    }
    if (this.level.port) {
      this.level.port.alive = true;
      this.level.port.hp = 1;
      this.level.port.paint = 0;
      this.level.port.spin = 0;
      this.level.port.beams = null;
    }
    for (const ob of this.level.obstacles) ob.hit = false;
    this.weapons.clear();
    this.particles.clear();
    this.aimDist = AIM_DIST;
    this.knife = 0;
    this.rollAng = 0;
    this.rollTarget = 0;
    this.barreling = false;
    this.barrelDir = 0;
    this.boost = BOOST_TANK;
    this.burning = false;
    this.burnSpent = false;
    this.diamonds = DIAMOND_BASE;
    this.specialOn = false;
    this.specialEntry = 0;
    this.zapTimer = 0;
    this.arcs.length = 0;
    // The gates that feed the meter wear the equipped weapon's color.
    const scol = SPECIAL_COLORS[this.special] || [0.75, 0.4, 1];
    for (const ob of this.level.obstacles) {
      if (ob.kind === 'diamond' || ob.kind === 'prism') ob.col = scol;
    }
    this.gateTime = 0;
    this.speedMul = 1;
    this.boss = null;
    this.pod = null;
    this.ascentTimer = 0;
    this.escapeTimer = 0;
    this.lightTimer = 0;
    this.acquired = null;
    this.phase = 'flying';
  }

  say(msg, secs = 1.8) {
    this.message = msg;
    this.messageTimer = secs;
  }

  // --- update ------------------------------------------------------------

  update(dt, cssW, cssH) {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    const tr = this.track;

    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }
    this.hurt = Math.max(0, this.hurt - dt * 3);
    this.calm = Math.max(0, (this.calm || 0) - dt);
    if ((this.phase === 'flying' || this.phase === 'boss') && !this.exposed && this.calm <= 0
        && this.shield < SHIELD_MAX) {
      this.shield = Math.min(SHIELD_MAX, this.shield + SHIELD_REGEN * dt);
    }
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.lockedFlash = Math.max(0, this.lockedFlash - dt * 2);
    for (const e of this.level.enemies) if (e.flash > 0) e.flash -= dt * 6;

    const flying = this.phase === 'flying' || this.phase === 'boss';

    if (flying) this.updateShip(dt);
    else this.updateOutro(dt);

    this.updateCamera(cssW, cssH);

    this.updateEnemies(dt, flying);
    if (flying) this.updateTargeting(dt);

    this.weapons.update(dt, this.shipPos);
    this.collide(dt, flying);
    this.particles.update(dt);

    this.missileCooldown = Math.max(0, this.missileCooldown - dt);

    // The finale is a missile target and nothing else, so arriving at it inside
    // a cooldown you spent two hundred units earlier would be a loss decided
    // before you got there. The launcher is reloaded once, on approach.
    if (flying && tr.portT > 0 && !this.portReloaded && tr.portT - this.t < 1300) {
      this.portReloaded = true;
      if (this.missileCooldown > 0) {
        this.missileCooldown = 0;
        this.say('LAUNCHER RELOADED');
      }
    }

    this.audio.setEngine(clamp((this.speed - 200) / 400, 0, 1), flying ? 1 : 0.3);
    this.audio.setMusicLevel(flying ? 1 : 0);
  }

  updateShip(dt) {
    const tr = this.track;
    const inp = this.input;

    // The burn, and the ship going over onto its edge.
    // Running the tank dry latches the burn off until the button is released.
    // Without that it refills a hair the moment it stops burning, re-lights on
    // the next frame, empties again -- and the whole thing stutters on and off
    // several times a second, re-triggering the ignition each time. That is
    // the jarring noise. Hold it dry now and it simply stops.
    if (!inp.boosting) this.burnSpent = false;
    const wantBurn = inp.boosting && !this.burnSpent && this.boost > 0;
    if (wantBurn) {
      if (!this.burning) { this.say('BURN', 0.7); this.audio.boost(); }
      this.boost = Math.max(0, this.boost - dt);
      if (this.boost <= 0) { this.burnSpent = true; this.say('BURN SPENT', 0.8); }
    } else {
      this.boost = Math.min(BOOST_TANK, this.boost + dt * (BOOST_TANK / BOOST_REFILL));
    }
    this.burning = wantBurn;

    // The special is held, like the burn: down means firing, up means saved.
    // Draining dry latches it off until the button is released, and letting
    // go always costs at least the whole diamond the press opened.
    if (!inp.specialHeld) this.specialSpent = false;
    const wantSpecial = !!this.special && inp.specialHeld && !this.specialSpent && this.diamonds > 0;
    if (wantSpecial && !this.specialOn) {
      this.specialEntry = this.diamonds;
      this.say(`${this.special.toUpperCase()}`, 0.7);
      this.audio.specialOn();
    }
    if (!wantSpecial && this.specialOn) {
      this.diamonds = Math.min(this.diamonds, Math.max(0, this.specialEntry - 1));
    }
    this.specialOn = wantSpecial;
    if (this.specialOn) {
      this.diamonds = Math.max(0, this.diamonds - dt / DIAMOND_SECONDS);
      if (this.diamonds <= 0) {
        this.specialSpent = true;
        this.say(`${this.special.toUpperCase()} SPENT`, 0.9);
      }
    } else if (this.diamonds < DIAMOND_BASE) {
      this.diamonds = Math.min(DIAMOND_BASE, this.diamonds + dt / DIAMOND_TRICKLE);
    }

    // Two independent sources of speed: the tank you hold open, and gate time,
    // which is a stopwatch a turbo gate adds three seconds to. A gate neither
    // spends the tank nor fills it, so taking one with a full tank is never
    // wasted -- it just runs. Both at once is the super burn.
    this.gateTime = Math.max(0, this.gateTime - dt);
    const gated = this.gateTime > 0;
    const target = wantBurn && gated ? SUPER_MUL
      : wantBurn || gated ? BOOST_MUL : 1;
    // Spooling, not switching: the multiplier used to step straight from 1 to
    // 1.5 and back, which is a jolt in the speed, the camera and the engine
    // note all at once. Up is slower than down, the way a jet actually is.
    this.speedMul = approach(this.speedMul, target,
      this.speedMul < target ? BURN_SPOOL_UP : BURN_SPOOL_DOWN, dt);
    // The roll is an angle with a sign now, not an amount. Level is 0, on edge
    // is a quarter turn either way, and a barrel roll is a whole one -- which
    // is why the footprint is taken from |sin| rather than from the angle: the
    // ship is at its thinnest a quarter turn round, whichever way it went, and
    // back to its normal shape at a half turn.
    // Which way is over. Steering right banks the ship negative, so right is a
    // negative roll -- reading the tap side straight through sent the ship the
    // opposite way from the side you asked for.
    const barrel = inp.takeBarrel();
    if (barrel && !this.barreling) {
      this.barreling = true;
      this.barrelDir = barrel;
      this.rollTarget = this.rollAng - barrel * TAU;
      this.say('BARREL ROLL', 0.7);
    }
    if (!this.barreling) {
      this.rollTarget = inp.rolling ? -(inp.rollDir || 1) * Math.PI * 0.5 : 0;
    }
    if (this.barreling) {
      // A steady spin, not an ease-out: approach() would crawl through the last
      // thirty degrees, and a barrel roll that decelerates on its way home
      // looks like the ship changed its mind.
      const left = this.rollTarget - this.rollAng;
      const step = BARREL_RATE * dt;
      if (Math.abs(left) <= step) {
        this.barreling = false;
        // A whole turn from where it started is the same attitude, so fold it
        // back to the near side rather than letting the angle grow forever.
        this.rollAng = ((this.rollTarget + Math.PI) % TAU + TAU) % TAU - Math.PI;
        this.rollTarget = this.rollAng;
      } else {
        this.rollAng += Math.sign(left) * step;
      }
    } else {
      this.rollAng = approach(this.rollAng, this.rollTarget, KNIFE_RATE, dt);
    }
    this.knife = Math.abs(Math.sin(this.rollAng));

    this.speed = tr.speedAt(this.t) * this.speedMul;
    this.t += this.speed * dt;

    const hw = tr.halfWidth(this.t);
    const rim = tr.rim(this.t);
    this.ceiling = rim + 92;

    // A barrel roll moves the ship, not just the model: rolling right is how
    // you get out of the way of something on your left. It goes in on top of
    // the steer and is clamped by the same walls.
    if (this.barreling) this.shipX += this.barrelDir * BARREL_SLIDE * dt;

    this.velX = approach(this.velX, inp.steerX * MAX_VX, STEER_RATE, dt);
    this.velY = approach(this.velY, inp.steerY * MAX_VY, STEER_RATE, dt);
    this.shipX += this.velX * dt;
    this.shipY += this.velY * dt;

    // Walls. Grinding along one is survivable for a moment and fatal if held.
    const limX = hw - (8 - 4 * this.knife);
    this.grinding = false;
    if (Math.abs(this.shipX) > limX) {
      this.shipX = Math.sign(this.shipX) * limX;
      if (Math.abs(this.velX) > 4) {
        this.grinding = true;
        this.damage(18 * dt, false);
        this.velX *= 0.25;
        if (hash2((this.time * 60) | 0, 4) < 0.4) {
          this.sparkAt(this.shipX, this.shipY, 3, 90, 1, 0.7, 0.3);
        }
      }
    }
    this.wallWarn = Math.abs(this.shipX) > limX - 9 ? 1 : 0;

    const floorY = tr.floorAt(this.t, this.shipX) + 7;
    if (this.shipY < floorY) {
      this.shipY = floorY;
      if (this.velY < -6) {
        this.damage(16 * dt, false);
        this.grinding = true;
        this.sparkAt(this.shipX, this.shipY, 3, 90, 1, 0.6, 0.25);
      }
      this.velY = Math.max(this.velY, 0);
    }
    if (this.shipY > this.ceiling) {
      this.shipY = this.ceiling;
      this.velY = Math.min(this.velY, 0);
    }

    this.exposed = this.shipY > rim - 4;

    // Attitude: bank into the steer and into the track's own curvature.
    const curve = tr.curveAt(this.t);
    this.bank = approach(this.bank, -inp.steerX * 0.8 - curve * 26, 6.5, dt);
    // The ship rolls the whole ninety degrees; the camera leans a fraction of
    // it. Rolling the camera with it turns the canyon on its side, which reads
    // as the world being wrong rather than as the ship being clever.
    this.shipRoll = this.bank + this.rollAng;
    this.pitch = approach(this.pitch, inp.steerY * 0.32, 6.5, dt);
    // Yaw is aim. It follows the steer rather than the velocity so that the
    // crosshair answers the stick directly -- pointing somewhere should not
    // have to wait for the ship to finish drifting there.
    this.yaw = approach(this.yaw, inp.steerX * YAW_MAX, 7.5, dt);

    if (this.grinding && hash2((this.time * 12) | 0, 8) < 0.25) this.audio.scrape();

    this.updateSeals(dt);
    this.updateRingBeams(dt);
    this.updatePortBeams(dt);
    this.checkObstacles(dt);
    this.checkRingBeams();
    this.checkPortBeams();
    this.spawnDrones();
    this.updateDrones(dt);
    if (this.phase === 'boss') this.updateArena(dt);
    else this.checkFinish();
  }

  /**
   * The boss fight's frame: the warden ticks, the surface rule is suspended
   * (there is nothing up here to hide from -- the warden IS the surface), and
   * the arena loops. The loop is a plain translation: the stretch is straight
   * and uniform, so sliding everything back by a constant is invisible.
   */
  updateArena(dt) {
    const tr = this.track;
    this.exposed = false;
    if (this.boss && this.boss.alive) updateWarden(this.boss, dt, this);

    const wrapEnd = tr.arenaStart + tr.arenaLen - 400;
    if (this.t > wrapEnd) {
      const W = tr.arenaLen - 1300;
      tr.localToWorld(this.t, 0, 0, this._p);
      const a0 = this._p[0], a1 = this._p[1], a2 = this._p[2];
      tr.localToWorld(this.t - W, 0, 0, this._p);
      const dx = this._p[0] - a0, dy = this._p[1] - a1, dz = this._p[2] - a2;
      this.t -= W;
      if (this.boss) this.boss.t -= W;
      for (const d of this.drones) d.t -= W;
      for (const key of ['lasers', 'bolts', 'seekers', 'missiles']) {
        for (const m of this.weapons[key] || []) {
          m.x += dx; m.y += dy; m.z += dz;
          if ('px' in m) { m.px += dx; m.py += dy; m.pz += dz; }
        }
      }
      // Cosmetic world-space debris does not survive the seam; nobody sees a
      // spark blink out mid-dogfight.
      this.particles.clear();
      this.arcs.length = 0;
    }
  }

  /** "Why is it not taking damage" -- answered, but never spammed. */
  sayShield() {
    if (this.time - (this._shieldSaid || 0) < 3) return;
    this._shieldSaid = this.time;
    this.say('THE TENTACLES SHIELD THE CORE', 1.4);
  }

  /**
   * The warden's arc strike, landed. The aim was frozen at the telegraph, so
   * a strike that hits means the ship stood still through the whole charge.
   */
  wardenBolt(b, aim, dmg) {
    const bolt = boltPath(b.world, aim, (this.time * 53) | 0);
    bolt.life = 0.14;
    this.arcs.push(bolt);
    this.particles.burst(aim[0], aim[1], aim[2], 10, 160, 0.8, 0.5, 1, 0.4, 1.6);
    this.audio.zap();
    if (dmg > 0) this.damage(dmg);
  }

  updateOutro(dt) {
    // After the run ends the ship keeps moving so the camera has something to
    // do: a climb out on a win, a tumble on a loss.
    if (this.phase === 'won') {
      this.winTimer += dt;
      this.speed = lerp(this.speed, 260, dt * 0.6);
      this.t += this.speed * dt;
      this.shipY = lerp(this.shipY, this.ceiling + 40, dt * 0.7);
      this.bank = approach(this.bank, 0.5, 1.5, dt);
    } else if (this.phase === 'dead') {
      this.deathTimer += dt;
      this.speed = Math.max(0, this.speed - 90 * dt);
      this.t += this.speed * dt;
      this.bank = Math.min(1.15, this.bank + dt * 2.4);
      this.shipY = Math.max(4, this.shipY - 46 * dt);
    } else if (this.phase === 'ended') {
      this.winTimer += dt;
      this.speed = lerp(this.speed, 300, dt);
      this.t += this.speed * dt;
      this.shipY = lerp(this.shipY, this.ceiling, dt * 0.8);
    } else if (this.phase === 'ascent') {
      // The climb the win used to be -- but now it is an entrance. The warden
      // music is already going; control comes back the moment you level off.
      this.ascentTimer += dt;
      this.speed = lerp(this.speed, 320, dt * 0.8);
      this.t += this.speed * dt;
      const want = this.track.rim(this.t) + 30;
      this.shipY = lerp(this.shipY, want, dt * 1.2);
      this.bank = approach(this.bank, 0, 2, dt);
      if (this.ascentTimer > 2.6) {
        this.phase = 'boss';
        this.shield = Math.min(this.shieldMax, this.shield + 25);
        this.say(this.boss ? this.boss.name : 'THE WARDEN', 2.2);
      }
    } else if (this.phase === 'escape') {
      // The pod gets away. That is not mercy; it is the setup.
      this.escapeTimer += dt;
      this.speed = lerp(this.speed, 300, dt * 0.5);
      this.t += this.speed * dt;
      this.shipY = lerp(this.shipY, this.track.rim(this.t) + 30, dt);
      if (this.pod) {
        this.pod.world[0] += this.pod.vel[0] * dt;
        this.pod.world[1] += this.pod.vel[1] * dt;
        this.pod.world[2] += this.pod.vel[2] * dt;
        this.pod.vel[1] += 60 * dt;
      }
      if (this.escapeTimer > 2.4) {
        this.phase = 'lightspeed';
        this.lightTimer = 0;
        this.say('', 0.1);
        this.audio.lightspeed();
      }
    } else if (this.phase === 'lightspeed') {
      // The ship does not fly home; it LEAVES. Speed goes vertical, the arena
      // streaks past, and the other side of it is the weapon in your hands.
      this.lightTimer += dt;
      this.speed = Math.min(4200, this.speed * (1 + dt * 3.2));
      this.t += this.speed * dt;
      const tr2 = this.track;
      if (tr2.arenaLen > 0 && this.t > tr2.arenaStart + tr2.arenaLen - 400) {
        this.t -= tr2.arenaLen - 1300;
        this.particles.clear();
      }
      this.shipY = lerp(this.shipY, tr2.rim(this.t) + 34, dt);
      this.shake = Math.min(1, this.lightTimer * 0.7);
      if (this.lightTimer > 1.7) {
        this.phase = 'won';
        this.winTimer = 0;
        this.acquired = this.bossDef && this.bossDef.weapon ? this.bossDef.weapon : null;
        this.audio.weaponGet();
      }
    }
    this.exposed = false;
    this.updateDrones(dt);
  }

  checkFinish() {
    if (this.phase === 'boss') return;
    const tr = this.track;
    const port = this.level.port;
    if (port && !port.alive && this.phase === 'flying') return;
    if (port && port.alive && this.t > tr.portT + 60) {
      this.phase = 'ended';
      this.say('PORT MISSED', 4);
      this.audio.lose();
    } else if (!port && this.t > tr.total - 80) {
      this.phase = 'won';
      this.say('RUN COMPLETE', 4);
      this.audio.win();
    } else if (port && !port.alive && this.t > tr.total - 80) {
      this.phase = 'won';
    }
  }

  damage(amount, flash = true) {
    this.calm = SHIELD_CALM;
    if (this.phase !== 'flying' && this.phase !== 'boss') return;
    this.shield -= amount;
    if (flash) {
      this.hurt = 1;
      this.shake = Math.min(1.4, this.shake + amount * 0.03);
      this.hitsTaken++;
      this.audio.hit();
    }
    if (this.shield <= 0) {
      this.shield = 0;
      this.phase = 'dead';
      this.say('SHIELD FAILURE', 5);
      this.boomAt(this.shipPos, 70, 260, 1, 0.6, 0.25, 1.6);
      this.audio.bigBoom();
      this.audio.lose();
    }
  }

  sparkAt(lx, ly, count, speed, r, g, b) {
    this.track.localToWorld(this.t, lx, ly, this._p);
    this.particles.burst(this._p[0], this._p[1], this._p[2], count, speed, r, g, b, 0.4, 1.4);
  }

  boomAt(pos, count, speed, r, g, b, life = 0.9) {
    this.particles.burst(pos[0], pos[1], pos[2], count, speed, r, g, b, life, 2);
    this.particles.burst(pos[0], pos[1], pos[2], Math.floor(count * 0.4), speed * 0.4,
      1, 0.95, 0.7, life * 0.6, 3);
  }

  checkObstacles(dt) {
    const obs = this.level.obstacles;
    while (this.obCursor < obs.length &&
           obs[this.obCursor].t + obs[this.obCursor].dz < this.t - 70) {
      this.obCursor++;
    }
    for (let i = this.obCursor; i < obs.length; i++) {
      const ob = obs[i];
      if (ob.t > this.t + 30) break;
      if (ob.hit) continue;
      // The ship occupies a small box; grow the obstacle instead of shrinking it.
      if (this.t + 8 < ob.t || this.t - 8 > ob.t + ob.dz) continue;
      const hx = SHIP_HX + (KNIFE_HX - SHIP_HX) * this.knife;
      const hy = SHIP_HY + (KNIFE_HY - SHIP_HY) * this.knife;
      if (ob.kind === 'boostgate') {
        // Through the hoop rather than into it: the boxes are the frame, so
        // not hitting them at the moment of crossing is the whole test.
        if (!ob.taken && !hitsObstacle(ob, this.time, this.shipX, this.shipY, hx, hy)) {
          ob.taken = true;
          this.takeGate();
        }
        continue;
      }
      if (ob.kind === 'diamond' || ob.kind === 'prism') {
        if (!ob.taken && !hitsObstacle(ob, this.time, this.shipX, this.shipY, hx, hy)) {
          ob.taken = true;
          if (ob.kind === 'prism') {
            this.diamonds = DIAMOND_CAP;
            this.say('PRISM -- FULL CHARGE', 1.1);
          } else {
            this.diamonds = Math.min(DIAMOND_CAP, this.diamonds + 1);
            this.say(`+1 ${this.special.toUpperCase()}`, 0.8);
          }
          this.audio.diamond(ob.kind === 'prism');
        }
        continue;
      }
      if (hitsObstacle(ob, this.time, this.shipX, this.shipY, hx, hy)) {
        ob.hit = true;
        this.damage(ob.kind === 'seal' ? 48 : 34);
        this.boomAt(this.shipPos, 34, 170, 1, 0.55, 0.2, 0.7);
        this.audio.smallBoom();
      }
    }
  }

  /**
   * A turbo gate, taken cleanly. Hitting one while already burning is the
   * interesting case: it does not add time, it raises the multiplier, which is
   * a good deal and briefly more speed than the trench really allows.
   */
  takeGate() {
    this.gateTime += GATE_TIME;
    if (this.burning) {
      this.say('SUPER BURN', 1);
      this.shake = Math.min(1.5, this.shake + 0.5);
    } else {
      this.say(`BOOST ${this.gateTime.toFixed(0)}`, 0.9);
      this.shake = Math.min(1.5, this.shake + 0.3);
    }
    this.score += 150;
    this.audio.boost();
    this.sparkAt(this.shipX, this.shipY, 14, 150, 0.3, 1, 0.5);
  }

  spawnDrones() {
    for (const w of this.level.drones) {
      if (w.spawned || w.t - this.t > 950 || w.t < this.t) continue;
      w.spawned = true;
      const tr = this.track;
      for (let i = 0; i < w.n; i++) {
        const hw = tr.halfWidth(w.t);
        const rim = tr.rim(w.t);
        this.drones.push({
          kind: 'drone', t: w.t + i * 34, alive: true,
          x: (hash2(w.t | 0, i) * 2 - 1) * (hw - 14),
          y: 18 + hash2(w.t | 0, i + 5) * (rim - 34),
          hp: 2, maxHp: 2, lockable: true, points: 200,
          cool: 0.7 + hash2(w.t | 0, i + 9) * 1.1,
          phase: hash2(w.t | 0, i + 13) * TAU, spin: 0, aim: 0, flash: 0,
          world: [0, 0, 0],
        });
      }
    }
  }

  updateDrones(dt) {
    const tr = this.track;
    let w = 0;
    for (let i = 0; i < this.drones.length; i++) {
      const d = this.drones[i];
      if (!d.alive || d.t < this.t - 90) continue;
      // Drones close on the player: they advance slower than the ship does.
      d.t += this.speed * (d.pace || 0.42) * dt;
      d.phase += dt * 1.7;
      const hw = tr.halfWidth(d.t);
      const rim = tr.rim(d.t);
      d.x = clamp(d.x + Math.cos(d.phase) * 46 * dt, -hw + 12, hw - 12);
      d.y = clamp(d.y + Math.sin(d.phase * 0.8) * 34 * dt, 14, rim - 8);
      if (d.flash > 0) d.flash -= dt * 6;
      this.drones[w++] = d;
    }
    this.drones.length = w;
  }

  updateCamera(cssW, cssH) {
    const tr = this.track;
    const camT = Math.max(1, this.t - CAM_BACK);
    tr.frameAt(camT, this.camFrame);
    tr.localToWorldF(this.camFrame, this.shipX * 0.9, this.shipY + 21, this.eye);

    tr.frameAt(Math.min(tr.total, this.t + 125), this.lookFrame);
    tr.localToWorldF(this.lookFrame, this.shipX * 0.35, this.shipY + 3, this.look);

    // Ship sits ahead of the camera, in the lower third of frame.
    tr.frameAt(this.t, this.shipFrame);
    tr.localToWorldF(this.shipFrame, this.shipX, this.shipY, this.shipPos);
    shipBasis(this.shipFrame, this.shipRoll ?? this.bank, this.pitch, this.yaw, this.basis);

    if (this.shake > 0) {
      const s = this.shake * 7;
      const k = (this.time * 90) | 0;
      for (let i = 0; i < 3; i++) {
        this.eye[i] += (hash2(k, i) * 2 - 1) * s * 0.35;
      }
    }

    const f = this.camF;
    f[0] = this.look[0] - this.eye[0];
    f[1] = this.look[1] - this.eye[1];
    f[2] = this.look[2] - this.eye[2];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;

    const upRef = this.camFrame.u;
    const r = this.camR;
    r[0] = upRef[1] * f[2] - upRef[2] * f[1];
    r[1] = upRef[2] * f[0] - upRef[0] * f[2];
    r[2] = upRef[0] * f[1] - upRef[1] * f[0];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = this.camU;
    u[0] = f[1] * r[2] - f[2] * r[1];
    u[1] = f[2] * r[0] - f[0] * r[2];
    u[2] = f[0] * r[1] - f[1] * r[0];

    // Roll the camera part-way into the ship's bank: enough to feel the turn,
    // not enough to lose the horizon.
    const roll = this.bank * 0.42 + Math.sin(this.rollAng) * 0.2;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    for (let i = 0; i < 3; i++) {
      const ri = r[i] * cr + u[i] * sr;
      const ui = -r[i] * sr + u[i] * cr;
      r[i] = ri; u[i] = ui;
    }

    // Wider lens the faster you go.
    const fov = 1.16 + clamp((this.speed - 260) / 340, 0, 1) * 0.2;
    this.rd.setCamera(this.eye, r, u, f, fov, FAR);
  }

  /** Enemy world positions, aim tracking, and fire. */
  updateEnemies(dt, flying) {
    const tr = this.track;
    const all = [this.level.enemies, this.drones];
    if (this.level.port) all.push([this.level.port]);

    for (const arr of all) {
      for (const e of arr) {
        if (!e.alive) continue;
        const ahead = e.t - this.t;
        if (ahead > FAR || ahead < -80) continue;
        if (!e.world) e.world = [0, 0, 0];
        tr.localToWorld(e.t, e.x, e.y, e.world);
        e.spin += dt * (e.kind === 'port' ? 0.9 : 0.6);

        if (!flying) continue;

        // Aim angle, used both for drawing the barrel and for the shot.
        const dx = this.shipPos[0] - e.world[0];
        const dy = this.shipPos[1] - e.world[1];
        const dz = this.shipPos[2] - e.world[2];
        const dist = Math.hypot(dx, dy, dz) || 1;
        e.aim = Math.atan2(this.shipX - e.x, Math.max(1, ahead));

        // The two surface heavies run their own cycles rather than the shared
        // one-bolt-per-reload loop: what makes them frightening is the shape of
        // their fire, not its damage. A battery empties a rack; a gatling
        // spools up in front of you and then does not stop.
        if (e.kind === 'battery') { this.updateBattery(e, dt, ahead); continue; }
        if (e.kind === 'gatling') { this.updateGatling(e, dt, ahead); continue; }
        if (e.kind === 'emplacement') { this.updateEmplacement(e, dt, ahead); continue; }
        if (e.kind === 'panel') continue;

        let wants = false;
        let heavy = false;
        let reload = 1.4;
        if (e.kind === 'turret') {
          // Surface batteries only engage a ship that has broken the rim.
          wants = this.exposed && ahead < 940 && ahead > -60;
          reload = 0.85;
        } else if (e.kind === 'wallgun') {
          wants = !this.exposed && ahead < 620 && ahead > 30;
          reload = 1.7;
        } else if (e.kind === 'panel') {
      // The last panel drops the bulkhead. This is the other way through, and
      // the reason a bulkhead is a decision: climb into the guns, or stay low
      // and spend the time and the fire it takes to open it.
      const left = this.level.enemies.filter(
        (o) => o.kind === 'panel' && o.sealT === e.sealT && o.alive).length;
      if (left > 0) {
        this.say(`PANEL DOWN -- ${left} LEFT`, 1);
      } else {
        const seal = this.level.obstacles.find(
          (o) => o.kind === 'seal' && Math.abs(o.t - e.sealT) < 1);
        if (seal && !seal.dropping) {
          seal.dropping = true;
          this.droppedSeals.add(e.sealT);
          this.score += 800;
          this.say('BULKHEAD DOWN', 1.6);
          this.audio.bigBoom();
          this.shake = Math.min(1.6, this.shake + 0.8);
        }
      }
    } else if (e.kind === 'emplacement') {
          wants = ahead < 900 && ahead > -40;
          heavy = true;
          reload = 1.5;
        } else if (e.kind === 'drone') {
          wants = ahead < 520 && ahead > 20;
          reload = 1.5;
        }

        e.cool -= dt;
        if (wants && e.cool <= 0) {
          e.cool = reload * (0.75 + hash2((this.time * 60) | 0, (e.t | 0) & 255) * 0.6);
          const speed = this.shotSpeed(heavy ? 420 : 520);
          this.aimPoint(e, speed, this._aim);
          let ax = this._aim[0] - e.world[0];
          let ay = this._aim[1] - e.world[1];
          let az = this._aim[2] - e.world[2];
          const al = Math.hypot(ax, ay, az) || 1;
          this.weapons.fireBolt(e.world[0], e.world[1], e.world[2],
            ax / al, ay / al, az / al, speed, heavy);
          if (ahead < 520) this.audio.enemyShot();
        }
      }
    }
  }

  /**
   * Targeting, the gun, and the lock list.
   *
   * The crosshair is not aimed -- it sits where the nose points, and flying is
   * how you put it on things. Anything it rests on is painted, and a painted
   * target stays locked until you spend it. That is the whole trade: locks are
   * bought with flight path, and the flight path is already the hard part.
   */
  updateTargeting(dt) {
    const rd = this.rd;
    const inp = this.input;

    // Where the crosshair is: along the ship's nose, projected. The camera
    // trails the ship, so a yawed nose puts this well off centre -- which is
    // the point. You are not carrying a crosshair around, you are pointing one.
    shipLocalToWorld(this.shipPos, this.basis, 0, 0, AIM_DIST, this._p);
    let baseX = rd.cx;
    let baseY = rd.cy - 18 * rd.scale;
    let aimDist = AIM_DIST;
    if (rd.project(this._p[0], this._p[1], this._p[2], this._l) > 2) {
      // Held inside the frame: a crosshair off the edge of the screen is a
      // crosshair you cannot use, and hard steering can put the nose there.
      const mx = rd.width * 0.34, my = rd.height * 0.3;
      baseX = clamp(this._l[0], rd.cx - mx, rd.cx + mx);
      baseY = clamp(this._l[1], rd.cy - my, rd.cy + my);
    }

    // Project every candidate once. onScreen/sx/sy are read again by the
    // overlay, so this doubles as the frame's visibility pass.
    const cands = [this.level.enemies, this.drones];
    if (this.boss && this.boss.alive) cands.push([this.boss], this.boss.parts);
    if (this.level.port) cands.push([this.level.port]);
    for (const arr of cands) {
      for (const e of arr) {
        e.onScreen = false;
        if (!e.alive || !e.world) continue;
        const ahead = e.t - this.t;
        if (ahead < 20 || ahead > TARGET_RANGE) continue;
        const vz = rd.project(e.world[0], e.world[1], e.world[2], this._l);
        if (vz < 2) continue;
        e.sx = this._l[0];
        e.sy = this._l[1];
        e.dist = Math.hypot(e.world[0] - this.eye[0], e.world[1] - this.eye[1],
          e.world[2] - this.eye[2]);
        e.onScreen = true;
        e.los = approach(e.los === undefined ? 1 : e.los,
          this.hasLineOfSight(e) ? 1 : 0, LOS_FADE, dt);
      }
    }

    // Paint is per target and everything under the crosshair takes some, so a
    // sweep across a group paints the group. Painting one at a time would make
    // a salvo of five cost five separate passes, which is not a salvo -- it is
    // five shots with extra steps.
    const grab = this.paintToLock
      ? Math.max(this.aimSize || 0, PAINT_TIGHT * rd.scale)
      : PAINT_RADIUS * rd.scale;
    let best = null;
    let bestD = grab;
    for (const arr of cands) {
      for (const e of arr) {
        if (!e.onScreen || !e.lockable || this.locks.includes(e) || e.los < 0.55) {
          // Losing sight bleeds paint off rather than zeroing it: dipping
          // behind a rim lip for a moment should cost progress, not all of it.
          if (e.paint) e.paint = Math.max(0, e.paint - dt * 2);
          continue;
        }
        const d = Math.hypot(e.sx - baseX, e.sy - baseY);
        if (d < bestD) { bestD = d; best = e; }

        if (d < grab && this.locks.length < LOCK_MAX) {
          const before = e.paint || 0;
          e.paint = before + dt / PAINT_TIME;
          if (before < 1 && e.paint >= 1) {
            this.locks.push(e);
            this.lockedFlash = 1;
            // A completed lock, not a tick toward one -- the painting sweep has
            // no intermediate steps to count, so this is the only moment there
            // is and it should sound like an answer rather than a metronome.
            this.audio.lockOn();
            if (this.locks.length === LOCK_MAX) this.say('LOCKS FULL', 0.9);
          }
        } else if (e.paint) {
          // Paint fades rather than resets, so a target that slips out of the
          // crosshair for a moment is not started from nothing.
          e.paint = Math.max(0, e.paint - dt * 1.5);
        }
      }
    }

    // The crosshair leans toward what it is painting. It is an aim assist, but
    // it is also the readable signal that a target has been noticed at all.
    let cx = baseX, cy = baseY;
    if (best) {
      const pull = CROSSHAIR_PULL * (1 - bestD / grab);
      cx += (best.sx - baseX) * pull;
      cy += (best.sy - baseY) * pull;
    }
    this.aimSX = cx;
    this.aimSY = cy;
    this.hoverTarget = best;

    // The reticle reports the nearest one, which is the one the crosshair is
    // leaning at, so the ring on screen matches what the pull is pointing to.
    this.paintTarget = best;
    this.paintProgress = best ? clamp(best.paint || 0, 0, 1) : 0;

    // Sized to the range of what it is over, so the marker reads as sitting on
    // the thing rather than floating on the glass in front of it. What it is
    // over is the target under it when there is one and the rock otherwise --
    // a wall, the floor, a bulkhead, the blade of a pinwheel.
    const kx = (cx - rd.cx) / rd.focal;
    const ky = -(cy - rd.cy) / rd.focal;
    const ax = this.camF[0] + this.camR[0] * kx + this.camU[0] * ky;
    const ay = this.camF[1] + this.camR[1] * kx + this.camU[1] * ky;
    const az = this.camF[2] + this.camR[2] * kx + this.camU[2] * ky;
    const al = Math.hypot(ax, ay, az) || 1;
    const rock = this.aimRockRange(ax / al, ay / al, az / al);
    if (best) aimDist = Math.min(best.dist || AIM_DIST, rock);
    else if (rock < AIM_DIST) aimDist = rock;
    // Eased, because the ray can cross an edge between one frame and the next
    // and the marker should not snap when it does.
    this.aimDist = approach(this.aimDist || aimDist, aimDist, 14, dt);
    this.aimSize = clamp(rd.focal * RETICLE_WORLD / Math.max(60, this.aimDist),
      13 * rd.scale, 84 * rd.scale);

    // A lock survives being flown past -- the missiles are heat-seekers and can
    // turn around -- but not by much, and not past the range it was taken at.
    this.locks = this.locks.filter((e) => {
      const keep = e.alive && e.world
        && e.t - this.t > -260 && e.t - this.t < TARGET_RANGE + 300;
      if (!keep) e.paint = 0;
      return keep;
    });

    this.updateGun(dt, cx, cy);

    if (inp.takeMissile()) this.launchMissiles();
  }

  /**
   * Where to shoot, for a gun with a shell of a given speed.
   *
   * The lead uses the ship's whole velocity -- down the track at whatever the
   * burn is currently making it, plus whatever the stick is doing sideways --
   * so a boosting ship is still a solvable problem. Whether this particular
   * shot gets that solution is a roll against the accuracy that boosting buys.
   */
  /** How fast a shell has to fly to be able to lead the ship at all. */
  shotSpeed(base) {
    // Exactly the shell it always threw when the ship is not boosting, and a
    // faster one in proportion to how much boost there is to compensate for.
    return base * (1 + Math.max(0, this.speedMul - 1) * SHELL_BOOST);
  }

  aimPoint(e, shotSpeed, out) {
    // Solve the intercept rather than guess at it.
    //
    // The lead used to be dist/shellSpeed, which is the flight time to where
    // the ship is *now* -- but the ship is flying at the gun, so the shell and
    // the ship close on each other and the real intercept is sooner than that.
    // A flat 0.85 was standing in for the difference, and it only fitted one
    // speed: leading the full amount instead halved what an emplacement could
    // do, and at a burn nothing landed at all.
    //
    // With r the vector to the ship and v its velocity, a shell of speed s
    // meets it when |r + v t| = s t, which is a quadratic in t.
    const rx = this.shipPos[0] - e.world[0];
    const ry = this.shipPos[1] - e.world[1];
    const rz = this.shipPos[2] - e.world[2];
    const vx = this.camF[0] * this.speed + this.camR[0] * this.velX + this.camU[0] * this.velY;
    const vy = this.camF[1] * this.speed + this.camR[1] * this.velX + this.camU[1] * this.velY;
    const vz = this.camF[2] * this.speed + this.camR[2] * this.velX + this.camU[2] * this.velY;
    const a = vx * vx + vy * vy + vz * vz - shotSpeed * shotSpeed;
    const b = 2 * (rx * vx + ry * vy + rz * vz);
    const c = rx * rx + ry * ry + rz * rz;
    let t;
    if (Math.abs(a) < 1e-4) {
      t = b !== 0 ? -c / b : 0;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        // No solution: the ship is outrunning the shell. Lead it as far as the
        // shell can reach and let the shot fall behind, which is honest.
        t = Math.hypot(rx, ry, rz) / shotSpeed;
      } else {
        const root = Math.sqrt(disc);
        const t1 = (-b - root) / (2 * a);
        const t2 = (-b + root) / (2 * a);
        t = Math.min(...[t1, t2].filter((x) => x > 0), Infinity);
        if (!Number.isFinite(t)) t = Math.max(t1, t2, 0);
      }
    }
    out[0] = this.shipPos[0] + vx * t;
    out[1] = this.shipPos[1] + vy * t;
    out[2] = this.shipPos[2] + vz * t;

    const boosts = (this.burning ? 1 : 0) + (this.gateTime > 0 ? 1 : 0);
    const acc = boosts === 0 ? AIM_BASE
      : Math.max(0.2, AIM_BOOST - AIM_DROP * (boosts - 1));
    const wide = hash2((this.time * 61) | 0, (e.t | 0) & 511) > acc;
    const spread = wide
      ? AIM_MISS * (0.7 + hash2((this.time * 29) | 0, e.t & 127) * 0.6)
      : (AIM_JITTER + AIM_DRIFT * t) * hash2((this.time * 17) | 0, (e.t | 0) & 63);

    // Off across the line of fire rather than short: a shell that lands behind
    // you reads as the gun being slow, one past your wing reads as a miss.
    const ang = hash2((this.time * 89) | 0, (e.t | 0) & 255) * TAU;
    out[0] += (this.camR[0] * Math.cos(ang) + this.camU[0] * Math.sin(ang)) * spread;
    out[1] += (this.camR[1] * Math.cos(ang) + this.camU[1] * Math.sin(ang)) * spread;
    out[2] += (this.camR[2] * Math.cos(ang) + this.camU[2] * Math.sin(ang)) * spread;
    return out;
  }

  /**
   * The emplacement: two heavy shots and then a missile, over and over.
   *
   * It used to be a turret with more hit points -- one heavy bolt every second
   * and a half, of which about one landed on a fly-by, for seventeen of a
   * hundred shield. Fourteen cannon hits or one of your eight locks to kill,
   * against seventeen damage for ignoring it: flying past was simply the right
   * answer, which is a waste of the only heavy thing that lives down in the
   * trench with you.
   *
   * The missile is what makes it a decision rather than a toll. Dodge it, shoot
   * it out of the air, or kill the launcher before the next one -- and it is
   * the thing that teaches the lock before the port, so it fighting you with
   * your own weapon is the lesson stated twice.
   *
   * Its seekers are deliberately blunter than a surface battery's. One at a
   * time, slower, and turning worse, because a trench is not open air and there
   * is nowhere to go when one is launched from inside it.
   */
  updateEmplacement(e, dt, ahead) {
    if (!(ahead < 1250 && ahead > -60)) return;
    e.cool -= dt;
    if (e.cool > 0) return;
    const dx = this.shipPos[0] - e.world[0];
    const dy = this.shipPos[1] - e.world[1];
    const dz = this.shipPos[2] - e.world[2];
    const dist = Math.hypot(dx, dy, dz) || 1;

    // One missile per pass, and only from close in. Fired from far out it has
    // to cross a curving trench at a closing speed of about seven hundred a
    // second: measured, two out of three missed narrowly, turned hard to chase,
    // and killed themselves on the opposite wall. Near in it is a real question
    // -- dodge it, shoot it, or have killed the launcher already.
    if (!e.launched && ahead < EMP_MISSILE_RANGE) {
      e.launched = true;
      e.cool = 0.5;
      const out = e.x < 0 ? 1 : -1;
      this.track.localToWorld(e.t, e.x + out * 34, e.y, this._p);
      const mx = this.shipPos[0] - this._p[0];
      const my = this.shipPos[1] - this._p[1];
      const mz = this.shipPos[2] - this._p[2];
      const ml = Math.hypot(mx, my, mz) || 1;
      this.weapons.fireSeeker(this._p[0], this._p[1], this._p[2], mx / ml, my / ml, mz / ml,
        { speed: 260, accel: 210, maxSpeed: 450, turn: 1.7, life: 4, arm: 0.4 });
      this.audio.missile(0.7);
      this.say('MISSILE -- SHOOT IT OR DODGE', 1.1);
      return;
    }

    // Otherwise a burst of three heavy shells, which is the reliable half of
    // it. One shell every second and a half was the old behaviour and it cost
    // seventeen of a hundred shield to ignore the thing entirely.
    e.burst = (e.burst || 0) + 1;
    if (e.burst >= EMP_BURST) { e.burst = 0; e.cool = EMP_BURST_GAP; }
    else e.cool = EMP_BURST_STEP;
    const speed = this.shotSpeed(560);
    this.aimPoint(e, speed, this._aim);
    let ax = this._aim[0] - e.world[0];
    let ay = this._aim[1] - e.world[1];
    let az = this._aim[2] - e.world[2];
    const al = Math.hypot(ax, ay, az) || 1;
    this.weapons.fireBolt(e.world[0], e.world[1], e.world[2], ax / al, ay / al, az / al, speed, true);
    if (ahead < 800) this.audio.enemyShot();
  }

  /**
   * The port firing. One shaft, then the next one round the rim, each beam
   * hanging where it was fired and fading from orange to yellow.
   *
   * The wall stands in front of the port rather than in its own plane, because
   * the fight is the approach: you are flying into it while you paint it, and
   * a wall you only meet at the instant of arrival is not a fight.
   */
  /**
   * The rings firing. Eight tentacles round the hoop, going off one after
   * another clockwise from twelve, each beam a wedge that hangs for a moment
   * and fades. The hoop itself is the way through: beams start at the tentacle
   * tips and go outward at the rock, so the aperture stays open and the space
   * around it does not.
   */
  updateRingBeams(dt) {
    const now = this.time;
    for (const ob of this.level.obstacles) {
      if (ob.kind !== 'ring' || !ob.ring) continue;
      const ahead = ob.t - this.t;
      if (ahead > FAR || ahead < -80) continue;
      if (!ob.beams) {
        ob.beams = [];
        ob.beamArm = (RING_TOP_ARM + 1) % RING_BEAM.arms;
        ob.beamTimer = hash2(ob.t | 0, 11) * (ob.beamRate || RING_BEAM.rate);
      }
      for (let i = ob.beams.length - 1; i >= 0; i--) {
        if (now - ob.beams[i].born > ringBeamLife(ob)) ob.beams.splice(i, 1);
      }
      ob.beamTimer -= dt;
      if (ob.beamTimer > 0) continue;
      ob.beamTimer += ob.beamRate || RING_BEAM.rate;
      ob.beamArm = (ob.beamArm - 1 + RING_BEAM.arms) % RING_BEAM.arms;
      const hw = this.track.halfWidth(ob.t);
      const rim = this.track.rim(ob.t);
      const ang = (ob.beamArm / RING_BEAM.arms) * TAU;
      ob.beams.push({
        ang,
        born: now,
        from: ob.ring.r + RING_BEAM.gap,
        reach: Math.max(hw, rim) * 1.6,
        hit: false,
      });
      if (ahead < 700 && ahead > -40) this.audio.beam();
    }
  }

  /** Flying into one. The wedge is thin at the tentacle and fans out. */
  checkRingBeams() {
    for (const ob of this.level.obstacles) {
      if (ob.kind !== 'ring' || !ob.beams || !ob.beams.length) continue;
      if (this.t + 9 < ob.t - RING_BEAM.lead || this.t - 9 > ob.t + ob.dz) continue;
      const { cx, cy } = ob.ring;
      const dx = this.shipX - cx, dy = this.shipY - cy;
      for (const b of ob.beams) {
        if (b.hit) continue;
        const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang);
        if (along < b.from - 6 || along > b.reach) continue;
        const off = Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang));
        // The wedge widens with distance, exactly as it is drawn.
        if (off > 3 + along * RING_BEAM.spread + 7) continue;
        b.hit = true;
        this.damage(RING_BEAM_DAMAGE);
        this.sparkAt(this.shipX, this.shipY, 8, 130, 1, 0.55, 0.12);
      }
    }
  }

  updatePortBeams(dt) {
    const e = this.level.port;
    if (!e || !e.alive || !this.spec.armedPort) return;
    const ahead = e.t - this.t;
    if (ahead > 1700 || ahead < -80) return;
    const now = this.time;
    if (!e.beams) { e.beams = []; e.beamShaft = 0; e.beamTimer = 0; }
    for (let i = e.beams.length - 1; i >= 0; i--) {
      if (now - e.beams[i].born > PORT_BEAM.life) e.beams.splice(i, 1);
    }
    e.beamTimer -= dt;
    if (e.beamTimer > 0) return;
    e.beamTimer += BEAM_INTERVAL;
    e.beamShaft = (e.beamShaft + 1) % PORT_BEAM.shafts;
    const hw = this.track.halfWidth(e.t);
    e.beams.push({
      ang: (e.beamShaft / PORT_BEAM.shafts) * TAU,
      born: now,
      reach: Math.max(hw, this.track.rim(e.t)) + 50,
      hit: false,
    });
    if (ahead < 900) this.audio.beam();
  }

  /**
   * Flying into the wall. The beams stand in a slab in front of the port, so
   * this asks the question for as long as the ship is inside that slab.
   */
  checkPortBeams() {
    const e = this.level.port;
    if (!e || !e.alive || !e.beams || !e.beams.length) return;
    const gap = e.t - this.t;
    if (gap > PORT_BEAM.slab || gap < -10) return;
    const dx = this.shipX - e.x, dy = this.shipY - e.y;
    for (const b of e.beams) {
      if (b.hit) continue;
      // A beam starts at the shaft mouth, not at the middle: inside that
      // radius you are in the eye of it, which is the whole shape of the fight.
      const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang);
      if (along < PORT_BEAM.inner - 8 || along > b.reach) continue;
      const off = Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang));
      if (off > BEAM_HALF + 7) continue;
      b.hit = true;
      this.damage(BEAM_DAMAGE);
      this.sparkAt(this.shipX, this.shipY, 8, 120, 1, 0.6, 0.15);
    }
  }

  /** Bulkheads sinking into the floor after their last panel was shot out. */
  updateSeals(dt) {
    for (const ob of this.level.obstacles) {
      if (!ob.dropping || ob.gone) continue;
      if (Math.abs(ob.t - this.t) > FAR + 400) continue;
      ob.dropY = (ob.dropY || 0) - SEAL_DROP_SPEED * dt;
      const depth = ob.boxes[0][3] + 40;
      if (-ob.dropY >= depth) {
        ob.dropY = -depth;
        ob.gone = true;
      }
    }
  }

  /**
   * A missile battery: a rack emptied one tube at a time, then a long reload.
   *
   * The salvo is staggered rather than simultaneous so twelve missiles arrive
   * as a stream you have to keep answering, not as one wall you either dodge or
   * do not. Only fires at a ship that has broken the rim -- everything up here
   * is the cost of being up here.
   */
  updateBattery(e, dt, ahead) {
    const inRange = ahead < 1600 && ahead > -420;
    if (e.salvo > 0) {
      // Mid-rack: keep launching regardless of what the ship does now.
      e.salvoTimer -= dt;
      if (e.salvoTimer <= 0) {
        e.salvoTimer = SALVO_INTERVAL;
        e.salvo--;
        const up = 0.55 + hash2((e.t | 0) + e.salvo, 7) * 0.5;
        const side = (e.x < 0 ? 1 : -1) * (0.15 + hash2(e.salvo, (e.t | 0) & 255) * 0.5);
        // Straight up out of the cell, then it turns over and comes for you.
        const fx = this.camR[0] * side + this.camU[0] * up + this.camF[0] * 0.25;
        const fy = this.camR[1] * side + this.camU[1] * up + this.camF[1] * 0.25;
        const fz = this.camR[2] * side + this.camU[2] * up + this.camF[2] * 0.25;
        const l = Math.hypot(fx, fy, fz) || 1;
        this.weapons.fireSeeker(e.world[0], e.world[1] + 8, e.world[2], fx / l, fy / l, fz / l);
        this.audio.missile(0.5);
        if (e.salvo === 0) e.cool = BATTERY_RELOAD * (0.85 + hash2(e.t | 0, 3) * 0.4);
      }
      return;
    }
    e.cool -= dt;
    if (this.exposed && inRange && e.cool <= 0) {
      e.salvo = e.tubes;
      e.salvoTimer = 0.25;
      if (e.tubes >= 6) {
        this.say(`${e.tubes} INBOUND`, 1.2);
        this.audio.alarm();
      }
    }
  }

  /**
   * A gatling: spins up in plain sight, then hoses the rim with hot lead.
   *
   * The spin-up is the only warning, and it is deliberately long enough to duck
   * back under the rim -- which is the decision the surface is supposed to keep
   * asking. Individual rounds are cheap; standing in the stream is not.
   */
  updateGatling(e, dt, ahead) {
    const wants = this.exposed && ahead < 1020 && ahead > -160;
    e.wind = clamp(e.wind + (wants ? dt / GATLING_SPINUP : -dt * 1.1), 0, 1);
    e.barrel = (e.barrel || 0) + dt * (2 + e.wind * 26);
    if (e.wind < 1) return;

    e.cool -= dt;
    if (e.cool > 0) return;
    e.cool = GATLING_CADENCE;
    const dist = Math.hypot(
      this.shipPos[0] - e.world[0], this.shipPos[1] - e.world[1], this.shipPos[2] - e.world[2]) || 1;
    const speed = this.shotSpeed(700);
    // Leads the ship, then scatters: a stream that converged perfectly would be
    // a hitscan death sentence, and one that did not converge would be scenery.
    this.aimPoint(e, speed, this._aim);
    const j = () => (hash2((this.time * 120) | 0, (e.t | 0) & 511) - 0.5) * GATLING_SPREAD;
    let ax = this._aim[0] - e.world[0] + j() * 26;
    let ay = this._aim[1] - e.world[1] + j() * 22;
    let az = this._aim[2] - e.world[2];
    const al = Math.hypot(ax, ay, az) || 1;
    this.weapons.fireBolt(e.world[0], e.world[1] + 11, e.world[2],
      ax / al, ay / al, az / al, speed, false, true);
    if (ahead < 700) this.audio.enemyShot();
  }

  /**
   * Is there rock between the ship and this target?
   *
   * Sampled in canyon-local coordinates rather than world space: the canyon is
   * a channel in (x, y) at every t, so "inside rock" is just outside the half
   * width and below the rim -- the same rule collisions use. Interpolating
   * locally ignores how the trench curves between here and there, which is
   * wrong by a few units over a thousand and irrelevant to the question being
   * asked. It is also cheap, which matters: this runs for every candidate on
   * screen, every frame.
   *
   * The consequence is deliberate. A turret standing on the surface cannot be
   * seen, painted, or locked from the trench floor -- the sight line clips the
   * rim edge -- so fighting the surface batteries still means climbing into
   * their fire. That trade is the game; targeting through rock quietly removed
   * it.
   */
  hasLineOfSight(e) {
    const tr = this.track;
    const t0 = this.t, x0 = this.shipX, y0 = this.shipY;
    const dt = e.t - t0, dx = e.x - x0, dy = e.y - y0;
    for (let i = 1; i < LOS_SAMPLES; i++) {
      const k = i / LOS_SAMPLES;
      const t = t0 + dt * k;
      const x = x0 + dx * k;
      // Tolerance, because the wall carries an 11% breathing wobble and a gun
      // mounted flush to it sits four units inside: without slack the noise
      // alone would flicker sight on the very targets that are plainly there.
      // Still nowhere near the 24 units of clearance a surface turret has.
      if (Math.abs(x) <= tr.halfWidth(t) + 8) continue;
      if (y0 + dy * k < tr.rim(t) - 2) return false;
    }
    return true;
  }

  /** The machine gun: infinite ammo, finite patience. */
  updateGun(dt, cx, cy) {
    if (this.specialOn) {
      this.updateArc(dt, cx, cy);
      return;
    }
    const rd = this.rd;
    const firing = this.input.firing && !this.overheated;

    if (firing) {
      this.heat = Math.min(1, this.heat + HEAT_PER_SEC * dt);
      if (this.heat >= 1) {
        this.overheated = true;
        this.say('OVERHEATED', 1.2);
        this.audio.hit();
      }
    } else {
      this.heat = Math.max(0, this.heat - COOL_PER_SEC * dt);
      if (this.overheated && this.heat <= HEAT_RESUME) this.overheated = false;
    }

    if (!firing) {
      this.input.takePress();
      return;
    }

    // The shot goes through the crosshair, not through the finger: the ray is
    // rebuilt from where the crosshair ended up, magnetism included, so what
    // you see it leaning at is what the guns hit.
    const kx = (cx - rd.cx) / rd.focal;
    const ky = -(cy - rd.cy) / rd.focal;
    const ax = this.camF[0] + this.camR[0] * kx + this.camU[0] * ky;
    const ay = this.camF[1] + this.camR[1] * kx + this.camU[1] * ky;
    const az = this.camF[2] + this.camR[2] * kx + this.camU[2] * ky;
    const al = Math.hypot(ax, ay, az) || 1;
    const tx = this.eye[0] + (ax / al) * AIM_DIST;
    const ty = this.eye[1] + (ay / al) * AIM_DIST;
    const tz = this.eye[2] + (az / al) * AIM_DIST;

    this.fireTimer -= dt;
    if (this.input.takePress()) this.fireTimer = 0;
    if (this.fireTimer > 0) return;
    this.fireTimer = GUN_CADENCE;
    for (const m of MUZZLES) {
      shipLocalToWorld(this.shipPos, this.basis, m[0], m[1], m[2], this._p);
      let dx = tx - this._p[0], dy = ty - this._p[1], dz = tz - this._p[2];
      const dl = Math.hypot(dx, dy, dz) || 1;
      this.weapons.fireLaser(this._p[0], this._p[1], this._p[2], dx / dl, dy / dl, dz / dl);
    }
    this.audio.gun();
  }

  /**
   * ARC. Held, not toggled: a live stream. The chain starts at whatever is
   * closest to the crosshair -- the cursor picks the head -- and each jump
   * goes to whatever is closest to the last ship struck, three jumps at most,
   * each landing at ${ARC_FALLOFF} of the one before. The bolt is torn down
   * and rebuilt every frame so it crackles; damage lands on its own tick.
   */
  updateArc(dt, cx, cy) {
    const rd = this.rd;
    this.input.takePress();

    // Whatever is in reach at all.
    const cands = [];
    const pools = [this.level.enemies, this.drones];
    if (this.boss && this.boss.alive) pools.push([this.boss], this.boss.parts);
    for (const arr of pools) {
      for (const e of arr) {
        if (!e.alive || !e.world || e.kind === 'port') continue;
        const d = Math.hypot(e.world[0] - this.shipPos[0],
          e.world[1] - this.shipPos[1], e.world[2] - this.shipPos[2]);
        if (d > ARC_RANGE || e.los < 0.4) continue;
        cands.push(e);
      }
    }

    // The head of the chain is the cursor's choice: nearest to the aim ray,
    // not nearest to the ship -- pointing at a far gun arcs the far gun.
    const kx = (cx - rd.cx) / rd.focal;
    const ky = -(cy - rd.cy) / rd.focal;
    let ax = this.camF[0] + this.camR[0] * kx + this.camU[0] * ky;
    let ay = this.camF[1] + this.camR[1] * kx + this.camU[1] * ky;
    let az = this.camF[2] + this.camR[2] * kx + this.camU[2] * ky;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const offRay = (e) => {
      const wx = e.world[0] - this.eye[0];
      const wy = e.world[1] - this.eye[1];
      const wz = e.world[2] - this.eye[2];
      const along = wx * ax + wy * ay + wz * az;
      if (along < 20) return Infinity;
      return Math.hypot(wx - ax * along, wy - ay * along, wz - az * along);
    };

    const chain = [];
    let head = null, hv = Infinity;
    for (const e of cands) {
      const v = offRay(e);
      if (v < hv) { hv = v; head = e; }
    }
    if (head) {
      chain.push(head);
      const used = new Set(chain);
      let from = head;
      while (chain.length < ARC_LINKS) {
        let best = null, bv = Infinity;
        for (const e of cands) {
          if (used.has(e)) continue;
          const d = Math.hypot(e.world[0] - from.world[0],
            e.world[1] - from.world[1], e.world[2] - from.world[2]);
          if (d < bv && d <= ARC_JUMP) { bv = d; best = e; }
        }
        if (!best) break;
        used.add(best);
        chain.push(best);
        from = best;
      }
    }

    // The bolt, rebuilt from scratch this frame -- the rebuild is the crackle.
    shipLocalToWorld(this.shipPos, this.basis, 0, -1, 6, this._p);
    if (chain.length) {
      let from = [this._p[0], this._p[1], this._p[2]];
      const seed = (this.time * 47) | 0;
      for (let k = 0; k < chain.length; k++) {
        const bolt = boltPath(from, chain[k].world, seed + k * 101);
        bolt.life = 0.05;
        this.arcs.push(bolt);
        from = chain[k].world;
      }
    }

    // The crackle: fast, irregular, only while the stream is live.
    this.crackleIn = (this.crackleIn || 0) - dt;
    if (this.crackleIn <= 0) {
      this.crackleIn = 0.03 + hash2((this.time * 83) | 0, 3) * 0.06;
      this.audio.crackle();
    }

    // Damage, on its own clock, softer with every jump.
    this.zapTimer -= dt;
    if (this.zapTimer > 0 || !chain.length) return;
    this.zapTimer = ARC_TICK;
    chain.forEach((e, k) => {
      if (e.kind === 'boss' && e.shielded) {
        this.particles.burst(e.world[0], e.world[1], e.world[2], 4, 110, 0.5, 0.8, 1, 0.3, 1.2);
        return;
      }
      // The wheel: a warden's own weapon half-hurts it; the one it is weak to
      // melts it, three to one. Everything else is just damage.
      const wheel = e.kind !== 'boss' ? 1
        : this.special === e.def.weakTo ? 3
        : this.special === e.def.weapon ? 0.5 : 1;
      e.hp -= ARC_DAMAGE * Math.pow(ARC_FALLOFF, k) * wheel;
      e.flash = 1;
      this.particles.burst(e.world[0], e.world[1], e.world[2], 5, 120, 0.8, 0.5, 1, 0.3, 1.4);
      if (e.hp <= 0) this.destroy(e);
    });
    this.audio.zap();
  }

  /** Everything painted, struck at once. */
  launchMissiles() {
    if (this.missileCooldown > 0) {
      this.say(`RELOADING ${this.missileCooldown.toFixed(1)}`, 0.8);
      return;
    }
    if (!this.locks.length) {
      this.say('NOTHING LOCKED', 0.9);
      return;
    }

    const n = this.locks.length;
    this.locks.forEach((target, i) => {
      shipLocalToWorld(this.shipPos, this.basis, 0, -2, 4, this._p);
      let dx = target.world[0] - this._p[0];
      let dy = target.world[1] - this._p[1];
      let dz = target.world[2] - this._p[2];
      const l = Math.hypot(dx, dy, dz) || 1;
      // Fanned on launch so a salvo reads as a salvo. Homing pulls them back in.
      const spread = n > 1 ? ((i / (n - 1)) - 0.5) * 0.5 : 0;
      const sx = dx / l + this.camR[0] * spread + this.camU[0] * 0.25;
      const sy = dy / l + this.camR[1] * spread + this.camU[1] * 0.25;
      const sz = dz / l + this.camR[2] * spread + this.camU[2] * 0.25;
      const sl = Math.hypot(sx, sy, sz) || 1;
      this.weapons.fireMissile(this._p[0], this._p[1], this._p[2],
        sx / sl, sy / sl, sz / sl, target);
    });

    for (const e of this.locks) e.paint = 0;
    this.locks = [];
    this.paintTarget = null;
    this.paintProgress = 0;
    this.missileCooldown = MISSILE_COOLDOWN;
    this.lockedFlash = 1;
    this.audio.missile();
    this.say(n > 1 ? `FOX TWO x${n}` : 'FOX TWO', 1.1);
  }

  /** All projectile resolution: player fire, enemy fire, missiles. */
  collide(dt, flying) {
    const W = this.weapons;
    const tr = this.track;
    const targets = [this.level.enemies, this.drones];
    if (this.level.port) targets.push([this.level.port]);
    if (this.boss && this.boss.alive) targets.push([this.boss], this.boss.parts);

    // Player lasers.
    for (let i = W.lasers.length - 1; i >= 0; i--) {
      const s = W.lasers[i];
      let consumed = false;
      for (const arr of targets) {
        for (const e of arr) {
          if (!e.alive || !e.world) continue;
          const R = RADIUS[e.kind] || 12;
          if (Math.abs(e.world[2] - s.z) > R + 120) continue;
          if (!segSphere(s.px, s.py, s.pz, s.x, s.y, s.z,
            e.world[0], e.world[1], e.world[2], R)) continue;
          consumed = true;
          // The port is armoured against guns: it is a missile target by design.
          if (e.kind === 'port') {
            this.particles.burst(s.x, s.y, s.z, 6, 90, 0.6, 0.85, 1, 0.3, 1.4);
            this.say('GUNS WONT BREACH IT', 1.2);
            break;
          }
          // The core holds while its pods do: hits splash off the lattice.
          if (e.kind === 'boss' && e.shielded) {
            this.particles.burst(s.x, s.y, s.z, 6, 110, 0.5, 0.8, 1, 0.3, 1.4);
            this.sayShield();
            break;
          }
          e.hp -= 1;
          e.flash = 1;
          this.particles.burst(s.x, s.y, s.z, 7, 120, 1, 0.85, 0.4, 0.35, 1.6);
          this.audio.hit();
          if (e.hp <= 0) this.destroy(e);
          break;
        }
        if (consumed) break;
      }
      if (!consumed) {
        for (let k = W.seekers.length - 1; k >= 0; k--) {
          const m = W.seekers[k];
          if (!segSphere(s.px, s.py, s.pz, s.x, s.y, s.z, m.x, m.y, m.z, 9)) continue;
          this.boomAt([m.x, m.y, m.z], 26, 150, 1, 0.7, 0.3, 0.6);
          this.audio.smallBoom();
          W.seekers.splice(k, 1);
          this.score += 40;
          consumed = true;
          break;
        }
      }
      if (!consumed && this.hitsScenery(s.x, s.y, s.z)) {
        this.particles.burst(s.x, s.y, s.z, 5, 80, 1, 0.6, 0.3, 0.3, 1.4);
        consumed = true;
      }
      if (consumed) W.lasers.splice(i, 1);
    }

    // Enemy fire against the ship.
    if (flying) {
      for (let i = W.bolts.length - 1; i >= 0; i--) {
        const s = W.bolts[i];
        if (segSphere(s.px, s.py, s.pz, s.x, s.y, s.z,
          this.shipPos[0], this.shipPos[1], this.shipPos[2], 11)) {
          this.damage(s.tracer ? 6 : s.heavy ? 19 : 12);
          this.particles.burst(s.x, s.y, s.z, 10, 140, 1, 0.5, 0.25, 0.4, 1.8);
          W.bolts.splice(i, 1);
        }
      }
    }

    // Enemy seekers. They hit hard, but they can be shot down and they die on
    // rock, so a rack emptied at you is a problem with several answers.
    for (let i = W.seekers.length - 1; i >= 0; i--) {
      const m = W.seekers[i];
      let boom = false;
      if (flying && segSphere(m.px, m.py, m.pz, m.x, m.y, m.z,
        this.shipPos[0], this.shipPos[1], this.shipPos[2], 12)) {
        this.damage(26);
        boom = true;
      } else if (m.arm <= 0 && this.hitsScenery(m.x, m.y, m.z)) {
        boom = true;
      }
      if (boom) {
        this.boomAt([m.x, m.y, m.z], 34, 190, 1, 0.55, 0.25, 0.9);
        this.audio.missileHit();
        W.seekers.splice(i, 1);
      }
    }

    // Missiles.
    for (let i = W.missiles.length - 1; i >= 0; i--) {
      const m = W.missiles[i];
      const tg = m.target;
      let boom = false;
      if (tg && tg.alive && tg.world) {
        const R = RADIUS[tg.kind] || 14;
        if (segSphere(m.px, m.py, m.pz, m.x, m.y, m.z,
          tg.world[0], tg.world[1], tg.world[2], R + 6)) {
          boom = true;
          // A missile does damage rather than deleting whatever it touches.
          // Killing outright meant the two heaviest things in the game died to
          // one lock each from as far away as the lock reached: an emplacement
          // was dead 697 units out, having fired eight shells from maximum
          // range and landed none of them. It was not a threat because it was
          // never alive while you were close.
          if (tg.kind === 'boss' && tg.shielded) {
            this.boomAt([m.x, m.y, m.z], 20, 130, 0.5, 0.8, 1, 0.5);
            this.sayShield();
            W.missiles.splice(i, 1);
            break;
          }
          tg.hp -= MISSILE_DAMAGE;
          tg.flash = 1;
          if (tg.hp <= 0) this.destroy(tg);
          else {
            this.score += 120;
            this.say(`${tg.kind === 'emplacement' ? 'EMPLACEMENT' : 'TARGET'} STILL UP`, 0.9);
          }
        }
      } else if (!tg || !tg.alive) {
        boom = m.life < 5.4;
      }
      if (boom || this.hitsScenery(m.x, m.y, m.z)) {
        this.boomAt([m.x, m.y, m.z], 46, 210, 1, 0.7, 0.3, 1.1);
        this.audio.missileHit();
        W.missiles.splice(i, 1);
      }
    }
  }

  /**
   * Does a world point sit inside nearby obstacle geometry?
   *
   * The trench wall only counts below the rim. Above it there is no rock, and
   * treating the whole half-width as solid at every height meant anything shot
   * at a surface turret -- which by definition stands outside the trench --
   * detonated on empty air the moment it crossed the line.
   */
  hitsScenery(x, y, z, floor = false) {
    const tr = this.track;
    const obs = this.level.obstacles;
    tr.worldToLocal(x, y, z, this._q);
    const lt = this._q[0], lx = this._q[1], ly = this._q[2];
    if (floor && ly < tr.floorAt(lt, lx)) return true;
    if (Math.abs(lx) > tr.halfWidth(lt) + 4 && ly < tr.rim(lt)) return true;
    for (let i = this.obCursor; i < obs.length; i++) {
      const ob = obs[i];
      if (ob.t > lt + 30) break;
      if (ob.t + ob.dz < lt - 30) continue;
      if (lt < ob.t || lt > ob.t + ob.dz) continue;
      // A turbo gate is not solid to anything. Its boxes exist only to answer
      // "did the ship go through the hoop", so shots pass straight through it.
      // The same is true of the gates that feed the special.
      if (ob.kind === 'boostgate' || ob.kind === 'diamond' || ob.kind === 'prism') continue;
      if (hitsObstacle(ob, this.time, lx, ly)) return true;
    }
    return false;
  }

  /**
   * How far down the crosshair's own ray the rock is, from the eye.
   *
   * The marker is sized by range so that it reads as sitting on the thing it
   * is over, but range only ever came from a target -- so a wall two ship
   * lengths ahead drew exactly the same small marker as an empty trench, and
   * the only thing in the world with depth was an enemy.
   *
   * Marched coarsely and then bisected: a fixed step makes the size pop as the
   * samples cross a surface, and the steps are packed toward the near end
   * because that is where a few units of error are visible.
   */
  aimRockRange(dx, dy, dz, max = 1500) {
    const NEAR = 45;
    const STEPS = 22;
    let prev = NEAR;
    for (let i = 1; i <= STEPS; i++) {
      const d = NEAR + (max - NEAR) * (i / STEPS) ** 1.7;
      if (this.hitsScenery(this.eye[0] + dx * d, this.eye[1] + dy * d,
        this.eye[2] + dz * d, true)) {
        let lo = prev, hi = d;
        for (let k = 0; k < 5; k++) {
          const mid = (lo + hi) * 0.5;
          if (this.hitsScenery(this.eye[0] + dx * mid, this.eye[1] + dy * mid,
            this.eye[2] + dz * mid, true)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = d;
    }
    return Infinity;
  }

  destroy(e) {
    e.alive = false;
    this.score += e.points;
    this.kills++;
    // World position is normally filled in by the visibility pass, but a target
    // can die without ever having been through it -- a missile that outlives
    // its owner's view, or a panel taken from further out than the pass runs.
    if (!e.world) {
      e.world = [0, 0, 0];
      this.track.localToWorld(e.t, e.x, e.y, e.world);
    }
    const big = e.kind === 'port' || e.kind === 'emplacement' || e.kind === 'boss';
    this.boomAt(e.world, big ? 90 : 34, big ? 300 : 170,
      1, e.kind === 'port' ? 0.85 : 0.55, 0.25, big ? 1.6 : 0.8);
    if (big) {
      this.audio.bigBoom();
      this.shake = Math.min(1.6, this.shake + 1);
    } else {
      this.audio.smallBoom();
    }
    if (e.kind === 'port') {
      this.score += 5000;
      if (this.bossDef) {
        // The door is down and the flyout is no longer an ending: the climb
        // out of the canyon carries you into the arena, and the music turns.
        this.phase = 'ascent';
        this.ascentTimer = 0;
        this.boss = makeWarden(this.bossDef, this.track.arenaStart);
        this.say('DIRECT HIT -- SOMETHING IS UP THERE', 3.5);
        this.audio.musicStart('boss');
      } else {
        this.phase = 'won';
        this.say('DIRECT HIT', 5);
        this.audio.win();
      }
    } else if (e.kind === 'bosspart') {
      const left = this.boss ? this.boss.parts.filter((x) => x.alive).length : 0;
      this.say(left > 0 ? `TENTACLE DOWN -- ${left} LEFT` : 'THE CORE IS OPEN', 1.4);
      if (left === 0 && this.boss) {
        this.boss.flash = 1;
        this.audio.specialOn();
      }
    } else if (e.kind === 'boss') {
      // The warden dies; the pilot does not. An escape pod flies out and gets
      // away, which the campaign has plans for.
      this.phase = 'escape';
      this.escapeTimer = 0;
      this.pod = {
        world: [e.world[0], e.world[1], e.world[2]],
        vel: [40, 90, 220],
      };
      this.say('WARDEN DOWN', 2.5);
      this.shake = Math.min(1.8, this.shake + 1.2);
    } else if (e.kind === 'panel') {
      // The last panel drops the bulkhead. This is the other way through, and
      // the reason a bulkhead is a decision: climb into the guns, or stay low
      // and spend the time and the fire it takes to open it.
      const left = this.level.enemies.filter(
        (o) => o.kind === 'panel' && o.sealT === e.sealT && o.alive).length;
      if (left > 0) {
        this.say(`PANEL DOWN -- ${left} LEFT`, 1);
      } else {
        const seal = this.level.obstacles.find(
          (o) => o.kind === 'seal' && Math.abs(o.t - e.sealT) < 1);
        if (seal && !seal.dropping) {
          seal.dropping = true;
          this.droppedSeals.add(e.sealT);
          this.score += 800;
          this.say('BULKHEAD DOWN', 1.6);
          this.audio.bigBoom();
          this.shake = Math.min(1.6, this.shake + 0.8);
        }
      }
    } else if (e.kind === 'emplacement') {
      // Worth the trouble: a heavy kill buys back part of the launcher wait.
      this.missileCooldown = Math.max(0, this.missileCooldown - 2);
      this.say('EMPLACEMENT DOWN');
    }
  }

  // --- draw --------------------------------------------------------------

  draw() {
    const rd = this.rd;
    const tr = this.track;
    // A little more phosphor at speed: the trails are the speed.
    const trail = 0.42 - clamp((this.speed - 250) / 400, 0, 1) * 0.16;
    rd.beginFrame(trail);

    const camT = Math.max(0, this.t - CAM_BACK);
    // Wireframe has no occlusion, so below the rim the surface plane bled
    // through the rock and read as a ceiling. Fading it by altitude restores
    // what a solid renderer would hide, and makes breaking the rim a reveal.
    const rim = tr.rim(this.t);
    const deck = Math.max(0.05, smoothstep(rim - 52, rim + 8, this.shipY));
    this.terrain.draw(rd, camT, this.exposed, this.time, deck);
    drawObstacles(rd, tr, this.level.obstacles, this.obCursor, camT, FAR, this.time);
    drawEnemies(rd, tr, this.level.enemies, camT, FAR, this.time);
    drawEnemies(rd, tr, this.drones, camT, FAR, this.time);
    if (this.level.port && this.level.port.alive) {
      drawEnemies(rd, tr, [this.level.port], camT, FAR, this.time);
    }
    this.weapons.draw(rd);
    if (this.phase === 'lightspeed') {
      // Radial star-streaks from the vanishing point, longer as it winds up.
      const k = clamp(this.lightTimer / 1.4, 0, 1);
      for (let i = 0; i < 46; i++) {
        const a = hash2(i, 7) * TAU;
        const r0 = (0.06 + hash2(i, 11) * 0.4) * rd.height;
        const r1 = r0 + (14 + hash2(i, 13) * 130 * k) * rd.scale * (0.4 + k);
        const wob = ((this.time * (3 + hash2(i, 17) * 4)) % 1);
        rd.line2(rd.cx + Math.cos(a) * (r0 + wob * 40 * rd.scale * k),
          rd.cy + Math.sin(a) * (r0 + wob * 40 * rd.scale * k) * 0.8,
          rd.cx + Math.cos(a) * r1, rd.cy + Math.sin(a) * r1 * 0.8,
          1.6 * rd.scale, 0.8, 0.95, 1, 0.15 + k * 0.6, 0.7);
      }
    }
    if (this.boss && this.boss.alive) drawWarden(rd, this.boss, tr, this.time);
    if (this.pod && (this.phase === 'escape' || this.phase === 'won')) drawPod(rd, this.pod);
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= 0.016;
      if (a.life <= 0) { this.arcs.splice(i, 1); continue; }
      const [cr, cg, cb] = SPECIAL_COLORS[this.special] || [0.75, 0.4, 1];
      const glow = 0.5 + a.life * 6;
      for (let k = 1; k < a.pts.length; k++) {
        const u = a.pts[k - 1], v = a.pts[k];
        rd.line3(u[0], u[1], u[2], v[0], v[1], v[2], 2.2, cr, cg, cb, glow);
      }
      for (const [u, v] of a.branches || []) {
        rd.line3(u[0], u[1], u[2], v[0], v[1], v[2], 1.2, cr, cg, cb, glow * 0.7);
      }
    }
    this.particles.draw(rd);

    if (this.phase !== 'dead' || this.deathTimer < 0.35) {
      drawShip(rd, this.shipPos, this.basis,
        clamp((this.speed - 200) / 300, 0, 1), this.time, this.hurt);
    }

    this.drawOverlay();
    rd.endFrame();
  }

  drawOverlay() {
    const rd = this.rd;
    const tr = this.track;
    const port = this.level.port;

    if (this.phase === 'flying' || this.phase === 'boss') {
      // Every lockable thing on screen gets a box; the one being painted fills
      // up; the ones already locked are drawn held, with a tether back to the
      // crosshair so a salvo of eight still reads as one decision.
      const arrs = [this.level.enemies, this.drones];
      if (port) arrs.push([port]);
      if (this.boss && this.boss.alive) arrs.push([this.boss], this.boss.parts);
      const cx = this.aimSX ?? rd.cx;
      const cy = this.aimSY ?? rd.cy;
      for (const arr of arrs) {
        for (const e of arr) {
          // A bracket on a target hidden by rock is the same lie as locking it.
          if (!e.alive || !e.onScreen || !e.lockable) continue;
          if (!this.locks.includes(e) && e.los < 0.55) continue;
          const locked = this.locks.includes(e);
          const box = clamp(rd.focal * (RADIUS[e.kind] || 12) * 2.1
            / Math.max(60, e.dist || 400), 9 * rd.scale, 90 * rd.scale);
          drawTargetBox(rd, e.sx, e.sy, rd.scale, box,
            locked ? 0 : clamp(e.paint || 0, 0, 1), locked);
          if (locked) {
            rd.line2(cx, cy, e.sx, e.sy, 1 * rd.scale, 1, 0.55, 0.2, 0.16, 0.4);
          }
        }
      }
      drawReticle(rd, cx, cy, rd.scale, this.aimSize || 30 * rd.scale,
        this.paintProgress, this.lockedFlash > 0.5, !!this.hoverTarget);
    }

    const nextSeal = this.level.seals.find(
      (s) => s > this.t - 40 && !this.droppedSeals.has(s));
    // Warned in seconds, not units. A fixed distance means the warning gets
    // shorter exactly as the level gets faster -- at REACTOR's closing speed
    // 420 units is under a second, and the climb alone takes two thirds of one.
    const sealSecs = nextSeal === undefined
      ? Infinity : (nextSeal - this.t) / Math.max(1, this.speed);
    // Clearing a seal means being above the lip by the ship's own half height,
    // which is to say fully out of the trench and fully exposed.
    const sealClear = nextSeal !== undefined && this.shipY >= tr.rim(nextSeal) + 6;
    drawHud(rd, {
      shield: this.shield,
      shieldMax: this.shieldMax,
      score: this.score,
      speed: this.speed || 0,
      levelName: this.spec.name,
      locks: this.locks.length,
      lockMax: LOCK_MAX,
      heat: this.heat,
      overheated: this.overheated,
      missileCooldown: this.missileCooldown,
      missileMax: MISSILE_COOLDOWN,
      altitude: this.shipY,
      rimHeight: tr.rim(this.t),
      ceiling: this.ceiling || tr.rim(this.t) + 92,
      exposed: this.exposed,
      wallWarn: this.wallWarn,
      // Only while a sensor is actually reporting. Desktop Chrome defines
      // DeviceMotionEvent and never fires one, so 'granted' alone would nag a
      // keyboard player to hold their phone still forever.
      calibrating: this.input.motion === 'granted' && this.input.needsCalibration
        && this.input.hasReading,
      sealAhead: sealSecs < SEAL_WARN_SECS && nextSeal > this.t ? 1 : 0,
      sealClear,
      portAhead: port ? tr.portT - this.t < 700 && tr.portT > this.t : false,
      portAlive: port ? port.alive : false,
      progress: this.t / tr.total,
      total: tr.total,
      sealMarks: this.level.seals,
      portT: tr.portT,
      time: this.time,
      message: this.message,
      boss: this.boss && this.boss.alive && this.phase === 'boss'
        ? { name: this.boss.name, frac: this.boss.hp / this.boss.maxHp,
          flash: this.boss.flash, shielded: this.boss.shielded,
          parts: this.boss.parts.filter((x) => x.alive).length,
          partsMax: this.boss.parts.length }
        : null,
    });

    if (this.phase === 'won' || this.phase === 'dead' || this.phase === 'ended') this.drawResult();
  }

  drawResult() {
    const rd = this.rd;
    const s = rd.scale;
    const W = rd.width, H = rd.height;
    const won = this.phase === 'won';
    if (won && this.acquired) {
      // The weapon-get screen: the fanfare is already playing under it.
      const wait = this.winTimer;
      if (wait < 0.4) return;
      const a = clamp((wait - 0.4) / 0.5, 0, 1);
      const wc = SPECIAL_COLORS[this.acquired] || [0.75, 0.4, 1];
      drawText(rd, 'SPECIAL WEAPON ACQUIRED', W * 0.5, H * 0.3, 16 * s, 1.8 * s,
        0.8, 0.95, 1, a, 0);
      const pulse = 0.8 + 0.2 * Math.sin(this.time * 6);
      drawText(rd, this.acquired.toUpperCase(), W * 0.5, H * 0.42, 44 * s, 4.5 * s,
        wc[0], wc[1], wc[2], a * pulse, 0);
      // The diamond, because the meter is how you will meet it.
      const dy = H * 0.53, dr = 14 * s;
      const D = [[0, -dr], [dr * 0.7, 0], [0, dr], [-dr * 0.7, 0]];
      for (let k = 0; k < 4; k++) {
        rd.line2(W * 0.5 + D[k][0], dy + D[k][1], W * 0.5 + D[(k + 1) % 4][0], dy + D[(k + 1) % 4][1],
          2.2 * s, wc[0], wc[1], wc[2], a, a);
      }
      drawText(rd, 'HOLD SPECIAL TO FIRE IT', W * 0.5, H * 0.62, 11 * s, 1.2 * s,
        1, 0.8, 0.4, a * 0.9, 0);
      drawText(rd, 'TAP TO CONTINUE', W * 0.5, H * 0.72, 13 * s, 1.5 * s,
        0.5, 0.9, 1, a * (0.5 + 0.5 * Math.abs(Math.sin(this.time * 3))), 0);
      return;
    }
    const title = won ? 'RUN COMPLETE' : this.phase === 'dead' ? 'DESTROYED' : 'PORT MISSED';
    const col = won ? [0.5, 1, 0.8] : [1, 0.4, 0.3];
    const wait = won ? this.winTimer : this.deathTimer || this.winTimer;
    if (wait < 0.8) return;
    const a = clamp((wait - 0.8) / 0.6, 0, 1);
    drawText(rd, title, W * 0.5, H * 0.34, 30 * s, 3 * s, col[0], col[1], col[2], a, 0);
    const lines = [
      `SCORE ${this.score}`,
      `KILLS ${this.kills}`,
      `DISTANCE ${Math.round(Math.min(this.t, this.track.total))} / ${Math.round(this.track.total)}`,
      `HITS TAKEN ${this.hitsTaken}`,
    ];
    lines.forEach((l, i) => {
      drawText(rd, l, W * 0.5, H * 0.44 + i * 20 * s, 12 * s, 1.3 * s, 1, 0.8, 0.4, a, 0);
    });
    drawText(rd, 'TAP TO CONTINUE', W * 0.5, H * 0.66, 13 * s, 1.5 * s,
      0.5, 0.9, 1, a * (0.5 + 0.5 * Math.abs(Math.sin(this.time * 3))), 0);
  }
}
