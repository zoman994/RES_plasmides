/**
 * canvas-content-extent.test.js — Игорь 17.05.2026: «зум чуть сильнее
 * центруется на курсор, элемент оказывается сбоку».
 *
 * Root cause: CSS `transform: scale()` does NOT grow the scroll
 * container's scrollWidth/Height, so at zoom>1 the focal-zoom scroll
 * target gets clamped and the cursor point drifts. canvasContentExtent
 * computes the world-space content box (containers + operations + zone
 * bounds + pad); the view multiplies it by zoom into a sizing spacer so
 * the scroll range is always big enough for zoomAtPoint to land exactly.
 */
import { describe, it, expect } from 'vitest';
import {
  canvasContentExtent, BLOCK_LINEAR_W, BLOCK_LINEAR_H, EXTENT_MIN,
} from '../canvas/canvas-layout';

describe('canvasContentExtent', () => {
  it('covers the furthest container (pos + block size) plus pad', () => {
    // Coords chosen above EXTENT_MIN so the content path (not the
    // floor) is what's asserted.
    const st = {
      positions: { c1: { x: 3000, y: 2500 } },
      operations: [],
      zones: [],
    };
    const e = canvasContentExtent(st, 200);
    expect(e.width).toBe(3000 + BLOCK_LINEAR_W + 200);
    expect(e.height).toBe(2500 + BLOCK_LINEAR_H + 200);
  });

  it('covers operation node positions', () => {
    const st = {
      positions: {},
      operations: [{ id: 'o1', position: { x: 2000, y: 1500 } }],
      zones: [],
    };
    const e = canvasContentExtent(st, 0);
    expect(e.width).toBeGreaterThanOrEqual(2000);
    expect(e.height).toBeGreaterThanOrEqual(1500);
  });

  it('covers zone bounds (x+width, y+height)', () => {
    const st = {
      positions: {},
      operations: [],
      zones: [{ id: 'z', bounds: { x: 300, y: 200, width: 1800, height: 1200 } }],
    };
    const e = canvasContentExtent(st, 0);
    expect(e.width).toBeGreaterThanOrEqual(300 + 1800);
    expect(e.height).toBeGreaterThanOrEqual(200 + 1200);
  });

  it('takes the max across all node kinds', () => {
    const st = {
      positions: { c1: { x: 500, y: 4000 } },
      operations: [{ id: 'o', position: { x: 5000, y: 100 } }],
      zones: [{ id: 'z', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
    };
    const e = canvasContentExtent(st, 0);
    expect(e.width).toBeGreaterThanOrEqual(5000);
    expect(e.height).toBeGreaterThanOrEqual(4000);
  });

  it('never returns less than the EXTENT_MIN floor (empty canvas)', () => {
    const e = canvasContentExtent({ positions: {}, operations: [], zones: [] }, 0);
    expect(e.width).toBe(EXTENT_MIN);
    expect(e.height).toBe(EXTENT_MIN);
  });

  it('is defensive against missing slices', () => {
    expect(() => canvasContentExtent({}, 0)).not.toThrow();
    expect(() => canvasContentExtent(undefined, 0)).not.toThrow();
    const e = canvasContentExtent(undefined, 0);
    expect(e.width).toBe(EXTENT_MIN);
  });
});
