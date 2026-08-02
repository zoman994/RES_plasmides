/**
 * seq-match — the sequence-dimension provider: the `ctx.seqMatch` that library-search (and the
 * search worker) inject. It adapts ONE unified DNA engine to the SearchOccurrence contract, so
 * the orchestrator stays engine-agnostic (SEARCH-GAPPED-DNA K3, SPEC §4.1).
 *
 * K3 removed the old two-engine ROUTING: `identityThreshold` is the only acceptance control
 * (`maxMismatches` no longer executes anywhere in DNA search, §5.1), and substitutions, insertions
 * and deletions are penalised by ONE formula (§2.3), for every query — short or long, linear or
 * circular, one strand or both.
 *
 * TWO PHASES, ONE BIOLOGY (U6-E1). A search is an exact phase and, only if that finds nothing, an
 * approximate one. They are separate generators here because exact-first is a rule about a LIBRARY:
 * `searchAllSequencesSteps` must finish the exact phase across every document before any approximate
 * work starts, and that ordering cannot be expressed while the two are welded together inside one
 * call. The approximate phase is `dnaGappedSessionSteps`; the exact phase is `dna-literal-exact`,
 * which answers the 100 % question directly instead of running the bit-parallel engine with a zero
 * edit budget. Both produce the same occurrence layer, and the two are proven envelope-identical.
 *
 * Resource exhaustion is NOT a miss: an incomplete session throws a typed error
 * (`err.code === RESOURCE_LIMIT`) so the worker/facade can publish an honest `incomplete`
 * instead of a false "no matches" (§3.3). BOTH phases can raise it, on different axes: the
 * approximate phase can exhaust verifier and traceback as well as scan and output; the literal exact
 * phase has no DP state to spend, so it answers for scan and output only. Pure and synchronous — no
 * module state, so cancel / stale-drop stay owned by the worker client.
 */
import { RESOURCE_LIMIT } from './dna-gapped-search';
import { dnaGappedSessionSteps } from './dna-gapped-session-steps';
import { drainSync } from './dna-search-cooperative';
import { getSequenceKernel, SEQUENCE_KERNEL } from './sequence-kernel-seam';
import { getSequenceRoute, SEQUENCE_ROUTE } from './sequence-route-seam';
import { runLinearSequenceSearchSteps } from './dna-linear-provider';
// The §4.2.0 length limit and the ONE topology rule live in a kernel-free leaf so the MAIN-THREAD
// client can import them WITHOUT pulling this engine module (and its kernel) onto the main thread.
// Re-exported here so existing importers of `seq-match` are unchanged.
import { MAX_APPROX_QUERY_LEN, resolveCircular } from './sequence-search-policy';
import { isValidLimit, capLocusEnvelope } from './search-locus-envelope';
import { literalExactSessionSteps } from './dna-literal-exact';

export { MAX_APPROX_QUERY_LEN, resolveCircular };

const DEFAULT_THRESHOLD_BPS = 8000;
const DEFAULT_LIMIT = 500;
/**
 * 100 % identity in the engine's integer basis points. Exported because the CORPUS route has to ask
 * the same question the molecule route asks — «was this an exact request?» — and a second literal
 * `10000` in another file is a contract duplicated by copy.
 */
export const EXACT_BPS = 10000;
/** «Nothing here», in the envelope shape — an honest miss still has to answer both questions. */
const EMPTY_ENVELOPE = Object.freeze({ occurrences: [], locationCount: 0, bestIndex: -1 });

/**
 * A longer query was NOT compared approximately — a separate route, never a miss. The distinction
 * is the whole point: "nothing found" for a 400-mer would assert the sequence is absent from
 * the library, when in fact only the exact pass ran.
 */
export const REQUIRES_ALIGNMENT = 'REQUIRES_ALIGNMENT';

/**
 * The ONE conversion from a user `identityThreshold` to the engine's integer basis points
 * (§5.1), shared by every surface so global search and the in-molecule popover can never
 * disagree about what «80%» means.
 *
 * Anything non-finite (undefined / null / NaN / Infinity / a string) is not a threshold and
 * falls back to the default; a finite value is clamped to 0.5..1 and rounded ONCE.
 * @param {unknown} v
 * @returns {number} integer basis points, 5000..10000
 */
