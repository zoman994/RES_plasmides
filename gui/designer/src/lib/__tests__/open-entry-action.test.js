/**
 * makeOpenEntry — the REAL entry sink behind a global-search molecule pick (§10.4).
 * Covers the paths the router matrix (with a vi.fn() openEntry) could NOT: the dirty guard,
 * the common→entry transition + state creation, and nav-AFTER-select ordering.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeOpenEntry } from '../open-entry-action';

const OCC = {
  location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false },
  metrics: { identity: 0.9876, identityBps: 9876 },
};

function deps(over = {}) {
  return {
    // A REAL library entry: `version`, the field librarySlice actually maintains.
    getEntry: vi.fn((id) => ({ id, projectId: 'proj1', version: 7 })),
    guardedSelect: vi.fn(() => true),
    activateProject: vi.fn(),
    setView: vi.fn(),
    setSelectedId: vi.fn(),
    initPerEntryState: vi.fn(),
    requestSequenceNav: vi.fn(),
    ...over,
  };
}

describe('makeOpenEntry', () => {
  it('a cancelled dirty-guard changes NOTHING (no view/select/project/nav)', () => {
    const d = deps({ guardedSelect: vi.fn(() => false) });
    makeOpenEntry(d)('e1', OCC);
    expect(d.guardedSelect).toHaveBeenCalledWith('e1');
    expect(d.setView).not.toHaveBeenCalled();
    expect(d.setSelectedId).not.toHaveBeenCalled();
    expect(d.activateProject).not.toHaveBeenCalled();
    expect(d.requestSequenceNav).not.toHaveBeenCalled();
  });

  it('a confirmed select does common→entry + activates the project + inits perEntryState', () => {
    const d = deps();
    makeOpenEntry(d)('e1', OCC);
    expect(d.activateProject).toHaveBeenCalledWith('proj1');
    expect(d.setView).toHaveBeenCalledWith('entry');
    expect(d.setSelectedId).toHaveBeenCalledWith('e1');
    expect(d.initPerEntryState).toHaveBeenCalledWith('e1');
  });

  it('parks the nav AFTER the select (never before) with revision + every physical fact', () => {
    const d = deps();
    makeOpenEntry(d)('e1', OCC, 7, 'v7#g2');
    // U5-A — the whole locus travels: all segments, the canonical strand (so `both` survives the ±1
    // selection strand), `wrapsOrigin`, and `identityBps` for the overlay bucket. The former
    // `metricPct` float was dropped by the store on arrival, so it never reached a pixel.
    expect(d.requestSequenceNav).toHaveBeenCalledWith('e1', expect.objectContaining({
      segments: [{ start: 3, end: 9 }], revision: 7, docEpoch: 'v7#g2',
      strand: 1, strandRaw: '+', wrapsOrigin: false, identityBps: 9876,
    }));
    // ordering: select happens before nav is published
    expect(d.setSelectedId.mock.invocationCallOrder[0]).toBeLessThan(d.requestSequenceNav.mock.invocationCallOrder[0]);
  });

  it('the RESULT\'s revision is parked — never the entry\'s current one (U5-B)', () => {
    // The molecule has been saved since the search ran: it is at version 7, the result was computed
    // on version 5. Re-deriving the revision here would stamp «7» onto coordinates measured on «5»,
    // and the consumer's stale guard — the whole point of the field — would pass.
    const d = deps();
    makeOpenEntry(d)('e1', OCC, 5, 'v5#g1');
    const [, target] = d.requestSequenceNav.mock.calls[0];
    expect(target.revision).toBe(5);
    // The epoch is the one the RESULT carried — this sink never builds one from the current entry.
    expect(target.docEpoch).toBe('v5#g1');
  });

  it('a result that carried NO revision parks none — an unknown identity is not «current»', () => {
    const d = deps();
    makeOpenEntry(d)('e1', OCC);
    const [, target] = d.requestSequenceNav.mock.calls[0];
    expect(target.revision).toBeNull();
    expect(target.docEpoch).toBeNull();
  });

  it('no occurrence → selects but publishes no nav', () => {
    const d = deps();
    makeOpenEntry(d)('e1', null);
    expect(d.setSelectedId).toHaveBeenCalledWith('e1');
    expect(d.requestSequenceNav).not.toHaveBeenCalled();
  });

  it('a missing entry is a no-op (never touches selection)', () => {
    const d = deps({ getEntry: vi.fn(() => undefined) });
    makeOpenEntry(d)('ghost', OCC);
    expect(d.guardedSelect).not.toHaveBeenCalled();
    expect(d.setSelectedId).not.toHaveBeenCalled();
  });
});
