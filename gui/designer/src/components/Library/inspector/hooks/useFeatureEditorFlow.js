import { useCallback, useState } from 'react';
import {
  applyAnnotationEdit,
  mergeAnnotations,
  generateAnnotationId,
} from '../../../../lib/annotation-edit.js';

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
    // Round-18 (06.05.2026 biolog: «фича не применяется если на неё
    // зайти с вкладки сиквенс и нажать два раза и сказать сейф»).
    // Predicted (ghost) features have a synthetic id that does NOT
    // exist in editedAnnotations (predictions live in
    // annotator.results, not in the confirmed array). The original
    // `update` op was a silent no-op — updateAnnotation returns the
    // same array when id-match fails. Detect «not in confirmed
    // array» and convert the save into CREATE so the predicted
    // ghost gets promoted to a confirmed annotation; the dedup
    // pipeline (PreviewTab merge / showDuplicates filter) then hides
    // the ghost since a confirmed sibling now covers the same span.
    const existsConfirmed = baseAnnotations.some(
      (a) => a && a.id === parentId,
    );

    let next;
    try {
      if (existsConfirmed) {
        next = applyAnnotationEdit(
          baseAnnotations,
          { kind: 'update', id: parentId, patch },
          (item?.sequence || '').length,
        );
      } else {
        // CREATE path for predicted-feature save. Merge feature's
        // own fields with the patch — name/type/start/end/strand
        // come from the modal, the rest (level, color, source,
        // description) inherit from the prediction so the biolog
        // doesn't lose context.
        next = applyAnnotationEdit(
          baseAnnotations,
          {
            kind: 'create',
            payload: {
              ...featureUnderEdit,
              ...patch,
              level: 'region',
              // Strip prediction marks so the new entry renders
              // solid (not dashed/italic) and the dedup heuristic
              // suppresses the original ghost.
              predicted: false,
              confidence: undefined,
            },
          },
          (item?.sequence || '').length,
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SingleInspector] feature save failed:', err.message);
      return;
    }
    const updatedParent = next.find((a) => a.id === (patch.id || parentId))
      || next.find((a) => a.start === patch.start && a.end === patch.end);
    const finalParentId = updatedParent ? updatedParent.id : parentId;

    const withoutOldDetails = next.filter(
      (a) => !(a.level === 'detail' && a.regionId === parentId),
    );
    const newDetails = (subFeatures || [])
      .filter((sf) => Number.isFinite(sf.start) && Number.isFinite(sf.end) && sf.end > sf.start)
      .map((sf) => {
        const det = {
          name: (sf.name || 'sub').trim() || 'sub',
          type: sf.type || 'misc_feature',
          start: Math.max(0, sf.start | 0),
          end: Math.max(1, sf.end | 0),
          strand: sf.strand === -1 ? -1 : 1,
          level: 'detail',
          regionId: finalParentId,
        };
        if (sf.color) det.color = sf.color;
        det.id = sf.id || generateAnnotationId(det);
        return det;
      });
    const composite = [...withoutOldDetails, ...newDetails];
    applyOp(composite);
    closeFeatureEditor();
  }, [featureUnderEdit, item, edits, applyOp, closeFeatureEditor]);

  const onFeatureMerge = useCallback((neighbourId) => {
    if (!featureUnderEdit) return;
    const baseAnnotations = Array.isArray(edits?.editedAnnotations)
      ? edits.editedAnnotations
      : (item?.annotations || []);
    const next = mergeAnnotations(baseAnnotations, featureUnderEdit.id, neighbourId);
    applyOp(next);
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
