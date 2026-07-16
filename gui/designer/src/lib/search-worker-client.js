/**
 * search-worker-client — the main-thread side of the sequence-search worker (P1.5),
 * hardened for resilience (task #168).
 *
 * The worker runs a SYNCHRONOUS full pass over the library, which a message cannot
 * interrupt. So this client is a SINGLE-STREAM manager: at most one request is in
 * flight, and aborting active work TERMINATES the worker (the only way to free it)
 * and lets the next search spawn a fresh one via the injected `workerFactory`. A
 * plain "cancel" message would never reach a worker busy in its loop.
 *
 * Every pending request settles EXACTLY once — on reply, or by rejecting with a
 * SearchAbortError whose `.reason` is one of:
 *   • CANCELLED       — superseded by a newer search / query change (no user-facing error)
 *   • TIMEOUT         — the worker did not reply within opts.timeoutMs
 *   • WORKER_FAILURE  — the worker threw (`onerror`) or a message failed to deserialize
 *   • TERMINATED      — the client was closed (unmount); it rejects further calls at once
 * A caller therefore never awaits a promise that can hang (the V199 double-terminate).
 *
 * `terminate()` CLOSES the client permanently. After a CANCELLED / TIMEOUT / crash the
 * client stays healthy and the next search auto-respawns a worker — never a 15 s wait
 * on a dead one.
 *
 * `workerFactory` is a `() => Worker | null` — the real one is `() => new SearchWorker()`
 * (`?worker` import). A runtime factory that cannot create a worker fails CLOSED: the
 * facade reports metadata-only `incomplete`, rather than freezing the UI with the
 * ~400 ms/MB synchronous sequence scan. Pure inline remains available only when no
 * factory is supplied, or when a test/core caller explicitly opts into it.
 */
import { searchAllSequences } from './search-worker-core';
import { entityRefKey } from './search-entity-key';
import { validateProviderPayload } from './search-provider-contract';

let _rid = 0;

const DEFAULT_TIMEOUT_MS = 15000;

/** Distinct abort reasons so callers can tell a superseded search (drop it) from a real
 * provider failure (surface «поиск не выполнен», never a silent false negative). */
export const SEARCH_ABORT = Object.freeze({
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT',
  WORKER_FAILURE: 'WORKER_FAILURE',
  TERMINATED: 'TERMINATED',
});

/** Rejection carried out of the client; `.reason` is a SEARCH_ABORT value. */
export class SearchAbortError extends Error {
  constructor(reason, message) {
    super(message || `search ${String(reason).toLowerCase()}`);
    this.name = 'SearchAbortError';
    this.reason = reason;
  }
}

/** entityKey → sequence length, for exactly the docs handed to the engine. The bounds check is
 * only meaningful per document, so the length travels with the request (S3-CLOSE K3.0). */
function toDocLengths(docs) {
  return new Map(docs.map((d) => [d.id, d.seq.length]));
}

function toWorkerDocs(documents) {
  return (documents || [])
    .filter((d) => d && d.ref && d.ref.id && d.sequence && d.sequence.seq)
    // Composite `<kind>:<id>` (§10.4) — the returned byId map must never merge an entry
    // and a same-id primer (facade looks it back up by entityRefKey too).
    .map((d) => ({ id: entityRefKey(d.ref), seq: d.sequence.seq, topology: d.sequence.topology }));
}

/**
 * @param {(() => (Worker|null)) | null} workerFactory — spawns a worker on demand; may
 *   return null (→ inline). A non-function is pure inline.
 * @param {{ timeoutMs?: number, allowInlineFallback?: boolean }} [opts] — per-request
 *   timeout (0 disables). `allowInlineFallback` is explicit for test/core callers;
 *   a real worker factory defaults to fail-closed when unavailable.
 * @returns {{ searchSequences:Function, cancel:Function, terminate:Function, healthy:boolean }}
 */
