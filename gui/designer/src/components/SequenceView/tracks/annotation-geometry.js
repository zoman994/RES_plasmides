/**
 * AnnotationTrack geometry helpers — extracted from AnnotationTrack.jsx
 * (decomp P1, size-budget; body byte-for-byte unchanged).
 */

export function chevronPath(strand, x, y, height) {
  const tip = strand === -1 ? x : x; // overridden by caller's translate
  const half = height / 2;
  if (strand === -1) {
    return `M${tip + 6},${y} L${tip},${y + half} L${tip + 6},${y + height}`;
  }
  return `M${tip - 6},${y} L${tip},${y + half} L${tip - 6},${y + height}`;
}
