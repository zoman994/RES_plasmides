/**
 * assembly-selectors-persistence.test.js — A1 K3 (selectors) + K4
 * (schema v3→v4 additive migration, idempotent, round-trip).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import {
  selectAssemblyDraftById, selectAssemblyDraftSequence,
  selectAssemblyDraftLength, selectSegmentBoundaries,
  selectAssemblyDraftAnnotations,
} from '../store/selectors-assembly';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

function draftState() {
  let s = buildInitialState();
  s = {
    ...s,
    containers: [
      ...s.containers,
      {
        id: 'c1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT',
        annotations: [{ id: 'a1', level: 'region', type: 'CDS', name: 'g', start: 5, end: 8, strand: 1 }],
      },
    ],
  };
  s = skeletonReducer(s, { type: 'CREATE_ASSEMBLY_DRAFT', id: 'asm-1' });
  s = skeletonReducer(s, { type: 'INSERT_SEGMENT', draftId: 'asm-1', sourceContainerId: 'c1', start: 4, end: 8 });
  s = skeletonReducer(s, { type: 'INSERT_MANUAL_SEGMENT', draftId: 'asm-1', sequence: 'GG' });
  return s;
}

describe('K3 selectors-assembly', () => {
  it('selectAssemblyDraftById returns the draft or null', () => {
    const s = draftState();
    expect(selectAssemblyDraftById(s, 'asm-1').id).toBe('asm-1');
    expect(selectAssemblyDraftById(s, 'nope')).toBeNull();
  });
  it('selectAssemblyDraftSequence concats cached segment sequences', () => {
    expect(selectAssemblyDraftSequence(draftState(), 'asm-1')).toBe('CCCCGG');
  });
  it('selectAssemblyDraftLength sums segment lengths', () => {
    expect(selectAssemblyDraftLength(draftState(), 'asm-1')).toBe(6);
  });
  it('selectSegmentBoundaries gives cumulative offsets', () => {
    const b = selectSegmentBoundaries(draftState(), 'asm-1');
    expect(b.map((x) => [x.startOnAssembly, x.endOnAssembly])).toEqual([[0, 4], [4, 6]]);
  });
  it('selectAssemblyDraftAnnotations aggregates with assembly offset', () => {
    // container annotation 1-based 5..8 inside segment [4,8) → local 1..4;
    // segment starts at assembly offset 0 → assembly 1..4.
    const anns = selectAssemblyDraftAnnotations(draftState(), 'asm-1');
    expect(anns).toHaveLength(1);
    expect(anns[0]).toMatchObject({ start: 1, end: 4, level: 'region' });
    expect(anns[0].id).toBeTypeOf('string');
  });
});

describe('K4 persistence migration (v3→v4 assemblyDrafts; chain ends v5 post-T1)', () => {
  it('SCHEMA_VERSION_CURRENT is 7 (A1=4 assemblyDrafts, T1=5 pieces, T2=6 op.inputPieces, T3=7 zones)', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(11); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
  });
  it('v3 snapshot (no assemblyDrafts) → assemblyDrafts:[] added, rest intact', () => {
    const v3 = { containers: [{ id: 'x' }], junctions: [], operations: [] };
    const migrated = migrateSnapshot(v3, 3);
    expect(migrated.assemblyDrafts).toEqual([]);
    // T3 v6→v7 stamps zoneId:null; T4.5 v9→v10 stamps pinned:false.
    expect(migrated.containers).toEqual([{ id: 'x', zoneId: null, pinned: false }]);
  });
  it('T6 v7→v8 migrates the draft into a zone + empties assemblyDrafts', () => {
    const v4 = { containers: [], assemblyDrafts: [{ id: 'asm-9' }] };
    const migrated = migrateSnapshot(v4, 4);
    // chain now ends at v8: assemblyDrafts → zones (DEC-T6-06).
    expect(migrated.assemblyDrafts).toEqual([]);
    expect(migrated.zones).toHaveLength(1);
    expect(migrated.zones[0].viewMode).toBe('sequence');
  });
  it('round-trip: create+insert state survives a migrate pass', () => {
    const s = draftState();
    const again = migrateSnapshot(s, SCHEMA_VERSION_CURRENT);
    expect(selectAssemblyDraftSequence(again, 'asm-1')).toBe('CCCCGG');
  });
});
