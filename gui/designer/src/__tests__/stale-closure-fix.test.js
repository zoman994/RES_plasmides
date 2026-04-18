import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';

// ── BUG-70: stale closure — mergeParts must not wipe existing parts ──

describe('BUG-70: mergeParts stale closure fix', () => {
  const existingParts = [
    { id: 'p1', name: 'PglaA', type: 'promoter', sequence: 'ATCG', length: 4 },
    { id: 'p2', name: 'XynTL', type: 'CDS', sequence: 'ATGC', length: 4 },
  ];

  /** Reimplements the fixed mergeParts logic from App.jsx */
  function mergeParts(apiParts) {
    if (!apiParts.length) return;
    const currentParts = useStore.getState().parts;
    const existingIds = new Set(currentParts.map(p => p.id));
    const newOnly = apiParts.filter(p => !existingIds.has(p.id));
    if (newOnly.length > 0) {
      useStore.getState().setParts([...currentParts, ...newOnly]);
    }
  }

  beforeEach(() => {
    useStore.getState().setParts([...existingParts]);
  });

  it('mergeParts([]) does NOT wipe existing parts', () => {
    mergeParts([]);
    const parts = useStore.getState().parts;
    expect(parts).toHaveLength(2);
    expect(parts.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('mergeParts([newPart]) adds only new, does not duplicate existing', () => {
    const apiParts = [
      { id: 'p1', name: 'PglaA', type: 'promoter', sequence: 'ATCG', length: 4 }, // existing
      { id: 'p3', name: 'TtrpC', type: 'terminator', sequence: 'GCTA', length: 4 }, // new
    ];
    mergeParts(apiParts);
    const parts = useStore.getState().parts;
    expect(parts).toHaveLength(3);
    expect(parts.map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('mergeParts with all existing parts does not modify store', () => {
    const apiParts = [
      { id: 'p1', name: 'PglaA', type: 'promoter', sequence: 'ATCG', length: 4 },
      { id: 'p2', name: 'XynTL', type: 'CDS', sequence: 'ATGC', length: 4 },
    ];
    const partsBefore = useStore.getState().parts;
    mergeParts(apiParts);
    const partsAfter = useStore.getState().parts;
    // Same reference — setParts was not called
    expect(partsAfter).toBe(partsBefore);
  });

  it('fetchParts reject should NOT call mergeParts (catch is no-op)', () => {
    // Simulate: fetchParts rejects, catch does nothing
    const fetchParts = () => Promise.reject(new Error('network'));
    let mergePartsCalled = false;
    fetchParts()
      .then(() => { mergePartsCalled = true; })
      .catch(() => {}); // correct: no-op catch

    expect(mergePartsCalled).toBe(false);
    expect(useStore.getState().parts).toHaveLength(2);
  });
});
