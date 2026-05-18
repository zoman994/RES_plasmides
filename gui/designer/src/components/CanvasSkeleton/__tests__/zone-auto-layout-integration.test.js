/**
 * zone-auto-layout-integration.test.js — T4.5 K13. End-to-end through
 * the real skeletonReducer finalizer chain (DEC-T4.5-06): a dispatch
 * arranges an auto/graph zone into 3 lanes; pinned nodes are left put;
 * manual / sequence-mode zones are skipped; the finalizer is idempotent
 * (no loop).
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

const cnt = (id, over = {}) => ({
  id, kind: 'molecule', name: id, sequence: 'ACGT', annotations: [],
  topology: { circular: false }, zoneId: 'zT', pinned: false, ...over,
});

// Minimal full-shape state with one auto graph zone + a src→fin DAG.
function seed(zoneOver = {}) {
  const base = buildInitialState({ forceEmptyZones: true });
  return {
    ...base,
    zones: [{
      id: 'zT', name: 'Сборка 1', viewMode: 'graph', laneLayout: 'auto',
      collapsed: false, autoResize: true,
      bounds: { x: 100, y: 100, width: 1400, height: 700 }, ...zoneOver,
    }],
    containers: [cnt('src'), cnt('fin', { frozen: true })],
    pieces: [],
    operations: [{
      id: 'op1', kind: 'pcr', status: 'committed', inputs: ['src'],
      outputs: ['fin'], inputPieces: [], zoneId: 'zT',
      position: { x: 0, y: 0 }, pinned: false, materializedClones: null,
    }],
    junctions: [],
    positions: {},
  };
}
const tick = (s) => skeletonReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: 'zT' });

describe('T4.5 K13 — finalizer arranges the zone into 3 lanes', () => {
  it('source → top lane, op → middle, final → bottom (one dispatch)', () => {
    const s = tick(seed());
    expect(s.positions.src).toBeTruthy();
    expect(s.positions.fin).toBeTruthy();
    const op = s.operations.find((o) => o.id === 'op1');
    // Lanes are top-anchored at FIXED deltas from the (possibly
    // auto-grown) zone top — assert the contract via the deltas, not a
    // brittle absolute pixel (bounds auto-resize legitimately shifts y).
    expect(op.position.y - s.positions.src.y).toBe(150 - 50); // mid − src
    expect(s.positions.fin.y - s.positions.src.y).toBe(380 - 50); // fin − src
    expect(s.positions.src.y).toBeLessThan(op.position.y);
    expect(op.position.y).toBeLessThan(s.positions.fin.y);
  });

  it('idempotent: a second dispatch does not move anything', () => {
    const a = tick(seed());
    const b = tick(a);
    expect(b.positions.src).toEqual(a.positions.src);
    expect(b.positions.fin).toEqual(a.positions.fin);
    expect(b.operations.find((o) => o.id === 'op1').position)
      .toEqual(a.operations.find((o) => o.id === 'op1').position);
  });

  it('a pinned node keeps its manual position', () => {
    let s = seed();
    s.containers = [
      cnt('src', { pinned: true }),
      cnt('fin', { frozen: true }),
    ];
    s.positions = { src: { x: 999, y: 888 } };
    s = tick(s);
    expect(s.positions.src).toEqual({ x: 999, y: 888 }); // untouched
    expect(s.positions.fin).toBeTruthy(); // unpinned still arranged
  });

  it('manual zone is skipped by the finalizer', () => {
    const s = tick(seed({ laneLayout: 'manual' }));
    expect(s.positions.src).toBeUndefined();
    expect(s.positions.fin).toBeUndefined();
  });

  it('sequence-mode zone is skipped (DEC-T4.5-10)', () => {
    const s = tick(seed({ viewMode: 'sequence' }));
    expect(s.positions.src).toBeUndefined();
  });

  it('SET_ZONE_LANE_LAYOUT manual then a dispatch leaves positions frozen', () => {
    let s = tick(seed()); // arranged
    const before = { ...s.positions.src };
    s = skeletonReducer(s, { type: 'SET_ZONE_LANE_LAYOUT', zoneId: 'zT', layout: 'manual' });
    // hand-move src; a later unrelated dispatch must NOT re-lay it
    s = { ...s, positions: { ...s.positions, src: { x: 7, y: 7 } } };
    s = tick(s);
    expect(s.positions.src).toEqual({ x: 7, y: 7 });
    expect(before).toBeTruthy();
  });
});
