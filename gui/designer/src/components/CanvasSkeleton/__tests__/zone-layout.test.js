/**
 * zone-layout.test.js — T4.5 K3 (DEC-T4.5-01/02/04/05/10).
 *
 * computeZoneLayout → { [nodeId]: {x,y} } for UNPINNED nodes only.
 * 3 horizontal lanes: Sources (top, even spread), Intermediate (dagre
 * LR), Finals (bottom). manual / sequence-mode zones → null. Pinned
 * nodes keep their position (excluded from the result).
 */
import { describe, it, expect } from 'vitest';
import { computeZoneLayout, ZONE_LANE_DY, NODE_FOOTPRINT } from '../lib/zone-layout';

const cnt = (id, over = {}) => ({
  id, kind: 'molecule', name: id, sequence: 'ACGT', zoneId: 'z1', pinned: false, ...over,
});
const op = (id, over = {}) => ({
  id, kind: 'pcr', status: 'committed', inputs: [], outputs: [], inputPieces: [],
  zoneId: 'z1', position: { x: 0, y: 0 }, pinned: false, ...over,
});

function st(over = {}) {
  return {
    zones: [{
      id: 'z1', name: 'Z', viewMode: 'graph', laneLayout: 'auto',
      bounds: { x: 100, y: 200, width: 1200, height: 600 },
    }],
    containers: [], pieces: [], operations: [], junctions: [], positions: {},
    ...over,
  };
}

describe('T4.5 K3 — computeZoneLayout', () => {
  it('manual zone → null (finalizer skips)', () => {
    const s = st();
    s.zones[0].laneLayout = 'manual';
    expect(computeZoneLayout(s, 'z1')).toBeNull();
  });

  it('sequence-mode zone → null (DEC-T4.5-10)', () => {
    const s = st();
    s.zones[0].viewMode = 'sequence';
    expect(computeZoneLayout(s, 'z1')).toBeNull();
  });

  it('unknown zone → null', () => {
    expect(computeZoneLayout(st(), 'zZZ')).toBeNull();
  });

  it('sources land in the top lane, evenly spread, sorted by name', () => {
    const s = st({ containers: [cnt('beta'), cnt('alpha')] });
    const pos = computeZoneLayout(s, 'z1');
    const zb = s.zones[0].bounds;
    // top (source) lane y = zoneTop + source offset (K2: derived, was 50)
    expect(pos.alpha.y).toBe(zb.y + ZONE_LANE_DY.source);
    expect(pos.beta.y).toBe(zb.y + ZONE_LANE_DY.source);
    // alpha (sorted first) is left of beta
    expect(pos.alpha.x).toBeLessThan(pos.beta.x);
    // K2 — pitch ≥ footprint width so adjacent blocks never overlap (was 200<240)
    expect(pos.beta.x - pos.alpha.x).toBeGreaterThanOrEqual(NODE_FOOTPRINT.w);
  });

  it('finals land in the bottom lane', () => {
    // a → op → fin : 'a' source (top), 'fin' final (bottom), op mid.
    const s = st({
      containers: [cnt('a'), cnt('fin', { frozen: true })],
      operations: [op('o1', { inputs: ['a'], outputs: ['fin'] })],
    });
    const pos = computeZoneLayout(s, 'z1');
    const zb = s.zones[0].bounds;
    expect(pos.a.y).toBe(zb.y + ZONE_LANE_DY.source); // source top (K2 derived)
    // DEVIATION DEC-T4.5-08: finals at a FIXED top offset (loop-safe),
    // not bottom-anchored — see zone-layout.js LANE_FIN_DY rationale.
    // K2 — offset is now height-aware (derived from footprint), was 380.
    expect(pos.fin.y).toBe(zb.y + ZONE_LANE_DY.finals);
    expect(pos.o1.y).toBeGreaterThan(pos.a.y); // op in the middle lane
    expect(pos.o1.y).toBeLessThan(pos.fin.y);
  });

  it('middle lane flows left→right by DAG depth (dagre)', () => {
    // mid1 → o1 → mid2 (chain). dagre LR ⇒ x increases along the chain.
    const s = st({
      containers: [cnt('src'), cnt('mid1'), cnt('mid2'), cnt('fin', { frozen: true })],
      operations: [op('o1', { inputs: ['mid1'], outputs: ['mid2'] })],
      junctions: [
        { id: 'j0', fromContainerId: 'src', toContainerId: 'mid1', kind: 'overlap' },
        { id: 'j1', fromContainerId: 'mid2', toContainerId: 'fin', kind: 'overlap' },
      ],
    });
    const pos = computeZoneLayout(s, 'z1');
    expect(pos.mid1.x).toBeLessThan(pos.o1.x);
    expect(pos.o1.x).toBeLessThan(pos.mid2.x);
  });

  it('pinned nodes are excluded from the result (keep their position)', () => {
    const s = st({
      containers: [cnt('free'), cnt('stuck', { pinned: true })],
    });
    const pos = computeZoneLayout(s, 'z1');
    expect(pos.free).toBeTruthy();
    expect(pos.stuck).toBeUndefined();
  });

  it('integer-rounded coords (idempotency contract)', () => {
    const s = st({ containers: [cnt('a'), cnt('b'), cnt('c')] });
    const pos = computeZoneLayout(s, 'z1');
    for (const id of Object.keys(pos)) {
      expect(Number.isInteger(pos[id].x)).toBe(true);
      expect(Number.isInteger(pos[id].y)).toBe(true);
    }
  });

  it('empty zone → empty object (no throw)', () => {
    expect(computeZoneLayout(st(), 'z1')).toEqual({});
  });
});
