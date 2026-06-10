/**
 * migration-fixture-k16.test.js — M-CANVAS-WORKFLOW-UX K16.
 *
 * Reference-fixture acceptance for the K1 v10→v11 migration. A
 * representative v0.8.3-shaped snapshot must:
 *   1. Migrate cleanly with all new v0.9 fields stamped.
 *   2. Be idempotent (migrate∘migrate == migrate).
 *   3. Preserve any pre-existing v0.9 value (no overwrite).
 */
import { describe, it, expect } from 'vitest';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

// Representative v0.8.3-shaped fixture — minimal but covers every slice
// touched by the v10→v11 migration: zones, pieces, operations, primers.
function v10Fixture() {
  return {
    containers: [
      { id: 'c1', kind: 'molecule', name: 'pUC', sequence: 'ATGCAAAGGG', pinned: false, zoneId: 'z1', variantGroupId: null },
    ],
    pieces: [
      { id: 'p1', kind: 'sourced', zoneId: 'z1', pinned: false, variantGroupId: null, ranges: [{ sourceId: 'c1', start: 0, end: 5 }] },
      { id: 'p2', kind: 'sourced', zoneId: 'z1', pinned: false, variantGroupId: null, ranges: [{ sourceId: 'c1', start: 5, end: 10 }] },
    ],
    operations: [
      { id: 'op1', kind: 'pcr', zoneId: null, pinned: false, materializedClones: null, inputs: ['c1'], inputPieces: ['p1'] },
    ],
    zones: [{ id: 'z1', name: 'Z1', bounds: { x: 0, y: 0, width: 600, height: 400 } }],
    assemblyDraftPrimers: {
      z1: [
        { id: 'pr1', name: 'fwd', sequence: 'ATGCAAAGGGCC', direction: 'forward' },
        { id: 'pr2', name: 'rev-locked', sequence: 'CCCTTTGCAT', direction: 'reverse', autoMode: 'manual' },
      ],
    },
    junctions: [], assemblyDrafts: [],
  };
}

describe('K16 — reference fixture migration v10 → v11', () => {
  it('SCHEMA_VERSION_CURRENT === 11', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(12);
  });

  it('migrates the full fixture; every slice gains the v11 fields', () => {
    const m = migrateSnapshot(v10Fixture(), 10);
    expect(m).toBeTruthy();
    // Zone gets finalTopology default 'circular'.
    expect(m.zones[0].finalTopology).toBe('circular');
    // Pieces get groupId:null + groupLayer:0 + mutations:[].
    for (const p of m.pieces) {
      expect(p.groupId).toBeNull();
      expect(p.groupLayer).toBe(0);
      expect(p.mutations).toEqual([]);
    }
    // Operations get isOpGroup:false.
    expect(m.operations[0].isOpGroup).toBe(false);
    // Node A v11→v12 — pre-canon `assemblyDraftPrimers` are wiped (incompatible
    // record shape), not migrated; the chain ends at CURRENT which drops them.
    expect(m.assemblyDraftPrimers).toEqual({});
  });

  it('is idempotent — migrate∘migrate equals migrate (deep)', () => {
    const once = migrateSnapshot(v10Fixture(), 10);
    const twice = migrateSnapshot(once, 10);
    expect(twice).toEqual(once);
  });

  it('no-op at CURRENT version (loop body never enters)', () => {
    const once = migrateSnapshot(v10Fixture(), 10);
    expect(migrateSnapshot(once, SCHEMA_VERSION_CURRENT)).toEqual(once);
  });

  it('preserves explicit zone.finalTopology=linear (never overwrites)', () => {
    const v10 = v10Fixture();
    v10.zones[0].finalTopology = 'linear';
    const m = migrateSnapshot(v10, 10);
    expect(m.zones[0].finalTopology).toBe('linear');
  });

  it('preserves explicit piece.groupId/groupLayer', () => {
    const v10 = v10Fixture();
    v10.pieces[0].groupId = 'g-keep';
    v10.pieces[0].groupLayer = 2;
    const m = migrateSnapshot(v10, 10);
    expect(m.pieces[0].groupId).toBe('g-keep');
    expect(m.pieces[0].groupLayer).toBe(2);
  });

  it('preserves explicit op.isOpGroup=true', () => {
    const v10 = v10Fixture();
    v10.operations[0].isOpGroup = true;
    const m = migrateSnapshot(v10, 10);
    expect(m.operations[0].isOpGroup).toBe(true);
  });

  it('empty assemblyDraftPrimers map → migration succeeds with empty pool', () => {
    const v10 = v10Fixture();
    v10.assemblyDraftPrimers = {};
    const m = migrateSnapshot(v10, 10);
    expect(m.assemblyDraftPrimers).toEqual({});
  });

  it('mutations array on a sourced piece is preserved verbatim (already-v11 data)', () => {
    const v10 = v10Fixture();
    v10.pieces[0].mutations = [{ position: 3, fromBase: 'C', toBase: 'T', kind: 'silent' }];
    const m = migrateSnapshot(v10, 10);
    expect(m.pieces[0].mutations).toEqual([{ position: 3, fromBase: 'C', toBase: 'T', kind: 'silent' }]);
  });
});
