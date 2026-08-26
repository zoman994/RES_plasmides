/**
 * primer-site-geometry.js — where a projected primer site is DRAWN (ANN-0L).
 *
 * Split out of the map components on purpose. PlasmidMapV2 and LinearMapV2 are
 * both already in the `.jsx` soft zone, and — more to the point — the two rules
 * below are the ones that are easy to get quietly wrong:
 *
 *   * an origin-crossing site is two drawn shapes but ONE logical binding, so
 *     the geometry maps segments, never a single start/end pair;
 *   * a 5' tail hangs off the 5' anchor and never lengthens the genomic span.
 *     Forward anchors at the site start, reverse at the site end. Getting this
 *     backwards silently moves a primer by the length of its overhang.
 *
 * Pure: no React, no SVG strings, no knowledge of either host's units.
 */

const TAU = Math.PI * 2;

/**
 * Angular span of one segment on a circular map.
 *
 * @param {{start:number,end:number}} seg  0-based half-open bp
 * @param {number} total                   molecule length in bp
 * @returns {{a0:number, a1:number}} radians from the 12-o'clock origin
 */
export function segmentAngles(seg, total) {
  const len = total || 1;
  return {
    a0: (seg.start / len) * TAU,
    a1: (seg.end / len) * TAU,
  };
}

/**
 * The 5' anchor of an occurrence, in bp.
 *
 * A forward primer runs 5'→3' along the top strand, so its 5' end sits at the
 * START of the first segment. A reverse primer runs the other way, so its 5'
 * end sits at the END of the last segment. A site with no known strand has no
 * defensible anchor and reports `null` rather than guessing forward.
 *
 * @param {{segments:Array<{start:number,end:number}>, strand:(1|-1|null)}} occ
 * @returns {{bp:number, strand:(1|-1)}|null}
 */
export function fivePrimeAnchor(occ) {
  const segs = occ?.segments;
  if (!Array.isArray(segs) || segs.length === 0) return null;
  if (occ.strand !== 1 && occ.strand !== -1) return null;
  return occ.strand === -1
    ? { bp: segs[segs.length - 1].end, strand: -1 }
    : { bp: segs[0].start, strand: 1 };
}

/**
 * The tail's span in BASE PAIRS, for a host that draws by sequence coordinate
 * (the circular map asks for an arc path, not a rectangle).
 *
 * The overhang does not anneal, so it has no genomic coordinates of its own.
 * It is drawn adjacent to the 5' anchor, its own length long, so the reader
 * sees how much extra sequence the oligo carries and on which end - never
 * inside the span the primer actually binds. On a circular molecule the span
 * may itself run past the origin, in which case it comes back as two pieces.
 *
 * @returns {Array<{start:number,end:number}>} empty when there is nothing to draw
 */
export function tailSpans(occ, length, circular) {
  if (!occ?.tail || !Number.isFinite(length) || length <= 0) return [];
  const anchor = fivePrimeAnchor(occ);
  if (!anchor) return [];
  const len = Math.min(occ.tail.length, length);
  if (len <= 0) return [];

  // forward: the tail precedes the binding; reverse: it follows it
  const rawStart = anchor.strand === -1 ? anchor.bp : anchor.bp - len;
  if (!circular) {
    const start = Math.max(0, rawStart);
    const end = Math.min(length, rawStart + len);
    return end > start ? [{ start, end }] : [];
  }
  const start = ((rawStart % length) + length) % length;
  const end = start + len;
  return end <= length
    ? [{ start, end }]
    : [{ start, end: length }, { start: 0, end: end - length }];
}

/**
 * Placement of the tail glyph on a linear map, in the host's x units.
 *
 * Returns null when there is nothing to draw: no proven tail (`null` unknown or
 * `''` proven absent), or no anchor. The returned box lies strictly OUTSIDE the
 * genomic span — a tail is not template-derived and must never be readable as
 * coordinates on the molecule.
 *
 * @param {object} occ            projected occurrence
 * @param {(bp:number)=>number} toX
 * @param {number} tailPx         width of the tail glyph
 * @returns {{x:number, width:number}|null}
 */
export function tailBox(occ, toX, tailPx) {
  if (!occ?.tail || typeof toX !== 'function') return null;
  const anchor = fivePrimeAnchor(occ);
  if (!anchor) return null;
  const at = toX(anchor.bp);
  // Forward: the tail precedes the span. Reverse: it follows it. Either way it
  // starts where the genomic footprint ends, never inside it.
  return anchor.strand === -1
    ? { x: at, width: tailPx }
    : { x: at - tailPx, width: tailPx };
}
