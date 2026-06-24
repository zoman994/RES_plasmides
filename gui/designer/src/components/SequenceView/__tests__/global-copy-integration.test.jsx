/**
 * global-copy-integration.test.jsx — proves useSelectionState registers
 * a live copy-source so the window-level Ctrl+C handler copies the
 * current SequenceView selection even when focus has moved OUTSIDE the
 * view (Игорь «контрол С должно глобально работать везде где можно
 * выделить»).
 *
 * We mount a tiny harness that drives useSelectionState with a fixed
 * selection (caretAnchor/caretPos), install the global handler, then
 * dispatch Ctrl+C from document.body — i.e. with focus NOT inside the
 * sequence view. The reference forward slice must reach the clipboard.
 */
import { useRef } from 'react';
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useSelectionState } from '../hooks/useSelectionState.js';
import {
  installGlobalCopyHandler,
  _clearCopySourcesForTests,
} from '../../../lib/global-copy.js';

const writeText = vi.fn();

beforeEach(() => {
  _clearCopySourcesForTests();
  writeText.mockReset();
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
  }
  navigator.clipboard.writeText = writeText;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

// FULL = ATGCATGC; selection [0,4) → forward 'ATGC'.
function Harness({ anchor, focus, mode = 'dna', strand = 1 }) {
  const containerRef = useRef(null);
  useSelectionState({
    fullSeq: 'ATGCATGC',
    seqLength: 8,
    charsPerLine: 80,
    charPx: 7,
    caretPos: focus,
    caretAnchor: anchor,
    selectionMode: mode,
    selectionStrand: strand,
    onCaretChange: () => {},
    onSelectRange: () => {},
    containerRef,
  });
  return <div ref={containerRef} data-testid="sequence-view-root" />;
}

function dispatchCopy(target, overrides = {}) {
  const evt = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    code: 'KeyC',
    key: 'c',
    ...overrides,
  });
  target.dispatchEvent(evt);
  return evt;
}

describe('SequenceView ↔ global Ctrl+C', () => {
  it('copies the selection when Ctrl+C fires with focus on the body', () => {
    const teardown = installGlobalCopyHandler();
    render(<Harness anchor={0} focus={4} />);
    dispatchCopy(document.body);
    expect(writeText).toHaveBeenCalledWith('ATGC');
    teardown();
  });

  it('reverse strand via Ctrl+Alt+C', () => {
    const teardown = installGlobalCopyHandler();
    render(<Harness anchor={0} focus={4} />);
    dispatchCopy(document.body, { altKey: true });
    // reverseComplement('ATGC') === 'GCAT'
    expect(writeText).toHaveBeenCalledWith('GCAT');
    teardown();
  });

  it('does nothing when the selection is empty (anchor === focus)', () => {
    const teardown = installGlobalCopyHandler();
    render(<Harness anchor={3} focus={3} />);
    const evt = dispatchCopy(document.body);
    expect(writeText).not.toHaveBeenCalled();
    expect(evt.defaultPrevented).toBe(false);
    teardown();
  });

  it('unmounting unregisters the source — Ctrl+C no longer copies', () => {
    const teardown = installGlobalCopyHandler();
    const { unmount } = render(<Harness anchor={0} focus={4} />);
    unmount();
    dispatchCopy(document.body);
    expect(writeText).not.toHaveBeenCalled();
    teardown();
  });
});
