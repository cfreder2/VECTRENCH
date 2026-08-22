// The front of the game: pick a level, fly it, or describe a new one.
//
// Screens are DOM overlays over the same canvas the game renders into, so the
// menu can show the chosen level as a live vector schematic behind the panel
// rather than as a separate widget.
//
// Designing a level happens on the local server, not here -- the page posts the
// description and gets back a finished level. Served from GitHub Pages there is
// no server to post to, the button says so, and the pre-built levels are all
// there is.

import { decodeSpec, normalizeSpec } from './spec.js';
import { PREBUILT } from './levels.js';
import { drawText } from './font.js';
import { Campaign, DISTRICTS, WEAPONS, MACHINE_GUN } from './campaign.js';
import { SONGS } from './songs.js';
import { Renderer } from './renderer.js';
import { drawShip } from './entities.js';
import { boltPath, SPECIAL_COLORS } from './game.js';
import { Track, makeFrame } from './track.js';
import { TerrainRenderer } from './terrain.js';

const $ = (id) => document.getElementById(id);

/** '#b06fff' -> [0.69, 0.44, 1], for drawing DOM-side colors on the canvas. */
function hexRgb(css) {
  const n = parseInt(css.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/**
 * Three question marks in three dimensions, each turning at its own rate --
 * the Citadel square saying "sealed" without a word of English. A plain 2D
 * canvas with the projection done by hand: the browser rations WebGL
 * contexts, and a question mark does not need one.
 */
class QMarks {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    // The glyph, as a polyline in x/y (y down), plus the dot below.
    this.pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * 1.05 - (i / 14) * Math.PI * 1.35;
      this.pts.push([Math.cos(a) * 0.42, -0.5 + Math.sin(a) * -0.42]);
    }
    this.pts.push([0, 0.05], [0, 0.28]);
  }

  tick() {
    const c = this.canvas;
    if (!c.isConnected) return;
    const rect = c.getBoundingClientRect();
    if (rect.width < 4) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = this.g;
    g.clearRect(0, 0, W, H);
    const t = performance.now() / 1000;
    const focal = 3;
    const marks = [
      { x: -0.31, rate: 0.7, size: 0.24, phase: 0 },
      { x: 0, rate: -1.15, size: 0.3, phase: 2 },
      { x: 0.31, rate: 1.6, size: 0.22, phase: 4 },
    ];
    for (const m of marks) {
      const a = t * m.rate + m.phase;
      const ca = Math.cos(a), sa = Math.sin(a);
      const S = H * m.size;
      const cx = W * (0.5 + m.x), cy = H * 0.46;
      g.beginPath();
      let first = true;
      for (const [px, py] of this.pts.slice(0, 15)) {
        const z = px * sa;
        const k = focal / (focal + z);
        const sx = cx + px * ca * S * k, sy = cy + py * S * k;
        if (first) { g.moveTo(sx, sy); first = false; } else g.lineTo(sx, sy);
      }
      // The stem, then the dot, each projected the same way.
      for (const [px, py] of this.pts.slice(15)) {
        const z = px * sa;
        const k = focal / (focal + z);
        g.lineTo(cx + px * ca * S * k, cy + py * S * k);
      }
      const depth = 0.7 + 0.3 * ca * ca;
      g.strokeStyle = `rgba(140, 215, 255, ${0.75 * depth})`;
      g.lineWidth = Math.max(1, 1.6 * dpr * depth);
      g.shadowColor = 'rgba(111, 230, 255, 0.8)';
      g.shadowBlur = 7 * dpr * depth;
      g.lineCap = 'round';
      g.stroke();
      g.beginPath();
      g.arc(cx, cy + 0.46 * S, Math.max(1.2, 0.05 * S), 0, TAU_2D);
      g.fillStyle = `rgba(140, 215, 255, ${0.85 * depth})`;
      g.fill();
    }
  }
}
const TAU_2D = Math.PI * 2;

/**
 * The interceptor on its stand: the actual game ship, drawn by the actual
 * game's ship renderer, with the camera walking a slow circle around it.
 */
