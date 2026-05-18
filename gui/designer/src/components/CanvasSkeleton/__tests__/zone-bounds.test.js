/**
 * zone-bounds.test.js — T3 K2. Pure geometry (resizeZoneBounds /
 * dragZoneBounds / mergeBoundingBoxes / computeBoundingBox).
 */
import { describe, it, expect } from 'vitest';
import {
  resizeZoneBounds, dragZoneBounds, mergeBoundingBoxes, computeBoundingBox,
} from '../lib/zone-bounds';

const zone = (b) => ({ bounds: { x: 100, y: 100, width: 400, height: 300, ...b } });

describe('T3 K2 resizeZoneBounds', () => {
  it('SE drag grows width/height', () => {
    expect(resizeZoneBounds(zone(), 'se', { dx: 50, dy: 30 }))
      .toEqual({ x: 100, y: 100, width: 450, height: 330 });
  });
  it('NW drag moves origin and shrinks size', () => {
    expect(resizeZoneBounds(zone(), 'nw', { dx: 20, dy: 10 }))
      .toEqual({ x: 120, y: 110, width: 380, height: 290 });
  });
  it('clamps to minimum 200×120 without overshooting the anchor', () => {
    const r = resizeZoneBounds(zone(), 'se', { dx: -1000, dy: -1000 });
    expect(r.width).toBe(200);
    expect(r.height).toBe(120);
  });
});

describe('T3 K2 dragZoneBounds', () => {
  it('translates all corners by delta', () => {
    expect(dragZoneBounds(zone(), { dx: 25, dy: -15 }))
      .toEqual({ x: 125, y: 85, width: 400, height: 300 });
  });
});

describe('T3 K2 mergeBoundingBoxes', () => {
  it('returns the union rect of several rects', () => {
    const r = mergeBoundingBoxes([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 50, width: 100, height: 100 },
    ]);
    expect(r).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });
  it('empty → null', () => {
    expect(mergeBoundingBoxes([])).toBeNull();
  });
});

describe('T3 K2 computeBoundingBox', () => {
  it('padded box around points, never below 200×120', () => {
    const r = computeBoundingBox([{ x: 100, y: 100 }, { x: 120, y: 130 }], 40);
    expect(r.x).toBe(60);
    expect(r.y).toBe(60);
    expect(r.width).toBe(200); // (120+40)-(100-40)=100 → clamped to 200
    expect(r.height).toBe(120);
  });
  it('empty → null', () => {
    expect(computeBoundingBox([])).toBeNull();
  });
});
