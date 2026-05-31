const EPSILON = 0.000001;

export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = ((a.y > y) !== (b.y > y))
      && (x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || EPSILON) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

export function getSegmentPolygonHit(startX, startY, endX, endY, polygon) {
  if (!polygon?.length) return null;
  if (pointInPolygon(startX, startY, polygon)) return { t: 0, x: startX, y: startY };
  let bestT = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const t = getSegmentIntersectionT(startX, startY, endX, endY, a.x, a.y, b.x, b.y);
    if (t === null || t >= bestT) continue;
    bestT = t;
  }
  if (!Number.isFinite(bestT)) return null;
  return {
    t: bestT,
    x: startX + (endX - startX) * bestT,
    y: startY + (endY - startY) * bestT,
  };
}

export function getPointPolygonDistanceSq(x, y, polygon) {
  if (!polygon?.length) return Infinity;
  if (pointInPolygon(x, y, polygon)) return 0;
  let best = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    best = Math.min(best, pointToSegmentDistanceSq(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
}

export function getPointAabbDistance(x, y, left, top, right, bottom) {
  const dx = Math.max(left - x, 0, x - right);
  const dy = Math.max(top - y, 0, y - bottom);
  return Math.hypot(dx, dy);
}

function getSegmentIntersectionT(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < EPSILON) return null;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return Math.max(0, Math.min(1, t));
}

function pointToSegmentDistanceSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= EPSILON) {
    const x = px - ax;
    const y = py - ay;
    return x * x + y * y;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  const x = ax + dx * t;
  const y = ay + dy * t;
  const offsetX = px - x;
  const offsetY = py - y;
  return offsetX * offsetX + offsetY * offsetY;
}
