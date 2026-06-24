/**
 * RS-PICK4 (Игорь 22.06: «выбор набора НЕ меняет количества сайтов на
 * последовательности»). The opt-in `reEnzymesFilter` allow-list overrides the
 * store cut-count/active-set filter so the assembly picker's набор/picked/unique
 * selection drives which RE sites the SEQUENCE shows (not just the map).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceView from '../index';
import { useStore, bootstrapStore } from '../../../store';

// BamHI (GGATCC) once + EcoRI (GAATTC) twice.
const SEQ = `GGATCC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}GAATTC${'C'.repeat(10)}`;
const FRAG = { id: 'f', name: 'pTest', type: 'plasmid', sequence: SEQ, strand: 1, annotations: [] };

afterEach(cleanup);
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState({
    showReSites: false, // empty-list fallback must then show nothing
    sequenceView: {
      showBottomStrand: true, framesMode: 'off', autoThreshold: 0.8, primerStyle: 'filled',
      reOrientation: 'horizontal',
      predictions: { cds: false, sgRNA: false, promoter: false, terminator: false, threshold: 0.5 },
    },
  });
});

const enzymesShown = () => screen.queryAllByTestId('sequence-view-re-site').map((g) => g.getAttribute('data-enzyme'));

describe('SequenceView — reEnzymesFilter override (RS-PICK4)', () => {
  it('allow-list shows ONLY those enzymes’ sites (the filter drives the sequence)', () => {
    const { rerender } = render(<SequenceView fragments={[FRAG]} circular reEnzymesFilter={['BamHI']} />);
    let shown = enzymesShown();
    expect(shown).toContain('BamHI');
    expect(shown).not.toContain('EcoRI');
    rerender(<SequenceView fragments={[FRAG]} circular reEnzymesFilter={['EcoRI']} />);
    shown = enzymesShown();
    expect(shown).toContain('EcoRI');
    expect(shown).not.toContain('BamHI');
  });

  it('an empty allow-list is NOT an override — falls back to the store filter (parity with the map)', () => {
    // showReSites off by default in this slice → no sites; the empty array must
    // NOT force-show everything (that would diverge from PlasmidMapV2).
    render(<SequenceView fragments={[FRAG]} circular reEnzymesFilter={[]} />);
    expect(screen.queryAllByTestId('sequence-view-re-site').length).toBe(0);
  });
});
