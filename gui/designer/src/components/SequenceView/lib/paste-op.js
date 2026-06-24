/**
 * paste-op.js — turn a clipboard paste into a sequence-edit op (Игорь
 * 17.06.2026: «вставка последовательности не работает» — paste a block
 * of bases into the viewer). Pure: the SequenceView root's onPaste reads
 * the clipboard text + current caret/selection and calls this; the result
 * is a `replace` op the existing `applySequenceEditToEntry` already
 * handles (multi-char, indel-aware), so paste flows through the SAME
 * transient-edit + version-save path as typing.
 *
 *   • selection [a,b) present → replace that range with the pasted text;
 *   • caret only (a === b or one null) → insert the text at the caret
 *     (= replace [pos, pos)).
 *
 * The text is sanitised to IUPAC bases (whitespace + non-base chars
 * dropped, upper-cased). Returns null when nothing pasteable remains.
 */

const NON_BASE = /[^ACGTURYSWKMBDHVN]/g;

export function sanitizePastedBases(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, '').toUpperCase().replace(NON_BASE, '');
}

export function buildSequencePasteOp(rawText, caretAnchor, caretPos) {
  const replacement = sanitizePastedBases(rawText);
  if (!replacement) return null;
  const a = (typeof caretAnchor === 'number' && Number.isFinite(caretAnchor)) ? caretAnchor : null;
  const f = (typeof caretPos === 'number' && Number.isFinite(caretPos)) ? caretPos : null;
  let start;
  let end;
  if (a != null && f != null && a !== f) {
    start = Math.min(a, f);
    end = Math.max(a, f);
  } else {
    const pos = f != null ? f : (a != null ? a : 0);
    start = pos;
    end = pos;
  }
  return { kind: 'replace', start, end, replacement };
}
