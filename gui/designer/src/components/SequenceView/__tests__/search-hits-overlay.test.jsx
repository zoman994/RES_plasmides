/**
 * SearchHitsOverlay — TD-SEARCH-OVERLAY-RECTS + canonical-occurrence migration.
 *
 * The overlay now normalizes TWO input shapes into paintable bands:
 *   • canonical occurrence (popover → searchHits): `location.segments` × `location.strand` +
 *     `metrics.identityBps` — one band per segment, strand → which strand row(s);
 *   • legacy flat hit (AlignReferenceView): `targetStart/targetEnd/strand/mismatchPositions`.
 *
 * happy-dom does not lay out absolutely-positioned rects, but the overlay still PUSHES a rect per
 * (band × strand row × intersecting line), so we can assert the COUNT and strand-direction of the
 * bands (fwd / rev) — segments, `+`/`−`/`both`, wrap, and the preserved mismatch ticks.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useRef, useState, useEffect } from 'react';
import SearchHitsOverlay from '../overlays/SearchHitsOverlay.jsx';

// The child overlay's useLayoutEffect runs BEFORE the parent div's ref attaches, so the overlay must
// mount one tick later (once containerRef.current is set) — same deferral the SequenceView provides
// in production and overlay-layout-epoch uses in tests.
function useDeferredMount() {
  const [m, setM] = useState(false);
  // The deferral IS the fixture: the overlay must not exist on the first render, and must exist on
  // the second, so the ref it measures is already attached. A cascading render is what is being
  // arranged here, not an accident — in production the SequenceView provides the same one tick.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- see above; test-only helper
  useEffect(() => { setM(true); }, []);
  return m;
}

// happy-dom returns undefined for offset* on un-laid-out elements; stub the prototype getters so the
// overlay's line-probe produces real geometry and pushes rects (same trick as overlay-layout-epoch).
beforeEach(() => {
  for (const prop of ['offsetTop', 'offsetLeft', 'offsetHeight']) {
    Object.defineProperty(window.HTMLElement.prototype, prop, {
      configurable: true,
      get() { return prop === 'offsetHeight' ? 18 : 0; },
    });
  }
});
afterEach(cleanup);

/** No lines → the graceful no-op path (empty / null / no-lines). */
function BareOverlay({ hits }) {
  const containerRef = useRef(null);
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <SearchHitsOverlay hits={hits} charPx={7.2} charsPerLine={80} containerRef={containerRef} />
    </div>
  );
}

/** Two main lines (0–79, 80–159), each with top + bottom strand rows. */
function OverlayWithLines({ hits }) {
  const containerRef = useRef(null);
  const mounted = useDeferredMount();
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div data-testid="sequence-view-line" data-line-start="0">
        <div data-testid="sequence-view-strands-top" />
        <div data-testid="sequence-view-strands-bottom" />
      </div>
      <div data-testid="sequence-view-line" data-line-start="80">
        <div data-testid="sequence-view-strands-top" />
        <div data-testid="sequence-view-strands-bottom" />
      </div>
      {mounted ? (
        <SearchHitsOverlay hits={hits} charPx={7.2} charsPerLine={80} containerRef={containerRef} />
      ) : null}
    </div>
  );
}

const canon = (strand, segments, identityBps = 10000) => ({
  location: { segments, strand, wrapsOrigin: segments.length > 1 },
  metrics: { identityBps },
});
const fwd = () => screen.queryAllByTestId('sequence-view-search-hit-fwd');
const rev = () => screen.queryAllByTestId('sequence-view-search-hit-rev');
const ticks = () => screen.queryAllByTestId('sequence-view-search-mismatch-tick');

describe('SearchHitsOverlay — graceful no-op', () => {
  it('renders nothing when hits = []', () => {
    render(<BareOverlay hits={[]} />);
    expect(fwd()).toHaveLength(0);
    expect(rev()).toHaveLength(0);
    expect(ticks()).toHaveLength(0);
  });

  it('renders nothing when no sequence-view lines are present', () => {
    render(<BareOverlay hits={[{ targetStart: 0, targetEnd: 10, strand: 1, queryIdentity: 1.0, mismatchPositions: [] }]} />);
    expect(fwd()).toHaveLength(0);
  });

  it('does not throw on null hits', () => {
    expect(() => render(<BareOverlay hits={null} />)).not.toThrow();
  });
});

describe('SearchHitsOverlay — canonical occurrences', () => {
  it('a + occurrence paints the TOP strand only', () => {
    render(<OverlayWithLines hits={[canon('+', [{ start: 10, end: 20 }])]} />);
    expect(fwd()).toHaveLength(1);
    expect(rev()).toHaveLength(0);
  });

  it('a − occurrence paints the BOTTOM strand only', () => {
    render(<OverlayWithLines hits={[canon('-', [{ start: 10, end: 20 }])]} />);
    expect(rev()).toHaveLength(1);
    expect(fwd()).toHaveLength(0);
  });

  it('a `both` occurrence paints BOTH strands (one band on each)', () => {
    render(<OverlayWithLines hits={[canon('both', [{ start: 10, end: 20 }])]} />);
    expect(fwd()).toHaveLength(1);
    expect(rev()).toHaveLength(1);
  });

  it('an origin wrap paints BOTH segments (one band each), not a merged range', () => {
    render(<OverlayWithLines hits={[canon('+', [{ start: 0, end: 6 }, { start: 70, end: 80 }])]} />);
    expect(fwd()).toHaveLength(2);
    expect(rev()).toHaveLength(0);
  });

  it('a canonical occurrence carries NO mismatch ticks', () => {
    render(<OverlayWithLines hits={[canon('+', [{ start: 10, end: 20 }])]} />);
    expect(ticks()).toHaveLength(0);
  });
});

describe('SearchHitsOverlay — legacy flat path (AlignReferenceView) is preserved', () => {
  it('a flat hit still paints its band + mismatch ticks', () => {
    render(<OverlayWithLines hits={[{ targetStart: 10, targetEnd: 20, strand: 1, queryIdentity: 1, mismatchPositions: [12, 15] }]} />);
    expect(fwd()).toHaveLength(1);
    expect(ticks()).toHaveLength(2);
  });

  it('a reverse-strand flat hit paints the bottom strand', () => {
    render(<OverlayWithLines hits={[{ targetStart: 10, targetEnd: 20, strand: -1, queryIdentity: 1, mismatchPositions: [] }]} />);
    expect(rev()).toHaveLength(1);
    expect(fwd()).toHaveLength(0);
  });
});
