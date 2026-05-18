/**
 * zone-bounds — pure zone geometry (T3 K2, DEC-T3-01 preventive split
 * so the reducer stays small when T4 adds resize/drag UI).
 */
import { ZONE_CAPS } from './zone-invariants';

const { MIN_WIDTH, MIN_HEIGHT } = ZONE_CAPS;

/**
 * resizeZoneBounds — new bounds for a handle drag. edge ∈
 * n|s|e|w|ne|nw|se|sw; delta {dx,dy}. West/north shrink past the
 * minimum clamps the size and keeps the opposite edge anchored.
 */
export function resizeZoneBounds(zone, edge, delta) {
  const b = zone.bounds;
  const dx = (delta && delta.dx) || 0;
  const dy = (delta && delta.dy) || 0;
  let { x, y, width, height } = b;
  if (edge.includes('e')) width += dx;
  if (edge.includes('s')) height += dy;
  if (edge.includes('w')) { x += dx; width -= dx; }
  if (edge.includes('n')) { y += dy; height -= dy; }
  if (width < MIN_WIDTH) {
    if (edge.includes('w')) x = (b.x + b.width) - MIN_WIDTH; // anchor east edge
    width = MIN_WIDTH;
  }
  if (height < MIN_HEIGHT) {
    if (edge.includes('n')) y = (b.y + b.height) - MIN_HEIGHT; // anchor south edge
    height = MIN_HEIGHT;
  }
  return { x, y, width, height };
}

export function dragZoneBounds(zone, delta) {
  return {
    ...zone.bounds,
    x: zone.bounds.x + ((delta && delta.dx) || 0),
    y: zone.bounds.y + ((delta && delta.dy) || 0),
  };
}

export function mergeBoundingBoxes(rects) {
  if (!rects || rects.length === 0) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function computeBoundingBox(points, padding = 40) {
  if (!points || points.length === 0) return null;
  const minX = Math.min(...points.map((p) => p.x)) - padding;
  const minY = Math.min(...points.map((p) => p.y)) - padding;
  const maxX = Math.max(...points.map((p) => p.x)) + padding;
  const maxY = Math.max(...points.map((p) => p.y)) + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(MIN_WIDTH, maxX - minX),
    height: Math.max(MIN_HEIGHT, maxY - minY),
  };
}
