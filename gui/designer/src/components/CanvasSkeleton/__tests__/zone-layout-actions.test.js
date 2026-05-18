/**
 * zone-layout-actions.test.js — T4.5 K5 (DEC-T4.5-05) + applier
 * idempotency (DEC-T4.5-06 / R2, underpins the K7 finalizer).
 */
import { describe, it, expect } from 'vitest';
import { createZone } from '../lib/zone-model';
import { zonesReducer } from '../store/skeleton-state-zones';
import { applyZoneLayout, applyZoneLayouts } from '../lib/zone-layout';

const cnt = (id, over = {}) => ({
  id, kind: 'molecule', name: id, sequence: 'ACGT', zoneId: 'z1', pinned: false, ...over,
});

function st(zoneOver = {}) {
  return {
    zones: [{
      id: 'z1', name: 'Z', viewMode: 'graph', laneLayout: 'auto',
      bounds: { x: 0, y: 0, width: 1200, height: 600 }, autoResize: true,
    }],
    containers: [cnt('alpha'), cnt('beta')],
    pieces: [], operations: [], junctions: [], positions: {},
    ...zoneOver,
  };
}

describe('T4.5 K5 — createZone laneLayout default', () => {
  it("createZone → laneLayout: 'auto'", () => {
    expect(createZone({ name: 'X', bounds: { x: 0, y: 0, width: 10, height: 10 } }).laneLayout)
      .toBe('auto');
  });
});

describe('T4.5 K5 — SET_ZONE_LANE_LAYOUT', () => {
  it('auto → manual and back', () => {
    let s = st();
    s = zonesReducer(s, { type: 'SET_ZONE_LANE_LAYOUT', zoneId: 'z1', layout: 'manual' });
    expect(s.zones[0].laneLayout).toBe('manual');
    s = zonesReducer(s, { type: 'SET_ZONE_LANE_LAYOUT', zoneId: 'z1', layout: 'auto' });
    expect(s.zones[0].laneLayout).toBe('auto');
  });
  it('no-op when unchanged (same ref)', () => {
    const s = st();
    expect(zonesReducer(s, { type: 'SET_ZONE_LANE_LAYOUT', zoneId: 'z1', layout: 'auto' }))
      .toBe(s);
  });
  it('unknown zone → state unchanged', () => {
    const s = st();
    expect(zonesReducer(s, { type: 'SET_ZONE_LANE_LAYOUT', zoneId: 'zZ', layout: 'manual' }))
      .toBe(s);
  });
});

describe('T4.5 K5 — RECOMPUTE_ZONE_LAYOUT (force)', () => {
  it('lays out nodes even on a MANUAL zone (one-shot tidy)', () => {
    const s = st();
    s.zones[0].laneLayout = 'manual';
    const out = zonesReducer(s, { type: 'RECOMPUTE_ZONE_LAYOUT', zoneId: 'z1' });
    expect(out).not.toBe(s);
    expect(out.positions.alpha).toBeTruthy();
    expect(out.positions.beta).toBeTruthy();
  });
});

describe('T4.5 K5/K7 — applier idempotency (no finalizer loop)', () => {
  it('applyZoneLayout: first call moves, second is a same-ref no-op', () => {
    const s = st();
    const a = applyZoneLayout(s, 'z1');
    expect(a).not.toBe(s); // positioned
    const b = applyZoneLayout(a, 'z1');
    expect(b).toBe(a); // already arranged → same ref (R2)
  });

  it('applyZoneLayouts: stable across repeated calls', () => {
    const s = st();
    const once = applyZoneLayouts(s);
    const twice = applyZoneLayouts(once);
    expect(twice).toBe(once);
  });

  it('applyZoneLayouts: manual zone is left untouched', () => {
    const s = st();
    s.zones[0].laneLayout = 'manual';
    expect(applyZoneLayouts(s)).toBe(s);
  });

  it('writes operation positions onto op.position (not positions map)', () => {
    const s = {
      zones: [{
        id: 'z1', name: 'Z', viewMode: 'graph', laneLayout: 'auto',
        bounds: { x: 0, y: 0, width: 1200, height: 600 },
      }],
      containers: [cnt('a'), cnt('fin', { frozen: true })],
      operations: [{
        id: 'o1', kind: 'pcr', status: 'committed', inputs: ['a'], outputs: ['fin'],
        inputPieces: [], zoneId: 'z1', position: { x: 0, y: 0 }, pinned: false,
      }],
      pieces: [], junctions: [], positions: {},
    };
    const out = applyZoneLayout(s, 'z1');
    expect(out.operations[0].position.x).toBeGreaterThanOrEqual(0);
    expect(out.positions.o1).toBeUndefined(); // ops use op.position
  });
});
