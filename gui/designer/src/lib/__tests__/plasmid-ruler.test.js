import { describe, it, expect } from 'vitest';
import {
  niceTickStep, rulerTicks, angleForBp, bpFromVector,
} from '../plasmid-ruler';

describe('niceTickStep', () => {
  it('returns nice 1/2/5×10ⁿ steps for ~10 majors', () => {
    expect(niceTickStep(15559)).toBe(2000); // 15559/10=1556 → norm 1.56 → 2 ×1000
    expect(niceTickStep(432)).toBe(50); // 43.2 → norm 4.3 → 5 ×10
    expect(niceTickStep(2686)).toBe(200); // 268 → norm 2.68 → 2 ×100… → 200? norm 2.68→nice 2 ×100? raw=268,mag=100,norm 2.68→2 →200? wait <3 → 2 → 200
    expect(niceTickStep(100)).toBe(10);
  });
  it('guards zero/negative length', () => {
    expect(niceTickStep(0)).toBe(1);
    expect(niceTickStep(-5)).toBe(1);
  });
});

describe('rulerTicks', () => {
  it('lists 0, step, 2·step … below length', () => {
    expect(rulerTicks(1000, 250)).toEqual([0, 250, 500, 750]);
  });
  it('empty for bad input', () => {
    expect(rulerTicks(0, 100)).toEqual([]);
    expect(rulerTicks(1000, 0)).toEqual([]);
  });
});

describe('angleForBp', () => {
  it('position 0 → top (−π/2)', () => {
    expect(angleForBp(0, 1000)).toBeCloseTo(-Math.PI / 2, 6);
  });
  it('quarter way → 0 rad (east)', () => {
    expect(angleForBp(250, 1000)).toBeCloseTo(0, 6);
  });
});

describe('bpFromVector — click angle → 1-based bp (top=1, clockwise)', () => {
  const L = 1000;
  it('click straight up (top) → near position 1', () => {
    // up in SVG = (0, -r)
    expect(bpFromVector(0, -10, L)).toBe(1);
  });
  it('click east (3 o\'clock) → ~quarter length', () => {
    expect(bpFromVector(10, 0, L)).toBe(251); // floor(0.25*1000)+1
  });
  it('click south (6 o\'clock) → ~half length', () => {
    expect(bpFromVector(0, 10, L)).toBe(501);
  });
  it('click west (9 o\'clock) → ~three-quarters', () => {
    expect(bpFromVector(-10, 0, L)).toBe(751);
  });
  it('clamps to [1, length]; guards zero length', () => {
    expect(bpFromVector(0, -10, 0)).toBe(1);
    const v = bpFromVector(0.0001, -10, L);
    expect(v).toBeGreaterThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(L);
  });
});
