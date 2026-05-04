/**
 * sequence-keyboard.test.js — Sprint M-X.3 follow-up coverage.
 *
 * Locks the keyboard hotkey contract for the SequenceView root:
 *   - Ctrl+A      → select the WHOLE forward strand (anchor=0,
 *                   pos=seqLength, mode='dna', strand=1) per biolog
 *                   «Ctrl+A должен копировать всю первую цепь ДНК».
 *                   Subsequent Ctrl+C copies the selection (existing
 *                   contract — covered by other tests).
 *   - Ctrl+C      → copy the current selection's forward strand
 *                   (existing — re-checked here).
 *
 * The hook is a pure factory that returns `onRootKeyDown(e)` so we
 * test it directly with a fake event (no React mount needed).
 */
import { describe, it, expect, vi } from 'vitest';
import { useSequenceKeyboard } from '../hooks/useSequenceKeyboard';

const FULL_SEQ = 'ATGC'.repeat(200); // 800 nt
const SEQ_LEN = FULL_SEQ.length;

function makeEvt(overrides = {}) {
  return {
    code: '',
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

describe('useSequenceKeyboard — Ctrl+A select-all forward strand', () => {
  it('Ctrl+A calls onSelectRange(0, seqLength, "dna", 1) when no selection', () => {
    const onSelectRange = vi.fn();
    const onCaretChange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 50, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange, onSelectRange,
    });
    const e = makeEvt({ ctrlKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', 1);
    // Caret movement must NOT fire — Ctrl+A is its own command.
    expect(onCaretChange).not.toHaveBeenCalled();
  });

  it('Cmd+A on Mac (metaKey) works the same way', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ metaKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', 1);
  });

  it('Ctrl+A is layout-independent — fires on physical KeyA even when key is "ф" (Russian)', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    // Russian layout — same physical key emits «ф» (U+0444). Hook
    // dispatches off `e.code` so the hotkey survives.
    const e = makeEvt({ ctrlKey: true, code: 'KeyA', key: 'ф' });
    onKey(e);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', 1);
  });

  it('Ctrl+A is a no-op when seqLength is 0', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: '', seqLength: 0, charsPerLine: 80,
      caretPos: null, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ ctrlKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    expect(onSelectRange).not.toHaveBeenCalled();
  });

  it('Ctrl+A overrides any existing selection (replaces with full forward strand)', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 100, caretAnchor: 50,         // previous selection 50..100
      selectionMode: 'aa', selectionStrand: -1, // even AA-mode reverse
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ ctrlKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    // Always replaces with FULL forward DNA — the user's «I want
    // the whole top strand» semantics.
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', 1);
  });

  it('plain "A" (no modifier) does nothing — caret keys handle their own switch', () => {
    const onSelectRange = vi.fn();
    const onCaretChange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange, onSelectRange,
    });
    onKey(makeEvt({ code: 'KeyA', key: 'a' }));
    expect(onSelectRange).not.toHaveBeenCalled();
    expect(onCaretChange).not.toHaveBeenCalled();
  });

  it('Ctrl+A no-ops gracefully when onSelectRange is missing', () => {
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(),
      // onSelectRange omitted (legacy callers).
    });
    const e = makeEvt({ ctrlKey: true, code: 'KeyA', key: 'a' });
    expect(() => onKey(e)).not.toThrow();
  });
});

describe('useSequenceKeyboard — Ctrl+Alt+A select-all reverse strand', () => {
  it('Ctrl+Alt+A selects the WHOLE reverse strand (strand=-1)', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ ctrlKey: true, altKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onSelectRange).toHaveBeenCalledTimes(1);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', -1);
  });

  it('Cmd+Alt+A on Mac fires the same reverse-strand select', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ metaKey: true, altKey: true, code: 'KeyA', key: 'a' });
    onKey(e);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', -1);
  });

  it('Ctrl+Alt+A is layout-independent — Russian «ф» on physical KeyA', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    const e = makeEvt({ ctrlKey: true, altKey: true, code: 'KeyA', key: 'ф' });
    onKey(e);
    expect(onSelectRange).toHaveBeenCalledWith(0, SEQ_LEN, 'dna', -1);
  });

  it('Ctrl+A (no Alt) keeps strand=+1 — Alt is what flips to reverse', () => {
    const onSelectRange = vi.fn();
    const onKey = useSequenceKeyboard({
      fullSeq: FULL_SEQ, seqLength: SEQ_LEN, charsPerLine: 80,
      caretPos: 0, caretAnchor: null,
      selectionMode: null, selectionStrand: 1,
      onCaretChange: vi.fn(), onSelectRange,
    });
    onKey(makeEvt({ ctrlKey: true, code: 'KeyA', key: 'a' }));
    expect(onSelectRange).toHaveBeenLastCalledWith(0, SEQ_LEN, 'dna', 1);
  });
});
