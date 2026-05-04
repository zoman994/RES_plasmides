/**
 * useAnnotationRename — Sprint M-X.2 K5 inline rename on double-click
 * (DEC-ANN-05).
 *
 * Double-click on a region rect → label switches to an `<input>` (via
 * `popups/InlineRenameInput.jsx`). Enter / blur saves; Esc cancels.
 *
 * The hook is intentionally thin — it only owns:
 *   - which region is currently being renamed (`renamingId`)
 *   - the start/end/save/cancel callbacks consumed by the input
 *
 * The actual `<input>` component lives in `popups/InlineRenameInput.jsx`
 * and is mounted by the orchestrator when `renamingId` is non-null.
 *
 * Empty / whitespace-only names are silently rejected (cancel).
 */

import { useCallback, useState } from 'react';

export function useAnnotationRename({ onAnnotationEdit }) {
  // `renaming.lineStart` — bug-rush #7 (04.05.2026 evening). When a
  // multi-line feature renders one `<g>` per line, every line's
  // label calls startRename. Pre-fix the orchestrator's
  // `data-region-id` querySelector returned only the FIRST match,
  // so dblclick on line 2/3/etc. opened the input over line 1 —
  // biolog: «работает только первое название». We now stash the
  // originating line's `data-line-start` alongside the id and the
  // orchestrator scopes its lookup with BOTH.
  const [renaming, setRenaming] = useState(null);

  const startRename = useCallback((region, lineStart) => {
    if (!region || !region.id) return;
    setRenaming({
      id: region.id,
      name: region.name || '',
      start: region.start,
      end: region.end,
      lineStart: Number.isFinite(lineStart) ? lineStart : null,
    });
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const saveRename = useCallback((newName) => {
    if (!renaming) return;
    const trimmed = (newName == null ? '' : String(newName)).trim();
    if (!trimmed || trimmed === renaming.name) {
      setRenaming(null);
      return;
    }
    if (typeof onAnnotationEdit === 'function') {
      onAnnotationEdit({ kind: 'update', id: renaming.id, patch: { name: trimmed } });
    }
    setRenaming(null);
  }, [onAnnotationEdit, renaming]);

  return {
    renaming,
    isRenamingId: renaming?.id || null,
    startRename,
    cancelRename,
    saveRename,
  };
}
