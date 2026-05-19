/**
 * skeleton-persistence-migration-v5.test.js — T1 K6.
 *
 * NOTE (R-DRIFT, spec §0): the spec called this "v3→v4", but A1 already
 * shipped SCHEMA_VERSION_CURRENT=4 (assemblyDrafts). T1's pieces
 * migration is therefore v4→v5, derived from the current code per the
 * spec's own "реальный N вывери из текущего кода" guidance.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  migrateSnapshot, saveSnapshot, loadSnapshot, clearSnapshot,
  SCHEMA_VERSION_CURRENT,
} from '../store/skeleton-persistence';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('T1 K6 — migration v4 → v5 (pieces)', () => {
  it('SCHEMA_VERSION_CURRENT is 7 (A1=4, T1=5, T2=6, T3=7 zones); v4→v5 step still adds pieces', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(11); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
  });

  it('v4 snapshot (no pieces) → pieces:[] added, rest intact', () => {
    const v4 = {
      containers: [{ id: 'x' }], operations: [], junctions: [],
      assemblyDrafts: [{ id: 'asm-1' }],
    };
    const migrated = migrateSnapshot(v4, 4);
    expect(migrated.pieces).toEqual([]); // draft has no segments
    // T6 v7→v8: the segment-less draft becomes a zone, drafts emptied.
    expect(migrated.assemblyDrafts).toEqual([]);
    // T3 v6→v7 stamps zoneId:null; T4.5 v9→v10 stamps pinned:false.
    expect(migrated.containers).toEqual([{ id: 'x', zoneId: null, pinned: false }]);
  });

  it('idempotent — a snapshot already carrying pieces passes through unchanged', () => {
    const v5 = { containers: [], assemblyDrafts: [], pieces: [{ id: 'pc-9' }] };
    const migrated = migrateSnapshot(v5, 4);
    // v4→v5 keeps pieces; T3 v6→v7 stamps zoneId:null; T9 v8→v9
    // stamps variantGroupId:null; T4.5 v9→v10 stamps pinned:false;
    // M-CANVAS-WORKFLOW-UX v10→v11 stamps groupId/groupLayer/mutations.
    expect(migrated.pieces).toEqual([{
      id: 'pc-9', zoneId: null, variantGroupId: null, pinned: false,
      groupId: null, groupLayer: 0, mutations: [],
    }]);
  });

  it('already at CURRENT version → no-op', () => {
    const state = { containers: [], pieces: [{ id: 'pc-1' }] };
    expect(migrateSnapshot(state, SCHEMA_VERSION_CURRENT)).toEqual(state);
  });

  it('pre-T1 v3 snapshot upgrades through the whole chain (assemblyDrafts + pieces)', () => {
    const v3 = { containers: [{ id: 'c' }], operations: [], junctions: [] };
    const migrated = migrateSnapshot(v3, 3);
    expect(migrated.assemblyDrafts).toEqual([]); // v3→v4 step
    expect(migrated.pieces).toEqual([]); // v4→v5 step
    expect(migrated.containers).toEqual([{ id: 'c', zoneId: null, pinned: false }]); // v6→v7, v9→v10
  });
});

describe('T1 K6 — R-T1-4 pieces persist round-trip', () => {
  beforeEach(async () => { await clearSnapshot(); });

  it('saveSnapshot → loadSnapshot restores pieces unchanged', async () => {
    let s = buildInitialState();
    s = { ...s, containers: [...s.containers, { id: 'c-1', name: 'pUC', sequence: 'ACGTACGTAC', annotations: [] }] };
    s = skeletonReducer(s, {
      type: 'CREATE_PIECE',
      piece: {
        name: 'rt', sourceIds: ['c-1'],
        ranges: [{ sourceId: 'c-1', start: 0, end: 4, orientation: 'forward' }],
        origin: 'selection', acquisitionMethod: 'undefined', acquisitionParams: {},
      },
    });
    expect(s.pieces).toHaveLength(1);
    await saveSnapshot(s);
    const loaded = await loadSnapshot();
    expect(loaded).toBeTruthy();
    expect(loaded.pieces).toHaveLength(1);
    expect(loaded.pieces[0].name).toBe('rt');
  });
});
