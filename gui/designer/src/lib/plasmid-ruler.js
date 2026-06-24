/**
 * plasmid-ruler.js — pure geometry for the circular-map bp ruler + the
 * click-to-set-origin angle math (Игорь 17.06.2026: «разметка размеров» +
 * «начало отсчёта отметить кликом»). Kept pure + standalone so the heavy
 * PlasmidMiniMap stays cheap and the math is unit-tested in isolation.
 *
 * Angle convention matches PlasmidMiniMap: position 0 sits at the TOP
 * (12 o'clock), increasing CLOCKWISE. For a bp position p (0-based) the
 * draw angle is `(p / length) * 2π − π/2` and the point is
 * `(cx + r·cos(a), cy + r·sin(a))` (SVG y-down).
 */

const TAU = 2 * Math.PI;

/** A «nice» round tick step (1/2/5 × 10ⁿ) so there are ~targetTicks majors. */
export function niceTickStep(length, targetTicks = 10) {
  const len = Number(length) || 0;
  if (len <= 0) return 1;
  const raw = len / Math.max(1, targetTicks);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag; // 1..10
  let nice;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return Math.max(1, nice * mag);
}

/**
 * Major tick bp positions [0, step, 2·step, …] strictly below length.
 * (0 is the origin; consumers can skip drawing a label there.)
 */
export function rulerTicks(length, step) {
  const len = Number(length) || 0;
  const s = Number(step) || 0;
  if (len <= 0 || s <= 0) return [];
  const ticks = [];
  for (let p = 0; p < len; p += s) ticks.push(Math.round(p));
  return ticks;
}

/** Draw angle (radians) for a 0-based bp position. */
export function angleForBp(pos0, length) {
  const len = Number(length) || 1;
  return (((Number(pos0) || 0) % len) / len) * TAU - Math.PI / 2;
}

/**
 * Map a click vector (dx, dy) FROM the circle centre to a 1-based bp
 * position, using the top=0 / clockwise convention above. Returns a value
 * in [1, length]. (dx, dy) are in the same user space as the SVG (y-down).
 */
export function bpFromVector(dx, dy, length) {
  const len = Number(length) || 0;
  if (len <= 0) return 1;
  // atan2 in SVG space; undo the −π/2 top offset, normalise to [0,1).
  const a = Math.atan2(dy, dx) + Math.PI / 2;
  let frac = (a % TAU) / TAU;
  if (frac < 0) frac += 1;
  const pos0 = Math.floor(frac * len);
  return Math.min(len, Math.max(1, pos0 + 1));
}
