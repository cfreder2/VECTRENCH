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

/**
 * The gun marker: a pair of facing brackets at the aim point.
 *
 * `h` is its half-size, and the caller sizes it from the range of whatever the
 * marker is over. That is the whole reason it is drawn in world terms rather
 * than as a fixed cross -- a marker that stays one size wherever it points
 * reads as painted on the canopy, while one that shrinks with distance reads as
 * being out there, on the thing.
 */
export function drawReticle(rd, x, y, s, h, paintProgress, locked, hasTarget) {
  const col = locked ? RED : hasTarget ? AMBER : CYAN;
  const arm = h * 0.4;
  const w = 1.6 * s;
  for (const side of [-1, 1]) {
    const bx = x + side * h;
    rd.line2(bx, y - h, bx, y + h, w, col[0], col[1], col[2], 0.95, 0.95);
    rd.line2(bx, y - h, bx - side * arm, y - h, w, col[0], col[1], col[2], 0.95, 0.5);
    rd.line2(bx, y + h, bx - side * arm, y + h, w, col[0], col[1], col[2], 0.95, 0.5);
  }
  // A pip at the exact aim point, because the brackets deliberately leave the
  // middle empty and something has to say where the shot actually goes.
  rd.line2(x, y, x, y, 1.8 * s, col[0], col[1], col[2], 1, 1);

  if (paintProgress > 0) {
    const R2 = h * 1.34;
    const n = 28;
    const upto = Math.floor(n * clamp(paintProgress, 0, 1));
    for (let i = 0; i < upto; i++) {
      const a0 = (i / n) * TAU - Math.PI / 2;
      const a1 = ((i + 0.75) / n) * TAU - Math.PI / 2;
      rd.line2(x + Math.cos(a0) * R2, y + Math.sin(a0) * R2,
        x + Math.cos(a1) * R2, y + Math.sin(a1) * R2,
        2 * s, 1, 0.5, 0.2, 1, 1);
    }
  }
}

/**
 * Brackets on a lockable target, in three states.
 *
 * A late level has ninety guns in it, so an idle box has to be quiet enough
 * that ten of them on screen is texture rather than noise. Painting closes the
 * brackets in; a completed lock snaps them tight and red, which is the only
 * thing on screen that means "this dies when you launch".
 */
