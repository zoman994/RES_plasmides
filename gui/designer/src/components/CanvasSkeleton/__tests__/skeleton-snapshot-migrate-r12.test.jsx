/**
 * skeleton-snapshot-migrate-r12.test.jsx — Snapshot schemaVersion + migrations.
 *
 * R12-3 (15.05.2026 — DEC-OPS-SNAPSHOT-MIGRATE-01).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  migrateSnapshot,
  saveSnapshot,
  loadSnapshot,
  clearSnapshot,
  SCHEMA_VERSION_CURRENT,
} from '../store/skeleton-persistence';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

describe('R12-3 — migrateSnapshot', () => {
  it('v1 → v2 добавляет toasts: []', () => {
    const v1State = {
      containers: [],
      operations: [],
      positions: {},
      junctions: [],
      cascadeIndex: 0,
    };
    const migrated = migrateSnapshot(v1State, 1);
    expect(migrated).toBeTruthy();
    expect(migrated.toasts).toEqual([]);
  });

  it('v1 → v3 preserves containers / operations / positions; junctions normalized (F2 DEC-JUNC-08)', () => {
    const v1State = {
      containers: [{ id: 'c1', name: 'X', sequence: 'ATGC' }],
      operations: [{ id: 'op1', kind: 'cut', status: 'committed' }],
      positions: { c1: { x: 100, y: 200 } },
      junctions: [{ id: 'j1', fromContainerId: 'a', toContainerId: 'b' }],
      cascadeIndex: 3,
    };
    const migrated = migrateSnapshot(v1State, 1);
    // v6→v7 stamps zoneId:null; v9→v10 stamps pinned:false.
    expect(migrated.containers).toEqual(
      v1State.containers.map((c) => ({ ...c, zoneId: null, pinned: false })),
    );
    // T2 v5→v6 inputPieces:[]; T3 v6→v7 zoneId:null; T9 v8→v9
    // materializedClones:null; T4.5 v9→v10 pinned:false (R-DRIFT).
    // id/kind/status are still preserved through the chain.
    expect(migrated.operations).toEqual(
      v1State.operations.map((o) => ({
        ...o, inputPieces: [], zoneId: null, materializedClones: null, pinned: false,
      })),
    );
    expect(migrated.positions).toEqual(v1State.positions);
    // F2: the v2→v3 step normalizes junctions to the contract shape —
    // id/from/to preserved, contract fields filled with defaults.
    expect(migrated.junctions[0]).toMatchObject({
      id: 'j1', fromContainerId: 'a', toContainerId: 'b',
      status: expect.any(String), overlapTarget: 'right',
    });
    expect(migrated.cascadeIndex).toBe(3);
  });

  it('null state → null', () => {
    expect(migrateSnapshot(null, 1)).toBeNull();
  });

  it('missing migration step → null', () => {
    // Simulate impossible migration request (e.g. v0 → v2).
    expect(migrateSnapshot({}, 0)).toBeNull();
  });

  it('already at current version → identity-ish', () => {
    const state = { containers: [], operations: [], toasts: [] };
    const migrated = migrateSnapshot(state, SCHEMA_VERSION_CURRENT);
    expect(migrated).toEqual(state);
  });
});

describe('R12-3 — save / load roundtrip', () => {
  beforeEach(async () => {
    await clearSnapshot();
  });

  it('save → load returns стрипнутый state', async () => {
    const state = {
      ...buildInitialState(),
      containers: [{ id: 'c1', name: 'X' }],
      view: 'graph',
      highlightedContainerId: 'c1',
      toasts: [{ id: 't1', message: 'hi' }],
    };
    await saveSnapshot(state);
    const loaded = await loadSnapshot();
    expect(loaded).toBeTruthy();
    expect(loaded.containers).toEqual([{ id: 'c1', name: 'X' }]);
    // Transient поля stripped.
    expect(loaded.view).toBeUndefined();
    expect(loaded.highlightedContainerId).toBeUndefined();
    expect(loaded.toasts).toBeUndefined();
  });

  it('REPLACE_STATE merges loaded snapshot с initial defaults для transient UI', () => {
    const persisted = {
      containers: [{ id: 'c1', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] }],
      operations: [],
      positions: { c1: { x: 100, y: 100 } },
      junctions: [],
      cascadeIndex: 0,
    };
    const initial = buildInitialState();
    const next = skeletonReducer(initial, { type: 'REPLACE_STATE', state: persisted });
    expect(next.containers).toEqual(persisted.containers);
    expect(next.view).toBe('layout'); // default
    expect(next.toasts).toEqual([]); // default
    expect(next.selectedContainerIds).toEqual([]); // default
  });
});
