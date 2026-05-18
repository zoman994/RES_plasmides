/**
 * usePrimerHotkeys — Игорь 18.05.2026: «в сиквенс вивере горячие
 * клавиши с праймерами так же должны работать».
 *
 * Registers the SAME primer hotkeys the assembler uses —
 * `pcr-primer-forward` (Ctrl+R) / `pcr-primer-reverse` (Ctrl+Alt+R) —
 * directly on SequenceView, so a forward/reverse primer can be made
 * from the current DNA selection in EVERY viewer (Library, container
 * editor, …), not just the assembly shell. On press it routes through
 * the same `requestWritePrimer` flow the right-click «primer» item
 * uses → the PrimerFromSelectionModal (consistent UX everywhere).
 *
 * Mirrors usePieceHotkey (DEC-T5-13 lifecycle-scoped): no-op without a
 * selection or without a write channel. The hotkey ids are shared with
 * useAssemblyPrimerWriting / PcrModeShell, but `_handlers` is single-
 * per-id and child effects register before parent — so when an
 * assembly/PCR shell wraps a SequenceView, the SHELL re-registers last
 * (its caret-dep handler re-runs on every selection) and keeps its own
 * direct-write behaviour; standalone viewers get this modal flow.
 */
import { useCallback } from 'react';
import { useHotkey } from '../../../lib/hotkeys';

export function usePrimerHotkeys({
  onWritePrimer, requestWritePrimer, caretAnchor, caretPos,
}) {
  const make = useCallback((direction) => {
    if (typeof onWritePrimer !== 'function') return;
    if (typeof requestWritePrimer !== 'function') return;
    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return; // need a selection
    requestWritePrimer({ direction, start: Math.min(a, f), end: Math.max(a, f) });
  }, [onWritePrimer, requestWritePrimer, caretAnchor, caretPos]);

  const fwd = useCallback(() => make('forward'), [make]);
  const rev = useCallback(() => make('reverse'), [make]);
  useHotkey('pcr-primer-forward', fwd);
  useHotkey('pcr-primer-reverse', rev);
}
