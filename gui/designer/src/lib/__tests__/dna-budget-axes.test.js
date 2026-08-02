/**
 * U1 — RED spec for SEPARATED RESOURCE BUDGET AXES (SPEC_GAPPED_DNA_SEARCH §3.3, U1).
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 * Today `dna-gapped-search.js` has ONE counter (`meter.states`, budget `DEFAULT_STATE_BUDGET =
 * 4_000_000`) that is incremented from two utterly different places:
 *   • `dna-approx-scan.js:110` — once per SCANNED TEXT POSITION (linear in target length, and
 *     paid TWICE when `bothStrands:true`);
 *   • `dna-gapped-align.js:247` — once per ACCEPTED DP STATE.
 * Scan work therefore EATS the verifier's budget. A perfectly ordinary interactive query — a
 * valid 100 nt probe at 80 % identity over a ~1 Mb molecule, both strands — spends ~2·10^6 of the
 * shared 4·10^6 ceiling on scanning alone before a single alignment state is accepted, and the
 * session bails with a typed `RESOURCE_LIMIT` even though the locus is right there and exact.
 * That is a FALSE resource failure: the UI reports "the search did not run" about a search that
 * was never actually expensive.
 *
 * Raising the shared ceiling is explicitly NOT the fix (it hides the coupling instead of removing
 * it). The fix is four INDEPENDENT axes, each with its own quota, its own counter, and its own
 * name in the telemetry.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CONTRACT THESE TESTS DEMAND  (all of this is what U1 must implement)
 * ---------------------------------------------------------------------------------------------
 * 1. OPTIONS — a new nested option object on `dnaGappedSearchSession`:
 *
 *      opts.budgets = {
 *        scan:      number | null,   // axis SCAN      — text positions visited by the Myers scan
 *        verifier:  number | null,   // axis VERIFIER  — DP states accepted into the frontier
 *        traceback: number | null,   // axis TRACEBACK — parent links walked while materialising
 *        output:    number | null,   // axis OUTPUT    — occurrences materialised for emission
 *      }
 *
 *    `null` = unbounded on that axis. An omitted key = engine default for that axis. Each axis has
 *    its OWN default; no axis may consume another's remaining quota. Legacy `opts.stateBudget`
 *    must keep working (it is asserted elsewhere, in dna-gapped-search-k2.test.js and
 *    dna-threshold-bound.test.js) — U1 may map it onto the axes, but must not delete it.
 *
 *    `budgets.output` is a RESOURCE CEILING, categorically different from `opts.limit`: `limit`
 *    truncates a completed ranking and the session stays `complete`; blowing `budgets.output`
 *    means the engine could not finish enumerating and MUST bail typed + incomplete + empty.
 *
 * 2. FAILURE SHAPE — identical on every axis (§3.3): `reason === RESOURCE_LIMIT`,
 *    `incomplete === true`, `occurrences === []`. No partial selectable hit, no silent zero.
 *
 * 3. AXIS ATTRIBUTION — the session must NAME the axis that ran out:
 *
 *      session.limitedAxis === 'scan' | 'verifier' | 'traceback' | 'output' | null
 *
 *    and it must be the axis that was actually squeezed. Today a `RESOURCE_LIMIT` is anonymous:
 *    `statsOf` does not even publish `meter.states`, so nobody downstream can tell scan blow-up
 *    from verifier blow-up.
 *
 * 4. TELEMETRY (under `collectStats:true`) — aggregated over BOTH strands and the circular
 *    overlay, one entry per axis:
 *
 *      stats.budgets = {
 *        scan:      { used: number, budget: number | null },
 *        verifier:  { used: number, budget: number | null },
 *        traceback: { used: number, budget: number | null },
 *        output:    { used: number, budget: number | null },
 *      }
 *      stats.limitedAxis = same value as session.limitedAxis
 *
 *    Per-strand quotas are allowed internally; what is published is the AGGREGATE.
 *
 * 5. SCRATCH — the align arena is REUSED sequentially across the `+` and `−` passes, not
 *    allocated twice (`strandPass` currently builds a fresh `createAlignScratch()` per strand,
 *    so the `−` pass throws away the whole warmed arena and re-grows it). Observable as:
 *
 *      stats.scratchBytesAllocated = number   // CUMULATIVE bytes ever allocated for the align
 *                                            // arena during the session
 *
 *    Existing `arenaKB` cannot express this: it is a `Math.max`, i.e. a PEAK, so a doubled
 *    allocation is invisible in it by construction. `process.memoryUsage()` is not admissible
 *    either (non-deterministic). Hence a published cumulative counter.
 *
 * ---------------------------------------------------------------------------------------------
 * RULES OBEYED HERE
 * ---------------------------------------------------------------------------------------------
 * • NO wall-clock in any assertion (§4.3). Every assert is on a deterministic counter or on the
 *   session shape. `it(..., timeout)` is a harness guard, not an assertion.
 * • Corpora are built with the project's established fixed-seed LCG (same helper as
 *   dna-gapped-search-bench.test.js / dna-gapped-telemetry.test.js), so every run is identical.
 * • The experimental linear kernel is NOT touched, imported or referenced.
 */