export function toThresholdBps(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_THRESHOLD_BPS;
  return Math.round(Math.min(1, Math.max(0.5, v)) * 10000);
}

/**
 * Everything the two phases need, resolved once from `ctx`.
 *
 * The phases exist because exact-first is a rule about a LIBRARY, not about a molecule: a corpus
 * must finish its exact sweep everywhere before any approximate work starts, and that ordering is
 * impossible to express while exact and approximate are welded together inside one call. Splitting
 * them here — rather than giving the corpus its own copy — is what keeps one biology: both the
 * single-molecule route below and the corpus route in `search-worker-core.js` drive these same
 * generators, so they cannot drift apart.
 *
 * @returns {null | {thresholdBps:number, common:Object, enginePass:Function, routeOut:Function}}
 *   `null` when there is nothing to search at all.
 */
function phaseSetup(query, sequence, ctx) {
  const seq = sequence && sequence.seq;
  if (!query || !seq) return null;
  // circular-search pref: 'on'/'off' override the doc topology; 'auto' follows it.
  const circular = resolveCircular(ctx.circular, sequence.topology);
  const common = {
    bothStrands: ctx.bothStrands !== false, // product default: both strands
    // Validated, not merely defaulted: `0` / `NaN` / `'500'` are programming errors that used to
    // change what the cap MEANS, and this surface's default (500) differs from the engine's, so an
    // invalid value must resolve here rather than fall through to a different number.
    circular,
    limit: isValidLimit(ctx.limit) ? ctx.limit : DEFAULT_LIMIT,
    stateBudget: ctx.stateBudget,
    // Carried through so BOTH phases meter against the same quotas. The engine already read
    // `opts.budgets`; the literal exact pass has to see them too, or the exact phase would be the
    // one part of a search that spends resources without answering for them.
    budgets: ctx.budgets,
  };

  /** An incomplete pass is never a silent zero (§3.3): the worker turns this into a typed reply. */
  const guard = (session) => {
    if (!session.incomplete) return session;
    const err = new Error('SEQUENCE_SEARCH_INCOMPLETE');
    err.code = session.reason || RESOURCE_LIMIT;
    throw err;
  };
  // The engine's two measured facts ride ALONG with the window (P1-2 / P1-3). They are copied, never
  // recomputed: `locationCount` was taken before the payload cap and `bestIndex` while the edit
  // script still existed, and neither is derivable from the compact occurrences below.
  const emit = (session) => ({
    occurrences: session.occurrences.map((o) => ({
      location: { segments: o.segments, strand: o.strand, wrapsOrigin: o.wrapsOrigin },
      // `editRuns` is CANONICAL metrics data (§3.1), not an optional sibling of the occurrence:
      // the boundary validator, the §3.2 tie-break and the overlay's indel markers all read it here.
      metrics: { ...o.metrics, editRuns: o.editRuns },
    })),
    locationCount: session.locationCount,
    bestIndex: session.bestIndex,
  });

  // ONE engine pass → the canonical locus envelope, engine-agnostic. The routing around it is
  // identical whichever kernel runs; only THIS swaps. The seam defaults to the LINEAR kernel
  // (U6-F.2, on measurement), and a forced selection is how the production engine is reached for
  // parity tests and differentials. There is no user setting either way.
  const enginePass = function* pass(passThresholdBps, extra) {
    if (getSequenceKernel() === SEQUENCE_KERNEL.LINEAR) {
      // `yield*`, not a call: the linear kernel is resumable now, and driving it synchronously here
      // would re-create exactly the condition that kept it out of production — a thread held for the
      // whole molecule, with no point at which a worker can observe a cancel.
      //
      // What comes back is already the ENVELOPE, in the one shape both kernels answer in: a
      // positional window with the §3.2 winner named by index. This used to re-derive both here —
      // re-sorting the ranked array and calling its old first element the winner — which is how a
      // second, subtly different contract for «which locus is canonical» came to exist. It is now
      // decided once, at the boundary that still holds the edit scripts.
      const envelope = yield* runLinearSequenceSearchSteps(query, seq, { ...common, thresholdBps: passThresholdBps });
      // The cap is applied HERE, through the same `capLocusEnvelope` the production path uses:
      // `locationCount` must say how many loci exist while the payload says how many are shown, and
      // the declared winner has to survive the truncation.
      return capLocusEnvelope(envelope, common.limit);
    }
    return emit(guard(yield* dnaGappedSessionSteps(query, seq, {
      ...common, thresholdBps: passThresholdBps, ...extra,
    })));
  };

  const routeOut = () => {
    const err = new Error(REQUIRES_ALIGNMENT);
    err.code = REQUIRES_ALIGNMENT;
    err.maxApproxLength = MAX_APPROX_QUERY_LEN;
    err.queryLength = query.length;
    throw err;
  };

  /**
   * The EXACT pass, answered literally rather than by the approximate machinery.
   *
   * At 100 % the gapped engine's edit budget is zero, so its band collapses to the diagonal and it
   * performs — mathematically — a substring search, but it performs it with the bit-parallel
   * apparatus. On the real plasmid base that costs 2.6–3.4 s for the most ordinary search there is.
   * `dna-literal-exact` answers the same question with `indexOf` and is proven identical envelope
   * for envelope (`u6e1-literal-exact-differential`), so nothing downstream can tell them apart.
   *
   * It narrows, but does not remove, where RESOURCE_LIMIT can arise in the exact phase: a literal
   * scan spends no verifier and no traceback, because there is no DP state and no alignment to walk
   * back, but it does spend SCAN (positions examined) and OUTPUT (occurrences materialised) and is
   * metered for both. An exact phase can still be legitimately incomplete.
   */
  const exactPass = function* exact() {
    return emit(guard(yield* literalExactSessionSteps(query, seq, common)));
  };

  return {
    thresholdBps: toThresholdBps(ctx.identityThreshold), common, enginePass, exactPass, routeOut,
  };
}

