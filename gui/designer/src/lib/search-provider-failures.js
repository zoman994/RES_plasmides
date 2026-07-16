/**
 * search-provider-failures — the failure model shared by the three biological providers
 * (REV #2 S3-CLOSE K2.1).
 *
 * A search answers a biological question: «does THIS molecule carry that motif / protein /
 * restriction site?». Two negatives look identical on screen but mean opposite things:
 *
 *   • the check RAN and matched nothing        → the site is genuinely absent (a result)
 *   • the check DID NOT RUN (crash / timeout)  → nothing is proven (not a result)
 *
 * Collapsing the second into the first is how a program invents evidence. This module keeps
 * them apart. It owns two jobs and nothing else:
 *
 *   1. `createProviderFailureTracker()` — records WHICH dimension failed and WHY, and
 *      snapshots that into the session fields the UI reads.
 *   2. `tracker.guard(dim, factory)` — wraps a provider matcher so that ANY misbehaviour
 *      (a throw while building it, a throw mid-scan, or a non-array return) becomes a
 *      RECORDED failure instead of an empty result. `[]` stays an honest miss.
 *
 * Deliberately kept out of `library-search.js`: the engine decides what a match IS, this
 * decides what a broken provider MEANS. (It is also at 96% of its size budget — K2 adds no
 * bytes there.) Layering is one-way: worker-client (transport) → here (policy) → facade
 * (orchestration). Nothing imports back.
 */
import { SEARCH_ABORT } from './search-worker-client';

/** The public causes a session may carry. Raw Error text NEVER travels with them. */
export const PROVIDER_FAILURE = Object.freeze({
  TIMEOUT: 'TIMEOUT',                 // the engine did not answer in time
  WORKER_FAILURE: 'WORKER_FAILURE',   // the worker crashed / was unavailable / spoke garbage
  PROVIDER_ERROR: 'PROVIDER_ERROR',   // an inline engine threw, or returned something invalid
});

/** Canonical dimension order for every user-facing list. `library-search::requiredProviderDimensions`
 * produces exactly these three names (seq→sequence, aa→protein, cut/re→enzyme). */
export const PROVIDER_DIMENSIONS = Object.freeze(['sequence', 'protein', 'enzyme']);

/**
 * Was this rejection just a superseded search? Those are NORMAL: a newer query cancelled the
 * old one, so its promise is stale-dropped and the user is never told. Everything else means
 * the dimension did not run and must be surfaced.
 * @param {unknown} err
 */
export function isSupersededFailure(err) {
  const reason = err && err.reason;
  return reason === SEARCH_ABORT.CANCELLED || reason === SEARCH_ABORT.TERMINATED;
}

/**
 * Map any rejection onto one of the three public causes. FAIL-CLOSED: an unrecognised error is
 * still a provider failure (PROVIDER_ERROR), never a silent success — the dimension did not run,
 * whatever the cause turns out to be.
 * @param {unknown} err
 * @returns {string} a PROVIDER_FAILURE value
 */
export function normalizeFailureReason(err) {
  const reason = err && err.reason;
  if (reason === SEARCH_ABORT.TIMEOUT) return PROVIDER_FAILURE.TIMEOUT;
  if (reason === SEARCH_ABORT.WORKER_FAILURE) return PROVIDER_FAILURE.WORKER_FAILURE;
  return PROVIDER_FAILURE.PROVIDER_ERROR;
}

/**
 * Records provider failures for ONE search and hands out guarded matchers.
 *
 * Conservative by design (K2): a failure on a single document fails the whole dimension for
 * this session. The engine's `providerPolicy` is session-level, so partially-computed hits
 * cannot be published as confirmed while the rest stays unverified — mixing the two would
 * need a per-document policy, which is out of K2's scope.
 */
export function createProviderFailureTracker() {
  const failed = new Map(); // dimension → reason (the FIRST cause wins; later ones add nothing)

  const record = (dimension, err) => {
    if (!failed.has(dimension)) failed.set(dimension, normalizeFailureReason(err));
  };

  return {
    record,
    /** Did `dimension` fail in this session? */
    has: (dimension) => failed.has(dimension),
    /** Did ANY dimension fail? Drives the facade's strict → deferred re-run. */
    hasFailures: () => failed.size > 0,

    /**
     * Wrap a provider matcher so it can never break the search.
     *
     * The factory runs NOW (eagerly), so a construction failure is known before the first
     * document is scanned and the facade can go straight to a deferred pass. The returned
     * matcher always exists and always returns an array, so `library-search` keeps calling
     * the dimension (its `ctx.xMatch` truthiness gate) and simply finds no occurrences —
     * which under `deferred` leaves the document as an explicit unconfirmed candidate.
     *
     * `validate` (K3.0) is the structural gate: it receives the matcher's OUTPUT and the REAL
     * arguments it was called with, so it can check each hit against the length of the SPECIFIC
     * document being scanned (library-search passes the doc at index 1 for protein/enzyme).
     * Without it the guard falls back to the loose legacy check — an array is an array — which
     * is exactly what let `[null]` and off-the-molecule coordinates through before K3.
     *
     * @param {string} dimension — 'sequence' | 'protein' | 'enzyme'
     * @param {() => Function} factory — builds the real matcher
     * @param {(output:unknown, args:unknown[]) => boolean} [validate] — structural gate
     * @returns {Function} a matcher that forwards every argument and never throws
     */
    guard(dimension, factory, validate) {
      let matcher = null;
      try {
        matcher = factory();
      } catch (err) {
        record(dimension, err);
      }
      return (...args) => {
        // Already broken → no-op. Re-running a matcher that just threw only repeats the cost
        // and the throw; the dimension is lost for this session either way.
        if (failed.has(dimension)) return [];
        try {
          const out = matcher(...args);
          // A malformed answer is a BROKEN ENGINE, not «nothing here» — `library-search`'s
          // `|| []` would otherwise quietly read it as an honest miss.
          const ok = typeof validate === 'function' ? validate(out, args) : Array.isArray(out);
          if (!ok) {
            record(dimension, null); // → PROVIDER_ERROR
            return [];
          }
          return out;
        } catch (err) {
          // Covers the matcher AND the validator: neither may break the search.
          record(dimension, err);
          return [];
        }
      };
    },

    /**
     * The session fields the UI reads. Ordered, deduplicated, free of raw error text, and
     * freshly allocated each call so a consumer cannot mutate tracker state.
     * @returns {{ incomplete:boolean, incompleteDims:string[], providerFailures:Array<{dimension:string,reason:string}> }}
     */
    snapshot() {
      const dims = PROVIDER_DIMENSIONS.filter((d) => failed.has(d));
      return {
        incomplete: dims.length > 0,
        incompleteDims: dims,
        providerFailures: dims.map((d) => ({ dimension: d, reason: failed.get(d) })),
      };
    },
  };
}
