/**
 * search-service — the async facade over the search engine (P1).
 *
 * Metadata dims (name/tag/type/status/feature) are instant and run in
 * `library-search::runSearch`. The sequence/protein dims can be slow (a worker in
 * P1.5), so a bare `await` would let an OLD query's results land after a NEWER
 * query — the classic search race. This facade fixes that with one rule:
 *
 *   every search gets a monotonic requestId; when a response arrives it is
 *   delivered ONLY if its request is still the latest (else it is dropped).
 *
 * It is deliberately engine-agnostic — `resolve` does the real work (typically
 * `runSearch` with an async seqMatch, or a worker round-trip). The optional
 * `runMetadata` lets the UI paint instant metadata hits (`partial`) before the
 * async `final` lands. Result capping lives in runSearch (opts.limit), not here.
 *
 * Pure orchestration; no React/store. See search-types.js for the SearchSession.
 */

/**
 * @param {{
 *   resolve?: (plan:Object, documents:Array, ctx:Object) => Promise<Object>,
 *   runMetadata?: (plan:Object, documents:Array, ctx:Object) => Object
 * }} [deps]
 */
export function createSearchService(deps = {}) {
  const { resolve, runMetadata } = deps;
  let seq = 0;
  let latest = null;

  /**
   * @param {Object} plan      — QueryPlan (from classifyQuery)
   * @param {Array}  documents — SearchDocuments
   * @param {Object} [ctx]     — passed through to resolve (seqMatch/opts/…)
   * @param {(session:Object, meta:{stale:boolean, phase:'partial'|'final'}) => void} [onResult]
   * @returns {Promise<{ requestId:string, stale:boolean, session:Object|null }>}
   */
  function search(plan, documents, ctx = {}, onResult) {
    const requestId = `r${(seq += 1)}`;
    latest = requestId;

    // Instant metadata pass — delivered synchronously so the UI never waits on the
    // sequence engine to show name/tag hits. Fresh by construction (just set latest).
    if (runMetadata) {
      const partial = { ...runMetadata(plan, documents, ctx), requestId, status: 'partial' };
      if (onResult) onResult(partial, { stale: false, phase: 'partial' });
    }

    // Invoke the engine SYNCHRONOUSLY (a real worker posts its request now and
    // returns a promise immediately) so callers can observe the request in flight.
    // A synchronous throw is normalized into a rejection.
    let work;
    try {
      work = resolve
        ? resolve(plan, documents, { ...ctx, requestId })
        : { status: 'done', results: [] };
    } catch (err) {
      work = Promise.reject(err);
    }
    return Promise.resolve(work)
      .then((session) => {
        const stale = requestId !== latest;
        if (stale) return { requestId, stale: true, session: null };
        const finalSession = { ...session, requestId, status: 'done' };
        if (onResult) onResult(finalSession, { stale: false, phase: 'final' });
        return { requestId, stale: false, session: finalSession };
      });
  }

  return {
    search,
    /** requestId of the most recent search (null after cancel / before any). */
    get latestRequestId() { return latest; },
    /** Invalidate any in-flight request (e.g. on unmount) → they resolve stale. */
    cancel() { latest = null; },
  };
}