import {
  describe, it, expect, beforeAll,
} from 'vitest';
import { dnaGappedSearchSession, RESOURCE_LIMIT } from '../dna-gapped-search';

// ── deterministic corpus (project-standard LCG; identical helper to the bench/telemetry files) ──
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function randDna(rnd, len) {
  const B = 'ACGT';
  const a = new Array(len);
  for (let i = 0; i < len; i++) a[i] = B[(rnd() * 4) | 0];
  return a.join('');
}

const BIG_N = 1_000_000;
const IMPLANT_AT = 500_000;
const Q_LEN = 100;

/** ~1 Mb background with an EXACT 100-mer implanted at a fixed offset. Built once. */
const big = { target: '', query: '' };
beforeAll(() => {
  const rnd = lcg(0x51A17E5);
  const bg = randDna(rnd, BIG_N);
  const probe = bg.slice(IMPLANT_AT, IMPLANT_AT + Q_LEN);
  big.target = bg;
  big.query = probe;
  expect(big.query).toMatch(/^[ACGT]{100}$/);
  expect(big.target.length).toBe(BIG_N);
}, 120_000);

/** A mid-size ordinary target: big enough that scan work is real, small enough to stay fast. */
function midCorpus(seed = 0xC0FFEE, n = 200_000, qLen = 120) {
  const rnd = lcg(seed);
  const bg = randDna(rnd, n);
  const at = Math.floor(n / 2);
  return { target: bg, query: bg.slice(at, at + qLen), implantAt: at };
}

/** Tandem repeat: one 20-mer unit, many exact loci — the natural stress for the OUTPUT axis. */
function repeatCorpus(copies = 200) {
  const unit = 'ACGTTGCAAGGCTTACCGAT'; // 20 nt, non-degenerate
  return { unit, target: unit.repeat(copies) };
}

/**
 * A generous-but-finite declaration on EVERY axis. Used as the CONTROL arm of each injection
 * test: with these quotas the search must complete, so when exactly one axis is then shrunk the
 * resulting bail is attributable to that axis and nothing else. (Deliberately finite rather than
 * `null` — an unbounded control would be both slower and a weaker statement.)
 */
const GENEROUS = {
  scan: 10_000_000, verifier: 10_000_000, traceback: 10_000_000, output: 10_000,
};

/** The §3.3 bail shape, asserted the same way on every axis. */
function expectTypedBail(session, axis) {
  expect(session.incomplete, 'session must be incomplete').toBe(true);
  expect(session.reason, 'typed reason').toBe(RESOURCE_LIMIT);
  expect(session.occurrences, 'no partial selectable result').toEqual([]);
  expect(Array.isArray(session.occurrences)).toBe(true);
  expect(session.limitedAxis, `axis that ran out must name itself as "${axis}"`).toBe(axis);
}

