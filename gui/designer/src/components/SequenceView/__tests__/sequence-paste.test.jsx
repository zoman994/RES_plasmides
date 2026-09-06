/**
 * sequence-paste.test.jsx — Игорь «вставка последовательности не работает».
 * The SequenceView root now accepts a clipboard paste of bases and emits a
 * multi-char `replace` op via onSequenceEdit (insert at caret / replace
 * selection). No-op when not editable or no onSequenceEdit handler.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const SEQ = 'ATGGCC'.repeat(50);
const FRAGMENT = { id: 'f1', name: 'demo', type: 'misc_feature', sequence: SEQ, strand: 1, annotations: [] };

beforeEach(() => {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true, framesMode: 'auto', autoThreshold: 0.8, primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: { '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true }, predictions: {},
    },
  });
});
afterEach(() => cleanup());

const pasteText = (root, text) => fireEvent.paste(root, { clipboardData: { getData: () => text } });

describe('SequenceView — paste a sequence', () => {
  it('editable + caret → paste emits a replace op inserting the sanitised bases at the caret', () => {
    const onSequenceEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} editable onSequenceEdit={onSequenceEdit} caretPos={10} caretAnchor={10} />);
    pasteText(screen.getByTestId('sequence-view-root'), 'aa gg\ntt');
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'replace', start: 10, end: 10, replacement: 'AAGGTT' });
  });

  it('editable + selection → paste replaces the selected range', () => {
    const onSequenceEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} editable onSequenceEdit={onSequenceEdit} caretAnchor={4} caretPos={12} />);
    pasteText(screen.getByTestId('sequence-view-root'), 'GGGG');
    expect(onSequenceEdit).toHaveBeenCalledWith({ kind: 'replace', start: 4, end: 12, replacement: 'GGGG' });
  });

  it('circular collapsed ghost caret is canonical before DOM paste reaches the writer', () => {
    const onSequenceEdit = vi.fn();
    render(
      <SequenceView
        fragments={[FRAGMENT]}
        circular
        editable
        onSequenceEdit={onSequenceEdit}
        caretAnchor={-20}
        caretPos={-20}
      />,
    );
    pasteText(screen.getByTestId('sequence-view-root'), 'GGGG');
    expect(onSequenceEdit).toHaveBeenCalledWith({
      kind: 'replace', start: 280, end: 280, replacement: 'GGGG',
    });
  });

  it('NOT editable → paste is a no-op', () => {
    const onSequenceEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onSequenceEdit={onSequenceEdit} caretPos={5} caretAnchor={5} />);
    pasteText(screen.getByTestId('sequence-view-root'), 'ATGC');
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });

  it('non-base clipboard → no op emitted', () => {
    const onSequenceEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} editable onSequenceEdit={onSequenceEdit} caretPos={5} caretAnchor={5} />);
    pasteText(screen.getByTestId('sequence-view-root'), '12 34 !!');
    expect(onSequenceEdit).not.toHaveBeenCalled();
  });
});