/**
 * PHASE ONE — exact only. Never routes out, never falls through to approximate.
 *
 * A caller that wants the §4.2.0 decision calls `seqMatchSteps`; a caller that owns a corpus calls
 * this for every document first, because «is there an exact hit ANYWHERE» cannot be answered one
 * molecule at a time.
 */
export function* seqMatchExactSteps(query, sequence, ctx = {}) {
  const setup = phaseSetup(query, sequence, ctx);
  if (!setup) return EMPTY_ENVELOPE;
  return yield* setup.exactPass();
}

/**
 * PHASE TWO — approximate only. The caller has already established that no exact hit exists and
 * that the query is short enough; the length limit is re-checked here because a phase that quietly
 * ran a 400-mer through the approximate verifier would break §4.2.0 from the inside.
 */
export function* seqMatchApproxSteps(query, sequence, ctx = {}) {
  const setup = phaseSetup(query, sequence, ctx);
  if (!setup) return EMPTY_ENVELOPE;
  if (query.length > MAX_APPROX_QUERY_LEN) setup.routeOut();
  if (setup.thresholdBps >= EXACT_BPS) return EMPTY_ENVELOPE; // 100 % has no approximate phase
  const shared = getSequenceRoute() === SEQUENCE_ROUTE.SHARED_SCANNER;
  return yield* setup.enginePass(setup.thresholdBps, shared ? { sharedScanner: true } : undefined);
}

