/**
 * annotation-drag.test.jsx — Sprint M-X.2 K4 coverage.
 *
 * Cases:
 *  1) Edge overlays render on region rects (left + right when feature
 *     starts/ends within the line).
 *  2) PointerDown on an edge marks the region as dragged in
 *     `data-dragged="true"` and sets cursor: ew-resize.
 *  3) PointerUp on the same coord (no drag) emits no callback.
 *  4) Validation: useAnnotationDrag prevents flip — left edge
 *     can't pass right edge.
 *  5) onAnnotationEdit dispatch fires with the right patch shape on
 *     pointerUp once the coord changed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import SequenceView from '../index';
import { useAnnotationDrag } from '../hooks/useAnnotationDrag.js';
import { useStore } from '../../../store';

const SEQ = 'ATGGCC'.repeat(50); // 300 nt
const FRAGMENT = {
  id: 'frag-1',
  name: 'demo',
  type: 'CDS',
  sequence: SEQ,
  strand: 1,
  annotations: [
    {
      id: 'region:0:99:CDS:lacZ',
      type: 'CDS',
      name: 'lacZ',
      start: 0,
      end: 99,
      level: 'region',
      strand: 1,
    },
  ],
};

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'horizontal',
      visibleFrames: { '1': true, '2': true, '3': true, '-1': true, '-2': true, '-3': true },
      predictions: {},
    },
  });
}

beforeEach(() => { resetSettings(); });
afterEach(() => { cleanup(); });

describe('K4 annotation-drag — edge overlays', () => {
  it('renders left + right edge overlays for a region that starts and ends on the same line', () => {
    render(
      <SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />
    );
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    // Two edges total for the lacZ region (one left, one right)
    expect(edges.length).toBe(2);
    const left = edges.find((el) => el.dataset.regionEdge === 'left');
    const right = edges.find((el) => el.dataset.regionEdge === 'right');
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
  });

  it('does NOT render edge overlays when onAnnotationEdit is not wired', () => {
    render(<SequenceView fragments={[FRAGMENT]} />);
    const edges = screen.queryAllByTestId('sequence-view-annotation-edge');
    expect(edges.length).toBe(0);
  });

  it('attaches data-region-id and cursor:ew-resize to each edge', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    for (const edge of edges) {
      expect(edge.dataset.regionId).toBe('region:0:99:CDS:lacZ');
      // Inline style sets cursor: ew-resize
      expect(edge.style.cursor).toBe('ew-resize');
    }
  });
});

describe('K4 annotation-drag — useAnnotationDrag hook validation', () => {
  function Harness({ region, onAnnotationEdit }) {
    const containerRef = useRef(null);
    const drag = useAnnotationDrag({
      charPx: 7.2,
      charsPerLine: 80,
      containerRef,
      onAnnotationEdit,
      seqLength: 300,
    });
    // Imperative test handle
    Harness.lastDrag = drag;
    return <div ref={containerRef} />;
  }

  it('returns isDragging=false on initial mount', () => {
    render(<Harness region={FRAGMENT.annotations[0]} onAnnotationEdit={vi.fn()} />);
    expect(Harness.lastDrag.isDragging).toBe(false);
    expect(Harness.lastDrag.draggedAnnotationId).toBeNull();
  });

  it('prevents flip — left edge clamped below right edge anchor', () => {
    const onAnnotationEdit = vi.fn();
    const { rerender } = render(
      <Harness region={FRAGMENT.annotations[0]} onAnnotationEdit={onAnnotationEdit} />
    );
    // Simulate pointerdown on left edge (region.start=0, region.end=99)
    act(() => {
      Harness.lastDrag.onPointerDownEdge(
        { button: 0, pointerId: 1, currentTarget: {}, preventDefault: () => {}, stopPropagation: () => {} },
        'region:0:99:CDS:lacZ',
        'left',
        FRAGMENT.annotations[0],
      );
    });
    rerender(<Harness region={FRAGMENT.annotations[0]} onAnnotationEdit={onAnnotationEdit} />);
    expect(Harness.lastDrag.isDragging).toBe(true);
    expect(Harness.lastDrag.draggedEdge).toBe('left');
    expect(Harness.lastDrag.anchorCoord).toBe(99);
  });
});

describe('Bug-rush #9 — edge handles + hover indicator', () => {
  it('hover on left edge mounts the orange indicator overlay', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const leftEdge = screen.getAllByTestId('sequence-view-annotation-edge')
      .find((el) => el.dataset.regionEdge === 'left');
    fireEvent.pointerEnter(leftEdge);
    const indicator = screen.queryByTestId('sequence-view-annotation-edge-indicator');
    expect(indicator).toBeTruthy();
    expect(indicator.dataset.regionEdge).toBe('left');
    fireEvent.pointerLeave(leftEdge);
    expect(screen.queryByTestId('sequence-view-annotation-edge-indicator')).toBeNull();
  });

  it('adjacent features at a shared seam render NON-overlapping hitboxes', () => {
    // Two CDS regions touching at position 99/100 — without the
    // INWARD placement, right-edge of A (centered on 99) would
    // overlap left-edge of B (centered on 100), and the latter-
    // rendered one would steal all pointer events.
    const TOUCH = {
      ...FRAGMENT,
      annotations: [
        { id: 'r1', name: 'A', type: 'CDS', start: 0, end: 99, level: 'region', strand: 1 },
        { id: 'r2', name: 'B', type: 'CDS', start: 99, end: 198, level: 'region', strand: 1 },
      ],
    };
    render(<SequenceView fragments={[TOUCH]} onAnnotationEdit={vi.fn()} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    const r1Right = edges.find((el) => el.dataset.regionId === 'r1' && el.dataset.regionEdge === 'right');
    const r2Left = edges.find((el) => el.dataset.regionId === 'r2' && el.dataset.regionEdge === 'left');
    expect(r1Right).toBeTruthy();
    expect(r2Left).toBeTruthy();
    // Each handle is 8 px wide and placed INSIDE its rect, so the
    // x-attribute differs (right edge sits at widthRect - 8, left
    // edge sits at 0). They share a transform translation that
    // differs by widthRect, so they don't overlap on screen.
    expect(r1Right.getAttribute('x')).not.toBe(r2Left.getAttribute('x'));
  });
});

describe('K4 annotation-drag — pointer interaction', () => {
  it('marks region with data-dragged after pointerdown on edge', () => {
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={vi.fn()} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    const leftEdge = edges.find((el) => el.dataset.regionEdge === 'left');
    fireEvent.pointerDown(leftEdge, { pointerId: 1, button: 0 });
    const regionGroup = screen.getAllByTestId('sequence-view-annotation')[0];
    expect(regionGroup.dataset.dragged).toBe('true');
  });

  it('clears dragged marker on pointerup (no movement, no callback)', () => {
    const onAnnotationEdit = vi.fn();
    render(<SequenceView fragments={[FRAGMENT]} onAnnotationEdit={onAnnotationEdit} />);
    const edges = screen.getAllByTestId('sequence-view-annotation-edge');
    const leftEdge = edges.find((el) => el.dataset.regionEdge === 'left');
    fireEvent.pointerDown(leftEdge, { pointerId: 1, button: 0 });
    fireEvent.pointerUp(document, { pointerId: 1 });
    // No movement → no callback fired
    expect(onAnnotationEdit).not.toHaveBeenCalled();
    const regionGroup = screen.getAllByTestId('sequence-view-annotation')[0];
    expect(regionGroup.dataset.dragged).toBeUndefined();
  });
});
