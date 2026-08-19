// HUD and the level schematic. Both are drawn with the same line primitives as
// the world, so nothing on screen breaks the vector illusion.

import { drawText, textWidth } from './font.js';
import { clamp, lerp, TAU } from './math.js';

const AMBER = [1, 0.72, 0.2];
const CYAN = [0.45, 0.95, 1];
const RED = [1, 0.3, 0.25];
const DIM = [0.35, 0.6, 0.7];

function bracket(rd, x, y, w, h, s, col, a, lw) {
  const L = Math.min(w, h) * 0.32;
  const pts = [
    [x, y + L, x, y, x + L, y],
    [x + w - L, y, x + w, y, x + w, y + L],
    [x + w, y + h - L, x + w, y + h, x + w - L, y + h],
    [x + L, y + h, x, y + h, x, y + h - L],
  ];
  for (const p of pts) {
    rd.line2(p[0], p[1], p[2], p[3], lw, col[0], col[1], col[2], a, a);
    rd.line2(p[2], p[3], p[4], p[5], lw, col[0], col[1], col[2], a, a);
  }
}

function bar(rd, x, y, w, h, frac, segs, col, s) {
  const gap = 2 * s;
  const sw = (w - gap * (segs - 1)) / segs;
  for (let i = 0; i < segs; i++) {
    const on = (i + 1) / segs <= frac + 1e-6;
    const partial = !on && i / segs < frac;
    const a = on ? 1 : partial ? 0.55 : 0.14;
    const bx = x + i * (sw + gap);
    // A filled segment is drawn as one thick stroke: cheaper than a rectangle
    // and reads brighter, which is what a bar chart on a vector display wants.
    rd.line2(bx + sw * 0.5, y + h * 0.5, bx + sw * 0.5, y + h * 0.5,
      Math.max(sw, h) * 0.5, col[0], col[1], col[2], a, a);
  }
}

/** Crosshair at the aim point, with a lock ring when a lock is building. */
export function drawReticle(rd, x, y, s, lockProgress, locked, hasTarget) {
  const col = locked ? RED : hasTarget ? AMBER : CYAN;
  const R = 15 * s;
  const g = 5 * s;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    rd.line2(x + dx * g, y + dy * g, x + dx * R, y + dy * R,
      1.5 * s, col[0], col[1], col[2], 0.95, 0.35);
  }
  rd.line2(x, y, x, y, 1.6 * s, col[0], col[1], col[2], 1, 1);

  if (lockProgress > 0) {
    const R2 = 26 * s;
    const n = 28;
    const upto = Math.floor(n * clamp(lockProgress, 0, 1));
    for (let i = 0; i < upto; i++) {
      const a0 = (i / n) * TAU - Math.PI / 2;
      const a1 = ((i + 0.75) / n) * TAU - Math.PI / 2;
      rd.line2(x + Math.cos(a0) * R2, y + Math.sin(a0) * R2,
        x + Math.cos(a1) * R2, y + Math.sin(a1) * R2,
        2 * s, 1, 0.5, 0.2, 1, 1);
    }
  }
  if (locked) bracket(rd, x - 34 * s, y - 34 * s, 68 * s, 68 * s, s, RED, 1, 2 * s);
}

/** Brackets that close in on a lockable target as the lock builds. */
export function drawTargetBox(rd, sx, sy, s, progress, locked) {
  const size = lerp(70, 30, clamp(progress, 0, 1)) * s;
  const col = locked ? RED : AMBER;
  bracket(rd, sx - size * 0.5, sy - size * 0.5, size, size, s, col, locked ? 1 : 0.85, 1.6 * s);
}

