import { useCallback, useMemo } from 'react';
import { applyAnnotationEdit } from '../../../../lib/annotation-edit.js';
import { getRegions } from '../../../../annotation-model';
import { findDominatedRegions } from '../../../../lib/plasmid-mini-map-geometry';
import { isCompound } from '../../../../lib/annotation-location';

/**
 * useAnnotationDedupe — B1-ui shared «Убрать дубли» affordance.
 *
 * Used by BOTH the Library inspector and the Container editor so «remove
 * redundant overlapping annotations» behaves identically wherever a document is
 * edited. A generic region covered ~identically by a higher-priority one (e.g. a
 * bla(M) marker under the AmpR CDS) is detected by the existing SCALAR detector
 * (`findDominatedRegions`) and removed through the CASCADE-safe core delete path,
 * so a dominated parent takes its children with it and never orphans a link.
 *
 * Fail-closed while the detector is scalar: a compound / origin-crossing
 * candidate is skipped entirely (never counted, never removed), because its
 * bounding span would misrepresent the real geometry. The survivor's rich data
 * is preserved untouched — deletion only removes the dominated entries.
 *
 * @param {Object[]} annotations — the current document's annotation array
 * @param {number}   length      — current sequence length (4th-arg descriptor)
 * @param {string}   topology    — 'linear' | 'circular'
 * @param {(next: Object[]) => void} applyOp — whole-array replacement sink
 * @returns {{ duplicateCount: number, dominatedIds: Set<string>, onRemoveDuplicates: () => void }}
 */
export function useAnnotationDedupe({ annotations, length = 0, topology = 'linear', applyOp }) {
  const dominatedIds = useMemo(() => {
    // Skip compound/origin-crossing candidates fail-closed: the scalar detector
    // must never judge (or remove) a feature whose span it cannot represent.
    const regions = getRegions(annotations).filter((r) => !isCompound(r));
    return new Set(findDominatedRegions(regions).map((r) => r.id));
  }, [annotations]);

  const onRemoveDuplicates = useCallback(() => {
    if (typeof applyOp !== 'function' || dominatedIds.size === 0) return;
    const base = Array.isArray(annotations) ? annotations : [];
    const doc = { length, topology };
    let next = base;
    for (const id of dominatedIds) {
      // Core delete cascades to the dominated region's children — no orphans.
      next = applyAnnotationEdit(next, { kind: 'delete', id }, length, doc);
    }
    if (next !== base && next.length !== base.length) applyOp(next);
  }, [annotations, dominatedIds, length, topology, applyOp]);

  return { duplicateCount: dominatedIds.size, dominatedIds, onRemoveDuplicates };
}
