import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSequenceSelection } from '../../../hooks/useSequenceSelection.js';
import { selectionSlice, useSelectionState } from '../hooks/useSelectionState.js';

const SEQ = 'ACGT'.repeat(25); // 100 bp; deliberately non-uniform at adjacent bases
const CHAR_PX = 10;
const LINE_CHARS = 20;
const LINE_WIDTH = (8 + LINE_CHARS) * CHAR_PX;

function rect(top) {
  return {
    left: 0, right: LINE_WIDTH, top, bottom: top + 20,
    width: LINE_WIDTH, height: 20, x: 0, y: top,
    toJSON() { return this; },
  };
}

function geometryRef(top) {
  return (node) => {
    if (node) node.getBoundingClientRect = () => rect(top);
  };
}

function Harness({ circular = true }) {
  const containerRef = useRef(null);
  const selection = useSequenceSelection({ initialCaret: 0 });
  const pointer = useSelectionState({
    fullSeq: SEQ,
    seqLength: SEQ.length,
    charsPerLine: LINE_CHARS,
    charPx: CHAR_PX,
    caretPos: selection.caretPos,
    caretAnchor: selection.caretAnchor,
    selectionMode: selection.selectionMode,
    selectionStrand: selection.selectionStrand,
    circular,
    onCaretChange: selection.onCaretChange,
    onSelectRange: selection.onSelectRange,
    containerRef,
  });

  const copied = selectionSlice({
    fullSeq: SEQ,
    anchor: selection.caretAnchor,
    focus: selection.caretPos,
    seqLength: SEQ.length,
  });

  return (
    <div
      ref={containerRef}
      data-testid="root"
      tabIndex={0}
      onPointerDown={pointer.onRootPointerDown}
      onPointerMove={pointer.onRootPointerMove}
      onPointerUp={pointer.onRootPointerUp}
      // Current production historically routed cancel through pointerup. The
      // fallback keeps this test RED until the hook exposes cleanup-only cancel.
      onPointerCancel={pointer.onRootPointerCancel || pointer.onRootPointerUp}
      onClick={pointer.onRootClickFallback}
    >
      {circular && (
        <div
          ref={geometryRef(0)}
          data-testid="leading"
          data-line-start="80"
          data-wraptail-kind="leading-wrap"
        >
          <span
            ref={geometryRef(0)}
            data-testid="leading-run"
            data-line-start="80"
          />
        </div>
      )}
      <div
        ref={geometryRef(30)}
        data-testid="main-0"
        data-line-start="0"
        data-wraptail-kind="main"
      >
        <span
          ref={geometryRef(30)}
          data-testid="main-0-run"
          data-line-start="0"
        />
      </div>
      <div
        ref={geometryRef(60)}
        data-testid="main-20"
        data-line-start="20"
        data-wraptail-kind="main"
      />
      {circular && (
        <div
          ref={geometryRef(90)}
          data-testid="bridge"
          data-line-start="80"
          data-wraps-origin="true"
          data-wrap-at="10"
        />
      )}
      <output data-testid="anchor">{selection.caretAnchor}</output>
      <output data-testid="focus">{selection.caretPos}</output>
      <output data-testid="copied">{copied}</output>
    </div>
  );
}

afterEach(cleanup);

