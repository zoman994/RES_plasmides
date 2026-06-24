import { describe, it, expect } from 'vitest';
import { lanePack, laneCount, linearTicks, bpToX } from '../linear-map';

describe('lanePack', () => {
  it('empty → []', () => {
    expect(lanePack([])).toEqual([]);
  });

  it('single interval → lane 0', () => {
    expect(lanePack([{ start: 0, end: 10 }])).toEqual([0]);
  });

  it('touching intervals share a lane (end ≤ start)', () => {
    expect(lanePack([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toEqual([0, 0]);
  });

  it('overlapping intervals go to separate lanes', () => {
    expect(lanePack([{ start: 0, end: 10 }, { start: 5, end: 15 }])).toEqual([0, 1]);
  });

  it('third interval reuses the first freed lane', () => {
    expect(lanePack([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 10, end: 20 }]))
      .toEqual([0, 1, 0]);
  });

  it('returns lanes ALIGNED TO INPUT ORDER, not sorted order', () => {
    expect(lanePack([{ start: 5, end: 15 }, { start: 0, end: 10 }])).toEqual([1, 0]);
  });
});

describe('laneCount', () => {
  it('empty pack → 1 lane', () => expect(laneCount([])).toBe(1));
  it('counts distinct lanes', () => expect(laneCount([0, 1, 0, 2])).toBe(3));
});

describe('linearTicks', () => {
  it('majors span 0..total at a round step', () => {
    const { step, majors } = linearTicks(5000);
    expect(step).toBeGreaterThan(0);
    expect(majors[0]).toBe(0);
    expect(majors.every((bp, i) => i === 0 || bp - majors[i - 1] === step)).toBe(true);
  });
});

describe('bpToX', () => {
  it('maps 0→x0 and total→x1', () => {
    expect(bpToX(0, 1000, 40, 860)).toBe(40);
    expect(bpToX(1000, 1000, 40, 860)).toBe(860);
    expect(bpToX(500, 1000, 40, 860)).toBe(450);
  });
  it('degenerate total stays finite', () => {
    expect(Number.isFinite(bpToX(0, 0, 40, 860))).toBe(true);
  });
});
