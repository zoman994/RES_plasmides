/**
 * U4-CANCEL C1 — the resumable core: interior suspension, cooperative cancel, sync↔cooperative
 * parity, and the macrotask-yield mutation gate.
 *
 * WHAT THIS FILE IS FOR. The U4 runtime gate measured a cancel that stopped the UI in 2 ms and the
 * CPU in ~2026 ms: `Worker.terminate()` only forces `TerminateExecution()` after Chromium's fixed
 * ~2 s delay when the worker's synchronous JS never yields the task queue. The fix is that the
 * search itself suspends — so these tests pin the three things that make that true and are easy to
 * regress silently:
 *
 *   1. the suspension points are INTERIOR (inside the Myers sweep, inside the frontier verifier),
 *      not merely between documents or between candidates;
 *   2. a cooperative drain STOPS the work — it abandons the job long before the work would end;
 *   3. suspending changes no answer: the cooperative drain is byte-identical to the synchronous one.
 *
 * Plus the mutation gate: replacing the task-queue yield with a microtask (`Promise.resolve()`)
 * must turn these RED, because a microtask never returns to the event loop and therefore can never
 * let a cancel message — or anything else — be delivered.
 */
import { describe, it, expect } from 'vitest';
import {
  drainSync, drainCooperative, yieldToTaskQueue, SEARCH_CANCELLED,
} from '../dna-search-cooperative';
import { dnaGappedSessionSteps } from '../dna-gapped-session-steps';
import { dnaGappedSearchSession } from '../dna-gapped-search';
import { scanCandidateStartsSteps, SCAN_CHUNK_POSITIONS } from '../dna-approx-scan';
import { alignFromStartSteps, VERIFIER_CHUNK_STATES } from '../dna-gapped-align';

/** Deterministic pseudo-random ACGT — no Math.random, so a failure is always reproducible. */
function lcgDna(seed, n) {
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out += 'ACGT'[(s >>> 24) & 3];
  }
  return out;
}

const countSteps = (gen) => { let n = 0; while (!gen.next().done) n += 1; return n; };

const CTX = { thresholdBps: 8000, bothStrands: true };

describe('C1 · interior suspension points', () => {
  it('the Myers sweep suspends INSIDE one sweep, on a bounded number of positions', () => {
    // One molecule, one document, one uninterrupted sweep pre-C1. If the boundary were per-document
    // this count would be 0 — which is exactly the ~2 s teardown U4 measured.
    const target = lcgDna(0x5715ED, SCAN_CHUNK_POSITIONS * 4);
    const steps = countSteps(scanCandidateStartsSteps('ACGTACGTACGTACGTACGT', target, 4));
    expect(steps).toBeGreaterThanOrEqual(3);
    // …and bounded work per step: no step may cover more than the declared chunk.
    expect(steps).toBeLessThanOrEqual(Math.ceil(target.length / SCAN_CHUNK_POSITIONS));
  });

  // 15 s, not the 5 s default: this case takes ~2.1 s of real DP on an idle machine, so on a loaded
  // one it was the first casualty of the whole suite — the unnamed «timeout under load» from the U4
  // runs, now measured and named. The expense is the POINT (see below), so the cap is raised rather
  // than the workload shrunk; shrinking it would stop proving that the verifier suspends INSIDE a
  // single alignment.
  it('the frontier verifier suspends INSIDE one alignment, on a bounded number of states', { timeout: 15000 }, () => {
    // ONE candidate — so any suspension here is necessarily interior to a single alignment, not
    // between candidates. A low threshold widens the band and makes the DP expensive.
    const probe = lcgDna(0x9E3779B9, 120);
    const target = probe.slice(0, 60) + lcgDna(0x1234, 60);
    // NO chunk override — the PRODUCTION `VERIFIER_CHUNK_STATES` (4096). A test-only 64 would have
    // proved that a smaller chunk suspends, not that the shipped one does.
    const steps = countSteps(alignFromStartSteps(probe, target, 0, 30, { maxSpan: 150 }));
    expect(steps).toBeGreaterThanOrEqual(1);
    expect(VERIFIER_CHUNK_STATES).toBeGreaterThan(0);
  });

  it('a whole session suspends many times — scan AND verifier stages both contribute', () => {
    const target = lcgDna(0xC0FFEE, 60000);
    const steps = countSteps(dnaGappedSessionSteps('ACGTACGTACGTACGTACGTACGT', target, CTX));
    expect(steps).toBeGreaterThan(10);
  });
});

