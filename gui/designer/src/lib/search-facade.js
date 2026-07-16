/**
 * search-facade — the assembled search entry point for the UI (P1.5).
 *
 * Composes the pieces built across P1/P1.5 into one object the UI calls:
 *   • classifyQuery       — raw string → QueryPlan,
 *   • search-service      — monotonic requestId, stale-drop, instant metadata
 *                           `partial` before the async `final`,
 *   • worker client       — the sequence dimension off the main thread (the
 *                           benchmark put it at ~400 ms/1 MB); inline fallback when
 *                           no Worker is available,
 *   • runSearch           — metadata dims synchronously + the precomputed sequence
 *                           occurrences (keyed by doc id).
 *
 * The UI supplies `documents` (SearchDocuments from the store) per search and a
 * Worker instance once. Protein (`aa:`) runs INLINE (main thread): it needs the
 * whole doc — sequence AND features — which the DNA worker payload strips, and
 * it is CDS-directed so the cost is bounded to annotated genes.
 */
import { createSearchService } from './search-service';
import { createSearchWorkerClient } from './search-worker-client';
import { classifyQuery } from './query-classify';
import { runSearch, filterDocumentsByScope, planIsBlocked, planBlockingErrors } from './library-search';
import { entityRefKey } from './search-entity-key';
import { makeProteinMatch } from './protein-match';
import { makeReMatch } from './re-match';
import { createProviderFailureTracker, isSupersededFailure } from './search-provider-failures';
import { validateProviderOccurrences } from './search-provider-contract';

/**
 * @param {{ workerFactory?: (()=>(object|null)), worker?: object, allowInlineFallback?:boolean }} [deps] — prefer
 *   `workerFactory` (a `() => Worker`, so the client can terminate + recreate a stuck
 *   worker). A bare `worker` instance is accepted (wrapped as a one-shot factory) for
 *   back-compat. Omit both for the inline main-thread fallback.
 */
