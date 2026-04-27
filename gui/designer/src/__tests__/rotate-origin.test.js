import { describe, it, expect } from 'vitest';
import { rotateOriginToPosition } from '../rotate-origin';

describe('rotateOriginToPosition', () => {
  it('linear topology → no-op (sequence + annotations untouched)', () => {
    const seq = 'AAAAACCCCCGGGGGTTTTT';
    const ann = [{ id: 'a1', start: 5, end: 10, name: 'C-block', level: 'region' }];
    const out = rotateOriginToPosition(seq, ann, 6, { topology: 'linear' });
    expect(out.sequence).toBe(seq);
    expect(out.annotations).toEqual(ann);
  });

  it('circular: simple rotation, annotation does not cross cut → coords shift', () => {
    // length 17, origin at 1-indexed 10 (k=9). Annotation at [12, 15) (0-indexed half-open).
    const seq = 'ABCDEFGHIJKLMNOPQ'; // 17 chars, A→pos1
    const ann = [{ id: 'a1', start: 12, end: 15, name: 'tail', level: 'region' }];
    const out = rotateOriginToPosition(seq, ann, 10, { topology: 'circular' });
    // New origin at position 10 (J). Rotated seq = 'JKLMNOPQABCDEFGHI'.
    expect(out.sequence).toBe('JKLMNOPQABCDEFGHI');
    // ann positions [12, 15) shift by -9 → [3, 6).
    expect(out.annotations).toEqual([
      { id: 'a1', start: 3, end: 6, name: 'tail', level: 'region' },
    ]);
  });

  it('circular: annotation crossing cut splits into _part1 + _part2 sharing name/type', () => {
    // length 17, k=9 (origin 10). Annotation [3, 12) crosses k=9.
    // Expected: part1 [3-9+17, 17) = [11, 17); part2 [0, 12-9) = [0, 3).
    const seq = 'ABCDEFGHIJKLMNOPQ';
    const ann = [{ id: 'a1', start: 3, end: 12, name: 'wraparound', type: 'CDS', level: 'region', strand: 1 }];
    const out = rotateOriginToPosition(seq, ann, 10, { topology: 'circular' });
    expect(out.sequence).toBe('JKLMNOPQABCDEFGHI');
    expect(out.annotations).toHaveLength(2);
    const [p1, p2] = out.annotations;
    expect(p1).toMatchObject({ id: 'a1_part1', start: 11, end: 17, name: 'wraparound', type: 'CDS', level: 'region', strand: 1 });
    expect(p2).toMatchObject({ id: 'a1_part2', start: 0, end: 3, name: 'wraparound', type: 'CDS', level: 'region', strand: 1 });
  });
});
