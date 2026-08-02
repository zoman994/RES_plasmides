/**
 * U2 substep 2 — Dinkelbach convergence is PROVEN, never assumed.
 *
 * DEFECT UNDER TEST (dna-linear-verify.js, refinement loop):
 *
 *     for (let it = 0; it < 16; it++) { ... if (val <= 0) break; }
 *
 * Three separate faults in three lines:
 *   • `val <= 0` treats a NEGATIVE val as convergence. At the Dinkelbach fixed point the optimum
 *     for weights (p,qq) scores exactly 0, and it can never score below 0 — the previous
 *     solution is itself still reachable and scores 0. So `val < 0` is an INVARIANT VIOLATION
 *     (a broken solver), not a converged answer, and must never be silently accepted.
 *   • the cap `16` is a magic number with no derivation, and running out of it does not raise:
 *     the loop simply exits and the unconverged approximation is used as if it were exact.
 *   • nothing measures the refinement work, so exhaustion cannot be reported as a resource
 *     outcome the way every other axis is (§3.3, §4.2.1(8)).
 *
 * CONTRACT: success only at `val === 0`; `val > 0` continues; `val < 0` throws; an exhausted
 * iteration budget is a typed RESOURCE_LIMIT and yields NO occurrence, NO metrics and NO script
 * built from the last approximation.
 *
 * THE THRESHOLD-FEASIBILITY PASS IS NOT CONVERGENCE. Pass 1 maximises the linear proxy at the
 * acceptance threshold; that answers "is this start acceptable at all", not "what is its exact
 * maximum identity". A refinement call proving `val === 0` is always required afterwards, and
 * the inversion fixture below is the proof that the two answers genuinely differ.
 *
 * FIXTURES ARE HARDCODED, FOUND BY A SEPARATE OFFLINE SEARCH (scratchpad/dk/*.mjs), never
 * generated inside the suite.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-dinkelbach.test.js
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';
import { solveStart } from '../dna-linear-verify';

/**
 * FIXTURE A — the fixed-score inversion, found by offline search over 40 000 configurations.
 * At start 3 the threshold-weighted pass 1 settles on M=31, D=8 -> 31/41 = 7560 bps, while the
 * true maximum is M=28, D=4 -> 28/37 = 7567 bps. Pass 1 prefers the LONGER alignment because at
 * a fixed theta the linear score rewards extra matched columns even when they dilute the ratio.
 * Refinement is the only thing that finds the better ratio, so "return the pass-1 result" is
 * observable here as a wrong M, a wrong D, a wrong span and a wrong percentage.
 */
const INVERSION = {
  query: 'ATAGGCTTGAATGATATGAGCAGAGTCCGCGGA',
  target: 'TGGATAGGCGTTTGTATGATTTGAGACAGTAGTCCCCTGCGGCAAAG',
  thresholdBps: 7000,
  expected: { start: 3, targetSpan: 37, M: 28, X: 5, I: 0, D: 4, L: 37, bps: 7567 },
  pass1WouldSay: { M: 31, D: 8, bps: 7560 },
};

/**
 * FIXTURE B — a genuinely multi-step refinement chain: 18/27 -> 16/23 -> 14/20, i.e. THREE
 * refinement calls before `val === 0`. That is enough to exercise the budget mechanism against
 * a real chain rather than a contrived one.
 *
 * ON DEPTH, STATED AS A SAMPLE AND NOT AS A THEOREM. Two independent offline sweeps (~46 000
 * configurations: random ACGT, small alphabets, periodic motifs, homopolymer runs, thresholds
 * 5000..8000) found a MAXIMUM OF 3 refinements; depth histograms were 1->444784 2->47677 3->253
 * and 1->4744 2->1086 3->13. No deeper case was found IN THE SAMPLE SEARCHED — that is not a
 * proof that none exists, and nothing here relies on one. Termination is guaranteed by the
 * derived bound in dna-linear-kernel.js (every val>0 step strictly improves M/(m+D), so no
 * (M,D) pair repeats), not by any observed depth. The sweeps also suggest deeper chains need a
 * starting point worse than the threshold-feasibility pass, which production does not use.
 */
