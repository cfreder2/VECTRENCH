// Swept collision. Projectiles here move further per frame than their targets
// are wide, so every hit test is segment-versus-sphere rather than
// point-versus-sphere: a point test lets a laser tunnel clean through a drone.

/** True if segment AB comes within `r` of the sphere at C. */
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