class ShipView {
  constructor(canvas) {
    this.canvas = canvas;
    this.rd = new Renderer(canvas);
    this.basis = { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] };
    this.sized = false;
  }

  tick() {
    if (!this.canvas.isConnected) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    if (!this.sized || Math.abs(rect.width - this._w) > 2 || Math.abs(rect.height - this._h) > 2) {
      this.rd.resize(rect.width, rect.height, 400_000);
      this._w = rect.width; this._h = rect.height;
      this.sized = true;
    }
    const t = performance.now() / 1000;
    const a = t * 0.6;
    const eye = [Math.sin(a) * 44, 12 + Math.sin(t * 0.9) * 3, Math.cos(a) * 44];
    const f = [-eye[0], -eye[1] + 6, -eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const r = [f[2], 0, -f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    this.rd.beginFrame(1);
    this.rd.setCamera(eye, r, u, f, 0.9, 400);
    drawShip(this.rd, [0, 0, 0], this.basis, 0.35 + 0.15 * Math.sin(t * 3), t, 0);
    this.rd.endFrame();
  }
}


/**
 * The firing range: the armory's live demonstration. Its own renderer on its
 * own canvas, a ship on the line, targets downrange, and the selected weapon
 * doing what its page says it does. The two shots that exist in the game --
 * the gun and ARC -- fire exactly as they fire in flight; the six still in
 * the forge fire as designed, which is what this range is FOR: seeing them.
 */
class Range {
  constructor(canvas) {
    this.canvas = canvas;
    this.rd = new Renderer(canvas);
    this.sized = false;
    this.key = null;
    this.last = 0;
    this.basis = { r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, 1] };  // nose downrange
    this.ship = [0, 9, 0];
  }

  muzzle(side, out) {
    out[0] = this.ship[0] + side * 14.4;
    out[1] = this.ship[1] - 1.4;
    out[2] = this.ship[2] + 6;
    return out;
  }

  show(key) {
    if (key === this.key) return;
    this.key = key;
    this.t = 0;
    this.timer = 0;
    this.shots = [];
    this.sparks = [];
    this.clouds = [];
    this.walls = [];
    this.lance = 0;
    this.frags = [];
    this.sawU = -0.4;
    this.arcAt = 0;
    this.arcHeat = 0;
    // GHOST gets a bunker to shoot through; RAIL gets its targets in a line.
    const lineUp = key === 'rail';
    const hide = key === 'ghost';
    this.targets = [
      { x: lineUp ? -8 : -20, y: lineUp ? 12 : 12, z: 115, r: 11 },
      { x: lineUp ? 0 : 16, y: lineUp ? 13 : 20, z: 170, r: 11 },
      { x: lineUp ? 8 : hide ? 0 : -8, y: lineUp ? 14 : 14, z: hide ? 205 : 225, r: 11 },
    ].map((o, i) => ({ ...o, alive: true, spin: i * 0.8, rate: 3, flash: 0, respawn: 0, frozen: 0 }));
  }

  kill(tg, delay = 2.4) {
    if (!tg.alive) return;
    tg.alive = false;
    tg.respawn = delay;
    tg.frozen = 0;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, v = 60 + (i % 5) * 22;
      this.sparks.push({ x: tg.x, y: tg.y, z: tg.z,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, vz: (i % 3 - 1) * 40, life: 0.7 });
    }
  }

  /** One tick: advance the sim by real time, then draw the whole scene. */
  tick() {
    if (!this.canvas.isConnected || !this.key) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    if (!this.sized || Math.abs(rect.width - this._w) > 2 || Math.abs(rect.height - this._h) > 2) {
      this.rd.resize(rect.width, rect.height, 500_000);
      this._w = rect.width; this._h = rect.height;
      this.sized = true;
    }
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, this.last ? now - this.last : 1 / 60);
    this.last = now;
    this.t += dt;
    this.step(dt);

    const rd = this.rd;
    rd.beginFrame(1);
    // Broadside of the firing line: the ship enters at frame left, the
    // targets march away to the right, and the whole lane fills the width.
    // FOV is vertical, so a narrow portrait canvas sees a fraction of the
    // horizontal span a wide one does -- the camera backs off by exactly
    // that fraction, and the whole lane fits at every aspect.
    const at = [0, 11, 128];
    const aspect = this._w / this._h;
    const k = Math.min(2.4, Math.max(1, 2.6 / aspect));
    const off = [-125 + Math.sin(this.t * 0.3) * 6, 29, -60];
    const eye = [at[0] + off[0] * k, at[1] + off[1] * k, at[2] + off[2] * k];
    const f = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const r = [f[2], 0, -f[0]];
    const rl = Math.hypot(r[0], r[2]) || 1;
    r[0] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    rd.setCamera(eye, r, u, f, 1.0, 900);
    this.drawScene(rd);
    rd.endFrame();
  }

  step(dt) {
    const k = this.key;
    for (const tg of this.targets) {
      tg.flash = Math.max(0, tg.flash - dt * 5);
      tg.spin += dt * tg.rate * (1 - tg.frozen);
      if (!tg.alive) {
        tg.respawn -= dt;
        if (tg.respawn <= 0) { tg.alive = true; tg.flash = 0; tg.frozen = 0; }
      }
    }
    let w = 0;
    for (const sp of this.sparks) {
      sp.life -= dt;
      if (sp.life <= 0) continue;
      sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.z += sp.vz * dt;
      sp.vy -= 130 * dt;
      this.sparks[w++] = sp;
    }
    this.sparks.length = w;
    this.timer -= dt;
    const live = this.targets.filter((t) => t.alive);
    const m = [0, 0, 0];

    if (k === 'mg') {
      // The real gun: twin muzzles, real cadence, real streak.
      if (this.timer <= 0 && live.length) {
        this.timer = 0.085;
        const tg = live[0];
        for (const side of [-1, 1]) {
          this.muzzle(side, m);
          const d = [tg.x - m[0], tg.y - m[1], tg.z - m[2]];
          const L = Math.hypot(d[0], d[1], d[2]) || 1;
          this.shots.push({ x: m[0], y: m[1], z: m[2],
            dx: d[0] / L, dy: d[1] / L, dz: d[2] / L, speed: 1100, hp: 1 });
        }
      }
      this.stepShots(dt, (tg) => { tg.flash = 1; tg.hp = (tg.hp ?? 9) - 1; if (tg.hp <= 0) { tg.hp = 9; this.kill(tg); } });
    } else if (k === 'arc') {
      // The real ARC: the chain crackles from lock to lock, heat kills the head.
      if (live.length) {
        this.arcHeat += dt;
        if (this.arcHeat > 1.3) { this.arcHeat = 0; this.kill(live[0]); }
      }
    } else if (k === 'wave') {
      if (this.timer <= 0) { this.timer = 2.6; this.walls.push({ z: 30 }); }
      let ww = 0;
      for (const wl of this.walls) {
        const z0 = wl.z;
        wl.z += 150 * dt;
        for (const tg of this.targets) if (tg.alive && tg.z > z0 && tg.z <= wl.z) this.kill(tg, 2.0);
        if (wl.z < 340) this.walls[ww++] = wl;
      }
      this.walls.length = ww;
    } else if (k === 'magma') {
      if (this.timer <= 0 && live.length) {
        this.timer = 1.5;
        const tg = live[(this.t | 0) % live.length];
        this.muzzle(1, m);
        this.shots.push({ x: m[0], y: m[1], z: m[2], tx: tg.x, ty: tg.y, tz: tg.z, speed: 190, lob: 1 });
      }
      let sw = 0;
      for (const sh of this.shots) {
        const d = [sh.tx - sh.x, sh.ty - sh.y, sh.tz - sh.z];
        const L = Math.hypot(d[0], d[1], d[2]);
        if (L < 14) { this.clouds.push({ x: sh.tx, y: sh.ty, z: sh.tz, life: 2.6, r: 4 }); continue; }
        sh.x += (d[0] / L) * sh.speed * dt;
        sh.y += (d[1] / L) * sh.speed * dt + Math.max(0, 26 - L * 0.2) * dt;
        sh.z += (d[2] / L) * sh.speed * dt;
        this.shots[sw++] = sh;
      }
      this.shots.length = sw;
      let cw = 0;
      for (const c of this.clouds) {
        c.life -= dt;
        c.r = Math.min(24, c.r + 60 * dt);
        for (const tg of this.targets) {
          if (tg.alive && Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z) < c.r + 4) {
            tg.flash = Math.max(tg.flash, 0.5);
            tg.burn = (tg.burn || 0) + dt;
            if (tg.burn > 0.9) { tg.burn = 0; this.kill(tg); }
          }
        }
        if (c.life > 0) this.clouds[cw++] = c;
      }
      this.clouds.length = cw;
    } else if (k === 'saw') {
      this.sawU += dt / 2.8;
      if (this.sawU >= 1) this.sawU = -0.15;   // a beat between throws
      const u = Math.max(0, this.sawU);
      const out = u < 0.5;
      const p = out ? u * 2 : (1 - u) * 2;     // 0 -> 1 -> 0
      this.sawPos = [Math.sin(p * Math.PI) * (out ? 34 : -30), 12 + p * 6, 20 + p * 260];
      for (const tg of this.targets) {
        if (tg.alive && Math.hypot(tg.x - this.sawPos[0], tg.y - this.sawPos[1], tg.z - this.sawPos[2]) < 18) this.kill(tg, 2.2);
      }
    } else if (k === 'breach') {
      if (this.timer <= 0 && live.length) {
        this.timer = 2.4;
        const tg = live[0];
        this.muzzle(-1, m);
        const d = [tg.x - m[0], tg.y - m[1], tg.z - m[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        this.shots.push({ x: m[0], y: m[1], z: m[2], dx: d[0] / L, dy: d[1] / L, dz: d[2] / L, speed: 210, heavy: 1 });
      }
      this.stepShots(dt, (tg) => {
        this.kill(tg, 2.6);
        // The blast throws FORWARD: a cone of fragments through the impact.
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          this.frags.push({ x: tg.x, y: tg.y, z: tg.z,
            dx: Math.cos(a) * 0.32, dy: Math.sin(a) * 0.2, dz: 1, life: 0.6 });
        }
      });
      let fw = 0;
      for (const fr of this.frags) {
        fr.life -= dt;
        if (fr.life <= 0) continue;
        fr.x += fr.dx * 240 * dt; fr.y += fr.dy * 240 * dt; fr.z += fr.dz * 240 * dt;
        for (const tg of this.targets) {
          if (tg.alive && Math.hypot(tg.x - fr.x, tg.y - fr.y, tg.z - fr.z) < tg.r + 4) this.kill(tg, 2.6);
        }
        this.frags[fw++] = fr;
      }
      this.frags.length = fw;
    } else if (k === 'freeze') {
      const tg = this.targets.find((t) => t.alive && t.frozen < 1);
      this.beamAt = tg || null;
      if (tg) {
        tg.frozen = Math.min(1, tg.frozen + dt / 1.5);
        if (tg.frozen >= 1) tg.iced = this.t;
      } else if (this.targets.every((t) => !t.alive || t.frozen >= 1)) {
        this.timer -= 0;
        if (this.timer <= -1.4) { this.timer = 0; for (const t2 of this.targets) this.kill(t2, 1.6); }
      }
    } else if (k === 'rail') {
      this.lance = Math.max(0, this.lance - dt);
      if (this.timer <= 0) {
        this.timer = 2.2;
        this.lance = 0.4;
        for (const tg of this.targets) if (tg.alive) this.kill(tg, 1.7);
      }
    } else if (k === 'ghost') {
      if (this.timer <= 0) {
        this.timer = 1.9;
        this.muzzle(1, m);
        const tg = this.targets[2];
        const d = [tg.x - m[0], tg.y - m[1], tg.z - m[2]];
        const L = Math.hypot(d[0], d[1], d[2]) || 1;
        this.shots.push({ x: m[0], y: m[1], z: m[2], dx: d[0] / L, dy: d[1] / L, dz: d[2] / L, speed: 260, ghost: 1 });
      }
      this.stepShots(dt, (tg) => this.kill(tg, 1.6), [this.targets[2]]);
    }
  }

  /** Straight-flying shots against targets; `onHit` decides what a hit means. */
  stepShots(dt, onHit, only) {
    let w = 0;
    for (const sh of this.shots) {
      sh.x += sh.dx * sh.speed * dt; sh.y += sh.dy * sh.speed * dt; sh.z += sh.dz * sh.speed * dt;
      let dead = sh.z > 330;
      for (const tg of only || this.targets) {
        if (tg && tg.alive && Math.hypot(tg.x - sh.x, tg.y - sh.y, tg.z - sh.z) < tg.r + 3) {
          onHit(tg);
          dead = true;
          break;
        }
      }
      if (!dead) this.shots[w++] = sh;
    }
    this.shots.length = w;
  }

  drawScene(rd) {
    const k = this.key;
    const col = k === 'mg' ? [0.61, 0.91, 0.78] : SPECIAL_COLORS[k] || [0.8, 0.8, 0.8];
    // The floor: a scrolling grid, so the line is a line and not a void.
    const roll = (this.t * 90) % 30;
    for (let z = -20; z < 340; z += 30) {
      const zz = z - roll + 30;
      rd.line3(-52, 0, zz, 52, 0, zz, 1, 0.2, 0.5, 0.55, 0.35);
    }
    for (const x of [-52, 0, 52]) rd.line3(x, 0, -20, x, 0, 340, 1, 0.2, 0.5, 0.55, 0.3);

    drawShip(rd, this.ship, this.basis, 0.45 + 0.1 * Math.sin(this.t * 4), this.t, 0,
      k === 'mg' ? null : col);

    for (const tg of this.targets) {
      if (!tg.alive) continue;
      const fl = tg.flash;
      const cr = Math.min(1, 0.95 + fl), cg = Math.min(1, 0.5 + fl), cb = Math.min(1, 0.4 + fl);
      for (let i = 0; i < 8; i++) {
        const a0 = tg.spin + (i / 8) * Math.PI * 2, a1 = tg.spin + ((i + 1) / 8) * Math.PI * 2;
        rd.line3(tg.x + Math.cos(a0) * tg.r, tg.y + Math.sin(a0) * tg.r, tg.z,
          tg.x + Math.cos(a1) * tg.r, tg.y + Math.sin(a1) * tg.r, tg.z, 1.8, cr, cg, cb, 0.95);
      }
      rd.line3(tg.x - tg.r, tg.y, tg.z, tg.x + tg.r, tg.y, tg.z, 1, cr, cg, cb, 0.4);
      if (tg.frozen > 0) {
        // Ice takes it: a lattice closing over the shape as it winds down.
        const ir = tg.r + 4;
        for (let i = 0; i < 6; i++) {
          if (i / 6 > tg.frozen) break;
          const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
          rd.line3(tg.x + Math.cos(a0) * ir, tg.y + Math.sin(a0) * ir, tg.z - 2,
            tg.x + Math.cos(a1) * ir, tg.y + Math.sin(a1) * ir, tg.z - 2, 1.4, 0.75, 0.91, 1, 0.9);
        }
      }
    }
    for (const sp of this.sparks) {
      rd.dot3(sp.x, sp.y, sp.z, 2, Math.min(1, col[0] + 0.3), Math.min(1, col[1] + 0.3), col[2], sp.life);
    }

    const m = [0, 0, 0];
    if (k === 'mg') {
      for (const sh of this.shots) {
        rd.line3(sh.x, sh.y, sh.z, sh.x - sh.dx * 30, sh.y - sh.dy * 30, sh.z - sh.dz * 30, 2.2, 0.6, 1, 0.75, 1);
      }
    } else if (k === 'arc') {
      const live = this.targets.filter((t) => t.alive);
      let from = this.muzzle(1, m).slice();
      const seed = (this.t * 53) | 0;
      for (let i = 0; i < live.length && i < 3; i++) {
        const tg = live[i];
        const { pts, branches } = boltPath(from, [tg.x, tg.y, tg.z], seed + i * 7);
        const wdt = [2.4, 1.7, 1.1][i];
        const al = [1, 0.75, 0.55][i];
        for (let j = 0; j + 1 < pts.length; j++) {
          rd.line3(pts[j][0], pts[j][1], pts[j][2], pts[j + 1][0], pts[j + 1][1], pts[j + 1][2],
            wdt, col[0], col[1], col[2], al);
        }
        for (const [u2, v2] of branches) {
          rd.line3(u2[0], u2[1], u2[2], v2[0], v2[1], v2[2], wdt * 0.55, col[0], col[1], col[2], al * 0.7);
        }
        rd.dot3(tg.x, tg.y, tg.z, 4, 1, 1, 1, 0.8);
        from = [tg.x, tg.y, tg.z];
      }
    } else if (k === 'wave') {
      for (const wl of this.walls) {
        const h = Math.min(44, Math.max(4, (wl.z - 30) * 0.5));
        const fade = 1 - wl.z / 380;
        for (let x = -44; x <= 44; x += 8) {
          rd.line3(x, 0, wl.z, x, h, wl.z, 1.7, col[0], col[1], col[2], 0.8 * fade);
        }
        rd.line3(-44, h, wl.z, 44, h, wl.z, 2.4, 1, 1, 1, 0.9 * fade);
      }
    } else if (k === 'magma') {
      for (const sh of this.shots) rd.dot3(sh.x, sh.y, sh.z, 3.5, 1, 0.55, 0.2, 1);
      for (const c of this.clouds) {
        const al = Math.min(1, c.life);
        for (let ring = 0; ring < 2; ring++) {
          const rr = c.r - ring * 6;
          if (rr <= 2) continue;
          for (let i = 0; i < 8; i++) {
            const j0 = Math.sin(this.t * 7 + i * 3 + ring) * 2;
            const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
            rd.line3(c.x + Math.cos(a0) * (rr + j0), c.y + Math.sin(a0) * (rr + j0) * 0.7, c.z,
              c.x + Math.cos(a1) * rr, c.y + Math.sin(a1) * rr * 0.7, c.z, 1.5, 1, 0.45, 0.15, 0.6 * al);
          }
        }
        rd.dot3(c.x, c.y, c.z, 3, 1, 0.6, 0.2, 0.5 * al);
      }
    } else if (k === 'saw' && this.sawU >= 0) {
      const [sx, sy, sz] = this.sawPos;
      const spin = this.t * 14;
      for (let i = 0; i < 6; i++) {
        const a0 = spin + (i / 6) * Math.PI * 2, a1 = spin + ((i + 1) / 6) * Math.PI * 2;
        rd.line3(sx + Math.cos(a0) * 9, sy + Math.sin(a0) * 9, sz,
          sx + Math.cos(a1) * 13, sy + Math.sin(a1) * 13, sz, 2, col[0], col[1], col[2], 1);
      }
      rd.dot3(sx, sy, sz, 3, 1, 1, 1, 0.7);
    } else if (k === 'breach') {
      for (const sh of this.shots) {
        rd.dot3(sh.x, sh.y, sh.z, 4.5, col[0], col[1], col[2], 1);
        rd.line3(sh.x, sh.y, sh.z, sh.x - sh.dx * 22, sh.y - sh.dy * 22, sh.z - sh.dz * 22, 2.6, col[0], col[1], col[2], 0.7);
      }
      for (const fr of this.frags) {
        rd.line3(fr.x, fr.y, fr.z, fr.x - fr.dx * 10, fr.y - fr.dy * 10, fr.z - fr.dz * 10, 1.6, 1, 1, 1, fr.life * 1.4);
      }
    } else if (k === 'freeze' && this.beamAt) {
      const tg = this.beamAt;
      this.muzzle(-1, m);
      // A cone that narrows to the touch point, sparkling along its length.
      for (const off of [-3, 0, 3]) {
        rd.line3(m[0] + off, m[1] + Math.abs(off) * 0.4, m[2], tg.x, tg.y, tg.z, 1.6, col[0], col[1], col[2], 0.7);
      }
      for (let i = 0; i < 5; i++) {
        const u = ((this.t * 2 + i * 0.2) % 1);
        rd.dot3(m[0] + (tg.x - m[0]) * u, m[1] + (tg.y - m[1]) * u, m[2] + (tg.z - m[2]) * u, 2, 1, 1, 1, 0.8 - u * 0.4);
      }
    } else if (k === 'rail' && this.lance > 0) {
      this.muzzle(-1, m);
      const al = this.lance / 0.4;
      rd.line3(m[0], m[1], m[2], 6, 14, 290, 3.4 * al, col[0], col[1], col[2], al);
      rd.line3(m[0], m[1], m[2], 6, 14, 290, 1.2, 1, 1, 1, al);
      for (const tg of this.targets) rd.dot3(tg.x, tg.y, tg.z, 6 * al, 1, 1, 1, al);
    } else if (k === 'ghost') {
      // The bunker wall the round refuses to notice.
      const wz = 155;
      rd.line3(-26, 0, wz, -26, 34, wz, 2, 0.6, 0.65, 0.7, 0.9);
      rd.line3(26, 0, wz, 26, 34, wz, 2, 0.6, 0.65, 0.7, 0.9);
      rd.line3(-26, 34, wz, 26, 34, wz, 2, 0.6, 0.65, 0.7, 0.9);
      rd.line3(-26, 17, wz, 26, 17, wz, 1, 0.6, 0.65, 0.7, 0.4);
      for (const sh of this.shots) {
        const inside = sh.z > wz - 12 && sh.z < wz + 12;
        rd.line3(sh.x, sh.y, sh.z, sh.x - sh.dx * 24, sh.y - sh.dy * 24, sh.z - sh.dz * 24,
          2.2, col[0], col[1], col[2], inside ? 0.3 : 1);
        rd.dot3(sh.x, sh.y, sh.z, 3, 1, 1, 1, inside ? 0.35 : 0.9);
      }
    }
  }
}

