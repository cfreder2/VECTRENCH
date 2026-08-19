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
import { segSphere } from './collide.js';
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
const LOCK_TIME = 1.05;
const LASER_CADENCE = 0.115;
const FAR = CANYON.DRAW;
const CAM_BACK = 66;
const SHIELD_MAX = 100;
const MISSILE_MAX = 4;
const MISSILE_REGEN = 7.5;

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
    this.pitch = 0;
    this.shield = SHIELD_MAX;
    this.shieldMax = SHIELD_MAX;
    this.score = 0;
    this.missiles = MISSILE_MAX;
    this.missileTimer = 0;
    this.time = 0;
    this.shake = 0;
    this.hurt = 0;
    this.fireTimer = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
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

    this.drones = [];
    for (const w of this.level.drones) w.spawned = false;
    for (const e of this.level.enemies) {
      e.alive = true;
      e.hp = e.maxHp;
      e.flash = 0;
      e.spin = hash2((e.t * 3) | 0, 9) * TAU;
    }
    if (this.level.port) {
      this.level.port.alive = true;
      this.level.port.hp = 1;
      this.level.port.spin = 0;
    }
    for (const ob of this.level.obstacles) ob.hit = false;
    this.weapons.clear();
    this.particles.clear();
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
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.lockedFlash = Math.max(0, this.lockedFlash - dt * 2);
    for (const e of this.level.enemies) if (e.flash > 0) e.flash -= dt * 6;

    const flying = this.phase === 'flying';

    if (flying) this.updateShip(dt);
    else this.updateOutro(dt);

    this.updateCamera(cssW, cssH);

    this.updateEnemies(dt, flying);
    if (flying) this.updateAim(dt, cssW, cssH);

    this.weapons.update(dt);
    this.collide(dt, flying);
    this.particles.update(dt);

    this.missileTimer += dt;
    if (this.missileTimer > MISSILE_REGEN && this.missiles < MISSILE_MAX) {
      this.missileTimer = 0;
      this.missiles++;
    }
    // Never let a player arrive at the port unable to shoot it.
    if (flying && tr.portT > 0 && this.missiles === 0 && tr.portT - this.t < 900) {
      this.missiles = 1;
      this.say('MISSILE RELOADED');
    }

    this.audio.setEngine(clamp((this.speed - 200) / 400, 0, 1), flying ? 1 : 0.3);
  }

  updateShip(dt) {
    const tr = this.track;
    const inp = this.input;
    this.speed = tr.speedAt(this.t);
    this.t += this.speed * dt;

    const hw = tr.halfWidth(this.t);
    const rim = tr.rim(this.t);
    this.ceiling = rim + 92;

    this.velX = approach(this.velX, inp.steerX * MAX_VX, STEER_RATE, dt);
    this.velY = approach(this.velY, inp.steerY * MAX_VY, STEER_RATE, dt);
    this.shipX += this.velX * dt;
    this.shipY += this.velY * dt;

    // Walls. Grinding along one is survivable for a moment and fatal if held.
    const limX = hw - 8;
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
    this.pitch = approach(this.pitch, inp.steerY * 0.32, 6.5, dt);

    if (this.grinding && hash2((this.time * 12) | 0, 8) < 0.25) this.audio.scrape();

    this.checkObstacles(dt);
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
      for (const [x0, x1, y0, y1] of ob.boxes) {
        if (this.shipX + 7 > x0 && this.shipX - 7 < x1 &&
            this.shipY + 5 > y0 && this.shipY - 5 < y1) {
          ob.hit = true;
          this.damage(ob.kind === 'seal' ? 48 : 34);
          this.boomAt(this.shipPos, 34, 170, 1, 0.55, 0.2, 0.7);
          this.audio.smallBoom();
          break;
        }
      }
    }
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
          hp: 2, maxHp: 2, lockable: false, points: 200,
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
    shipBasis(this.shipFrame, this.bank, this.pitch, this.basis);

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
    const roll = this.bank * 0.42;
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

        let wants = false;
        let heavy = false;
        let reload = 1.4;
        if (e.kind === 'turret') {
          // Surface batteries only engage a ship that has broken the rim.
          wants = this.exposed && ahead < 780 && ahead > -40;
          reload = 1.15;
        } else if (e.kind === 'wallgun') {
          wants = !this.exposed && ahead < 620 && ahead > 30;
          reload = 1.7;
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
          const speed = heavy ? 380 : 440;
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

  /** Reticle targeting, laser cadence, and the missile lock. */
  updateAim(dt, cssW, cssH) {
    const rd = this.rd;
    const inp = this.input;
    const sx = inp.aimX * (rd.width / Math.max(1, cssW));
    const sy = inp.aimY * (rd.height / Math.max(1, cssH));
    this.aimSX = sx;
    this.aimSY = sy;

    // Project lockable targets and pick the one nearest the crosshair.
    const grab = 70 * rd.scale;
    let best = null;
    let bestD = grab;
    const cands = [this.level.enemies, this.drones];
    if (this.level.port) cands.push([this.level.port]);
    for (const arr of cands) {
      for (const e of arr) {
        e.onScreen = false;
        if (!e.alive || !e.world) continue;
        const ahead = e.t - this.t;
        if (ahead < 20 || ahead > 950) continue;
        const vz = rd.project(e.world[0], e.world[1], e.world[2], this._l);
        if (vz < 2) continue;
        e.sx = this._l[0];
        e.sy = this._l[1];
        e.onScreen = true;
        if (!e.lockable) continue;
        const d = Math.hypot(e.sx - sx, e.sy - sy);
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    this.hoverTarget = best;

    // Aim ray through the crosshair, used for both lasers and the lock.
    const kx = (sx - rd.cx) / rd.focal;
    const ky = -(sy - rd.cy) / rd.focal;
    const ax = this.camF[0] + this.camR[0] * kx + this.camU[0] * ky;
    const ay = this.camF[1] + this.camR[1] * kx + this.camU[1] * ky;
    const az = this.camF[2] + this.camR[2] * kx + this.camU[2] * ky;
    const al = Math.hypot(ax, ay, az) || 1;
    const AIM_DIST = 700;
    const tx = this.eye[0] + (ax / al) * AIM_DIST;
    const ty = this.eye[1] + (ay / al) * AIM_DIST;
    const tz = this.eye[2] + (az / al) * AIM_DIST;

    if (inp.firing) {
      // Lasers: immediate on press, then a steady cadence while held.
      this.fireTimer -= dt;
      if (inp.takePress()) this.fireTimer = 0;
      if (this.fireTimer <= 0) {
        this.fireTimer = LASER_CADENCE;
        for (const m of MUZZLES) {
          shipLocalToWorld(this.shipPos, this.basis, m[0], m[1], m[2], this._p);
          let dx = tx - this._p[0], dy = ty - this._p[1], dz = tz - this._p[2];
          const dl = Math.hypot(dx, dy, dz) || 1;
          this.weapons.fireLaser(this._p[0], this._p[1], this._p[2], dx / dl, dy / dl, dz / dl);
        }
        this.audio.laser();
      }

      // Lock: hold the crosshair on a lockable target long enough.
      if (best) {
        if (this.lockTarget !== best) {
          this.lockTarget = best;
          this.lockProgress = 0;
        }
        const before = this.lockProgress;
        this.lockProgress += dt / LOCK_TIME;
        if (Math.floor(before * 8) !== Math.floor(this.lockProgress * 8)) this.audio.lockTick();
        if (this.lockProgress >= 1) this.releaseMissile(best);
      } else {
        this.lockTarget = null;
        this.lockProgress = Math.max(0, this.lockProgress - dt * 2);
      }
    } else {
      inp.takePress();
      this.lockTarget = null;
      this.lockProgress = Math.max(0, this.lockProgress - dt * 3);
    }
  }

  releaseMissile(target) {
    this.lockProgress = 0;
    this.lockTarget = null;
    if (this.missiles <= 0) {
      this.say('NO MISSILES');
      return;
    }
    this.missiles--;
    this.lockedFlash = 1;
    shipLocalToWorld(this.shipPos, this.basis, 0, -2, 4, this._p);
    let dx = target.world[0] - this._p[0];
    let dy = target.world[1] - this._p[1];
    let dz = target.world[2] - this._p[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    this.weapons.fireMissile(this._p[0], this._p[1], this._p[2], dx / l, dy / l, dz / l, target);
    this.audio.missile();
    this.say('FOX TWO', 1.1);
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
          this.damage(s.heavy ? 19 : 11);
          this.particles.burst(s.x, s.y, s.z, 10, 140, 1, 0.5, 0.25, 0.4, 1.8);
          W.bolts.splice(i, 1);
        }
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
        this.audio.smallBoom();
        W.missiles.splice(i, 1);
      }
    }
  }

  /** Does a world point sit inside nearby obstacle geometry? */
  hitsScenery(x, y, z) {
    const tr = this.track;
    const obs = this.level.obstacles;
    tr.worldToLocal(x, y, z, this._q);
    const lt = this._q[0], lx = this._q[1], ly = this._q[2];
    if (Math.abs(lx) > tr.halfWidth(lt) + 4) return true;
    for (let i = this.obCursor; i < obs.length; i++) {
      const ob = obs[i];
      if (ob.t > lt + 30) break;
      if (ob.t + ob.dz < lt - 30) continue;
      if (lt < ob.t || lt > ob.t + ob.dz) continue;
      for (const [x0, x1, y0, y1] of ob.boxes) {
        if (lx > x0 && lx < x1 && ly > y0 && ly < y1) return true;
      }
    }
    return false;
  }

  destroy(e) {
    e.alive = false;
    this.score += e.points;
    this.kills++;
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
    } else if (e.kind === 'emplacement') {
      this.missiles = Math.min(MISSILE_MAX, this.missiles + 1);
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
      // Target boxes on everything lockable that is on screen.
      const arrs = [this.level.enemies, this.drones];
      if (port) arrs.push([port]);
      for (const arr of arrs) {
        for (const e of arr) {
          if (!e.alive || !e.onScreen || !e.lockable) continue;
          const isTarget = e === this.lockTarget;
          drawTargetBox(rd, e.sx, e.sy, rd.scale,
            isTarget ? this.lockProgress : 0, isTarget && this.lockProgress > 0.99);
        }
      }
      drawReticle(rd, this.aimSX ?? rd.cx, this.aimSY ?? rd.cy, rd.scale,
        this.lockProgress, this.lockedFlash > 0.5, !!this.hoverTarget);
    }

    const nextSeal = this.level.seals.find((s) => s > this.t - 40);
    drawHud(rd, {
      shield: this.shield,
      shieldMax: this.shieldMax,
      score: this.score,
      speed: this.speed || 0,
      levelName: this.spec.name,
      missiles: this.missiles,
      altitude: this.shipY,
      rimHeight: tr.rim(this.t),
      ceiling: this.ceiling || tr.rim(this.t) + 92,
      exposed: this.exposed,
      wallWarn: this.wallWarn,
      sealAhead: nextSeal !== undefined && nextSeal - this.t < 420 && nextSeal > this.t ? 1 : 0,
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
