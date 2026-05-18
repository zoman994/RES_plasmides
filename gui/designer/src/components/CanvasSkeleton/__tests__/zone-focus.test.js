/**
 * zone-focus.test.js — T7 K6 (DEC-T7-10, R-T7-7).
 *
 * focusedZoneId lives on the zones slice (no dedicated ui slice in this
 * subsystem). G/S hotkeys target it; REMOVE_ZONE clears it if stale.
 */
import { describe, it, expect } from 'vitest';
import { buildInitialZonesState, zonesReducer } from '../store/skeleton-state-zones';

function withZone(id = 'zn-1') {
  let s = { ...buildInitialZonesState(), containers: [], pieces: [], operations: [] };
  s = zonesReducer(s, {
    type: 'CREATE_ZONE', zone: { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 400 } },
  });
  return s;
}

describe('T7 K6 — focusedZoneId on the zones slice', () => {
  it('buildInitialZonesState defaults focusedZoneId to null', () => {
    expect(buildInitialZonesState().focusedZoneId).toBeNull();
  });

  it('SET_FOCUSED_ZONE sets the id', () => {
    const s = withZone();
    const zid = s.zones[0].id;
    const n = zonesReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: zid });
    expect(n.focusedZoneId).toBe(zid);
  });

  it('SET_FOCUSED_ZONE null clears focus', () => {
    let s = withZone();
    s = zonesReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: s.zones[0].id });
    const n = zonesReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: null });
    expect(n.focusedZoneId).toBeNull();
  });

  it('REMOVE_ZONE clears focusedZoneId when it points at the removed zone (R-T7-7)', () => {
    let s = withZone();
    const zid = s.zones[0].id;
    s = zonesReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: zid });
    const n = zonesReducer(s, { type: 'REMOVE_ZONE', zoneId: zid });
    expect(n.focusedZoneId).toBeNull();
    expect(n.zones).toHaveLength(0);
  });

  it('REMOVE_ZONE keeps focus when a different zone is removed', () => {
    let s = withZone();
    s = zonesReducer(s, {
      type: 'CREATE_ZONE', zone: { name: 'Z2', bounds: { x: 0, y: 0, width: 600, height: 400 } },
    });
    const keep = s.zones[0].id;
    const drop = s.zones[1].id;
    s = zonesReducer(s, { type: 'SET_FOCUSED_ZONE', zoneId: keep });
    const n = zonesReducer(s, { type: 'REMOVE_ZONE', zoneId: drop });
    expect(n.focusedZoneId).toBe(keep);
  });
});
