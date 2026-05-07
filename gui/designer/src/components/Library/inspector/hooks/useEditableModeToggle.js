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
  const toggle = useCallback(() => setEditable((v) => !v), []);
  const disable = useCallback(() => setEditable(false), []);
  return { editable, toggle, disable };
}
