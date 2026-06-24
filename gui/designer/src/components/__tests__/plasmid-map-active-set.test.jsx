/**
 * RS-C4 (integration) — the «active set» allow-list actually narrows which RE
 * sites render on the circular map (the same path the linear SequenceView uses).
 * Proves the store → chokepoint wiring, not just the pure filter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PlasmidMapV2 from '../PlasmidMapV2';
import { useStore } from '../../store';

// One EcoRI (GAATTC) + one BamHI (GGATCC) site.
const SEQ = `GAATTC${'A'.repeat(24)}GGATCC${'A'.repeat(24)}`;
const FRAGMENTS = [{ sequence: SEQ, annotations: [], length: SEQ.length }];

const labelText = () => screen.queryAllByTestId(/^plasmid-v2-re-label/).map((g) => g.textContent).join(' | ');

beforeEach(() => {
  useStore.setState({ showReSites: true, reFilter: 'all', reMinSiteLen: 6, reActiveSet: null });
});
afterEach(cleanup);

describe('PlasmidMapV2 — active set narrows visible RE sites', () => {
  it('no active set → both EcoRI and BamHI sites show', () => {
    render(<PlasmidMapV2 fragments={FRAGMENTS} totalBp={SEQ.length} topology="circular" />);
    const txt = labelText();
    expect(txt).toMatch(/EcoRI/);
    expect(txt).toMatch(/BamHI/);
  });

  it('active set {EcoRI} → only EcoRI shows, BamHI hidden', () => {
    useStore.getState().setReActiveSet({ id: 's', name: 'only-eco', enzymes: ['EcoRI'] });
    render(<PlasmidMapV2 fragments={FRAGMENTS} totalBp={SEQ.length} topology="circular" />);
    const txt = labelText();
    expect(txt).toMatch(/EcoRI/);
    expect(txt).not.toMatch(/BamHI/);
  });
});
