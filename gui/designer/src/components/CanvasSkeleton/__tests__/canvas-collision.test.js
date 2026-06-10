/**
 * SPEC_CANVAS_NODE_COLLISION — pure helpers in canvas-layout.js.
 *
 * nodeRect / gatherObstacleRects / resolveNodeOverlap are React-free and
 * tested in isolation. The view-side wiring (drag-end / drop / add /
 * opAdd) is exercised by the integration tests; here we pin the geometry.
 */
import { describe, it, expect } from 'vitest';
import {
  nodeRect, gatherObstacleRects, resolveNodeOverlap,
  BLOCK_LINEAR_W, BLOCK_LINEAR_H, OPERATION_NODE_W, OPERATION_NODE_H,
} from '../canvas/canvas-layout';

function overlaps(a, b, gap = 0) {
  return !(
    a.x + a.w + gap <= b.x
    || b.x + b.w <= a.x - gap
    || a.y + a.h + gap <= b.y
    || b.y + b.h <= a.y - gap
  );
}

describe('nodeRect', () => {
  it('container → BLOCK_LINEAR size', () => {
    expect(nodeRect('container', { x: 10, y: 20 })).toEqual({
      x: 10, y: 20, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H,
    });
  });
  it('operation → OPERATION_NODE size', () => {
    expect(nodeRect('operation', { x: 5, y: 7 })).toEqual({
      x: 5, y: 7, w: OPERATION_NODE_W, h: OPERATION_NODE_H,
    });
  });
  it('assembly → 240×N draft size', () => {
    const r = nodeRect('assembly', { x: 0, y: 0 });
    expect(r.w).toBe(240);
    expect(r.h).toBeGreaterThan(0);
  });
});

describe('gatherObstacleRects', () => {
  const state = {
    containers: [
      { id: 'filled', sequence: 'ATGC' },
      { id: 'placeholder' }, // no sequence → placeholder
      { id: 'inzone', sequence: 'ATGC', zoneId: 'z1' },
      { id: 'self', sequence: 'ATGC' },
    ],
    positions: {
      filled: { x: 100, y: 100 },
      placeholder: { x: 200, y: 100 },
      inzone: { x: 300, y: 100 },
      self: { x: 400, y: 100 },
    },
    operations: [
      { id: 'op1', position: { x: 500, y: 100 } },
      { id: 'opzone', position: { x: 600, y: 100 }, zoneId: 'z1' },
    ],
    assemblyDrafts: [{ id: 'asm1', position: { x: 700, y: 100 } }],
  };
  it('excludes placeholders, in-zone nodes, and excludeId; keeps loose filled + ops + drafts', () => {
    const rects = gatherObstacleRects(state, 'self');
    // filled container + op1 + asm1 = 3
    expect(rects).toHaveLength(3);
    expect(rects.some((r) => r.x === 100)).toBe(true); // filled
    expect(rects.some((r) => r.x === 500)).toBe(true); // op1
    expect(rects.some((r) => r.x === 700)).toBe(true); // asm1
    expect(rects.some((r) => r.x === 200)).toBe(false); // placeholder excluded
    expect(rects.some((r) => r.x === 300)).toBe(false); // in-zone excluded
    expect(rects.some((r) => r.x === 400)).toBe(false); // excludeId excluded
  });
});

describe('resolveNodeOverlap', () => {
  const size = { w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H };
  it('(a) desired free → returned unchanged', () => {
    const r = resolveNodeOverlap({ x: 500, y: 500 }, size, [{ x: 0, y: 0, w: 100, h: 100 }]);
    expect(r).toEqual({ x: 500, y: 500 });
  });

  it('(b) desired over an obstacle → result clears it (with gap)', () => {
    const obstacle = { x: 100, y: 100, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H };
    const r = resolveNodeOverlap({ x: 100, y: 100 }, size, [obstacle], { gap: 16 });
    expect(overlaps({ ...r, ...size }, obstacle, 16)).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it('(c) deterministic — same input, same output', () => {
    const obstacle = { x: 100, y: 100, w: BLOCK_LINEAR_W, h: BLOCK_LINEAR_H };
    const a = resolveNodeOverlap({ x: 100, y: 100 }, size, [obstacle]);
    const b = resolveNodeOverlap({ x: 100, y: 100 }, size, [obstacle]);
    expect(a).toEqual(b);
  });

  it('(d) trapped (huge obstacle, small maxRadius) → desired returned, no hang', () => {
    const huge = { x: -10000, y: -10000, w: 20000, h: 20000 };
    const r = resolveNodeOverlap({ x: 100, y: 100 }, size, [huge], { maxRadius: 200, step: 24 });
    expect(r).toEqual({ x: 100, y: 100 });
  });
});
