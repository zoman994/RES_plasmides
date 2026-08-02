/**
 * dna-linear-kernel.js — the gapped-DNA kernel (linear score + Dinkelbach), ORCHESTRATION +
 * public entry point.
 *
 * ON THE PRODUCTION SEARCH PATH since U6-F, and the default since U6-F.2: seq-match.js ->
 * dna-linear-provider.js -> this module. What did NOT change when it landed — the §4.2.0 length
 * routing, the 100 nt approximate-search limit, every resource budget, the exact-first rule and the
 * 15 s client timeout. The production engine (dna-gapped-search.js) is still reachable through the
 * kernel seam and is still what the parity and differential tests compare against.
 *
 * Normative source: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.1-2.7, §3.1, §3.2, §3.2.1,
 * §4.2, §4.2.1, §6.
 *
 * Pipeline (§4.2.1 mandated shape): 2-bit target -> block-vector Myers -> candidate END
 * positions -> GROUP consecutive ends into windows (grouping only) -> ONE reversed banded
 * free-start DP per window decides EVERY start -> for accepted starts only: Dinkelbach to
 * the exact identity maximum + 7-step §3.2 comparator + lex-smallest traceback -> §3.2.1
 * pruning on LIFTED physical endpoints -> deterministic sort.
 *
 * MODULE SPLIT (U0). Candidate generation (encoding, Myers scanner, window acceptance) lives
 * in dna-linear-scan.js; exact per-start decision (Dinkelbach, §3.2 counter comparator,
 * lex-min traceback) lives in dna-linear-verify.js. THIS file owns only orchestration and
 * selection: window grouping, the per-strand loop, §3.2.1 endpoint-shadow pruning, and the
 * deterministic output order. Scanner, verifier and orchestration must not be mixed back
 * together; new behaviour goes into the module that owns the responsibility.
 *
 * ============ WHY "PLATEAU MINIMA" IS FORBIDDEN, PERMANENTLY ============
 * The tempting reduction "inside a valley of the Myers distance profile keep only the
 * minima, one occurrence per minimum" is PROVABLY LOSSY:
 *   query AAAACCCC, target AAAACCCCC, threshold 8000.
 *   Profile end=6:d2 end=7:d1 end=8:d0 end=9:d1 -> ONE valley.
 *   Real accepted occurrences: start=0 (end=8, 100%) AND start=1 (end=9, 87.50%).
 * Endpoints 8 and 9 DIFFER, so §3.2.1 forbids merging them; collapsing the valley to its
 * minimum destroys start=1. A window here is therefore a unit of SHARED DP WORK and NEVER
 * a unit of selection. That is precisely why the grouping loop in searchStrand() below fuses
 * consecutive ends but discards nothing, and re-derives every start through windowAccept().
 * The regression test lives in dna-linear-kernel.test.js and must go red for any
 * "keep only the minimum" mutation.
 * =======================================================================
 */

import {
  encodeQuery,
  encodeTargetSteps,
  revCompCodesSteps,
  MyersScanner,
  windowAcceptSteps,
} from './dna-linear-scan';
import {
  compareRules16,
  compareCanonical,
  StartSolver,
  solveStartSteps,
} from './dna-linear-verify';
import { makeControl } from './dna-linear-control';
import { sortSteps } from './resumable-sort';

export { compareRules16, compareCanonical };

export { SEARCH_ABORT } from './dna-linear-abort';


/** Bases copied between suspensions while the circular overlay is built. */
const COPY_CHUNK = 1 << 18;

/**
 * §4.2.1(8) — the refinement bound is DERIVED, not chosen.
 *
 * Each `val > 0` refinement step strictly increases M/(m+D), so no (M,D) pair can be visited
 * twice; the chain therefore cannot be longer than the number of reachable pairs,
 * `(m+1) * (maxSpan+1)`. That is a correctness backstop with a proof behind it, not a tuning
 * knob — measured chains from the production starting point are 1..3 deep across ~46 000
 * offline configurations. The four resource axes remain the real cost limiter.
 */
