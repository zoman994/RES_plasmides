/**
 * canvas-pan.test.js — Игорь 17.05.2026: «хватать канвас и двигать».
 * panScrollTarget moves the viewport opposite the pointer delta so the
 * grabbed point stays under the cursor; clamped ≥0.
 */
import { describe, it, expect } from 'vitest';
import { panScrollTarget } from '../canvas/canvas-layout';

const start = {
  x: 500, y: 300, scrollLeft: 400, scrollTop: 200,
};

describe('panScrollTarget', () => {
  it('drag right → content follows (scrollLeft decreases)', () => {
    const r = panScrollTarget(start, 560, 300); // +60 x
    expect(r.left).toBe(400 - 60);
    expect(r.top).toBe(200);
  });

  it('drag up → scrollTop increases', () => {
    const r = panScrollTarget(start, 500, 240); // -60 y
    expect(r.top).toBe(200 + 60);
  });

  it('never returns a negative scroll target (clamped)', () => {
    const r = panScrollTarget(start, 5000, 5000);
    expect(r.left).toBe(0);
    expect(r.top).toBe(0);
  });

  it('no movement → same scroll', () => {
    const r = panScrollTarget(start, 500, 300);
    expect(r).toEqual({ left: 400, top: 200 });
  });

  it('defensive: missing start → {0,0}', () => {
    expect(panScrollTarget(null, 10, 10)).toEqual({ left: 0, top: 0 });
  });
});
