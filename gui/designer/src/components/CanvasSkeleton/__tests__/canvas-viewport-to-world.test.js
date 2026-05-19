/**
 * canvas-viewport-to-world.test.js — TD-ZONE-ATTACH-CONTAINMENT
 * (Игорь 18.05.2026). The single screen→world transform shared by
 * the drag-position math and the zone drop hit-test. The bug was the
 * hit-test omitting scroll while drag included it → a drop on a
 * scrolled canvas resolved to the wrong/no zone.
 */
import { describe, it, expect } from 'vitest';
import { viewportToWorld } from '../canvas/canvas-layout';

const rect = { left: 100, top: 50 };

describe('viewportToWorld', () => {
  it('no scroll, zoom 1 → client minus rect origin', () => {
    expect(viewportToWorld({ clientX: 300, clientY: 250, rect })).toEqual({ x: 200, y: 200 });
  });

  it('ADDS scroll (the regression — hit-test used to omit it)', () => {
    const noScroll = viewportToWorld({ clientX: 300, clientY: 250, rect });
    const scrolled = viewportToWorld({
      clientX: 300, clientY: 250, rect, scrollLeft: 400, scrollTop: 120,
    });
    expect(scrolled).toEqual({ x: 600, y: 320 });
    expect(scrolled).not.toEqual(noScroll); // proves scroll now counts
  });

  it('divides by zoom (world = (screen + scroll) / zoom — same as zoomAtPoint)', () => {
    expect(viewportToWorld({
      clientX: 300, clientY: 250, rect, scrollLeft: 100, scrollTop: 50, zoom: 2,
    })).toEqual({ x: (300 - 100 + 100) / 2, y: (250 - 50 + 50) / 2 });
  });

  it('defensive: missing rect → origin 0; zoom 0 → treated as 1 (jsdom-safe)', () => {
    expect(viewportToWorld({ clientX: 40, clientY: 10 })).toEqual({ x: 40, y: 10 });
    expect(viewportToWorld({
      clientX: 40, clientY: 10, rect, zoom: 0,
    })).toEqual({ x: -60, y: -40 });
  });

  it('drag (with grab offset) and hit-test (no offset) share this transform', () => {
    // applyDragAt: nx = world.x - offsetX/z ; hit-test: world.x.
    // Both derive from the SAME world point → can never diverge.
    const w = viewportToWorld({
      clientX: 500, clientY: 400, rect, scrollLeft: 200, scrollTop: 60, zoom: 2,
    });
    const offsetX = 30; const offsetY = 10; const z = 2;
    const dragX = w.x - offsetX / z;
    const dragY = w.y - offsetY / z;
    // identical to the legacy inline formula it replaced
    expect(dragX).toBe((500 - 100 + 200 - offsetX) / z);
    expect(dragY).toBe((400 - 50 + 60 - offsetY) / z);
  });
});
