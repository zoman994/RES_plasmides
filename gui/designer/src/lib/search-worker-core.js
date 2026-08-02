/**
 * search-worker-core — pure, worker-portable sequence search (P1.5).
 *
 * The benchmark put the sequence dimension at ~385-408 ms on a 1 MB corpus (gate
 * 50 ms) → it must run off the main thread. This module is that work, kept pure so
 * it is unit-testable and identical whether called in a worker or (fallback) inline.
 * One call searches ONE query across MANY documents → one worker round-trip per
 * search, not per document.
 *
 * No incremental index (DEC: keep the worker simple) — each search is a full scan.
 *
 * ── U1: the alignment route is decided over the COLLECTION, not per document (§4.2.0) ──
 * `seqMatch` answers about ONE molecule, and its `REQUIRES_ALIGNMENT` throw is a correct answer
 * to that question: «this molecule holds no exact hit, and the query is too long to compare
 * approximately». It is NOT an answer about the library. Letting it unwind this loop made the
 * FIRST document that could not answer the verdict for every document after it — including
 * documents holding a perfect exact hit that were then never scanned. A biologist pasting an
 * insert that IS in their library was sent to the alignment workflow, and the answer depended on
 * the order the documents happened to arrive in.
 *
 * The normative order, evaluated over ALL eligible documents:
 *
 *   run the exact pass over every eligible document — any length, no upper limit
 *     ├─ any pass did not complete        → incomplete (typed, thrown eagerly)
 *     ├─ exact hits found anywhere        → return THOSE, and nothing approximate beside them
 *     └─ nothing exact anywhere, and then
 *          ├─ threshold is 100 %          → honest empty: the exact pass WAS the requested search
 *          ├─ query > 100 nt              → REQUIRES_ALIGNMENT (a route, never a miss)
 *          └─ otherwise                   → run the approximate pass over every eligible document
 */
import {
  seqMatchExactSteps, seqMatchApproxSteps, resolveCircular, REQUIRES_ALIGNMENT,
  toThresholdBps, MAX_APPROX_QUERY_LEN, EXACT_BPS,
} from './seq-match';
import { finalizeSequenceOccurrences } from './search-sequence-contract';
import { drainSync } from './dna-search-cooperative';

/**
 * The ONLY outcomes allowed to cross the worker boundary as data. Each is a verdict the engine
 * produces on purpose; everything else is a defect and must look like one.
 * Kept as a literal set here (not imported from the engine) so widening it is a visible decision.
 */
const EXPECTED_CODES = new Set([REQUIRES_ALIGNMENT, 'RESOURCE_LIMIT', 'INVALID_DNA']);

/**
 * Search ONE query across MANY documents and decide the corpus verdict.
 *
 * Order-invariance is structural, not incidental:
 *   • a route signal is BUFFERED, never published from inside the loop, so it can only ever be
 *     the verdict once every eligible document has been swept — no early exit can publish it;
 *   • any other typed failure (RESOURCE_LIMIT from an incomplete pass, INVALID_DNA from the
 *     query itself) propagates AT ONCE. That is what makes «incomplete dominates» free of order:
 *     the route is unpublishable until the sweep finishes, so an unscannable document anywhere
 *     pre-empts it, and the already-collected `byId` is discarded rather than published as a
 *     confirmed partial answer (§3.3 — never a false zero, never a half-truth).
 *
 * @param {string} seqQuery
 * @param {Array<{id:string, seq:string, topology?:string}>} docs
 * @param {Object} [ctx] — bothStrands / identityThreshold / limit / stateBudget
 * @returns {Object<string, {occurrences:Array, locationCount:number, bestIndex:number}>} docId →
 *   locus envelope (only docs that hit) — see `search-locus-envelope.js`
 * @throws {Error & {code:'REQUIRES_ALIGNMENT'}} only when EVERY eligible document completed its
 *   exact pass with zero hits; carries `maxApproxLength` / `queryLength` for the UI message
 * @throws {Error & {code:'RESOURCE_LIMIT'|'INVALID_DNA'}} propagated from the engine unchanged
 */
