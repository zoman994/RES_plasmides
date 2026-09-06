import { describe, expect, it } from 'vitest';
import {
  describeSequenceSelection,
  selectionDisplaySegments,
  selectionSlice,
} from '../selection-range.js';

describe('selection-range — circular unwrapped contract', () => {
  it('canonicalises pUC19 2400..2686 + 1..13 to one 300 bp range', () => {
    const range = describeSequenceSelection({
      anchor: 2399 - 2686,
      focus: 13,
      seqLength: 2686,
      circular: true,
    });
    expect(range).toMatchObject({
      start: 2399,
      end: 2699,
      length: 300,
      wrapsOrigin: true,
      segments: [{ start: 2399, end: 2686 }, { start: 0, end: 13 }],
    });
  });

  it('keeps an interim drag inside the leading copy local', () => {
    expect(selectionDisplaySegments(-20, -15, 100)).toEqual([
      { kind: 'leading-wrap', start: 80, end: 85 },
    ]);
  });

  it('projects leading→main and main→trailing on their visible bands', () => {
    expect(selectionDisplaySegments(-20, 6, 100)).toEqual([
      { kind: 'leading-wrap', start: 80, end: 100 },
      { kind: 'main', start: 0, end: 6 },
    ]);
    expect(selectionDisplaySegments(90, 106, 100)).toEqual([
      { kind: 'main', start: 90, end: 100 },
      { kind: 'trailing-wrap', start: 0, end: 6 },
    ]);
  });

  it('copies the tail followed by the head in either drag direction', () => {
    const seq = 'ACGT'.repeat(25);
    const expected = seq.slice(80) + seq.slice(0, 6);
    expect(selectionSlice({ fullSeq: seq, anchor: -20, focus: 6, seqLength: 100 }))
      .toBe(expected);
    expect(selectionSlice({ fullSeq: seq, anchor: 6, focus: -20, seqLength: 100 }))
      .toBe(expected);
  });

  it('caps a programmatic extended selection at one complete turn', () => {
    const range = describeSequenceSelection({
      anchor: -20, focus: 120, seqLength: 100, circular: true,
    });
    expect(range.length).toBe(100);
    expect(range.segments).toEqual([{ start: 80, end: 100 }, { start: 0, end: 80 }]);
  });

  it('leaves an ordinary linear half-open range unchanged', () => {
    expect(describeSequenceSelection({
      anchor: 40, focus: 12, seqLength: 100, circular: false,
    })).toMatchObject({ start: 12, end: 40, length: 28, wrapsOrigin: false });
  });
});
