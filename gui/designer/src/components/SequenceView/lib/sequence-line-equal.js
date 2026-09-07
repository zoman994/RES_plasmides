/**
 * sequence-line-equal.js — custom React.memo comparator for SequenceLine
 * (PERF-6). A one-base sequence edit gives `fullSeq` (and every array derived
 * from it: features / orfRanges / reSites / framesResolution / the line slices /
 * seqLength) a NEW identity, so the default shallow memo breaks on EVERY line →
 * the whole viewer re-renders per keystroke (typing lag in assembly mode + align
 * reference editing).
 *
 * This comparator lets a line BAIL when its own rendered content is unchanged:
 *   - every prop NOT in RELAXED is compared by Object.is (so a real change to any
 *     of the ~34 other props is never missed — safety by default);
 *   - the RELAXED props are compared by their LINE-RELEVANT content only:
 *       line          — value (covers start / seq / kind / wrap fields);
 *       fullSeq       — a windowed slice [start-K, end+K] (codons straddle a line
 *                       boundary by ≤2 bases → K=3 with margin);
 *       seqLength     — only matters for the wrap-bridge row (line.wrapsOrigin);
 *       features      — entries OVERLAPPING the line, by value;
 *       primerOccurrences — projected sites whose binding or 5′ tail paints
 *                       the line;
 *       orfRanges     — entries overlapping the line, by value;
 *       reSites       — entries near the line (±margin for distal Type IIS cuts);
 *       framesResolution — the frame DECISION (strategy + dominant), ignoring the
 *                       `coverage` float that drifts on every indel without
 *                       changing what the AA track renders.
 *
 * Correctness is pinned by an empirical equivalence test (sequence-line-memo
 * .test.jsx): for every edit scenario the memoised re-render DOM must equal a
 * fresh render of the edited sequence. If a relaxed comparison is ever too loose
 * the DOM diverges and the test fails — so the test, not this reasoning, is the
 * guarantee.
 */

const K = 3; // fullSeq context window each side (codon straddle ≤ 2 + margin)
const RE_MARGIN = 24; // RE-site distal cut / marker reach

const RELAXED = new Set([
  'line', 'fullSeq', 'seqLength', 'features', 'primerOccurrences',
  'orfRanges', 'reSites', 'framesResolution',
]);

function sliceOf(s, a, b) {
  return typeof s === 'string' ? s.slice(a, b) : '';
}

// Shallow value-equality over the union of keys (flat objects only).
function shallowObjEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!Object.is(a[k], b[k])) return false;
  return true;
}

// Entries (features / orfRanges) overlapping [start-margin, end+margin), by value.
function overlapBySpanEqual(pa, na, start, end, margin) {
  if (pa === na) return true;
  const lo = start - margin;
  const hi = end + margin;
  const keep = (e) => e && Number.isFinite(e.start) && Number.isFinite(e.end)
    && e.end > lo && e.start < hi;
  const p = (Array.isArray(pa) ? pa : []).filter(keep);
  const n = (Array.isArray(na) ? na : []).filter(keep);
  return JSON.stringify(p) === JSON.stringify(n);
}

// RE sites are keyed by `position` (+ recognition length), not start/end.
function overlapByPositionEqual(pa, na, start, end, margin, wrapsOrigin) {
  if (pa === na) return true;
  if (wrapsOrigin) return JSON.stringify(pa || []) === JSON.stringify(na || []);
  const lo = start - margin;
  const hi = end + margin;
  const keep = (e) => {
    if (!e) return false;
    if (Number.isFinite(e.position) && e.position >= lo && e.position <= hi) return true;
    const occurrence = e.occurrence;
    if (!occurrence) return false;
    const segments = occurrence.recognition?.segments || [];
    if (segments.some((segment) => spanOverlapsLine(
      segment?.start, segment?.end, lo, hi,
    ))) return true;
    return [occurrence.topCut, occurrence.bottomCut].some(
      (cut) => Number.isFinite(cut) && cut >= lo && cut <= hi,
    );
  };
  const p = (Array.isArray(pa) ? pa : []).filter(keep);
  const n = (Array.isArray(na) ? na : []).filter(keep);
  return JSON.stringify(p) === JSON.stringify(n);
}

function spanOverlapsLine(spanStart, spanEnd, lineStart, lineEnd) {
  return Number.isFinite(spanStart) && Number.isFinite(spanEnd)
    && spanEnd > lineStart && spanStart < lineEnd;
}

