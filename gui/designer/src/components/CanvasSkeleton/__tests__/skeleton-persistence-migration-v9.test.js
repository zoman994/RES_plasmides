/**
 * skeleton-persistence-migration-v9.test.js — T9 K1.
 *
 * R-DRIFT: spec called this v7→v8, but SCHEMA_VERSION_CURRENT already
 * reached 8 at T6. T9's variants migration is therefore v8→v9 (derived
 * from current code). Additive + idempotent: piece.variantGroupId:null
 * + op.materializedClones:null stamped where absent; pre-existing
 * values preserved.
 */
import { describe, it, expect } from 'vitest';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

describe('T9 K1 — migration v8 → v9 (variants fields)', () => {
  it('SCHEMA_VERSION_CURRENT bumped to 9 (T6=8 zones, T9=9 variants)', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(10); // T4.5 R-DRIFT: node.pinned bump 9→10
  });

  it('v8 snapshot → variantGroupId:null on pieces, materializedClones:null on ops', () => {
    const v8 = {
      containers: [{ id: 'c1' }],
      pieces: [{ id: 'p1' }, { id: 'p2' }],
      operations: [{ id: 'o1' }],
      zones: [],
    };
    const m = migrateSnapshot(v8, 8);
    expect(m.pieces.every((p) => p.variantGroupId === null)).toBe(true);
    expect(m.operations[0].materializedClones).toBeNull();
    // v8→v9 leaves containers alone, but the chain runs to CURRENT so
    // T4.5 v9→v10 stamps pinned:false (R-DRIFT contract change).
    expect(m.containers).toEqual([{ id: 'c1', pinned: false }]);
  });

  it('idempotent — pre-existing variantGroupId / materializedClones preserved', () => {
    const v8 = {
      pieces: [{ id: 'p1', variantGroupId: 'vg-keep' }],
      operations: [{ id: 'o1', materializedClones: [{ cloneId: 'x', label: 'c1' }] }],
    };
    const m = migrateSnapshot(v8, 8);
    expect(m.pieces[0].variantGroupId).toBe('vg-keep');
    expect(m.operations[0].materializedClones).toEqual([{ cloneId: 'x', label: 'c1' }]);
  });

  it('no-op at CURRENT version', () => {
    const s = { pieces: [{ id: 'p', variantGroupId: null }] };
    expect(migrateSnapshot(s, SCHEMA_VERSION_CURRENT)).toEqual(s);
  });

  it('pre-T9 v6 snapshot upgrades through the whole chain to v9', () => {
    const v6 = {
      containers: [{ id: 'c' }], pieces: [{ id: 'p' }],
      operations: [{ id: 'o' }], junctions: [], assemblyDrafts: [],
    };
    const m = migrateSnapshot(v6, 6);
    expect(m.zones).toEqual([]); // v6→v7
    expect(m.pieces[0].variantGroupId).toBeNull(); // v8→v9
    expect(m.operations[0].materializedClones).toBeNull();
  });
});