function defaultIterationBudget(m, maxSpan) {
  return (m + 1) * (maxSpan + 1);
}

function requireIterationBudget(v) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error('iterationBudget must be a non-negative integer');
  }
  return v;
}

/**
 * §5.1 — the acceptance threshold is a finite INTEGER in basis points, 5000..10000.
 *
 * The old `opts.thresholdBps | 0` was a coercion, not a check, and ToInt32 quietly bent four
 * shapes into range (measured): '8000' -> 8000, 8000.7 -> 8000, [8000] -> 8000, and worst of all
 * 7999.999 -> 7999 — a threshold the caller never asked for, silently applied to a biological
 * acceptance decision. NaN and the infinities looked rejected only because ToInt32 maps them to
 * 0 and 0 fails the range test; nothing had validated them. Integer basis points are the whole
 * mechanism by which 80.00% passes and 79.99% does not (§2.3), so a fraction must be refused
 * rather than floored.
 */
function requireThresholdBps(v) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 5000 || v > 10000) {
    throw new Error('thresholdBps must be a finite integer in 5000..10000');
  }
  return v;
}

function* searchStrandSteps(q, ext, extLen, n, strand, thr, circular, maxSpan, iterBudget, ctl) {
  const m = q.length;
  const K = Math.floor(m * (10000 - thr) / thr);
  const solver = new StartSolver(m, maxSpan, K);
  const hits = [];

  // The fixed per-strand workspace is real memory and is reported even when the scan finds
  // nothing: a search that allocates its solver and then matches zero candidates has still used
  // a workspace, and a telemetry that said 0 would understate the engine's true floor. Both
  // terms below are functions of the QUERY and the span cap — never of the target length, which
  // is the property this whole substep exists to establish.
  const solverBytes = (maxSpan + 1) * 5 * 26 + (maxSpan + 1) * 13;
  const scannerBytes = Math.ceil(m / 32) * 9 * 4;
  if (ctl) ctl.noteFixed(solverBytes + scannerBytes);

  // GROUPING, NEVER SELECTION (see the header): runs of consecutive candidate ends share one
  // DP unrolling. Nothing is discarded; every start is re-derived below.
  //
  // STREAMING (§4.2.1(10)). Three structures used to be sized by the MOLECULE rather than by the
  // work in flight: the scan's full `ends[]`, a `Uint8Array(targetLength)` dedup bitmap, and a
  // complete `starts[]`. On low-complexity input — poly-A, tandem repeats, shared backbone —
  // nearly every position qualifies, so all three grew with the target while the useful work did
  // not. Now ends arrive one at a time, a run is processed the moment it closes, and a long run
  // is cut into bounded chunks.
  //
  // CHUNKING IS LOSSLESS BY CONSTRUCTION. A start whose alignment ends at `e` satisfies
  // `s >= e - maxSpan`, so a chunk covering ends `[a, chunkEnd]` and reaching back to
  // `a - maxSpan` can see every start that ends inside it. Consecutive chunks overlap by exactly
  // `maxSpan`, so no start falls between them. This is a division of WORK, never of candidates.
  const recent = new Set();
  let recentFloor = 0;
  const chunkLen = Math.max(2 * maxSpan, 1024);
  const step = Math.max(1, chunkLen - maxSpan);
  const trimAt = 4 * (chunkLen + maxSpan);

  // The window sweep hands its accepted starts to a BUFFER rather than straight to the verifier:
  // the verifier is now a generator, and a plain callback cannot delegate into one. The buffer is
  // bounded by the window width — which is itself bounded by `chunkLen` — so the streaming property
  // the chunking exists to provide is unchanged.
  let pending = [];
  const emit = (s) => {
    // rawStarts: every admissible start windowAccept proposes, BEFORE the `recent` dedup.
    if (ctl) ctl.noteRawStart();
    if (s >= n || recent.has(s)) return;
    recent.add(s);
    // verifiedStarts: each UNIQUE admissible start, immediately before the actual solve.
    if (ctl) ctl.noteVerifiedStart();
    pending.push(s);
  };
  const drainPending = function* drain() {
    for (const s of pending) {
      const occ = yield* solveStartSteps(solver, q, ext, extLen, s, maxSpan, thr, n, circular, strand, iterBudget, ctl);
      // Charged BEFORE the occurrence is buffered: `hits` is what actually grows on a long
      // low-complexity target, so a limit applied after the array is built would be a limit that
      // never prevents the memory it exists to bound.
      if (occ) { if (ctl) ctl.chargeOutput(1); hits.push(occ); }
    }
    pending = [];
  };

  const processRun = function* run(e1, e2) {
    for (let a = e1; a <= e2; a += step) {
      const chunkEnd = Math.min(e2, a + chunkLen - 1);
      const wStart = Math.max(0, a - maxSpan);
      if (ctl) ctl.checkCancel();
      yield;
      // windowAccept now owns its own byte/charge accounting: it is the allocator, so it is the
      // only place that knows the true width. Object peak is taken AFTER the sweep — taking it
      // before missed everything the chunk was about to add, including the whole final chunk.
      yield* windowAcceptSteps(q, ext, wStart, chunkEnd, thr, emit, ctl);
      yield* drainPending();
      if (ctl) ctl.noteObjects(recent.size + hits.length);
      // EVICT BY THE NEXT WINDOW'S REACH, NOT BY THIS CHUNK'S END. The next chunk begins at
      // `a + step` and reaches back `maxSpan`, so the earliest start it can still propose is
      // `a + step - maxSpan`. Since `step = chunkLen - maxSpan`, that is `chunkEnd + 1 - 2*maxSpan`
      // — strictly BELOW `chunkEnd - maxSpan` whenever maxSpan > 1. Evicting at the later bound
      // forgot starts the next window re-proposed, and each seam emitted one duplicate locus
      // (measured: A^1100 gave 1100 occurrences instead of 1099, A^4096 gave 4099 instead of
      // 4095 — exactly one per seam).
      // Two windows can follow this chunk, and the floor must respect the EARLIER of them:
      // the next chunk of this run starts at `a + step`, while the next RUN starts at some
      // `e1' >= chunkEnd + 2` and so reaches back no further than `chunkEnd + 1 - maxSpan`.
      // On a TRUNCATED final chunk (`chunkEnd === e2` well before `a + chunkLen - 1`) the
      // `a + step` term overshoots the run entirely, and evicting by it dropped starts that the
      // next run re-proposed — a duplicate across the run boundary, which the per-strand
      // "starts strictly increase" invariant caught.
      const floor = Math.max(0, Math.min(a + step, chunkEnd + 1) - maxSpan);
      // Trimming is LAZY and amortised. Sweeping the set on every chunk is O(size) per chunk and
      // became quadratic once the floor was corrected downward; holding entries longer than
      // strictly necessary can never create a duplicate — only the opposite error can — so the
      // sweep runs only when the set exceeds a bound that is itself a function of the chunk and
      // the span cap, never of the target.
      if (floor > recentFloor) recentFloor = floor;
      if (recent.size > trimAt) {
        for (const s of recent) if (s < recentFloor) recent.delete(s);
      }
      if (chunkEnd === e2) break;
    }
  };

  let runFirst = -1;
  let runLast = -1;
  let closed = [];
  const scanner = new MyersScanner(q, K).scanStreamSteps(ext, extLen, true, (e) => {
    // candidateEnds: every scanner end, counted BEFORE plateau/run grouping discards nothing.
    if (ctl) ctl.noteCandidateEnd();
    if (runFirst < 0) { runFirst = e; runLast = e; return; }
    if (e === runLast + 1) { runLast = e; return; }
    closed.push([runFirst, runLast]);
    runFirst = e; runLast = e;
  }, ctl);
  // Runs are processed as they CLOSE, between scanner suspensions, so neither the ends nor the
  // pending windows accumulate across the molecule.
  let st = scanner.next();
  while (!st.done) {
    if (closed.length) {
      for (const [a, b] of closed) yield* processRun(a, b);
      closed = [];
    }
    yield;
    st = scanner.next();
  }
  for (const [a, b] of closed) yield* processRun(a, b);
  if (runFirst < 0) return [];
  yield* processRun(runFirst, runLast);

  // §4.2.1: traceback ONLY for retained winners. Rules 1-6 need no script, so shadows die
  // before any script is materialised; rule 7 runs on the few survivors that tie.
  const survivors = yield* pruneEndpointShadowsSteps(hits, n, circular, function* materialise(occ) {
    if (occ.script === null) {
      occ.script = yield* solver.tracebackSteps(q, ext, occ.start, occ.targetSpan, occ._p, occ._q, ctl);
      // tracebacksMaterialized: a real script build — phase-A survivors AND rule-7 tie-breaks.
      if (ctl) ctl.noteTracebackMaterialised();
    }
    return occ;
  });
  for (let i = 0; i < survivors.length; i += 1) {
    if (i > 0 && (i & 1023) === 0) yield;
    delete survivors[i]._p; delete survivors[i]._q;
  }
  // retainedLoci: §3.2.1 survivors, accumulated across both strands via the shared control.
  if (ctl) ctl.noteRetained(survivors.length);
  return survivors;
}

