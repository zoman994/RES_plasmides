/**
 * K3.1 — the incomplete report must describe the work that was actually done.
 *
 * A `RESOURCE_LIMIT` session is the one case where the profile matters MOST: it is the run that
 * needs explaining. Reporting `arenaKB=0` there says «this run used no memory», which is the
 * opposite of true — it exhausted the budget. A zero that means «not measured» is worse than no
 * number at all, because the next person tunes against it.
 *
 * These are contracts on the STATS shape only. The engine's answer is not involved: an incomplete
 * session still returns no occurrences (§3.3), and that is asserted elsewhere.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSearchSession, RESOURCE_LIMIT } from '../dna-gapped-search';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randDna = (rnd, n) => {
  let out = '';
  for (let i = 0; i < n; i++) out += 'ACGT'[(rnd() * 4) | 0];
  return out;
};

/** A run guaranteed to trip the budget mid-alignment, so the throw unwinds from inside the DP. */
function exhausted() {
  const rnd = lcg(0xB0DE);
  const target = randDna(rnd, 20_000);
  const probe = target.slice(9_000, 9_200); // 200 nt — expensive enough to blow a small budget
  return dnaGappedSearchSession(probe, target, {
    thresholdBps: 8000, collectStats: true, stateBudget: 50_000,
  });
}

describe('K3.1 — telemetry survives the thrown RESOURCE_LIMIT path', () => {
  it('the run really is incomplete (otherwise this file proves nothing)', () => {
    const s = exhausted();
    expect(s.incomplete).toBe(true);
    expect(s.reason).toBe(RESOURCE_LIMIT);
    expect(s.occurrences).toEqual([]);
    expect(s.stats.reason).toBe(RESOURCE_LIMIT);
  });

  it('counters accumulated INSIDE the aborted alignment are reported, not reset', () => {
    const st = exhausted().stats;
    expect(st.scanPositions, 'scan positions').toBeGreaterThan(0);
    expect(st.rawStarts, 'candidate starts').toBeGreaterThan(0);
    expect(st.alignCalls, 'alignments attempted').toBeGreaterThan(0);
    expect(st.scoreStates, 'DP states accepted').toBeGreaterThan(0);
    expect(st.attempts, 'transition attempts').toBeGreaterThan(0);
    expect(st.accepted, 'frontier insertions').toBeGreaterThan(0);
    expect(st.peakFrontier, 'peak frontier width').toBeGreaterThan(0);
  });

  it('arenaKB reports the memory the aborted run actually held', () => {
    // The defect: `arenaBytes` was written after the DP loops, so the throw skipped it and every
    // incomplete profile line read `arenaKB=0` — a measurement that quietly invented «free».
    const st = exhausted().stats;
    expect(st.arenaKB).toBeGreaterThan(0);
  });

  it('stage timings are reported for the stage that was interrupted', () => {
    const st = exhausted().stats;
    expect(st.scanMs).toBeGreaterThanOrEqual(0);
    expect(st.alignMs, 'time spent in the aborted alignment').toBeGreaterThan(0);
    expect(st.totalMs).toBeGreaterThan(0);
  });

  it('a COMPLETE run still reports the same fields (no regression in the normal path)', () => {
    const s = dnaGappedSearchSession('ACGTACGTACGTACGT', 'TTTTACGTACGTACGTACGTTTT', {
      thresholdBps: 8000, collectStats: true,
    });
    expect(s.incomplete).toBe(false);
    expect(s.stats.arenaKB).toBeGreaterThan(0);
    expect(s.stats.scoreStates).toBeGreaterThan(0);
    expect(s.stats.retainedLoci).toBeGreaterThan(0);
  });
});
