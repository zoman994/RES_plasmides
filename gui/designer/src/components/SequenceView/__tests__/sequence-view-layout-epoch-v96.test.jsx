/**
 * V96 integration — SequenceView threads `layoutEpoch` into its
 * overlays and bumps it whenever the rendered lines (`linesJsx`)
 * change.
 *
 * The real two-phase flip (`tracksReady` false → true) doesn't happen
 * under __IS_TEST_ENV__ (tracksReady starts true), so we can't observe
 * the flip directly. Instead we mock SelectionOverlay to expose the
 * `layoutEpoch` prop it receives and assert:
 *   (a) it's a finite number (the prop is actually threaded), and
 *   (b) it increments when `fullSeq` changes — which is exactly the
 *       class of layout reflow (lines rebuilt) the fix must react to.
 *
 * Without the fix index.jsx never passes `layoutEpoch`, so the mock
 * reads `undefined` → NaN → (a) fails.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

vi.mock('../overlays/SelectionOverlay.jsx', () => ({
  default: ({ layoutEpoch }) => (
    <div data-testid="epoch-probe" data-epoch={String(layoutEpoch)} />
  ),
}));

import SequenceView from '../index';
import { useStore } from '../../../store';

function makeFragment(sequence) {
  return {
    id: 'frag-1',
    name: 'demo',
    type: 'CDS',
    sequence,
    strand: 1,
    annotations: [],
  };
}

beforeEach(() => {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true,
      framesMode: 'auto',
      autoThreshold: 0.8,
      primerStyle: 'filled',
      reOrientation: 'vertical',
      predictions: {
        cds: false, sgRNA: false, promoter: false, terminator: false, threshold: 0.5,
      },
    },
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('V96 — SequenceView layoutEpoch wiring', () => {
  it('threads a numeric layoutEpoch that increments when lines change', async () => {
    const { rerender } = render(
      <SequenceView fragments={[makeFragment('ATGC'.repeat(20))]} />,
    );
    const e0 = await waitFor(() => {
      const probe = screen.getByTestId('epoch-probe');
      const v = Number(probe.getAttribute('data-epoch'));
      expect(Number.isFinite(v)).toBe(true);
      return v;
    });
    // Different sequence (different length) → fullSeq changes →
    // `linesJsx` ref changes → the layoutEpoch effect fires.
    rerender(<SequenceView fragments={[makeFragment('GGCCTT'.repeat(40))]} />);
    await waitFor(() => {
      const v = Number(screen.getByTestId('epoch-probe').getAttribute('data-epoch'));
      expect(v).toBeGreaterThan(e0);
    });
  });
});
