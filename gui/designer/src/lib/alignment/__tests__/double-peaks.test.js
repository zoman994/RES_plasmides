import { describe, it, expect } from 'vitest';
import { detectDoublePeaks, doublePeaksByRefPos } from '../double-peaks';

function chromo(peakVals) {
  // peakVals: array of {A,C,G,T} intensities at each peak
  const n = peakVals.length;
  const sampleCount = n;
  const peakLocations = peakVals.map((_, i) => i);
  const traces = { A: [], C: [], G: [], T: [] };
  for (let s = 0; s < n; s++) {
    traces.A[s] = peakVals[s].A || 0;
    traces.C[s] = peakVals[s].C || 0;
    traces.G[s] = peakVals[s].G || 0;
    traces.T[s] = peakVals[s].T || 0;
  }
  return { traces, peakLocations, sampleCount };
}

describe('detectDoublePeaks', () => {
  it('flags a base whose secondary peak is comparable, with the right IUPAC code', () => {
    const c = chromo([
      { A: 100, G: 50 },  // A/G ≈ 0.5 → R
      { C: 100, T: 5 },   // clean C → no flag
      { G: 80, T: 70 },   // G/T ≈ 0.875 → K
    ]);
    const dp = detectDoublePeaks(c, { ratio: 0.35 });
    expect(dp[0].code).toBe('R');
    expect(dp[1]).toBeUndefined();
    expect(dp[2].code).toBe('K');
  });

  it('respects the ratio threshold', () => {
    const c = chromo([{ A: 100, G: 20 }]); // 0.2 < 0.35
    expect(detectDoublePeaks(c, { ratio: 0.35 })[0]).toBeUndefined();
    expect(detectDoublePeaks(c, { ratio: 0.15 })[0].code).toBe('R');
  });
});

describe('doublePeaksByRefPos', () => {
  it('re-keys base-index flags onto reference positions via bi', () => {
    const byBi = { 0: { code: 'R' }, 2: { code: 'Y' } };
    const readByRefPos = { 10: { base: 'A', bi: 0 }, 11: { base: 'C', bi: 1 }, 12: { base: 'C', bi: 2 } };
    const out = doublePeaksByRefPos(byBi, readByRefPos);
    expect(out[10].code).toBe('R');
    expect(out[11]).toBeUndefined();
    expect(out[12].code).toBe('Y');
  });
});