export function drawHud(rd, st) {
  const W = rd.width;
  const H = rd.height;
  const s = rd.scale;
  const pad = 22 * s;

  // --- shield ---
  drawText(rd, 'SHIELD', pad, pad + 9 * s, 9 * s, 1.1 * s, DIM[0], DIM[1], DIM[2], 0.9);
  const shieldFrac = clamp(st.shield / st.shieldMax, 0, 1);
  const scol = shieldFrac > 0.55 ? CYAN : shieldFrac > 0.25 ? AMBER : RED;
  bar(rd, pad, pad + 16 * s, 150 * s, 9 * s, shieldFrac, 10, scol, s);

  // --- speed ---
  drawText(rd, `${Math.round(st.speed)} U/S`, pad, H - pad, 11 * s, 1.2 * s,
    AMBER[0], AMBER[1], AMBER[2], 0.95);

  // --- score / name ---
  drawText(rd, String(st.score).padStart(6, '0'), W - pad, pad + 12 * s, 14 * s, 1.4 * s,
    AMBER[0], AMBER[1], AMBER[2], 1, 1);
  drawText(rd, st.levelName, W - pad, pad + 28 * s, 8 * s, 1 * s, DIM[0], DIM[1], DIM[2], 0.8, 1);
  if (st.missiles > 0) {
    drawText(rd, `MSL ${st.missiles}`, W - pad, pad + 44 * s, 9 * s, 1.1 * s, 1, 0.6, 0.3, 0.95, 1);
  }

  // --- altitude ladder: the trench/surface decision, made legible ---
  const lx = pad + 6 * s;
  const ly0 = H * 0.32;
  const ly1 = H * 0.72;
  const rimY = lerp(ly1, ly0, clamp(st.rimHeight / st.ceiling, 0, 1));
  rd.line2(lx, ly0, lx, ly1, 1 * s, DIM[0], DIM[1], DIM[2], 0.5, 0.5);
  // The rim line: above it you are exposed.
  rd.line2(lx - 7 * s, rimY, lx + 9 * s, rimY, 1.8 * s, RED[0], RED[1], RED[2], 0.9, 0.9);
  drawText(rd, 'RIM', lx + 13 * s, rimY + 3 * s, 7 * s, 0.9 * s, RED[0], RED[1], RED[2], 0.7);
  const ay = lerp(ly1, ly0, clamp(st.altitude / st.ceiling, 0, 1));
  const acol = st.exposed ? RED : CYAN;
  rd.line2(lx - 5 * s, ay, lx + 5 * s, ay, 2.4 * s, acol[0], acol[1], acol[2], 1, 1);
  rd.line2(lx + 5 * s, ay, lx + 11 * s, ay - 4 * s, 1.6 * s, acol[0], acol[1], acol[2], 1, 0.4);

  // --- run progress, with what is coming up on it ---
  const pw = W * 0.42;
  const px = (W - pw) * 0.5;
  const py = H - pad - 6 * s;
  rd.line2(px, py, px + pw, py, 1.2 * s, DIM[0], DIM[1], DIM[2], 0.45, 0.45);
  for (const t of st.sealMarks) {
    const k = clamp(t / st.total, 0, 1);
    rd.line2(px + pw * k, py - 6 * s, px + pw * k, py + 6 * s, 1.6 * s,
      RED[0], RED[1], RED[2], 0.8, 0.8);
  }
  if (st.portT > 0) {
    const k = clamp(st.portT / st.total, 0, 1);
    rd.line2(px + pw * k, py - 9 * s, px + pw * k, py + 9 * s, 2 * s, 1, 0.6, 0.15, 1, 1);
  }
  const pk = clamp(st.progress, 0, 1);
  rd.line2(px, py, px + pw * pk, py, 2.6 * s, CYAN[0], CYAN[1], CYAN[2], 1, 1);
  rd.line2(px + pw * pk, py - 8 * s, px + pw * pk, py + 8 * s, 2 * s, 1, 1, 1, 1, 1);

  // --- cockpit frame ---
  bracket(rd, pad * 0.6, pad * 0.6, W - pad * 1.2, H - pad * 1.2, s, DIM, 0.22, 1.2 * s);

  // --- warnings ---
  let wy = H * 0.2;
  const warn = (text, col, blink) => {
    const a = blink ? 0.4 + 0.6 * Math.abs(Math.sin(st.time * 7)) : 1;
    drawText(rd, text, W * 0.5, wy, 15 * s, 1.8 * s, col[0], col[1], col[2], a, 0);
    wy += 24 * s;
  };
  if (st.exposed) warn('EXPOSED', RED, true);
  if (st.wallWarn > 0) warn('PULL AWAY', AMBER, true);
  if (st.sealAhead > 0) warn('BULKHEAD -- CLIMB', AMBER, true);
  if (st.portAhead && st.portAlive) warn('HOLD ON PORT TO LOCK', CYAN, true);
  if (st.message) {
    drawText(rd, st.message, W * 0.5, H * 0.42, 20 * s, 2.2 * s, 1, 0.85, 0.4, 1, 0);
  }
}

