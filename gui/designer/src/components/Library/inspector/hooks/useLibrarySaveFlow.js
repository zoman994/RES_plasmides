import { useCallback, useMemo } from 'react';
import { formatCorrection } from '../../../../lib/alignment/describe-edit';
import { isSequenceDivergent } from '../../../../lib/library-current-document';

const EMPTY = [];

/**
 * useLibrarySaveFlow — M-X.6 K0 extract from LibrarySingleInspector
 * (DEC-MX6-01). Packages props for the K7 `<LibrarySaveActions>`
 * pair of buttons and supplies the after-save callbacks that clear
 * the inspector's pending edits.
 *
 * Игорь (17.06): «убрать рид-онли/эдитэйбл, по умолчанию редактируемой, форма
 * сохранения как в выравнивании — версия / что изменено / имя». So saving is
 * now VERSION-ONLY (no «Перезаписать»): the transient edits (edited SEQUENCE
 * + annotations) commit to a NEW branch, the source is untouched. «Что
 * изменено» comes from the per-edit `edits.editLog` (the SAME describe-edit
 * provenance engine the aligner uses), threaded as `changes` into the save.
 */
export function useLibrarySaveFlow({ item, edits, onUpdateEdits }) {
  const libraryEntryId = item?._libraryEntryId || null;
  // «Что изменено» = the transient per-edit log accumulated in the working
  // buffer (sequence runs + annotation edits), built by describe-edit.
  const editLog = useMemo(() => (Array.isArray(edits?.editLog) ? edits.editLog : EMPTY), [edits?.editLog]);
  // The working SEQUENCE / annotations to commit (fall back to the source so a
  // sequence-only or annotation-only edit doesn't wipe the untouched half).
  const editedSequence = (edits?.editedSequence != null) ? edits.editedSequence : (item?.sequence || '');
  const editedAnnotations = useMemo(
    () => (Array.isArray(edits?.editedAnnotations) ? edits.editedAnnotations : (item?.annotations || [])),
    [edits?.editedAnnotations, item?.annotations],
  );
  const savedTopology = item?.topology || 'linear';
  const editedTopology = edits?.editedTopology != null ? edits.editedTopology : savedTopology;
  const topologyChanged = editedTopology !== savedTopology;
  const provenanceLog = useMemo(() => {
    if (!topologyChanged || editLog.some((entry) => entry?.kind === 'topology')) return editLog;
    return [...editLog, { kind: 'topology', from: savedTopology, to: editedTopology }];
  }, [editLog, editedTopology, savedTopology, topologyChanged]);
  const changesSummary = useMemo(() => provenanceLog.map(formatCorrection), [provenanceLog]);
  const changeText = useMemo(() => changesSummary.join('; '), [changesSummary]);
  // Versioning is for molecule divergence (sequence or topology). Annotation-only
  // edits remain metadata and autosave in place through LibraryWorkspace.
  const hasChanges = isSequenceDivergent(item, edits);
  const parentName = item?.name || '';

  const clearPending = useCallback(() => {
    if (typeof onUpdateEdits === 'function') {
      onUpdateEdits({
        editedAnnotations: undefined,
        editedSequence: undefined,
        editedTopology: undefined,
        editLog: undefined,
      });
    }
  }, [onUpdateEdits]);

  const onAfterSaveAsVersion = useCallback(() => clearPending(), [clearPending]);

  return {
    visible: !!libraryEntryId,
    libraryEntryId,
    hasChanges,
    editedSequence,
    editedAnnotations,
    editedTopology,
    changesSummary,
    changeText,
    parentName,
    onAfterSaveAsVersion,
  };
}
