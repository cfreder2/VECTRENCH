// The run itself: ship physics on the rail, the camera, collision, enemy fire,
// and the lock-on that ends the level.
//
// Steering is absolute-position control, not thrust: the tilt of the phone maps
// to where in the cross-section the ship sits. That is what makes an on-rails
// flyer feel precise at speed -- the ship goes where you point it and re-centres
// when you let go.

import { clamp, lerp, approach, hash2, smoothstep, TAU } from './math.js';
import { Track, makeFrame } from './track.js';
import { buildLevel } from './level.js';
import { TerrainRenderer, CANYON } from './terrain.js';
import {
  Weapons, Particles, drawShip, drawObstacles, drawEnemies,
  shipBasis, shipLocalToWorld, MUZZLES,
} from './entities.js';
import { drawHud, drawReticle, drawTargetBox } from './hud.js';
import { segSphere, hitsObstacle, frameOf } from './collide.js';
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
const PAINT_RADIUS = 108;     // how wide the crosshair paints, in scale units
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
const KNIFE_RATE = 4.2;       // how fast it goes over, and comes back
export const SHIP_HX = 7, SHIP_HY = 5;
export const KNIFE_HX = 2.5, KNIFE_HY = 9;

// The burn. Short, expensive, and it stacks with a turbo gate into something
// genuinely hard to hold onto.
const BOOST_MUL = 1.5;
const BOOST_TIME = 2.4;
const BOOST_COOL = 9;
const GATE_BOOST_TIME = 2.2;
const SUPER_MUL = 2.1;        // gated while already burning

const SEAL_DROP_SPEED = 190;  // how fast a bulkhead sinks once its panels go

// The sunbursts fire down their own arms, one arm at a time, going round the
// wheel. A beam is left hanging where it was fired rather than sweeping with
// the arm, so what builds up is a fan of them that turns -- and the gap that
// turns with it is the way through. Long enough to reach the wall, because the
// point is that going round the outside is the dangerous way past.
const BEAM_INTERVAL = 0.4;    // seconds between arms
// How long a beam hangs there, in arms rather than in seconds: two of them
// always have to be dark, or a three-armed wheel is a solid wall with no way
// through it and the timing the player is being asked for does not exist.
const beamLife = (arms) => Math.max(0.5, (arms - 2) * BEAM_INTERVAL);
const BEAM_HALF = 4.5;        // how close is a hit
const BEAM_DAMAGE = 24;

