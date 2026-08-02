/**
 * dna-gapped-session-steps — the RESUMABLE core of the production DNA search (U4-CANCEL C1).
 *
 * This is the `EXACT_FIRST → dnaGappedSearchSession → frontier` pipeline itself, expressed ONCE as
 * a generator. There is no second, asynchronous copy of the biology: `dnaGappedSearchSession` is
 * this generator drained without ever suspending, and the worker is the SAME generator drained a
 * slice at a time. Two drains, one algorithm — which is the only way sync and cooperative results
 * can be byte-identical rather than merely intended to be.
 *
 * WHERE IT SUSPENDS, AND WHY THERE. A cancel is only as fast as the longest stretch of
 * uninterruptible work, so the boundaries are INTERIOR:
 *   • inside the Myers sweep, every `SCAN_CHUNK_POSITIONS` text positions
 *     (`dna-approx-scan`) — one 1 Mb molecule is a single document and a single sweep;
 *   • inside the frontier verifier, every `VERIFIER_CHUNK_STATES` expanded DP states
 *     (`dna-gapped-align`) — one repeat-rich locus can burn millions of states in ONE call.
 * Suspending only between documents or between candidates would leave both of those stretches
 * uninterruptible, which is exactly the ~2 s teardown U4 measured.
 *
 * Cancellation is NOT decided here. This module only offers safe points; the drain
 * (`dna-search-cooperative`) decides whether to continue, and unwinds through the `finally` blocks
 * below so stage timers close and the arena reading is recorded even on an abandoned job.
 *
 * Moved out of `dna-gapped-search.js` verbatim except for the generator conversion — the session
 * file was 971 B from its hard size limit, and the pipeline is what had to grow.
 */
import { scanCandidateStartsSteps, scanCandidateStartsSplitSteps } from './dna-approx-scan';
import { alignFromStartSteps, createAlignScratch, VERIFIER_CHUNK_STATES } from './dna-gapped-align';
import { alignFromStartDKey, createDKeyScratch } from './dna-gapped-align-dkey';
import {
  RESOURCE_LIMIT, chargeOutput, makeMeter, resolveBudgets, resolveStateBudget, statsOf,
} from './dna-search-budget';
import {
  occurrenceFrom, pruneEndpointShadows, mergeStrands, canonicalBestIndex, comparePositional,
  physicalEndpointOf,
} from './dna-gapped-occurrence';
import { capLocusEnvelope, isValidLimit } from './search-locus-envelope';
import { sortSteps } from './resumable-sort';

export const INVALID_DNA = 'INVALID_DNA';

const DEFAULT_LIMIT = 1000;
const ACGT = /^[ACGT]+$/;
/** 100% — the edit budget collapses to 0, i.e. the exact-search threshold (§4.2.0). */
const EXACT_THRESHOLD_BPS = 10000;
const COMPLEMENT = { A: 'T', C: 'G', G: 'C', T: 'A' };

/**
 * TARGET normalisation (§2.5): uppercase and NOTHING else. Deliberately not `normalizeSeq`, which
 * rewrites `U`→`T` — that would turn a real base difference into a perfect hit and tell a
 * biologist their construct matches when it does not. Nothing is stripped either: dropping an `N`
 * would silently renumber every downstream coordinate.
 */
export function normalizeDna(s) { return s ? String(s).toUpperCase() : ''; }