const DEEP = {
  query: 'CAACAACCAAAACAACCAAA',
  target: 'CAAAAACCAAAAACCCCAAAAAAACACCCACCAA',
  thresholdBps: 5000,
  refinementsNeeded: 3,
};

const RESOURCE_LIMIT = 'RESOURCE_LIMIT';

function caught(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

describe('U2 §4.2.1(8) — the pass-1 optimum is not the answer', () => {
  it('the inversion fixture resolves to the MAX-RATIO alignment, not the pass-1 one', () => {
    const got = findOccurrences(INVERSION.query, INVERSION.target, {
      thresholdBps: INVERSION.thresholdBps, bothStrands: false,
    });
    const o = got.find((x) => x.start === INVERSION.expected.start);
    expect(o, 'the inversion locus must be reported').toBeDefined();
    expect({
      start: o.start, targetSpan: o.targetSpan, M: o.M, X: o.X, I: o.I, D: o.D,
      L: o.alignmentLength, bps: o.identityBps,
    }).toEqual(INVERSION.expected);
  });

  it('the pass-1 answer is strictly worse and must not appear', () => {
    const got = findOccurrences(INVERSION.query, INVERSION.target, {
      thresholdBps: INVERSION.thresholdBps, bothStrands: false,
    });
    const o = got.find((x) => x.start === INVERSION.expected.start);
    expect(o.M, 'M=31 means the pass-1 result leaked out').not.toBe(INVERSION.pass1WouldSay.M);
    expect(o.D).not.toBe(INVERSION.pass1WouldSay.D);
    expect(o.identityBps).toBeGreaterThan(INVERSION.pass1WouldSay.bps);
  });

  it('the reported identity is exactly floor(M*10000/L) — no rounding drift', () => {
    const got = findOccurrences(INVERSION.query, INVERSION.target, {
      thresholdBps: INVERSION.thresholdBps, bothStrands: false,
    });
    for (const o of got) {
      expect(o.identityBps, `start ${o.start}`).toBe(Math.floor((o.M * 10000) / o.alignmentLength));
    }
  });
});

describe('U2 §4.2.1(8) — the refinement budget is a measured resource', () => {
  it('a budget below the chain length is a typed RESOURCE_LIMIT, not a rounded answer', () => {
    const e = caught(() => findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false,
      iterationBudget: DEEP.refinementsNeeded - 1,
    }));
    expect(e, 'exhaustion must refuse').not.toBeNull();
    expect(e.code, `expected RESOURCE_LIMIT, got ${e && e.message}`).toBe(RESOURCE_LIMIT);
  });

  it('a budget exactly equal to the chain length succeeds', () => {
    const got = findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false,
      iterationBudget: DEEP.refinementsNeeded,
    });
    const generous = findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false,
      iterationBudget: 1000,
    });
    expect(got.length).toBeGreaterThan(0);
    expect(JSON.stringify(got), 'exact budget must give the exact answer').toBe(JSON.stringify(generous));
  });

  it('exhaustion returns NOTHING — not a partial array, not a last-approximation script', () => {
    let result = 'no-throw';
    try {
      result = findOccurrences(DEEP.query, DEEP.target, {
        thresholdBps: DEEP.thresholdBps, bothStrands: false, iterationBudget: 1,
      });
    } catch (e) {
      expect(e.code).toBe(RESOURCE_LIMIT);
      expect(e.occurrences, 'no partial payload may ride on the error').toBeUndefined();
      expect(e.script, 'no approximated script may ride on the error').toBeUndefined();
      result = null;
    }
    expect(result, 'a starved refinement must not return results').toBeNull();
  });

  it('a budget of 0 refuses immediately and cannot be read as "no refinement needed"', () => {
    const e = caught(() => findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false, iterationBudget: 0,
    }));
    expect(e).not.toBeNull();
    expect(e.code).toBe(RESOURCE_LIMIT);
  });

  it('the default budget is derived, not the magic 16: a 20-mer tolerates far more than 16', () => {
    // The bound is the number of reachable (M,D) pairs — every val>0 step strictly improves the
    // ratio, so no pair can repeat. For this fixture that is orders of magnitude above 16, which
    // is exactly why 16 could never have been justified as a convergence criterion.
    const got = findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false,
    });
    expect(got.length).toBeGreaterThan(0);
    const e = caught(() => findOccurrences(DEEP.query, DEEP.target, {
      thresholdBps: DEEP.thresholdBps, bothStrands: false, iterationBudget: 17,
    }));
    expect(e, 'a budget above the old cap must not be refused').toBeNull();
  });

  it('an invalid iterationBudget is fail-closed like every other quota', () => {
    for (const bad of [NaN, Infinity, -1, 2.5, '3', {}, true]) {
      const e = caught(() => findOccurrences(DEEP.query, DEEP.target, {
        thresholdBps: DEEP.thresholdBps, iterationBudget: bad,
      }));
      expect(e, `iterationBudget ${String(bad)} must be refused`).not.toBeNull();
    }
  });

  it('ordinary searches are unaffected: the default budget never fires on normal input', () => {
    const got = findOccurrences('ACGTACGTACGTACGT', 'TTTTACGTACGTACGTACGTTTTT', { thresholdBps: 8000 });
    expect(got.length).toBeGreaterThan(0);
  });
});

