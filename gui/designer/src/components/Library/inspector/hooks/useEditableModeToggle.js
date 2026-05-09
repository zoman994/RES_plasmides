import { useEffect, useState, useCallback } from 'react';

/**
 * useEditableModeToggle — M-X.6 K0 extract from LibrarySingleInspector
 * (DEC-MX6-01). Owns the K6 read-only/editable pill state.
 *
 *   • `editable` — boolean, default false (DEC-LIB-16 ⚓ — read-only by
 *     default for sequence editing).
 *   • Auto-resets to false whenever the inspector switches to a
 *     different plasmid (item.id / item._fileName change) so each
 *     open starts safe — biolog cannot accidentally inherit EDITABLE
 *     state from the previous plasmid.
 *   • `toggle` — flip the flag (used by the pill button onClick).
 *   • `disable` — explicit setter, used by `useManualEditBranching`
 *     after a successful branch creation to clear the pill.
 *
 * Pure state hook — no DOM / store reads, only an effect on identity
 * change. Keeps LibrarySingleInspector small without adding any
 * coupling to other slices.
 */
export function useEditableModeToggle(item) {
  const [editable, setEditable] = useState(false);
  useEffect(() => {
    setEditable(false);
  }, [item?.id, item?._fileName]);
  // M-X.7a v2 K3 R1: read-only `.bodge` zone (imported foreign
  // project) requires explicit manual-edit branch creation —
  // simple toggle is a silent no-op. Caller's action-row
  // surfaces «Открыть как активный» / «Создать manual-edit
  // ветку» (handled by useManualEditBranching) instead.
  const isReadOnlyZone = item?.zone === 'readonly_bodge';
  const toggle = useCallback(() => {
    if (isReadOnlyZone) return;
    setEditable((v) => !v);
  }, [isReadOnlyZone]);
  const disable = useCallback(() => setEditable(false), []);
  return { editable, toggle, disable, isReadOnlyZone };
}
