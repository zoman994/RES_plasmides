/**
 * V96 — overlay geometry recompute after two-phase render.
 *
 * Every line-measuring overlay reads strand-row geometry in a
 * useLayoutEffect. Before the fix none of them re-ran when the
 * SequenceView two-phase render flipped `tracksReady` (lines grow
 * taller / shift down once the heavy annotation + AA tracks mount),
 * so the selection / mask / caret / search / zone rects stayed pinned
 * to the phase-1 geometry until an unrelated dep (a click moving the
 * caret) forced a re-run. The fix threads a `layoutEpoch` counter
 * (bumped in index.jsx whenever `linesJsx` changes) into each overlay
 * and lists it in the effect deps.
 *
 * happy-dom returns 0 for offset* by default, so we stub the prototype
 * getters (same trick as wrap-bridge-caret.test.jsx) and drive the
 * line geometry through a mutable module variable. Each test:
 *   phase A — mount, assert the rect sits at geometry A;
 *   phase B — mutate the geometry + bump `layoutEpoch`, assert the
 *             rect recomputed to geometry B (which only happens when
 *             `layoutEpoch` is in the effect deps — i.e. the fix).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { useRef, useEffect, useState } from 'react';
import SelectionOverlay from '../overlays/SelectionOverlay.jsx';
import OutOfRangeMaskOverlay from '../overlays/OutOfRangeMaskOverlay.jsx';
import CaretOverlay from '../overlays/CaretOverlay.jsx';
import SearchHitsOverlay from '../overlays/SearchHitsOverlay.jsx';
import SegmentZonesOverlay from '../overlays/SegmentZonesOverlay.jsx';

const CHAR_PX = 7.2;

// Stable references so the ONLY dep that changes between phase A and
// phase B is `layoutEpoch` — a fresh `[...]` literal per render would
// change `hits` / `zones` identity and re-run the effect on its own,
// masking whether `layoutEpoch` is the trigger.
const STABLE_HITS = [
  { targetStart: 5, targetEnd: 30, strand: 1, queryIdentity: 1, mismatchPositions: [] },
];
const STABLE_ZONES = [{ zoneId: 'z1', start: 5, end: 40, color: '#3366cc' }];

// Mutable top offset of EVERY element — overlays read offsetTop off
// the prototype, so flipping this between renders simulates the
// phase-1 → phase-2 reflow. offsetLeft pinned 0; offsetHeight const.
let LINE_OFFSET_TOP = 100;

beforeEach(() => {
  LINE_OFFSET_TOP = 100;
  Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() { return LINE_OFFSET_TOP; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() { return 0; },
  });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() { return 18; },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// React 19 runs a child's useLayoutEffect before the parent ref is
// observable from inside the child. Defer the overlay mount one tick
// (same pattern as wrap-bridge-caret.test.jsx) so containerRef.current
// is populated when the overlay's effect first runs.
function useDeferredMount() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

describe('V96 — overlays recompute geometry on layoutEpoch bump', () => {
  it('1) SelectionOverlay re-measures the orange rect', async () => {
    function Host({ epoch }) {
      const ref = useRef(null);
      const mounted = useDeferredMount();
      return (
        <div ref={ref} style={{ position: 'relative' }}>
          <div data-testid="sequence-view-line" data-line-start="0" />
          {mounted ? (
            <SelectionOverlay
              caretAnchor={2}
              caretPos={20}
              charPx={CHAR_PX}
              charsPerLine={80}
              containerRef={ref}
              showBottomStrand
              selectionMode="dna"
              selectionStrand={1}
              selectionFrame={null}
              seqLength={100}
              layoutEpoch={epoch}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Host epoch={0} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-selection').style.top).toBe('100px');
    });
    LINE_OFFSET_TOP = 400;
    rerender(<Host epoch={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-selection').style.top).toBe('400px');
    });
  });

  it('2) OutOfRangeMaskOverlay re-measures the dim rects', async () => {
    function Host({ epoch }) {
      const ref = useRef(null);
      const mounted = useDeferredMount();
      return (
        <div ref={ref} style={{ position: 'relative' }}>
          <div data-testid="sequence-view-line" data-line-start="0" />
          {mounted ? (
            <OutOfRangeMaskOverlay
              rangeStart={20}
              rangeEnd={60}
              charPx={CHAR_PX}
              charsPerLine={80}
              containerRef={ref}
              seqLength={80}
              layoutEpoch={epoch}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Host epoch={0} />);
    await waitFor(() => {
      const rects = screen.getAllByTestId('sequence-view-oor-mask');
      expect(rects.length).toBeGreaterThan(0);
      rects.forEach((r) => expect(r.style.top).toBe('100px'));
    });
    LINE_OFFSET_TOP = 400;
    rerender(<Host epoch={1} />);
    await waitFor(() => {
      const rects = screen.getAllByTestId('sequence-view-oor-mask');
      expect(rects.length).toBeGreaterThan(0);
      rects.forEach((r) => expect(r.style.top).toBe('400px'));
    });
  });

  it('3) CaretOverlay re-measures the caret box', async () => {
    function Host({ epoch }) {
      const ref = useRef(null);
      const mounted = useDeferredMount();
      return (
        <div ref={ref} style={{ position: 'relative' }}>
          <div data-testid="sequence-view-line" data-line-start="0" />
          {mounted ? (
            <CaretOverlay
              caretPos={20}
              charPx={CHAR_PX}
              containerRef={ref}
              showBottomStrand
              seqLength={100}
              charsPerLine={80}
              layoutEpoch={epoch}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Host epoch={0} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-caret').style.transform).toContain(', 100px, 0)');
    });
    LINE_OFFSET_TOP = 400;
    rerender(<Host epoch={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-caret').style.transform).toContain(', 400px, 0)');
    });
  });

  it('4) SearchHitsOverlay re-measures the hit rect', async () => {
    function Host({ epoch }) {
      const ref = useRef(null);
      const mounted = useDeferredMount();
      return (
        <div ref={ref} style={{ position: 'relative' }}>
          <div data-testid="sequence-view-line" data-line-start="0" />
          {mounted ? (
            <SearchHitsOverlay
              hits={STABLE_HITS}
              charPx={CHAR_PX}
              charsPerLine={80}
              containerRef={ref}
              layoutEpoch={epoch}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Host epoch={0} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-search-hit-fwd').style.top).toBe('100px');
    });
    LINE_OFFSET_TOP = 400;
    rerender(<Host epoch={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-search-hit-fwd').style.top).toBe('400px');
    });
  });

  it('5) SegmentZonesOverlay re-measures the colour band', async () => {
    function Host({ epoch }) {
      const ref = useRef(null);
      const mounted = useDeferredMount();
      return (
        <div ref={ref} style={{ position: 'relative' }}>
          <div data-testid="sequence-view-line" data-line-start="0">
            <div data-testid="sequence-view-strands" />
          </div>
          {mounted ? (
            <SegmentZonesOverlay
              zones={STABLE_ZONES}
              charPx={CHAR_PX}
              charsPerLine={80}
              containerRef={ref}
              layoutEpoch={epoch}
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Host epoch={0} />);
    // top = lineTop (100) + strandTop (100) = 200.
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-zone').style.top).toBe('200px');
    });
    LINE_OFFSET_TOP = 400;
    rerender(<Host epoch={1} />);
    await waitFor(() => {
      expect(screen.getByTestId('sequence-view-zone').style.top).toBe('800px');
    });
  });
});
