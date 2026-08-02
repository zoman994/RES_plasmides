/**
 * Gate U4 · Proof 3 — telemetry audit of the §4.2.1 linear/Dinkelbach kernel.
 *
 * The five §4.2.1 pipeline counters live on the NEW linear kernel's existing measurement seam
 * (`opts.telemetry`, published in `makeControl().finish()` under a `finally`), NOT on the old
 * `dnaGappedSearchSession`. This pins that each is charged at its own stage, that the funnel is
 * monotone, and that they are ALWAYS published — including a clean zero, a cancel, and a
 * `RESOURCE_LIMIT` — while staying a separate structure that never reaches the occurrence / DOM.
 *
 *   candidateEnds  — every scanner END (before plateau/run grouping);
 *   rawStarts      — every admissible window start (before the `recent` dedup);
 *   verifiedStarts — every UNIQUE admissible start actually sent to solveStart;
 *   retainedLoci   — §3.2.1 survivors, summed across strands;
 *   tracebacksMaterialized — every real `solver.traceback` (rule-7 tie-breaks included).
 *
 * Work is the four resource axes (`scanUsed/verifierUsed/tracebackUsed/outputUsed`); allocated
 * bytes is `workspaceHighWaterBytes`. The kernel is EXPERIMENTAL / not wired to production — this
 * audits its instrument, exactly the seam a future default-switch (U6) would rely on.
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences, SEARCH_ABORT } from '../dna-linear-kernel';

const isNonNegInt = (v) => Number.isSafeInteger(v) && v >= 0;
const FIVE = ['candidateEnds', 'rawStarts', 'verifiedStarts', 'retainedLoci', 'tracebacksMaterialized'];
const WORK = ['scanUsed', 'verifierUsed', 'tracebackUsed', 'outputUsed'];

describe('Gate U4 · linear-kernel telemetry audit', () => {
  it('a real search charges every §4.2.1 counter and a monotone funnel', () => {
    const t = {};
    const occ = findOccurrences('GAATTCACGTAC', 'AAAAGAATTCACGTACAAAA', { thresholdBps: 8000, telemetry: t });
    expect(occ.length).toBeGreaterThan(0);

    for (const k of FIVE) expect(isNonNegInt(t[k]), `${k} is a non-negative integer`).toBe(true);
    for (const k of WORK) expect(isNonNegInt(t[k]), `${k} (work) present`).toBe(true);
    expect(isNonNegInt(t.workspaceHighWaterBytes), 'allocated bytes present').toBe(true);
    expect(t.workspaceHighWaterBytes, 'a real search allocated a workspace').toBeGreaterThan(0);

    // The funnel narrows: dedup reduces raw→verified, pruning reduces verified→retained, and every
    // retained locus has a materialised traceback (which is itself ≤ the verified starts).
    expect(t.candidateEnds).toBeGreaterThan(0);
    expect(t.rawStarts).toBeGreaterThanOrEqual(t.verifiedStarts);
    expect(t.verifiedStarts).toBeGreaterThanOrEqual(t.retainedLoci);
    expect(t.tracebacksMaterialized).toBeGreaterThanOrEqual(t.retainedLoci);
    expect(t.tracebacksMaterialized).toBeLessThanOrEqual(t.verifiedStarts);
    expect(t.retainedLoci).toBe(occ.length); // survivors == emitted occurrences
  });

  it('the counters are a SEPARATE structure — never on the occurrence', () => {
    const t = {};
    const [o] = findOccurrences('GAATTCACGTAC', 'AAAAGAATTCACGTACAAAA', { thresholdBps: 8000, telemetry: t });
    for (const k of [...FIVE, ...WORK, 'workspaceHighWaterBytes']) {
      expect(o[k], `occurrence must not carry ${k}`).toBeUndefined();
    }
  });

  it('an honest miss publishes every counter as ZERO', () => {
    const t = {};
    const occ = findOccurrences('GAATTCACGTAC', 'TTTTTTTTTTTTTTTTTTTT', { thresholdBps: 10000, telemetry: t });
    expect(occ).toEqual([]);
    for (const k of FIVE) expect(t[k], `${k} published as 0 on a miss`).toBe(0);
    expect(t.limitedAxis).toBeNull();
  });

  it('a CANCEL still publishes the counters (finally), and is not a resource limit', () => {
    const t = {};
    let code = null;
    try {
      findOccurrences('GAATTCACGTAC', 'AAAAGAATTCACGTAC'.repeat(80), { thresholdBps: 8000, telemetry: t, shouldCancel: () => true });
    } catch (e) { code = e.code; }
    expect(code).toBe(SEARCH_ABORT);
    for (const k of FIVE) expect(isNonNegInt(t[k]), `${k} published on cancel`).toBe(true);
    expect(t.limitedAxis, 'a cancel is not a resource limit').toBeNull();
  });

  it.each(['scan', 'verifier', 'output'])('a RESOURCE_LIMIT on the %s axis still publishes the counters', (axis) => {
    const t = {};
    let code = null;
    try {
      findOccurrences('GAATTCACGTAC', 'AAAAGAATTCACGTAC'.repeat(20), { thresholdBps: 8000, telemetry: t, budgets: { [axis]: 1 } });
    } catch (e) { code = e.code; }
    expect(code).toBe('RESOURCE_LIMIT');
    expect(t.limitedAxis).toBe(axis);
    for (const k of FIVE) expect(isNonNegInt(t[k]), `${k} published under a ${axis} limit`).toBe(true);
  });
});
