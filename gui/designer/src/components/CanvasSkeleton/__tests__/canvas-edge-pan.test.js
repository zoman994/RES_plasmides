/**
 * canvas-edge-pan.test.js — Игорь 17.05.2026: «бесконечный канвас,
 * двигаю блок и он уезжаааааал дальше и дальше».
 *
 * edgePanVelocity: while a block is dragged toward a viewport edge the
 * canvas must auto-scroll so the block keeps going (the content extent
 * already grows with position). Speed ramps from 0 at the edge-band
 * inner boundary to maxSpeed at / past the edge.
 */
import { describe, it, expect } from 'vitest';
import { edgePanVelocity } from '../canvas/canvas-layout';

const rect = {
  left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600,
};
const EDGE = 64;
const MAX = 20;

describe('edgePanVelocity', () => {
  it('cursor in the centre → no pan', () => {
    const v = edgePanVelocity({
      clientX: 500, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(v).toEqual({ vx: 0, vy: 0 });
  });

  it('near the LEFT edge → negative vx (scroll left), magnitude ≤ max', () => {
    const v = edgePanVelocity({
      clientX: rect.left + 12, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(v.vx).toBeLessThan(0);
    expect(Math.abs(v.vx)).toBeLessThanOrEqual(MAX);
    expect(v.vy).toBe(0);
  });

  it('PAST the left edge → full negative speed (drag beyond viewport)', () => {
    const v = edgePanVelocity({
      clientX: rect.left - 200, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(v.vx).toBe(-MAX);
  });

  it('near the RIGHT edge → positive vx', () => {
    const v = edgePanVelocity({
      clientX: rect.right - 10, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vx).toBeLessThanOrEqual(MAX);
  });

  it('near the BOTTOM edge → positive vy; near TOP → negative vy', () => {
    const b = edgePanVelocity({
      clientX: 500, clientY: rect.bottom - 8, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(b.vy).toBeGreaterThan(0);
    const t = edgePanVelocity({
      clientX: 500, clientY: rect.top + 8, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(t.vy).toBeLessThan(0);
  });

  it('exactly at the edge-band inner boundary → 0 (no jitter just outside the band)', () => {
    const v = edgePanVelocity({
      clientX: rect.left + EDGE, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(v.vx).toBe(0);
  });

  it('deeper into the band → faster (monotonic ramp)', () => {
    const shallow = edgePanVelocity({
      clientX: rect.left + 50, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    const deep = edgePanVelocity({
      clientX: rect.left + 8, clientY: 350, rect, edge: EDGE, maxSpeed: MAX,
    });
    expect(Math.abs(deep.vx)).toBeGreaterThan(Math.abs(shallow.vx));
  });

  it('zero-size rect (jsdom / not laid out) → no pan, no throw', () => {
    const z = {
      left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0,
    };
    expect(edgePanVelocity({
      clientX: 0, clientY: 0, rect: z, edge: EDGE, maxSpeed: MAX,
    })).toEqual({ vx: 0, vy: 0 });
    expect(() => edgePanVelocity({
      clientX: 5, clientY: 5, rect: null, edge: EDGE, maxSpeed: MAX,
    })).not.toThrow();
  });
});
