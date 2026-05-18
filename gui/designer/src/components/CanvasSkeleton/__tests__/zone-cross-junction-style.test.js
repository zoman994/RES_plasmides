/**
 * zone-cross-junction-style.test.js — T4 K2. Style constants +
 * isJunctionCrossZone predicate (delegates to selectJunctionZoneId).
 */
import { describe, it, expect } from 'vitest';
import {
  CROSS_ZONE_DASH, CROSS_ZONE_COLOR, CROSS_ZONE_ICON_SIZE,
  CROSS_ZONE_ICON_PATH, isJunctionCrossZone,
} from '../canvas/zone-cross-junction-style';

const state = {
  zones: [{ id: 'z1' }, { id: 'z2' }],
  containers: [
    { id: 'c1', zoneId: 'z1' },
    { id: 'c2', zoneId: 'z1' },
    { id: 'c3', zoneId: 'z2' },
  ],
  pieces: [], operations: [],
  junctions: [
    { id: 'j-in', fromContainerId: 'c1', toContainerId: 'c2' },
    { id: 'j-cross', fromContainerId: 'c1', toContainerId: 'c3' },
  ],
};

describe('T4 K2 zone-cross-junction-style', () => {
  it('exposes style constants', () => {
    expect(CROSS_ZONE_DASH).toBe('6,3');
    expect(CROSS_ZONE_COLOR).toMatch(/var\(--zone-cross-warning\)/);
    expect(CROSS_ZONE_ICON_SIZE).toBe(14);
    expect(typeof CROSS_ZONE_ICON_PATH).toBe('string');
    expect(CROSS_ZONE_ICON_PATH.length).toBeGreaterThan(0);
  });
  it('isJunctionCrossZone — true only for cross-zone junctions', () => {
    expect(isJunctionCrossZone({ id: 'j-cross' }, state)).toBe(true);
    expect(isJunctionCrossZone({ id: 'j-in' }, state)).toBe(false);
    expect(isJunctionCrossZone({ id: 'nope' }, state)).toBe(false);
  });
});
