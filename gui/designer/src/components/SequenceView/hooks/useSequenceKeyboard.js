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

// IUPAC accept set follows annotation-model defaults; same charset
// useManualEditDetection relies on. Single regex to share across
// the K2 character-input branch.
const IUPAC_RE = /^[ACGTUNRYWSKMBDHVacgtunrywskmbdhv]$/;

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
  // M-X.6 K2 — character apply (DEC-MX6-02). When `editable === true`
  // and the keystroke is an IUPAC character / Backspace / Delete:
  //   • prevent default
  //   • emit one of `{ kind: 'insert' | 'delete' | 'replace', ... }`
  //     ops via `onSequenceEdit?(op)` for the caller to apply against
  //     the active library entry.
  // No-op when `editable === false` OR `onSequenceEdit` is missing —
  // legacy callers stay unchanged.
  editable = false,
  topology = 'linear', // 'linear' | 'circular' (M-X.6 K3 wrap arithmetic)
  onSequenceEdit,
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

    // M-X.6 K2 — character apply (DEC-MX6-02). Editable-mode gate:
    // when biolog has flipped the EDITABLE pill AND fires an IUPAC
    // character / Backspace / Delete, emit a sequence-edit op and
    // bail. Modifier chords (Ctrl/Meta/Alt) NEVER engage edit —
    // those still fall through to the existing copy / select-all
    // hotkeys. Caret update is the caller's responsibility (the
    // composite handler in LibrarySingleInspector decides whether
    // to apply directly to the manual_edit branch or buffer the
    // op for branch creation first).
    if (
      editable
      && typeof onSequenceEdit === 'function'
      && !e.ctrlKey && !e.metaKey && !e.altKey
    ) {
      const aPos = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
      const fPos = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
      const hasSelection = aPos != null && fPos != null && aPos !== fPos;
      const selStart = hasSelection ? Math.min(aPos, fPos) : null;
      const selEnd = hasSelection ? Math.max(aPos, fPos) : null;
      const cur = fPos != null ? fPos : 0;
      const key = e.key;
      const isChar = typeof key === 'string' && key.length === 1 && IUPAC_RE.test(key);

      if (isChar) {
        if (hasSelection) {
          e.preventDefault();
          onSequenceEdit({ kind: 'replace', start: selStart, end: selEnd, replacement: key });
          return;
        }
        e.preventDefault();
        onSequenceEdit({ kind: 'insert', pos: cur, char: key });
        return;
      }
      if (key === 'Backspace') {
        if (hasSelection) {
          e.preventDefault();
          onSequenceEdit({ kind: 'replace', start: selStart, end: selEnd, replacement: '' });
          return;
        }
        e.preventDefault();
        if (cur === 0) {
          // Linear → no-op; circular → wrap-delete trailing nucleotide.
          if (topology === 'circular' && seqLength > 0) {
            onSequenceEdit({ kind: 'delete', pos: seqLength - 1, length: 1 });
          }
          return;
        }
        onSequenceEdit({ kind: 'delete', pos: cur - 1, length: 1 });
        return;
      }
      if (key === 'Delete') {
        if (hasSelection) {
          e.preventDefault();
          onSequenceEdit({ kind: 'replace', start: selStart, end: selEnd, replacement: '' });
          return;
        }
        e.preventDefault();
        if (cur >= seqLength) {
          if (topology === 'circular' && seqLength > 0) {
            onSequenceEdit({ kind: 'delete', pos: 0, length: 1 });
          }
          return;
        }
        onSequenceEdit({ kind: 'delete', pos: cur, length: 1 });
        return;
      }
      // Other keys (arrows / Home / End / etc.) fall through to caret
      // movement below — no edit emitted.
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
    // M-X.6 K3 — circular keyboard nav (DEC-MX6-03). Linear topology
    // keeps the existing clamp [0, seqLength]. Circular: wrap-arithmetic.
    //   • without shift (collapse) → round-trip via modulo so caret
    //     stays in [0, seqLength).
    //   • with shift (extend selection) → emit extended-domain caret
    //     (caret > seqLength → trailing-wrap zone, caret < 0 →
    //     leading-wrap zone). CaretOverlay / SelectionOverlay already
    //     handle extended-domain (DEC-WRAPTAIL-04/05) — keyboard now
    //     mirrors the pointer-driven path that c17899f fixed.
    if (topology === 'circular' && seqLength > 0) {
      if (e.shiftKey) {
        // Allow extended-domain — clamp wide enough for one trip
        // through the wrap zone; further cycles round back into [0,
        // seqLength) so we never grow without bound.
        const lower = -seqLength;
        const upper = 2 * seqLength;
        if (next < lower) next = lower + ((next - lower) % seqLength + seqLength) % seqLength;
        if (next > upper) next = ((next - lower) % seqLength + seqLength) % seqLength;
      } else {
        next = ((next % seqLength) + seqLength) % seqLength;
      }
    } else {
      next = Math.max(0, Math.min(seqLength, next));
    }
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
