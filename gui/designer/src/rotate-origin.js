/**
 * rotate-origin.js — physical rotation of a circular plasmid sequence to a new
 * origin position 1, with annotation coordinate remap.
 *
 * Used by ImportStartScreen MetaColumn when biologist sets `originOffset` and
 * presses «↻ применить» before "На канвас" / "В библиотеку" / "Аннотировать".
 *
 * After rotation downstream consumers (PlasmidMap, primer design, restriction
 * digest, mutagenesis split) all see canonical coordinates from position 1 —
 * no runtime offset shift needed elsewhere.
 *
 * Wrap policy (ANN-0A, supersedes the pre-BG-028 split): an annotation that
 * crosses the cut point stays ONE annotation and gains a two-segment canonical
 * location `[start, length)` + `[0, end)`. It keeps its `id`, so `regionId`
 * child links, selection state and version history survive the rotation. The
 * previous behaviour minted `{id}_part1` / `{id}_part2`, which duplicated the
 * feature and orphaned every child that pointed at the original id.
 */
import {
  LOCATION_KINDS,
  makeLocation,
  getSegments,
  locationSpan,
} from './lib/annotation-location';

/**
 * Rotate a circular sequence so that 1-indexed position `newOriginPos` becomes
 * the new position 1. Linear sequences are returned untouched.
 *
 * @param {string} sequence
 * @param {Array<Object>} annotations
 * @param {number} newOriginPos1Indexed — new origin (1-indexed); pos 1 = no-op
 * @param {{ topology?: 'circular' | 'linear' }} [opts]
 * @returns {{ sequence: string, annotations: Array<Object> }}
 */
export function rotateOriginToPosition(sequence, annotations, newOriginPos1Indexed, opts = {}) {
  const topology = opts.topology || 'circular';
  const length = sequence?.length || 0;

  if (topology !== 'circular' || !length || newOriginPos1Indexed === 1 || newOriginPos1Indexed == null) {
    return { sequence: sequence || '', annotations: [...(annotations || [])] };
  }

  const k = ((newOriginPos1Indexed - 1) % length + length) % length; // 0-indexed cut point
  if (k === 0) return { sequence, annotations: [...(annotations || [])] };

  const rotated = sequence.slice(k) + sequence.slice(0, k);

  /** Shift one segment into the rotated frame, splitting it if it spans the cut. */
  function shiftSegment(seg) {
    const { start, end } = seg;
    if (start >= k) return [{ start: start - k, end: end - k }];
    if (end <= k) return [{ start: start - k + length, end: end - k + length }];
    // Straddles the cut → the high-coordinate piece comes first in 5′→3′ order.
    return [
      { start: start - k + length, end: length },
      { start: 0, end: end - k },
    ];
  }

  const newAnnotations = [];
  for (const ann of annotations || []) {
    const segs = getSegments(ann).filter((s) => s.end > s.start);
    if (segs.length === 0) {
      newAnnotations.push({ ...ann });
      continue;
    }

    const moved = segs.flatMap(shiftSegment);
    // Re-anchor only — the biological order of the parts is preserved by the
    // shift itself and must never be re-sorted.
    const ordered = reorderForOrigin(moved);
    const kind = ordered.length > 1
      ? (ann.location?.kind === LOCATION_KINDS.ORDER ? LOCATION_KINDS.ORDER : LOCATION_KINDS.JOIN)
      : LOCATION_KINDS.SINGLE;
    const location = makeLocation(kind, ordered);
    const span = locationSpan({ location });
    newAnnotations.push({ ...ann, location, start: span.start, end: span.end });
  }

  return { sequence: rotated, annotations: newAnnotations };
}

/**
 * Re-anchor segments after a rotation WITHOUT re-sorting them.
 *
 * Rotation is a rigid shift: the biological order of the parts never changes,
 * only where the list is cut. Sorting by `start` destroyed that order — a
 * linear `join([100,150), [200,250))` rotated past its own gap came back as
 * `[25,75) → [925,975)`, i.e. the feature read backwards.
 *
 * The shift maps the segment list onto a circle; the only work left is to
 * choose which segment starts the list, so there is at most one high→low
 * transition. That is the segment right after the largest forward jump in the
 * cyclic sequence.
 */
function reorderForOrigin(segments) {
  const segs = [...segments];
  if (segs.length < 2) return segs;

  // Already a valid traversal order (0 or 1 descent) → leave it exactly as is.
  let descents = 0;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].start < segs[i - 1].start) descents += 1;
  }
  if (descents <= 1) return segs;

  // More than one descent can only mean the list is rotated relative to its
  // canonical start. Rotate it (never sort it) so the single crossing is the
  // one between the last and first element.
  for (let offset = 1; offset < segs.length; offset++) {
    const candidate = segs.slice(offset).concat(segs.slice(0, offset));
    let d = 0;
    for (let i = 1; i < candidate.length; i++) {
      if (candidate[i].start < candidate[i - 1].start) d += 1;
    }
    if (d <= 1) return candidate;
  }
  return segs;
}
