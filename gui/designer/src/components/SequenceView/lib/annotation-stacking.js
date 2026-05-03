/**
 * lib/annotation-stacking.js — multi-row greedy-pack stacker for the
 * AnnotationTrack (Sprint M-B.3, K3 / DEC-SQV-03).
 *
 * Closes Bug 2 from the M-B.3 pre-acceptance review: previously the
 * SequenceMapView wrote every region into a per-position `annMap[k] = f`
 * and the LAST iterated feature won, so promoter+RBS+CDS+tag stacks
 * collapsed to a single visible feature. Here we pack overlapping
 * features into multiple parallel rows the way SnapGene does.
 *
 * Algorithm:
 *   1. Filter regions intersecting [lineStart, lineEnd).
 *   2. Sort by .start ascending (ties → broader first).
 *   3. Greedy-pack: place each region into the LOWEST row index
 *      whose `lastEnd[row] <= region.start`.
 *   4. If row index would exceed MAX_VISIBLE_ROWS — push to overflow bin.
 *
 * Output shape:
 *   {
 *     rows: Array<Array<RegionWithRow>>,   // length <= MAX_VISIBLE_ROWS
 *     overflow: Array<Region>,             // not rendered as track rows
 *     visibleCount: number,
 *     overflowCount: number,
 *   }
 *
 * Each RegionWithRow = original region + { row: number }. Coordinates
 * are kept ABSOLUTE (lineStart-relative slicing happens in the
 * AnnotationTrack render pass, since a feature can span multiple lines).
 */

export const MAX_VISIBLE_ROWS = 4;

/**
 * @param {Array<{ start: number, end: number, [k: string]: any }>} regions
 * @param {number} lineStart — inclusive
 * @param {number} lineEnd — exclusive
 * @param {{ maxRows?: number }} [opts]
 */
export function stackAnnotations(regions, lineStart, lineEnd, opts = {}) {
  const maxRows = Math.max(1, opts.maxRows || MAX_VISIBLE_ROWS);
  if (!Array.isArray(regions) || regions.length === 0) {
    return { rows: [], overflow: [], visibleCount: 0, overflowCount: 0 };
  }

  // Filter to regions touching this line — keep ABSOLUTE coordinates so the
  // caller can decide where to draw caps when a region extends past either
  // edge.
  const onLine = regions.filter(
    (r) =>
      typeof r.start === "number" &&
      typeof r.end === "number" &&
      r.end > lineStart &&
      r.start < lineEnd,
  );

  // Sort by start asc, broader features first on ties → produces a more
  // visually-stable layout when two regions begin at the same position.
  // Packing happens in this order to preserve the tightest greedy fit;
  // visual hierarchy (shortest on top, longest at the bottom of the
  // stack) is reapplied via a final row reorder pass below.
  onLine.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const rows = [];
  const lastEnd = []; // lastEnd[i] = exclusive end of the latest region on row i
  const overflow = [];

  for (const region of onLine) {
    let placed = false;
    for (let i = 0; i < rows.length; i++) {
      if (lastEnd[i] <= region.start) {
        rows[i].push({ ...region, row: i });
        lastEnd[i] = region.end;
        placed = true;
        break;
      }
    }
    if (!placed) {
      if (rows.length < maxRows) {
        const i = rows.length;
        rows.push([{ ...region, row: i }]);
        lastEnd.push(region.end);
      } else {
        overflow.push(region);
      }
    }
  }

  // Final pass: reorder rows by max-region-length DESCENDING so that
  // the LONGEST feature sits at the TOP of the stack (closest to the
  // DNA strand ABOVE — DNA-first layout 03.05.2026 evening) and
  // SHORTER sub-features (tag / RBS / signal peptide) layer BELOW
  // their broad parent (CDS / backbone). Was ascending pre-03.05.2026
  // when annotations rendered above DNA; flipped together with the
  // track reorder per biolog feedback: «сначала длинные фичи а потом
  // короткие (сверху вниз)». Within a row, region order is preserved
  // (left-to-right by start).
  rows.sort((rowA, rowB) => {
    const maxA = rowA.reduce((m, r) => Math.max(m, r.end - r.start), 0);
    const maxB = rowB.reduce((m, r) => Math.max(m, r.end - r.start), 0);
    return maxB - maxA;
  });
  // Re-stamp `row` property so each region carries its FINAL row index
  // post-reorder (consumers like AnnotationTrack rely on `region.row`
  // for SVG y-positioning).
  rows.forEach((row, i) => {
    for (const r of row) r.row = i;
  });

  return {
    rows,
    overflow,
    visibleCount: rows.reduce((n, row) => n + row.length, 0),
    overflowCount: overflow.length,
  };
}