export function drawTargetBox(rd, sx, sy, s, size, progress, locked) {
  if (locked) {
    bracket(rd, sx - size * 0.5, sy - size * 0.5, size, size, s, RED, 1, 2 * s);
    return;
  }
  if (progress > 0) {
    // Closes from wide onto the target as the paint fills, so the box is the
    // progress bar and there is no second thing to read.
    const k = lerp(2.1, 1, clamp(progress, 0, 1)) * size;
    bracket(rd, sx - k * 0.5, sy - k * 0.5, k, k, s, AMBER, 0.9, 1.6 * s);
    return;
  }
  bracket(rd, sx - size * 0.7, sy - size * 0.7, size * 1.4, size * 1.4, s, DIM, 0.3, 1.2 * s);
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
  // --- gun heat ---
  // Drawn under the shield because it is read the same way: a bar you watch
  // fill and then have to stop doing something about.
  const hot = st.overheated;
  const hcol = hot ? RED : st.heat > 0.7 ? AMBER : DIM;
  drawText(rd, hot ? 'GUN -- OVERHEATED' : 'GUN', pad, pad + 40 * s, 9 * s, 1.1 * s,
    hcol[0], hcol[1], hcol[2], hot ? 0.4 + 0.6 * Math.abs(Math.sin(st.time * 9)) : 0.9);
  bar(rd, pad, pad + 47 * s, 150 * s, 7 * s, clamp(st.heat, 0, 1), 10,
    hot ? RED : st.heat > 0.7 ? AMBER : CYAN, s);

  // --- launcher ---
  const ready = st.missileCooldown <= 0;
  const mcol = ready ? (st.locks > 0 ? AMBER : DIM) : DIM;
  const mtext = ready
    ? (st.locks > 0 ? `MISSILES READY -- ${st.locks} LOCKED` : 'MISSILES READY')
    : `RELOADING ${st.missileCooldown.toFixed(1)}`;
  drawText(rd, mtext, W - pad, pad + 46 * s, 9 * s, 1.1 * s,
    mcol[0], mcol[1], mcol[2], 0.95, 1);
  bar(rd, W - pad - 150 * s, pad + 52 * s, 150 * s, 7 * s,
    ready ? 1 : 1 - st.missileCooldown / st.missileMax, 10, ready ? AMBER : DIM, s);

  // Locks, as pips: the count you are about to spend.
  for (let i = 0; i < st.lockMax; i++) {
    const on = i < st.locks;
    const bx = W - pad - 6 * s - i * 11 * s;
    rd.line2(bx, pad + 66 * s, bx, pad + 66 * s, 3.4 * s,
      1, 0.6, 0.25, on ? 1 : 0.16, on ? 1 : 0.16);
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

  // --- the warden, when there is one: name, its ring of pods, its core ---
  if (st.boss) {
    const bw = W * 0.34;
    const bx = (W - bw) * 0.5;
    const by = pad + 14 * s;
    const bcol = st.boss.flash > 0 ? [1, 1, 1] : [0.78, 0.42, 1];
    drawText(rd, st.boss.name, W * 0.5, by, 11 * s, 1.3 * s, bcol[0], bcol[1], bcol[2], 0.95, 0);
    // The pods first: the part of the fight you are actually in. Diamonds,
    // going dark one by one -- the progress the eye needs.
    for (let i = 0; i < (st.boss.partsMax || 0); i++) {
      const on = i < st.boss.parts;
      const px = W * 0.5 + (i - (st.boss.partsMax - 1) / 2) * 16 * s;
      const py = by + 10 * s;
      const r = 4.4 * s;
      const D = [[0, -r], [r * 0.75, 0], [0, r], [-r * 0.75, 0]];
      for (let k = 0; k < 4; k++) {
        rd.line2(px + D[k][0], py + D[k][1], px + D[(k + 1) % 4][0], py + D[(k + 1) % 4][1],
          1.5 * s, 1, 0.55, 0.25, on ? 0.95 : 0.18, on ? 0.95 : 0.18);
      }
    }
    // The core bar: dim behind the lattice, lit the moment it is open.
    const open = !st.boss.shielded;
    bar(rd, bx, by + 18 * s, bw, 8 * s, clamp(st.boss.frac, 0, 1), 16,
      open ? bcol : [bcol[0] * 0.4, bcol[1] * 0.4, bcol[2] * 0.4], s);
    if (!open) {
      drawText(rd, 'CORE SHIELDED', W * 0.5, by + 33 * s, 8 * s, 0.9 * s,
        0.5, 0.8, 1, 0.65, 0);
    }
  }

  // --- cockpit frame ---
  bracket(rd, pad * 0.6, pad * 0.6, W - pad * 1.2, H - pad * 1.2, s, DIM, 0.22, 1.2 * s);

  // --- warnings ---
  let wy = H * 0.2;
  const warn = (text, col, blink) => {
    const a = blink ? 0.4 + 0.6 * Math.abs(Math.sin(st.time * 7)) : 1;
    drawText(rd, text, W * 0.5, wy, 15 * s, 1.8 * s, col[0], col[1], col[2], a, 0);
    wy += 24 * s;
  };
  if (st.calibrating) warn('HOLD THE PHONE STEADY', CYAN, true);
  if (st.exposed) warn('EXPOSED', RED, true);
  if (st.wallWarn > 0) warn('PULL AWAY', AMBER, true);
  // Two states, because "climb" alone never tells you when you have climbed
  // enough. The alarm stops the moment you are actually above the lip.
  if (st.sealAhead > 0) {
    if (st.sealClear) warn('BULKHEAD -- CLEAR', CYAN, false);
    else warn('BULKHEAD -- CLIMB OVER IT', RED, true);
  }
  if (st.portAhead && st.portAlive) {
    warn(st.locks > 0 ? 'PORT LOCKED -- LAUNCH' : 'PUT THE CROSSHAIR ON THE PORT', CYAN, true);
  }
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
/**
 * Packs labels into a fixed set of text rows, refusing any that would touch one
 * already placed. A schematic can be asked to caption 24 sections and six
 * bulkheads inside a band a couple of centimetres tall, so "where does this go"
 * has to account for what is already there. Anything that fits nowhere is
 * dropped: a missing name costs a reader less than two names drawn through each
 * other. Returns the row's baseline, or null.
 */
function rowPacker(rows, s, left, right) {
  const used = rows.map(() => []);
  const pad = 5 * s;
  return (text, x, size, align = -1) => {
    const w = textWidth(text, size);
    // Nudged back inside the frame first. A label anchored to a section that
    // starts near the end of the run would otherwise hang off the right edge,
    // which is the one collision more rows cannot fix.
    const want = align === 0 ? x - w * 0.5 : align === 1 ? x - w : x;
    const a = clamp(want, left, Math.max(left, right - w));
    for (let i = 0; i < rows.length; i++) {
      if (used[i].some(([c, d]) => a - pad < d && a + w + pad > c)) continue;
      used[i].push([a, a + w]);
      return { x: a, y: rows[i], text };
    }
    return null;
  };
}

const PLAN_CAP = 'PLAN  (WIDTH AND TURN)';

export function drawSchematic(rd, track, level, alpha = 1, band = null) {
  const W = rd.width, s = rd.scale;
  const y0 = band ? band.y0 : rd.height * 0.08;
  const y1 = band ? band.y1 : rd.height * 0.92;
  const L = Math.max(1, track.total);
  const x0 = W * 0.07, x1 = W * 0.955;
  const mapX = (t) => x0 + ((x1 - x0) * clamp(t / L, 0, 1));

  const fit = fitOf(track, L);

  // Text rows are reserved first and the plot is fitted into what is left over:
  // three rows above it for the plan caption, section names and bulkheads, two
  // below for the elevation caption and the total. Every label lives in a row,
  // so no label can land on the curves, and the packer keeps them off each
  // other. Sizing the plot to the leftovers is what makes that safe -- the plot
  // cannot grow into the rows later.
  const TEXT = 7 * s;
  const pad = 5 * s;

  // How many rows the labels actually need. Reserving three when one will do
  // costs a three-section level a quarter of its plot height for nothing, and
  // reserving one when six bulkheads want captioning is how they end up on top
  // of each other. Estimate from total label width against the axis.
  const secLabels = track.spec.sections.map(
    (sec) => `${sec.name} W${Math.round(sec.width)} D${Math.round(sec.depth)}`);
  const wanted = [PLAN_CAP, ...level.seals.map(() => 'SEAL'),
    ...track.spec.sections.map((sec) => sec.name)]
    .reduce((a, t) => a + textWidth(t, TEXT) + pad, 0);
  // Packing is never perfect -- labels sit where their section starts, not
  // wherever there is room -- so budget rows against three quarters of the
  // axis. Estimating tightly drops labels a further row would have held.
  const nRows = clamp(Math.ceil(wanted / ((x1 - x0) * 0.75)), 1, 3);
  const rows = [];
  for (let i = 0; i < nRows; i++) rows.push(y0 + TEXT + i * 11 * s);

  const footY = y1 - 2 * s;
  const elevCapY = footY - 15 * s;

  const top = rows[nRows - 1] + 5 * s;
  const bottom = elevCapY - TEXT - 3 * s;
  const usable = Math.max(40 * s, bottom - top);

  // Two bands that no longer share space: the plan's widest reach is 0.48 of the
  // way down, the elevation's highest rim is 0.54. They used to cross, which
  // read as one tangled plot rather than two.
  const planMid = top + usable * 0.24;
  const floorY = top + usable * 0.9;
  const driftS = (usable * 0.11) / fit.maxDrift;
  const widthS = (usable * 0.13) / fit.maxHw;
  const depthS = (usable * 0.36) / fit.maxRim;
  const hillS = (usable * 0.09) / fit.maxHill;

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

  // Placed content: obstacles below the plan axis, guns above it.
  const tick = usable * 0.04;
  const obY = planMid + usable * 0.16;
  for (const ob of level.obstacles) {
    if (ob.kind === 'seal') continue;
    const x = mapX(ob.t);
    rd.line2(x, obY, x, obY + tick, 1 * s, 1, 0.5, 0.18, 0.7 * alpha, 0.2 * alpha);
  }
  const gunY = planMid - usable * 0.16;
  for (const e of level.enemies) {
    const x = mapX(e.t);
    const up = e.kind === 'turret';
    rd.line2(x, gunY, x, gunY - tick * (up ? 1 : 0.55), 1.2 * s,
      RED[0], RED[1], RED[2], (up ? 0.9 : 0.45) * alpha, 0.2 * alpha);
  }

  // Rows are claimed in the order a reader can least afford to lose: the caption
  // anchors the top-left, then bulkheads, then section names fill the gaps.
  const place = rowPacker(rows, s, 6 * s, W - 6 * s);
  const cap = place(PLAN_CAP, x0, TEXT);
  if (cap) {
    drawText(rd, PLAN_CAP, cap.x, cap.y, TEXT, 0.9 * s,
      DIM[0], DIM[1], DIM[2], 0.65 * alpha);
  }

  for (const t of level.seals) {
    const x = mapX(t);
    rd.line2(x, top, x, floorY, 1.6 * s, RED[0], RED[1], RED[2], 0.8 * alpha, 0.15 * alpha);
    const p = place('SEAL', x, TEXT, 0);
    if (p) drawText(rd, 'SEAL', p.x, p.y, TEXT, 0.9 * s, RED[0], RED[1], RED[2], alpha);
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

  track.bounds.forEach((t, i) => {
    if (i >= track.spec.sections.length) return;
    const x = mapX(t);
    rd.line2(x, top, x, floorY + 4 * s, 1 * s, DIM[0], DIM[1], DIM[2],
      0.3 * alpha, 0.08 * alpha);
    // Full label if it fits, bare name if it does not. The width and depth it
    // drops are the two things the plot underneath is already drawing, so an
    // eight-section run loses the redundant half rather than whole sections.
    const p = place(secLabels[i], x + 3 * s, TEXT)
      ?? place(track.spec.sections[i].name, x + 3 * s, TEXT);
    if (p) {
      const label = p.text;
      drawText(rd, label, p.x, p.y, TEXT, 0.9 * s,
        DIM[0], DIM[1], DIM[2], 0.8 * alpha);
    }
  });

  drawText(rd, 'ELEVATION  (RIM ABOVE FLOOR)', x0, elevCapY, TEXT, 0.9 * s,
    DIM[0], DIM[1], DIM[2], 0.65 * alpha);
  drawText(rd, `${Math.round(L)} UNITS  /  ${track.spec.sections.length} SECTIONS`,
    W * 0.5, footY, 8.5 * s, 1.05 * s, AMBER[0], AMBER[1], AMBER[2], 0.85 * alpha, 0);
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
