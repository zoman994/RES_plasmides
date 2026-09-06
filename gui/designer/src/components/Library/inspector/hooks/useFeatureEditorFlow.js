import { useCallback, useState } from 'react';
import {
  applyAnnotationEdit,
  mergeAnnotations,
} from '../../../../lib/annotation-edit.js';
import { getSegments } from '../../../../lib/annotation-location';

/**
 * Feature-editor flow for SingleInspector.
 *
 * Owns the FeatureEditorModal state (current region under edit) and
 * the four mutation paths the modal exposes:
 *   - save  (rename / type / coords / strand + sub-feature roster)
 *   - merge (with a neighbour by id)
 *   - delete
 *   - close (just dismiss)
 *
 * The hook delegates the actual annotation-array mutation to the
 * caller via two callbacks:
 *   - `applyOp(nextAnnotations)` — apply a whole-array replacement
 *     (push BEFORE state onto undo, then forward to onUpdateEdits)
 *   - `dispatchEdit(edit)` — fire a single applyAnnotationEdit op
 *     (used for delete; reuses the existing onAnnotationEditFromView
 *     path)
 *
 * Returns `{ featureUnderEdit, openFeatureEditor, closeFeatureEditor,
 * onFeatureSave, onFeatureMerge, onFeatureDelete }`.
 */
export function useFeatureEditorFlow({ item, edits, applyOp, dispatchEdit }) {
  const [featureUnderEdit, setFeatureUnderEdit] = useState(null);

  const openFeatureEditor = useCallback((region) => {
    setFeatureUnderEdit(region || null);
  }, []);
  const closeFeatureEditor = useCallback(() => {
    setFeatureUnderEdit(null);
  }, []);

  const onFeatureSave = useCallback(({ patch, subFeatures }) => {
    if (!featureUnderEdit) return;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const parentId = featureUnderEdit.id;
    // The document the edit belongs to. `item` is the coherent currentDocument
    // DTO (both hosts pass it), so its length + topology are authoritative. Every
    // applyAnnotationEdit call below passes this fourth argument — an origin
    // crossing is minted only on a circular molecule, never invented on linear.
    const seqLength = Number.isFinite(item?.length) ? item.length : (item?.sequence || '').length;
    const doc = { length: seqLength, topology: item?.topology || 'linear' };
    // Round-18 (06.05.2026 …) — a predicted (ghost) feature has a synthetic id
    // that is NOT in the confirmed array, so `update` would be a silent no-op.
    // Convert the save into a CREATE that promotes the ghost to a confirmed
    // annotation; the dedup pipeline then suppresses the original ghost.
    const existsConfirmed = baseAnnotations.some((a) => a && a.id === parentId);

    let next;
    try {
      if (existsConfirmed) {
        next = applyAnnotationEdit(
          baseAnnotations,
          { kind: 'update', id: parentId, patch },
          seqLength,
          doc,
        );
      } else {
        // CREATE path for a predicted-feature save. Inherit the prediction's own
        // fields (level, colour, source, description) and overlay the modal patch.
        const payload = {
          ...featureUnderEdit,
          ...patch,
          level: 'region',
          predicted: false,
          confidence: undefined,
        };
        // A canonical location owns the geometry — a stale scalar projection
        // beside it reads as an incoherent dual representation and is rejected.
        if (patch && patch.location) {
          delete payload.start;
          delete payload.end;
        }
        next = applyAnnotationEdit(baseAnnotations, { kind: 'create', payload }, seqLength, doc);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] feature save failed:', err.message);
      return;
    }
    const updatedParent = next.find((a) => a.id === (patch.id || parentId))
      || next.find((a) => a.start === patch.start && a.end === patch.end);
    const finalParentId = updatedParent ? updatedParent.id : parentId;

    // ANN-INTEGRITY seam 5 — reconcile the sub-feature roster through the
    // collision / cascade-safe CORE operations, never a hand-rebuilt array.
    // An existing child gets a core UPDATE overlaying only the modal-editable
    // fields, so identity, qualifiers, provenance, unknown fields AND a compound
    // child's canonical JOIN survive. A dropped child gets a core DELETE
    // (cascade-safe). A new child gets a core CREATE (opaque, collision-safe id).
    const existingDetails = next.filter(
      (a) => a && a.level === 'detail' && a.regionId === parentId && a.id != null,
    );
    const existingById = new Map(existingDetails.map((a) => [a.id, a]));
    const roster = (subFeatures || []).filter((sf) => {
      const stored = sf?.id != null ? existingById.get(sf.id) : null;
      if (stored && getSegments(stored).length > 1) return true;
      return Number.isFinite(sf?.start) && Number.isFinite(sf?.end) && sf.end > sf.start;
    });
    const rosterIds = new Set(roster.filter((sf) => sf.id != null).map((sf) => sf.id));

    let composite = next;
    try {
      for (const child of existingDetails) {
        if (!rosterIds.has(child.id)) {
          composite = applyAnnotationEdit(composite, { kind: 'delete', id: child.id }, seqLength, doc);
        }
      }
      for (const sf of roster) {
        const stored = sf.id != null ? existingById.get(sf.id) : null;
        if (stored) {
          const childPatch = {
            name: (sf.name || 'sub').trim() || 'sub',
            type: sf.type || stored.type || 'misc_feature',
            strand: sf.strand === -1 ? -1 : 1,
          };
          if (sf.color) childPatch.color = sf.color;
          // A compound child has no single scalar range — keep it metadata-only
          // so its canonical JOIN is never flattened. A scalar child carries its
          // (possibly edited) coordinates.
          if (getSegments(stored).length <= 1) {
            childPatch.start = Math.max(0, sf.start | 0);
            childPatch.end = Math.max(1, sf.end | 0);
          }
          composite = applyAnnotationEdit(
            composite, { kind: 'update', id: sf.id, patch: childPatch }, seqLength, doc,
          );
        } else {
          const payload = {
            name: (sf.name || 'sub').trim() || 'sub',
            type: sf.type || 'misc_feature',
            start: Math.max(0, sf.start | 0),
            end: Math.max(1, sf.end | 0),
            strand: sf.strand === -1 ? -1 : 1,
            level: 'detail',
            regionId: finalParentId,
          };
          if (sf.color) payload.color = sf.color;
          composite = applyAnnotationEdit(composite, { kind: 'create', payload }, seqLength, doc);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] sub-feature save failed:', err.message);
      return;
    }

    applyOp(composite);
    closeFeatureEditor();
  }, [featureUnderEdit, item, edits, applyOp, closeFeatureEditor]);

  const onFeatureMerge = useCallback((neighbourId) => {
    if (!featureUnderEdit) return false;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const seqLength = Number.isFinite(item?.length) ? item.length : (item?.sequence || '').length;
    const doc = { length: seqLength, topology: item?.topology || 'linear' };
    try {
      const next = mergeAnnotations(baseAnnotations, featureUnderEdit.id, neighbourId, doc);
      if (next === baseAnnotations) return false;
      applyOp(next);
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[FeatureEditor] merge rejected:', err.message);
      return false;
    }
  }, [featureUnderEdit, item, edits, applyOp]);

  const onFeatureDelete = useCallback(() => {
    if (!featureUnderEdit) return;
    dispatchEdit({ kind: 'delete', id: featureUnderEdit.id });
    closeFeatureEditor();
  }, [featureUnderEdit, dispatchEdit, closeFeatureEditor]);

  return {
    featureUnderEdit,
    openFeatureEditor,
    closeFeatureEditor,
    onFeatureSave,
    onFeatureMerge,
    onFeatureDelete,
  };
}
