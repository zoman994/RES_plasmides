/**
 * junction-config-l3.test.js — JUNCTION layer 3 step 1 store integration
 * (J1/J2/J3 + engine A3). Seed-on-add via the applyJunctionConfig finalizer,
 * setBoundaryOverlap, and the engine reading the per-junction method from
 * zone.junctions.
 *
 * NOTE: full J11 "derive-on-add via an implicit zone-group (op-groups
 * advisory)" is NOT activated in step 1 — it conflicts with the
 * editable-assembly primer-preservation + op-group disband/remove cleanup
 * (primer-ownership model); surfaced for Chat сверка. Here the seeded config
 * is read by the engine (A3) and by CREATE_OP_GROUP's config-aware derive.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { deriveAutoPrimers } from '../lib/primer-derive';
import { pairKeyFor } from '../lib/junction-derive';

const SRC = {
  id: 'src-j', kind: 'molecule', name: 's',
  sequence: 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTTAAAACCCCGGGGTTTT',
  annotations: [], topology: { circular: false },
};
function srcPiece(id, start, end, createdAt) {
  return {
    id, kind: 'sourced', name: id, sourceIds: ['src-j'],
    ranges: [{ sourceId: 'src-j', start, end, orientation: 'forward' }],
    origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
    zoneId: 'zn-1', frozen: false, createdAt, updatedAt: createdAt,
  };
}
function baseTwoPiece(circular = false) {
  const base = buildInitialState();
  return {
    ...base,
    containers: [...base.containers, SRC],
    zones: [{
      id: 'zn-1', name: 'Z', viewMode: 'sequence',
      topology: { circular }, bounds: { x: 0, y: 0, width: 600, height: 400 },
    }],
    pieces: [srcPiece('pc1', 0, 32, 1), srcPiece('pc2', 32, 64, 2)],
  };
}
// Fire a piece-changing action so the applyJunctionConfig finalizer runs
// (mirrors a real add/edit).
function twoPieceZone(circular = false) {
  return skeletonReducer(baseTwoPiece(circular), { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#123456' });
}
const PK = pairKeyFor('pc1', 'pc2');

describe('JUNCTION L3 — seed on add (J1/J2/J3)', () => {
  it('a 2-piece linear zone seeds zone.junctions[pc1__pc2] with default overlap', () => {
    const z = twoPieceZone(false).zones[0];
    expect(z.junctions[PK]).toBeTruthy();
    expect(z.junctions[PK].method).toBe('overlap_pcr');
    expect(z.junctions[PK].overlapTarget).toBe('right');
    expect(z.junctions[PK].overlapLength).toBe(30);
    // Звено — binding is Tm-targeted by default (not a flat 20 nt).
    expect(z.junctions[PK].bindingLength).toBeNull();
    expect(z.junctions[PK].bindingTm).toBe(60);
  });

  it('linear zone has NO closure junction; circular zone DOES (J2/J4)', () => {
    expect(twoPieceZone(false).zones[0].junctions[pairKeyFor('pc2', 'pc1')]).toBeUndefined();
    expect(twoPieceZone(true).zones[0].junctions[pairKeyFor('pc2', 'pc1')]).toBeTruthy();
  });

  it('a single-piece zone seeds no junctions', () => {
    const base = buildInitialState();
    const s = skeletonReducer({
      ...base, containers: [...base.containers, SRC],
      zones: [{ id: 'zn-1', name: 'Z', topology: { circular: false }, bounds: { x: 0, y: 0, width: 600, height: 400 } }],
      pieces: [srcPiece('pc1', 0, 32, 1)],
    }, { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#111' });
    expect(Object.keys(s.zones[0].junctions || {})).toHaveLength(0);
  });
});

describe('JUNCTION L3 — derive on add, no manual Sew (J11)', () => {
  it('primers with tails appear after add without CREATE_OP_GROUP', () => {
    const primers = twoPieceZone(false).assemblyDraftPrimers['zn-1'] || [];
    expect(primers.length).toBe(4); // fwd+rev per piece, from the finalizer
    expect(primers.every((p) => p.source.kind === 'auto-group')).toBe(true);
    // junction-owned via the zone's implicit group (not a formal op-group).
    expect(primers.every((p) => p.source.opGroupId === 'zgrp-zn-1')).toBe(true);
    const pc2fwd = primers.find((p) => p.source.pieceId === 'pc2' && p.source.side === 'fwd');
    expect(pc2fwd.tail.length).toBeGreaterThan(0); // overlap homology arm
  });

  it('a level-1 manual primer survives the finalizer re-derive (autoMode:manual skipped)', () => {
    let s = twoPieceZone(false);
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'zn-1', range: { start: 0, end: 20 }, direction: 'forward',
    });
    const manual = (s.assemblyDraftPrimers['zn-1'] || []).find((p) => p.autoMode === 'manual');
    expect(manual).toBeTruthy();
    // a later piece edit re-runs the finalizer — the manual primer must persist.
    s = skeletonReducer(s, { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#777777' });
    const still = (s.assemblyDraftPrimers['zn-1'] || []).find((p) => p.id === manual.id);
    expect(still).toBeTruthy();
    expect(still.autoMode).toBe('manual');
  });
});

describe('JUNCTION L3 — setBoundaryOverlap (J1)', () => {
  it('SET_BOUNDARY_OVERLAP writes the junction config (autoMode manual)', () => {
    const s1 = skeletonReducer(twoPieceZone(false), {
      type: 'SET_BOUNDARY_OVERLAP', zoneId: 'zn-1', pairKey: PK, method: 'golden_gate', overlapLength: 4,
    });
    const j = s1.zones[0].junctions[PK];
    expect(j.method).toBe('golden_gate');
    expect(j.overlapLength).toBe(4);
    expect(j.autoMode).toBe('manual');
  });

  it('a manually-set junction is NOT re-seeded by a later piece edit', () => {
    let s = skeletonReducer(twoPieceZone(false), {
      type: 'SET_BOUNDARY_OVERLAP', zoneId: 'zn-1', pairKey: PK, method: 'golden_gate',
    });
    s = skeletonReducer(s, { type: 'SET_PIECE_COLOR', pieceId: 'pc2', color: '#654321' });
    expect(s.zones[0].junctions[PK].method).toBe('golden_gate'); // preserved, not reset to overlap
  });
});

describe('JUNCTION L3 — derive-gate + dedup (step-2 preconditions)', () => {
  it('DRAG_ZONE does NOT re-derive primers (positional change — gate)', () => {
    const s0 = twoPieceZone(false);
    const beforeIds = (s0.assemblyDraftPrimers['zn-1'] || []).map((p) => p.id);
    expect(beforeIds.length).toBe(4);
    const s1 = skeletonReducer(s0, { type: 'DRAG_ZONE', zoneId: 'zn-1', delta: { dx: 25, dy: 0 } });
    const afterIds = (s1.assemblyDraftPrimers['zn-1'] || []).map((p) => p.id);
    // The .junctions ref is preserved on a drag → no churn (stable ids).
    expect(afterIds).toEqual(beforeIds);
  });

  it('SET_BOUNDARY_OVERLAP DOES re-derive (junction-config change passes the gate)', () => {
    const s0 = twoPieceZone(false);
    const beforeIds = (s0.assemblyDraftPrimers['zn-1'] || []).map((p) => p.id);
    const s1 = skeletonReducer(s0, {
      type: 'SET_BOUNDARY_OVERLAP', zoneId: 'zn-1', pairKey: PK, method: 'golden_gate',
    });
    const afterIds = (s1.assemblyDraftPrimers['zn-1'] || []).map((p) => p.id);
    expect(afterIds).not.toEqual(beforeIds); // config changed → fresh auto re-derive
  });

  it('dedup: a manual primer drops the auto duplicate for its (piece, side)', () => {
    let s = twoPieceZone(false);
    // WRITE a manual fwd primer inside pc2 (assembly coords [32,52)).
    s = skeletonReducer(s, {
      type: 'WRITE_ASSEMBLY_PRIMER', draftId: 'zn-1', range: { start: 32, end: 52 }, direction: 'forward',
    });
    // a later piece edit re-runs the finalizer → dedup applies.
    s = skeletonReducer(s, { type: 'SET_PIECE_COLOR', pieceId: 'pc1', color: '#aaaaaa' });
    const pool = s.assemblyDraftPrimers['zn-1'] || [];
    expect(pool.filter((p) => p.autoMode === 'manual')).toHaveLength(1);
    // No AUTO duplicate for pc2/fwd — the manual primer owns that side.
    expect(pool.filter((p) => p.autoMode === 'auto' && p.source.pieceId === 'pc2' && p.source.side === 'fwd'))
      .toHaveLength(0);
    // Other auto sides survive (pc1 fwd/rev, pc2 rev).
    expect(pool.some((p) => p.autoMode === 'auto' && p.source.pieceId === 'pc1' && p.source.side === 'fwd')).toBe(true);
    expect(pool.some((p) => p.autoMode === 'auto' && p.source.pieceId === 'pc2' && p.source.side === 'rev')).toBe(true);
  });
});

describe('JUNCTION L3 — engine reads zone.junctions (A3)', () => {
  function stateWithJunction(method, extra = {}) {
    return {
      containers: [SRC],
      pieces: [srcPiece('pc1', 0, 32, 1), srcPiece('pc2', 32, 64, 2)],
      zones: [{ id: 'zn-1', topology: { circular: false }, junctions: { [PK]: { method, overlapTarget: 'right', overlapLength: 30, bindingLength: 20, ...extra } } }],
    };
  }
  const opGroup = { id: 'og', kind: 'overlap_pcr', inputPieces: ['pc1', 'pc2'], zoneId: 'zn-1' };

  it('per-junction method WINS over opGroup.kind: GG config → fwd tail GGTCTC', () => {
    const primers = deriveAutoPrimers(opGroup, stateWithJunction('golden_gate', { overlapLength: 4 }));
    const pc2fwd = primers.find((p) => p.source.pieceId === 'pc2' && p.source.side === 'fwd');
    // opGroup.kind is overlap_pcr, but the junction config says golden_gate.
    expect(pc2fwd.tail.startsWith('GGTCTC')).toBe(true);
  });

  it('overlap config → fwd tail is the prev sequence, no GGTCTC', () => {
    const primers = deriveAutoPrimers(opGroup, stateWithJunction('overlap_pcr'));
    const pc2fwd = primers.find((p) => p.source.pieceId === 'pc2' && p.source.side === 'fwd');
    expect(pc2fwd.tail.startsWith('GGTCTC')).toBe(false);
    expect(pc2fwd.tail.length).toBeGreaterThan(0);
  });

  it('no zone.junctions config → falls back to opGroup.kind (back-compat)', () => {
    const state = {
      containers: [SRC],
      pieces: [srcPiece('pc1', 0, 32, 1), srcPiece('pc2', 32, 64, 2)],
      zones: [{ id: 'zn-1', topology: { circular: false } }], // no junctions
    };
    const ggGroup = { id: 'og', kind: 'golden_gate', inputPieces: ['pc1', 'pc2'], zoneId: 'zn-1' };
    const primers = deriveAutoPrimers(ggGroup, state);
    const pc2fwd = primers.find((p) => p.source.pieceId === 'pc2' && p.source.side === 'fwd');
    expect(pc2fwd.tail.startsWith('GGTCTC')).toBe(true); // method from opGroup.kind
  });
});
