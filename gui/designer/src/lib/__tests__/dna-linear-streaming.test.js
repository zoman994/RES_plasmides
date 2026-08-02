/**
 * U2 substep 3 — plateau grouping stays lossless while the workspace stops scaling with the
 * target, and cancellation becomes a distinct outcome.
 *
 * THREE DEFECTS UNDER TEST, all about O(target) state rather than about answers.
 *
 * (1) THE SCAN MATERIALISES EVERY CANDIDATE END. `MyersScanner.scan` builds `ends[]` and returns
 *     it. On a low-complexity target — a poly-A stretch, a tandem repeat, a shared backbone —
 *     nearly every position qualifies, so that array is O(target) and is fully built BEFORE any
 *     verification decides it was mostly worthless.
 * (2) THE ORCHESTRATOR KEEPS TWO MORE O(target) STRUCTURES: `seen = new Uint8Array(n)` as a
 *     dedup bitmap and `starts[]` as a complete list, both sized by the molecule rather than by
 *     the work actually in flight.
 * (3) NOTHING CAN BE CANCELLED, and there is no way to tell "the user moved on" apart from "the
 *     engine ran out of budget". §3.3 keeps those separate: a resource refusal is a property of
 *     the input, an abort is a property of the session.
 *
 * WHAT MUST NOT CHANGE: grouping is still only a unit of shared DP work. The plateau
 * counterexample AAAACCCC / AAAACCCCC must keep BOTH endpoints (8 and 9), and every coordinate
 * and counter must be byte-identical to the pre-streaming engine. Streaming is a memory
 * property; it is not allowed to become an answer property.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-streaming.test.js
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';

const SEARCH_ABORT = 'SEARCH_ABORT';
const RESOURCE_LIMIT = 'RESOURCE_LIMIT';

function caught(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

/** Deterministic low-complexity target: the pathological case for candidate-end volume. */
const polyA = (n) => 'A'.repeat(n);

