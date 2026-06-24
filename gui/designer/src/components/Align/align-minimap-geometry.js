/**
 * align-minimap-geometry — pure position↔pixel maths for the linear alignment
 * minimap (AlignMiniMap). Kept separate so the geometry is unit-testable
 * without rendering SVG. All coordinates are along the horizontal strip:
 * reference position 0..len maps to x in [padX, width - padX].
 */

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** Reference position → fraction 0..1 along the strip. */
export function posToFrac(pos, len) {
  if (!(len > 0)) return 0;
  return clamp(pos / len, 0, 1);
}

/** Fraction 0..1 → reference position (rounded, clamped to [0, len]). */
export function fracToPos(frac, len) {
  return Math.round(clamp(frac, 0, 1) * Math.max(0, len));
}

/** Reference position → x pixel inside the strip. */
export function posToX(pos, len, width, padX = 0) {
  const inner = Math.max(0, width - 2 * padX);
  return padX + posToFrac(pos, len) * inner;
}

/** x pixel → reference position. */
export function xToPos(x, len, width, padX = 0) {
  const inner = Math.max(1, width - 2 * padX);
  return fracToPos((x - padX) / inner, len);
}

/**
 * Carriage (viewport indicator) geometry for a visible [start, end] range.
 * Returns { x, width } in pixels, with a minimum visible width so a tiny
 * window is still grabbable.
 */
export function carriageRect(visibleStart, visibleEnd, len, width, padX = 0, minPx = 10) {
  const x0 = posToX(visibleStart, len, width, padX);
  const x1 = posToX(visibleEnd, len, width, padX);
  const w = Math.max(minPx, x1 - x0);
  // keep the carriage inside the strip when clamped to min width
  const maxX = padX + Math.max(0, width - 2 * padX) - w;
  return { x: clamp(x0, padX, Math.max(padX, maxX)), width: w };
}