/**
 * The fly-through inside the selected square: the level's own canyon, its own
 * colors, no obstacles and nothing shooting -- terrain and motion, which is
 * what a glance can actually read. Its own little renderer on its own little
 * canvas, mounted into whichever cell is chosen.
 */
class Preview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview';
    this.rd = new Renderer(this.canvas);
    this.frame = makeFrame();
    this.lookFrame = makeFrame();
    this.eye = [0, 0, 0];
    this.look = [0, 0, 0];
    this.track = null;
    this.last = 0;
  }

  setSpec(spec) {
    this.track = new Track(spec);
    this.terrain = new TerrainRenderer(this.track);
    this.t = 150;
    this.speed = spec.speed.start;
  }

  mount(cell) {
    cell.prepend(this.canvas);
    this.sized = false;
  }

  /**
   * One frame of a level, as an image: the postcard the idle square shows.
   * Rendered a third of the way in, where a level looks like itself, and read
   * back in the same task, before the browser can clear the buffer.
   */
  snapshot(spec) {
    const tr = new Track(spec);
    const terrain = new TerrainRenderer(tr);
    this.rd.resize(240, 240, 240_000);
    const t = tr.total * 0.33;
    const y = tr.railY(t) + 14;
    tr.frameAt(Math.max(1, t - 26), this.frame);
    tr.localToWorldF(this.frame, 0, y + 12, this.eye);
    tr.frameAt(Math.min(tr.total, t + 130), this.lookFrame);
    tr.localToWorldF(this.lookFrame, 0, tr.railY(t + 130) + 8, this.look);
    const f = [this.look[0] - this.eye[0], this.look[1] - this.eye[1], this.look[2] - this.eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const up = this.frame.u;
    const r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    this.rd.beginFrame(1);
    this.rd.setCamera(this.eye, r, u, f, 1.1, 2600);
    terrain.draw(this.rd, t, false, 0.5, 1);
    this.rd.endFrame();
    return this.canvas.toDataURL('image/png');
  }

  tick() {
    if (!this.track || !this.canvas.isConnected) return;
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - this.last) || 0.016;
    this.last = now;

    if (!this.sized) {
      const r = this.canvas.getBoundingClientRect();
      if (r.width < 4) return;
      this.rd.resize(r.width, r.height, 260_000);
      this.sized = true;
    }

    const tr = this.track;
    this.t += this.speed * dt;
    if (this.t > tr.total - 700) this.t = 150;

    const y = tr.railY(this.t) + 14;
    tr.frameAt(Math.max(1, this.t - 26), this.frame);
    tr.localToWorldF(this.frame, 0, y + 12, this.eye);
    tr.frameAt(Math.min(tr.total, this.t + 130), this.lookFrame);
    tr.localToWorldF(this.lookFrame, 0, tr.railY(this.t + 130) + 8, this.look);

    const f = [this.look[0] - this.eye[0], this.look[1] - this.eye[1], this.look[2] - this.eye[2]];
    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
    f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const up = this.frame.u;
    const r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r[0] /= rl; r[1] /= rl; r[2] /= rl;
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];

    this.rd.beginFrame(0.7);
    this.rd.setCamera(this.eye, r, u, f, 1.1, 2600);
    this.terrain.draw(this.rd, this.t, false, now, 1);
    this.rd.endFrame();
  }
}

