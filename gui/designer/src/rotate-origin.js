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
 * Wrap policy: annotations that cross the cut point are split into two
 * separate annotations sharing an `id`-prefix (`{id}_part1`, `{id}_part2`)
 * with identical name / type / strand / level. Reason: project-wide
 * `getRegions(annotations)` and downstream renderers (PlasmidMap, SequencePane,
 * AnnotationEditor) iterate flat annotation arrays — none currently understand
 * a `wrapped: true` + `parts: [...]` shape.
 */

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

  const newAnnotations = [];
  for (const ann of annotations || []) {
    const start0 = Number(ann.start) || 0; // model uses 0-indexed half-open [start, end)
    const end0 = Number(ann.end) || 0;
    if (end0 <= start0) {
      newAnnotations.push({ ...ann });
      continue;
    }

    if (start0 >= k) {
      newAnnotations.push({ ...ann, start: start0 - k, end: end0 - k });
    } else if (end0 <= k) {
      newAnnotations.push({ ...ann, start: start0 - k + length, end: end0 - k + length });
    } else {
      // Crosses the cut — split into two annotations sharing an id-prefix.
      const baseId = ann.id ? String(ann.id) : `ann_${start0}_${end0}`;
      newAnnotations.push({
        ...ann,
        id: `${baseId}_part1`,
        start: start0 - k + length,
        end: length,
      });
      newAnnotations.push({
        ...ann,
        id: `${baseId}_part2`,
        start: 0,
        end: end0 - k,
      });
    }
  }

  return { sequence: rotated, annotations: newAnnotations };
}
