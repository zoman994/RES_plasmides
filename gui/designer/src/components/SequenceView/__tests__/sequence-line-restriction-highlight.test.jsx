/**
 * sequence-line-restriction-highlight.test.jsx
 *
 * Locks the click-to-highlight chain:
 *   restrictionHighlightKey (prop)
 *     → SequenceLine.reCutLayout.bindingHighlights (useMemo)
 *       → StrandsTrack bindingHighlights (prop)
 *         → <div data-testid="sequence-view-strand-binding">
 *
 * Regression guard for 12.05.2026 — Игорь: «выделение не показывается».
 * Root cause was that SequenceView's `linesJsx` useMemo did not list
 * `restrictionHighlightKey` in its dep array, so the new prop never
 * reached SequenceLine. Even though the editor was setting the key
 * correctly, the binding-zone overlay was never rendered.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceLine from '../SequenceLine';

afterEach(cleanup);

const SEQ = 'ACGTGAATTCACGT'.padEnd(60, 'A'); // GAATTC starts at offset 4
const LINE = { start: 0, seq: SEQ, wrapsOrigin: false };
const RE_SITES = [{ enzyme: 'EcoRI', position: 4 }];

const baseProps = {
  line: LINE,
  fullSeq: SEQ,
  features: [],
  primers: [],
  reSites: RE_SITES,
  charPx: 10,
  showBottomStrand: true,
  framesMode: 'off',
  primerStyle: 'arrow',
  reOrientation: 'horizontal',
  visibleFrames: { F1: true, F2: false, F3: false, R1: false, R2: false, R3: false },
  framesResolution: { strategy: 'none', dominant: null },
  orfRanges: [],
  renderHybrid: false,
  tracksReady: true,
  seqLength: SEQ.length,
};

describe('SequenceLine — restriction binding-zone highlight', () => {
  it('no highlightedKey → no binding overlay', () => {
    render(<SequenceLine {...baseProps} />);
    expect(screen.queryAllByTestId('sequence-view-strand-binding').length).toBe(0);
  });

  it('highlightedKey="EcoRI-4" → binding overlay rendered on BOTH strands', () => {
    render(<SequenceLine {...baseProps} restrictionHighlightKey="EcoRI-4" />);
    const overlays = screen.getAllByTestId('sequence-view-strand-binding');
    // Two strands shown → one overlay per strand.
    expect(overlays.length).toBe(2);
    const strands = overlays.map((el) => el.getAttribute('data-strand')).sort();
    expect(strands).toEqual(['bottom', 'top']);
  });

  it('binding overlay width matches recognition-site length × charPx', () => {
    render(<SequenceLine {...baseProps} restrictionHighlightKey="EcoRI-4" />);
    const overlay = screen.getAllByTestId('sequence-view-strand-binding')[0];
    // EcoRI = GAATTC = 6 bp; charPx = 10 → width = 60px.
    expect(overlay.style.width).toBe('60px');
  });

  it('highlightedKey with no matching site → no binding overlay (graceful)', () => {
    render(<SequenceLine {...baseProps} restrictionHighlightKey="NotI-999" />);
    expect(screen.queryAllByTestId('sequence-view-strand-binding').length).toBe(0);
  });

  it('no highlight + no hover → NO cut bars on strand (hover-only since 13.05.2026)', () => {
    render(<SequenceLine {...baseProps} />);
    // Strand cut overlay is gated to hover OR click — both off here.
    expect(screen.queryAllByTestId('sequence-view-strand-cut').length).toBe(0);
  });

  it('hoveredRestrictionKey → cut bars appear on both strands', () => {
    render(<SequenceLine {...baseProps} hoveredRestrictionKey="EcoRI-4" />);
    // 2 strands × 1 site = 2 cut bars.
    const cuts = screen.getAllByTestId('sequence-view-strand-cut');
    expect(cuts.length).toBe(2);
  });

  it('restrictionHighlightKey (click) also surfaces strand cut bars', () => {
    render(<SequenceLine {...baseProps} restrictionHighlightKey="EcoRI-4" />);
    const cuts = screen.getAllByTestId('sequence-view-strand-cut');
    expect(cuts.length).toBe(2);
  });
});
