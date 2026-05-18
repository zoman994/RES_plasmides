/**
 * skeleton-state-zones.test.js — T3 K4. state.zones sub-reducer:
 * buildInitialZonesState, isZoneAction, the 11 zone actions, and the
 * cross-slice cascades (REMOVE_ZONE / MOVE_NODE_TO_ZONE / WRAP / MERGE).
 * Unit-level (zonesReducer direct); router wiring is U4.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInitialZonesState, zonesReducer, isZoneAction,
} from '../store/skeleton-state-zones';
import { skeletonReducer, buildInitialState } from '../store/skeleton-state';
import { ZONE_CAPS } from '../lib/zone-invariants';

const BOUNDS = { x: 0, y: 0, width: 600, height: 400 };
const base = (over = {}) => ({
  ...buildInitialZonesState(),
  containers: [{ id: 'c1', name: 'A', zoneId: null }],
  pieces: [{ id: 'p1', name: 'P', zoneId: null }],
  operations: [{ id: 'o1', kind: 'pcr', zoneId: null, position: { x: 10, y: 10 } }],
  positions: { c1: { x: 50, y: 60 } },
  ...over,
});
const mk = (s, a) => zonesReducer(s, a);
const addZone = (s, name = 'Z') => mk(s, { type: 'CREATE_ZONE', zone: { name, bounds: BOUNDS } });

describe('T3 K4 buildInitialZonesState / isZoneAction', () => {
  it('initial slice is { zones: [], focusedZoneId: null } (T7 DEC-T7-10 added focus; default zone seeded in buildInitialState, U4)', () => {
    expect(buildInitialZonesState()).toEqual({ zones: [], focusedZoneId: null });
  });
  it('isZoneAction guards zone actions', () => {
    ['CREATE_ZONE', 'REMOVE_ZONE', 'UPDATE_ZONE_NAME', 'UPDATE_ZONE_BOUNDS',
      'UPDATE_ZONE_NOTES', 'SET_ZONE_COLLAPSED', 'SET_ZONE_VIEW_MODE',
      'MOVE_NODE_TO_ZONE', 'WRAP_LOOSE_NODES_IN_ZONE', 'MERGE_ZONES', 'SPLIT_ZONE']
      .forEach((t) => expect(isZoneAction(t)).toBe(true));
    expect(isZoneAction('SET_VIEW')).toBe(false);
  });
  it('non-zone action → state identity', () => {
    const s = base();
    expect(zonesReducer(s, { type: 'SET_VIEW' })).toBe(s);
  });
});

describe('T3 K4 CREATE_ZONE / UPDATE_* ', () => {
  it('CREATE_ZONE appends a zn- zone', () => {
    const s = addZone(base());
    expect(s.zones).toHaveLength(1);
    expect(s.zones[0].id).toMatch(/^zn-/);
  });
  it('CREATE_ZONE too-small bounds → unchanged + error toast', () => {
    const s0 = base();
    const s = mk(s0, { type: 'CREATE_ZONE', zone: { name: 'X', bounds: { x: 0, y: 0, width: 10, height: 10 } } });
    expect(s.zones).toEqual([]);
    expect(s.toast).toMatchObject({ kind: 'error' });
  });
  it('CREATE_ZONE over cap → error toast', () => {
    const zones = Array.from({ length: ZONE_CAPS.MAX_ZONES }, (_, i) => ({ id: `zn-${i}` }));
    const s = mk(base({ zones }), { type: 'CREATE_ZONE', zone: { name: 'X', bounds: BOUNDS } });
    expect(s.zones).toHaveLength(ZONE_CAPS.MAX_ZONES);
    expect(s.toast.kind).toBe('error');
  });
  it('UPDATE_ZONE_NAME / BOUNDS / NOTES / COLLAPSED / VIEW_MODE merge + bump updatedAt', () => {
    let s = addZone(base());
    const id = s.zones[0].id;
    const c0 = s.zones[0].createdAt;
    s = mk(s, { type: 'UPDATE_ZONE_NAME', zoneId: id, name: 'Renamed' });
    s = mk(s, { type: 'UPDATE_ZONE_BOUNDS', zoneId: id, bounds: { x: 5, y: 5, width: 700, height: 500 } });
    s = mk(s, { type: 'UPDATE_ZONE_NOTES', zoneId: id, notes: 'pks4 ko' });
    s = mk(s, { type: 'SET_ZONE_COLLAPSED', zoneId: id, collapsed: true });
    s = mk(s, { type: 'SET_ZONE_VIEW_MODE', zoneId: id, viewMode: 'sequence' });
    expect(s.zones[0]).toMatchObject({
      name: 'Renamed', notes: 'pks4 ko', collapsed: true, viewMode: 'sequence',
      bounds: { width: 700, height: 500 },
    });
    expect(s.zones[0].updatedAt).toBeGreaterThanOrEqual(c0);
  });
  it('UPDATE_ZONE_BOUNDS below minimum → unchanged + error', () => {
    let s = addZone(base());
    const id = s.zones[0].id;
    const before = s.zones;
    s = mk(s, { type: 'UPDATE_ZONE_BOUNDS', zoneId: id, bounds: { x: 0, y: 0, width: 10, height: 10 } });
    expect(s.zones).toBe(before);
    expect(s.toast.kind).toBe('error');
  });
});

describe('T3 K4 cross-slice cascades', () => {
  it('MOVE_NODE_TO_ZONE sets zoneId per node type, null = loose', () => {
    let s = addZone(base());
    const z = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: z });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'piece', nodeId: 'p1', targetZoneId: z });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'operation', nodeId: 'o1', targetZoneId: z });
    expect(s.containers[0].zoneId).toBe(z);
    expect(s.pieces[0].zoneId).toBe(z);
    expect(s.operations[0].zoneId).toBe(z);
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: null });
    expect(s.containers[0].zoneId).toBeNull();
  });
  it('MOVE_NODE_TO_ZONE unknown node → state identity', () => {
    const s0 = addZone(base());
    expect(mk(s0, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'ghost', targetZoneId: s0.zones[0].id })).toBe(s0);
  });
  it('REMOVE_ZONE keeps nodes but clears their zoneId', () => {
    let s = addZone(base());
    const z = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: z });
    s = mk(s, { type: 'REMOVE_ZONE', zoneId: z });
    expect(s.zones).toEqual([]);
    expect(s.containers[0]).toMatchObject({ id: 'c1', zoneId: null });
  });
  it('WRAP_LOOSE_NODES_IN_ZONE creates a zone and adopts all loose nodes', () => {
    let s = base();
    s = mk(s, { type: 'WRAP_LOOSE_NODES_IN_ZONE', zoneName: 'Wrapped' });
    expect(s.zones).toHaveLength(1);
    const z = s.zones[0].id;
    expect(s.containers[0].zoneId).toBe(z);
    expect(s.pieces[0].zoneId).toBe(z);
    expect(s.operations[0].zoneId).toBe(z);
  });
  it('WRAP_LOOSE_NODES_IN_ZONE with no loose nodes → no-op + info toast', () => {
    let s = addZone(base());
    const z = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: z });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'piece', nodeId: 'p1', targetZoneId: z });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'operation', nodeId: 'o1', targetZoneId: z });
    const zonesBefore = s.zones;
    s = mk(s, { type: 'WRAP_LOOSE_NODES_IN_ZONE', zoneName: 'X' });
    expect(s.zones).toBe(zonesBefore);
    expect(s.toast).toMatchObject({ kind: 'info' });
  });
  it('MERGE_ZONES → new zone, nodes reassigned, old zones removed', () => {
    let s = addZone(base(), 'A');
    s = addZone(s, 'B');
    const [za, zb] = [s.zones[0].id, s.zones[1].id];
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: za });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'piece', nodeId: 'p1', targetZoneId: zb });
    s = mk(s, { type: 'MERGE_ZONES', zoneIds: [za, zb], mergedName: 'AB' });
    expect(s.zones).toHaveLength(1);
    const zm = s.zones[0].id;
    expect(s.zones[0].name).toBe('AB');
    expect(s.containers[0].zoneId).toBe(zm);
    expect(s.pieces[0].zoneId).toBe(zm);
  });
  it('SPLIT_ZONE → unchanged + warning toast (post-MVP stub)', () => {
    let s = addZone(base());
    const zonesBefore = s.zones;
    s = mk(s, { type: 'SPLIT_ZONE', zoneId: s.zones[0].id, splitLine: 'vertical', position: 100 });
    expect(s.zones).toBe(zonesBefore);
    expect(s.toast).toMatchObject({ kind: 'warning' });
  });
});

// T4 K6/K7 — DRAG_ZONE + RECOMPUTE_ZONE_BOUNDS.
describe('T4 K6 DRAG_ZONE', () => {
  function zoneWithMembers() {
    let s = addZone(base());
    const zid = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: zid });
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'operation', nodeId: 'o1', targetZoneId: zid });
    return { s, zid };
  }
  it('atomically shifts zone bounds + member container positions + op.position', () => {
    let { s, zid } = zoneWithMembers();
    const b0 = { ...s.zones[0].bounds };
    s = mk(s, { type: 'DRAG_ZONE', zoneId: zid, delta: { dx: 25, dy: -10 } });
    expect(s.zones[0].bounds.x).toBe(b0.x + 25);
    expect(s.zones[0].bounds.y).toBe(b0.y - 10);
    expect(s.positions.c1).toEqual({ x: 75, y: 50 }); // 50+25, 60-10
    expect(s.operations[0].position).toEqual({ x: 35, y: 0 }); // 10+25, 10-10
  });
  it('unknown zone → state identity', () => {
    const s0 = addZone(base());
    expect(mk(s0, { type: 'DRAG_ZONE', zoneId: 'zn-x', delta: { dx: 1, dy: 1 } })).toBe(s0);
  });
});

describe('T4 K7 RECOMPUTE_ZONE_BOUNDS', () => {
  it('recomputes bounds for an autoResize zone with positioned members', () => {
    let s = addZone(base());
    const zid = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: zid });
    s = mk(s, { type: 'RECOMPUTE_ZONE_BOUNDS', zoneId: zid });
    // computeZoneBoundingBox padding 40 around c1 pos {50,60}
    expect(s.zones[0].bounds).toMatchObject({ x: 10, y: 20 });
  });
  it('autoResize=false → no-op (identity)', () => {
    let s = addZone(base());
    const zid = s.zones[0].id;
    s = mk(s, { type: 'MOVE_NODE_TO_ZONE', nodeType: 'container', nodeId: 'c1', targetZoneId: zid });
    s = mk(s, { type: 'SET_ZONE_VIEW_MODE', zoneId: zid, viewMode: 'graph' }); // touch to ensure exists
    // disable autoResize via direct state (no action for it in T3/T4 scope)
    s = { ...s, zones: s.zones.map((z) => ({ ...z, autoResize: false })) };
    const before = s.zones;
    s = mk(s, { type: 'RECOMPUTE_ZONE_BOUNDS', zoneId: zid });
    expect(s.zones).toBe(before);
  });
  it('no positioned members → identity (empty box)', () => {
    let s = addZone(base());
    const before = s.zones;
    s = mk(s, { type: 'RECOMPUTE_ZONE_BOUNDS', zoneId: s.zones[0].id });
    expect(s.zones).toBe(before);
  });
});

// T3 U4 — router integration + default zone (DEC-T3-08/15).
describe('T3 U4 router integration', () => {
  it('buildInitialState starts with NO zones (DEC-T3-08 reversed 17.05.2026)', () => {
    const s = buildInitialState();
    expect(s.zones).toEqual([]);
  });
  it('forceEmptyZones opt is now a no-op — still no default zone', () => {
    expect(buildInitialState({ forceEmptyZones: true }).zones).toEqual([]);
  });
  it('CREATE_ZONE routes through skeletonReducer (0 default + 1 created)', () => {
    let s = buildInitialState();
    s = skeletonReducer(s, { type: 'CREATE_ZONE', zone: { name: 'Extra', bounds: BOUNDS } });
    expect(s.zones).toHaveLength(1);
  });
  it('non-zone action keeps zones slice identity (chain ===-stable)', () => {
    const s0 = buildInitialState();
    const s1 = skeletonReducer(s0, { type: 'SET_VIEW', view: 'graph' });
    expect(s1.zones).toBe(s0.zones);
  });
  it('DEC-T3-15 — REPLACE_STATE keeps a pre-T3 migrated snapshot zones:[] (no default)', () => {
    const snap = {
      containers: [{ id: 'c1', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] }],
      operations: [], positions: {}, junctions: [], cascadeIndex: 0, zones: [],
    };
    const next = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(next.zones).toEqual([]);
  });
  it('REPLACE_STATE preserves saved zones', () => {
    const snap = {
      containers: [{ id: 'c1', name: 'X', sequence: 'A', topology: { circular: false }, annotations: [] }],
      operations: [], positions: {}, junctions: [], cascadeIndex: 0,
      zones: [{ id: 'zn-keep', name: 'Saved', bounds: BOUNDS }],
    };
    const next = skeletonReducer(buildInitialState(), { type: 'REPLACE_STATE', state: snap });
    expect(next.zones).toEqual(snap.zones);
  });
});
