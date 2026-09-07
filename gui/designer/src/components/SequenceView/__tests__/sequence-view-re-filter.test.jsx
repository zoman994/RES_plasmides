/**
 * RS-PICK4 (Игорь 22.06: «выбор набора НЕ меняет количества сайтов на
 * последовательности»). The opt-in `reEnzymesFilter` allow-list overrides the
 * store cut-count/active-set filter so the assembly picker's набор/picked/unique
 * selection drives which RE sites the SEQUENCE shows (not just the map).
 */
import 'fake-indexeddb/auto';
import {
  describe, it, expect, afterEach, beforeEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent, within, act,
} from '@testing-library/react';
import SequenceView from '../index';
import { useStore, bootstrapStore } from '../../../store';

// BamHI (GGATCC) once + EcoRI (GAATTC) twice.
const SEQ = `GGATCC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}GAATTC${'C'.repeat(10)}`;
const FRAG = { id: 'f', name: 'pTest', type: 'plasmid', sequence: SEQ, strand: 1, annotations: [] };

const LIVE_ENZYME = {
  id: 'live-i', name: 'LiveI', site: 'AACGTC', cut: [1, 3],
  end: '5prime', overhang: 'AC', isCustom: true,
};

function setCustomEnzymes(byId) {
  const current = useStore.getState().customEnzymes || {};
  useStore.setState({ customEnzymes: { ...current, byId } });
}

afterEach(() => {
  cleanup();
  setCustomEnzymes({});
});
beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  setCustomEnzymes({});
  useStore.setState({
    showReSites: false, // empty-list fallback must then show nothing
    reFilter: 'all',
    reMinSiteLen: 6,
    reActiveSet: null,
    sequenceView: {
      showBottomStrand: true, framesMode: 'off', autoThreshold: 0.8, primerStyle: 'filled',
      reOrientation: 'horizontal',
      predictions: { cds: false, sgRNA: false, promoter: false, terminator: false, threshold: 0.5 },
    },
  });
});

const enzymesShown = () => screen.queryAllByTestId('sequence-view-re-site').map((g) => g.getAttribute('data-enzyme'));

const primerForWholeTemplate = () => ({
  id: 'p-context', name: 'context', direction: 'forward',
  tail: '', bindingSequence: SEQ, sequence: SEQ, bindingModel: 'aligned-v1',
  sites: [{
    id: 'site-context',
    target: { entryId: 'e1', resourceHash: 'h1', topology: 'linear' },
    location: { kind: 'single', segments: [{ start: 0, end: SEQ.length }] },
    strand: 1, annealedSequence: SEQ, tail: '',
  }],
});

const openPrimerContext = (props = {}) => {
  render(
    <SequenceView
      fragments={[FRAG]}
      primers={[primerForWholeTemplate()]}
      onWritePrimer={vi.fn()}
      entryId="e1"
      documentHash="h1"
      {...props}
    />,
  );
  fireEvent.doubleClick(screen.getByTestId('sequence-view-primer'));
};

const templateContextEnzymes = () => within(screen.getByTestId('primer-binding-template-preview'))
  .queryAllByTestId('sequence-view-re-site')
  .flatMap((label) => (label.dataset.enzymes || label.dataset.enzyme || '').split(','))
  .filter(Boolean);

const globalReSites = () => screen.queryAllByTestId('sequence-view-re-site')
  .filter((site) => !site.closest('[data-testid="primer-binding-preview"]'));

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

  it('keeps filtered template context available while the global RE track is hidden', () => {
    useStore.setState({
      showReSites: false,
      reFilter: 'unique',
      reActiveSet: { id: 'lab', name: 'lab', enzymes: ['BamHI', 'EcoRI'] },
    });
    openPrimerContext();
    expect(globalReSites()).toHaveLength(0);
    expect(templateContextEnzymes()).toContain('BamHI');
    expect(templateContextEnzymes()).not.toContain('EcoRI');
  });

  it('lets an explicit enzyme list override global cut-count inside primer context too', () => {
    useStore.setState({ showReSites: false, reFilter: 'unique', reActiveSet: null });
    openPrimerContext({ reEnzymesFilter: ['EcoRI'] });
    expect(templateContextEnzymes()).toContain('EcoRI');
    expect(templateContextEnzymes()).not.toContain('BamHI');
  });

  it('recomputes visible sites when the custom-enzyme catalog changes', () => {
    const liveSequence = 'TTTTAACGTCTTTT';
    const liveFragment = { ...FRAG, id: 'live', sequence: liveSequence };
    render(<SequenceView
      fragments={[liveFragment]}
      reEnzymesFilter={['LiveI']}
    />);
    expect(globalReSites()).toHaveLength(0);

    act(() => { setCustomEnzymes({ 'live-i': LIVE_ENZYME }); });

    expect(globalReSites()).toHaveLength(1);
    expect(globalReSites()[0].getAttribute('data-enzyme')).toBe('LiveI');
  });
});
