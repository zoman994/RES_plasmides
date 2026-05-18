/**
 * zone-interaction — pure canvas hit-detection for zones (T4 K1).
 * Drop target + resize handle math; resize delegates to the
 * already-unit-tested lib/zone-bounds.
 */
import { isPointInZone } from '../lib/zone-model';

/** Outer-most (largest area) zone containing point, or null (DEC-T4-13). */
export function findZoneAtPoint(zones, point) {
  const matches = (zones || []).filter((z) => isPointInZone(point, z));
  if (matches.length === 0) return null;
  return matches.slice().sort(
    (a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height),
  )[0];
}

/**
 * Which resize handle the point is over, or null. Corners take
 * priority over edges; edges only on the mid-span (inset by handleSize).
 */
export function hitTestResizeHandle(zone, point, handleSize = 12) {
  const { x, y, width, height } = zone.bounds;
  const hs = handleSize;
  const nearX = Math.abs(point.x - x) <= hs;
  const nearXr = Math.abs(point.x - (x + width)) <= hs;
  const nearY = Math.abs(point.y - y) <= hs;
  const nearYb = Math.abs(point.y - (y + height)) <= hs;
  if (nearX && nearY) return 'nw';
  if (nearXr && nearY) return 'ne';
  if (nearX && nearYb) return 'sw';
  if (nearXr && nearYb) return 'se';
  if (point.x > x + hs && point.x < x + width - hs) {
    if (nearY) return 'n';
    if (nearYb) return 's';
  }
  if (point.y > y + hs && point.y < y + height - hs) {
    if (nearX) return 'w';
    if (nearXr) return 'e';
  }
  return null;
}

export { resizeZoneBounds as computeResizeNewBounds } from '../lib/zone-bounds';