describe('origin-crossing pointer selection', () => {
  it('resolves wrap metadata from the real line when the event hits a nested strand run', () => {
    render(<Harness />);
    const leadingRun = screen.getByTestId('leading-run');
    const mainRun = screen.getByTestId('main-0-run');

    // Production nucleotide runs inherit data-line-start but wrap metadata
    // lives on their sequence-view-line ancestor. Stopping at the nested run
    // turns display -20 into physical 80 and selects the long complement.
    fireEvent.pointerDown(leadingRun, {
      button: 0, pointerId: 17, clientX: 80, clientY: 10,
    });
    fireEvent.pointerMove(mainRun, {
      buttons: 1, pointerId: 17, clientX: 130, clientY: 40,
    });
    fireEvent.pointerUp(mainRun, {
      button: 0, pointerId: 17, clientX: 140, clientY: 40,
    });
    fireEvent.click(mainRun, { clientX: 140, clientY: 40 });

    expect(screen.getByTestId('anchor').textContent).toBe('-20');
    expect(screen.getByTestId('focus').textContent).toBe('6');
    expect(screen.getByTestId('copied').textContent)
      .toBe(SEQ.slice(80) + SEQ.slice(0, 6));
  });

  it('starts on the visible leading copy and keeps the pointerup endpoint in main', () => {
    render(<Harness />);
    const leading = screen.getByTestId('leading');
    const main = screen.getByTestId('main-0');

    // Leading boundary 80 is display coordinate -20. The last move reaches
    // main boundary 5, but pointerup lands at 6 and must be authoritative.
    fireEvent.pointerDown(leading, {
      button: 0, pointerId: 7, clientX: 80, clientY: 10,
    });
    fireEvent.pointerMove(main, {
      buttons: 1, pointerId: 7, clientX: 130, clientY: 40,
    });
    fireEvent.pointerUp(main, {
      button: 0, pointerId: 7, clientX: 140, clientY: 40,
    });
    // Chromium emits a synthetic click after the drag. It must not collapse it.
    fireEvent.click(main, { clientX: 140, clientY: 40 });

    expect(screen.getByTestId('anchor').textContent).toBe('-20');
    expect(screen.getByTestId('focus').textContent).toBe('6');
    expect(screen.getByTestId('copied').textContent)
      .toBe(SEQ.slice(80) + SEQ.slice(0, 6));
  });

  it('keeps an interim drag inside the leading copy local', () => {
    render(<Harness />);
    const leading = screen.getByTestId('leading');
    fireEvent.pointerDown(leading, {
      button: 0, pointerId: 8, clientX: 80, clientY: 10,
    });
    fireEvent.pointerMove(leading, {
      buttons: 1, pointerId: 8, clientX: 130, clientY: 10,
    });
    fireEvent.pointerUp(leading, {
      button: 0, pointerId: 8, clientX: 130, clientY: 10,
    });
    fireEvent.click(leading, { clientX: 130, clientY: 10 });

    expect(screen.getByTestId('anchor').textContent).toBe('-20');
    expect(screen.getByTestId('focus').textContent).toBe('-15');
    expect(screen.getByTestId('copied').textContent).toBe(SEQ.slice(80, 85));
  });

  it('uses the pointerup endpoint for a reverse main-to-leading drag', () => {
    render(<Harness />);
    const main = screen.getByTestId('main-0');
    const leading = screen.getByTestId('leading');
    fireEvent.pointerDown(main, {
      button: 0, pointerId: 9, clientX: 130, clientY: 40,
    });
    fireEvent.pointerMove(leading, {
      buttons: 1, pointerId: 9, clientX: 90, clientY: 10,
    });
    fireEvent.pointerUp(leading, {
      button: 0, pointerId: 9, clientX: 80, clientY: 10,
    });
    fireEvent.click(leading, { clientX: 80, clientY: 10 });

    expect(screen.getByTestId('anchor').textContent).toBe('5');
    expect(screen.getByTestId('focus').textContent).toBe('-20');
    expect(screen.getByTestId('copied').textContent)
      .toBe(SEQ.slice(80) + SEQ.slice(0, 5));
  });

  it('keeps a plain click on the leading copy as a no-op', () => {
    render(<Harness />);
    const leading = screen.getByTestId('leading');
    fireEvent.pointerDown(leading, {
      button: 0, pointerId: 10, clientX: 100, clientY: 10,
    });
    fireEvent.pointerUp(leading, {
      button: 0, pointerId: 10, clientX: 100, clientY: 10,
    });
    fireEvent.click(leading, { clientX: 100, clientY: 10 });
    expect(screen.getByTestId('anchor').textContent).toBe('0');
    expect(screen.getByTestId('focus').textContent).toBe('0');
  });

  it('keeps a plain click on the duplicated half of the bridge as a no-op', () => {
    render(<Harness />);
    const bridge = screen.getByTestId('bridge');
    // Fractional offset 12.04 is deliberate: pointerdown rounds it to 12,
    // while drag-style pointerup would ceil to 13 and fake a 1-bp gesture.
    fireEvent.pointerDown(bridge, {
      button: 0, pointerId: 12, clientX: 200.4, clientY: 100,
    });
    fireEvent.pointerUp(bridge, {
      button: 0, pointerId: 12, clientX: 200.4, clientY: 100,
    });
    fireEvent.click(bridge, { clientX: 200.4, clientY: 100 });
    expect(screen.getByTestId('anchor').textContent).toBe('0');
    expect(screen.getByTestId('focus').textContent).toBe('0');
  });

  it('keeps the controlled anchor when Shift-drag starts from a new focus', () => {
    render(<Harness />);
    const main = screen.getByTestId('main-0');

    // Establish anchor=focus=5.
    fireEvent.pointerDown(main, {
      button: 0, pointerId: 13, clientX: 130, clientY: 40,
    });
    fireEvent.pointerUp(main, {
      button: 0, pointerId: 13, clientX: 130, clientY: 40,
    });
    fireEvent.click(main, { clientX: 130, clientY: 40 });

    // Shift-down moves only focus to 15. At raw 10.4, rounding relative to
    // the original anchor 5 is ceil→11; treating clicked focus 15 as anchor
    // would incorrectly floor→10.
    fireEvent.pointerDown(main, {
      button: 0, pointerId: 14, clientX: 230, clientY: 40, shiftKey: true,
    });
    fireEvent.pointerMove(main, {
      buttons: 1, pointerId: 14, clientX: 184, clientY: 40, shiftKey: true,
    });
    fireEvent.pointerUp(main, {
      button: 0, pointerId: 14, clientX: 184, clientY: 40, shiftKey: true,
    });
    fireEvent.click(main, { clientX: 184, clientY: 40, shiftKey: true });

    expect(screen.getByTestId('anchor').textContent).toBe('5');
    expect(screen.getByTestId('focus').textContent).toBe('11');
  });

  it('canonicalises a ghost drag that returns exactly to its pending anchor', () => {
    render(<Harness />);
    const leading = screen.getByTestId('leading');
    const main = screen.getByTestId('main-0');
    fireEvent.pointerDown(leading, {
      button: 0, pointerId: 15, clientX: 80, clientY: 10,
    });
    fireEvent.pointerMove(main, {
      buttons: 1, pointerId: 15, clientX: 130, clientY: 40,
    });
    fireEvent.pointerUp(leading, {
      button: 0, pointerId: 15, clientX: 80, clientY: 10,
    });
    fireEvent.click(leading, { clientX: 80, clientY: 10 });

    // Display -20 is physical boundary 80. A collapsed caret must never leak
    // as a negative write coordinate after the gesture ends.
    expect(screen.getByTestId('anchor').textContent).toBe('80');
    expect(screen.getByTestId('focus').textContent).toBe('80');
  });

  it('pointercancel cleans up without treating cancel coordinates as pointerup', () => {
    render(<Harness />);
    const leading = screen.getByTestId('leading');
    const main = screen.getByTestId('main-0');
    fireEvent.pointerDown(leading, {
      button: 0, pointerId: 16, clientX: 80, clientY: 10,
    });
    fireEvent.pointerMove(main, {
      buttons: 1, pointerId: 16, clientX: 130, clientY: 40,
    });
    // Move established focus=5. The arbitrary cancel coordinate points at 12
    // and must not become a new authoritative endpoint.
    fireEvent.pointerCancel(main, {
      pointerId: 16, clientX: 200, clientY: 40,
    });
    expect(screen.getByTestId('anchor').textContent).toBe('-20');
    expect(screen.getByTestId('focus').textContent).toBe('5');
  });

  it('leaves ordinary linear multi-line drag behaviour unchanged', () => {
    render(<Harness circular={false} />);
    const first = screen.getByTestId('main-0');
    const second = screen.getByTestId('main-20');
    fireEvent.pointerDown(first, {
      button: 0, pointerId: 11, clientX: 130, clientY: 40,
    });
    fireEvent.pointerMove(second, {
      buttons: 1, pointerId: 11, clientX: 120, clientY: 70,
    });
    fireEvent.pointerUp(second, {
      button: 0, pointerId: 11, clientX: 130, clientY: 70,
    });
    fireEvent.click(second, { clientX: 130, clientY: 70 });
    expect(screen.getByTestId('anchor').textContent).toBe('5');
    expect(screen.getByTestId('focus').textContent).toBe('25');
    expect(screen.getByTestId('copied').textContent).toBe(SEQ.slice(5, 25));
  });
});
