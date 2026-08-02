/**
 * U6-F.2 — the three contracts that were still open when the linear kernel was made the default.
 *
 * Each of these is a place where the linear path answered a question the production path also
 * answers, but answered it through its own private rule. The two replies are compared byte-for-byte
 * on the real base, so «its own rule» is not a style question: it is a different answer.
 *
 *   1. WHICH LOCUS IS CANONICAL. The compact boundary ranked by §3.2 and let «first element» mean
 *      «winner». Rule 6 compares the PHYSICAL endpoint, and the boundary read the end of the last
 *      DISPLAYED segment instead — which is the same number everywhere on a circle EXCEPT for the one
 *      hit the rule exists for. A locus finishing exactly at the origin has physical endpoint 0 and
 *      the LARGEST start on the molecule; the display end says `n`, the largest possible value, so
 *      the hit that must win rule 6 lost it every time.
 *   2. WHERE A ROW APPEARS. The emitted window is positional, and the production engine has always
 *      ordered it by `start → end → strand`. The linear path ordered by `start → end` only, so two
 *      occurrences sharing a locus on opposite strands were left tied — resolved by scanner order,
 *      which is not a contract.
 *   3. WHETHER THE TAIL CAN BE CANCELLED. Everything before finalisation suspends. The tail —
 *      pruning, traceback, grouping, editRuns, validation, the sort — did not, so a cancel arriving
 *      after the scan had nowhere to land. BG-025 has three loci and cannot show this; the fixture
 *      here is deliberately result-rich.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/u6f2-linear-canonical-order.test.js
 */
import {
  describe, it, expect, afterEach,
} from 'vitest';
import { seqMatch } from '../seq-match';
import { toSearchHitSummaries, toSearchHitSummariesSteps } from '../search-hit-summary';
import { validateSequenceOccurrencesSteps } from '../search-sequence-contract';
import { sortSteps, sortDrained, CHUNK } from '../resumable-sort';
import { comparePositional } from '../dna-gapped-occurrence';
import { runLinearSequenceSearchSteps } from '../dna-linear-provider';
import { drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';
import { setSequenceKernelForBenchmark, resetSequenceKernel, SEQUENCE_KERNEL } from '../sequence-kernel-seam';

afterEach(() => resetSequenceKernel());

// ── 1. THE CANONICAL BEST ON A CIRCLE ─────────────────────────────────────────────────────────
//
// A 12 nt ring of period 4 and a 12 nt query that differs from it in exactly one base. The query
// fits the ring three times over — at 0, 4 and 8 — with IDENTICAL counters and, because the three
// windows are byte-identical, an identical edit script. So §3.2 rules 1–5 and 7 all tie by
// construction and rule 6 is the only rule left: the smallest PHYSICAL endpoint wins.
//
//   start 0 → 0 + 12 = 12 ≡ 0   ← the winner
//   start 4 → 4 + 12 = 16 ≡ 4
//   start 8 → 8 + 12 = 20 ≡ 8
//
// Read off the displayed segments instead, start 0 reports 12 (it does not wrap, so its one segment
// is `[0, 12)`) while the other two report 4 and 8 — and the winner becomes start 4.
const RING = 'ACGTACGTACGT';
const RING_QUERY = 'TCGTACGTACGT';         // one substitution at position 0
const RING_DOC = { seq: RING, topology: 'circular' };
const RING_CTX = { identityThreshold: 0.9, bothStrands: false, circular: 'auto' };

describe('U6-F.2 — rule 6 reads the physical endpoint, so a locus ending at the origin wins', () => {
  it('the linear kernel names start 0 the canonical best, not the positionally convenient one', () => {
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
    const env = seqMatch(RING_QUERY, RING_DOC, null, RING_CTX);
    const starts = env.occurrences.map((o) => o.location.segments[0].start);
    expect(starts, 'all three copies are found, in positional order').toEqual([0, 4, 8]);
    expect(env.locationCount).toBe(3);
    // The whole point. `bestIndex` 1 (start 4) is what the display-end reading produces.
    expect(env.bestIndex, 'the hit whose physical endpoint is 0').toBe(0);
    const best = env.occurrences[env.bestIndex];
    expect(best.location.segments[0].start).toBe(0);
    expect(best.location.segments[0].end, 'and it does not wrap — it ends AT the origin').toBe(12);
  });

  it('the three explanations really are indistinguishable before rule 6', () => {
    // Without this the case above could pass for the wrong reason — some other rule separating them.
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
    const env = seqMatch(RING_QUERY, RING_DOC, null, RING_CTX);
    const shape = env.occurrences.map((o) => [
      o.metrics.exactMatches, o.metrics.substitutions, o.metrics.insertions,
      o.metrics.deletions, o.metrics.alignmentLength, o.metrics.targetSpan,
    ]);
    expect(shape).toEqual([[11, 1, 0, 0, 12, 12], [11, 1, 0, 0, 12, 12], [11, 1, 0, 0, 12, 12]]);
  });

  it('and the production engine agrees — same window, same winner', () => {
    // The differential that makes this a CONTRACT rather than a preference: production decides the
    // winner through `canonicalBestIndex`/`physicalEndpointOf`, and has always answered start 0 here.
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.PRODUCTION);
    const production = seqMatch(RING_QUERY, RING_DOC, null, RING_CTX);
    setSequenceKernelForBenchmark(SEQUENCE_KERNEL.LINEAR);
    const linear = seqMatch(RING_QUERY, RING_DOC, null, RING_CTX);
    expect(production.bestIndex).toBe(0);
    expect(linear.bestIndex).toBe(production.bestIndex);
    expect(linear.locationCount).toBe(production.locationCount);
    expect(linear.occurrences.map((o) => o.location.segments))
      .toEqual(production.occurrences.map((o) => o.location.segments));
  });
});

