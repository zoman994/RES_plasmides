/**
 * SearchHitsOverlay — TD-SEARCH-OVERLAY-RECTS regression.
 *
 * happy-dom doesn't compute offsetTop / offsetLeft for absolutely-
 * positioned elements without a real layout, so this test only
 * pins the contract «empty hits → null render, no DOM, no crash».
 * Visual correctness of rect positions is exercised at the
 * SequenceView integration level (next sprint, after biolog
 * acceptance of the visual baseline).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useRef } from 'react';
import SearchHitsOverlay from '../overlays/SearchHitsOverlay.jsx';

afterEach(cleanup);

function MountedOverlay({ hits }) {
  const containerRef = useRef(null);
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <SearchHitsOverlay
        hits={hits}
        charPx={7.2}
        charsPerLine={80}
        containerRef={containerRef}
      />
    </div>
  );
}

describe('SearchHitsOverlay', () => {
  it('renders nothing when hits = []', () => {
    render(<MountedOverlay hits={[]} />);
    expect(screen.queryByTestId('sequence-view-search-hit-fwd')).toBeNull();
    expect(screen.queryByTestId('sequence-view-search-hit-rev')).toBeNull();
    expect(screen.queryByTestId('sequence-view-search-mismatch-tick')).toBeNull();
  });

  it('renders nothing when no sequence-view lines are present (graceful no-op)', () => {
    render(<MountedOverlay hits={[
      { targetStart: 0, targetEnd: 10, strand: 1, queryIdentity: 1.0, mismatchPositions: [] },
    ]} />);
    expect(screen.queryByTestId('sequence-view-search-hit-fwd')).toBeNull();
  });

  it('does not throw on null hits / undefined containerRef target', () => {
    expect(() => render(<MountedOverlay hits={null} />)).not.toThrow();
  });
});