export function createSearchWorkerClient(workerFactory, opts = {}) {
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const hasFactory = typeof workerFactory === 'function';
  const allowInlineFallback = opts.allowInlineFallback ?? !hasFactory;

  const runInline = (seqQuery, documents, ctx) => {
    const docs = toWorkerDocs(documents);
    try {
      const byId = searchAllSequences(seqQuery, docs, ctx || {});
      // The SAME gate as the worker path (K3.0) — an in-process engine is not more trustworthy
      // than a cross-thread one. A malformed return rejects with a PLAIN Error (no `.reason`),
      // which the facade normalizes to PROVIDER_ERROR — distinct from the worker's
      // WORKER_FAILURE (there is no worker here to blame or respawn), and never a silent
      // complete-miss.
      if (!validateProviderPayload(byId, toDocLengths(docs))) {
        return Promise.reject(new Error('inline search returned a malformed result'));
      }
      return Promise.resolve(new Map(Object.entries(byId)));
    } catch (err) {
      // A main-thread engine exception must REJECT (so the facade flags it incomplete),
      // never resolve empty — a silent false negative.
      return Promise.reject(err instanceof Error ? err : new Error('inline search failed'));
    }
  };

  if (!hasFactory) {
    // Pure inline — but still honours terminate() so the lifecycle matches the worker
    // path: after close, a new search is rejected rather than silently re-run.
    let inlineClosed = false;
    return {
      searchSequences(seqQuery, documents, ctx = {}) {
        if (inlineClosed) return Promise.reject(new SearchAbortError(SEARCH_ABORT.TERMINATED, 'search client closed'));
        return runInline(seqQuery, documents, ctx);
      },
      cancel() {},
      terminate() { inlineClosed = true; },
      get healthy() { return !inlineClosed; },
    };
  }

  let worker = null;      // live worker, spawned lazily; null after any teardown
  let pending = null;     // { id, resolve, reject, timer, docKeys } — at most one in flight
  let closed = false;     // terminate() called → permanently unusable

  function attach(w) {
    // Bind handlers to THIS worker generation. A late reply / error from an old, killed
    // worker (w !== worker) must never resolve/reject the CURRENT search or tear down the
    // healthy new worker (killWorker also detaches these, so this is defence in depth).
    w.onmessage = (e) => {
      if (w !== worker) return; // superseded generation
      const { id, byId } = e.data || {};
      if (!pending || pending.id !== id) return; // stale / late reply → ignore
      // OUR request answered, but with a payload we cannot trust → the sequence dim did NOT
      // run. Fail it like a crash (reject + tear the worker down so the next search respawns);
      // never resolve a half-understood answer as a result. Validated against the doc set THIS
      // request sent — and each hit against ITS OWN sequence length — so neither a reply about
      // other molecules nor a coordinate off the end of one can leak in.
      if (!validateProviderPayload(byId, pending.docLengths)) { failActive(SEARCH_ABORT.WORKER_FAILURE); return; }
      const { resolve, timer } = pending;
      pending = null;
      if (timer) clearTimeout(timer);
      resolve(new Map(Object.entries(byId)));
    };
    w.onerror = () => { if (w === worker) failActive(SEARCH_ABORT.WORKER_FAILURE); };
    w.onmessageerror = () => { if (w === worker) failActive(SEARCH_ABORT.WORKER_FAILURE); };
  }

  function ensureWorker() {
    if (worker) return worker;
    let w = null;
    try { w = workerFactory(); } catch { w = null; }
    // A factory failure can be transient (worker chunk not ready, resource
    // pressure). Fail this request closed, but retry the factory next time.
    if (!w) return null;
    attach(w);
    worker = w;
    return w;
  }

  function abortActive(reason) {
    if (!pending) return;
    const { reject, timer } = pending;
    pending = null;
    if (timer) clearTimeout(timer);
    reject(new SearchAbortError(reason));
  }

  // A worker mid sync-loop can't be freed by a message → terminate + drop it. The next
  // search spawns a fresh one (ensureWorker), so we never queue behind dead work. Order
  // matters: remove it from state and DETACH its handlers FIRST, so a late error/reply
  // that arrives during/after terminate() cannot reach the current search.
  function killWorker() {
    const w = worker;
    if (!w) return;
    worker = null;
    w.onmessage = null;
    w.onerror = null;
    w.onmessageerror = null;
    try { w.terminate?.(); } catch { /* ignore */ }
  }

  function failActive(reason) {
    abortActive(reason);
    killWorker();
  }

  return {
    searchSequences(seqQuery, documents, ctx = {}) {
      if (closed) return Promise.reject(new SearchAbortError(SEARCH_ABORT.TERMINATED, 'search client closed'));
      // Single stream: supersede any in-flight request (its worker is busy → kill it).
      if (pending) failActive(SEARCH_ABORT.CANCELLED);
      const w = ensureWorker();
      if (!w) {
        if (allowInlineFallback) return runInline(seqQuery, documents, ctx);
        return Promise.reject(new SearchAbortError(
          SEARCH_ABORT.WORKER_FAILURE,
          'sequence worker unavailable',
        ));
      }
      const id = `w${(_rid += 1)}`;
      const docs = toWorkerDocs(documents);
      return new Promise((resolve, reject) => {
        const timer = timeoutMs > 0 ? setTimeout(() => failActive(SEARCH_ABORT.TIMEOUT), timeoutMs) : null;
        // docLengths travels with the request so the reply can be checked against what WE asked
        // about — and each coordinate against the molecule it claims to be on — not against
        // whatever the worker felt like returning.
        pending = { id, resolve, reject, timer, docLengths: toDocLengths(docs) };
        try {
          w.postMessage({ id, seqQuery, docs, ctx });
        } catch {
          failActive(SEARCH_ABORT.WORKER_FAILURE);
        }
      });
    },
    // Supersede / query change: abort the in-flight request + kill its busy worker, but
    // keep the client usable — the next search respawns a worker.
    cancel() { if (pending) failActive(SEARCH_ABORT.CANCELLED); },
    // Unmount: reject the in-flight request, tear the worker down, close permanently.
    terminate() {
      abortActive(SEARCH_ABORT.TERMINATED);
      killWorker();
      closed = true;
    },
    get healthy() { return !closed; },
  };
}
