/**
 * zone-frame-stability.test.js — Игорь 17.05.2026: «когда двигаю
 * область сборки за верх, она иногда удлиняется безконтрольно».
 *
 * Root cause: T4.5 lays the finals lane at a FIXED offset from
 * bounds.y; the pre-existing T4 grow-only bounds finalizer (runs
 * BEFORE T4.5) chased that content, and dragging the top changed
 * bounds.y → the two desynced by a tick each drag → unbounded height.
 *
 * Fix: an auto+graph zone's SIZE is deterministic from the lane
 * layout (applyZoneLayout sets width/height, x/y stay user-controlled)
 * and the grow-only T4 finalizer skips auto zones → a fixed point:
 * dragging just translates the frame, it never elongates.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { applyZoneLayouts, applyZoneLayout } from '../lib/zone-layout';

function seed(boundsOver = {}) {
  const base = buildInitialState();
  return {
    ...base,
    zones: [{
      id: 'zS', name: 'Сборка', viewMode: 'graph', laneLayout: 'auto',
      collapsed: false, autoResize: true,
      bounds: {
        x: 100, y: 100, width: 600, height: 400, ...boundsOver,
      },
    }],
    containers: [
      {
        id: 'src', kind: 'molecule', name: 'src', sequence: 'ACGT', annotations: [],
        topology: { circular: false }, zoneId: 'zS', pinned: false,
      },
      {
        id: 'prod', kind: 'molecule', name: 'asm-product', sequence: 'ACGT', annotations: [],
        topology: { circular: false }, zoneId: 'zS', pinned: false,
        origin: { kind: 'realised-product' },
      },
    ],
    operations: [{
      id: 'op1', kind: 'pcr', status: 'committed', inputs: ['src'], outputs: ['prod'],
      inputPieces: [], zoneId: 'zS', position: { x: 0, y: 0 }, pinned: false,
      materializedClones: null,
    }],
    pieces: [], junctions: [], positions: {},
  };
}
const zoneOf = (s) => s.zones.find((z) => z.id === 'zS');

describe('T4.5 fix — auto-zone frame is a stable fixed point', () => {
  it('applyZoneLayouts is idempotent on bounds (size settles in one pass)', () => {
    const a = applyZoneLayouts(seed());
    const b = applyZoneLayouts(a);
    expect(b).toBe(a); // same ref → no growth loop
    expect(zoneOf(b).bounds).toEqual(zoneOf(a).bounds);
  });

  it('repeated DRAG_ZONE by the top does NOT grow the height', () => {
    let s = skeletonReducer(seed(), { type: 'SET_FOCUSED_ZONE', zoneId: 'zS' });
    const h0 = zoneOf(s).bounds.height;
    const y0 = zoneOf(s).bounds.y;
    // 30 continuous "drag up by the top" ticks.
    for (let i = 0; i < 30; i += 1) {
      s = skeletonReducer(s, { type: 'DRAG_ZONE', zoneId: 'zS', delta: { dx: 0, dy: -8 } });
    }
    const z = zoneOf(s);
    expect(z.bounds.height).toBe(h0); // unchanged — no elongation
    expect(z.bounds.y).toBe(y0 - 8 * 30); // moved up by the total delta only
  });

  it('size is deterministic — independent of where the zone sits', () => {
    const near = applyZoneLayouts(seed({ x: 50, y: 50 }));
    const far = applyZoneLayouts(seed({ x: 4000, y: 9000 }));
    expect(zoneOf(near).bounds.width).toBe(zoneOf(far).bounds.width);
    expect(zoneOf(near).bounds.height).toBe(zoneOf(far).bounds.height);
  });

  it('drag preserves the user-set origin (x/y), finalizer never shifts it', () => {
    let s = applyZoneLayouts(seed());
    s = skeletonReducer(s, { type: 'DRAG_ZONE', zoneId: 'zS', delta: { dx: 37, dy: -19 } });
    const z = zoneOf(s);
    expect(z.bounds.x).toBe(100 + 37);
    expect(z.bounds.y).toBe(100 - 19);
  });

  it('a tiny zone is grown to the lane-content minimum (one-time, then stable)', () => {
    const s1 = applyZoneLayouts(seed({ width: 120, height: 120 }));
    const z1 = zoneOf(s1);
    expect(z1.bounds.height).toBeGreaterThan(120); // sized to fit 3 lanes
    const s2 = applyZoneLayouts(s1);
    expect(zoneOf(s2).bounds.height).toBe(z1.bounds.height); // settled
  });
});
