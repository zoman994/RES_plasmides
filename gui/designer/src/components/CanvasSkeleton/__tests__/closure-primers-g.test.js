/**
 * closure-primers-g.test.js — audit primers AM-1 / TOP-3. A multi-fragment
 * CIRCULAR assembly realised + seeded a closure junction, and the validation
 * badge said «ok», yet the first fragment's fwd primer and the last fragment's
 * rev primer got EMPTY tails (no logicalPrev / no logicalNext at the ends) — so
 * the last→first join had blunt, non-homologous ends and the ring could not
 * close. deriveAutoPrimers is now topology-aware: it wraps the terminal tails.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const SEQ = 'AAAACCCCGGGGTTTTACGTACGTAC'.repeat(4); // ≥ 3×30 nt, varied
const SRC = { id: 'src', kind: 'molecule', name: 'src', sequence: SEQ, annotations: [], topology: { circular: false }, pinned: true };
const piece = (id, start, end, order) => ({
  id, kind: 'sourced', name: id, sourceIds: ['src'],
  ranges: [{ sourceId: 'src', start, end, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'z', createdAt: order, updatedAt: order,
});

function threePieceZone() {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, SRC],
    zones: [{ id: 'z', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    pieces: [piece('p1', 0, 30, 1), piece('p2', 30, 60, 2), piece('p3', 60, 90, 3)],
  };
}
const primersOf = (s) => (s.assemblyDraftPrimers || {}).z || [];
const find = (ps, pid, dir) => ps.find((p) => p.source && p.source.pieceId === pid && p.direction === dir);

describe('closure primers — circular wrap (AM-1/TOP-3)', () => {
  it('circular: the first piece fwd carries the closure homology (ring closes)', () => {
    // Single-sided overlap (overlapTarget:right): the last→first closure homology
    // rides on the DOWNSTREAM (first) piece's fwd primer — homology to the last
    // piece's 3' end. Linear, this tail is empty (no logicalPrev at the start).
    const s = skeletonReducer(threePieceZone(), { type: 'SET_ZONE_TOPOLOGY', zoneId: 'z', circular: true });
    const ps = primersOf(s);
    expect(find(ps, 'p1', 'forward').tail.length).toBeGreaterThan(0);
  });

  it('the closure primers record the closure boundary (coverage)', () => {
    const s = skeletonReducer(threePieceZone(), { type: 'SET_ZONE_TOPOLOGY', zoneId: 'z', circular: true });
    const ps = primersOf(s);
    // p1 fwd realises the last→first closure boundary (its crossesBoundaries pair).
    expect(find(ps, 'p1', 'forward').crossesBoundaries.length).toBeGreaterThanOrEqual(2);
  });

  it('linear: the terminal tails stay empty (no spurious ring closure)', () => {
    const s = threePieceZone(); // linear (no SET_ZONE_TOPOLOGY)
    // force a finalizer pass without circular by toggling an unrelated reseed:
    const s2 = skeletonReducer(s, { type: 'SET_ASSEMBLY_METHOD', zoneId: 'z', method: 'overlap_pcr' });
    const ps = primersOf(s2);
    expect(find(ps, 'p1', 'forward').tail).toBe('');
    expect(find(ps, 'p3', 'reverse').tail).toBe('');
  });
});