function primerOccurrencePaintsLine(occurrence, start, end, circular, seqLength) {
  const segments = Array.isArray(occurrence?.segments) ? occurrence.segments : [];
  if (segments.some((segment) => spanOverlapsLine(
    segment?.start, segment?.end, start, end,
  ))) return true;

  const tail = typeof occurrence?.tail === 'string'
    ? occurrence.tail
    : (typeof occurrence?.tailSequence === 'string' ? occurrence.tailSequence : '');
  if (!tail.length || segments.length === 0) return false;

  // Match PrimerTrack's physical 5′ boundary: the first genomic segment for a
  // forward occurrence and the last one for a reverse occurrence. The tail can
  // therefore paint the adjacent line even when no binding segment does.
  const reverse = occurrence.strand === -1;
  const boundarySegment = reverse ? segments[segments.length - 1] : segments[0];
  if (!Number.isFinite(boundarySegment?.start) || !Number.isFinite(boundarySegment?.end)) {
    return false;
  }

  const rawStart = reverse ? boundarySegment.end : boundarySegment.start - tail.length;
  const rawEnd = reverse ? boundarySegment.end + tail.length : boundarySegment.start;
  const moleculeLength = Number.isFinite(seqLength) && seqLength > 0 ? seqLength : null;
  const clippedStart = reverse ? rawStart : Math.max(0, rawStart);
  const clippedEnd = reverse && moleculeLength ? Math.min(moleculeLength, rawEnd) : rawEnd;
  if (spanOverlapsLine(clippedStart, clippedEnd, start, end)) return true;

  if (!circular || !moleculeLength) return false;
  // A tail at either physical edge continues at the opposite end. Very long
  // tails cover every line; this conservative branch also avoids modulo losing
  // a complete lap.
  if (tail.length >= moleculeLength) return true;
  if (!reverse && rawStart < 0) {
    return spanOverlapsLine(moleculeLength + rawStart, moleculeLength, start, end);
  }
  if (reverse && rawEnd > moleculeLength) {
    return spanOverlapsLine(0, rawEnd - moleculeLength, start, end);
  }
  return false;
}

function primerOccurrencesEqual(pa, na, start, end, wrapsOrigin, circular, seqLength) {
  if (pa === na) return true;
  // A bridge row also renders the plasmid-start half. It is only one row, so a
  // full value comparison is safer than duplicating wrap geometry here.
  if (wrapsOrigin) return JSON.stringify(pa || []) === JSON.stringify(na || []);
  const keep = (occurrence) => primerOccurrencePaintsLine(
    occurrence, start, end, circular, seqLength,
  );
  const p = (Array.isArray(pa) ? pa : []).filter(keep);
  const n = (Array.isArray(na) ? na : []).filter(keep);
  return JSON.stringify(p) === JSON.stringify(n);
}

function framesEqual(p, n) {
  if (p === n) return true;
  if (!p || !n) return false;
  // Only the render-affecting parts: strategy + the dominant region (coords +
  // identity). `coverage` is a float that shifts on every indel but only feeds
  // the strategy decision, so it never independently changes the rendered AA.
  return p.strategy === n.strategy && JSON.stringify(p.dominant) === JSON.stringify(n.dominant);
}

export function sequenceLineEqual(prev, next) {
  const ln = next.line || {};
  const start = ln.start || 0;
  const len = (ln.seq && ln.seq.length) || 0;
  const end = start + len;

  // 1) Object.is on every NON-relaxed prop (union of keys → no prop missed).
  const keys = new Set(Object.keys(prev));
  for (const k of Object.keys(next)) keys.add(k);
  for (const k of keys) {
    if (RELAXED.has(k)) continue;
    if (!Object.is(prev[k], next[k])) return false;
  }

  // 2) Relaxed, line-relevant comparisons.
  if (prev.line !== next.line && !shallowObjEqual(prev.line, next.line)) return false;

  if (prev.fullSeq !== next.fullSeq) {
    const a = Math.max(0, start - K);
    const b = end + K;
    if (sliceOf(prev.fullSeq, a, b) !== sliceOf(next.fullSeq, a, b)) return false;
  }

  // seqLength only affects the wrap-bridge row's geometry; elsewhere irrelevant.
  if (!Object.is(prev.seqLength, next.seqLength) && (ln.wrapsOrigin || (prev.line || {}).wrapsOrigin)) {
    return false;
  }

  if (!overlapBySpanEqual(prev.features, next.features, start, end, 0)) return false;
  if (!overlapBySpanEqual(prev.orfRanges, next.orfRanges, start, end, 0)) return false;
  if (!overlapByPositionEqual(
    prev.reSites,
    next.reSites,
    start,
    end,
    RE_MARGIN,
    ln.wrapsOrigin || (prev.line || {}).wrapsOrigin,
  )) return false;
  if (!primerOccurrencesEqual(
    prev.primerOccurrences,
    next.primerOccurrences,
    start,
    end,
    ln.wrapsOrigin || (prev.line || {}).wrapsOrigin,
    next.circular,
    next.seqLength,
  )) return false;
  if (!framesEqual(prev.framesResolution, next.framesResolution)) return false;

  return true;
}