const RADIUS = { turret: 13, wallgun: 11, emplacement: 21, drone: 11, port: 20 };

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
    this._l = [0, 0, 0];

    this.phase = 'idle';
    this.spec = null;
    this.track = null;
    this.level = null;
  }

  load(spec) {
    this.spec = spec;
    this.track = new Track(spec);
    this.level = buildLevel(spec, this.track);
    this.terrain = new TerrainRenderer(this.track);
    this.reset();
  }

  reset() {
    const tr = this.track;
    this.t = 40;
    this.shipX = 0;
    this.shipY = tr.railY(this.t);
    this.velX = 0;
    this.velY = 0;
    this.bank = 0;
    this.knife = 0;             // 0 level, 1 fully on edge
    this.boost = 0;             // seconds of burn left
    this.boostCool = 0;
    this.boostMul = BOOST_MUL;
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
      ob.dropY = 0; ob.gone = false; ob.dropping = false; ob.beams = null;
      ob.taken = false;
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
    }
    if (this.level.port) {
      this.level.port.alive = true;
      this.level.port.hp = 1;
      this.level.port.paint = 0;
      this.level.port.spin = 0;
    }
    for (const ob of this.level.obstacles) ob.hit = false;
    this.weapons.clear();
    this.particles.clear();
    this.aimDist = AIM_DIST;
    this.knife = 0;
    this.boost = 0;
    this.boostCool = 0;
    this.boostMul = BOOST_MUL;
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
    if (this.phase === 'flying' && !this.exposed && this.calm <= 0
        && this.shield < SHIELD_MAX) {
      this.shield = Math.min(SHIELD_MAX, this.shield + SHIELD_REGEN * dt);
    }
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.lockedFlash = Math.max(0, this.lockedFlash - dt * 2);
    for (const e of this.level.enemies) if (e.flash > 0) e.flash -= dt * 6;

    const flying = this.phase === 'flying';

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
    this.boostCool = Math.max(0, this.boostCool - dt);
    if (inp.takeBoost() && this.boost <= 0 && this.boostCool <= 0) {
      this.boost = BOOST_TIME;
      this.boostMul = BOOST_MUL;
      this.boostCool = BOOST_COOL;
      this.say('BURN', 0.8);
      this.audio.boost();
    }
    if (this.boost > 0) {
      this.boost = Math.max(0, this.boost - dt);
      if (this.boost <= 0) this.boostMul = BOOST_MUL;
    }
    this.knife = approach(this.knife, inp.rolling ? 1 : 0, KNIFE_RATE, dt);

    this.speed = tr.speedAt(this.t) * (this.boost > 0 ? this.boostMul : 1);
    this.t += this.speed * dt;

    const hw = tr.halfWidth(this.t);
    const rim = tr.rim(this.t);
    this.ceiling = rim + 92;

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
    this.shipRoll = this.bank + this.knife * Math.PI * 0.5;
    this.pitch = approach(this.pitch, inp.steerY * 0.32, 6.5, dt);
    // Yaw is aim. It follows the steer rather than the velocity so that the
    // crosshair answers the stick directly -- pointing somewhere should not
    // have to wait for the ship to finish drifting there.
    this.yaw = approach(this.yaw, inp.steerX * YAW_MAX, 7.5, dt);

    if (this.grinding && hash2((this.time * 12) | 0, 8) < 0.25) this.audio.scrape();

    this.updateSeals(dt);
    this.updateBeams(dt);
    this.checkObstacles(dt);
    this.checkBeams();
    this.spawnDrones();
    this.updateDrones(dt);
    this.checkFinish();
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
    }
    this.exposed = false;
    this.updateDrones(dt);
  }

  checkFinish() {
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
    if (this.phase !== 'flying') return;
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
    if (this.boost > 0) {
      this.boostMul = SUPER_MUL;
      this.boost = Math.max(this.boost, GATE_BOOST_TIME);
      this.say('SUPER BURN', 1);
      this.shake = Math.min(1.5, this.shake + 0.5);
    } else {
      this.boostMul = BOOST_MUL;
      this.boost = GATE_BOOST_TIME;
      this.say('BURN', 0.8);
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
      d.t += this.speed * 0.42 * dt;
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
    const roll = this.bank * 0.42 + this.knife * 0.2;
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
          const speed = heavy ? 420 : 520;
          // Lead the target, or the shot always trails a ship this fast.
          const lead = dist / speed;
          const px = this.shipPos[0] + this.camF[0] * this.speed * lead * 0.85;
          const py = this.shipPos[1] + this.camF[1] * this.speed * lead * 0.85;
          const pz = this.shipPos[2] + this.camF[2] * this.speed * lead * 0.85;
          let ax = px - e.world[0], ay = py - e.world[1], az = pz - e.world[2];
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
    const grab = PAINT_RADIUS * rd.scale;
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
   * The sunbursts: one arm fires, then the next one round, and each beam hangs
   * in the air fading out behind it.
   *
   * The beam is pinned to the canyon at the angle the arm had when it fired,
   * not to the arm, so the wheel keeps turning underneath a fan that stays
   * put. Arms are taken in decreasing order, which is clockwise on screen.
   */
  updateBeams(dt) {
    const now = this.time;
    for (const ob of this.level.obstacles) {
      if (ob.kind !== 'pinwheel') continue;
      const ahead = ob.t - this.t;
      if (ahead > FAR || ahead < -140) continue;
      if (!ob.beams) { ob.beams = []; ob.beamArm = 0; ob.beamTimer = hash2(ob.t | 0, 5) * BEAM_INTERVAL; }
      for (let i = ob.beams.length - 1; i >= 0; i--) {
        if (now - ob.beams[i].born > ob.beams[i].life) ob.beams.splice(i, 1);
      }
      ob.beamTimer -= dt;
      if (ob.beamTimer > 0) continue;
      ob.beamTimer += BEAM_INTERVAL;
      const n = ob.boxes.length;
      ob.beamArm = (ob.beamArm - 1 + n) % n;
      frameOf(ob, now, this._frame);
      const spin = Math.atan2(this._frame[3], this._frame[2]);
      const hw = this.track.halfWidth(ob.t);
      ob.beams.push({
        ang: (ob.boxes[ob.beamArm][4] || 0) + spin,
        born: now,
        reach: Math.max(hw, this.track.rim(ob.t)) + 46,
        life: beamLife(n),
        hit: false,
      });
      if (ahead < 700 && ahead > -60) this.audio.beam();
    }
  }

  /**
   * Flying into one. The beams live in the obstacle's own cross-section, so
   * this only asks the question while the ship is passing through that slice.
   */
  checkBeams() {
    for (const ob of this.level.obstacles) {
      if (ob.kind !== 'pinwheel' || !ob.beams || !ob.beams.length) continue;
      if (Math.abs(ob.t - this.t) > 26) continue;
      const cx = ob.cx || 0, cy = ob.cy || 0;
      const dx = this.shipX - cx, dy = this.shipY - cy;
      for (const b of ob.beams) {
        if (b.hit) continue;
        // Distance from the ship to the ray, and only the half that is in front
        // of the hub -- a beam does not come out of the back of an arm.
        const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang);
        if (along < -6 || along > b.reach) continue;
        const off = Math.abs(-dx * Math.sin(b.ang) + dy * Math.cos(b.ang));
        if (off > BEAM_HALF + 7) continue;
        b.hit = true;
        this.damage(BEAM_DAMAGE);
        this.sparkAt(this.shipX, this.shipY, 8, 120, 1, 0.6, 0.15);
        this.audio.hit();
      }
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
    const speed = 700;
    const lead = dist / speed;
    // Leads the ship, then scatters: a stream that converged perfectly would be
    // a hitscan death sentence, and one that did not converge would be scenery.
    const j = () => (hash2((this.time * 120) | 0, (e.t | 0) & 511) - 0.5) * GATLING_SPREAD;
    const px = this.shipPos[0] + this.camF[0] * this.speed * lead * 0.9 + j() * 26;
    const py = this.shipPos[1] + this.camF[1] * this.speed * lead * 0.9 + j() * 22;
    const pz = this.shipPos[2] + this.camF[2] * this.speed * lead * 0.9;
    let ax = px - e.world[0], ay = py - e.world[1], az = pz - e.world[2];
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
          tg.hp = 0;
          this.destroy(tg);
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
    const big = e.kind === 'port' || e.kind === 'emplacement';
    this.boomAt(e.world, big ? 90 : 34, big ? 300 : 170,
      1, e.kind === 'port' ? 0.85 : 0.55, 0.25, big ? 1.6 : 0.8);
    if (big) {
      this.audio.bigBoom();
      this.shake = Math.min(1.6, this.shake + 1);
    } else {
      this.audio.smallBoom();
    }
    if (e.kind === 'port') {
      this.phase = 'won';
      this.score += 5000;
      this.say('DIRECT HIT', 5);
      this.audio.win();
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

    if (this.phase === 'flying') {
      // Every lockable thing on screen gets a box; the one being painted fills
      // up; the ones already locked are drawn held, with a tether back to the
      // crosshair so a salvo of eight still reads as one decision.
      const arrs = [this.level.enemies, this.drones];
      if (port) arrs.push([port]);
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
    });

    if (this.phase !== 'flying') this.drawResult();
  }

  drawResult() {
    const rd = this.rd;
    const s = rd.scale;
    const W = rd.width, H = rd.height;
    const won = this.phase === 'won';
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
