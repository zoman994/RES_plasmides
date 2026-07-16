/**
 * V195 — «при инверсии обжирает липкие концы» (Игорь 07.07). SelectionOverlay used to
 * gate its sticky-end staircase entirely off when `inverted` (line 80 `!inverted`), so
 * pressing «Инвертировать» in the assembly picker replaced the staggered top/bottom
 * strands with flat complement rects — the ends looked eaten. Now an inverted-sticky
 * branch paints the BACKBONE's own staircase (top wraps the origin, bottom staggered by
 * each cut delta) and veils the excised insert STRAND-AWARE (so the veil never re-covers
 * the backbone's protruding overhang sliver).
 *
 * happy-dom returns 0 for offset*, so we stub the prototype getters + defer the overlay
 * mount one tick (same trick as overlay-layout-epoch-v96.test.jsx).
 */
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, waitFor,
} from '@testing-library/react';
import { useRef, useEffect, useState } from 'react';
import SelectionOverlay from '../overlays/SelectionOverlay.jsx';

const CHAR_PX = 7.2;

beforeEach(() => {
  Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', { configurable: true, get() { return 100; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', { configurable: true, get() { return 0; } });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 9; } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function useDeferredMount() {
  const [m, setM] = useState(false);
  useEffect(() => { setM(true); }, []);
  return m;
}

// Excise [6,20] between two 5′ cutters (leftDelta +4 at the low cut, rightDelta +4 at
// the high cut) on a 30 bp circular plasmid → backbone = complement [20,30]+[0,6].
const STICKY = {
  leftDelta: 4,
  rightDelta: 4,
  left: { enzyme: 'EcoRI', delta: 4, type: '5prime', overhang: 'AATT' },
  right: { enzyme: 'BamHI', delta: 4, type: '5prime', overhang: 'GATC' },
};

function Host({ inverted }) {
  const ref = useRef(null);
  const mounted = useDeferredMount();
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div data-testid="sequence-view-line" data-line-start="0">
        <div data-testid="sequence-view-strands-top" />
        <div data-testid="sequence-view-strands-bottom" />
      </div>
      {mounted ? (
        <SelectionOverlay
          caretAnchor={6}
          caretPos={20}
          charPx={CHAR_PX}
          charsPerLine={80}
          containerRef={ref}
          showBottomStrand
          selectionMode="dna"
          selectionStrand={1}
          selectionFrame={null}
          seqLength={30}
          inverted={inverted}
          stickyEnds={STICKY}
          layoutEpoch={0}
        />
      ) : null}
    </div>
  );
}

const rects = () => screen.queryAllByTestId('sequence-view-selection');
const byStrand = (s) => rects().filter((n) => n.getAttribute('data-strand') === s);
const dim = () => rects().filter((n) => n.getAttribute('data-inverted') === 'true');
const backbone = () => rects().filter((n) => n.getAttribute('data-strand') && !n.getAttribute('data-inverted'));

describe('SelectionOverlay — inverted-sticky backbone staircase (V195)', () => {
  it('inverted + sticky → paints BOTH a top and a bottom backbone strand (staircase survives invert)', async () => {
    render(<Host inverted />);
    await waitFor(() => { expect(rects().length).toBeGreaterThan(0); });
    // The backbone (non-dim) staircase has both strands — this is exactly what was gone.
    expect(byStrand('top').some((n) => !n.getAttribute('data-inverted'))).toBe(true);
    expect(byStrand('bottom').some((n) => !n.getAttribute('data-inverted'))).toBe(true);
    expect(backbone().length).toBeGreaterThan(0);
  });

  it('inverted + sticky → the excised insert is veiled STRAND-AWARE (dim rects present, not a full block)', async () => {
    render(<Host inverted />);
    await waitFor(() => { expect(rects().length).toBeGreaterThan(0); });
    const veiled = dim();
    expect(veiled.length).toBeGreaterThan(0);
    // veils are per-strand (carry data-strand), never a single blanket rectangle over [6,20]
    expect(veiled.every((n) => n.getAttribute('data-strand'))).toBe(true);
  });

  it('backbone bottom strand is STAGGERED vs its top (offset by the cut delta, not flush)', async () => {
    render(<Host inverted />);
    await waitFor(() => { expect(rects().length).toBeGreaterThan(0); });
    // seg1 top [20,30] left = LABEL_WIDTH+20·px; bottom [24,30] left = LABEL_WIDTH+24·px → different.
    const topLefts = byStrand('top').filter((n) => !n.getAttribute('data-inverted')).map((n) => n.style.left);
    const botLefts = byStrand('bottom').filter((n) => !n.getAttribute('data-inverted')).map((n) => n.style.left);
    // at least one bottom edge is offset from every top edge (the overhang stagger)
    expect(botLefts.some((b) => !topLefts.includes(b))).toBe(true);
  });

  it('non-inverted control: normal staircase (all rects non-dim)', async () => {
    render(<Host inverted={false} />);
    await waitFor(() => { expect(rects().length).toBeGreaterThan(0); });
    expect(dim().length).toBe(0); // no veil when not inverted
    expect(byStrand('top').length).toBeGreaterThan(0);
    expect(byStrand('bottom').length).toBeGreaterThan(0);
  });
});
