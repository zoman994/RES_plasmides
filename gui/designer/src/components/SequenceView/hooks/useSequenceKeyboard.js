/**
 * useSequenceKeyboard — encapsulates the keyboard caret + copy
 * hotkey handler that lives on the SequenceView root.
 *
 * Returns a single `onRootKeyDown(e)` callback. Pure factory — no
 * internal state, no useEffect, no useMemo. Hook-style only because
 * it produces a closure that the JSX wires into `<div onKeyDown>`.
 *
 * Sprint M-X.2 K3 will extend this hook with Del / H / E handlers
 * (selection edit operations). Today (K1) the hook only relocates
 * the existing handler unchanged.
 *
 * Mapping:
 *   - Ctrl+A        → select the WHOLE forward strand (biolog
 *                     «Ctrl+A должен копировать всю первую цепь
 *                     ДНК»; standard «select all», then Ctrl+C
 *                     copies)
 *   - Ctrl+Alt+A    → select the WHOLE reverse strand (biolog
 *                     «контрол альт А всю обратную цепь»)
 *   - Ctrl+C        → copy forward DNA strand
 *   - Ctrl+Alt+C    → copy reverse-complement (bottom strand 5'→3')
 *   - Ctrl+Shift+C  → copy translated AA (selectionMode === 'aa' only)
 *   - Arrow / Home / End / PageUp / PageDown → caret move via
 *     onCaretChange(newPos, { extendSelection, needsScroll, anchorIfNull })
 *   - In AA-mode + Shift held: arrows move by codon (3 nt) so
 *     selection grows triplet-by-triplet (biolog 04.05.2026 evening:
 *     «если поставил курсор на АА и потом с зажатым Shift идёшь
 *     влево/вправо то выделяются триплетами»).
 *
 * Layout-independent key detection: uses `e.code === "KeyC"` (the
 * physical C key) instead of `e.key === "c"` so the Russian layout
 * (where the same physical key emits «с» / Cyrillic ес) keeps the
 * Ctrl+C copy hotkey working (biolog 04.05.2026: «Ctrl+C не
 * работает»).
 */

import { reverseComplement } from "../../../sequence-utils";
import { translateDNA } from "../../../codons";

export function useSequenceKeyboard({
  fullSeq,
  seqLength,
  charsPerLine,
  caretPos,
  caretAnchor,
  selectionMode,
  selectionStrand,
  onCaretChange,
  onSelectRange,
}) {
  return function onRootKeyDown(e) {
    if (!seqLength) return;

    // Sprint M-X.3 follow-up — Ctrl+A select-all hotkey (and the
    // Alt-modified reverse-strand variant). Layout-independent via
    // `e.code === "KeyA"` so Russian «ф» on the same physical key
    // still triggers. No-op when `onSelectRange` is missing
    // (legacy callers — preserves backward compat).
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") {
      e.preventDefault();
      if (typeof onSelectRange !== "function") return;
      const strand = e.altKey ? -1 : 1;
      onSelectRange(0, seqLength, "dna", strand);
      return;
    }

    // Copy hotkeys
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") {
      const a = (typeof caretAnchor === "number" && Number.isFinite(caretAnchor)) ? caretAnchor : null;
      const f = (typeof caretPos === "number" && Number.isFinite(caretPos)) ? caretPos : null;
      if (a == null || f == null || a === f) return; // no selection — let browser handle native copy
      const start = Math.min(a, f);
      const end = Math.max(a, f);
      const slice = (fullSeq || "").slice(start, end);
      if (!slice) return;
      e.preventDefault();
      let text;
      if (e.shiftKey) {
        if (selectionMode !== "aa") return; // not a CDS selection — no-op
        const dna = selectionStrand === -1 ? reverseComplement(slice) : slice;
        text = translateDNA(dna);
      } else if (e.altKey) {
        text = reverseComplement(slice);
      } else {
        text = slice;
      }
      try {
        navigator.clipboard?.writeText?.(text);
      } catch { /* clipboard unavailable — silently no-op */ }
      return;
    }

    if (typeof onCaretChange !== "function") return;
    const cur = (typeof caretPos === "number" && Number.isFinite(caretPos))
      ? caretPos
      : 0;
    const cpl = charsPerLine || 80;
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const lineStartOf = (n) => Math.floor(n / cpl) * cpl;
    const lineEndOf = (n) => Math.min(seqLength, lineStartOf(n) + cpl);
    // AA-mode + shift held → walk by codon (3 nt). Plain (no shift)
    // arrow still moves by 1 nt and collapses the selection — that's
    // the user's "exit AA mode" affordance.
    const aaStep = selectionMode === "aa" && e.shiftKey ? 3 : 1;
    let next = cur;
    switch (e.key) {
      case "ArrowLeft":
        if (ctrlOrMeta) {
          const ls = lineStartOf(cur);
          next = cur > ls ? ls : Math.max(0, ls - cpl);
        } else {
          next = cur - aaStep;
        }
        break;
      case "ArrowRight":
        if (ctrlOrMeta) {
          const le = lineEndOf(cur);
          next = cur < le ? le : Math.min(seqLength, le + cpl);
        } else {
          next = cur + aaStep;
        }
        break;
      case "ArrowUp":    next = cur - cpl; break;
      case "ArrowDown":  next = cur + cpl; break;
      case "Home":       next = ctrlOrMeta ? 0 : lineStartOf(cur); break;
      case "End":        next = ctrlOrMeta ? seqLength : lineEndOf(cur); break;
      case "PageUp":     next = cur - cpl * 10; break;
      case "PageDown":   next = cur + cpl * 10; break;
      default: return;
    }
    next = Math.max(0, Math.min(seqLength, next));
    if (next === cur && caretPos != null) return;
    e.preventDefault();
    const oldLine = Math.floor(cur / cpl);
    const newLine = Math.floor(next / cpl);
    onCaretChange(next, {
      needsScroll: oldLine !== newLine,
      extendSelection: !!e.shiftKey,
      anchorIfNull: cur,
    });
  };
}
