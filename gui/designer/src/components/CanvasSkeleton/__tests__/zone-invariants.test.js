/**
 * zone-invariants.test.js — T3 K3. Caps + validateZoneCreate/Update.
 * STRINGS-free (parallels piece-invariants): { ok, error?, code? }.
 */
import { describe, it, expect } from 'vitest';
import {
  ZONE_CAPS, validateZoneCreate, validateZoneUpdate,
} from '../lib/zone-invariants';

const goodBounds = { x: 0, y: 0, width: 600, height: 400 };
const st = (zones = []) => ({ zones });

describe('T3 K3 ZONE_CAPS', () => {
  it('exposes spec caps, frozen', () => {
    expect(ZONE_CAPS.MAX_ZONES).toBe(50);
    expect(ZONE_CAPS.MIN_WIDTH).toBe(200);
    expect(ZONE_CAPS.MIN_HEIGHT).toBe(120);
    expect(ZONE_CAPS.MAX_NAME_LENGTH).toBe(200);
    expect(ZONE_CAPS.MAX_NOTES_LENGTH).toBe(2000);
    expect(Object.isFrozen(ZONE_CAPS)).toBe(true);
  });
});

describe('T3 K3 validateZoneCreate', () => {
  it('accepts a well-formed zone', () => {
    expect(validateZoneCreate(st(), { name: 'Z', bounds: goodBounds })).toEqual({ ok: true });
  });
  it('rejects over MAX_ZONES → TOO_MANY', () => {
    const zones = Array.from({ length: ZONE_CAPS.MAX_ZONES }, (_, i) => ({ id: `zn-${i}` }));
    expect(validateZoneCreate(st(zones), { name: 'Z', bounds: goodBounds }).code).toBe('TOO_MANY');
  });
  it('rejects over-long name → NAME_TOO_LONG', () => {
    expect(validateZoneCreate(st(), { name: 'x'.repeat(201), bounds: goodBounds }).code).toBe('NAME_TOO_LONG');
  });
  it('rejects sub-minimum bounds → TOO_SMALL', () => {
    expect(validateZoneCreate(st(), { name: 'Z', bounds: { x: 0, y: 0, width: 199, height: 400 } }).code).toBe('TOO_SMALL');
    expect(validateZoneCreate(st(), { name: 'Z', bounds: { x: 0, y: 0, width: 600, height: 119 } }).code).toBe('TOO_SMALL');
    expect(validateZoneCreate(st(), { name: 'Z' }).code).toBe('TOO_SMALL');
  });
});

describe('T3 K3 validateZoneUpdate', () => {
  const zone = { id: 'zn-1', name: 'Z', bounds: goodBounds, notes: null };
  it('accepts a benign change', () => {
    expect(validateZoneUpdate(st(), zone, { name: 'Renamed' }).ok).toBe(true);
  });
  it('rejects shrinking below the minimum', () => {
    expect(validateZoneUpdate(st(), zone, { bounds: { x: 0, y: 0, width: 50, height: 50 } }).ok).toBe(false);
  });
  it('rejects over-long notes', () => {
    expect(validateZoneUpdate(st(), zone, { notes: 'x'.repeat(ZONE_CAPS.MAX_NOTES_LENGTH + 1) }).ok).toBe(false);
  });
});
