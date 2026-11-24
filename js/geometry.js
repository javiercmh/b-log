// geometry.js — pure map math in grid units. No DOM, no bridge; covered by tests/.

/** Closest point to p on segment a–b, with its squared distance. */
export function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return { x, y, d2: (p[0] - x) ** 2 + (p[1] - y) ** 2 };
}

/**
 * Snaps p to the nearest wall within maxDist grid units.
 * Returns { wallId, x, y, dist } or null when no wall is close enough.
 */
export function snapToWall(p, walls, maxDist) {
  let best = null;
  for (const wall of walls) {
    const pts = wall.points;
    if (pts.length === 1) {
      const hit = projectOnSegment(p, pts[0], pts[0]);
      if (!best || hit.d2 < best.d2) best = { ...hit, wallId: wall.id };
    }
    for (let i = 1; i < pts.length; i++) {
      const hit = projectOnSegment(p, pts[i - 1], pts[i]);
      if (!best || hit.d2 < best.d2) best = { ...hit, wallId: wall.id };
    }
  }
  if (!best) return null;
  const dist = Math.sqrt(best.d2);
  if (dist > maxDist) return null;
  return { wallId: best.wallId, x: round2(best.x), y: round2(best.y), dist };
}

/** Rounds a point to the nearest grid intersection, clamped to the grid. */
export function snapToGrid(p, cols, rows) {
  return [
    Math.max(0, Math.min(cols, Math.round(p[0]))),
    Math.max(0, Math.min(rows, Math.round(p[1])))
  ];
}

/** Returns the item whose (x, y) is nearest to p within maxDist, or null. */
export function nearestPoint(p, items, maxDist) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const item of items) {
    const d2 = (item.x - p[0]) ** 2 + (item.y - p[1]) ** 2;
    if (d2 <= bestD2) { best = item; bestD2 = d2; }
  }
  return best;
}

/** The smallest grid size that still contains every wall point. */
export function wallExtent(walls) {
  let cols = 0;
  let rows = 0;
  for (const w of walls) for (const [x, y] of w.points) { cols = Math.max(cols, x); rows = Math.max(rows, y); }
  return { cols, rows };
}

/** Point halfway along a polyline, used to place the wall's name label. */
export function polylineMidpoint(points) {
  if (points.length === 1) return { x: points[0][0], y: points[0][1] };
  const lens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let target = total / 2;
  for (let i = 0; i < lens.length; i++) {
    if (target <= lens[i] || i === lens.length - 1) {
      const t = lens[i] === 0 ? 0 : target / lens[i];
      const a = points[i];
      const b = points[i + 1];
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
    }
    target -= lens[i];
  }
  return { x: points[0][0], y: points[0][1] };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
