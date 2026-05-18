/**
 * segment-annotation-transfer — copy a source container's annotations
 * onto an assembly segment at insert time (A1, merge: G1 in-scope).
 *
 * Frozen snapshot: transfer happens once at insert / range-change / RC;
 * later parent edits do NOT propagate (DEC-CANVAS-ASM frozen semantics).
 *
 * COORDINATE CONTRACT (annotation-contract skill):
 *  - annotation.start / .end are **1-based inclusive** (GenBank std).
 *  - the segment range `[rangeStart, rangeEnd)` is **0-based half-open**
 *    in source-container coordinates (DEC-PARSER-COORD-01).
 * Conversion happens here, explicitly, once.
 *
 * Output annotations: segment-local 1-based inclusive coords, `level`
 * preserved, fresh deterministic `id` (project helper, not a new dep),
 * `origin` provenance for future refresh.
 */
import { reverseComplement } from '../../../sequence-utils';
import { generateAnnotationId } from '../../../lib/annotation-edit';

/**
 * @param {Array} parentAnnotations source container annotations (1-based incl)
 * @param {number} rangeStart 0-based inclusive segment start on parent
 * @param {number} rangeEnd   0-based exclusive segment end on parent
 * @param {boolean} rc        segment taken reverse-complemented
 * @param {string=} sourceContainerId provenance
 * @returns {Array} segment-local annotations (1-based incl)
 */
export function transferAnnotations(parentAnnotations, rangeStart, rangeEnd, rc, sourceContainerId) {
  if (!Array.isArray(parentAnnotations) || parentAnnotations.length === 0) return [];
  const start = Math.max(0, Math.min(rangeStart, rangeEnd));
  const end = Math.max(rangeStart, rangeEnd);
  const segLen = end - start;
  if (segLen <= 0) return [];

  const out = [];
  for (const a of parentAnnotations) {
    if (!a || typeof a.start !== 'number' || typeof a.end !== 'number') continue;
    // parent 1-based incl [aStart,aEnd] → 0-based half-open [a0, a1)
    const a0 = a.start - 1;
    const a1 = a.end;
    if (!(a0 < end && a1 > start)) continue; // no overlap with segment window

    // clip to segment, shift to segment-local 0-based, then → 1-based incl
    const lo0 = Math.max(a0, start) - start;
    const hi0 = Math.min(a1, end) - start;
    if (hi0 <= lo0) continue;
    let localStart = lo0 + 1;
    let localEnd = hi0;
    let strand = a.strand === -1 ? -1 : 1;

    if (rc) {
      const ns = segLen - localEnd + 1;
      const ne = segLen - localStart + 1;
      localStart = ns;
      localEnd = ne;
      strand = strand === 1 ? -1 : 1;
    }

    const next = {
      ...a,
      start: localStart,
      end: localEnd,
      strand,
      level: a.level || 'region',
      origin: { type: 'transferred', sourceContainerId, sourceAnnotationId: a.id },
    };
    next.id = generateAnnotationId({
      start: next.start, end: next.end, type: next.type, name: next.name,
    });
    out.push(next);
  }
  return out;
}