/**
 * §3.2.1 endpoint-shadow pruning.
 *
 * RESUMABLE. This walks EVERY hit — the array whose ceiling is the output budget, 200 000 — and
 * inside a bucket it is quadratic, and it drives the traceback, which is the most expensive single
 * piece of work in the kernel. Leaving it synchronous put the largest uninterruptible block right at
 * the end of the search: all the suspensions in the scan and the verifier bought nothing once the
 * run reached here.
 */
function* pruneEndpointShadowsSteps(hits, n, circular, materialise) {
  const buckets = new Map();
  for (let i = 0; i < hits.length; i += 1) {
    if (i > 0 && (i & 1023) === 0) yield;
    const h = hits[i];
    // §4.2.1(5): the identity is the PHYSICAL endpoint, never raw start+span.
    const key = circular ? ((h.start + h.targetSpan) % n) : (h.start + h.targetSpan);
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(h);
  }
  const kept = [];
  let since = 0;
  for (const arr of buckets.values()) {
    since += arr.length;
    if (since >= 1024) { since = 0; yield; }
    // Inside a bucket every interval is [E - span, E) for the shared lifted E, so "strictly
    // nested in either direction" reduces to "spans differ", and rule 6 sees the same E for
    // everyone — which is what makes the result rotation-invariant on a circle. Phase A prunes
    // on counters alone; only survivors that tie get a script (phase B).
    let phase1 = arr;
    if (arr.length > 1) {
      phase1 = [];
      for (const b of arr) {
        let shadowed = false;
        for (const a of arr) {
          if (a === b || a.targetSpan === b.targetSpan) continue;
          if (compareRules16(a, b, 0, 0) < 0) { shadowed = true; break; }
        }
        if (!shadowed) phase1.push(b);
      }
    }
    if (materialise) for (const h of phase1) yield* materialise(h);
    if (phase1.length === 1) { kept.push(phase1[0]); continue; }
    for (const b of phase1) {
      let shadowed = false;
      for (const a of phase1) {
        if (a === b || a.targetSpan === b.targetSpan) continue;
        if (compareCanonical(a, b, 0, 0) < 0) { shadowed = true; break; }
      }
      if (!shadowed) kept.push(b);
    }
  }
  return kept;
}

