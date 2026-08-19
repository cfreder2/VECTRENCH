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