/** Reverse complement of a validated A/C/G/T query — concrete pairing, no degeneracy table. */
function reverseComplementAcgt(s) {
  const out = new Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = COMPLEMENT[s[s.length - 1 - i]];
  return out.join('');
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/**
 * Max edits any accepted alignment can carry, for a query of length `q` at threshold `tBps`.
 * identity = M/L ≥ t and M ≤ q ⇒ E = L−M ≤ q(1−t)/t. Exact, not a heuristic.
 */
export function editBudget(q, tBps) {
  const t = Math.max(1, tBps);
  return Math.floor((q * (10000 - t)) / t);
}

/** Longest target span worth considering (§2.7): beyond it every extra base is a `D`. */
export function maxTargetSpan(q, tBps) {
  return Math.floor((q * 10000) / Math.max(1, tBps));
}

/** One strand pass: linear, or circular via a bounded origin overlay (§2.7).
 * `boundBps` is the threshold handed to the aligner's admissible bound; 0 disables it.
 * `kernel` selects the aligner — the production K3.1 frontier, or the K3.2 D-key prototype
 * under evaluation. Both must return byte-identical occurrences; that is what makes swapping
 * them a measurement rather than a change of contract. */
function* strandPassSteps(probe, target, thresholdBps, circular, strand, meter, boundBps, kernel, scratch) {
  const q = probe.length;
  const n = target.length;
  if (q === 0 || n === 0) return [];
  const k = editBudget(q, thresholdBps);
  const mts = maxTargetSpan(q, thresholdBps);
  const spanCap = circular ? Math.min(mts, n) : mts; // §2.7 — no second lap
  const overlap = circular ? Math.min(n - 1, Math.max(0, mts - 1)) : 0;
  const scanTarget = overlap > 0 ? target + target.slice(0, overlap) : target;

  // Both stage timers close in a `finally`: the budget can fire inside either stage, and an
  // incomplete profile that reports `alignMs=0` for a run that spent all its time aligning
  // points the next reader at the wrong stage entirely. A COOPERATIVE cancel unwinds through the
  // same `finally`, so an abandoned job leaves an honest profile rather than a zeroed one.
  const t0 = nowMs();
  let starts;
  try {
    starts = yield* scanCandidateStartsSteps(probe, scanTarget, k, meter);
  } finally {
    meter.scanMs += nowMs() - t0;
  }
  meter.rawStarts += starts.length;
  return yield* verifyStartsSteps({
    probe, scanTarget, starts, k, spanCap, thresholdBps, boundBps,
    circular, strand, n, meter, kernel, scratch,
  });
}

/**
 * Align a candidate START set and reduce it to the §3.2.1-pruned occurrences of one strand.
 *
 * Extracted (U8) so the exact-first pass and the shared-scanner path cannot drift: every rule that
 * decides whether an alignment survives — the acceptance threshold, the no-second-lap guard, one
 * occurrence per start, endpoint-shadow pruning — lives here once. A second copy of this loop is
 * exactly how two routes start disagreeing about biology.
 */
function* verifyStartsSteps({
  probe, scanTarget, starts, k, spanCap, thresholdBps, boundBps,
  circular, strand, n, meter, kernel, scratch,
}) {
  const q = probe.length;
  const t1 = nowMs();
  const byStart = new Map();
  // ── CUMULATIVE verifier allowance (U4-CANCEL C1.1) ───────────────────────────────────────
  // The interior barrier inside `alignFromStart` is per-CALL, and its counter restarts on every
  // candidate. That covers ONE expensive alignment and misses the opposite shape entirely: an 8 kb
  // poly-A repeat yields ~7981 candidates that are each far cheaper than one chunk, so the barrier
  // never fires and the whole verify loop is a single uninterruptible block (measured: 146.8 ms in
  // one `next()`, with a pending cancel unable to run — well past the 100 ms gate).
  //
  // So the allowance is spent ACROSS candidates and only refilled when it is exhausted. It is
  // charged in VERIFIER STATES — the same unit as the §3.3 verifier axis (`meter.verifierUsed`) —
  // rather than in candidates, so a run of cheap alignments and a run of costly ones reach a safe
  // point after comparable WORK. The `+ 1` charges the per-candidate cost itself, so even
  // alignments that accept no state at all (rejected by the bound, or returning null) still drain
  // the allowance and can never form an unbounded uninterruptible run.
  let allowance = VERIFIER_CHUNK_STATES;
  let lastVerifierUsed = meter ? meter.verifierUsed : 0;
  // ONE arena for the whole SESSION, handed in by the caller: buffers amortise across starts and
  // — since U1 — across the `+`/`−` passes too (§4.2.1). Building a fresh scratch per strand threw
  // away the whole warmed arena and re-grew it, doubling cumulative allocation for no benefit; the
  // passes run strictly sequentially, so reuse is safe by construction.
  try {
    for (const s of starts) {
      if (circular && s >= n) continue; // normalized start in 0..n-1 only
      meter.alignCalls += 1;
      const alignOpts = { maxSpan: spanCap, scratch, thresholdBps: boundBps };
      // The production frontier is resumable — it suspends INSIDE its DP. The `dkey` prototype is
      // an evaluation seam no UI path can reach, so it stays a plain synchronous call rather than
      // a second async copy of an algorithm that is not shipped.
      const a = kernel === 'dkey'
        ? alignFromStartDKey(probe, scanTarget, s, k, alignOpts, meter)
        : yield* alignFromStartSteps(probe, scanTarget, s, k, alignOpts, meter);

      // Charged before any `continue`, so EVERY candidate spends the allowance — including the
      // ones that align to nothing. Refill-and-suspend, never reset per call.
      const usedNow = meter ? meter.verifierUsed : 0;
      allowance -= (usedNow - lastVerifierUsed) + 1;
      lastVerifierUsed = usedNow;
      if (allowance <= 0) { allowance = VERIFIER_CHUNK_STATES; yield; }

      if (!a) continue;
      if (a.acceptBps < thresholdBps) continue;
      if (a.targetSpan > n) continue; // belt-and-braces: second lap forbidden (§2.7)
      if (!byStart.has(a.start)) byStart.set(a.start, a);
    }
  } finally {
    meter.alignMs += nowMs() - t1;
  }

  const out = [];
  for (const a of byStart.values()) {
    chargeOutput(meter); // AXIS OUTPUT (§3.3) — a materialised occurrence, not a truncating `limit`
    out.push(occurrenceFrom(a, q, strand, n, circular));
  }
  meter.beforePrune += out.length;

  const t2 = nowMs();
  // §3.2.1 — per strand, before ranking / limit / both-merge.
  const kept = pruneEndpointShadows(out, n, circular);
  meter.pruneMs += nowMs() - t2;
  meter.retained += kept.length;
  return kept;
}

/** Merge two ascending, disjoint start lists into one ascending list. */
function mergeSorted(a, b) {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Array(a.length + b.length);
  let i = 0; let j = 0; let o = 0;
  while (i < a.length && j < b.length) out[o++] = a[i] <= b[j] ? a[i++] : b[j++];
  while (i < a.length) out[o++] = a[i++];
  while (j < b.length) out[o++] = b[j++];
  return out;
}

/**
 * SHARED SCANNER, SPLIT VERIFIER (U8) — one sweep of the molecule, two levels of verification.
 *
 * The rejected single-pass route (U7) was right that the molecule is swept twice and wrong about
 * what to do with it: forcing an exact query through the approximate DP made the cheap common case
 * 2.5× slower and turned a tandem-repeat search from 229 exact loci into `RESOURCE_LIMIT`. The
 * lesson was that the SCAN is the shared work and the DP is not.
 *
 * So: sweep once at the approximate budget, keeping the score-0 candidates apart from the rest.
 * Verify the exact ones on a `k=0` band — one diagonal each, no frontier — and if any survive,
 * return them without ever building the approximate DP. Only when there is nothing exact does the
 * expensive verifier run, and then it runs over the UNION of both candidate sets, because the
 * single-threshold scan it replaces returned exact loci as approximate candidates too.
 *
 * The decision is made on VERIFIED hits, not on candidates: a score-0 candidate can still be
 * discarded (a circular start in the overlay region normalises to a position already covered), and
 * treating "candidates existed" as "exact hits exist" would return an empty answer where the
 * exact-first route falls through to approximate.
 */
function* sharedScannerPassSteps({
  query, target, thresholdBps, circular, bothStrands, meter, boundBps, kernel, scratch,
}) {
  const n = target.length;
  const probes = bothStrands
    ? [[query, '+'], [reverseComplementAcgt(query), '-']]
    : [[query, '+']];

  // ── one sweep per strand, partitioned by distance ─────────────────────────────────────────
  const ctx = [];
  for (const [probe, strand] of probes) {
    const q = probe.length;
    const k = editBudget(q, thresholdBps);
    const mts = maxTargetSpan(q, thresholdBps);
    const spanCap = circular ? Math.min(mts, n) : mts; // §2.7 — no second lap
    const overlap = circular ? Math.min(n - 1, Math.max(0, mts - 1)) : 0;
    const scanTarget = overlap > 0 ? target + target.slice(0, overlap) : target;
    const t0 = nowMs();
    let split;
    try {
      split = yield* scanCandidateStartsSplitSteps(probe, scanTarget, k, meter);
    } finally {
      meter.scanMs += nowMs() - t0;
    }
    meter.rawStarts += split.exact.length + split.approx.length;
    ctx.push({
      probe, strand, q, k, spanCap, scanTarget, split,
    });
  }
  const join = (per) => (per.length === 2 ? mergeStrands(per[0], per[1]) : (per[0] || []));

  // ── level 1: the exact candidates, on a k=0 band ──────────────────────────────────────────
  // `maxSpan = q` and `k = 0` reproduce the dedicated 100% pass exactly; the wider scan overlay is
  // harmless because the span cap, not the target length, bounds the alignment.
  const exactPer = [];
  for (const c of ctx) {
    exactPer.push(c.split.exact.length === 0 ? [] : yield* verifyStartsSteps({
      probe: c.probe,
      scanTarget: c.scanTarget,
      starts: c.split.exact,
      k: 0,
      spanCap: circular ? Math.min(c.q, n) : c.q,
      thresholdBps: EXACT_THRESHOLD_BPS,
      boundBps: EXACT_THRESHOLD_BPS,
      circular,
      strand: c.strand,
      n,
      meter,
      kernel,
      scratch,
    }));
  }
  const exact = join(exactPer);
  if (exact.length > 0) return { occurrences: exact, exactOnly: true };

  // ── level 2: nothing exact → the approximate verifier, over the union ─────────────────────
  const approxPer = [];
  for (const c of ctx) {
    approxPer.push(yield* verifyStartsSteps({
      probe: c.probe,
      scanTarget: c.scanTarget,
      starts: mergeSorted(c.split.exact, c.split.approx),
      k: c.k,
      spanCap: c.spanCap,
      thresholdBps,
      boundBps,
      circular,
      strand: c.strand,
      n,
      meter,
      kernel,
      scratch,
    }));
  }
  return { occurrences: join(approxPer), exactOnly: false };
}

/**
 * Full search session (§3.3) as a RESUMABLE generator. Returns
 * `{ occurrences, incomplete, reason, limitedAxis }`. On resource exhaustion of ANY axis:
 * `occurrences:[]`, `incomplete:true`, `reason:RESOURCE_LIMIT`, and `limitedAxis` naming the axis —
 * every partial sequence hit is discarded (a partial candidate must not be selectable, and a false
 * "0 hits" is worse than an honest incomplete).
 *
 * A query that is not A/C/G/T throws `INVALID_DNA` (§2.5): the UI blocks it long before this, so
 * reaching here means a guard was bypassed, and answering "no matches" would be a lie about the
 * molecule. An EMPTY query is not an error — it is simply no search.
 *
 * @param {{ thresholdBps?:number, limit?:number, bothStrands?:boolean,
 *   circular?:boolean, topology?:'linear'|'circular', stateBudget?:number|null,
 *   budgets?:{ scan?:number|null, verifier?:number|null, traceback?:number|null,
 *              output?:number|null } }} [opts] `budgets` sets the four independent axes; an
 *   omitted axis takes its own default, `null` makes that axis unbounded (§3.3)
 * @throws {Error & {code:'INVALID_DNA'}}
 */
export function* dnaGappedSessionSteps(rawQuery, rawTarget, opts = {}) {
  const query = rawQuery ? String(rawQuery).trim().toUpperCase() : '';
  const target = normalizeDna(rawTarget);
  if (query.length === 0 || target.length === 0) return { occurrences: [], incomplete: false, reason: null };
  if (!ACGT.test(query)) {
    const bad = new Error('INVALID_DNA');
    bad.code = INVALID_DNA;
    throw bad;
  }

  const thresholdBps = opts.thresholdBps ?? 8000;
  // A cap that is not a positive safe integer is a programming error, and it used to change the
  // MEANING of the truncation silently: `slice(0, NaN)` empties the result, while a `length <= limit`
  // guard against the same value lets every occurrence through. Falling back to the documented
  // default keeps the cap a cap in both directions.
  const limit = isValidLimit(opts.limit) ? opts.limit : DEFAULT_LIMIT;
  const bothStrands = opts.bothStrands === true; // engine default single strand (K3 flips it)
  // The admissible bound is ON by default. `disableThresholdBound` exists so the mutation gate
  // can run the SAME search without it: a plain differential cannot catch a broken bound, since
  // with an unlimited budget both variants return identical hits — the difference is only in how
  // many states they burn getting there (§4.2.1).
  const boundBps = opts.disableThresholdBound === true ? 0 : thresholdBps;
  // K3.2 evaluation seam. Production stays on the accepted K3.1 frontier; `kernel:'dkey'` runs
  // the prototype through the SAME pipeline so the two can be compared hit-for-hit rather than
  // by re-deriving the surrounding logic. No UI path sets it.
  const kernel = opts.kernel === 'dkey' ? 'dkey' : 'frontier';
  const circular = opts.circular === true || opts.topology === 'circular';
  // Four independent quotas (§3.3). `stateBudget` survives as the LEGACY combined scan+verifier
  // cap and is armed only when a caller passes it — the K2 budget tests and the K3.1 bound
  // mutation gate deliberately weigh scan positions and DP states on one shared scale.
  const meter = makeMeter(resolveBudgets(opts.budgets), resolveStateBudget(opts.stateBudget));
  const scratch = kernel === 'dkey' ? createDKeyScratch() : createAlignScratch();
  const started = nowMs();
  const profile = (reason) => {
    meter.scratchBytesAllocated = scratch.allocatedBytes || 0;
    return statsOf(meter, query, target, thresholdBps, nowMs() - started, reason);
  };

  try {
    let occ;
    let exactOnly = false;
    if (opts.sharedScanner === true && thresholdBps < EXACT_THRESHOLD_BPS) {
      // U8 evaluation seam — one sweep, two verification levels. Off by default; the route decides.
      const shared = yield* sharedScannerPassSteps({
        query, target, thresholdBps, circular, bothStrands, meter, boundBps, kernel, scratch,
      });
      occ = shared.occurrences;
      exactOnly = shared.exactOnly;
    } else {
      const plus = yield* strandPassSteps(
        query, target, thresholdBps, circular, '+', meter, boundBps, kernel, scratch,
      );
      occ = plus;
      if (bothStrands) {
        const minus = yield* strandPassSteps(
          reverseComplementAcgt(query), target, thresholdBps, circular, '-', meter, boundBps, kernel, scratch,
        );
        occ = mergeStrands(plus, minus);
      }
    }
    // Emitted order is POSITIONAL — the in-molecule list a biologist reads must run along the
    // molecule, not by score. Both facts the caps would destroy are therefore measured HERE, over
    // the complete set, and travel beside the window (P1-2 / P1-3):
    //   locationCount — every occurrence at this point is one physical locus (segments are built in
    //     `occurrenceFrom`, and strand-merge + shadow pruning have already collapsed the duplicates),
    //     so the count is exact BEFORE any truncation;
    //   bestIndex     — the §3.2 winner, decided while the edit `script` still exists. This is the
    //     last point on the production path where rule 7 can run at all.
    // The order itself comes from the ONE shared rule (`comparePositional`), fed the PHYSICAL
    // endpoint on both paths. `o.end` is that endpoint everywhere except one case: a hit finishing
    // exactly at the origin of a circle keeps `n`, because `occurrenceFrom` folds only when the raw
    // end runs STRICTLY past the molecule (it has to — `[start, 0)` is not a drawable segment). Rule
    // 6 and the §3.2.1 pruning key both read `0` there, so ordering by the display end made this one
    // class of hit sort by a different number from the one that decides it — and made the two kernels
    // able to disagree about the order of two spans sharing a start.
    // The sort that applies the rule suspends: this array is the whole result set, so
    // `Array.prototype.sort` here would be the single largest uninterruptible block on the path.
    const physEnd = (o) => physicalEndpointOf(o.start, o.metrics.targetSpan, target.length, circular);
    yield* sortSteps(occ, (x, y) => comparePositional(x.start, physEnd(x), x.strand, y.start, physEnd(y), y.strand));
    const full = {
      occurrences: occ,
      locationCount: occ.length,
      bestIndex: canonicalBestIndex(occ, target.length, circular),
    };
    // ONE capping rule, shared with the orchestrator's own cap: keep a positional prefix, but move
    // the winner into the last slot rather than lose it. Its start is ≥ every start already inside,
    // so the window stays ascending. `limit` is not raised.
    const capped = capLocusEnvelope(full, limit);
    const done = {
      occurrences: capped.occurrences,
      locationCount: capped.locationCount,
      bestIndex: capped.bestIndex,
      incomplete: false,
      reason: null,
      limitedAxis: null,
      exactOnly,
    };
    // Wall-clock is opt-in: the session itself MUST stay deterministic (§3.3), so timings are
    // attached only for the bench profile, never in the shape ordinary callers compare.
    if (opts.collectStats) done.stats = profile(null);
    return done;
  } catch (err) {
    if (err && err.code === RESOURCE_LIMIT) {
      const bail = {
        occurrences: [],
        locationCount: 0,
        bestIndex: -1,
        incomplete: true,
        reason: RESOURCE_LIMIT,
        limitedAxis: err.axis ?? meter.limitedAxis ?? null,
      };
      if (opts.collectStats) bail.stats = profile(RESOURCE_LIMIT);
      return bail;
    }
    throw err;
  }
}