/**
 * A NEGATIVE `val` IS A BROKEN SOLVER, NOT A CONVERGED ANSWER.
 *
 * Against a correct solver `val < 0` is unreachable: the previous optimum stays reachable and
 * scores exactly 0, so the maximum is never negative. That is precisely why input-driven tests
 * cannot separate `val <= 0` from `val === 0` — the difference only shows when the solver itself
 * misbehaves. `solveStart` already takes the solver as its first argument, so the seam needed to
 * prove it is a fake solver, not new production code.
 *
 * Scripted run with m = 4: pass 1 yields M=4,D=0 -> p=4, qq=m+D=4. The refinement call then
 * yields M=3,D=0, so val = qq*M - p*(m+D) = 4*3 - 4*4 = -4. Correct code refuses; the `val <= 0`
 * mutant reads -4 as convergence and assembles a plausible occurrence (M=3, L=4, 7500 bps) out
 * of a solver that just contradicted itself.
 */
function scriptedSolver(steps) {
  let call = 0;
  const T = 4;
  const solver = {
    endM: new Int32Array(16),
    endD: new Int32Array(16),
    endG: new Int32Array(16),
    endOk: new Uint8Array(16),
    prefix() {
      const step = steps[Math.min(call, steps.length - 1)];
      call += 1;
      solver.endOk.fill(0);
      solver.endM[T] = step.M; solver.endD[T] = step.D; solver.endG[T] = 0; solver.endOk[T] = 1;
      return T;
    },
    traceback() { return '===='; },
  };
  return solver;
}

describe('U2 §4.2.1(8) — a negative val is refused, not laundered into a result', () => {
  const q = Uint8Array.from([0, 1, 2, 3]);        // ACGT, m = 4
  const ext = Uint8Array.from([0, 1, 2, 3]);

  it('val = -4 raises "dinkelbach invariant violated"', () => {
    const solver = scriptedSolver([{ M: 4, D: 0 }, { M: 3, D: 0 }]);
    let err = null;
    try {
      solveStart(solver, q, ext, ext.length, 0, 4, 5000, ext.length, false, '+', 10);
    } catch (e) { err = e; }
    expect(err, 'a self-contradicting solver must be refused').not.toBeNull();
    expect(err.message).toContain('dinkelbach invariant violated');
    expect(err.code, 'this is an invariant break, not a resource outcome').not.toBe(RESOURCE_LIMIT);
  });

  it('the same scripted solver converging normally still returns an occurrence', () => {
    // Control: identical harness, but the refinement agrees with pass 1 (val === 0). If this
    // failed, the test above would prove nothing about the sign of val.
    const solver = scriptedSolver([{ M: 4, D: 0 }, { M: 4, D: 0 }]);
    const occ = solveStart(solver, q, ext, ext.length, 0, 4, 5000, ext.length, false, '+', 10);
    expect(occ).not.toBeNull();
    expect(occ.M).toBe(4);
    expect(occ.alignmentLength).toBe(4);
  });
});
