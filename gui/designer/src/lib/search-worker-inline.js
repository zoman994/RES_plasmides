/**
 * search-worker-inline — the MAIN-THREAD execution path of the sequence search.
 *
 * Extracted from `search-worker-client.js` by U4-CANCEL C2.1.1 for the reason the reviewer named:
 * the corrective atom had to add protocol state, and the client had no budget left. This is the
 * cleanest seam available, because the inline path is not protocol at all — it owns no worker, no
 * cancellation, no acknowledgement and no quarantine. It is the fallback STRATEGY; everything left
 * in the client is now about the worker conversation. A pure move: no behaviour changed.
 *
 * It exists for two callers and neither of them is production UI:
 *   • a test or core caller that explicitly opts in (`allowInlineFallback`);
 *   • a host with no worker factory at all (SSR, an old runtime).
 * Production runs `allowInlineFallback: false`, because a synchronous ~400 ms/MB scan on the main
 * thread is exactly the freeze the worker exists to avoid.
 */
import { validateSequencePayload } from './search-sequence-contract';
import {
  SEARCH_ABORT, SearchAbortError, toDocMeta, toWorkerDocs,
} from './search-worker-envelope';

/**
 * Run the whole sequence pass HERE, on the calling thread.
 *
 * ASYNC because the heavy engine is loaded on demand: `searchAllSequences` is dynamically imported
 * HERE and nowhere else on the client side, so the kernel/scan/verifier is evicted from the eager
 * main bundle and only fetched if this branch actually runs. The observable contract is the same as
 * the worker path's: resolves a `Map`, or rejects.
 *
 * @returns {Promise<Map<string, object[]>>}
 */
export async function runInlineSearch(seqQuery, documents, ctx) {
  const docs = toWorkerDocs(documents);
  try {
    const { searchAllSequences } = await import('./search-worker-core');
    const byId = searchAllSequences(seqQuery, docs, ctx || {});
    // The SAME gate as the worker path (K3.0) — an in-process engine is not more trustworthy
    // than a cross-thread one. A malformed return rejects with a PLAIN Error (no `.reason`),
    // which the facade normalizes to PROVIDER_ERROR — distinct from the worker's WORKER_FAILURE
    // (there is no worker here to blame or respawn), and never a silent complete-miss.
    // The SEQUENCE gate, the same one the worker path applies after structured-clone — not the
    // generic provider gate. An in-process engine is not more trustworthy than a cross-thread one,
    // and the generic gate would accept a bare array: exactly the reply that carries neither the
    // true locus count nor the rule-7 winner.
    if (!validateSequencePayload(byId, {
      docMeta: toDocMeta(docs, ctx || {}), queryLength: (seqQuery || '').length,
    })) {
      throw new Error('inline search returned a malformed result');
    }
    return new Map(Object.entries(byId));
  } catch (err) {
    // A main-thread engine exception must REJECT (so the facade flags it incomplete),
    // never resolve empty — a silent false negative.
    throw err instanceof Error ? err : new Error('inline search failed');
  }
}

/**
 * The pure-inline client: same shape as the worker client, so a caller cannot tell which one it
 * holds. It still honours `terminate()` — after close a new search is REJECTED rather than
 * silently re-run, which is what keeps unmount behaviour identical on both paths.
 */
export function createInlineSearchClient() {
  let closed = false;
  return {
    searchSequences(seqQuery, documents, ctx = {}) {
      if (closed) return Promise.reject(new SearchAbortError(SEARCH_ABORT.TERMINATED, 'search client closed'));
      return runInlineSearch(seqQuery, documents, ctx);
    },
    cancel() {},
    terminate() { closed = true; },
    get healthy() { return !closed; },
  };
}