// ── 2. ONE POSITIONAL ORDER, INCLUDING THE STRAND TERM ────────────────────────────────────────
describe('U6-F.2 — positional order is start → physical end → strand, shared by both kernels', () => {
  /** A raw kernel occurrence — the shape that still HAS a script. */
  const raw = ({
    strand, script, start = 10, M = 5, X = 1,
  }) => ({
    strand,
    start,
    script,
    M,
    X,
    I: 0,
    D: 0,
    gapEvents: 0,
    alignmentLength: M + X,
    targetSpan: M + X,
    end: start + M + X,
    identityBps: Math.floor((10000 * M) / (M + X)),
  });

  // ONE locus, both strands, the same coordinates — and different scripts, so they do NOT merge into
  // `both`. Everything a `start → end` comparator can see is equal, so the pair was tied and the
  // scanner's emission order decided the window.
  const PLUS = raw({ strand: '+', script: 'X=====' });
  const MINUS = raw({ strand: '-', script: '=====X' });

  it('two rows at one locus are ordered by strand, whichever order the scanner emitted them in', () => {
    for (const input of [[PLUS, MINUS], [MINUS, PLUS]]) {
      const env = toSearchHitSummaries(input, 40);
      expect(env.occurrences.map((o) => o.location.strand)).toEqual(['+', '-']);
    }
  });

  it('…and the §3.2 winner is still the minus strand, named by index rather than by position', () => {
    // Rule 7 compares scripts 5′→3′ with `= < D < I < X`, so `=====X` beats `X=====`. A downstream
    // «prefer +» tiebreak would answer the other strand — a different biological claim.
    const env = toSearchHitSummaries([PLUS, MINUS], 40);
    expect(env.occurrences[env.bestIndex].location.strand).toBe('-');
    expect(env.bestIndex, 'the winner is NOT the first row — that is the whole point').toBe(1);
    expect(env.locationCount).toBe(2);
  });

  it('the shared comparator ranks + before both before −, and start beats end beats strand', () => {
    expect(comparePositional(10, 16, '+', 10, 16, '-')).toBeLessThan(0);
    expect(comparePositional(10, 16, '+', 10, 16, 'both')).toBeLessThan(0);
    expect(comparePositional(10, 16, 'both', 10, 16, '-')).toBeLessThan(0);
    expect(comparePositional(10, 16, '-', 11, 12, '+'), 'start dominates').toBeLessThan(0);
    expect(comparePositional(10, 16, '-', 10, 17, '+'), 'then the physical end').toBeLessThan(0);
    expect(comparePositional(10, 16, '+', 10, 16, '+'), 'a genuine tie stays a tie').toBe(0);
  });
});

