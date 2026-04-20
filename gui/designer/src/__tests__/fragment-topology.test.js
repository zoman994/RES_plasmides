/**
 * K12 (Sprint 1.7) — fragment topology helpers.
 */
import { describe, it, expect } from 'vitest';
import { getFragmentTopology, expectedJunctionCount } from '../components/utils/fragment-topology';

describe('K12 — getFragmentTopology', () => {
  it('fragment.topology wins over assembly.circular', () => {
    expect(getFragmentTopology({ topology: 'circular' }, false)).toBe('circular');
    expect(getFragmentTopology({ topology: 'linear' }, true)).toBe('linear');
  });

  it('falls back to assembly.circular when fragment.topology absent', () => {
    expect(getFragmentTopology({}, true)).toBe('circular');
    expect(getFragmentTopology({}, false)).toBe('linear');
  });

  it('handles undefined fragment by falling back to assembly.circular', () => {
    expect(getFragmentTopology(undefined, true)).toBe('circular');
    expect(getFragmentTopology(null, false)).toBe('linear');
  });
});

describe('K12 — expectedJunctionCount', () => {
  it('empty fragments → 0', () => {
    expect(expectedJunctionCount([], false)).toBe(0);
    expect(expectedJunctionCount([], true)).toBe(0);
  });

  it('linear single fragment → 0 (V17 fix)', () => {
    expect(expectedJunctionCount([{ topology: 'linear', length: 100 }], false)).toBe(0);
  });

  it('circular single fragment → 0 (v1.0 renders arc indicator, not real junction)', () => {
    expect(expectedJunctionCount([{ topology: 'circular', length: 100 }], true)).toBe(0);
  });

  it('linear 3 fragments → 2', () => {
    expect(expectedJunctionCount([{}, {}, {}], false)).toBe(2);
  });

  it('circular 3 fragments → 3', () => {
    expect(expectedJunctionCount([{}, {}, {}], true)).toBe(3);
  });

  it('linear 2 fragments → 1', () => {
    expect(expectedJunctionCount([{}, {}], false)).toBe(1);
  });
});
