/**
 * zone-interaction.test.js — T4 K1. Pure canvas hit-detection
 * (findZoneAtPoint outer-most, hitTestResizeHandle 8 handles,
 * computeResizeNewBounds re-export).
 */
import { describe, it, expect } from 'vitest';
import {
  findZoneAtPoint, hitTestResizeHandle, computeResizeNewBounds,
} from '../canvas/zone-interaction';
import { resizeZoneBounds } from '../lib/zone-bounds';

const z = (id, b) => ({ id, bounds: b });

describe('T4 K1 findZoneAtPoint', () => {
  it('empty list / no match → null', () => {
    expect(findZoneAtPoint([], { x: 5, y: 5 })).toBeNull();
    expect(findZoneAtPoint([z('a', { x: 0, y: 0, width: 10, height: 10 })], { x: 50, y: 50 })).toBeNull();
  });
  it('single containing zone → that zone', () => {
    const a = z('a', { x: 0, y: 0, width: 100, height: 100 });
    expect(findZoneAtPoint([a], { x: 50, y: 50 })).toBe(a);
  });
  it('overlapping zones → outer-most (largest area) wins (DEC-T4-13)', () => {
    const big = z('big', { x: 0, y: 0, width: 400, height: 400 });
    const small = z('small', { x: 10, y: 10, width: 200, height: 120 });
    expect(findZoneAtPoint([small, big], { x: 50, y: 50 }).id).toBe('big');
  });
});

describe('T4 K1 hitTestResizeHandle', () => {
  const zone = z('a', { x: 100, y: 100, width: 400, height: 300 });
  it('detects the 4 corners', () => {
    expect(hitTestResizeHandle(zone, { x: 100, y: 100 })).toBe('nw');
    expect(hitTestResizeHandle(zone, { x: 500, y: 100 })).toBe('ne');
    expect(hitTestResizeHandle(zone, { x: 100, y: 400 })).toBe('sw');
    expect(hitTestResizeHandle(zone, { x: 500, y: 400 })).toBe('se');
  });
  it('detects the 4 edges (mid-span)', () => {
    expect(hitTestResizeHandle(zone, { x: 300, y: 100 })).toBe('n');
    expect(hitTestResizeHandle(zone, { x: 300, y: 400 })).toBe('s');
    expect(hitTestResizeHandle(zone, { x: 100, y: 250 })).toBe('w');
    expect(hitTestResizeHandle(zone, { x: 500, y: 250 })).toBe('e');
  });
  it('interior / far-outside → null', () => {
    expect(hitTestResizeHandle(zone, { x: 300, y: 250 })).toBeNull();
    expect(hitTestResizeHandle(zone, { x: 9999, y: 9999 })).toBeNull();
  });
});

describe('T4 K1 computeResizeNewBounds', () => {
  it('re-exports lib/zone-bounds.resizeZoneBounds (same result)', () => {
    const zone = { bounds: { x: 0, y: 0, width: 400, height: 300 } };
    expect(computeResizeNewBounds(zone, 'se', { dx: 20, dy: 10 }))
      .toEqual(resizeZoneBounds(zone, 'se', { dx: 20, dy: 10 }));
  });
});