// ── 3. A CANCEL THAT ARRIVES AFTER THE SCAN ───────────────────────────────────────────────────
//
// The existing cancellation cases all land while the scanner is still running, which proves nothing
// about the tail. This one is armed by an observation the test CANNOT fake: the kernel publishes its
// telemetry in a `finally` at the very end of `findOccurrencesSteps`, so the first moment
// `telemetry.retainedLoci` exists is the moment the kernel phase is over and the run is in
// finalisation — pruning is done, and grouping, editRuns, validation and the sort are what remain.
describe('U6-F.2 — a cancel issued after the scan lands in the finalisation', () => {
  // Big enough that the finalisation's sort reaches a LARGE FINAL MERGE — the phase that used to run
  // whole inside one `next()`. A three-locus fixture like BG-025 proves nothing here, and neither
  // does a result set that fits in a single chunk.
  // ~n/4 loci survive §3.2.1 pruning on a period-4 repeat, so this is ≈ 9 000 occurrences — several
  // sort chunks, and a final merge that spans more than one.
  const TARGET = 'ACGT'.repeat(9_000);       // 36 000 nt, every position a hit
  const QUERY = 'ACGTACGTACGTACGTACGT';      // 20 nt
  const OPTS = () => ({
    thresholdBps: 8000,
    bothStrands: true,
    // Unbounded on purpose: a refusal would end the run before the result set — the thing that makes
    // the tail expensive — had a chance to grow.
    budgets: {
      scan: null, verifier: null, traceback: null, output: null,
    },
  });

  it('the tail suspends AFTER the kernel has finished, not only before it', () => {
    const telemetry = {};
    const gen = runLinearSequenceSearchSteps(QUERY, TARGET, { ...OPTS(), telemetry });
    let beforeKernelDone = 0;
    let afterKernelDone = 0;
    let step = gen.next();
    while (!step.done) {
      if (telemetry.retainedLoci === undefined) beforeKernelDone += 1;
      else afterKernelDone += 1;
      step = gen.next();
    }
    expect(telemetry.retainedLoci, 'the kernel really ran').toBeGreaterThan(100);
    expect(beforeKernelDone).toBeGreaterThan(0);
    // The result set has to be big enough that the finalisation's last merge spans several chunks —
    // otherwise «the tail suspends» is true of a tail that had nothing to do.
    expect(step.value.occurrences.length, 'the result set spans several sort chunks')
      .toBeGreaterThan(2 * CHUNK);
    // And the tail must suspend PROPORTIONALLY to it, not merely at least once: one suspension for a
    // 16 000-element finalisation is exactly the unbounded-latency defect this case exists to catch.
    expect(afterKernelDone, 'the tail suspends in proportion to the work it does')
      .toBeGreaterThan(step.value.occurrences.length / CHUNK);
  }, 60_000);

  it('the cooperative driver cancels there, and reports it as a cancel', async () => {
    const telemetry = {};
    const gen = runLinearSequenceSearchSteps(QUERY, TARGET, { ...OPTS(), telemetry });
    // `shouldCancel` becomes true EXACTLY when the kernel phase ends. The driver checks it after a
    // slice, so the cancel it acts on can only be one raised in the tail.
    let kernelWasDone = false;
    const err = await drainCooperative(gen, {
      shouldCancel: () => {
        if (telemetry.retainedLoci === undefined) return false;
        kernelWasDone = true;
        return true;
      },
      sliceMs: 0,                              // one step per slice: check after every suspension
      yieldFn: () => Promise.resolve(),        // the macrotask property is pinned elsewhere; this
                                               // case is about WHERE the cancel lands, not how the
                                               // thread is handed back
    }).then(() => null, (e) => e);
    expect(kernelWasDone, 'the cancel was raised after the scan, not during it').toBe(true);
    expect(telemetry.retainedLoci, 'on a result set that reaches a large final merge')
      .toBeGreaterThan(2 * CHUNK);
    expect(err).toBeTruthy();
    expect(err.code).toBe(SEARCH_CANCELLED);
  }, 60_000);
});