/**
 * The level, drawn as a plan and an elevation.
 *
 * This is a schematic, not a survey: lateral drift and trench width are plotted
 * at independent scales, and the elevation puts the floor on a baseline with the
 * rim measured up from it. Plotting all of it at one true scale is what a first
 * attempt does, and it collapses the two facts that actually matter -- how wide
 * and how deep -- into a pair of parallel lines.
 *
 * `band` is the vertical slice of canvas the design panel leaves free.
 */
export function drawSchematic(rd, track, level, alpha = 1, band = null) {
  const W = rd.width, s = rd.scale;
  const y0 = band ? band.y0 : rd.height * 0.08;
  const y1 = band ? band.y1 : rd.height * 0.92;
  const h = Math.max(70 * s, y1 - y0);
  const L = Math.max(1, track.total);
  const x0 = W * 0.07, x1 = W * 0.955;
  const mapX = (t) => x0 + ((x1 - x0) * clamp(t / L, 0, 1));

  const fit = fitOf(track, L);
  const labelRow = y0 + 8 * s;
  const top = y0 + 22 * s;
  const usable = Math.max(40 * s, y1 - 14 * s - top);
  const planMid = top + usable * 0.26;
  const floorY = top + usable * 0.98;

  const driftS = (usable * 0.13) / fit.maxDrift;
  const widthS = (usable * 0.15) / fit.maxHw;
  const depthS = (usable * 0.46) / fit.maxRim;
  const hillS = (usable * 0.10) / fit.maxHill;

  const N = 240;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const t = (L * i) / N;
    const c = planMid + track.x(t) * driftS;
    const hw = track.halfWidth(t) * widthS;
    const cur = [mapX(t), c, hw];
    if (prev) {
      rd.line2(prev[0], prev[1] - prev[2], cur[0], cur[1] - cur[2], 1.2 * s,
        CYAN[0], CYAN[1], CYAN[2], 0.85 * alpha, 0.85 * alpha);
      rd.line2(prev[0], prev[1] + prev[2], cur[0], cur[1] + cur[2], 1.2 * s,
        CYAN[0], CYAN[1], CYAN[2], 0.85 * alpha, 0.85 * alpha);
      rd.line2(prev[0], prev[1], cur[0], cur[1], 0.8 * s,
        DIM[0], DIM[1], DIM[2], 0.3 * alpha, 0.3 * alpha);
    }
    prev = cur;
  }

  prev = null;
  for (let i = 0; i <= N; i++) {
    const t = (L * i) / N;
    const base = floorY + track.y(t) * hillS;
    const cur = [mapX(t), base, track.rim(t) * depthS, track.railY(t) * depthS];
    if (prev) {
      rd.line2(prev[0], prev[1], cur[0], cur[1], 1.3 * s,
        DIM[0], DIM[1], DIM[2], 0.7 * alpha, 0.7 * alpha);
      rd.line2(prev[0], prev[1] - prev[2], cur[0], cur[1] - cur[2], 1.5 * s,
        RED[0], RED[1], RED[2], 0.8 * alpha, 0.8 * alpha);
      rd.line2(prev[0], prev[1] - prev[3], cur[0], cur[1] - cur[3], 0.9 * s,
        AMBER[0], AMBER[1], AMBER[2], 0.45 * alpha, 0.45 * alpha);
    }
    prev = cur;
  }
  drawText(rd, 'PLAN  (WIDTH AND TURN)', x0, planMid - usable * 0.17, 7.5 * s, 0.9 * s,
    DIM[0], DIM[1], DIM[2], 0.65 * alpha);
  drawText(rd, 'ELEVATION  (RIM ABOVE FLOOR)', x0, floorY + 11 * s, 7.5 * s, 0.9 * s,
    DIM[0], DIM[1], DIM[2], 0.65 * alpha);

  // Placed content: obstacles below the plan axis, guns above it.
  const tick = usable * 0.045;
  const obY = planMid + usable * 0.17;
  for (const ob of level.obstacles) {
    if (ob.kind === 'seal') continue;
    const x = mapX(ob.t);
    rd.line2(x, obY, x, obY + tick, 1 * s, 1, 0.5, 0.18, 0.7 * alpha, 0.2 * alpha);
  }
  const gunY = planMid - usable * 0.17;
  for (const e of level.enemies) {
    const x = mapX(e.t);
    const up = e.kind === 'turret';
    rd.line2(x, gunY, x, gunY - tick * (up ? 1 : 0.55), 1.2 * s,
      RED[0], RED[1], RED[2], (up ? 0.9 : 0.45) * alpha, 0.2 * alpha);
  }
  for (const t of level.seals) {
    const x = mapX(t);
    rd.line2(x, top, x, floorY, 1.6 * s, RED[0], RED[1], RED[2], 0.8 * alpha, 0.15 * alpha);
    drawText(rd, 'SEAL', x, top - 2 * s, 7 * s, 0.9 * s, RED[0], RED[1], RED[2], alpha, 0);
  }
  if (track.portT > 0) {
    const x = mapX(track.portT);
    const R = 8 * s;
    const cy = floorY - track.rim(track.portT) * depthS * 0.44;
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * TAU, a1 = ((k + 1) / 10) * TAU;
      rd.line2(x + Math.cos(a0) * R, cy + Math.sin(a0) * R,
        x + Math.cos(a1) * R, cy + Math.sin(a1) * R, 1.7 * s, 1, 0.6, 0.15, alpha, alpha);
    }
    drawText(rd, 'PORT', x, cy - R - 3 * s, 7.5 * s, 1 * s, 1, 0.6, 0.15, alpha, 0);
  }

  // Section boundaries. Labels alternate rows so neighbours never collide.
  track.bounds.forEach((t, i) => {
    if (i >= track.spec.sections.length) return;
    const x = mapX(t);
    rd.line2(x, top, x, floorY + 4 * s, 1 * s, DIM[0], DIM[1], DIM[2],
      0.3 * alpha, 0.08 * alpha);
    const sec = track.spec.sections[i];
    drawText(rd, `${sec.name} W${Math.round(sec.width)} D${Math.round(sec.depth)}`,
      x + 3 * s, labelRow + (i % 2) * 8.5 * s, 7 * s, 0.9 * s,
      DIM[0], DIM[1], DIM[2], 0.8 * alpha);
  });

  drawText(rd, `${Math.round(L)} UNITS  /  ${track.spec.sections.length} SECTIONS`,
    W * 0.5, y1 - 1 * s, 8.5 * s, 1.05 * s, AMBER[0], AMBER[1], AMBER[2], 0.85 * alpha, 0);
}

/** Plot extents, computed once per track rather than every frame. */
function fitOf(track, L) {
  if (track._fit) return track._fit;
  let maxDrift = 1, maxHw = 1, maxRim = 1, maxHill = 1;
  for (let i = 0; i <= 240; i++) {
    const t = (L * i) / 240;
    maxDrift = Math.max(maxDrift, Math.abs(track.x(t)));
    maxHw = Math.max(maxHw, track.halfWidth(t));
    maxRim = Math.max(maxRim, track.rim(t));
    maxHill = Math.max(maxHill, Math.abs(track.y(t)));
  }
  track._fit = { maxDrift, maxHw, maxRim, maxHill };
  return track._fit;
}

export { textWidth };
