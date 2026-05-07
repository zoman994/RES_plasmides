import { useCallback, useMemo } from 'react';

/**
 * useLibrarySaveFlow — M-X.6 K0 extract from LibrarySingleInspector
 * (DEC-MX6-01). Packages props for the K7 `<LibrarySaveActions>`
 * pair of buttons and supplies the after-save callbacks that clear
 * the inspector's pending edits.
 *
 * Returns an object that can be spread directly into
 * `<LibrarySaveActions {...saveFlow} />`, plus the active boolean
 * `visible` so the caller can conditionally render the actions
 * (only when item is a Mine library entry; otherwise undefined
 * stays consistent with existing behaviour).
 *
 * Note: this hook does NOT decide whether to mount the buttons —
 * caller should still gate on `item._libraryEntryId` so the markup
 * stays unchanged from before the K0 extract.
 */
export function useLibrarySaveFlow({ item, edits, onUpdateEdits }) {
  const libraryEntryId = item?._libraryEntryId || null;
  const editedAnnotations = useMemo(
    () => (Array.isArray(edits?.editedAnnotations) ? edits.editedAnnotations : []),
    [edits?.editedAnnotations],
  );
  const hasChanges = Array.isArray(edits?.editedAnnotations);
  const parentName = item?.name || '';

  const clearPending = useCallback(() => {
    if (typeof onUpdateEdits === 'function') {
      onUpdateEdits({ editedAnnotations: undefined });
    }
  }, [onUpdateEdits]);

  const onAfterOverwrite = useCallback(() => clearPending(), [clearPending]);
  const onAfterSaveAsVersion = useCallback(() => clearPending(), [clearPending]);

  return {
    visible: !!libraryEntryId,
    libraryEntryId,
    hasChanges,
    editedAnnotations,
    parentName,
    onAfterOverwrite,
    onAfterSaveAsVersion,
  };
}
