/**
 * canvas-zoom-at-point.test.js — Игорь 17.05.2026: «зум колёсиком
 * мыши, и чтобы зумился к той точке на которой курсор».
 *
 * zoomAtPoint(): focal-point zoom. The world point under the cursor
 * must stay under the cursor after the zoom changes. Layout: a node at
 * canvas (X,Y) renders at screen (X*zoom - scroll). World point under
 * cursor s: w = (s + scroll)/zoom. Keep it fixed: scroll2 = w*zoom2 - s.
 */
import { describe, it, expect } from 'vitest';
import {
  zoomAtPoint, ZOOM_MIN, ZOOM_MAX,
} from '../canvas/canvas-layout';

describe('zoomAtPoint — focal-point (zoom-to-cursor) math', () => {
  it('wheel up (deltaY<0) zooms IN, down zooms OUT', () => {
    const inn = zoomAtPoint({
      zoom: 1, dir: -1, sx: 0, sy: 0, scrollLeft: 0, scrollTop: 0,
    });
    const out = zoomAtPoint({
      zoom: 1, dir: 1, sx: 0, sy: 0, scrollLeft: 0, scrollTop: 0,
    });
    expect(inn.zoom).toBeGreaterThan(1);
    expect(out.zoom).toBeLessThan(1);
  });

  it('keeps the world point under the cursor fixed (the core invariant)', () => {
    const zoom = 1;
    const sx = 400;
    const sy = 250;
    const scrollLeft = 120;
    const scrollTop = 60;
    // world point currently under the cursor
    const wx = (sx + scrollLeft) / zoom;
    const wy = (sy + scrollTop) / zoom;
    const r = zoomAtPoint({
      zoom, dir: -1, sx, sy, scrollLeft, scrollTop,
    });
    // after applying r.scrollLeft/Top at r.zoom, the same world point
    // must still map to the same screen position (sx, sy).
    expect(wx * r.zoom - r.scrollLeft).toBeCloseTo(sx, 6);
    expect(wy * r.zoom - r.scrollTop).toBeCloseTo(sy, 6);
  });

  it('focal invariant also holds when zooming OUT from a scrolled view', () => {
    const zoom = 1.6;
    const sx = 300;
    const sy = 180;
    const scrollLeft = 500;
    const scrollTop = 320;
    const wx = (sx + scrollLeft) / zoom;
    const wy = (sy + scrollTop) / zoom;
    const r = zoomAtPoint({
      zoom, dir: 1, sx, sy, scrollLeft, scrollTop,
    });
    expect(wx * r.zoom - r.scrollLeft).toBeCloseTo(sx, 6);
    expect(wy * r.zoom - r.scrollTop).toBeCloseTo(sy, 6);
  });

  it('clamps to [ZOOM_MIN, ZOOM_MAX] and flags no-op at the rail', () => {
    const atMax = zoomAtPoint({
      zoom: ZOOM_MAX, dir: -1, sx: 10, sy: 10, scrollLeft: 0, scrollTop: 0,
    });
    expect(atMax.zoom).toBe(ZOOM_MAX);
    expect(atMax.changed).toBe(false);
    const atMin = zoomAtPoint({
      zoom: ZOOM_MIN, dir: 1, sx: 10, sy: 10, scrollLeft: 0, scrollTop: 0,
    });
    expect(atMin.zoom).toBe(ZOOM_MIN);
    expect(atMin.changed).toBe(false);
  });

  it('never returns a negative scroll target', () => {
    const r = zoomAtPoint({
      zoom: 1, dir: 1, sx: 5, sy: 5, scrollLeft: 0, scrollTop: 0,
    });
    expect(r.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(r.scrollTop).toBeGreaterThanOrEqual(0);
  });

  it('a mid-zoom step reports changed:true', () => {
    const r = zoomAtPoint({
      zoom: 1, dir: -1, sx: 0, sy: 0, scrollLeft: 0, scrollTop: 0,
    });
    expect(r.changed).toBe(true);
  });
});