describe('U2 §4.2.1(7) — plateau grouping is still lossless', () => {
  it('AAAACCCC in AAAACCCCC keeps BOTH endpoints under streaming', () => {
    const got = findOccurrences('AAAACCCC', 'AAAACCCCC', { thresholdBps: 8000, bothStrands: false });
    const shape = got.map((o) => `${o.start}..${o.end}:${o.identityBps}`).sort();
    expect(shape).toEqual(['0..8:10000', '1..9:8750']);
  });

  it('CHUNK SEAM: starts are complete and unique across the boundary', () => {
    // The dedup window may only forget a start once NO later chunk can propose it again. The
    // next chunk begins at `a + step` and reaches back `maxSpan`, so the earliest start it can
    // still emit is `a + step - maxSpan` — which is BELOW `chunkEnd - maxSpan` whenever
    // maxSpan > 1. Evicting at the later of the two drops entries the next window re-proposes,
    // and the same locus comes out twice.
    //
    // A^1100 with query AA at 100% crosses exactly one seam (chunk 1024, step 1022) and has a
    // known closed-form answer: every position 0..1098 starts a perfect AA.
    const got = findOccurrences('AA', polyA(1100), { thresholdBps: 10000, bothStrands: false });
    const starts = got.map((o) => o.start);
    expect(starts.length, 'one occurrence per start, no duplicates').toBe(new Set(starts).size);
    expect(starts.length).toBe(1099);
    expect(starts[0]).toBe(0);
    expect(starts[starts.length - 1]).toBe(1098);
    expect(starts, 'starts must be the exact contiguous run')
      .toEqual(Array.from({ length: 1099 }, (_, i) => i));
  });

  it('CHUNK SEAM: the same holds across several seams', () => {
    const got = findOccurrences('AA', polyA(4096), { thresholdBps: 10000, bothStrands: false });
    const starts = got.map((o) => o.start);
    expect(starts.length).toBe(new Set(starts).size);
    expect(starts.length).toBe(4095);   // s ranges 0..n-2
  });

  it('a long homopolymer keeps every distinct start, not one per valley', () => {
    // AA in AAAA yields starts 0,1,2 (endpoints 2,3,4). Extending the run must extend the
    // answer, not collapse it — collapsing here is exactly the forbidden reduction.
    const got = findOccurrences('AA', polyA(6), { thresholdBps: 10000, bothStrands: false });
    expect(got.map((o) => o.start)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('U2 §4.2.1(10) — the workspace does not scale with the target', () => {
  it('telemetry reports inputBytes and workspaceHighWaterBytes separately', () => {
    const telemetry = {};
    findOccurrences('ACGTACGT', polyA(4096), { thresholdBps: 8000, bothStrands: false, telemetry });
    expect(typeof telemetry.inputBytes, 'inputBytes must be reported').toBe('number');
    expect(typeof telemetry.workspaceHighWaterBytes, 'workspace peak must be reported').toBe('number');
    expect(telemetry.inputBytes).toBeGreaterThan(0);
    expect(telemetry.workspaceHighWaterBytes).toBeGreaterThan(0);
    expect(telemetry.workspaceHighWaterBytes, 'workspace must not be conflated with input')
      .not.toBe(telemetry.inputBytes);
  });

  it('a 16x longer low-complexity target does not multiply the workspace', () => {
    const small = {};
    const large = {};
    findOccurrences('ACGTACGT', polyA(4096), { thresholdBps: 5000, bothStrands: false, telemetry: small });
    findOccurrences('ACGTACGT', polyA(65536), { thresholdBps: 5000, bothStrands: false, telemetry: large });
    expect(large.inputBytes / small.inputBytes, 'the INPUT did grow 16x').toBeGreaterThan(8);
    // The workspace is allowed to differ, but not to track the molecule. A streaming engine
    // holds the current run plus a bounded dedup window; a materialising one holds the target.
    const growth = large.workspaceHighWaterBytes / small.workspaceHighWaterBytes;
    expect(growth, `workspace grew ${growth.toFixed(1)}x for a 16x target`).toBeLessThan(2);
  });

  it('the same is true when nearly every position is a candidate', () => {
    // Budgets are explicitly unbounded here: the subject under test is the WORKSPACE, and the
    // default quotas are calibrated for the production engine's coarser accounting. Leaving them
    // in would make this assertion fail for a reason that has nothing to do with memory.
    // Poly-A against poly-A is the worst case for VOLUME: every position is an accepted start,
    // so the engine genuinely runs one solve per base. The corpus is kept modest for that
    // reason — the claim under test is about the workspace, and paying 65k solves to restate it
    // would only buy a timeout. Input still grows 8x, which is what the assertion reads.
    const small = {};
    const large = {};
    findOccurrences(polyA(12), polyA(1024), { thresholdBps: 5000, bothStrands: false, budgets: { scan: null, verifier: null, traceback: null, output: null }, telemetry: small });
    findOccurrences(polyA(12), polyA(8192), { thresholdBps: 5000, bothStrands: false, budgets: { scan: null, verifier: null, traceback: null, output: null }, telemetry: large });
    expect(large.inputBytes / small.inputBytes, 'the INPUT did grow 8x').toBeGreaterThan(4);
    const growth = large.workspaceHighWaterBytes / small.workspaceHighWaterBytes;
    expect(growth, `workspace grew ${growth.toFixed(1)}x on an all-candidate target`).toBeLessThan(2);
  });
});

describe('U2 §3.3 — the four existing axes govern the linear kernel too', () => {
  const q = 'ACGTACGTACGT';
  const t = `TTTT${q}TTTT`;

  // POSITIVE BOUNDS, NOT ZERO. A budget of 0 only proves "the gate is wired"; it fires before
  // any work is measured, so it cannot tell proportional accounting from a counter stuck at 1.
  // Each case below first MEASURES the axis on a generous run, then sets the quota strictly
  // between 0 and that measurement — the refusal can then only come from accounting that
  // actually tracks the work.
  const measure = () => {
    const telemetry = {};
    findOccurrences(q, t, { thresholdBps: 8000, bothStrands: false, telemetry });
    return telemetry;
  };

  it.each([['scan'], ['verifier'], ['traceback'], ['output']])('a %s quota below measured usage refuses, naming that axis', (axis) => {
    const used = measure()[`${axis}Used`];
    expect(used, `${axis}: the axis must record real work before it can be bounded`).toBeGreaterThan(1);
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false, budgets: { [axis]: Math.floor(used / 2) },
    }));
    expect(e, `${axis}: a quota of ${Math.floor(used / 2)} against ${used} used must refuse`).not.toBeNull();
    expect(e.code).toBe(RESOURCE_LIMIT);
    expect(e.axis).toBe(axis);
  });

  it.each([['scan'], ['verifier'], ['traceback'], ['output']])('a %s quota at measured usage completes', (axis) => {
    const used = measure()[`${axis}Used`];
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false, budgets: { [axis]: used },
    }));
    expect(e, `${axis}: exactly enough must not refuse`).toBeNull();
  });

  it('the axes are proportional: a harder target charges strictly more verifier work', () => {
    const easy = {};
    const hard = {};
    findOccurrences(q, t, { thresholdBps: 8000, bothStrands: false, telemetry: easy });
    findOccurrences(q, `${t}${t}${t}${t}`, { thresholdBps: 8000, bothStrands: false, telemetry: hard });
    expect(hard.verifierUsed, 'four loci must cost more verifier work than one')
      .toBeGreaterThan(easy.verifierUsed);
    expect(hard.outputUsed).toBeGreaterThan(easy.outputUsed);
  });

  it('telemetry survives a refusal: the numbers that explain the limit are still published', () => {
    const telemetry = {};
    const used = measure().verifierUsed;
    caught(() => findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false, telemetry, budgets: { verifier: Math.floor(used / 2) },
    }));
    expect(telemetry.limitedAxis, 'the failing axis must be reported').toBe('verifier');
    expect(telemetry.verifierUsed, 'usage at the moment of refusal must be reported').toBeGreaterThan(0);
    expect(telemetry.inputBytes).toBeGreaterThan(0);
  });

  it('no single dimensionless budget is reintroduced', () => {
    const usedV = measure().verifierUsed;
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false,
      budgets: { scan: 10_000_000, verifier: Math.floor(usedV / 2) },
    }));
    expect(e.axis, 'a generous scan must not rescue a starved verifier').toBe('verifier');
  });

  it('exhaustion yields no occurrences at all, not a partial list', () => {
    const used = measure().verifierUsed;
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false, budgets: { verifier: Math.floor(used / 2) },
    }));
    expect(e.occurrences, 'no partial payload may ride on the refusal').toBeUndefined();
  });

  it('a generous budget behaves exactly as an unbudgeted call', () => {
    const a = findOccurrences(q, t, { thresholdBps: 8000, bothStrands: false });
    const b = findOccurrences(q, t, {
      thresholdBps: 8000, bothStrands: false,
      budgets: { scan: 10_000_000, verifier: 10_000_000, traceback: 10_000_000, output: 10_000_000 },
    });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('U2 §4.2.1(10) — cancellation is its own outcome', () => {
  const q = 'ACGTACGTACGT';
  const t = polyA(20000) + q + polyA(20000);

  it('a cancel checkpoint raises SEARCH_ABORT, never RESOURCE_LIMIT', () => {
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 5000, bothStrands: false, shouldCancel: () => true,
    }));
    expect(e, 'cancellation must stop the search').not.toBeNull();
    expect(e.code).toBe(SEARCH_ABORT);
    expect(e.code, 'an abort is a session fact, a resource limit is an input fact')
      .not.toBe(RESOURCE_LIMIT);
  });

  it('an aborted search returns no partial occurrences', () => {
    const e = caught(() => findOccurrences(q, t, {
      thresholdBps: 5000, bothStrands: false, shouldCancel: () => true,
    }));
    expect(e.occurrences).toBeUndefined();
  });

  it('the checkpoint is deterministic: cancelling after N checks always stops at N', () => {
    let seen = 0;
    const runTo = (limit) => {
      seen = 0;
      return caught(() => findOccurrences(q, t, {
        thresholdBps: 5000, bothStrands: false, shouldCancel: () => (++seen > limit),
      }));
    };
    const first = runTo(3);
    const firstSeen = seen;                     // captured BEFORE the second run overwrites it
    const second = runTo(3);
    const secondSeen = seen;
    expect(first.code).toBe(SEARCH_ABORT);
    expect(second.code).toBe(SEARCH_ABORT);
    expect(secondSeen, 'the same limit must consume the same number of checks').toBe(firstSeen);
  });

  it('a checkpoint that never cancels leaves the answer untouched', () => {
    let checks = 0;
    const withHook = findOccurrences(q, t, {
      thresholdBps: 5000, bothStrands: false, shouldCancel: () => { checks += 1; return false; },
    });
    const plain = findOccurrences(q, t, { thresholdBps: 5000, bothStrands: false });
    expect(checks, 'the checkpoint must actually be reached').toBeGreaterThan(0);
    expect(JSON.stringify(withHook)).toBe(JSON.stringify(plain));
  });
});
