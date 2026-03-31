/**
 * Tests for racetrack layout algorithm.
 */
import { describe, it, expect } from 'vitest';
import { computeRacetrackLayout } from '../racetrack-layout';

const SIZE = { width: 800, height: 400 };

describe('computeRacetrackLayout', () => {
  it('places N blocks around ellipse', () => {
    const frags = [{ length: 100 }, { length: 200 }, { length: 300 }];
    const layout = computeRacetrackLayout(frags, SIZE);
    expect(layout.blocks).toHaveLength(3);
    expect(layout.junctions).toHaveLength(3); // circular = N junctions
    // All blocks within canvas bounds
    layout.blocks.forEach(b => {
      expect(b.x).toBeGreaterThanOrEqual(-10); // slight overflow ok
      expect(b.x + b.w).toBeLessThanOrEqual(810);
      expect(b.y).toBeGreaterThanOrEqual(-10);
      expect(b.y + b.h).toBeLessThanOrEqual(410);
    });
  });

  it('handles 2 fragments', () => {
    const frags = [{ length: 500 }, { length: 500 }];
    const layout = computeRacetrackLayout(frags, SIZE);
    expect(layout.blocks).toHaveLength(2);
    expect(layout.junctions).toHaveLength(2);
    // Blocks should be roughly opposite each other
    const [a, b] = layout.blocks;
    expect(Math.abs(a.midAngle - b.midAngle)).toBeCloseTo(Math.PI, 0);
  });

  it('handles 10 fragments', () => {
    const frags = Array.from({ length: 10 }, (_, i) => ({ length: 100 + i * 50 }));
    const layout = computeRacetrackLayout(frags, SIZE);
    expect(layout.blocks).toHaveLength(10);
    expect(layout.junctions).toHaveLength(10);
  });

  it('width proportional to bp', () => {
    const frags = [{ length: 100 }, { length: 1000 }, { length: 5000 }];
    const layout = computeRacetrackLayout(frags, SIZE);
    // Larger fragments should have wider blocks
    expect(layout.blocks[2].w).toBeGreaterThan(layout.blocks[0].w);
  });

  it('connector points on Bezier curves', () => {
    const frags = [{ length: 300 }, { length: 300 }, { length: 300 }];
    const layout = computeRacetrackLayout(frags, SIZE);
    layout.junctions.forEach(j => {
      expect(j.connX).toBeDefined();
      expect(j.connY).toBeDefined();
      expect(j.path).toMatch(/^M .+ Q .+ .+$/);
    });
  });

  it('returns empty for no fragments', () => {
    const layout = computeRacetrackLayout([], SIZE);
    expect(layout.blocks).toHaveLength(0);
    expect(layout.junctions).toHaveLength(0);
  });

  it('center is at canvas midpoint', () => {
    const frags = [{ length: 100 }];
    const layout = computeRacetrackLayout(frags, SIZE);
    expect(layout.center.x).toBe(400);
    expect(layout.center.y).toBe(200);
  });
});
