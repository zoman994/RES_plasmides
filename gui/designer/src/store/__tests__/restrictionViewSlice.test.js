/**
 * restrictionViewSlice (RS-B3) — named setters for the RE-site view knobs +
 * the active-set allow-list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, selectActiveSetEnzymes } from '../index';

const st = () => useStore.getState();

describe('restrictionViewSlice', () => {
  beforeEach(() => {
    useStore.setState({ showReSites: undefined, reFilter: undefined, reMinSiteLen: undefined, reActiveSet: null });
  });

  it('named setters mutate the legacy view fields', () => {
    st().setShowReSites(true);
    expect(st().showReSites).toBe(true);
    st().toggleReSites();
    expect(st().showReSites).toBe(false);
    st().setReFilter('unique');
    expect(st().reFilter).toBe('unique');
    st().setReMinSiteLen(8);
    expect(st().reMinSiteLen).toBe(8);
  });

  it('setReActiveSet stores / clears the active set; selector resolves enzymes', () => {
    expect(selectActiveSetEnzymes(st())).toBeNull();
    st().setReActiveSet({ id: 's1', name: 'X', enzymes: ['EcoRI', 'BamHI'] });
    expect(st().reActiveSet.name).toBe('X');
    expect(selectActiveSetEnzymes(st())).toEqual(['EcoRI', 'BamHI']);
    st().setReActiveSet(null);
    expect(st().reActiveSet).toBeNull();
    expect(selectActiveSetEnzymes(st())).toBeNull();
  });

  it('an empty active set resolves to null (no allow-list)', () => {
    st().setReActiveSet({ id: 's', name: 'empty', enzymes: [] });
    expect(selectActiveSetEnzymes(st())).toBeNull();
  });
});
