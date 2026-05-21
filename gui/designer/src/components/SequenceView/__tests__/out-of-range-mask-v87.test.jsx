/**
 * V87 — OutOfRangeMaskOverlay renders dim rects outside the picker
 * range. happy-dom doesn't compute real DOM rects, so we only assert
 * the overlay mounts/unmounts on prop changes and never renders rects
 * without a valid range.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import OutOfRangeMaskOverlay from '../overlays/OutOfRangeMaskOverlay';

afterEach(cleanup);

function Host({ rangeStart, rangeEnd, seqLength = 100 }) {
  const containerRef = useRef(null);
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Two fake "main" lines so the overlay layoutEffect has DOM to query. */}
      <div data-testid="sequence-view-line" data-line-start="0" />
      <div data-testid="sequence-view-line" data-line-start="80" />
      <OutOfRangeMaskOverlay
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        seqLength={seqLength}
        charPx={7}
        charsPerLine={80}
        containerRef={containerRef}
      />
    </div>
  );
}

describe('V87 — OutOfRangeMaskOverlay', () => {
  it('renders nothing without a valid range', () => {
    render(<Host rangeStart={undefined} rangeEnd={undefined} />);
    expect(screen.queryAllByTestId('sequence-view-oor-mask')).toHaveLength(0);
  });

  it('renders nothing when end <= start (empty range)', () => {
    render(<Host rangeStart={10} rangeEnd={10} />);
    expect(screen.queryAllByTestId('sequence-view-oor-mask')).toHaveLength(0);
  });

  it('renders nothing when range covers full sequence', () => {
    render(<Host rangeStart={0} rangeEnd={100} seqLength={100} />);
    // OOR segments [0,0) and [100,100) are both empty → no rects.
    expect(screen.queryAllByTestId('sequence-view-oor-mask')).toHaveLength(0);
  });

  it('does not throw when range is valid (smoke)', () => {
    // happy-dom не fully evaluates useLayoutEffect-driven DOM layout
    // queries, поэтому overlay реальные rect-числа здесь не проверяем —
    // ловим интеграцию: компонент не падает, при невалидном диапазоне
    // ничего не рисует, при валидном — initialized без ошибок.
    expect(() => render(<Host rangeStart={20} rangeEnd={60} seqLength={100} />))
      .not.toThrow();
  });
});