// ── 4. NO STAGE DOES ITS WORK AFTER ITS LAST SUSPENSION ───────────────────────────────────────
//
// Counting suspensions is not enough, and this is the reason: a generator that yields ⌊n/512⌋ times
// over an empty loop and THEN calls a synchronous function suspends proportionally to the input and
// is still one uninterruptible block. Every one of those yields hands the thread back BEFORE the
// work rather than during it, so a cancel taken at any of them cancels nothing that was running.
//
// What separates the two is observable and deterministic: WHEN the work happens. Each stage below is
// driven to its FIRST suspension only, and the input reports how much of itself has been read. A
// decorative stage reads nothing by then; a real one has read exactly one chunk.
describe('U6-F.2 — the finalisation stages do real work between their suspensions', () => {
  /** An occurrence that counts how often the stage has looked at it. */
  const probed = (base, key, tick) => {
    const value = base[key];
    const o = { ...base };
    delete o[key];
    Object.defineProperty(o, key, { get() { tick(); return value; }, enumerable: true, configurable: true });
    return o;
  };

  it('toSearchHitSummaries groups and builds as it goes, not after its last yield', () => {
    let reads = 0;
    const N = 2_000;
    const input = [];
    for (let i = 0; i < N; i += 1) {
      input.push(probed({
        strand: '+',
        start: i * 10,
        targetSpan: 6,
        end: i * 10 + 6,
        M: 6,
        X: 0,
        I: 0,
        D: 0,
        gapEvents: 0,
        alignmentLength: 6,
        identityBps: 10000,
        script: '======',
      }, 'script', () => { reads += 1; }));
    }
    const gen = toSearchHitSummariesSteps(input, N * 10 + 10);
    gen.next();                                    // run up to the FIRST suspension
    expect(reads, 'work has already begun').toBeGreaterThan(0);
    expect(reads, 'and it is not all done yet').toBeLessThan(N);
    let step = gen.next();
    while (!step.done) step = gen.next();
    expect(step.value.occurrences).toHaveLength(N);
  });

  it('the sequence validator validates as it goes, not after its last yield', () => {
    let reads = 0;
    const N = 2_000;
    const input = [];
    for (let i = 0; i < N; i += 1) {
      input.push(probed({
        location: { segments: [{ start: i * 10, end: i * 10 + 6 }], strand: '+', wrapsOrigin: false },
        metrics: {
          length: 6,
          queryLength: 6,
          alignmentLength: 6,
          targetSpan: 6,
          identity: 1,
          coverage: 1,
          exactMatches: 6,
          substitutions: 0,
          insertions: 0,
          deletions: 0,
          indelBases: 0,
          indelEvents: 0,
          editDistance: 0,
          mismatches: 0,
          indels: 0,
          identityBps: 10000,
        },
      }, 'location', () => { reads += 1; }));
    }
    const gen = validateSequenceOccurrencesSteps(input, { sequenceLength: N * 10 + 10, circular: false });
    gen.next();
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThan(N);
    let step = gen.next();
    while (!step.done) step = gen.next();
    expect(step.value).toBe(true);
  });

  it('the sort compares as it goes, not after its last yield', () => {
    let compares = 0;
    const arr = [];
    for (let i = 0; i < 8_000; i += 1) arr.push((i * 7919) % 8_000);
    const gen = sortSteps(arr, (a, b) => { compares += 1; return a - b; });
    gen.next();
    const atFirstSuspension = compares;
    expect(atFirstSuspension).toBeGreaterThan(0);
    let step = gen.next();
    while (!step.done) step = gen.next();
    expect(compares, 'the first slice was a slice, not the whole sort').toBeGreaterThan(atFirstSuspension);
    for (let i = 1; i < arr.length; i += 1) expect(arr[i]).toBeGreaterThanOrEqual(arr[i - 1]);
  });

  // U6-F.2 corrective. «Does it suspend» and «how long does a cancel wait» are different questions,
  // and only the first was being asked. Counting whole MERGES as the unit made the schedule look
  // bounded while the last pass of a bottom-up merge sort is ONE merge over the entire array — so a
  // 200 000-element result set did its whole final pass, and then its whole copy-back, inside a
  // single `next()`. The measurement below is therefore the MAXIMUM work between EVERY pair of
  // steps, not the work before the first one.
  //
  // The instrument is a Proxy over the input array. It observes exactly what the sort touches, and
  // it cannot miss a phase: passes alternate which buffer is the caller's array, so on every pass
  // either the reads or the writes go through the proxy, and the final copy-back writes through it.
  it('no single step does more than one chunk of work — final merge and copy-back included', () => {
    // 70 000 → 17 passes (widths 1 … 65536), so the LAST pass is a single merge of the whole array,
    // and an odd pass count means the copy-back runs too. Both target phases are exercised.
    const N = 70_000;
    const base = [];
    for (let i = 0; i < N; i += 1) base.push((i * 7919) % N);
    let ops = 0;
    const indexed = (p) => {
      if (typeof p !== 'string') return false;
      const c = p.charCodeAt(0);
      return c >= 48 && c <= 57;
    };
    const watched = new Proxy(base, {
      get(t, p, r) { if (indexed(p)) ops += 1; return Reflect.get(t, p, r); },
      set(t, p, v, r) { if (indexed(p)) ops += 1; return Reflect.set(t, p, v, r); },
    });

    const gen = sortSteps(watched, (a, b) => a - b);
    let steps = 0;
    let last = 0;
    let worst = 0;
    let s = gen.next();
    while (!s.done) {
      steps += 1;
      const delta = ops - last;
      last = ops;
      if (delta > worst) worst = delta;
      s = gen.next();
    }
    const tail = ops - last;                 // the stretch after the LAST suspension counts too
    if (tail > worst) worst = tail;

    expect(steps, 'a run this size must suspend many times').toBeGreaterThan(100);
    // A merged element costs at most three observed operations (two reads for the comparison, one
    // to fetch the winner) plus the store, and the budget is counted in elements WRITTEN. Four times
    // the chunk is the loosest honest ceiling; a whole-merge schedule would land near 3 × 70 000.
    expect(worst, `worst stretch ${worst} ops between two steps`).toBeLessThanOrEqual(4 * CHUNK);

    let sorted = true;
    for (let i = 1; i < N; i += 1) if (base[i] < base[i - 1]) { sorted = false; break; }
    expect(sorted, 'and it is still a correct sort').toBe(true);
  });

  it('the sort is STABLE — ties keep their input order, as Array.prototype.sort does', () => {
    // Load-bearing: the positional key deliberately does not separate every pair, and the two
    // kernels' answers are compared byte-for-byte.
    const arr = [];
    for (let i = 0; i < 1_000; i += 1) arr.push({ key: i % 7, seq: i });
    const mine = arr.slice();
    sortDrained(mine, (a, b) => a.key - b.key);
    const native = arr.slice().sort((a, b) => a.key - b.key);
    expect(mine.map((x) => x.seq)).toEqual(native.map((x) => x.seq));
  });
});
