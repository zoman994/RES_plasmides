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
import { scanOccurrences } from '../../../lib/restriction-occurrence';

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

  // Игорь 22.06 — the recognition-site (binding) box is HOVER-ONLY now: a CLICK
  // selects the cut (cuts/overhang stay) but must NOT paint the whole binding zone.
  it('hoveredRestrictionKey="EcoRI-4" → binding overlay rendered on BOTH strands', () => {
    render(<SequenceLine {...baseProps} hoveredRestrictionKey="EcoRI-4" />);
    const overlays = screen.getAllByTestId('sequence-view-strand-binding');
    expect(overlays.length).toBe(2);
    const strands = overlays.map((el) => el.getAttribute('data-strand')).sort();
    expect(strands).toEqual(['bottom', 'top']);
  });

  it('click (restrictionHighlightKey) does NOT paint the binding zone — hover-only', () => {
    render(<SequenceLine {...baseProps} restrictionHighlightKey="EcoRI-4" />);
    expect(screen.queryAllByTestId('sequence-view-strand-binding').length).toBe(0);
  });

  it('binding overlay width matches recognition-site length × charPx', () => {
    render(<SequenceLine {...baseProps} hoveredRestrictionKey="EcoRI-4" />);
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

  it('uses occurrence identity and reverse-strand cuts without a catalog lookup', () => {
    const FlipI = { site: 'ACGTTA', cut: [1, 4], isCustom: true };
    const sequence = 'TTTTTTTTTTTAACGTTTT';
    const [occurrence] = scanOccurrences(sequence, {
      enzymes: { FlipI },
      names: ['FlipI'],
    });
    const site = { enzyme: 'FlipI', position: occurrence.topCut, occurrence };

    render(<SequenceLine
      {...baseProps}
      line={{ start: 0, seq: sequence, wrapsOrigin: false }}
      fullSeq={sequence}
      seqLength={sequence.length}
      reSites={[site]}
      hoveredRestrictionKey={occurrence.occurrenceKey}
    />);

    const cuts = screen.getAllByTestId('sequence-view-strand-cut');
    expect(cuts.find((node) => node.getAttribute('data-strand') === 'top')
      ?.getAttribute('data-cut-pos')).toBe('12');
    expect(cuts.find((node) => node.getAttribute('data-strand') === 'bottom')
      ?.getAttribute('data-cut-pos')).toBe('15');
  });

  it('highlights both canonical occurrences in a committed RE pair', () => {
    const sequence = 'AAAAGAATTCTTTTAAGCTTAAAA';
    const occurrences = scanOccurrences(sequence, {
      enzymes: {
        EcoRI: { site: 'GAATTC', cut: [1, 5] },
        HindIII: { site: 'AAGCTT', cut: [1, 5] },
      },
    });
    const sites = occurrences.map((occurrence) => ({
      enzyme: occurrence.enzyme,
      position: occurrence.topCut,
      occurrence,
    }));

    render(<SequenceLine
      {...baseProps}
      line={{ start: 0, seq: sequence, wrapsOrigin: false }}
      fullSeq={sequence}
      seqLength={sequence.length}
      reSites={sites}
      restrictionHighlightKey={occurrences.map(({ occurrenceKey }) => occurrenceKey)}
    />);

    expect(screen.getAllByTestId('sequence-view-strand-cut')).toHaveLength(4);
    expect(screen.getAllByTestId('sequence-view-re-site')
      .filter((node) => node.getAttribute('data-highlighted') === 'true')).toHaveLength(2);
  });

  it('renders only the physical slice of an overhang whose stagger crosses the origin', () => {
    const sequence = `GTTA${'A'.repeat(14)}AC`;
    const [occurrence] = scanOccurrences(sequence, {
      circular: true,
      enzymes: { FlipI: { site: 'ACGTTA', cut: [1, 4], isCustom: true } },
      names: ['FlipI'],
    });
    expect(occurrence).toMatchObject({
      recognition: { start: 18, wrapsOrigin: true },
      topCut: 19,
      bottomCut: 2,
      topCutUnwrapped: 19,
      bottomCutUnwrapped: 22,
    });

    render(<SequenceLine
      {...baseProps}
      line={{ start: 10, seq: sequence.slice(10), wrapsOrigin: false }}
      fullSeq={sequence}
      seqLength={sequence.length}
      reSites={[{ enzyme: 'FlipI', position: occurrence.topCut, occurrence }]}
      restrictionHighlightKey={occurrence.occurrenceKey}
    />);

    const bands = screen.getAllByTestId('sequence-view-strand-overhang');
    expect(bands).toHaveLength(2);
    expect(bands.every((band) => band.style.width === '10px')).toBe(true);
  });

  it('renders the low-coordinate slice and normalized cut of an origin-crossing stagger', () => {
    const sequence = `GTTA${'A'.repeat(14)}AC`;
    const [occurrence] = scanOccurrences(sequence, {
      circular: true,
      enzymes: { FlipI: { site: 'ACGTTA', cut: [1, 4], isCustom: true } },
      names: ['FlipI'],
    });

    render(<SequenceLine
      {...baseProps}
      line={{ start: 0, seq: sequence.slice(0, 10), wrapsOrigin: false }}
      fullSeq={sequence}
      seqLength={sequence.length}
      reSites={[{ enzyme: 'FlipI', position: occurrence.topCut, occurrence }]}
      restrictionHighlightKey={occurrence.occurrenceKey}
    />);

    const bands = screen.getAllByTestId('sequence-view-strand-overhang');
    expect(bands).toHaveLength(2);
    expect(bands.every((band) => band.style.width === '20px')).toBe(true);
    const cuts = screen.getAllByTestId('sequence-view-strand-cut');
    expect(cuts).toHaveLength(1);
    expect(cuts[0].getAttribute('data-strand')).toBe('bottom');
    expect(cuts[0].getAttribute('data-cut-pos')).toBe('2');
  });

  it('recomputes an origin cut when the same row becomes the bridge row', () => {
    const sequence = `GTTA${'A'.repeat(14)}AC`;
    const [occurrence] = scanOccurrences(sequence, {
      circular: true,
      enzymes: { FlipI: { site: 'ACGTTA', cut: [1, 4], isCustom: true } },
      names: ['FlipI'],
    });
    const reSites = [{ enzyme: 'FlipI', position: occurrence.topCut, occurrence }];
    const props = {
      ...baseProps,
      fullSeq: sequence,
      seqLength: sequence.length,
      reSites,
      restrictionHighlightKey: occurrence.occurrenceKey,
    };
    const view = render(<SequenceLine
      {...props}
      line={{ start: 10, seq: sequence.slice(10), wrapsOrigin: false }}
    />);

    expect(screen.getAllByTestId('sequence-view-strand-cut')
      .some((node) => node.getAttribute('data-strand') === 'bottom')).toBe(false);

    view.rerender(<SequenceLine
      {...props}
      line={{
        start: 10,
        seq: sequence.slice(10) + sequence.slice(0, 10),
        wrapsOrigin: true,
      }}
    />);

    const bottom = screen.getAllByTestId('sequence-view-strand-cut')
      .find((node) => node.getAttribute('data-strand') === 'bottom');
    expect(bottom?.getAttribute('data-cut-pos')).toBe('22');
  });
});
