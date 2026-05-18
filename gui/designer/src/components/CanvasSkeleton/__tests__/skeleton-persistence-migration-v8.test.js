/**
 * skeleton-persistence-migration-v8.test.js — T6 K4.
 * R-DRIFT chain: A1=4,T1=5,T2=6,T3=7 → T6 assemblyDrafts→zones+pieces
 * migration is v7→v8 (spec said v6→v7; derived from code).
 */
import { describe, it, expect } from 'vitest';
import { migrateSnapshot, SCHEMA_VERSION_CURRENT } from '../store/skeleton-persistence';

const C = { id: 'c-1', name: 'pUC', sequence: 'AAAACCCCGGGGTTTT' };
const v7 = (drafts) => ({
  containers: [C], operations: [], junctions: [], pieces: [], zones: [],
  assemblyDrafts: drafts,
});
const sourcedSeg = { id: 'seg-1', source: { type: 'container', containerId: 'c-1' }, start: 0, end: 4, reverseComplement: false, length: 4 };
const gapSeg = { id: 'seg-2', source: { type: 'manual' }, sequence: '', length: 6, gapKind: 'linker' };

describe('T6 K4 — migration v7 → v8 (assemblyDrafts → zones + pieces)', () => {
  it('SCHEMA_VERSION_CURRENT bumped to 8', () => {
    expect(SCHEMA_VERSION_CURRENT).toBe(10); // T4.5 R-DRIFT: node.pinned bump 9→10
  });

  it('one draft → one zone (viewMode sequence) + pieces (legacy-migration / gap)', () => {
    const m = migrateSnapshot(v7([
      { id: 'asm-1', name: 'My', topology: { circular: false }, position: { x: 50, y: 60 }, segments: [sourcedSeg, gapSeg] },
    ]), 7);
    expect(m.zones).toHaveLength(1);
    expect(m.zones[0].viewMode).toBe('sequence');
    expect(m.zones[0].name).toBe('My');
    expect(m.zones[0].bounds).toMatchObject({ x: 50, y: 60 });
    expect(m.pieces).toHaveLength(2);
    expect(m.pieces.every((p) => p.zoneId === m.zones[0].id)).toBe(true);
    const sourced = m.pieces.find((p) => p.kind === 'sourced');
    const gap = m.pieces.find((p) => p.kind === 'gap');
    expect(sourced.origin).toBe('legacy-migration');
    expect(sourced.ranges[0]).toMatchObject({ sourceId: 'c-1', start: 0, end: 4 });
    expect(gap.origin).toBe('manual-gap');
    expect(gap.gapLength).toBe(6);
    expect(m.assemblyDrafts).toEqual([]);
  });

  it('multi-draft → multi-zone, pieces partitioned by zone', () => {
    const m = migrateSnapshot(v7([
      { id: 'a1', name: 'A', segments: [sourcedSeg] },
      { id: 'a2', name: 'B', segments: [sourcedSeg, sourcedSeg] },
    ]), 7);
    expect(m.zones).toHaveLength(2);
    expect(m.pieces).toHaveLength(3);
    const byZone = m.zones.map((z) => m.pieces.filter((p) => p.zoneId === z.id).length);
    expect(byZone.sort()).toEqual([1, 2]);
  });

  it('idempotent — already-v8 (empty assemblyDrafts) → no new zones/pieces', () => {
    const v8 = { containers: [], assemblyDrafts: [], zones: [{ id: 'zn-x' }], pieces: [{ id: 'pc-x' }] };
    const m = migrateSnapshot(v8, 7);
    expect(m.zones).toEqual([{ id: 'zn-x' }]);
    // No NEW pieces; the existing one additively gains variantGroupId
    // (T9 v8→v9) and pinned (T4.5 v9→v10) — R-DRIFT contract change.
    expect(m.pieces).toEqual([{ id: 'pc-x', variantGroupId: null, pinned: false }]);
  });

  it('bad container ref → still creates a piece (adapter tolerates missing container)', () => {
    const m = migrateSnapshot(v7([
      { id: 'a', name: 'X', segments: [{ id: 's', source: { type: 'container', containerId: 'gone' }, start: 0, end: 3, reverseComplement: false, length: 3 }] },
    ]), 7);
    expect(m.pieces).toHaveLength(1);
    expect(m.pieces[0].sourceIds).toEqual(['gone']);
  });

  it('pre-T1 v3 snapshot upgrades through the whole chain', () => {
    const m = migrateSnapshot({ containers: [C], operations: [], junctions: [], assemblyDrafts: [{ id: 'a', name: 'Z', segments: [sourcedSeg] }] }, 3);
    expect(Array.isArray(m.pieces)).toBe(true);
    expect(m.zones.length).toBeGreaterThanOrEqual(1);
    expect(m.assemblyDrafts).toEqual([]);
  });
});
