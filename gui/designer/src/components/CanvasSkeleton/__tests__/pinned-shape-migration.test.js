/**
 * pinned-shape-migration.test.js — T4.5 K4 (DEC-T4.5-04).
 *
 * `pinned: boolean` (default false) on the node factories + a
 * v9→v10 migration that stamps it where absent (idempotent, preserves
 * an existing pinned:true). Drag-override flag for auto-layout opt-out.
 */
import { describe, it, expect } from 'vitest';
import { createPiece, clonePiece } from '../lib/piece-model';
import { createOperationDraft } from '../store/skeleton-state-operations';
import { makeGhostPlaceholder } from '../store/skeleton-state-canvas';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

describe('T4.5 K4 — pinned default on factories', () => {
  it('createPiece → pinned:false', () => {
    expect(createPiece({ kind: 'sourced', name: 'p' }, []).pinned).toBe(false);
  });
  it('clonePiece → pinned:false (a clone is a fresh free node)', () => {
    const src = createPiece({ kind: 'sourced', name: 'p' }, []);
    expect(clonePiece({ ...src, pinned: true }).pinned).toBe(false);
  });
  it('createOperationDraft → pinned:false', () => {
    expect(createOperationDraft({ kind: 'pcr' }).pinned).toBe(false);
  });
  it('makeGhostPlaceholder → pinned:false', () => {
    expect(makeGhostPlaceholder().pinned).toBe(false);
  });
});

describe('T4.5 K4 — v9→v10 migration stamps pinned', () => {
  it('SCHEMA_VERSION_CURRENT is at least 10', () => {
    expect(SCHEMA_VERSION_CURRENT).toBeGreaterThanOrEqual(10);
  });

  it('stamps pinned:false on containers / pieces / operations where absent', () => {
    const snap = {
      containers: [{ id: 'c1', kind: 'molecule', name: 'c' }],
      pieces: [{ id: 'p1', kind: 'sourced', name: 'p' }],
      operations: [{ id: 'o1', kind: 'pcr' }],
      zones: [], junctions: [], positions: {},
    };
    const m = migrateSnapshot(snap, 9);
    expect(m).toBeTruthy();
    expect(m.containers[0].pinned).toBe(false);
    expect(m.pieces[0].pinned).toBe(false);
    expect(m.operations[0].pinned).toBe(false);
  });

  it('preserves an existing pinned:true (idempotent, never overwrites)', () => {
    const snap = {
      containers: [{ id: 'c1', kind: 'molecule', pinned: true }],
      pieces: [{ id: 'p1', kind: 'sourced', pinned: true }],
      operations: [{ id: 'o1', kind: 'pcr', pinned: false }],
      zones: [], junctions: [], positions: {},
    };
    const m = migrateSnapshot(snap, 9);
    expect(m.containers[0].pinned).toBe(true);
    expect(m.pieces[0].pinned).toBe(true);
    expect(m.operations[0].pinned).toBe(false);
    // re-running the full chain is a no-op on already-v-current state
    const again = migrateSnapshot(m, 9);
    expect(again.containers[0].pinned).toBe(true);
  });
});