describe('U1 §3.3 — the four resource axes are independent', () => {
  // -------------------------------------------------------------------------------------------
  // 1. THE HEADLINE DEFECT
  // -------------------------------------------------------------------------------------------
  it('an ordinary q100 @80% over ~1 Mb, BOTH strands, default budget → complete WITH a hit', () => {
    const s = dnaGappedSearchSession(big.query, big.target, {
      thresholdBps: 8000,
      bothStrands: true,
      collectStats: true,
    });

    // The whole point: this must NOT be a resource failure. Scanning the second strand is
    // ordinary, expected work — it must not consume the verifier's quota.
    expect(s.reason, 'must not be a resource failure').not.toBe(RESOURCE_LIMIT);
    expect(s.incomplete, 'session must complete').toBe(false);
    expect(s.limitedAxis ?? null, 'no axis was exhausted').toBeNull();

    // ...and it must actually answer: the implanted locus is EXACT, so identity is 1 by counting,
    // not by timing.
    const hit = s.occurrences.find((h) => h.start === IMPLANT_AT);
    expect(hit, `exact implant at ${IMPLANT_AT} must be reported`).toBeTruthy();
    expect(hit.metrics.identity).toBe(1);
    expect(hit.metrics.exactMatches).toBe(Q_LEN);
    expect(hit.metrics.alignmentLength).toBe(Q_LEN);
    expect(hit.metrics.editDistance).toBe(0);

    // Deterministic evidence that the run was in fact cheap on the axis that matters: the
    // verifier spent far less than its own quota. (Counts only — never milliseconds.)
    const b = s.stats.budgets;
    expect(b.scan.used, 'both strands are scanned').toBeGreaterThanOrEqual(2 * BIG_N);
    expect(b.verifier.used, 'verifier work is modest for a 100 nt probe').toBeLessThan(b.verifier.budget ?? Infinity);
  }, 300_000);

  // -------------------------------------------------------------------------------------------
  // 2–5. EACH AXIS PROVEN SEPARATELY BY A SMALL INJECTION
  // -------------------------------------------------------------------------------------------
  it('axis SCAN: a tiny scan quota alone → typed RESOURCE_LIMIT, incomplete, no partial hits', () => {
    const { target, query, implantAt } = midCorpus();
    // CONTROL — with every axis generous this exact search completes and answers.
    const ok = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000, collectStats: true, budgets: { ...GENEROUS },
    });
    expect(ok.incomplete, 'control: generous quotas must complete').toBe(false);
    expect(ok.occurrences.some((h) => h.start === implantAt)).toBe(true);

    const s = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000,
      collectStats: true,
      budgets: { ...GENEROUS, scan: 5_000 },
    });
    expectTypedBail(s, 'scan');
    expect(s.stats.limitedAxis).toBe('scan');
    expect(s.stats.budgets.scan.budget).toBe(5_000);
    // The scan axis stopped AT its own ceiling — it did not silently overrun into another quota.
    expect(s.stats.budgets.scan.used).toBeGreaterThan(5_000 - 1);
    expect(s.stats.budgets.scan.used).toBeLessThanOrEqual(5_000 + 1);
  }, 120_000);

  it('axis VERIFIER: a tiny verifier quota alone → typed RESOURCE_LIMIT, incomplete, no partial hits', () => {
    const { target, query, implantAt } = midCorpus();
    const ok = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000, collectStats: true, budgets: { ...GENEROUS },
    });
    expect(ok.incomplete, 'control: generous quotas must complete').toBe(false);
    expect(ok.occurrences.some((h) => h.start === implantAt)).toBe(true);

    const s = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000,
      collectStats: true,
      budgets: { ...GENEROUS, verifier: 5_000 },
    });
    expectTypedBail(s, 'verifier');
    expect(s.stats.limitedAxis).toBe('verifier');
    expect(s.stats.budgets.verifier.budget).toBe(5_000);
    // Scan was unbounded here, so a full pass happened; that must NOT be charged to the verifier.
    expect(s.stats.budgets.scan.used).toBeGreaterThan(5_000);
    expect(s.stats.budgets.verifier.used).toBeLessThanOrEqual(5_000 + 1);
  }, 120_000);

  it('axis TRACEBACK: a tiny traceback quota alone → typed RESOURCE_LIMIT, incomplete, no partial hits', () => {
    const { target, query, implantAt } = midCorpus();
    const ok = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000, collectStats: true, budgets: { ...GENEROUS },
    });
    expect(ok.incomplete, 'control: generous quotas must complete').toBe(false);
    expect(ok.occurrences.some((h) => h.start === implantAt)).toBe(true);

    const s = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000,
      collectStats: true,
      budgets: { ...GENEROUS, traceback: 50 },
    });
    expectTypedBail(s, 'traceback');
    expect(s.stats.limitedAxis).toBe('traceback');
    expect(s.stats.budgets.traceback.budget).toBe(50);
    // Scan and verifier ran freely and are accounted separately — traceback is what ran out.
    expect(s.stats.budgets.scan.used).toBeGreaterThan(50);
    expect(s.stats.budgets.verifier.used).toBeGreaterThan(50);
    expect(s.stats.budgets.traceback.used).toBeLessThanOrEqual(50 + 1);
  }, 120_000);

  it('axis OUTPUT: a tiny output quota alone → typed RESOURCE_LIMIT, incomplete, no partial hits', () => {
    const { unit, target } = repeatCorpus(200); // ~200 exact loci
    // Sanity: without an output ceiling this query genuinely produces many results, so the
    // injection below is squeezing something real rather than an empty set.
    const free = dnaGappedSearchSession(unit, target, {
      thresholdBps: 9000, collectStats: true, budgets: { ...GENEROUS },
    });
    expect(free.incomplete, 'control: generous quotas must complete').toBe(false);
    expect(free.occurrences.length).toBeGreaterThan(50);

    const s = dnaGappedSearchSession(unit, target, {
      thresholdBps: 9000,
      collectStats: true,
      budgets: { ...GENEROUS, output: 3 },
    });
    expectTypedBail(s, 'output');
    expect(s.stats.limitedAxis).toBe('output');
    expect(s.stats.budgets.output.budget).toBe(3);
    // Crucially NOT `limit`: a truncating cap would have returned 3 rows and stayed complete.
    expect(s.occurrences.length).toBe(0);
  }, 120_000);

  // -------------------------------------------------------------------------------------------
  // 6. INDEPENDENCE — the squeezed axis is the axis that fires
  // -------------------------------------------------------------------------------------------
  it('generous verifier + tiny scan fails on SCAN; tiny verifier + generous scan fails on VERIFIER', () => {
    const { target, query, implantAt } = midCorpus(0xBEEF11, 200_000, 120);
    const ok = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000, collectStats: true, budgets: { ...GENEROUS },
    });
    expect(ok.incomplete, 'control: generous quotas must complete').toBe(false);
    expect(ok.occurrences.some((h) => h.start === implantAt)).toBe(true);

    const scanSqueezed = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000,
      collectStats: true,
      budgets: { ...GENEROUS, scan: 2_000, verifier: 50_000_000 },
    });
    expectTypedBail(scanSqueezed, 'scan');
    expect(scanSqueezed.stats.budgets.scan.used).toBeLessThanOrEqual(2_000 + 1);
    // A generous verifier quota must be left largely UNSPENT — proof it was not drained by scan.
    expect(scanSqueezed.stats.budgets.verifier.used).toBeLessThan(50_000_000);

    const verifierSqueezed = dnaGappedSearchSession(query, target, {
      thresholdBps: 8000,
      collectStats: true,
      budgets: { ...GENEROUS, scan: 50_000_000, verifier: 2_000 },
    });
    expectTypedBail(verifierSqueezed, 'verifier');
    expect(verifierSqueezed.stats.budgets.verifier.used).toBeLessThanOrEqual(2_000 + 1);
    // Scan burned FAR more than the verifier's whole quota and still did not trip the verifier.
    expect(verifierSqueezed.stats.budgets.scan.used).toBeGreaterThan(2_000);

    // The two runs failed for genuinely different reasons.
    expect(scanSqueezed.limitedAxis).not.toBe(verifierSqueezed.limitedAxis);
  }, 240_000);

  // -------------------------------------------------------------------------------------------
  // 7. ONE STRAND vs BOTH — same semantics; more scan work, NOT more verifier work
  // -------------------------------------------------------------------------------------------
  it('bothStrands costs more SCAN but does not steal VERIFIER budget (aggregated telemetry)', () => {
    const common = { thresholdBps: 8000, collectStats: true };
    const one = dnaGappedSearchSession(big.query, big.target, { ...common, bothStrands: false });
    const two = dnaGappedSearchSession(big.query, big.target, { ...common, bothStrands: true });

    // Same semantics: both complete, both report the exact implant.
    expect(one.incomplete, 'single strand completes').toBe(false);
    expect(two.incomplete, 'both strands complete').toBe(false);
    expect(one.occurrences.some((h) => h.start === IMPLANT_AT)).toBe(true);
    expect(two.occurrences.some((h) => h.start === IMPLANT_AT)).toBe(true);

    const b1 = one.stats.budgets;
    const b2 = two.stats.budgets;

    // SCAN legitimately roughly doubles — the reverse-complement probe is a second full pass.
    expect(b2.scan.used, 'both strands scan more').toBeGreaterThan(b1.scan.used);
    expect(b2.scan.used, 'and not more than ~twice, plus the circular overlay allowance')
      .toBeLessThanOrEqual((2 * b1.scan.used) + Q_LEN);

    // VERIFIER must NOT inherit the second strand's scan cost. The `−` pass on random background
    // yields essentially no candidate starts, so its verifier work is a rounding error.
    expect(b2.verifier.used, 'verifier work is not inflated by the extra strand')
      .toBeLessThanOrEqual(2 * Math.max(1, b1.verifier.used));

    // And the aggregate is a true aggregate, not a per-strand snapshot that lost the first pass.
    expect(b2.verifier.used).toBeGreaterThanOrEqual(b1.verifier.used);
  }, 300_000);

  // -------------------------------------------------------------------------------------------
  // 8. SCRATCH IS REUSED SEQUENTIALLY, NOT DOUBLED
  // -------------------------------------------------------------------------------------------
  it('the align arena is reused across strands — cumulative allocated bytes do not double', () => {
    const common = { thresholdBps: 8000, collectStats: true };
    const one = dnaGappedSearchSession(big.query, big.target, { ...common, bothStrands: false });
    const two = dnaGappedSearchSession(big.query, big.target, { ...common, bothStrands: true });

    expect(one.incomplete).toBe(false);
    expect(two.incomplete).toBe(false);

    const a1 = one.stats.scratchBytesAllocated;
    const a2 = two.stats.scratchBytesAllocated;
    expect(typeof a1, 'cumulative allocation must be published').toBe('number');
    expect(a1, 'a real arena was allocated').toBeGreaterThan(0);

    // The `−` pass must run on the SAME warmed arena. Allowing zero extra growth would be too
    // rigid (the rc probe may need one more chunk), but a second full arena is exactly the defect.
    expect(a2, 'second strand must not allocate a whole second arena').toBeLessThan(2 * a1);

    // Peak stays peak: reuse means the high-water mark is unchanged, not merely un-doubled.
    expect(two.stats.arenaKB).toBe(one.stats.arenaKB);
  }, 300_000);
});
