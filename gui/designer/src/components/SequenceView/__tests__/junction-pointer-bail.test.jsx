/**
 * junction-pointer-bail.test.jsx — JUNCTION step-2 FIX, visual-acceptance #2
 * (Игорь 05.06.2026: «стык появился, но не кликабелен»).
 *
 * Root cause (same class as the primer bail): the strip junction is a
 * <button data-testid="sequence-view-junction"> in SegmentZonesOverlay with its
 * own onClick (→ OPEN_JUNCTION_METHOD_PICKER). The button stops onClick, NOT
 * onPointerDown — so a press on it ran the root caret-placement branch, which
 * calls setPointerCapture() on the SequenceView root → the ensuing click is
 * delivered to the root, never the button → the glyph felt un-clickable.
 * Fix mirrors the RE-site / primer bail: onRootPointerDown returns early when
 * the press originates inside a `sequence-view-junction`.
 *
 * (happy-dom does not reproduce pointer-capture, so a plain fireEvent.click
 * test could not catch this — hence the dedicated bail test, mirroring
 * primer-pointer-bail.)
 */
import { useRef } from 'react';
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import { useSelectionState } from '../hooks/useSelectionState.js';

afterEach(cleanup);

function Harness({ onCaret }) {
  const containerRef = useRef(null);
  const { onRootPointerDown } = useSelectionState({
    fullSeq: 'ATGC'.repeat(20),
    seqLength: 80,
    charsPerLine: 80,
    charPx: 7,
    caretPos: null,
    caretAnchor: null,
    selectionMode: null,
    selectionStrand: 1,
    onCaretChange: onCaret,
    onSelectRange: () => {},
    containerRef,
  });
  return (
    <div ref={containerRef} data-testid="root" onPointerDown={onRootPointerDown}>
      <div data-testid="sequence-view-line" data-line-start="0">
        <button type="button" data-testid="sequence-view-junction">
          <span data-testid="junction-inner">◆</span>
        </button>
        <span data-testid="plain">plain area (not a junction)</span>
      </div>
    </div>
  );
}

const RECT = {
  left: 0, top: 0, right: 560, bottom: 20, width: 560, height: 20,
};

function stubLineRect() {
  const line = screen.getByTestId('sequence-view-line');
  line.getBoundingClientRect = () => RECT;
}

describe('onRootPointerDown — junction bail', () => {
  it('positive control: a plain press DOES place caret + capture pointer', () => {
    const onCaret = vi.fn();
    render(<Harness onCaret={onCaret} />);
    stubLineRect();
    const root = screen.getByTestId('root');
    const cap = vi.fn();
    root.setPointerCapture = cap;
    fireEvent.pointerDown(screen.getByTestId('plain'), {
      button: 0, pointerId: 1, clientX: 30, clientY: 10,
    });
    expect(onCaret).toHaveBeenCalled();
    expect(cap).toHaveBeenCalled();
  });

  it('press inside a junction glyph BAILS — no caret, no pointer-capture (click stays the glyph\'s)', () => {
    const onCaret = vi.fn();
    render(<Harness onCaret={onCaret} />);
    stubLineRect();
    const root = screen.getByTestId('root');
    const cap = vi.fn();
    root.setPointerCapture = cap;
    fireEvent.pointerDown(screen.getByTestId('junction-inner'), {
      button: 0, pointerId: 1, clientX: 30, clientY: 10,
    });
    expect(onCaret).not.toHaveBeenCalled();
    expect(cap).not.toHaveBeenCalled();
  });
});