export function createSearchFacade({ workerFactory, worker, allowInlineFallback } = {}) {
  const factory = typeof workerFactory === 'function'
    ? workerFactory
    : (worker ? () => worker : null);
  const workerClient = createSearchWorkerClient(factory, { allowInlineFallback });

  // Instant metadata pass — name/tag/type/status/feature only (no sequence engine). REV #2 S3-CLOSE
  // K1: pass the user ctx (so the partial honours opts.limit etc.) but force 'deferred' AFTER the
  // spread so a metadata candidate (e.g. a name hit for a `seq:`/`aa:`/`cut:` mixed query) is SHOWN
  // while still verifiable — the strict final (below) then confirms or removes it.
  const runMetadata = (plan, documents, ctx) => runSearch(plan, documents, { ...ctx, providerPolicy: 'deferred' });

  // Full resolve — sequence dim computed off-thread, then folded into runSearch via
  // a precomputed injector keyed by doc id (matchDocument passes `doc` last).
  const resolve = async (plan, documents, ctx) => {
    // ONE failure tracker per search — every provider reports through it, so «the check did not
    // run» reaches the session identically whether it was the worker, the translator or the
    // cut-site scanner that broke (S3-CLOSE K2.3).
    const failures = createProviderFailureTracker();
    let byId = null;
    if (plan.seqQuery) {
      try {
        byId = await workerClient.searchSequences(plan.seqQuery, documents, ctx);
      } catch (err) {
        byId = null;
        // ONLY a superseded search (CANCELLED / TERMINATED) is a normal drop — the service
        // stale-drops it, so the user is never told. ANY other cause (crash, timeout, garbage
        // reply, unavailable worker, inline-engine throw) means the dim did NOT run.
        if (!isSupersededFailure(err)) failures.record('sequence', err);
      }
    }
    const seqMatch = byId
      // Look up by the composite `<kind>:<id>` (§10.4) the worker keyed on — never the bare
      // ref.id, or a same-id entry/primer would read each other's occurrences.
      ? (_q, _seqDoc, _plan, _ctx, doc) => (doc && byId.get(entityRefKey(doc.ref))) || []
      : undefined;
    // Protein (aa:) — CDS-directed, splice-aware, inline; library-search hands it the whole doc
    // so it can translate the annotated CDS. Enzyme (cut:/re:) — a whole-doc cut-site scan;
    // single source `cutQuery || reQuery` (S3-CLOSE K1 P2) so a modern-only plan runs too.
    //
    // Both are GUARDED (K2.3): a throw while building, a throw mid-scan, or a non-array return is
    // recorded as a failure instead of escaping resolve() as a rejection — search-service has no
    // `.catch`, so an escaped throw meant NO final callback at all: a spinner forever, unconfirmed
    // candidates the user could not resolve, and an unhandled rejection in the console.
    // K3.0 — the guard now validates STRUCTURE, not just «is it an array»: every hit is checked
    // against the length of the document it claims to be on, and a provider-owned `targetRef` is
    // refused outright (library-search's `{ targetRef: doc.ref, ...o }` spread would let it
    // re-attribute the hit to another molecule). library-search calls protein/enzyme matchers as
    // `(query, doc, plan, ctx)` → the doc, and therefore the sequence length, is at index 1.
    const validateAgainstDoc = (out, args) => {
      const doc = args[1];
      const seq = doc && doc.sequence && doc.sequence.seq;
      // A doc with no sequence has no length: `[]` stays a valid honest miss, any claimed hit
      // does not (validateProviderOccurrences enforces exactly that).
      return validateProviderOccurrences(out, typeof seq === 'string' ? seq.length : undefined);
    };
    const proteinMatch = plan.aaQuery
      ? failures.guard('protein', () => makeProteinMatch(ctx || {}), validateAgainstDoc)
      : undefined;
    const reMatch = (plan.cutQuery || plan.reQuery)
      ? failures.guard('enzyme', () => makeReMatch(ctx || {}), validateAgainstDoc)
      : undefined;

    // Documents are NOT pre-scanned: the providers run inside runSearch, so scope + explicit
    // filters have already thinned the set and a weak machine never translates a CDS that a
    // `type:`/`in:` filter was about to drop anyway.
    // providerPolicy is assigned AFTER the spread — an external ctx.providerPolicy can never
    // weaken the contract (S3-CLOSE K1 P1-2).
    const run = (providerPolicy) => runSearch(plan, documents, {
      ...ctx, seqMatch, proteinMatch, reMatch, providerPolicy,
    });

    if (!failures.hasFailures()) {
      const strict = run('required');
      // Nothing broke → a trustworthy strict AND. snapshot() normalizes the session to an
      // explicit complete (incomplete:false, no dims, no failures) so a stale flag can't linger.
      if (!failures.hasFailures()) return { ...strict, ...failures.snapshot() };
      // A matcher threw MID-SCAN: the strict pass already dropped every doc whose dim it could
      // not compute, so that session is unusable — discard it whole rather than publish a
      // half-verified subset as confirmed (conservative K2 policy). The failed matcher is now a
      // no-op, so the re-run is cheap and uniform: nobody gets a partial confirmation.
    }
    return { ...run('deferred'), ...failures.snapshot() };
  };

  const service = createSearchService({ resolve, runMetadata });

  return {
    /**
     * @param {string} rawQuery
     * @param {Array} documents — SearchDocuments
     * @param {Object} [ctx] — bothStrands / maxMismatches / identityThreshold / limit
     * @param {(session, meta)=>void} [onResult]
     * @returns {Promise<{ requestId, stale, session }>}
     */
    search(rawQuery, documents, ctx, onResult) {
      // A new query supersedes any in-flight worker round-trip — cancel it so it can't
      // leak or waste compute (the service also stale-drops it for correctness).
      workerClient.cancel();
      // minQueryLen pref gates AUTO-detected DNA motifs (an explicit seq: still wins).
      const plan = classifyQuery(rawQuery, { minDnaLen: ctx && ctx.minQueryLen });
      // ERROR-GATE (K7 §16): any severity:error diagnostic (two providers, invalid DNA, an
      // empty bio prefix, an incompatible scope/provider …) blocks the search BEFORE collectors
      // or providers run — no worker round-trip, no scope filter, no ranking. The UI gets a
      // blocked session (not partial results). `enz:Bsa seq:GAATTC` is the canonical case.
      if (planIsBlocked(plan)) {
        // INVALIDATE any prior in-flight search (K7-P1-4): the blocked branch bypasses the service,
        // so without this a still-resolving earlier query would be delivered as fresh and overwrite
        // the blocked state (UI then shows «Ничего не найдено» over the notice). service.cancel()
        // makes that late reply stale-dropped. (workerClient.cancel() above already killed its worker.)
        service.cancel();
        const session = {
          requestId: 'blocked', plan, status: 'blocked', blocked: true,
          results: [], truncated: false,
          diagnostics: { total: 0, blocked: planBlockingErrors(plan) },
          matchingEntryIds: new Set(), matchingProjectIds: new Set(),
        };
        if (onResult) onResult(session, { blocked: true });
        return Promise.resolve({ requestId: session.requestId, stale: false, session });
      }
      // Scope BEFORE the providers (§10.3): filter the document set ONCE so the metadata
      // partial, the DNA worker AND the final all see the SAME in-scope docs. Otherwise
      // `mol: seq:` ships primers to the worker (and `primer: seq:` ships molecules) —
      // wasted scan + timeout/incomplete risk — even though ranking would drop them later.
      const scoped = filterDocumentsByScope(documents, plan.entityScope);
      return service.search(plan, scoped, ctx, onResult);
    },
    get latestRequestId() { return service.latestRequestId; },
    cancel() { service.cancel(); workerClient.cancel(); },
    terminate() { service.cancel(); workerClient.terminate(); },
  };
}
