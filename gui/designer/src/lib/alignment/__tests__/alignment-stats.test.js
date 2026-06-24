import { describe, it, expect } from 'vitest';
import { computeAlignmentStats } from '../alignment-stats';

function cols(statuses) {
  return statuses.map((s) => ({ status: s }));
}

describe('computeAlignmentStats', () => {
  it('100% identity for all matches', () => {
    const r = computeAlignmentStats(cols(['match', 'match', 'match']));
    expect(r.matches).toBe(3);
    expect(r.mismatches).toBe(0);
    expect(r.gaps).toBe(0);
    expect(r.identity).toBe(100);
    expect(r.alignedLength).toBe(3);
  });

  it('counts mismatches and computes identity over full length', () => {
    const r = computeAlignmentStats(cols(['match', 'mismatch', 'match', 'match']));
    expect(r.matches).toBe(3);
    expect(r.mismatches).toBe(1);
    expect(r.identity).toBeCloseTo(75, 5);
  });

  it('counts gap columns', () => {
    const r = computeAlignmentStats(cols(['match', 'gapA', 'gapB', 'match']));
    expect(r.gaps).toBe(2);
    expect(r.matches).toBe(2);
  });

  it('identity counts gaps in the denominator — gap-dominated alignment is NOT ~100%', () => {
    // a tiny match region inside a gap-dominated alignment must read low,
    // not be inflated by trimming the gaps away.
    const statuses = ['match', 'match'];
    for (let i = 0; i < 98; i++) statuses.push('gapA');
    const r = computeAlignmentStats(cols(statuses));
    expect(r.matches).toBe(2);
    expect(r.identity).toBeCloseTo(2, 5); // 2 / 100
  });

  it('returns 0 identity for empty', () => {
    const r = computeAlignmentStats([]);
    expect(r.identity).toBe(0);
    expect(r.alignedLength).toBe(0);
  });
});
