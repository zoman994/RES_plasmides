/**
 * nav-target — bridge a SearchOccurrence location to the sequence view's jump API
 * (P3). Coordinates are 0-based half-open [start,end) throughout (the whole
 * SequenceView subsystem's convention). Pure.
 *
 * A circular hit has TWO segments (…origin]+[0…). SelectionOverlay paints one
 * contiguous caret range, so the caret selects the PRIMARY (first) segment and
 * scrolls there; SearchHitsOverlay can show disjoint rects, so ALL segments are
 * emitted as overlay hits.
 */

function normStrand(strand) {
  return strand === '-' || strand === -1 ? -1 : 1;
}

/**
 * @param {{ segments:{start,end}[], strand?:string|number, wrapsOrigin?:boolean }} location
 * @returns {{ caret:{start,end}, scrollPos:number, segments:Array, strand:number, wrapsOrigin:boolean }|null}
 */
export function navFromLocation(location) {
  const segments = location && Array.isArray(location.segments) ? location.segments : [];
  if (!segments.length) return null;
  const first = segments[0];
  return {
    caret: { start: first.start, end: first.end },
    scrollPos: first.start,
    segments,
    strand: normStrand(location.strand),
    wrapsOrigin: !!location.wrapsOrigin,
  };
}

/**
 * Overlay rects for SearchHitsOverlay (one per segment). Uses identity for the
 * colour, or compatibility when identity is null (IUPAC). Mismatch ticks go on the
 * first rect only (per-segment mismatch splitting isn't worth the complexity).
 * @returns {Array<{ targetStart, targetEnd, identity, queryIdentity, strand, mismatchPositions }>}
 */
export function overlayHitsFromLocation(location, metrics) {
  const segments = location && Array.isArray(location.segments) ? location.segments : [];
  const strand = normStrand(location && location.strand);
  const identity = metrics ? (metrics.identity ?? metrics.compatibility ?? null) : null;
  return segments.map((s, i) => ({
    targetStart: s.start,
    targetEnd: s.end,
    identity,
    queryIdentity: identity,
    strand,
    mismatchPositions: i === 0 && metrics ? (metrics.mismatchPositions || []) : [],
  }));
}
