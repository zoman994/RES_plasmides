/**
 * canvas-edge-anchors.test.js — Игорь 17.05.2026: «контейнеры
 * конектятся друг с другом только с левой либо правой грани, верх и
 * низ не используются».
 *
 * edgeAnchors(from, to) picks the connection side by the dominant axis
 * of the centre-to-centre vector: horizontal-dominant → right/left,
 * vertical-dominant → bottom/top. Returns straight-chord midpoint
 * (badge anchor) + perpendicular bezier control points so the curve
 * leaves/enters the chosen side cleanly.
 */
import { describe, it, expect } from 'vitest';
import { edgeAnchors } from '../canvas/canvas-layout';

const A = { x: 0, y: 0, w: 100, h: 40 }; // centre (50,20)

describe('edgeAnchors — 4-side directional connectors', () => {
  it('target to the RIGHT → from right edge, to left edge (legacy behaviour kept)', () => {
    const r = edgeAnchors(A, { x: 300, y: 0, w: 100, h: 40 });
    expect(r.fromSide).toBe('right');
    expect(r.toSide).toBe('left');
    expect([r.x1, r.y1]).toEqual([100, 20]); // right edge, vert centre
    expect([r.x2, r.y2]).toEqual([300, 20]); // left edge, vert centre
    expect(r.c1y).toBe(20); // control points stay horizontal
    expect(r.c2y).toBe(20);
    expect(r.c1x).toBeGreaterThan(r.x1); // bows outward to the right
    expect(r.c2x).toBeLessThan(r.x2);
  });

  it('target BELOW → from bottom edge, to top edge', () => {
    const r = edgeAnchors(A, { x: 0, y: 300, w: 100, h: 40 });
    expect(r.fromSide).toBe('bottom');
    expect(r.toSide).toBe('top');
    expect([r.x1, r.y1]).toEqual([50, 40]); // horiz centre, bottom edge
    expect([r.x2, r.y2]).toEqual([50, 300]); // horiz centre, top edge
    expect(r.c1x).toBe(50); // control points stay vertical
    expect(r.c2x).toBe(50);
    expect(r.c1y).toBeGreaterThan(r.y1); // bows downward
    expect(r.c2y).toBeLessThan(r.y2);
  });

  it('target ABOVE → from top edge, to bottom edge', () => {
    const r = edgeAnchors(A, { x: 0, y: -300, w: 100, h: 40 });
    expect(r.fromSide).toBe('top');
    expect(r.toSide).toBe('bottom');
    expect([r.x1, r.y1]).toEqual([50, 0]);
    expect([r.x2, r.y2]).toEqual([50, -260]); // -300 + h(40)
    expect(r.c1y).toBeLessThan(r.y1); // bows upward
    expect(r.c2y).toBeGreaterThan(r.y2);
  });

  it('target to the LEFT → from left edge, to right edge', () => {
    const r = edgeAnchors(A, { x: -300, y: 0, w: 100, h: 40 });
    expect(r.fromSide).toBe('left');
    expect(r.toSide).toBe('right');
    expect([r.x1, r.y1]).toEqual([0, 20]);
    expect([r.x2, r.y2]).toEqual([-200, 20]); // -300 + w(100)
    expect(r.c1x).toBeLessThan(r.x1); // bows leftward
    expect(r.c2x).toBeGreaterThan(r.x2);
  });

  it('diagonal but horizontal-dominant (|dx|>|dy|) → right/left', () => {
    const r = edgeAnchors(A, { x: 300, y: 100, w: 100, h: 40 });
    expect(r.fromSide).toBe('right');
    expect(r.toSide).toBe('left');
  });

  it('diagonal but vertical-dominant (|dy|>|dx|) → bottom/top', () => {
    const r = edgeAnchors(A, { x: 100, y: 300, w: 100, h: 40 });
    expect(r.fromSide).toBe('bottom');
    expect(r.toSide).toBe('top');
  });

  it('midX/midY is the straight-chord midpoint of the two anchors', () => {
    const r = edgeAnchors(A, { x: 300, y: 0, w: 100, h: 40 });
    expect(r.midX).toBe((r.x1 + r.x2) / 2);
    expect(r.midY).toBe((r.y1 + r.y2) / 2);
  });

  it('curvature is clamped: tiny gap ≥30, huge gap ≤160', () => {
    const near = edgeAnchors(A, { x: 104, y: 0, w: 100, h: 40 }); // gap ~4
    expect(near.c1x - near.x1).toBe(30); // min clamp
    const far = edgeAnchors(A, { x: 5000, y: 0, w: 100, h: 40 });
    expect(far.c1x - far.x1).toBe(160); // max clamp
  });

  it('emits an SVG cubic path string from the anchors', () => {
    const r = edgeAnchors(A, { x: 300, y: 0, w: 100, h: 40 });
    expect(r.d).toBe(`M ${r.x1} ${r.y1} C ${r.c1x} ${r.c1y}, ${r.c2x} ${r.c2y}, ${r.x2} ${r.y2}`);
  });
});
