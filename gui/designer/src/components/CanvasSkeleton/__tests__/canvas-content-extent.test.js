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
  canvasContentExtent, contentBBox, fitZoomToContent, graphContentBBox,
  BLOCK_LINEAR_W, BLOCK_LINEAR_H, OPERATION_NODE_W, OPERATION_NODE_H, EXTENT_MIN, ZOOM_MAX,
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

describe('contentBBox — tight world bbox (no floor / no pad)', () => {
  it('returns the tight bbox of a single zone', () => {
    const st = { zones: [{ id: 'z', bounds: { x: 300, y: 200, width: 600, height: 400 } }], positions: {}, operations: [] };
    expect(contentBBox(st)).toEqual({
      minX: 300, minY: 200, maxX: 900, maxY: 600, width: 600, height: 400,
    });
  });

  it('unions zones + positions + operations', () => {
    const st = {
      zones: [{ id: 'z', bounds: { x: 0, y: 0, width: 100, height: 100 } }],
      positions: { c: { x: 500, y: 50 } },
      operations: [{ id: 'o', position: { x: 50, y: 800 } }],
    };
    const b = contentBBox(st);
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(500 + BLOCK_LINEAR_W);
    expect(b.maxY).toBe(800 + OPERATION_NODE_H);
  });

  it('returns null on an empty / missing canvas', () => {
    expect(contentBBox({ zones: [], positions: {}, operations: [] })).toBeNull();
    expect(contentBBox(undefined)).toBeNull();
  });
});

describe('fitZoomToContent — zoom + scroll to fit the bbox («под размер сборки»)', () => {
  const bbox = {
    minX: 100, minY: 100, maxX: 1100, maxY: 600, width: 1000, height: 500,
  };
  it('zooms to the limiting axis', () => {
    // width 1000 → 600/1000=0.6 ; height 500 → 400/500=0.8 → min = 0.6.
    const fit = fitZoomToContent({ viewportW: 600, viewportH: 400, bbox, margin: 0 });
    expect(fit.zoom).toBeCloseTo(0.6, 3);
  });

  it('centres the content (scroll = centre*zoom − viewport/2)', () => {
    const fit = fitZoomToContent({ viewportW: 600, viewportH: 400, bbox, margin: 0 });
    expect(fit.scrollLeft).toBeCloseTo(600 * fit.zoom - 300, 1);
    expect(fit.scrollTop).toBeCloseTo(350 * fit.zoom - 200, 1);
  });

  it('clamps tiny content to ZOOM_MAX (no infinite zoom-in)', () => {
    const tiny = {
      minX: 0, minY: 0, maxX: 50, maxY: 50, width: 50, height: 50,
    };
    const fit = fitZoomToContent({ viewportW: 1000, viewportH: 1000, bbox: tiny, margin: 0 });
    expect(fit.zoom).toBeLessThanOrEqual(ZOOM_MAX);
  });

  it('returns null on no content or zero viewport', () => {
    expect(fitZoomToContent({ viewportW: 600, viewportH: 400, bbox: null })).toBeNull();
    expect(fitZoomToContent({ viewportW: 0, viewportH: 0, bbox })).toBeNull();
  });
});

describe('graphContentBBox — footprint of the per-zone DAG (AssemblyDagView zoom)', () => {
  // The DAG view lays its nodes out LOCALLY (computeGraphPositions, LR from 0,0),
  // so canvasContentExtent (which reads state.positions) doesn't describe it.
  // graphContentBBox returns the tight {width,height} of that local layout for
  // the scroll spacer + fit-to-content.
  const containers = [
    { id: 'src', name: 'src', sequence: 'ATGC' },
    { id: 'frag', name: 'frag', sequence: 'AAAA' },
  ];
  const operations = [{ id: 'op1', kind: 'pcr', inputs: ['src'], outputs: ['frag'] }];

  it('returns a positive width/height covering the laid-out nodes', () => {
    const b = graphContentBBox(containers, operations);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThan(0);
    // a container (240 wide) + an op (120) on an LR rank must exceed a single block.
    expect(b.width).toBeGreaterThanOrEqual(BLOCK_LINEAR_W);
  });

  it('reflects the real node footprints (≥ a block tall, ≥ an op wide)', () => {
    const b = graphContentBBox(containers, operations);
    expect(b.height).toBeGreaterThanOrEqual(Math.min(BLOCK_LINEAR_H, OPERATION_NODE_H));
    expect(b.width).toBeGreaterThanOrEqual(OPERATION_NODE_W);
  });

  it('empty graph → {0,0}; defensive against missing args', () => {
    expect(graphContentBBox([], [])).toEqual({ width: 0, height: 0 });
    expect(() => graphContentBBox()).not.toThrow();
    expect(graphContentBBox()).toEqual({ width: 0, height: 0 });
  });
});