/**
 * The kernel entry point.
 * @param {string} query ACGT-only; anything else throws `invalid-dna`
 * @param {string} target
 * @param {{thresholdBps?:number, circular?:boolean, bothStrands?:boolean}} opts
 * @returns {Array<object>} occurrences {strand,start,targetSpan,end,M,X,I,D,gapEvents,
 *   alignmentLength,identityBps,script}; `end` is PHYSICAL, (start+span) mod n when circular.
 *
 * PREPARATION IS RESUMABLE TOO. Encoding the target, building the circular overlay and reverse
 * complementing the query are all proportional to their input and all happen BEFORE the scanner's
 * first suspension point. On a megabase molecule that is a measurable stretch during which a cancel
 * cannot be observed at all, so none of it runs in one piece.
 */
export function* findOccurrencesSteps(query, target, opts = {}) {
  const thr = opts.thresholdBps === undefined ? 8000 : requireThresholdBps(opts.thresholdBps);
  const circular = !!opts.circular;
  const bothStrands = opts.bothStrands === undefined ? true : !!opts.bothStrands;

  const qf = encodeQuery(query);
  const m = qf.length;
  const tgt = yield* encodeTargetSteps(String(target));
  const n = tgt.length;
  if (m === 0 || n === 0) return [];

  const maxSpan = Math.min(n, Math.floor(m * 10000 / thr));
  if (maxSpan < 1) return [];

  let ext, extLen;
  if (circular) {
    // §2.7: one bounded overlay, never a second lap around the circle.
    const overlay = Math.min(n - 1, maxSpan - 1);
    extLen = n + overlay;
    ext = new Uint8Array(extLen);
    // Copied in bounded blocks rather than by one `set` over the whole molecule: a typed-array copy
    // is fast per byte but it is still O(n) with no way in.
    for (let base = 0; base < n; base += COPY_CHUNK) {
      if (base > 0) yield;
      const stop = Math.min(n, base + COPY_CHUNK);
      ext.set(tgt.subarray(base, stop), base);
    }
    for (let i = 0; i < overlay; i += 1) {
      if (i > 0 && (i & 65535) === 0) yield;
      ext[n + i] = tgt[i];
    }
  } else {
    ext = tgt; extLen = n;
  }

  // Strands are pruned separately and never merged here: the Occurrence contract has no
  // 'both' value, so §2.6 merging belongs to the layer above.
  const iterBudget = opts.iterationBudget === undefined
    ? defaultIterationBudget(m, maxSpan)
    : requireIterationBudget(opts.iterationBudget);
  const ctl = makeControl(opts, opts.telemetry, n);
  // `finish` runs in a `finally`: a cancelled or budget-starved run is EXACTLY the run whose
  // telemetry a reader wants, and publishing it only on the success path threw away the numbers
  // that explain the refusal.
  let out;
  try {
    out = yield* searchStrandSteps(qf, ext, extLen, n, '+', thr, circular, maxSpan, iterBudget, ctl);
    if (bothStrands) {
      const qr = yield* revCompCodesSteps(qf);
      const minus = yield* searchStrandSteps(qr, ext, extLen, n, '-', thr, circular, maxSpan, iterBudget, ctl);
      for (let i = 0; i < minus.length; i += 1) {
        if (i > 0 && (i & 1023) === 0) yield;
        out.push(minus[i]);
      }
    }
  } finally {
    ctl.finish();
  }
  // The result set again — sorted by a sort that suspends, for the same reason everything else on
  // this path does. Stable, so occurrences that tie on (strand, start) keep the order the strand
  // passes produced them in.
  yield* sortSteps(out, (a, b) => {
    if (a.strand !== b.strand) return a.strand === '+' ? -1 : 1;
    return a.start - b.start;
  });
  return out;
}

/**
 * The same search, drained — the entry point every existing caller and test keeps. It is a DRIVE of
 * the generator above, never a second copy of it, so the synchronous and the cooperative paths
 * cannot disagree about what the kernel found.
 */
export function findOccurrences(query, target, opts = {}) {
  const gen = findOccurrencesSteps(query, target, opts);
  let step = gen.next();
  while (!step.done) step = gen.next();
  return step.value;
}

export default findOccurrences;
