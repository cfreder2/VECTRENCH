// Swept collision. Projectiles here move further per frame than their targets
// are wide, so every hit test is segment-versus-sphere rather than
// point-versus-sphere: a point test lets a laser tunnel clean through a drone.

/** True if segment AB comes within `r` of the sphere at C. */
/**
 * The port's wall of beams, in one place.
 *
 * The renderer draws it and the game collides against it, and if those two ever
 * disagree the wall is either an invisible killer or a decoration. It started
 * out as exactly that: drawn from radius 40 outwards, collided from the middle,
 * so the safest looking spot in the fight -- dead on the port's axis, with the
 * wall turning around you -- was the one place every beam hit.
 */
/**
 * The ship, as two rectangles: flying level, and turned onto its edge.
 *
 * Anything that decides whether the ship fits through a hole reads these --
 * the collision, the slot builder, and the fairness audit -- so the shape can
 * only ever be changed in one place.
 */
export const SHIP_HX = 7, SHIP_HY = 5;
export const KNIFE_HX = 2.5, KNIFE_HY = 9;

export const PORT_BEAM = {
  shafts: 14,
  inner: 40,      // where a beam starts, just off the shaft mouths
  slab: 340,      // how far in front of the port the wall stands. Deep enough
                  // to fly through for about a second rather than to cross.
  life: 1.05,     // how long one beam hangs there
};

/**
 * The ring's, which is the same idea on a smaller thing: eight tentacles round
 * the hoop firing outward at the rock, one after another clockwise from twelve.
 * A beam starts at the tentacle tip, so the hole in the middle stays the way
 * through -- the ring is an aperture you fly, and a beam across it would turn
 * it into a wall.
 */
export const RING_BEAM = {
  arms: 8,
  gap: 22,        // how far past the hoop the tentacle tip sits
  rate: 0.2,      // seconds between tentacles, unless the section says otherwise
  lit: 4,         // how many stand at once -- which is what sets a beam's life
  spread: 0.055,  // how much the wedge fans out over its length, in radians
  wide: 3,        // half width where it leaves the tentacle
  // How far in front of the hoop the light stands. Without this the beams are
  // pure decoration: the ring's own boxes already fill the whole cross-section
  // except the hole, so anywhere a beam could reach is somewhere you have
  // already crashed. Standing them in the approach makes cutting the corner on
  // the way in cost something, while the hole stays clean.
  lead: 90,
};

/**
 * How long one of a ring's beams hangs there.
 *
 * Derived from that ring's own fire rate rather than fixed, so slowing a ring
 * down slows the sweep without thinning the wall: the same four beams stand,
 * they just take twice as long to go round. The renderer fades on this and the
 * game expires on it, so it lives here where both can reach it.
 */
export const ringBeamLife = (ob) => (ob.beamRate || RING_BEAM.rate) * RING_BEAM.lit;

export function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-9) {
    t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  const pz = az + dz * t - cz;
  return px * px + py * py + pz * pz <= r * r;
}

// --- moving obstacles ---------------------------------------------------
//
// An obstacle's boxes are axis-aligned rectangles in its own frame, and that
// frame may slide and spin over the run: a pinwheel is four static arms turning,
// a crusher is two static walls sliding toward each other. Keeping the boxes
// still and moving the frame is what makes that cheap -- collision transforms
// one query point instead of eight corners, and the shapes stay AABBs.
//
// Everything reads the same function: the ship's collision, the projectile
// scenery test, the renderer, and tools/audit.mjs. A moving obstacle drawn in
// one place and collided in another would be a trap the audit could not see.

/**
 * The obstacle's frame at `time` seconds into the run: an offset, and a
 * rotation about (cx, cy) given as its cosine and sine.
 *
 * Phase comes from the obstacle's position along the track, not from when the
 * player happens to arrive -- the ship's speed is a function of track position
 * alone, so arrival time is fixed, and a spinning gate presents the same face
 * to everyone. Without that a level would be unauditable and, worse, unfair in
 * a way nobody could learn.
 */
export function frameOf(ob, time, out) {
  const a = ob.anim;
  if (!a) { out[0] = 0; out[1] = 0; out[2] = 1; out[3] = 0; return out; }
  const s = time * a.rate + a.phase;
  out[0] = a.dx ? a.dx * Math.sin(s) : 0;
  out[1] = (a.dy ? a.dy * Math.sin(s + (a.dyPhase || 0)) : 0) + (ob.dropY || 0);
  const th = a.spin ? time * a.spin + a.phase : 0;
  out[2] = Math.cos(th);
  out[3] = Math.sin(th);
  return out;
}

const _f = [0, 0, 1, 0];

/**
 * Does a canyon-local point sit inside this obstacle at this time?
 *
 * `padX`/`padY` grow the boxes rather than shrinking the point, so a caller can
 * pass the ship's half extents and still ask a point question.
 */
export function hitsObstacle(ob, time, lx, ly, padX = 0, padY = 0) {
  if (ob.gone) return false;
  frameOf(ob, time, _f);
  let px = lx - _f[0];
  let py = ly - _f[1];
  if (_f[3] !== 0) {
    // Into the obstacle's own frame: rotate the point back about the centre.
    const cx = ob.cx || 0, cy = ob.cy || 0;
    const ux = px - cx, uy = py - cy;
    px = cx + ux * _f[2] + uy * _f[3];
    py = cy - ux * _f[3] + uy * _f[2];
  }
  const cx = ob.cx || 0, cy = ob.cy || 0;
  for (let i = 0; i < ob.boxes.length; i++) {
    const b = ob.boxes[i];
    let qx = px, qy = py;
    // A fifth element is the box's own angle within the obstacle: it lets one
    // rectangle be a whole pinwheel blade instead of a row of squares.
    if (b[4]) {
      const ca = Math.cos(b[4]), sa = Math.sin(b[4]);
      const ux = px - cx, uy = py - cy;
      qx = cx + ux * ca + uy * sa;
      qy = cy - ux * sa + uy * ca;
    }
    if (qx + padX > b[0] && qx - padX < b[1] && qy + padY > b[2] && qy - padY < b[3]) {
      return true;
    }
  }
  return false;
}

/** A point of the obstacle's own frame, back in canyon-local coordinates. */
export function obstacleToLocal(ob, time, ox, oy, out, ang = 0) {
  frameOf(ob, time, _f);
  const cx = ob.cx || 0, cy = ob.cy || 0;
  let ux = ox - cx, uy = oy - cy;
  if (ang) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = ux * ca - uy * sa;
    uy = ux * sa + uy * ca;
    ux = rx;
  }
  out[0] = cx + ux * _f[2] - uy * _f[3] + _f[0];
  out[1] = cy + ux * _f[3] + uy * _f[2] + _f[1];
  return out;
}
