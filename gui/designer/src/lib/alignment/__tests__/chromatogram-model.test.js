import { describe, it, expect } from 'vitest';
import { traceWindowForBase, mapAlignmentToTrace, reverseComplementChromatogram } from '../chromatogram-model';

const chromo = {
  bases: 'ACGT',
  qualities: [40, 38, 20, 10],
  peakLocations: [10, 20, 30, 40],
  traces: { A: [1, 2, 3, 4], C: [5, 6, 7, 8], G: [9, 10, 11, 12], T: [13, 14, 15, 16] },
  sampleCount: 50,
};

describe('traceWindowForBase', () => {
  it('centres on the peak, spanning the midpoints to neighbours', () => {
    const w = traceWindowForBase(chromo, 1); // peak 20, prev 10, next 30
    expect(w.peak).toBe(20);
    expect(w.start).toBe(15);
    expect(w.end).toBe(25);
  });

  it('clamps the first/last base windows to the trace bounds', () => {
    const first = traceWindowForBase(chromo, 0);
    expect(first.start).toBeGreaterThanOrEqual(0);
    const last = traceWindowForBase(chromo, 3);
    expect(last.end).toBeGreaterThanOrEqual(last.peak);
  });
});

describe('mapAlignmentToTrace', () => {
  it('returns the read base index per column, null for read gaps', () => {
    const columns = [
      { ai: 0, bi: 0, status: 'match' },
      { ai: 1, bi: null, status: 'gapB' }, // read has a gap here
      { ai: 2, bi: 1, status: 'match' },
    ];
    expect(mapAlignmentToTrace(columns, 'b')).toEqual([0, null, 1]);
  });

  it('can map the A side too', () => {
    const columns = [
      { ai: null, bi: 0, status: 'gapA' },
      { ai: 0, bi: 1, status: 'match' },
    ];
    expect(mapAlignmentToTrace(columns, 'a')).toEqual([null, 0]);
  });
});

describe('reverseComplementChromatogram', () => {
  it('reverses sample order and swaps complementary channels', () => {
    const rc = reverseComplementChromatogram(chromo);
    // A<->T, C<->G, and samples reversed
    expect(Array.from(rc.traces.A)).toEqual([16, 15, 14, 13]); // old T reversed
    expect(Array.from(rc.traces.T)).toEqual([4, 3, 2, 1]);     // old A reversed
    expect(Array.from(rc.traces.C)).toEqual([12, 11, 10, 9]);  // old G reversed
    expect(Array.from(rc.traces.G)).toEqual([8, 7, 6, 5]);     // old C reversed
    expect(rc.bases).toBe('ACGT'); // revcomp of ACGT is ACGT
  });

  it('double reverse-complement restores the trace', () => {
    const back = reverseComplementChromatogram(reverseComplementChromatogram(chromo));
    expect(Array.from(back.traces.A)).toEqual([1, 2, 3, 4]);
  });
});
