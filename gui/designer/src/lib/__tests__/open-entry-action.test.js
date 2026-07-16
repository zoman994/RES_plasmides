/**
 * makeOpenEntry — the REAL entry sink behind a global-search molecule pick (§10.4).
 * Covers the paths the router matrix (with a vi.fn() openEntry) could NOT: the dirty guard,
 * the common→entry transition + state creation, and nav-AFTER-select ordering.
 */
import { describe, it, expect, vi } from 'vitest';
import { makeOpenEntry } from '../open-entry-action';

const OCC = { location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false }, metrics: { identity: 1 } };

function deps(over = {}) {
  return {
    getEntry: vi.fn((id) => ({ id, projectId: 'proj1', origin: { revision: 'r7' } })),
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

  it('parks the nav AFTER the select (never before) with revision + metricPct', () => {
    const d = deps();
    makeOpenEntry(d)('e1', OCC);
    expect(d.requestSequenceNav).toHaveBeenCalledWith('e1', expect.objectContaining({
      segments: expect.any(Array), revision: 'r7', metricPct: 1,
    }));
    // ordering: select happens before nav is published
    expect(d.setSelectedId.mock.invocationCallOrder[0]).toBeLessThan(d.requestSequenceNav.mock.invocationCallOrder[0]);
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
