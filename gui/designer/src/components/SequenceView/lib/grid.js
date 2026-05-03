/**
 * lib/grid.js — character-grid measurement & line-wrap primitives for
 * SequenceView (Sprint M-B.3, K1).
 *
 * Why a dedicated module:
 *  - SequenceView is a hybrid HTML char-grid + SVG overlay (DEC-SQV-01). All
 *    track positions (annotations, primers, AA, restriction, ruler) are
 *    expressed in `ch` units. A single source of truth for "how many chars
 *    fit per line" is required so SVG track widths line up with HTML strand
 *    rows pixel-for-pixel.
 *  - The previous SequenceMapView measured charPx inside its own component
 *    and never exposed the math, so the new tracks (multi-row stacking,
 *    leader-labels, AA opacity hybrid) had nowhere to call into. Pulling it
 *    into a stand-alone helper unlocks unit testing and lets index.jsx do
 *    one ResizeObserver instead of N.
 *
 * Public API:
 *   measureCharPx(host, fontFamily?) → number     (DOM-dependent helper)
 *   clampCharsPerLine(rawChars, opts?) → number   (pure)
 *   linesFromSeq(seq, charsPerLine)    → array    (pure)
 *
 * Pure helpers are unit-tested. measureCharPx is exercised through K6
 * integration tests where happy-dom provides a deterministic font metric.
 */

/** Default monospace stack used by the SVG overlay AND HTML strand rows. */
export const SEQUENCE_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Measure the rendered width (in pixels) of a single monospace character
 * inside a DOM container. Inserts a hidden probe span, reads its bounding
 * rect, divides by sample length, then removes the probe.
 *
 * @param {HTMLElement|null} host — element we will render strands inside
 * @param {string} [fontFamily] — overrides SEQUENCE_FONT_FAMILY for tests
 * @returns {number} character width in CSS pixels (0 if host is missing or
 *                   has zero clientWidth — caller must skip layout in that
 *                   case to avoid divide-by-zero loops).
 */
export function measureCharPx(host, fontFamily = SEQUENCE_FONT_FAMILY) {
  if (!host || typeof host.getBoundingClientRect !== "function") return 0;
  if (!host.clientWidth) return 0;
  const probe = host.ownerDocument.createElement("span");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;font:inherit;left:-9999px;top:-9999px";
  probe.style.fontFamily = fontFamily;
  probe.textContent = "0".repeat(100);
  host.appendChild(probe);
  let chW = 0;
  try {
    chW = probe.getBoundingClientRect().width / 100;
  } finally {
    host.removeChild(probe);
  }
  if (!Number.isFinite(chW) || chW <= 0) return 0;
  return chW;
}

/**
 * Snap a raw "chars that fit" estimate to the rendering grid:
 *  - clamp to [minChars, maxChars] (default [30, 200])
 *  - round DOWN to the nearest multiple of `snap` (default 10) so that
 *    line-end position labels land on visually predictable boundaries.
 *
 * Returns minChars if rawChars is non-finite or below the floor; never
 * returns 0 (callers always render at least one row).
 *
 * @param {number} rawChars
 * @param {{ minChars?: number, maxChars?: number, snap?: number }} [opts]
 */
export function clampCharsPerLine(rawChars, opts = {}) {
  const { minChars = 30, maxChars = 200, snap = 10 } = opts;
  if (typeof rawChars !== "number" || Number.isNaN(rawChars)) return minChars;
  if (rawChars === Infinity) return maxChars;
  if (rawChars === -Infinity) return minChars;
  const snapped = Math.floor(rawChars / snap) * snap;
  if (snapped < minChars) return minChars;
  if (snapped > maxChars) return maxChars;
  return snapped;
}

/**
 * Slice a sequence into fixed-width lines.
 *
 * Returns an array of `{ start, seq }` rows where `start` is the absolute
 * 0-based index inside the original sequence and `seq` is the substring
 * of length `charsPerLine` (the trailing row may be shorter).
 *
 * Empty / nullish input returns []. charsPerLine must be ≥ 1; the helper
 * floors to 1 silently to keep render code defensive.
 *
 * @param {string} seq
 * @param {number} charsPerLine
 * @returns {Array<{ start: number, seq: string }>}
 */
export function linesFromSeq(seq, charsPerLine) {
  if (!seq) return [];
  const cpl = Math.max(1, Math.floor(charsPerLine || 0));
  const rows = [];
  for (let i = 0; i < seq.length; i += cpl) {
    rows.push({ start: i, seq: seq.slice(i, i + cpl) });
  }
  return rows;
}
