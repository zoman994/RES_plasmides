/**
 * V157 — RE-pair INSERT_SEGMENT must create a VALID 'restriction' piece.
 * The zone adapter set acquisitionMethod='restriction' but acquisitionParams={}
 * (empty), and piece-invariants requires non-empty params for param-bearing
 * methods → INVALID_METHOD toast («Недопустимый метод получения куска»). Fix
 * threads the enzyme params through + a safe non-empty fallback in the adapter.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const SRC = {
  id: 'src-re', kind: 'molecule', name: 'src',
  sequence: 'AAAAGAATTCAAAAAAAAAAAAAAAAAAGAATTCAAAA',
  annotations: [], topology: { circular: false },
};

function zoneState() {
  const base = buildInitialState();
  return {
    ...base,
    containers: [...(base.containers || []), SRC],
    zones: [{ id: 'z1', name: 'Z', viewMode: 'sequence', topology: { circular: false }, bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [],
  };
}

describe('V157 — RE-pair INSERT_SEGMENT → valid restriction piece', () => {
  it('restriction + threaded enzyme params → piece created (no INVALID_METHOD)', () => {
    const out = skeletonReducer(zoneState(), {
      type: 'INSERT_SEGMENT', draftId: 'z1', sourceContainerId: 'src-re',
      start: 5, end: 31, rc: false,
      acquisitionMethod: 'restriction',
      acquisitionParams: { enzymes: ['EcoRI', 'EcoRI'], cutSites: [{ position: 5 }, { position: 31 }] },
    });
    expect(out.pieces.length).toBe(1);
    expect(out.pieces[0].acquisitionMethod).toBe('restriction');
    expect(out.pieces[0].acquisitionParams.enzymes).toEqual(['EcoRI', 'EcoRI']);
  });

  it('restriction WITHOUT params → adapter fallback keeps it valid', () => {
    const out = skeletonReducer(zoneState(), {
      type: 'INSERT_SEGMENT', draftId: 'z1', sourceContainerId: 'src-re',
      start: 5, end: 31, rc: false,
      acquisitionMethod: 'restriction',
    });
    expect(out.pieces.length).toBe(1);
    expect(out.pieces[0].acquisitionMethod).toBe('restriction');
    expect(Object.keys(out.pieces[0].acquisitionParams).length).toBeGreaterThan(0);
  });

  it('non-restriction (cursor) → mapped to undefined, no params needed', () => {
    const out = skeletonReducer(zoneState(), {
      type: 'INSERT_SEGMENT', draftId: 'z1', sourceContainerId: 'src-re',
      start: 5, end: 31, rc: false, acquisitionMethod: 'cursor',
    });
    expect(out.pieces.length).toBe(1);
    expect(out.pieces[0].acquisitionMethod).toBe('undefined');
  });
});
