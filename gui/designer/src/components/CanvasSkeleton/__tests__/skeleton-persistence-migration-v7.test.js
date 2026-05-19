/**
 * skeleton-persistence-migration-v7.test.js — T3 K11.
 *
 * R-DRIFT chain: spec called this v5→v6, but A1=4, T1=5, T2=6 → T3's
 * zones migration is v6→v7 (derived from current code). Additive +
 * idempotent: zones:[] + zoneId:null stamped on containers / pieces /
 * operations; an already-present zoneId is preserved (R-T3-2).
 */
import { describe, it, expect } from 'vitest';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

describe('T3 K11 — migration v6 → v7 (zones + zoneId)', () => {
  it('SCHEMA_VERSION_CURRENT bumped to 7 (A1=4, T1=5, T2=6, T3=7)', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(11); // M-CANVAS-WORKFLOW-UX K1: bump 10→11
  });

  it('v6 snapshot → zones:[] + zoneId:null on every node', () => {
    const v6 = {
      containers: [{ id: 'c1' }], pieces: [{ id: 'p1' }],
      operations: [{ id: 'o1' }], junctions: [], assemblyDrafts: [],
    };
    const m = migrateSnapshot(v6, 6);
    expect(m.zones).toEqual([]);
    expect(m.containers[0]).toMatchObject({ id: 'c1', zoneId: null });
    expect(m.pieces[0]).toMatchObject({ id: 'p1', zoneId: null });
    expect(m.operations[0]).toMatchObject({ id: 'o1', zoneId: null });
  });

  it('idempotent — pre-existing zoneId / zones preserved (R-T3-2)', () => {
    const v7 = {
      containers: [{ id: 'c1', zoneId: 'z-keep' }],
      pieces: [], operations: [], zones: [{ id: 'zn-1' }],
    };
    const m = migrateSnapshot(v7, 6);
    expect(m.containers[0].zoneId).toBe('z-keep');
    // v10→v11 (M-CANVAS-WORKFLOW-UX) additively stamps zone.finalTopology.
    expect(m.zones).toEqual([{ id: 'zn-1', finalTopology: 'circular' }]);
  });

  it('no-op at CURRENT version', () => {
    const s = { containers: [], zones: [{ id: 'zn-x' }] };
    expect(migrateSnapshot(s, SCHEMA_VERSION_CURRENT)).toEqual(s);
  });

  it('pre-T1 v3 snapshot upgrades through the whole chain', () => {
    const v3 = {
      containers: [{ id: 'c' }], junctions: [],
      operations: [{ id: 'o', kind: 'pcr', status: 'committed', inputs: ['c'], params: {} }],
    };
    const m = migrateSnapshot(v3, 3);
    expect(m.assemblyDrafts).toEqual([]); // v3→v4
    expect(Array.isArray(m.pieces)).toBe(true); // v4→v5 (+v5→v6 op pieces)
    expect(m.zones).toEqual([]); // v6→v7
    expect(m.containers[0].zoneId).toBeNull();
    expect(m.operations[0].zoneId).toBeNull();
  });
});