export function* searchAllSequencesSteps(seqQuery, docs, ctx = {}) {
  if (!seqQuery || !Array.isArray(docs)) return {};
  // Not eligible: no id to key on, or no sequence to search. Skipping is not «completed with no
  // hit» — an ineligible document must not be able to argue for the route either way.
  const eligible = docs.filter((d) => d && d.id && d.seq);

  /**
   * One phase over the whole corpus.
   *
   * A SUSPENSION POINT PER DOCUMENT, independent of what the kernel does inside one. The shipped
   * kernel suspends inside a molecule (in its Myers sweep and again in its verifier), so this
   * changes nothing for it. It matters for any kernel that does not: without it, a corpus sweep
   * whose per-document call never yields runs the WHOLE library as one uninterruptible block, and
   * `drainCooperative` gets `done` on its first `next()` — no slice boundary, no place to observe a
   * cancel. Measured on the experimental linear kernel exactly so: 20 cancels issued, 0 acknowledged.
   */
  const sweep = function* phase(run) {
    const byId = {};
    let found = false;
    let routed = null; // first route signal seen; published only if the whole sweep finds nothing
    for (const d of eligible) {
      yield;
      let occ;
      try {
        occ = yield* run(seqQuery, { seq: d.seq, topology: d.topology }, ctx);
      } catch (err) {
        if (err && err.code === REQUIRES_ALIGNMENT) { routed = routed || err; continue; }
        throw err;
      }
      // Finalize UNCONDITIONALLY — emptiness is decided by the finalizer, not by a raw `.length`
      // peek. A broken engine returning `{}`, `''` or `{length:0}` has a falsy/zero `.length` and
      // would have slipped through a pre-check as an honest miss; only `finalizeSequenceOccurrences`
      // can tell a genuine empty ARRAY (a real miss) from malformed non-array garbage. It proves
      // every hit is TRUE for THIS document and query; a malformed one throws
      // MALFORMED_SEQUENCE_RESULT (not an expected verdict), discarding the `byId` already
      // collected — a half-truth is never published as a confirmed answer (§3.3).
      const circular = resolveCircular(ctx.circular, d.topology);
      const finalized = finalizeSequenceOccurrences(occ, { sequenceLength: d.seq.length, circular, queryLength: seqQuery.length });
      // The value written per document is the ENVELOPE, not a bare array: `locationCount` was
      // measured before the engine's payload cap and `bestIndex` while the edit script existed, and
      // this is the one function the worker thread, the inline fallback and the in-molecule popover
      // all run — so dropping either here would drop it for every surface at once.
      if (!finalized.occurrences.length) continue; // a genuine empty window is an honest miss
      byId[d.id] = finalized;
      found = true;
    }
    return { byId, found, routed };
  };

  // ── PHASE ONE: exact, across the WHOLE library ────────────────────────────────────────────────
  //
  // This ordering is the contract, and it used to be only a comment: the loop called a per-molecule
  // routine that ran exact-then-approximate inside each document, so document A's approximate pass
  // happened before document B's exact pass was even attempted. On the real base that let ONE
  // repeat-rich plasmid exhaust its budget and discard an exact hit sitting later in the library.
  // «Is there an exact hit anywhere» cannot be answered one molecule at a time.
  const exact = yield* sweep(seqMatchExactSteps);
  if (exact.found) return exact.byId;

  // A 100 % request WAS the exact pass, so an empty result is a real, complete answer.
  if (toThresholdBps(ctx.identityThreshold) >= EXACT_BPS) return {};

  // ── PHASE TWO: approximate, only now that the library has no exact hit at all ─────────────────
  // Above the §4.2.0 length limit the approximate verifier must not run, and the route is published
  // for the corpus rather than per document — it is the library that has no exact hit, not one
  // molecule.
  if (seqQuery.length > MAX_APPROX_QUERY_LEN) {
    const err = new Error(REQUIRES_ALIGNMENT);
    err.code = REQUIRES_ALIGNMENT;
    err.maxApproxLength = MAX_APPROX_QUERY_LEN;
    err.queryLength = seqQuery.length;
    throw err;
  }
  const approx = yield* sweep(seqMatchApproxSteps);
  if (!approx.found && approx.routed) throw approx.routed;
  return approx.byId;
}

/**
 * The corpus sweep drained synchronously — the entry point for the inline fallback and every test.
 * Identical instruction sequence to the cooperative drive; only the pausing differs.
 * @returns {Object<string, {occurrences:Array, locationCount:number, bestIndex:number}>} docId →
 *   locus ENVELOPE (only docs that hit) — not a bare array. `locationCount` was measured before the
 *   payload cap and `bestIndex` while the edit script still existed, so neither is recoverable here.
 */
export function searchAllSequences(seqQuery, docs, ctx = {}) {
  return drainSync(searchAllSequencesSteps(seqQuery, docs, ctx));
}

/**
 * Classify a thrown engine outcome for the worker boundary (U4-CANCEL C2).
 *
 * ONLY the three deliberate verdicts are answers. Anything else is a fault and must look like one:
 * the caller re-throws it so the worker tears down, rather than dressing a defect up as a normal
 * reply and keeping a suspect thread in service.
 *
 * @returns {{ code:string, maxApproxLength?:number, queryLength?:number } | null} the serialisable
 *   error payload, or null when the throw is NOT an expected verdict (⇒ treat as a fault)
 */
export function expectedVerdictPayload(err) {
  if (!EXPECTED_CODES.has(err && err.code)) return null;
  // Plain data only, and no `message`: raw Error text must not cross the boundary (it is not
  // localizable, can carry internals, and nothing downstream is allowed to display it anyway).
  const error = { code: err.code };
  if (err.code === REQUIRES_ALIGNMENT) {
    error.maxApproxLength = err.maxApproxLength;
    error.queryLength = err.queryLength;
  }
  return error;
}

/**
 * Worker message handler — echoes `id` so the client can correlate responses.
 *
 * A TYPED failure is part of the answer, not a crash. Letting the throw escape (as this did) means
 * it surfaces as the worker's `onerror`, where the DOM hands over an ErrorEvent — a message string
 * and nothing else. `code`, `maxApproxLength` and `queryLength` do not survive that boundary, so
 * every typed outcome arrived on the main thread indistinguishable from «the worker died».
 *
 * The §4.2.0 route was the casualty: a >100 nt query was reported as a failed check («could not
 * verify») instead of «this needs alignment, here is the way there» — the notice, and the action
 * beside it, were unreachable in the shipped app while every test passed, because tests run the
 * INLINE engine, where the throw keeps its properties. Serialising the code here is what makes the
 * route real off-thread; `RESOURCE_LIMIT` and `INVALID_DNA` stop being mislabelled as crashes too.
 */
export function handleSearchMessage(data) {
  const { id, seqQuery, docs, ctx } = data || {};
  try {
    return { id, byId: searchAllSequences(seqQuery, docs, ctx) };
  } catch (err) {
    // ONLY the three deliberate verdicts are answers. Anything else is a fault and is RE-THROWN,
    // so it reaches the worker's `onerror` and the thread is torn down — serialising it would
    // have dressed a genuine defect up as a normal reply and kept a suspect worker in service.
    const error = expectedVerdictPayload(err);
    if (!error) throw err;
    return { id, error }; // never alongside `byId` — a verdict and a partial answer are exclusive
  }
}
