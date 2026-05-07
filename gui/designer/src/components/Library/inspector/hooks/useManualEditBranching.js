import { useCallback, useState } from 'react';
import { useStore } from '../../../../store';
import { useManualEditDetection } from '../../hooks/useManualEditDetection';

/**
 * useManualEditBranching — M-X.6 K0 extract from LibrarySingleInspector
 * (DEC-MX6-01). Owns the K10 manual-edit branching wiring (DEC-LIB-12 ⚓):
 *
 *   • Listens window-level keydown via `useManualEditDetection` when
 *     armed = `editable && Mine entry && Sequence tab`.
 *   • On the first IUPAC / Backspace / Delete keystroke fires the
 *     ManualEditConfirmModal (per-mount scope per Q3 plan decision —
 *     re-mounting the same entry triggers it again).
 *   • Confirm → `librarySlice.createManualEditBranch(...)` forks the
 *     entry. Q5 plan guard surfaces a specific toast on
 *     `pending-delete` reason.
 *   • Cancel → modal dismisses, no entry created.
 *
 * On a successful branch the hook clears the pending edits (via
 * `onClearEdits`) and disables the pill (via `onDisable`). The caller
 * passes both — keeps this hook decoupled from the editable-toggle
 * hook and from the parent's `onUpdateEdits` callback shape.
 *
 * Returns `{ pending, busy, cancel, confirm, armed }`. The caller
 * passes `pending` to ManualEditConfirmModal's `open` prop.
 *
 * Caveat (M-X.6 K2 follow-up): branch is created with sequence
 * IDENTICAL to parent. Real character-level apply (insert / Backspace
 * / Delete with indel-aware annotation shift) lands in K2 via the
 * `onSequenceEdit` composite handler — this hook stays as the
 * branch-creation gate.
 */
export function useManualEditBranching({
  item,
  edits,
  activeTab,
  editable,
  onClearEdits,
  onDisableEditable,
}) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const showToast = useStore((s) => s.showToast);
  const createManualEditBranch = useStore((s) => s.createManualEditBranch);

  const armed = !!editable && !!item?._libraryEntryId && activeTab === 'sequence';

  const handleFirstEdit = useCallback(({ key }) => {
    if (!armed) return;
    setPending({ key });
  }, [armed]);

  useManualEditDetection({ armed, onFirstEdit: handleFirstEdit });

  const cancel = useCallback(() => {
    setPending(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pending || !item?._libraryEntryId || !createManualEditBranch) return;
    setBusy(true);
    try {
      const result = await createManualEditBranch(
        item._libraryEntryId,
        item.sequence || '',
        Array.isArray(edits?.editedAnnotations)
          ? edits.editedAnnotations
          : (item.annotations || []),
      );
      if (result?.ok) {
        showToast?.(
          `Создана ветка «${result.name}». Откройте её в библиотеке для продолжения правок.`,
          { kind: 'success', duration: 4000 },
        );
        if (typeof onClearEdits === 'function') onClearEdits();
        if (typeof onDisableEditable === 'function') onDisableEditable();
      } else if (result?.reason === 'pending-delete') {
        showToast?.(
          `Запись «${result.name || item.name}» помечена на удаление. Восстановите её перед manual edit.`,
          { kind: 'error', duration: 4000 },
        );
      } else {
        showToast?.('Не удалось создать ветку — попробуйте ещё раз.', {
          kind: 'error',
          duration: 4000,
        });
      }
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [pending, item, edits, createManualEditBranch, showToast, onClearEdits, onDisableEditable]);

  return { pending, busy, cancel, confirm, armed };
}
