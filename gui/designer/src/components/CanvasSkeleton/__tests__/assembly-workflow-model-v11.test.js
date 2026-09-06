/**
 * assembly-workflow-model-v11.test.js — M-CANVAS-WORKFLOW-UX K1.
 *
 * Data-model extension per SPEC_ASSEMBLY_WORKFLOW_UX §6 + migration
 * v10→v11 per §9. Additive + idempotent (mirrors the v9→v10 pinned
 * precedent): factories stamp the new fields; migration stamps them on
 * old snapshots where absent and never overwrites an existing value.
 */
import { describe, it, expect } from 'vitest';
import { createPiece, clonePiece } from '../lib/piece-model';
import { createZone } from '../lib/zone-model';
import { createOperationDraft } from '../store/skeleton-state-operations';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

describe('K1 — factory defaults (piece / zone / op)', () => {
  it('createPiece sourced → groupId:null, groupLayer:0, mutations:[]', () => {
    const p = createPiece({ kind: 'sourced', name: 'frag' }, []);
    expect(p.kind).toBe('sourced');
    expect(p.groupId).toBeNull();
    expect(p.groupLayer).toBe(0);
    expect(p.mutations).toEqual([]);
  });

  it('createPiece kind=snippet → kind kept, embedsInPrimer default true, sequence + snippetType stored', () => {
    const p = createPiece({
      kind: 'snippet', name: '6xHis', sequence: 'CATCATCATCATCATCAT', snippetType: '6xHis',
    }, []);
    expect(p.kind).toBe('snippet');
    expect(p.embedsInPrimer).toBe(true);
    expect(p.sequence).toBe('CATCATCATCATCATCAT');
    expect(p.snippetType).toBe('6xHis');
  });

  it('createPiece snippet embedsInPrimer:false is honored', () => {
    const p = createPiece({ kind: 'snippet', sequence: 'ATG', embedsInPrimer: false }, []);
    expect(p.embedsInPrimer).toBe(false);
  });

  it('createPiece kind=synthesis → kind kept + sequence stored', () => {
    const p = createPiece({ kind: 'synthesis', name: 'Hyg', sequence: 'ATGAAA' }, []);
    expect(p.kind).toBe('synthesis');
    expect(p.sequence).toBe('ATGAAA');
  });

  it('createPiece kind=intermediate → sequence + derivedFromOpId stored', () => {
    const p = createPiece({
      kind: 'intermediate', sequence: 'GGGG', derivedFromOpId: 'op-1',
    }, []);
    expect(p.kind).toBe('intermediate');
    expect(p.sequence).toBe('GGGG');
    expect(p.derivedFromOpId).toBe('op-1');
  });

  it('createPiece unknown kind → coerced to sourced; gap still preserved', () => {
    expect(createPiece({ kind: 'banana' }, []).kind).toBe('sourced');
    const g = createPiece({ kind: 'gap', gapLength: 12 }, []);
    expect(g.kind).toBe('gap');
    expect(g.gapLength).toBe(12);
  });

  it('clonePiece → fresh free (groupId:null, groupLayer:0) but mutations deep-copied', () => {
    const src = createPiece({ kind: 'sourced', name: 'm' }, []);
    const mutated = {
      ...src, groupId: 'g1', groupLayer: 3, mutations: [{ position: 234, fromBase: 'C', toBase: 'T' }],
    };
    const c = clonePiece(mutated);
    expect(c.groupId).toBeNull();
    expect(c.groupLayer).toBe(0);
    expect(c.mutations).toEqual([{ position: 234, fromBase: 'C', toBase: 'T' }]);
    expect(c.mutations).not.toBe(mutated.mutations); // deep copy
  });

  it('createZone → finalTopology default circular; explicit linear honored', () => {
    expect(createZone({ name: 'z', bounds: {} }).finalTopology).toBe('circular');
    expect(createZone({ name: 'z', bounds: {}, finalTopology: 'linear' }).finalTopology).toBe('linear');
  });

  it('createOperationDraft → isOpGroup:false', () => {
    expect(createOperationDraft({ kind: 'pcr' }).isOpGroup).toBe(false);
  });
});

describe('K1 — migration v10 → v11', () => {
  it('SCHEMA_VERSION_CURRENT bumped to 11 (M-CANVAS-WORKFLOW-UX workflow fields)', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(13);
  });

  it('v10 snapshot → new fields stamped on zones / pieces / ops / primers', () => {
    const v10 = {
      containers: [{ id: 'c1' }],
      pieces: [{ id: 'p1', kind: 'sourced' }],
      operations: [{ id: 'o1', kind: 'pcr' }],
      zones: [{ id: 'z1', name: 'Z' }],
      assemblyDraftPrimers: { d1: [{ id: 'pr1', sequence: 'ATGCATGCAT' }] },
    };
    const m = migrateSnapshot(v10, 10);
    expect(m).toBeTruthy();
    expect(m.zones[0].finalTopology).toBe('circular');
    expect(m.pieces[0].groupId).toBeNull();
    expect(m.pieces[0].groupLayer).toBe(0);
    expect(m.pieces[0].mutations).toEqual([]);
    expect(m.operations[0].isOpGroup).toBe(false);
    // Node A v11→v12 — pre-canon primers are wiped (the v10→v11 binding/tail
    // stamping is superseded; chain ends at CURRENT which drops them).
    expect(m.assemblyDraftPrimers).toEqual({});
  });

  it('idempotent — pre-existing values preserved, re-run is a no-op', () => {
    const v10 = {
      pieces: [{ id: 'p1', kind: 'sourced', groupId: 'g-keep', groupLayer: 2 }],
      operations: [{ id: 'o1', kind: 'pcr', isOpGroup: true }],
      zones: [{ id: 'z1', finalTopology: 'linear' }],
      assemblyDraftPrimers: { d1: [{ id: 'pr1', sequence: 'AAA', autoMode: 'auto', binding: 'AA', tail: 'T' }] },
    };
    const m = migrateSnapshot(v10, 10);
    expect(m.pieces[0].groupId).toBe('g-keep');
    expect(m.pieces[0].groupLayer).toBe(2);
    expect(m.operations[0].isOpGroup).toBe(true);
    expect(m.zones[0].finalTopology).toBe('linear');
    // Node A v11→v12 — primers wiped regardless of their v10 form.
    expect(m.assemblyDraftPrimers).toEqual({});
    const again = migrateSnapshot(m, 10);
    expect(again).toEqual(m);
  });

  it('no-op at CURRENT version', () => {
    const s = { pieces: [{ id: 'p', groupId: null, groupLayer: 0, mutations: [] }] };
    expect(migrateSnapshot(s, SCHEMA_VERSION_CURRENT)).toEqual(s);
  });

  it('full chain v8 → v11 carries variants + pinned + workflow fields', () => {
    const v8 = {
      containers: [{ id: 'c' }], pieces: [{ id: 'p' }],
      operations: [{ id: 'o' }], zones: [{ id: 'z' }], junctions: [], assemblyDrafts: [],
    };
    const m = migrateSnapshot(v8, 8);
    expect(m.pieces[0].variantGroupId).toBeNull(); // v8→v9
    expect(m.pieces[0].pinned).toBe(false); // v9→v10
    expect(m.pieces[0].groupLayer).toBe(0); // v10→v11
    expect(m.zones[0].finalTopology).toBe('circular');
    expect(m.operations[0].isOpGroup).toBe(false);
  });
});
