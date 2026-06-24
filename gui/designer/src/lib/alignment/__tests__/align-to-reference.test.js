import { describe, it, expect } from 'vitest';
import { buildAlignToReference } from '../align-to-reference';

describe('buildAlignToReference', () => {
  it('maps matches, mismatches and deletions onto reference positions', () => {
    const result = {
      aStart: 5,
      identity: 75,
      columns: [
        { a: 'A', b: 'A', ai: 5, bi: 0, status: 'match' },
        { a: 'C', b: 'T', ai: 6, bi: 1, status: 'mismatch' },
        { a: 'G', b: '-', ai: 7, bi: null, status: 'gapB' }, // deletion in read
        { a: 'T', b: 'T', ai: 8, bi: 2, status: 'match' },
      ],
    };
    const r = buildAlignToReference(result);
    expect(r.readByRefPos[5]).toEqual({ base: 'A', status: 'match', bi: 0 });
    expect(r.readByRefPos[6]).toEqual({ base: 'T', status: 'mismatch', bi: 1 });
    expect(r.readByRefPos[7]).toEqual({ base: '-', status: 'gapB', bi: null });
    expect(r.readByRefPos[8]).toEqual({ base: 'T', status: 'match', bi: 2 });
    expect(r.mismatchRefPositions).toEqual([6]);
    expect(r.span).toEqual({ start: 5, end: 8 });
    expect(r.insertions).toEqual([]);
  });

  it('collects read insertions (gapA runs) between reference columns', () => {
    const result = {
      aStart: 5,
      columns: [
        { a: 'A', b: 'A', ai: 5, bi: 0, status: 'match' },
        { a: '-', b: 'G', ai: null, bi: 1, status: 'gapA' },
        { a: '-', b: 'G', ai: null, bi: 2, status: 'gapA' },
        { a: 'C', b: 'C', ai: 6, bi: 3, status: 'match' },
      ],
    };
    const r = buildAlignToReference(result);
    expect(r.insertions).toEqual([{ afterRefPos: 5, bases: 'GG', biStart: 1 }]);
    expect(Object.keys(r.readByRefPos).map(Number).sort((a, b) => a - b)).toEqual([5, 6]);
    expect(r.span.end).toBe(6);
  });

  it('keeps the local span starting at aStart for a sub-region hit', () => {
    const result = {
      aStart: 10,
      columns: [
        { a: 'A', b: 'A', ai: 10, bi: 0, status: 'match' },
        { a: 'C', b: 'C', ai: 11, bi: 1, status: 'match' },
      ],
    };
    const r = buildAlignToReference(result);
    expect(r.span).toEqual({ start: 10, end: 11 });
  });

  it('handles empty / missing columns safely', () => {
    expect(buildAlignToReference(null).readByRefPos).toEqual({});
    expect(buildAlignToReference({ columns: [] }).insertions).toEqual([]);
  });
});