const BURN_PIPS = 5;   // chevrons on the boost gauge
const SPEC_PIPS = 8;   // diamonds on the special gauge

export class UI {
  constructor(rd, input, audio, game) {
    this.rd = rd;
    this.input = input;
    this.audio = audio;
    this.game = game;
    this.screen = 'boot';
    this.campaign = new Campaign();
    this.spec = null;
    this.busy = false;
    this.dirty = true;
    this.controlHint = '';
    this.bindAll();
    this.loadFromHash();
  }

  // --- screens -----------------------------------------------------------

  show(name) {
    this.screen = name;
    this.dirty = true;
    for (const id of ['boot', 'design', 'flight']) {
      $(id).classList.toggle('on', id === name);
    }
    // Only the flight screen wants the canvas swallowing gestures.
    this.rd.canvas.style.pointerEvents = name === 'flight' ? 'auto' : 'none';
  }

  status(msg) {
    $('statusline').textContent = this.controlHint ? `${msg}  --  ${this.controlHint}` : msg;
  }

  report(lines, cls = '') {
    const el = $('report');
    el.className = cls;
    el.textContent = Array.isArray(lines) ? lines.join('\n') : String(lines);
  }

  // --- wiring ------------------------------------------------------------

  bindAll() {
    this.buttons = [];
    this.buildGrid();
    this.buildTraining();
    this.refreshCampaign();

    $('fly').addEventListener('click', () => this.fly());
    // Straight to the selected level's warden, level untouched -- the tuning
    // door, and the rematch door.
    $('boss').addEventListener('click', () => {
      if (!this.spec || !this.spec.boss) return;
      this.audio.start();
      // The fullscreen ask can dawdle; the fight should not wait on it.
      this.enterFullscreen().catch(() => {});
      if (this.input.motion === 'granted') this.input.recalibrate();
      this.game.special = this.campaign.equipped;
      this.game.startAtBoss();
      this.show('flight');
    });
    $('designbtn').addEventListener('click', () => this.design());

    for (const ev of ['gamepadconnected', 'gamepaddisconnected']) {
      window.addEventListener(ev, () => setTimeout(() => this.padState(), 60));
    }

    $('begin').addEventListener('click', () => this.begin());
    $('pause').addEventListener('click', () => this.toMenu());

    // The launcher. pointerdown rather than click so it fires on touch-down
    // like every other control in flight, and so holding it does not repeat.
    $('msl').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.input.launchMissiles();
    });
    // Held, not tapped: the burn runs for as long as this is down and there is
    // anything left in the tank. It is a button of its own so that touch-and-
    // hold anywhere else is still nothing but the gun. There is no roll button
    // any more -- double tap and hold does that, on the side you ask for, which
    // a single button in a fixed corner could never do.
    const hold = (id, set) => {
      const el = $(id);
      const go = (on) => (e) => {
        e.preventDefault();
        set(on);
        if (on) el.setPointerCapture?.(e.pointerId);
      };
      el.addEventListener('pointerdown', go(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        el.addEventListener(ev, go(false));
      }
    };
    hold('burn', (on) => { this.input.boostHeld = on; });
    // The special is held exactly like the burn: down is firing, up is saved.
    hold('spec', (on) => { this.input.specialBtn(on); });
    // The roll buttons: hold one and the ship goes over on that side; a quick
    // second press within the window is the barrel roll, that way. The press
    // starts the knife immediately either way -- both moves begin identically,
    // so nothing is lost by not waiting to find out which one it is.
    // The double-tap window runs from the first tap's RELEASE to the second
    // tap's press -- the same lesson the screen gesture learned the hard way:
    // measure down-to-down and the window silently spends itself on however
    // long the thumb rested, which works in a test and not under a hand.
    // Arming is forgiving on purpose. A real first tap under fire runs long
    // -- 250, 400ms -- and a knife-edge hold runs SECONDS, so anything under
    // 600ms is a tap. And every way a press can end must record the release:
    // the left pad lives in the corner where the OS converts touches to
    // pointercancel, and a first tap whose release goes unrecorded is why a
    // double-tap starts needing three.
    const rollTaps = { '-1': { downAt: 0, upAt: 0, down: false }, '1': { downAt: 0, upAt: 0, down: false } };
    const rollBtn = (id, dir) => {
      const el = $(id);
      const tap = rollTaps[dir];
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const now = performance.now();
        if (tap.upAt && now - tap.upAt < 480) {
          this.input.requestBarrel(dir);
          tap.upAt = 0;
        }
        tap.down = true;
        tap.downAt = now;
        this.input.rollBtn(dir, true);
        try { el.setPointerCapture?.(e.pointerId); } catch { /* fine without */ }
      });
      const release = (e) => {
        e.preventDefault?.();
        if (!tap.down) return;   // a hover-leave is not a release
        tap.down = false;
        const now = performance.now();
        tap.upAt = now - tap.downAt < 600 ? now : 0;
        this.input.rollBtn(dir, false);
      };
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) {
        el.addEventListener(ev, release);
      }
    };
    rollBtn('lr', -1);
    rollBtn('rr', 1);
    $('rollmode').addEventListener('change', (e) => {
      this.input.rollMode = e.target.checked ? 'buttons' : 'gestures';
      $('rollrow').hidden = !e.target.checked;
    });

    $('calibrate').addEventListener('click', async () => {
      if (this.input.motion !== 'granted') await this.input.requestMotion();
      const ok = this.input.calibrate();
      this.motionState(ok ? 'calibrated -- hold the phone as you just did' : null);
    });
    $('sens').addEventListener('input', (e) => {
      this.input.sensitivity = +e.target.value;
      $('sensval').textContent = (+e.target.value).toFixed(1);
    });
    $('paintlock').addEventListener('change', (e) => { this.game.paintToLock = e.target.checked; });
    $('invx').addEventListener('change', (e) => { this.input.invertX = e.target.checked; });
    $('invy').addEventListener('change', (e) => { this.input.invertY = e.target.checked; });
    $('mute').addEventListener('change', (e) => this.audio.setMuted(e.target.checked));
    $('music').addEventListener('change', (e) => this.audio.setMusicEnabled(e.target.checked));
    $('crt').addEventListener('change', (e) => {
      this.rd.scanline = e.target.checked ? 0.08 : 0;
      this.rd.trail = e.target.checked ? 0.34 : 0.9;
    });

    // A tap anywhere on the canvas after a run returns to the menu.
    this.rd.canvas.addEventListener('pointerdown', () => {
      if (this.screen === 'flight' && this.game.phase !== 'flying') {
        const wait = this.game.phase === 'dead' ? this.game.deathTimer : this.game.winTimer;
        if (wait > 1.4) this.toMenu();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.screen === 'flight') this.toMenu();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && this.screen === 'design') this.fly();
    });
  }

  padState() {
    const name = this.input.padName;
    $('padstate').textContent = name
      ? `gamepad: ${name} -- left stick flies, triggers fire, shoulders launch`
      : 'gamepad: none';
  }

  motionState(msg) {
    const m = this.input.motion;
    const text = msg || {
      granted: 'motion: active',
      denied: 'motion: denied -- use two-finger steering',
      unavailable: 'motion: no sensor -- use two-finger steering',
    }[m] || 'motion: unknown';
    $('motionstate').textContent = text;
  }

  /**
   * The launcher button doubles as the cooldown clock, so it is refreshed from
   * the game each frame -- but only written when the text or state actually
   * changed, because a DOM write per frame for a label that changes once a
   * second is a frame cost for nothing.
   */
  syncBurnButton() {
    const g = this.game;
    // The button is the gauge, and the gauge is chevrons: five of them, lit from
    // the left as the tank fills. A word would have to be read; a row of arrows
    // is a fuel bar you take in without looking away from the canyon.
    const lit = Math.round(Math.max(0, Math.min(1, g.boost / 2.4)) * BURN_PIPS);
    if (lit !== this._burnPips) {
      $('burn').innerHTML = Array.from({ length: BURN_PIPS }, (_, i) =>
        `<b class="${i < lit ? 'lit' : ''}">\u276f</b>`).join('');
      this._burnPips = lit;
    }
    const cls = g.burning ? 'on' : lit === 0 ? 'cooling' : '';
    if (cls !== this._burnCls) { $('burn').className = cls; this._burnCls = cls; }
  }

  /**
   * The special's button is its gauge: a row of diamonds in the weapon's
   * color, whole ones lit, and the partial one the trickle is still earning
   * left dark. Lit solid while the weapon is live.
   */
  syncSpecButton() {
    const g = this.game;
    // The cinematics and the result screens own the stage: no thumb controls
    // floating over an escape, a lightspeed run, or the weapon reveal.
    const ended = ['escape', 'lightspeed', 'won', 'dead', 'ended'].includes(g.phase);
    if (ended !== this._padsHidden) {
      this._padsHidden = ended;
      $('pad').style.display = ended ? 'none' : '';
      $('padleft').style.display = ended ? 'none' : '';
    }
    const has = !!g.special;
    if (has !== this._specHas) {
      $('spec').style.display = has ? '' : 'none';
      this._specHas = has;
    }
    if (!has) return;
    const whole = Math.floor(Math.max(0, g.diamonds ?? 0) + 1e-6);
    if (whole !== this._specPips) {
      $('spec').innerHTML = Array.from({ length: SPEC_PIPS }, (_, i) =>
        `<b class="${i < whole ? 'lit' : ''}">◆</b>`).join('');
      this._specPips = whole;
    }
    const cls = g.specialOn ? 'on' : whole === 0 ? 'cooling' : '';
    if (cls !== this._specCls) { $('spec').className = cls; this._specCls = cls; }
  }

  syncMissileButton() {
    const g = this.game;
    // Any phase, so long as we are in the cockpit: the cooldown ticks through
    // ascents and endings alike, and a frozen "4.1s" over a launcher that is
    // actually ready is worse than no label at all.
    if (this.screen !== 'flight') return;
    const ready = g.missileCooldown <= 0;
    const locks = g.locks ? g.locks.length : 0;
    const text = ready
      ? (locks ? `MISSILES ${locks}` : 'MISSILES')
      : `${g.missileCooldown.toFixed(1)}s`;
    const cls = ready ? (locks ? 'armed' : '') : 'cooling';
    if (text !== this._mslText) { $('msl').textContent = text; this._mslText = text; }
    if (cls !== this._mslCls) { $('msl').className = cls; this._mslCls = cls; }
  }

  /** First real gesture: unlock audio and ask for the motion sensor. */
  async begin() {
    this.audio.start();
    // The title theme, from the first screen that follows a tap -- the tap is
    // what the browser's autoplay rules were waiting for. ANTHEM is the
    // campaign's opening music; a run swaps to its own song, and the menu
    // takes this back up on return.
    this.audio.musicStart('anthem');
    $('bootnote').textContent = 'requesting motion access...';
    await this.input.requestMotion();
    this.motionState();
    // Embedded frames and desktops often have no usable tilt sensor. Say so
    // where the player will actually read it, not only inside a details pane.
    if (this.input.motion !== 'granted') {
      this.controlHint = 'no tilt: drag one finger to steer, touch with a second to fire';
    }
    this.show('design');
    this.buildThumbs();
    this.loadCustom();
    if (!this.spec) {
      // Open on a finished level, so the next tap can be FLY.
      this.buttons[0].click();
    } else {
      this.status(`${this.spec.name} -- ready`);
    }
    this._entered = true;
  }

  /**
   * Fullscreen, and stay the way up the player is already holding the phone.
   *
   * Locking is deliberately whichever orientation they are in when they ask,
   * rather than one the game prefers: it reads fine both ways, and the one
   * thing that does not read fine is the layout turning over mid-flight.
   */
  /**
   * Full screen, attempted every way the platform might spell it, and then
   * VERIFIED against what the document says -- iPhones in particular will
   * take the call, reject the promise, and leave you exactly where you were,
   * and a handler that swallows that has a button that "does nothing".
   * When nothing works, the honest answer is the home screen: the page is a
   * proper web app now, so opened from an icon it runs without any chrome.
   */
  async enterFullscreen() {
    if (navigator.standalone
      || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) {
      return 'standalone';
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) return 'in';
    const el = document.getElementById('stage');
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) {
      try { await req.call(el, { navigationUI: 'hide' }); } catch {
        // Some engines choke on the options dictionary; ask again plainly.
        try { await req.call(el); } catch { /* verified below */ }
      }
      await new Promise((r) => setTimeout(r, 150));
      if (document.fullscreenElement || document.webkitFullscreenElement) return 'in';
    }
    return 'no';
  }


  loadFromHash() {
    const m = location.hash.match(/lvl=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try {
      this.setSpec(decodeSpec(m[1]), ['loaded from link']);
      $('prose').value = '';
    } catch {
      /* a broken link is not worth an error message on the title screen */
    }
  }

  setSpec(spec, report) {
    this.spec = normalizeSpec(spec);
    this.game.load(this.spec);
    $('fly').disabled = false;
    $('boss').disabled = !this.spec.boss;
    const lv = this.game.level;
    const counts = [
      `${lv.obstacles.length} obstacles`,
      `${lv.enemies.filter((e) => e.kind === 'turret').length} surface turrets`,
      `${lv.enemies.filter((e) => e.kind === 'wallgun').length} wall guns`,
      `${lv.enemies.filter((e) => e.kind === 'emplacement').length} emplacements`,
      `${lv.drones.reduce((a, d) => a + d.n, 0)} drones`,
      `${lv.seals.length} seals`,
    ].join(', ');
    this.report([...report, '', `REALIZED: ${counts}`], 'ok');
    // Selecting a level auditions its song, right there on the menu -- the
    // music is part of what you are choosing. Gated behind the first entry so
    // the boot's automatic selection does not talk over the title theme.
    if (this._entered) this.audio.musicStart(this.spec.music);
    this.dirty = true;
    this.status(`${this.spec.name} -- ${Math.round(this.game.track.total)} units`);
  }

  /**
   * The 3x3: eight districts around the edge, the Citadel sealed in the
   * center. A cell with a level selects it like any shelf button; a cell
   * without one is the map being honest about what is still coming.
   */
  buildGrid() {
    const grid = $('grid');
    this.cells = {};
    for (const d of DISTRICTS) {
      const b = document.createElement('button');
      b.className = 'cell' + (d.center ? ' center' : '');
      const lv = d.level ? PREBUILT.find((l) => l.spec.name === d.level) : null;
      if (d.center) {
        b.innerHTML = `<canvas class="qmarks"></canvas>
          <span class="dsub" id="citadelsub" style="position:absolute;left:0;right:0;bottom:7px;text-align:center;z-index:2"></span>`;
        b.addEventListener('click', () => {
          this.status(this.campaign.wardensDown()
            ? 'the citadel is not built yet -- soon'
            : `sealed -- ${this.campaign.clearedCount()} of ${DISTRICTS.filter((x) => x.level && !x.center).length} wardens down`);
        });
      } else if (lv) {
        // A sub-label that only repeats the district's name says nothing:
        // NEON over NEON DISTRICT is one name, not two.
        const echo = lv.label.includes(d.name) || d.name.includes(lv.label);
        b.innerHTML = `<img class="thumb" alt="" hidden>
          <span class="veil"></span>
          <span class="dname">${d.name}</span>
          ${echo ? '' : `<span class="dsub">${lv.label}</span>`}`;
        b.addEventListener('click', () => {
          for (const o of this.buttons) o.classList.toggle('on', o === b);
          this.setSpec(lv.spec, [d.name, lv.blurb].filter(Boolean));
          this.showPreview(b);
        });
        this.buttons.push(b);
      } else {
        b.classList.add('locked');
        b.innerHTML = `<span class="dname">${d.name}</span>
          <span class="dsub">offline</span>`;
        b.addEventListener('click', () => this.status(`${d.name.toLowerCase()} is not built yet`));
      }
      this.cells[d.id] = { el: b, district: d };
      grid.appendChild(b);
    }
    this.refreshCampaign();
  }

  /**
   * TRAIN: one small button that steps through the training levels --
   * PROVING GROUND first, SHAKEDOWN after -- selecting each for FLY. The
   * grid stays the campaign's; training does not need a square of its own.
   */
  buildTraining() {
    const inGrid = new Set(DISTRICTS.map((d) => d.level).filter(Boolean));
    this.trainLevels = PREBUILT.filter((lv) => !inGrid.has(lv.spec.name));
    this.trainIdx = -1;
    $('train').addEventListener('click', () => {
      if (!this.trainLevels.length) return;
      this.trainIdx = (this.trainIdx + 1) % this.trainLevels.length;
      const lv = this.trainLevels[this.trainIdx];
      for (const o of this.buttons) o.classList.remove('on');
      this.setSpec(lv.spec, [lv.label, lv.blurb].filter(Boolean));
      this.status(`${lv.label} -- training. FLY when ready`);
    });

    // The loadout button: the machine gun, until a warden hands over better.
    // With one or more specials earned it steps through them, gun included.
    $('wbtn').addEventListener('click', () => {
      // Only weapons that exist as shots can be fitted. An earned one whose
      // shot is not built yet waits in the cycle's future, not in its present.
      const cycle = [null, ...this.campaign.weapons.filter((w) => WEAPONS[w].built)];
      const at = cycle.indexOf(this.campaign.equipped);
      this.campaign.equip(cycle[(at + 1) % cycle.length]);
      this.refreshCampaign();
    });

    // Everything that is not selecting-and-flying lives behind SETUP.
    $('setup').addEventListener('click', () => {
      const x = $('extras');
      x.hidden = !x.hidden;
      $('jukebox').hidden = true;
      $('armory').hidden = true;
      $('setup').textContent = x.hidden ? 'SETUP' : 'CLOSE';
    });
    this.buildJukebox();
    this.buildArmory();
  }

  /**
   * Every level square gets its still: one hidden renderer walks the levels,
   * takes a frame of each, and bakes it into the cell as an image. Spread a
   * beat apart so the menu never hitches while they develop.
   */
  async buildThumbs() {
    if (this._thumbed) return;
    this._thumbed = true;
    let shooter;
    try { shooter = new Preview(); } catch { return; }
    for (const { el, district } of Object.values(this.cells)) {
      const lv = district.level && PREBUILT.find((l) => l.spec.name === district.level);
      const img = el.querySelector('img.thumb');
      if (!lv || !img) continue;
      await new Promise((r) => setTimeout(r, 40));
      try {
        img.src = shooter.snapshot(normalizeSpec(lv.spec));
        img.hidden = false;
      } catch { /* a square without its postcard still works */ }
    }
  }


  /**
   * The armory: every weapon on the wheel, what it does, how it works, whose
   * hands it is in -- and the range, where the selected one demonstrably
   * fires. The two built shots fire as they fire in flight; the rest fire as
   * designed, and their status line says so plainly.
   */
  buildArmory() {
    $('armopen').addEventListener('click', () => {
      $('extras').hidden = true;
      $('setup').textContent = 'SETUP';
      $('jukebox').hidden = true;
      $('armory').hidden = false;
      this.syncArmory(this._armKey || this.campaign.equipped || 'mg');
    });
    $('armclose').addEventListener('click', () => { $('armory').hidden = true; });
    const entries = [['mg', MACHINE_GUN], ...Object.entries(WEAPONS)];
    for (const [key, w] of entries) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.w = key;
      b.textContent = w.name;
      b.style.color = w.css;
      b.style.borderColor = w.css;
      b.addEventListener('click', () => this.syncArmory(key));
      $('armweapons').appendChild(b);
    }
  }

  syncArmory(key) {
    this._armKey = key;
    for (const b of $('armweapons').children) b.classList.toggle('on', b.dataset.w === key);
    const w = key === 'mg' ? MACHINE_GUN : WEAPONS[key];
    const c = this.campaign;
    const status = key === 'mg' ? 'STANDARD FIT -- ALWAYS LOADED'
      : c.equipped === key ? 'FITTED'
      : c.weapons.includes(key)
        ? (w.built ? 'TAKEN -- READY TO FIT' : `TAKEN FROM ${w.from} -- THE SHOT IS STILL IN THE FORGE`)
        : `HELD BY ${w.from}, ${w.district} -- BEAT IT TO TAKE IT`;
    const div = $('armdetail');
    div.innerHTML = '';
    const line = (cls, text, color) => {
      const el = document.createElement('div');
      el.className = cls;
      el.textContent = text;
      if (color) el.style.color = color;
      div.appendChild(el);
    };
    line('armname', w.name, w.css);
    line('armstatus', status);
    line('armline', w.does);
    line('armline', w.how);
    if (w.melts) line('armmelts', `ON THE WHEEL: ${w.melts} CANNOT STAND IT`);
    if (this.range) this.range.show(key);
    else this._rangeKey = key;
  }

  /**
   * The jukebox, in the game: the score book with its hands on the live
   * mixer. Every song a button, every voice a slider writing straight into
   * the Music that is already playing.
   */
  buildJukebox() {
    $('jukeopen').addEventListener('click', () => {
      $('extras').hidden = true;
      $('setup').textContent = 'SETUP';
      $('armory').hidden = true;
      $('jukebox').hidden = false;
      this.syncJukebox();
    });
    $('jukeclose').addEventListener('click', () => { $('jukebox').hidden = true; });
    for (const [key, song] of Object.entries(SONGS)) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.song = key;
      b.textContent = song.name;
      b.addEventListener('click', () => {
        this.audio.musicStart(key);
        this.syncJukebox();
      });
      $('jukesongs').appendChild(b);
    }
    for (const [key, label] of [['lead', 'LEAD'], ['under', '2ND'], ['arp', 'ARP'], ['bass', 'BASS'], ['sub', 'TRI']]) {
      const row = document.createElement('label');
      row.innerHTML = `<span style="min-width:3em">${label}</span>
        <input type="range" data-mix="${key}" min="0" max="0.5" step="0.005">
        <span class="val" data-val="${key}"></span>`;
      row.querySelector('input').addEventListener('input', (e) => {
        const m = this.audio.music;
        if (!m) return;
        m.mix[key] = +e.target.value;
        row.querySelector('.val').textContent = (+e.target.value).toFixed(3);
      });
      $('jukemix').appendChild(row);
    }
  }

  syncJukebox() {
    const m = this.audio.music;
    if (!m) return;
    for (const b of $('jukesongs').children) {
      b.classList.toggle('on', b.dataset.song === m.songName);
    }
    for (const inp of $('jukemix').querySelectorAll('input')) {
      inp.value = m.mix[inp.dataset.mix];
      inp.parentElement.querySelector('.val').textContent = (+inp.value).toFixed(3);
    }
  }

  /** The chosen square starts flying its level. One preview, moved around. */
  showPreview(cell) {
    try {
      if (!this.preview) this.preview = new Preview();
    } catch {
      return;   // no second WebGL context: the menu works fine without it
    }
    this.preview.setSpec(this.spec);
    this.preview.mount(cell);
  }

  /** Cleared badges, the Citadel's count, and the rack -- all from truth.
   *  The rack holds only what has been TAKEN: an unearned weapon is not a
   *  greyed-out spoiler, it is nothing at all until its warden falls. */
  refreshCampaign() {
    const c = this.campaign;
    for (const { el, district } of Object.values(this.cells || {})) {
      if (district.level) el.classList.toggle('cleared', c.isCleared(district.level));
    }
    const sub = $('citadelsub');
    if (sub) {
      const total = DISTRICTS.filter((d) => d.level && !d.center).length;
      sub.textContent = c.wardensDown() ? 'UNSEALED' : `SEALED ${c.clearedCount()}/${total}`;
    }
    // One loadout button. MACHINE GUN and disabled until anything better
    // exists; from the first earned weapon on, it cycles.
    const w = $('wbtn');
    w.disabled = c.weapons.length === 0;
    const eq = c.equipped && WEAPONS[c.equipped];
    w.textContent = eq ? eq.name : 'MACHINE GUN';
    w.style.borderColor = eq ? eq.css : '';
    w.style.color = eq ? eq.css : '';
  }

  /** One button on the shelf. The chosen one stays lit, so the shelf is the state. */
  addLevel(lv, into) {
    $('customfold').hidden = false;
    const b = document.createElement('button');
    b.className = 'chip built';
    b.textContent = lv.label;
    if (lv.blurb) b.title = lv.blurb;
    b.addEventListener('click', () => {
      for (const o of this.buttons) o.classList.toggle('on', o === b);
      this.setSpec(lv.spec, [lv.label, lv.blurb].filter(Boolean));
    });
    if (this.campaign.isCleared(lv.spec.name)) b.classList.add('cleared');
    into.appendChild(b);
    this.buttons.push(b);
    return b;
  }

  /**
   * Levels designed on this machine, if there is a machine to ask.
   *
   * The published page has no server behind it, so this 404s there and the
   * shelf is simply the pre-built levels -- which is the intended shape of the
   * thing, not a degraded one.
   */
  async loadCustom(selectNewest = false) {
    let levels = [];
    try {
      const r = await fetch('/api/levels');
      if (!r.ok) throw new Error('no server');
      ({ levels } = await r.json());
      this.local = true;
    } catch {
      this.local = false;
      // Hide it rather than grey it out: on the published page there is no
      // server to design with, so the whole panel is noise.
      $('designpanel').hidden = true;
      return;
    }
    const row = $('custom');
    row.textContent = '';
    this.buttons = this.buttons.filter((b) => b.parentElement !== row);
    $('customrow').hidden = levels.length === 0;
    let first = null;
    for (const lv of levels) first = this.addLevel(lv, row) || first;
    if (selectNewest && row.firstChild) row.firstChild.click();
  }

  /**
   * Hand the description to the agent and wait. It reads the authoring guide,
   * writes the level, and runs the same flyability gate the shipped levels
   * pass, fixing what it got wrong -- so this takes a minute or two and what
   * comes back is a level, not a draft.
   */
  async design() {
    if (this.busy) return;
    const prose = $('prose').value.trim();
    if (prose.length < 8) {
      this.report('describe the level you want first -- a sentence or two is plenty', 'warn');
      return;
    }
    this.busy = true;
    $('designbtn').disabled = true;
    const started = Date.now();
    const tick = setInterval(() => {
      this.status(`claude is designing it -- ${Math.round((Date.now() - started) / 1000)}s`);
    }, 1000);
    this.report('reading the authoring guide, writing the level, then checking it is flyable.\n'
      + 'this takes a minute or two.', '');
    try {
      const r = await fetch('/api/design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prose }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        this.report([data.error || 'the design failed', ...(data.problems || [])], 'warn');
        this.status('design failed');
        return;
      }
      await this.loadCustom(true);
      this.report([data.said || '', '',
        `${data.check.name}: ${data.check.seconds}s, ${data.check.sections} sections, `
        + `${data.check.obstacles} obstacles, ${data.check.bulkheads} bulkheads, `
        + `${data.check.guns} guns. saved to ${data.file}.`].filter(Boolean), 'ok');
    } catch (err) {
      this.report(`could not reach the design server: ${err.message}`, 'warn');
    } finally {
      clearInterval(tick);
      this.busy = false;
      $('designbtn').disabled = !this.local;
    }
  }

  async fly() {
    if (!this.spec) return;
    this.audio.start();
    // Fullscreen is worth asking for and harmless when refused. Orientation is
    // not asked for at all: the game reads either way up, and pinning it fought
    // whichever way the player was already holding the phone.
    try { await this.enterFullscreen(); } catch { /* the game plays fine regardless */ }
    if (this.input.motion === 'granted') this.input.recalibrate();
    this.game.special = this.campaign.equipped;
    this.game.reset();
    this.audio.musicStart(this.spec.music);
    this.show('flight');
  }

  toMenu() {
    this.audio.musicStart('anthem');
    if (this.game.phase === 'won' && this.spec) {
      const got = this.campaign.markCleared(this.spec);
      this.refreshCampaign();
      this.show('design');
      this.status(got.weapon
        ? `warden down -- ${WEAPONS[got.weapon].name} is yours`
        : `${this.spec.name} -- cleared`);
      return;
    }
    this.show('design');
    this.status(`${this.spec.name} -- ready`);
  }

  /**
   * Drawn on the canvas behind the design panel. The schematic is static, so it
   * is only re-rendered when something actually changed; the boot grid animates
   * and always draws.
   */
  drawBackdrop() {
    const rd = this.rd;
    if (this.screen === 'design') {
      if (this.preview) this.preview.tick();
      if (!this.shipView) {
        try { this.shipView = new ShipView($('shipview')); } catch { this.shipView = false; }
      }
      if (this.shipView) this.shipView.tick();
      if (!this.qmarks) {
        const qc = document.querySelector('.qmarks');
        if (qc) this.qmarks = new QMarks(qc);
      }
      if (this.qmarks) this.qmarks.tick();
      if (!$('armory').hidden) {
        if (this.range === undefined) {
          try { this.range = new Range($('armrange')); } catch { this.range = false; }
          if (this.range && this._rangeKey) this.range.show(this._rangeKey);
        }
        if (this.range) this.range.tick();
      }
    }
    this.dirty = false;
    rd.beginFrame(1);
    // Both idle screens get the slow grid; the level itself is previewed
    // inside the selected square, where a glance can actually read it.
    if (this.screen === 'design' || this.screen === 'boot') {
      this.drawBootGrid();
    }
    rd.endFrame();
  }

  /** A slow perspective grid under the title, so the boot screen is not dead. */
  drawBootGrid() {
    const rd = this.rd;
    const W = rd.width, H = rd.height, s = rd.scale;
    const t = performance.now() / 1000;
    // The horizon is placed under the boot copy rather than at a fixed fraction
    // of the height. That copy is DOM: how tall it is depends on font size and
    // where it wraps, and on a narrow screen it reaches well past 0.62 -- which
    // is what put grid lines through the text and the caption through the
    // button. Measure it, the same way the schematic measures the sheet.
    const r = rd.canvas.getBoundingClientRect();
    const k = H / Math.max(1, r.height);
    const note = document.getElementById('bootnote').getBoundingClientRect();
    const horizon = Math.min(H * 0.8,
      Math.max(H * 0.62, (note.bottom - r.top) * k + 30 * s));
    for (let i = 0; i < 22; i++) {
      const k = ((i / 22) + (t * 0.06 % (1 / 22))) % 1;
      const y = horizon + (H - horizon) * k * k;
      const a = (1 - k) * 0.35;
      rd.line2(0, y, W, y, 1 * s, 0.3, 0.7, 0.85, a, a);
    }
    for (let i = -9; i <= 9; i++) {
      const x = W * 0.5 + i * W * 0.075;
      rd.line2(W * 0.5 + i * 8 * s, horizon, x * 1.6 - W * 0.3, H, 1 * s,
        0.3, 0.7, 0.85, 0.05, 0.3);
    }
  }
}