describe('C1 · sync ↔ cooperative parity (byte-identical)', () => {
  const CASES = [
    ['exact', 'GAATTCACGTAC', 'AAAAGAATTCACGTACAAAA', {}],
    ['approx one substitution', 'GAATTCACGTAC', 'AAAAGAATTCACGTGCAAAA', {}],
    ['minus strand', 'GAATTCACGTAC', 'AAAAGTACGTGAATTCAAAA', {}],
    ['both strands (palindrome)', 'GGAATTCC', 'AAAAGGAATTCCAAAA', {}],
    ['wrap over origin (circular)', 'ATTGCGGATC', 'GGATCCACGTTTGCAATTGC', { circular: true }],
    ['honest miss', 'GAATTCACGTAC', lcgDna(0xABCDEF, 4000), {}],
    ['repeat-rich', 'ACGTACGTACGT', 'ACGT'.repeat(300), {}],
  ];

  it.each(CASES)('%s — cooperative equals sync', async (_name, query, target, extra) => {
    const opts = { ...CTX, ...extra };
    const sync = dnaGappedSearchSession(query, target, opts);
    // sliceMs 0 ⇒ suspend after EVERY step: the most adversarial interleaving available.
    const coop = await drainCooperative(dnaGappedSessionSteps(query, target, opts), { sliceMs: 0 });
    expect(JSON.stringify(coop)).toBe(JSON.stringify(sync));
  });

  it('typed RESOURCE_LIMIT is identical on both drains', async () => {
    const opts = { ...CTX, thresholdBps: 6000, budgets: { verifier: 1 } };
    const q = 'ACGTACGTACGTACGTGG';
    const t = 'ACGTACGTACGTACGTGG'.repeat(20);
    const sync = dnaGappedSearchSession(q, t, opts);
    const coop = await drainCooperative(dnaGappedSessionSteps(q, t, opts), { sliceMs: 0 });
    expect(sync.incomplete).toBe(true);
    expect(JSON.stringify(coop)).toBe(JSON.stringify(sync));
  });

  it('typed INVALID_DNA throws identically on both drains', async () => {
    const bad = 'ACGTNACGTACGT';
    expect(() => dnaGappedSearchSession(bad, 'ACGTACGT', CTX)).toThrow();
    await expect(drainCooperative(dnaGappedSessionSteps(bad, 'ACGTACGT', CTX), { sliceMs: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_DNA' });
  });
});

describe('C1 · cooperative cancel actually stops the work', () => {
  it('DIAGNOSTIC 1 — cancel lands mid long no-hit SCAN, work abandoned', async () => {
    // A megabase-scale sweep with nothing to find: pre-C1 this is the single longest stretch of
    // uninterruptible CPU in the product, and the one the 1 Mb U4 measurement sat in.
    const target = lcgDna(0x5715ED, 400000);
    const query = 'GGGGGGCCCCCCGGGGGGCCCCCC';
    const total = countSteps(dnaGappedSessionSteps(query, target, CTX));
    expect(total).toBeGreaterThan(20); // the sweep really is long

    let steps = 0;
    const gen = dnaGappedSessionSteps(query, target, CTX);
    const counting = { next: () => { steps += 1; return gen.next(); }, return: (v) => gen.return(v) };
    await expect(drainCooperative(counting, { sliceMs: 0, shouldCancel: () => steps >= 3 }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    // Abandoned near the start — NOT after grinding through the molecule.
    expect(steps).toBeLessThan(total / 2);
    expect(steps).toBeLessThanOrEqual(4);
  });

  it('DIAGNOSTIC 2 — cancel lands mid candidate-rich VERIFIER, after the scan is done', async () => {
    // A LONG query on a short repeat-rich target: the sweep is trivially short (one chunk), while a
    // single alignment explores far more than one verifier chunk — so every suspension after the
    // scan is necessarily INTERIOR to one `alignFromStart` call.
    const target = 'ACGTTGCA'.repeat(60);
    const query = `${'ACGTTGCA'.repeat(12)}GGGG`;
    const opts = { ...CTX, thresholdBps: 7000 };

    // Steps belonging to the scan stage alone (both strands sweep the same length). The target is
    // deliberately SHORTER than one scan chunk, so the sweep contributes exactly ZERO suspensions —
    // which makes the construction airtight: every suspension the session produces here is interior
    // to an `alignFromStart` call, and cancelling on one is by definition cancelling inside the DP.
    const k = 40;
    const scanOnly = countSteps(scanCandidateStartsSteps(query, target, k)) * 2;
    expect(target.length).toBeLessThan(SCAN_CHUNK_POSITIONS);
    expect(scanOnly).toBe(0); // pinned: the scan cannot account for any step below
    const total = countSteps(dnaGappedSessionSteps(query, target, opts));
    expect(total).toBeGreaterThan(scanOnly + 5); // …so these are all verifier-interior suspensions

    let steps = 0;
    const gen = dnaGappedSessionSteps(query, target, opts);
    const counting = { next: () => { steps += 1; return gen.next(); }, return: (v) => gen.return(v) };
    const cancelAt = scanOnly + 3; // strictly past every scan-stage step ⇒ inside the verifier
    await expect(drainCooperative(counting, { sliceMs: 0, shouldCancel: () => steps >= cancelAt }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(steps).toBeGreaterThan(scanOnly); // proved: the suspension point was INSIDE the verifier
    expect(steps).toBeLessThan(total); // and the job was abandoned, not completed
  });

  it('a job cancelled before its first step never runs', async () => {
    let steps = 0;
    const gen = dnaGappedSessionSteps('ACGTACGTACGT', lcgDna(1, 50000), CTX);
    const counting = { next: () => { steps += 1; return gen.next(); }, return: (v) => gen.return(v) };
    await expect(drainCooperative(counting, { shouldCancel: () => true }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(steps).toBe(0);
  });

  it('cancellation unwinds a RUNNING generator through its finally blocks', async () => {
    // The stage timers and the arena reading are recorded in `finally`, so an abandoned job must
    // still unwind rather than be dropped mid-flight. (A job cancelled BEFORE its first step has
    // nothing to unwind — the body never ran — which the previous test pins.)
    let unwound = false;
    let started = false;
    function* guarded() {
      try { for (;;) { started = true; yield; } } finally { unwound = true; }
    }
    await expect(drainCooperative(guarded(), { sliceMs: 0, shouldCancel: () => started }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(started).toBe(true);
    expect(unwound).toBe(true);
  });
});

describe('C1.1 · MANY CHEAP alignments must also be interruptible', () => {
  // Igor's P1: the verifier barrier is per-`alignFromStart`, and its counter RESTARTS on every
  // candidate. A tandem repeat produces thousands of alignments that are each far cheaper than one
  // chunk, so none of them ever reaches the barrier and the whole verify loop runs as ONE
  // uninterruptible block — measured 146.8 ms for a single `next()` on an 8 kb poly-A target, with
  // a pending cancel unable to run. The interior barrier is necessary but NOT sufficient: the
  // allowance has to be CUMULATIVE across candidates.
  const QUERY = 'A'.repeat(20);
  const TARGET = 'A'.repeat(8000);
  const OPTS = { thresholdBps: 10000, bothStrands: false };

  it('the construction really is «no scan steps, no per-alignment steps»', () => {
    // (a) the sweep is shorter than one scan chunk ⇒ it cannot contribute a single safe point…
    expect(TARGET.length).toBeLessThan(SCAN_CHUNK_POSITIONS);
    expect(countSteps(scanCandidateStartsSteps(QUERY, TARGET, 0))).toBe(0);
    // (b) …and ONE exact alignment is far cheaper than the interior verifier barrier.
    expect(countSteps(alignFromStartSteps(QUERY, TARGET, 0, 0, { maxSpan: 20 }))).toBe(0);
  });

  it('RED before C1.1 — the repeat-rich session still has safe points', () => {
    const steps = countSteps(dnaGappedSessionSteps(QUERY, TARGET, OPTS));
    // Thousands of cheap alignments must still yield: without a cumulative allowance this is 0.
    expect(steps).toBeGreaterThan(0);
  });

  it('RED before C1.1 — such a session can be cancelled before it finishes', async () => {
    let n = 0;
    const gen = dnaGappedSessionSteps(QUERY, TARGET, OPTS);
    const counting = { next: () => { n += 1; return gen.next(); }, return: (v) => gen.return(v) };
    await expect(drainCooperative(counting, { sliceMs: 0, shouldCancel: () => n >= 2 }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(n).toBeLessThanOrEqual(3); // abandoned almost immediately, not after 7981 alignments
  });

  it('thousands of cheap alignments produce MANY safe points, not one', () => {
    // Honest scope: this pins that the count is plural (tens), not that the allowance is spent on
    // work rather than on candidates — the `+1` pin below covers the candidate-only branch.
    const steps = countSteps(dnaGappedSessionSteps(QUERY, TARGET, OPTS));
    // ~7981 exact alignments × ~21 accepted states ≈ 1.6·10⁵ states ⇒ tens of safe points.
    expect(steps).toBeGreaterThan(5);
  });

  it('the `+ 1` per-candidate charge alone paces a run that accepts NO verifier state', () => {
    // Every candidate is rejected by the admissible bound, so `meter.verifierUsed` never moves and
    // the state-delta is 0 for all of them. Without the `+ 1` the allowance would never drain and
    // the whole candidate sweep would be one uninterruptible block again — this is the branch that
    // a state-only accounting silently misses.
    const q = 'ACGT';
    const t = 'CCGT'.repeat(5000);
    const opts = { thresholdBps: 8000, bothStrands: false };
    const scanOnly = countSteps(scanCandidateStartsSteps(q, t, 1));
    const total = countSteps(dnaGappedSessionSteps(q, t, opts));
    expect(total).toBeGreaterThan(scanOnly); // safe points BEYOND the scan ⇒ they are inter-candidate
  });

  it('C1.1 changes no answer — cumulative safe points are byte-identical to sync', async () => {
    const sync = dnaGappedSearchSession(QUERY, TARGET, OPTS);
    const coop = await drainCooperative(dnaGappedSessionSteps(QUERY, TARGET, OPTS), { sliceMs: 0 });
    expect(sync.occurrences.length).toBeGreaterThan(0);
    expect(JSON.stringify(coop)).toBe(JSON.stringify(sync));
  });
});

describe('C1 · MUTATION GATE — the yield must be a MACROTASK', () => {
  /**
   * Runs a drain while a 0 ms timer is pending; reports whether the timer got to run DURING it.
   * The generator suspends until the timer fires (or a hard cap is reached), so the result does not
   * depend on how fast one hop is: a task yield lets the timer in after a hop or two, a microtask
   * yield never does and the loop simply exhausts its cap.
   */
  async function timerRanDuringDrain(yieldFn) {
    let timerFired = false;
    const MAX_HOPS = 5000;
    function* work() { for (let i = 0; i < MAX_HOPS && !timerFired; i++) yield; }
    const timer = setTimeout(() => { timerFired = true; }, 0);
    await drainCooperative(work(), { sliceMs: 0, yieldFn });
    clearTimeout(timer);
    return timerFired;
  }

  it('the production yield returns to the task queue — a pending timer runs mid-drain', async () => {
    // THIS is the assertion that dies if `yieldToTaskQueue` is mutated into `Promise.resolve()`.
    expect(await timerRanDuringDrain(yieldToTaskQueue)).toBe(true);
  });

  it('the DEFAULT binding is a macrotask — a real timer can land a cancel mid-drain', async () => {
    // No `yieldFn` override: this drives the production default. Without it, a mutation that swaps
    // only the DEFAULT binding for a microtask would slip past the injected-yield tests above.
    let cancelled = false;
    function* work() { for (let i = 0; i < 5000 && !cancelled; i++) yield; }
    setTimeout(() => { cancelled = true; }, 0);
    await expect(drainCooperative(work(), { sliceMs: 0, shouldCancel: () => cancelled }))
      .rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(cancelled).toBe(true);
  });

  it('a microtask yield STARVES the task queue — the same timer cannot run', async () => {
    // The mutant's behaviour, pinned explicitly: a cancel `postMessage` would be just as stuck,
    // which is why a `shouldCancel` inside a synchronous loop cannot fix the 2 s teardown.
    expect(await timerRanDuringDrain(() => Promise.resolve())).toBe(false);
  });

  it('drainSync never suspends — it is the production synchronous path', () => {
    let ticks = 0;
    function* work() { for (let i = 0; i < 5; i++) { ticks += 1; yield; } return 'done'; }
    expect(drainSync(work())).toBe('done');
    expect(ticks).toBe(5);
  });
});
