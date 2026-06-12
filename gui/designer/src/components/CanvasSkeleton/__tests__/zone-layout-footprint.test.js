/**
 * zone-layout-footprint.test.js — M-CANVAS-FIX.1 K2.
 *
 * One NODE_FOOTPRINT is the single source of truth for spacing. Before K2 the
 * lane pitch (200) was SMALLER than the block (240) → 40px horizontal overlap
 * every time, and lane Y offsets (50/150) with a 150-tall block → 50px
 * source/mid vertical overlap. After K2: pitch ≥ footprint width, lane offsets
 * height-aware (source-row bottom never reaches mid-row top), dagre fed the
 * real footprint. Overlap becomes mathematically impossible, not an edge case.
 */
import { describe, it, expect } from 'vitest';
import {
  computeZoneLayout, ZONE_LANE_DY, NODE_FOOTPRINT,
} from '../lib/zone-layout';
import { BLOCK_LINEAR_W, BLOCK_LINEAR_H } from '../canvas/canvas-layout';

function zoneWith(containerIds) {
  return {
    zones: [{
      id: 'z', name: 'Z', viewMode: 'graph', laneLayout: 'auto',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
    }],
    containers: containerIds.map((id) => ({
      id, kind: 'molecule', name: id, sequence: 'ACGT', annotations: [],
      topology: { circular: false }, zoneId: 'z',
    })),
    operations: [], pieces: [], junctions: [], positions: {},
  };
}

describe('K2 — NODE_FOOTPRINT is the single source of truth', () => {
  it('footprint matches the real block size + carries gutters', () => {
    expect(NODE_FOOTPRINT.w).toBe(BLOCK_LINEAR_W);
    expect(NODE_FOOTPRINT.h).toBe(BLOCK_LINEAR_H);
    expect(NODE_FOOTPRINT.gutterX).toBeGreaterThan(0);
    expect(NODE_FOOTPRINT.gutterY).toBeGreaterThan(0);
  });

  it('lane pitch is ≥ footprint width → no horizontal overlap in a lane', () => {
    // two same-lane (source) nodes, sorted by name → laid left-to-right
    const layout = computeZoneLayout(zoneWith(['aaa', 'bbb']), 'z');
    const xs = [layout.aaa.x, layout.bbb.x].sort((p, q) => p - q);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(NODE_FOOTPRINT.w);
    // same lane → same y (no accidental vertical offset)
    expect(layout.aaa.y).toBe(layout.bbb.y);
  });

  it('lanes are height-aware: source-row bottom never reaches the mid row', () => {
    // ZONE_LANE_DY is the single offset source the divider also reads.
    expect(ZONE_LANE_DY.source + NODE_FOOTPRINT.h)
      .toBeLessThanOrEqual(ZONE_LANE_DY.intermediate);
  });

  it('mid-row bottom (one footprint) never reaches the finals row', () => {
    expect(ZONE_LANE_DY.intermediate + NODE_FOOTPRINT.h)
      .toBeLessThanOrEqual(ZONE_LANE_DY.finals);
  });
});
