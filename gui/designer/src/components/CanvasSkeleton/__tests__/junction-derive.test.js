/**
 * junction-derive.test.js — JUNCTION layer 3 step 1, pure helpers (J1/J2/J3).
 * pairKey stability, two-level boundaries (internal vs closure-when-circular),
 * default-overlap seeding.
 */
import { describe, it, expect } from 'vitest';
import {
  pairKeyFor, seedJunction, junctionKindForMethod,
  internalBoundaries, closureBoundary, allBoundaries,
  DEFAULT_JUNCTION_METHOD, INTERNAL_METHODS, CLOSURE_METHODS,
} from '../lib/junction-derive';
import { draftFromZone } from '../lib/zone-pieces-to-dag';

const SRC = {
  id: 'src1', kind: 'molecule', name: 's',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};
function piece(id, start, end, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src1'],
    ranges: [{ sourceId: 'src1', start, end, orientation: 'forward' }],
    zoneId: 'zn-1', createdAt, updatedAt: createdAt,
  };
}
function draftOf(pieces, circular = false) {
  const state = { containers: [SRC], pieces };
  const zone = { id: 'zn-1', name: 'Z', topology: { circular } };
  return draftFromZone(state, zone);
}

describe('junction-derive — pairKey + seed (J1/J3)', () => {
  it('pairKeyFor joins ids with __ (stable, not index-based)', () => {
    expect(pairKeyFor('a', 'b')).toBe('a__b');
    expect(pairKeyFor('pc1', 'pc2')).toBe('pc1__pc2');
  });

  it('default junction method is overlap_pcr (J3)', () => {
    expect(DEFAULT_JUNCTION_METHOD).toBe('overlap_pcr');
  });

  it('seedJunction() defaults to overlap config (right / 30 / Tm-targeted binding)', () => {
    // Звено — binding is Tm-targeted by default (null length + 60 °C target), not
    // a flat 20 nt, so seeded junctions extend AT-rich ends.
    expect(seedJunction()).toEqual({
      method: 'overlap_pcr', overlapTarget: 'right', overlapLength: 30,
      overlapTm: null, bindingLength: null, bindingTm: 60,
    });
  });

  it('seedJunction(method) carries the method + its overlap defaults', () => {
    expect(seedJunction('golden_gate').method).toBe('golden_gate');
    expect(seedJunction('golden_gate').overlapLength).toBe(4); // GG overhang default
  });

  it('junctionKindForMethod maps engine dict → junction.kind', () => {
    expect(junctionKindForMethod('overlap_pcr')).toBe('overlap');
    expect(junctionKindForMethod('restriction')).toBe('re_ligation');
    expect(junctionKindForMethod('kld')).toBe('kld');
    expect(junctionKindForMethod('whatever')).toBe('overlap'); // fallback
  });

  it('two-level method sets (J2): internal fuse vs closure', () => {
    expect(INTERNAL_METHODS).toEqual(['overlap_pcr', 'restriction']);
    expect(CLOSURE_METHODS).toContain('gibson');
    expect(CLOSURE_METHODS).toContain('golden_gate');
    expect(CLOSURE_METHODS).toContain('kld');
    expect(INTERNAL_METHODS).not.toContain('gibson'); // Gibson can't fuse internally
  });
});

describe('junction-derive — boundaries (J2)', () => {
  const pieces = [piece('a', 0, 16, 1), piece('b', 16, 32, 2), piece('c', 32, 48, 3)];

  it('internalBoundaries gives N−1 joins keyed by id-pair, role internal', () => {
    const ib = internalBoundaries(draftOf(pieces));
    expect(ib).toHaveLength(2);
    expect(ib.map((b) => b.pairKey)).toEqual(['a__b', 'b__c']);
    expect(ib.every((b) => b.role === 'internal')).toBe(true);
  });

  it('closureBoundary is null on linear topology', () => {
    expect(closureBoundary(draftOf(pieces, false))).toBeNull();
  });

  it('closureBoundary is last↔first (role closure) only when circular (J4)', () => {
    const cb = closureBoundary(draftOf(pieces, true));
    expect(cb).toBeTruthy();
    expect(cb.pairKey).toBe('c__a');
    expect(cb.role).toBe('closure');
  });

  it('allBoundaries = internal (linear); internal + closure (circular)', () => {
    expect(allBoundaries(draftOf(pieces, false)).map((b) => b.pairKey)).toEqual(['a__b', 'b__c']);
    expect(allBoundaries(draftOf(pieces, true)).map((b) => b.pairKey)).toEqual(['a__b', 'b__c', 'c__a']);
  });

  it('pairKey is position-independent: a,b adjacent → a__b in both [a,b,c] and [x,a,b]', () => {
    const k1 = internalBoundaries(draftOf([piece('a', 0, 16, 1), piece('b', 16, 32, 2), piece('c', 32, 48, 3)]))
      .map((b) => b.pairKey);
    const k2 = internalBoundaries(draftOf([piece('x', 0, 16, 1), piece('a', 16, 32, 2), piece('b', 32, 48, 3)]))
      .map((b) => b.pairKey);
    expect(k1).toContain('a__b');
    expect(k2).toContain('a__b'); // same junction key despite different position
  });
});
