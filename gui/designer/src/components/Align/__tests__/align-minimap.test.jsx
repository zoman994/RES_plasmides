import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AlignMiniMap from '../AlignMiniMap';

afterEach(cleanup);

const annotations = [{ id: 'r1', level: 'region', type: 'CDS', name: 'lacZ', start: 10, end: 40 }];

describe('AlignMiniMap', () => {
  it('renders the strip, a feature tick, the read span and the viewport carriage', () => {
    render(
      <AlignMiniMap
        seqLen={100}
        annotations={annotations}
        readSpan={{ start: 20, end: 80, strand: 1 }}
        visibleRange={{ start: 0, end: 50 }}
        width={200}
        onScrubTo={() => {}}
      />,
    );
    expect(screen.getByTestId('align-minimap-strip')).toBeTruthy();
    expect(screen.getAllByTestId('align-minimap-feature').length).toBe(1);
    expect(screen.getByTestId('align-minimap-readspan')).toBeTruthy();
    expect(screen.getByTestId('align-minimap-carriage')).toBeTruthy();
  });

  it('click on the strip jumps to that reference position', () => {
    const onScrubTo = vi.fn();
    render(<AlignMiniMap seqLen={100} annotations={[]} width={200} onScrubTo={onScrubTo} />);
    fireEvent.click(screen.getByTestId('align-minimap-strip'), { clientX: 100 });
    expect(onScrubTo).toHaveBeenCalledWith(50); // centre of a 200px / 100bp strip
  });

  it('dragging the carriage scrubs toward the pointer position', () => {
    const onScrubTo = vi.fn();
    render(<AlignMiniMap seqLen={100} annotations={[]} visibleRange={{ start: 0, end: 20 }} width={200} onScrubTo={onScrubTo} />);
    const car = screen.getByTestId('align-minimap-carriage');
    fireEvent.pointerDown(car, { pointerId: 1, clientX: 10 });
    fireEvent.pointerMove(car, { pointerId: 1, clientX: 150 });
    expect(onScrubTo).toHaveBeenCalled();
    const last = onScrubTo.mock.calls[onScrubTo.mock.calls.length - 1][0];
    expect(last).toBeGreaterThan(60); // pointer near the right third → high position
  });

  it('does not scrub on a stray pointer-move without a drag', () => {
    const onScrubTo = vi.fn();
    render(<AlignMiniMap seqLen={100} annotations={[]} visibleRange={{ start: 0, end: 20 }} width={200} onScrubTo={onScrubTo} />);
    fireEvent.pointerMove(screen.getByTestId('align-minimap-carriage'), { pointerId: 1, clientX: 150 });
    expect(onScrubTo).not.toHaveBeenCalled();
  });

  it('renders nothing for an empty reference', () => {
    const { container } = render(<AlignMiniMap seqLen={0} width={200} onScrubTo={() => {}} />);
    expect(container.querySelector('[data-testid="align-minimap"]')).toBeNull();
  });
});
