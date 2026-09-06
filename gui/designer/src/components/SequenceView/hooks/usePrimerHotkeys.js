/**
 * usePrimerHotkeys — Игорь 18.05.2026: «в сиквенс вивере горячие
 * клавиши с праймерами так же должны работать».
 *
 * Registers the SAME primer hotkeys the assembler uses —
 * `pcr-primer-forward` (Ctrl+R) / `pcr-primer-reverse` (Ctrl+Alt+R) —
 * directly on SequenceView, so a forward/reverse primer can be made
 * from the current DNA selection in EVERY viewer (Library, container
 * editor, …), not just the assembly shell.
 *
 * PRIMER-LIVE-1 — the hotkey now WRITES. It used to open the review modal,
 * which meant the fastest way to make a primer still cost a dialog: the user
 * had already said which strand and had already chosen the bases, and the
 * dialog asked them again. The primer is created immediately; the modal stays
 * for the paths that are genuinely about editing — the right-click item and
 * double-click on an existing primer.
 *
 * `buildPrimerDraft` is how the host, which owns the sequence, turns a range
 * into the payload its own write channel expects. Without it the hook still
 * fires with `{direction, start, end}`, which is what the assembly reducer
 * already range-derives from.
 *
 * Mirrors usePieceHotkey (DEC-T5-13 lifecycle-scoped): no-op without a
 * selection or without a write channel. The hotkey ids are shared with
 * useAssemblyPrimerWriting / PcrModeShell. Registrations form a LIFO stack:
 * the last mounted consumer owns the chord, and its exact cleanup restores
 * the previous consumer instead of leaving the shared id empty.
 */
import { useCallback } from 'react';
import { useHotkey } from '../../../lib/hotkeys';

export function usePrimerHotkeys({
  onWritePrimer, buildPrimerDraft, caretAnchor, caretPos, selectionRange = null,
}) {
  const make = useCallback((direction) => {
    if (typeof onWritePrimer !== 'function') return;
    const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
    const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
    if (a == null || f == null || a === f) return; // need a selection
    const range = selectionRange
      ? { direction, start: selectionRange.start, end: selectionRange.end }
      : { direction, start: Math.min(a, f), end: Math.max(a, f) };
    const draft = typeof buildPrimerDraft === 'function' ? buildPrimerDraft(range) : null;
    // A host that cannot build a draft for this range is telling us there is
    // no primer to make here — writing a range-only payload anyway would
    // create an empty record the user then has to find and delete.
    if (typeof buildPrimerDraft === 'function' && !draft) return;
    onWritePrimer(draft || range);
  }, [onWritePrimer, buildPrimerDraft, caretAnchor, caretPos, selectionRange]);

  const fwd = useCallback(() => make('forward'), [make]);
  const rev = useCallback(() => make('reverse'), [make]);
  useHotkey('pcr-primer-forward', fwd);
  useHotkey('pcr-primer-reverse', rev);
}
