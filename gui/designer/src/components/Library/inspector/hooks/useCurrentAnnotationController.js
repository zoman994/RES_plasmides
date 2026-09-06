import { useCallback, useRef } from 'react';
import { applyAnnotationEdit } from '../../../../lib/annotation-edit.js';
import { useAnnotationDedupe } from './useAnnotationDedupe';
import { useFeatureEditorFlow } from './useFeatureEditorFlow';

/** Shared current-document annotation controller for Library and Container. */
export function useCurrentAnnotationController({
  currentDocument,
  onUpdateEdits,
  pushSnapshot,
  canWrite = true,
  warnScope = 'AnnotationController',
}) {
  const currentDocumentRef = useRef(currentDocument);
  currentDocumentRef.current = currentDocument;

  const applyOpToAnnotations = useCallback((nextAnnotations) => {
    if (!canWrite || typeof onUpdateEdits !== 'function') return false;
    const baseAnnotations = currentDocumentRef.current?.annotations || [];
    if (!Array.isArray(nextAnnotations) || nextAnnotations === baseAnnotations) return false;
    pushSnapshot?.(baseAnnotations);
    onUpdateEdits({ editedAnnotations: nextAnnotations });
    return true;
  }, [canWrite, onUpdateEdits, pushSnapshot]);

  const onAnnotationEditFromView = useCallback((edit) => {
    if (!edit || !canWrite) return false;
    try {
      const doc = currentDocumentRef.current;
      const length = doc?.length ?? 0;
      const baseAnnotations = doc?.annotations || [];
      const result = applyAnnotationEdit(baseAnnotations, edit, length, {
        length,
        topology: doc?.topology || 'linear',
      });
      const next = Array.isArray(result) ? result : result?.next;
      return applyOpToAnnotations(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[${warnScope}] annotation edit failed:`, err.message);
      return false;
    }
  }, [canWrite, warnScope, applyOpToAnnotations]);

  const applyAnnotationBatch = useCallback((regions) => (
    Array.isArray(regions) && regions.length > 0
      ? onAnnotationEditFromView({ kind: 'create-batch', payload: regions })
      : false
  ), [onAnnotationEditFromView]);

  const featureFlow = useFeatureEditorFlow({
    item: currentDocument,
    edits: null,
    applyOp: applyOpToAnnotations,
    dispatchEdit: onAnnotationEditFromView,
  });
  const dedupe = useAnnotationDedupe({
    annotations: currentDocument?.annotations || [],
    length: currentDocument?.length || 0,
    topology: currentDocument?.topology || 'linear',
    applyOp: applyOpToAnnotations,
  });

  return {
    currentDocumentRef,
    onAnnotationEditFromView,
    applyAnnotationBatch,
    ...featureFlow,
    ...dedupe,
  };
}