/**
 * ONE MOLECULE, the §4.2.0 route — exact, then approximate or the alignment route.
 *
 * @param {string} query — A/C/G/T DNA query (§2.5); anything else is rejected, not coerced
 * @param {{ seq:string, topology?:string }|null} sequence — the doc's sequence
 * @param {Object} [plan] — QueryPlan (unused; reserved for intent hints)
 * @param {Object} [ctx] — { identityThreshold, bothStrands, circular, limit, stateBudget }
 * @returns {{occurrences:Array<{location:Object, metrics:Object}>, locationCount:number,
 *   bestIndex:number}} the RETAINED window plus the two facts the payload cap would destroy:
 *   how many loci exist (measured before the cap) and which retained one is the §3.2 winner.
 * @throws {Error & {code:'RESOURCE_LIMIT'}} when the scan could not complete
 * @throws {Error & {code:'INVALID_DNA'}} when a non-ACGT query bypassed the UI guard
 * @throws {Error & {code:'REQUIRES_ALIGNMENT'}} when a >100 nt query has no exact hit (§4.2.0) —
 *   a ROUTE, not a miss: the caller must offer the alignment workflow, never "0 results"
 *
 * RESUMABLE. Every route decision is a generator delegating into the session core's own suspension
 * points, so `seqMatch` drains it without ever suspending while the worker drives the same generator
 * a slice at a time — sync and cooperative can never disagree about what a molecule needs.
 *
 * This is the in-molecule question («where is it in THIS sequence»), and it is answered by
 * sequencing the two phase primitives above. A LIBRARY is a different question and is sequenced
 * differently, by `searchAllSequencesSteps`: there the exact phase must finish across every
 * document before any approximate work begins, so that one awkward molecule cannot bury an exact
 * hit that sits later in the corpus. Both routes drive the same two generators; only the ordering
 * differs, and it has to.
 */
export function* seqMatchSteps(query, sequence, plan, ctx = {}) {
  const setup = phaseSetup(query, sequence, ctx);
  if (!setup) return EMPTY_ENVELOPE;
  const { thresholdBps, common, enginePass, routeOut } = setup;
  const approximatePossible = thresholdBps < EXACT_BPS && query.length <= MAX_APPROX_QUERY_LEN;

  // ── SINGLE-PASS route (prototype, opt-in) ─────────────────────────────────────────────────
  // A whole-molecule fusion of both phases: it cannot be expressed as «phase one then phase two»,
  // which is exactly why it stays here, at the single-molecule route, and why the corpus route does
  // not use it. Off by default; no UI path reaches it.
  if (getSequenceRoute() === SEQUENCE_ROUTE.SINGLE_PASS && approximatePossible) {
    const hits = yield* enginePass(thresholdBps);
    const exact = hits.occurrences.filter((h) => h.metrics.identity === 1);
    if (exact.length === 0) return hits;
    // PARITY GUARD. `limit` truncates the ranking by START position, so on a repeat-rich molecule
    // an exact hit could sit past the cap — invisible here, yet found by a dedicated exact pass
    // (whose own cap counts only exact hits). Only when the cap was actually reached do we pay
    // for that pass, so the common case stays single-pass and the corner stays correct.
    if (hits.occurrences.length >= common.limit) return yield* enginePass(EXACT_BPS);
    // Filtering is a NEW question («only the exact ones»), so the answer is re-measured against the
    // filtered set: the count is what survived, and the declared winner carries over only if it is
    // one of them — a winner that was filtered out cannot go on being called the winner.
    const bestOcc = hits.bestIndex >= 0 ? hits.occurrences[hits.bestIndex] : null;
    return { occurrences: exact, locationCount: exact.length, bestIndex: exact.indexOf(bestOcc) };
  }

  // ── 1. EXACT FIRST, at any length (§4.2.0) ────────────────────────────────────────────────
  const exactHits = yield* setup.exactPass();
  if (exactHits.occurrences.length > 0) return exactHits;

  // At a 100% threshold the exact pass WAS the requested search, so an empty result is a real,
  // complete answer — routing it to alignment would claim we did not look when we exhaustively did.
  if (thresholdBps >= EXACT_BPS) return EMPTY_ENVELOPE;

  // ── 2. no exact hit → approximate, or route out ───────────────────────────────────────────
  if (query.length > MAX_APPROX_QUERY_LEN) routeOut();
  return yield* seqMatchApproxSteps(query, sequence, ctx);
}

/**
 * The §4.2.0 route, drained synchronously — the entry point every existing caller keeps.
 * @returns {{occurrences:Array, locationCount:number, bestIndex:number}}
 */
export function seqMatch(query, sequence, plan, ctx = {}) {
  return drainSync(seqMatchSteps(query, sequence, plan, ctx));
}
