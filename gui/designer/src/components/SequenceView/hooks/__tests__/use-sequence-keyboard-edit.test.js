/**
 * use-sequence-keyboard-edit.test.js — M-X.6 K2 + K3 unit coverage
 * for the editable-mode gate (DEC-MX6-02) + circular keyboard nav
 * (DEC-MX6-03). Tests the hook's emit contract:
 *   • IUPAC char → 'insert' op (or 'replace' with selection).
 *   • Backspace / Delete → 'delete' op (or 'replace' with selection).
 *   • Linear topology — clamp at edges; circular — wrap.
 *   • Modifier-key chords (Ctrl/Meta/Alt) bypass edit gate.
 */
import { describe, it, expect, vi } from 'vitest';
import { useSequenceKeyboard } from '../useSequenceKeyboard';

function mkHandler(opts = {}) {
  const onSequenceEdit = vi.fn();
  const onCaretChange = vi.fn();
  const handler = useSequenceKeyboard({
    fullSeq: 'ACGTACGTAC',
    seqLength: 10,
    charsPerLine: 5,
    caretPos: opts.caretPos ?? 3,
    caretAnchor: opts.caretAnchor ?? null,
    selectionMode: null,
    selectionStrand: 1,
    onCaretChange,
    onSelectRange: vi.fn(),
    editable: opts.editable ?? false,
    topology: opts.topology ?? 'linear',
    onSequenceEdit,
  });
  return { handler, onSequenceEdit, onCaretChange };
}

function mkEvent(key, overrides = {}) {
  return {
    key,
    code: 'Key' + (key.length === 1 ? key.toUpperCase() : ''),
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('useSequenceKeyboard — K2 char-apply gate', () => {
  it('IUPAC char fires insert op when editable && no selection', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 3 });
    handler(mkEvent('A'));
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'insert', pos: 3, char: 'A' });
  });

  it('IUPAC char fires replace op when editable && selection', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 5, caretAnchor: 2 });
    handler(mkEvent('N'));
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'replace', start: 2, end: 5, replacement: 'N' });
  });

  it('Backspace at caret>0 fires delete op', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 4 });
    handler(mkEvent('Backspace'));
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'delete', pos: 3, length: 1 });
  });

  it('Backspace at caret=0 is no-op when topology=linear', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 0 });
    handler(mkEvent('Backspace'));
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });

  it('Delete at caret<seqLength fires delete op', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 4 });
    handler(mkEvent('Delete'));
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'delete', pos: 4, length: 1 });
  });

  it('Delete with selection fires replace empty', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 5, caretAnchor: 2 });
    handler(mkEvent('Delete'));
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'replace', start: 2, end: 5, replacement: '' });
  });

  it('editable=false suppresses char emit (legacy path)', () => {
    const { handler, onSequenceEdit, onCaretChange } = mkHandler({ editable: false, caretPos: 3 });
    handler(mkEvent('A'));
    expect(onSequenceEdit).not.toHaveBeenCalled();
    // 'A' isn't an arrow key, so caret movement also no-op
    expect(onCaretChange).not.toHaveBeenCalled();
  });

  it('Ctrl+IUPAC pass-through (no edit emitted)', () => {
    const { handler, onSequenceEdit } = mkHandler({ editable: true, caretPos: 3 });
    handler(mkEvent('A', { ctrlKey: true }));
    // Ctrl+A → select-all path, NOT an insert.
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });
});

describe('useSequenceKeyboard — K3 circular keyboard nav', () => {
  it('linear ArrowRight at end clamps to seqLength', () => {
    const { handler, onCaretChange } = mkHandler({ editable: false, caretPos: 10, topology: 'linear' });
    handler(mkEvent('ArrowRight'));
    // Clamped to seqLength; cur === next → no callback
    expect(onCaretChange).not.toHaveBeenCalled();
  });

  it('circular ArrowRight at end wraps past origin', () => {
    // caret 10 ≡ 0 in circular; +1 step → 1. Either way the assertion
    // is the wrap-arithmetic produced an in-range non-clamped value.
    const { handler, onCaretChange } = mkHandler({ editable: false, caretPos: 10, topology: 'circular' });
    handler(mkEvent('ArrowRight'));
    expect(onCaretChange).toHaveBeenCalled();
    const [next] = onCaretChange.mock.calls[0];
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(10);
  });

  it('circular ArrowLeft at start wraps to seqLength-1', () => {
    const { handler, onCaretChange } = mkHandler({ editable: false, caretPos: 0, topology: 'circular' });
    handler(mkEvent('ArrowLeft'));
    expect(onCaretChange).toHaveBeenCalledWith(9, expect.any(Object));
  });

  it('circular Shift+ArrowRight at end emits extended-domain caret', () => {
    const { handler, onCaretChange } = mkHandler({ editable: false, caretPos: 10, topology: 'circular' });
    handler(mkEvent('ArrowRight', { shiftKey: true }));
    expect(onCaretChange).toHaveBeenCalled();
    const [next] = onCaretChange.mock.calls[0];
    // Within extended-domain range: caret > seqLength is OK.
    expect(next).toBeGreaterThan(10);
  });

  it('linear arrows still respect [0, seqLength] clamp', () => {
    const { handler, onCaretChange } = mkHandler({ editable: false, caretPos: 0, topology: 'linear' });
    handler(mkEvent('ArrowLeft'));
    expect(onCaretChange).not.toHaveBeenCalled();
  });
});
