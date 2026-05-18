/**
 * selectors-zones.test.js — T3 K5. Pure derived reads over state.zones.
 * NOTE: real junction shape is fromContainerId/toContainerId (spec §5.7
 * wrote j.from/j.to) — selectors accept both, prefer the real fields.
 */
import { describe, it, expect } from 'vitest';
import {
  selectAllZones, selectZoneById, selectZoneByNodeId, selectLooseNodes,
  selectNodesInZone, selectJunctionsInZone, selectJunctionZoneId,
  selectDefaultZone, selectFinalProductsInZone,
} from '../store/selectors-zones';

const state = {
  zones: [
    { id: 'z1', name: 'A' },
    { id: 'z2', name: 'B' },
  ],
  containers: [
    { id: 'c1', name: 'C1', zoneId: 'z1' },
    { id: 'c2', name: 'C2', zoneId: 'z1' },
    { id: 'c3', name: 'C3', zoneId: 'z2' },
    { id: 'c4', name: 'C4', zoneId: null },
  ],
  pieces: [{ id: 'p1', zoneId: 'z1' }, { id: 'p2', zoneId: null }],
  operations: [{ id: 'o1', zoneId: 'z2' }, { id: 'o2' }],
  junctions: [
    { id: 'j-in', fromContainerId: 'c1', toContainerId: 'c2' }, // both z1
    { id: 'j-cross', fromContainerId: 'c1', toContainerId: 'c3' }, // z1↔z2
    { id: 'j-loose', fromContainerId: 'c1', toContainerId: 'c4' }, // c4 loose
  ],
};

describe('T3 K5 selectors-zones', () => {
  it('selectAllZones / selectZoneById / selectDefaultZone', () => {
    expect(selectAllZones(state)).toHaveLength(2);
    expect(selectAllZones({})).toEqual([]);
    expect(selectZoneById(state, 'z2').name).toBe('B');
    expect(selectZoneById(state, 'zX')).toBeNull();
    expect(selectDefaultZone(state).id).toBe('z1');
    expect(selectDefaultZone({ zones: [] })).toBeNull();
  });

  it('selectZoneByNodeId resolves a node across slices', () => {
    expect(selectZoneByNodeId(state, 'c1').id).toBe('z1');
    expect(selectZoneByNodeId(state, 'o1').id).toBe('z2');
    expect(selectZoneByNodeId(state, 'c4')).toBeNull(); // loose
    expect(selectZoneByNodeId(state, 'ghost')).toBeNull();
  });

  it('selectLooseNodes partitions zoneId null/undefined', () => {
    const l = selectLooseNodes(state);
    expect(l.containers.map((c) => c.id)).toEqual(['c4']);
    expect(l.pieces.map((p) => p.id)).toEqual(['p2']);
    expect(l.operations.map((o) => o.id)).toEqual(['o2']);
  });

  it('selectNodesInZone returns members of a zone', () => {
    const n = selectNodesInZone(state, 'z1');
    expect(n.containers.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(n.pieces.map((p) => p.id)).toEqual(['p1']);
  });

  it('selectJunctionsInZone — both endpoints inside the zone only', () => {
    expect(selectJunctionsInZone(state, 'z1').map((j) => j.id)).toEqual(['j-in']);
    expect(selectJunctionsInZone(state, 'z2')).toEqual([]);
  });

  it('selectJunctionZoneId — same | cross-zone | null', () => {
    expect(selectJunctionZoneId(state, 'j-in')).toBe('z1');
    expect(selectJunctionZoneId(state, 'j-cross')).toBe('cross-zone');
    expect(selectJunctionZoneId(state, 'j-loose')).toBeNull();
    expect(selectJunctionZoneId(state, 'jX')).toBeNull();
  });

  it('selectFinalProductsInZone — zone containers with no outgoing junction', () => {
    // z1 containers: c1 (has outgoing j-in/j-cross/j-loose), c2 (none) → c2 final
    expect(selectFinalProductsInZone(state, 'z1').map((c) => c.id)).toEqual(['c2']);
  });
});
