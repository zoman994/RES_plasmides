/**
 * skeleton-zone-finalizer.test.js — T4 K10. Grow-only zone-bounds
 * finalizer in the main reducer.
 *
 * GROW-ONLY union (not shrink-to-fit) — DEC-T3-06; idempotent → no
 * finalizer loop (R-T4-2). T4.5 fix (Игорь 17.05.2026): grow-only now
 * governs ONLY `laneLayout:'manual'` / sequence-mode zones — auto+graph
 * zones are sized deterministically by applyZoneLayout (see
 * zone-frame-stability.test.js). So these tests pin the zone to
 * `laneLayout:'manual'` to exercise the grow-only path.
 */
import { describe, it, expect } from 'vitest';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';

function withAutoZone(opts = {}) {
  let s = buildInitialState({ forceEmptyZones: true });
  s = skeletonReducer(s, {
    type: 'CREATE_ZONE',
    // realistically sized: comfortably contains a node + 40px padding,
    // so DRAG_ZONE (translate) yields union === translated bounds.
    zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
  });
  const zid = s.zones[0].id;
  // grow-only governs manual/sequence zones now → pin to manual.
  s = { ...s, zones: s.zones.map((z) => ({ ...z, laneLayout: 'manual' })) };
  // a positioned container, member of the zone
  s = { ...s, containers: [...s.containers, { id: 'c-z', name: 'M', sequence: 'A', zoneId: zid }], positions: { ...s.positions, 'c-z': { x: 50, y: 50 } } };
  if (opts.autoResize === false) {
    s = { ...s, zones: s.zones.map((z) => ({ ...z, autoResize: false })) };
  }
  return { s, zid };
}

describe('T4 K10 auto-recompute finalizer (grow-only)', () => {
  it('grows an autoResize zone to include a member moved outside its bounds', () => {
    let { s, zid } = withAutoZone();
    const b0 = { ...s.zones[0].bounds };
    s = skeletonReducer(s, { type: 'SET_POSITION', containerId: 'c-z', position: { x: 900, y: 700 } });
    const b1 = s.zones.find((z) => z.id === zid).bounds;
    expect(b1.x + b1.width).toBeGreaterThanOrEqual(900);
    expect(b1.y + b1.height).toBeGreaterThanOrEqual(700);
    // grew, not shrank: origin not pushed inward past the original
    expect(b1.x).toBeLessThanOrEqual(b0.x);
    expect(b1.y).toBeLessThanOrEqual(b0.y);
  });

  it('autoResize=false → bounds untouched', () => {
    let { s } = withAutoZone({ autoResize: false });
    const b0 = { ...s.zones[0].bounds };
    s = skeletonReducer(s, { type: 'SET_POSITION', containerId: 'c-z', position: { x: 900, y: 700 } });
    expect(s.zones[0].bounds).toEqual(b0);
  });

  it('idempotent — a subsequent no-op dispatch keeps zones identity (no finalizer loop)', () => {
    let { s } = withAutoZone();
    s = skeletonReducer(s, { type: 'SET_POSITION', containerId: 'c-z', position: { x: 900, y: 700 } });
    const zonesRef = s.zones;
    const s2 = skeletonReducer(s, { type: 'SET_VIEW', view: 'graph' });
    expect(s2.zones).toBe(zonesRef);
  });

  it('grow-only (DEC-T3-06): removing a member does NOT shrink bounds', () => {
    let { s, zid } = withAutoZone();
    s = skeletonReducer(s, { type: 'SET_POSITION', containerId: 'c-z', position: { x: 900, y: 700 } });
    const grown = { ...s.zones.find((z) => z.id === zid).bounds };
    s = skeletonReducer(s, { type: 'REMOVE_CONTAINER', containerId: 'c-z' });
    expect(s.zones.find((z) => z.id === zid).bounds).toEqual(grown);
  });

  it('does not fight DRAG_ZONE — bounds translate, not snap to a tight node box', () => {
    let { s, zid } = withAutoZone();
    const b0 = { ...s.zones[0].bounds }; // 0,0,300,200 (wider than the single node)
    s = skeletonReducer(s, { type: 'DRAG_ZONE', zoneId: zid, delta: { dx: 100, dy: 60 } });
    const b1 = s.zones.find((z) => z.id === zid).bounds;
    expect(b1.x).toBe(b0.x + 100);
    expect(b1.y).toBe(b0.y + 60);
    expect(b1.width).toBe(b0.width);   // size preserved, NOT shrunk to node bbox
    expect(b1.height).toBe(b0.height);
  });
});
