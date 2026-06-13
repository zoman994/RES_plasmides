/**
 * circularize-zone-topology-c5.test.js — M-CIRCULARIZE C5 (Игорь bug: «выбираю
 * фрагмент плазмиды и хочу его зациклить — праймеры не появляются»).
 *
 * Root cause was deeper than primers: a ZONE-backed assembly could never become
 * circular — draftFromZone reads zone.topology, but the only topology action
 * (SET_ASSEMBLY_DRAFT_TOPOLOGY) touches legacy assemblyDrafts, so circularizing
 * a zone was a no-op (no closure, no self-closure primers). Fix:
 *   • SET_ZONE_TOPOLOGY writes zone.topology.circular.
 *   • the finalizer reacts → derives the 2 self-closure primers for a 1-piece
 *     circular zone (deriveSelfClosurePrimers) into assemblyDraftPrimers.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { zonesReducer } from '../store/skeleton-state-zones';
import { deriveSelfClosurePrimers } from '../lib/primer-derive';
import { reverseComplement } from '../../../sequence-utils';

const SEQ = 'AAAACCCCGGGGTTTT'.repeat(3); // 48 nt ≥ 40 self-closure floor
const SRC = {
  id: 'src1', kind: 'molecule', name: 'pUC', sequence: SEQ, annotations: [], topology: { circular: false }, pinned: true,
};
const PIECE = {
  id: 'pc1', kind: 'sourced', name: 'pc1', sourceIds: ['src1'],
  ranges: [{ sourceId: 'src1', start: 0, end: 48, orientation: 'forward' }],
  origin: 'selection', acquisitionMethod: 'undefined', zoneId: 'zn-1', createdAt: 1, updatedAt: 1,
};
function oneFragZone(circular) {
  const s = buildInitialState();
  return {
    ...s,
    containers: [...s.containers, SRC],
    zones: [{
      id: 'zn-1', name: 'Z', viewMode: 'sequence', bounds: { x: 0, y: 0, width: 600, height: 400 },
      topology: circular ? { circular: true } : undefined,
    }],
    pieces: [PIECE],
  };
}

describe('M-CIRCULARIZE C5 — SET_ZONE_TOPOLOGY', () => {
  it('writes zone.topology.circular (was previously unsettable on a zone)', () => {
    const out = zonesReducer(oneFragZone(false), { type: 'SET_ZONE_TOPOLOGY', zoneId: 'zn-1', circular: true });
    expect(out.zones[0].topology).toEqual({ circular: true });
  });
  it('unknown zone → no-op', () => {
    const s = oneFragZone(false);
    expect(zonesReducer(s, { type: 'SET_ZONE_TOPOLOGY', zoneId: 'nope', circular: true })).toBe(s);
  });
});

describe('M-CIRCULARIZE C5 — deriveSelfClosurePrimers (pure)', () => {
  it('returns a fwd+rev pair with terminal-repeat tails', () => {
    const ps = deriveSelfClosurePrimers(PIECE, { containers: [SRC], pieces: [PIECE] });
    expect(ps).toHaveLength(2);
    const fwd = ps.find((p) => p.direction === 'forward');
    const rev = ps.find((p) => p.direction === 'reverse');
    expect(fwd.tail).toBe(SEQ.slice(-15)); // 3' end as-is
    expect(rev.tail).toBe(reverseComplement(SEQ.slice(0, 15))); // rc(5' start)
    expect(fwd.source.kind).toBe('self-closure');
    expect(fwd.purpose).toBe('self-closure');
  });
  it('too-short fragment (<40 nt) → no primers', () => {
    const shortPiece = { ...PIECE, ranges: [{ sourceId: 'src1', start: 0, end: 20, orientation: 'forward' }] };
    expect(deriveSelfClosurePrimers(shortPiece, { containers: [SRC], pieces: [shortPiece] })).toEqual([]);
  });
});

describe('M-CIRCULARIZE C5 — circularizing a 1-piece zone yields self-closure primers (finalizer)', () => {
  it('SET_ZONE_TOPOLOGY circular → 2 self-closure primers in assemblyDraftPrimers', () => {
    const s1 = skeletonReducer(oneFragZone(false), { type: 'SET_ZONE_TOPOLOGY', zoneId: 'zn-1', circular: true });
    expect(s1.zones[0].topology.circular).toBe(true);
    const primers = (s1.assemblyDraftPrimers || {})['zn-1'] || [];
    expect(primers).toHaveLength(2);
    expect(primers.every((p) => p.purpose === 'self-closure')).toBe(true);
    expect(primers.map((p) => p.direction).sort()).toEqual(['forward', 'reverse']);
  });

  it('a LINEAR 1-piece zone has no self-closure primers', () => {
    const s0 = oneFragZone(false);
    const primers = (s0.assemblyDraftPrimers || {})['zn-1'] || [];
    expect(primers).toHaveLength(0);
  });
});
