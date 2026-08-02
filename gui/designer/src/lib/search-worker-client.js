/**
 * search-worker-client — the main-thread side of the sequence-search worker (P1.5),
 * hardened for resilience (#168) and then for COOPERATIVE cancellation (U4-CANCEL C2 → C2.1.1).
 *
 * SINGLE STREAM: at most one heavy pass exists at any moment. How that is enforced changed with
 * C2 and is the whole point of this file:
 *
 *   • ORDINARY CANCEL (supersede / query change) does NOT terminate anything. The engine is
 *     resumable, so the worker is sent a `{type:'cancel', id}` CONTROL frame, reaches an interior
 *     safe point, unwinds through its `finally` blocks and answers `{id, cancelled:true}`. The
 *     caller's promise rejects AT ONCE (nobody wants a superseded answer), but the next heavy job
 *     is posted only after that acknowledgement — or after a VALID terminal reply for the same id,
 *     which proves the job finished before our cancel ever reached it (C2.1 P1-2).
 *   • TERMINATION IS THE FAULT PATH ONLY — a crash, a malformed reply, a missed deadline. And even
 *     then it is a REQUEST, not a proof: Chromium forces `TerminateExecution()` on a worker whose
 *     synchronous JS never yields only after a fixed delay, measured on the U4 runtime gate as
 *     ~2026 ms from `terminate()` to `Target.targetDestroyed`.
 *   • Hence QUARANTINE (C2.1.1): after a fault where the thread went SILENT — deadline missed,
 *     cancel unacknowledged, cancel unsendable — no worker is created at all for
 *     `quarantineMs`, because a fresh one would run beside a thread that is very probably still
 *     burning CPU. Faults the worker ANNOUNCED (it answered, or it threw) do not quarantine: it is
 *     back on its event loop, so the client is usable again immediately.
 *
 * Every pending request settles EXACTLY once — on reply, or by rejecting with a
 * SearchAbortError whose `.reason` is one of:
 *   • CANCELLED       — superseded by a newer search / query change (no user-facing error)
 *   • TIMEOUT         — the worker did not reply within opts.timeoutMs
 *   • WORKER_FAILURE  — the worker threw / spoke garbage / went silent, or we are quarantined
 *   • TERMINATED      — the client was closed (unmount); it rejects further calls at once
 * A caller therefore never awaits a promise that can hang (the V199 double-terminate).
 *
 * `terminate()` CLOSES the client permanently.
 *
 * `workerFactory` is a `() => Worker | null` — the real one is `() => new SearchWorker()`
 * (`?worker` import). A runtime factory that cannot create a worker fails CLOSED: the
 * facade reports metadata-only `incomplete`, rather than freezing the UI with the
 * ~400 ms/MB synchronous sequence scan. Pure inline remains available only when no
 * factory is supplied, or when a test/core caller explicitly opts into it.
 */
import { validateSequencePayload } from './search-sequence-contract';
// The MAIN-THREAD strategy lives apart (C2.1.1): it owns no worker, no cancel, no ack and no
// quarantine, so keeping it here only competed for this file's budget with the protocol itself.
import { runInlineSearch, createInlineSearchClient } from './search-worker-inline';
// The request/reply TRUST BOUNDARY lives in a pure leaf (C2.1): shapes, verdicts and frame
// predicates have no lifecycle, and moving them out kept this file inside its size budget while the
// corrective atom added protocol states. `SEARCH_ABORT` / `SearchAbortError` are re-exported so
// every existing importer of this module is unchanged.
import {
  SEARCH_ABORT, SearchAbortError, typedVerdict, toDocMeta, toWorkerDocs,
  resolvesCancelledJob,
} from './search-worker-envelope';

export { SEARCH_ABORT, SearchAbortError };

let _rid = 0;

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * How long the client refuses to create a worker after a SILENT fault (C2.1.1).
 *
 * Derived from measurement, not taste: the U4 runtime gate clocked ~2026 ms between `terminate()`
 * and `Target.targetDestroyed` for a worker stuck in synchronous JS (Chromium's
 * `kForcibleTerminationDelay`). The window has to outlast that, with margin for a slower machine.
 */
export const DEFAULT_QUARANTINE_MS = 2500;

/**
 * @param {(() => (Worker|null)) | null} workerFactory — spawns a worker on demand; may
 *   return null (→ inline). A non-function is pure inline.
 * @param {{ timeoutMs?: number, allowInlineFallback?: boolean, quarantineMs?: number }} [opts] —
 *   per-request timeout (0 disables). `allowInlineFallback` is explicit for test/core callers;
 *   a real worker factory defaults to fail-closed when unavailable. `quarantineMs` is injectable
 *   so a test can pin the window without waiting it out in real time.
 * @returns {{ searchSequences:Function, cancel:Function, terminate:Function, healthy:boolean }}
 */
export function createSearchWorkerClient(workerFactory, opts = {}) {
  const timeoutMs = typeof opts.timeoutMs === 'number' ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const quarantineMs = typeof opts.quarantineMs === 'number' ? opts.quarantineMs : DEFAULT_QUARANTINE_MS;
  const hasFactory = typeof workerFactory === 'function';
  const allowInlineFallback = opts.allowInlineFallback ?? !hasFactory;

  // No factory at all → there is no protocol to run; hand back the pure main-thread client.
  if (!hasFactory) return createInlineSearchClient();

  let worker = null;      // live worker, spawned lazily; null after any teardown
  let pending = null;     // { id, resolve, reject, timer, docKeys } — at most one in flight
  let closed = false;     // terminate() called → permanently unusable
  // U4-CANCEL C2 — cooperative cancellation state.
  // `awaitingAck` holds the id of a job we asked to stop and whose `cancel-complete` has not yet
  // arrived; `queued` is the ONE search waiting for that ack. Together they enforce «at most one
  // heavy job» WITHOUT terminating a healthy worker: the next job is posted only once the old one
  // has actually unwound.
  let awaitingAck = null; // { id, timer, docMeta, queryLength } | null
  let queued = null;      // { seqQuery, documents, ctx, resolve, reject } | null
  // U4-CANCEL C2.1.1 — while this is set, NO worker is created (see DEFAULT_QUARANTINE_MS).
  let quarantineTimer = null;
  let quarantined = false;

  function attach(w) {
    // Bind handlers to THIS worker generation. A late reply / error from an old, killed
    // worker (w !== worker) must never resolve/reject the CURRENT search or tear down the
    // healthy new worker (killWorker also detaches these, so this is defence in depth).
    w.onmessage = (e) => {
      if (w !== worker) return; // superseded generation
      const { id, byId, error } = e.data || {};
      // ── the job we asked to STOP is reporting back (C2 + C2.1) ───────────────────────────────
      // Checked BEFORE the pending guard: the caller's promise was already settled when we asked to
      // cancel, so `pending` is null by now. Two frames are both proof that the old job is over:
      //   • the ack `{id, cancelled:true}` — it reached a safe point and unwound;
      //   • a VALID terminal reply — it had already finished before our cancel arrived, so an ack is
      //     never coming (C2.1 P1-2: waiting for one hung the queue until the 15 s timeout).
      // Anything else claiming that id is not believable, and a thread that sends it is not one to
      // keep: an ack carrying an answer (P2) or a malformed terminal is a FAULT.
      if (awaitingAck && awaitingAck.id === id) {
        if (resolvesCancelledJob(e.data, awaitingAck)) {
          clearAck(); flushQueue();
        } else {
          failActive(SEARCH_ABORT.WORKER_FAILURE);
        }
        return;
      }
      if (!pending || pending.id !== id) return; // stale / late reply → ignore
      // A TYPED outcome the engine reported deliberately (route / budget / bad alphabet), if and
      // only if the envelope validates. The worker is NOT torn down: it answered — with a verdict
      // rather than hits, but a well-formed answer all the same, from pure code that leaves no
      // damaged state behind. Killing it would charge a thread respawn to every long query and
      // treat a deliberate route exactly like a crash — the conflation this protocol removes.
      if (error !== undefined) {
        const verdict = typedVerdict(error, byId, pending.queryLength);
        if (!verdict) { failActive(SEARCH_ABORT.WORKER_FAILURE); return; } // unusable → fault
        const { reject, timer } = pending;
        pending = null;
        if (timer) clearTimeout(timer);
        reject(verdict);
        return;
      }
      // OUR request answered, but with a payload we cannot trust → the sequence dim did NOT
      // run. Fail it like a crash (reject + tear the worker down so the next search respawns);
      // never resolve a half-understood answer as a result. The reply is already CANONICAL
      // (finalized in the core), so re-check it as such against THIS request: each hit's
      // coordinates against its molecule, its arithmetic, its queryLength against ours, and its
      // wrap against the effective topology — a plausible forgery is caught even though the message
      // survived structured-clone intact.
      if (!validateSequencePayload(byId, { docMeta: pending.docMeta, queryLength: pending.queryLength })) {
        failActive(SEARCH_ABORT.WORKER_FAILURE); return;
      }
      const { resolve, timer } = pending;
      pending = null;
      if (timer) clearTimeout(timer);
      resolve(new Map(Object.entries(byId)));
    };
    w.onerror = () => { if (w === worker) failActive(SEARCH_ABORT.WORKER_FAILURE); };
    w.onmessageerror = () => { if (w === worker) failActive(SEARCH_ABORT.WORKER_FAILURE); };
  }

  /**
   * Open the quarantine window: for `quarantineMs` this client creates no worker at all.
   *
   * The invariant being protected is «at most ONE heavy pass exists», and after a silent fault we
   * cannot know the old pass has ended — `terminate()` only asks. Rejecting the search that asked
   * for a fresh thread is the honest answer; the alternative (spawn anyway) is the second heavy
   * thread the whole protocol exists to prevent.
   */
  function beginQuarantine() {
    if (quarantineTimer) clearTimeout(quarantineTimer);
    quarantined = true;
    quarantineTimer = setTimeout(() => { quarantined = false; quarantineTimer = null; }, quarantineMs);
    // Node only: a pending 2.5 s handle must not be what keeps a test process alive.
    if (typeof quarantineTimer?.unref === 'function') quarantineTimer.unref();
  }

  function endQuarantine() {
    if (quarantineTimer) clearTimeout(quarantineTimer);
    quarantineTimer = null;
    quarantined = false;
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

  function clearAck() {
    if (!awaitingAck) return;
    if (awaitingAck.timer) clearTimeout(awaitingAck.timer);
    awaitingAck = null;
  }

  /** Reject whatever was waiting for a free worker. Used by every fail-closed path. */
  function dropQueue(reason) {
    if (!queued) return;
    const q = queued;
    queued = null;
    q.reject(new SearchAbortError(reason));
  }

  // A FAULT the worker ANNOUNCED — a malformed payload, or a crash. The thread is not trusted, so
  // it is dropped; but it is not computing either (it answered, or it threw), so releasing the
  // queued search onto a fresh worker cannot put two heavy passes in flight.
  function failActive(reason) {
    abortActive(reason);
    clearAck();
    killWorker();
    flushQueue();
  }

  /**
   * FAIL CLOSED (C2.1 P1-3) — a SILENT worker: it missed its deadline, or never acknowledged a
   * cancel. Unlike the announced faults above, this thread is very probably still computing, and
   * `terminate()` does NOT prove otherwise: the U4 runtime gate measured ~2026 ms from `terminate()`
   * to `Target.targetDestroyed`. Starting the queued search now is exactly how two heavy passes end
   * up running at once, so the queue is rejected instead of released.
   *
   * C2.1.1: and so is starting a NEW one. Rejecting only the queue while staying instantly usable
   * merely narrowed the window — the next keystroke spawned worker #2 beside the dying thread all
   * the same. So the client QUARANTINES itself: no worker at all until the old one must be gone.
   */
  function failClosed(reason) {
    abortActive(reason);
    clearAck();
    dropQueue(SEARCH_ABORT.WORKER_FAILURE);
    killWorker();
    beginQuarantine();
  }

  /** The worker never acknowledged our cancel → it is wedged. Last-resort teardown, fail closed. */
  function onAckTimeout(id) {
    if (!awaitingAck || awaitingAck.id !== id) return;
    failClosed(SEARCH_ABORT.WORKER_FAILURE);
  }

  /**
   * Ask the ACTIVE job to stop, cooperatively (C2).
   *
   * The user's promise is rejected AT ONCE — a superseded search must never keep a caller waiting
   * for work whose answer nobody wants. The worker, however, is left alive: it is healthy, it is
   * merely busy, and it will reach a safe point, unwind through its `finally` blocks and answer
   * `cancel-complete`. Until that ack arrives no new heavy job is posted, so «one heavy job at a
   * time» holds without paying a thread respawn for every keystroke.
   */
  function cooperativeCancel() {
    if (!pending) return;
    const { id, reject, timer, docMeta, queryLength } = pending;
    pending = null;
    if (timer) clearTimeout(timer);
    reject(new SearchAbortError(SEARCH_ABORT.CANCELLED));
    if (!worker) return; // nothing to ask; nothing to wait for
    // `docMeta`/`queryLength` travel onto the ack state so a terminal reply that beat our cancel
    // frame can be VALIDATED as this job's, not merely counted (C2.1 P1-2).
    const ackTimer = timeoutMs > 0 ? setTimeout(() => onAckTimeout(id), timeoutMs) : null;
    awaitingAck = { id, timer: ackTimer, docMeta, queryLength };
    try {
      worker.postMessage({ type: 'cancel', id });
    } catch {
      // Cannot even ASK it to stop (C2.1.1). This is an UNCERTAIN-ACTIVE fault, not a finished job:
      // the thread is still running whatever it was running, and now unreachable. Treating it as an
      // announced fault let the very call that tried to supersede it go on to spawn a second heavy
      // thread — so it fails CLOSED and quarantines, exactly like a missed ack.
      failClosed(SEARCH_ABORT.WORKER_FAILURE);
    }
  }

  /** Post a heavy job and return the promise that settles with its outcome. */
  function postJob(w, seqQuery, documents, ctx) {
    const id = `w${(_rid += 1)}`;
    const docs = toWorkerDocs(documents);
    return new Promise((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => failClosed(SEARCH_ABORT.TIMEOUT), timeoutMs) : null;
      // What WE asked travels with the request, so the reply is checked against it rather than
      // against whatever the worker felt like returning: `docMeta` carries each molecule's length
      // AND its effective topology (so a wrap can be judged possible or not), and `queryLength`
      // anchors both a §4.2.0 verdict and every hit's metrics to the query that provoked them.
      pending = {
        id, resolve, reject, timer, docMeta: toDocMeta(docs, ctx), queryLength: seqQuery.length,
      };
      try {
        w.postMessage({ id, seqQuery, docs, ctx });
      } catch {
        failActive(SEARCH_ABORT.WORKER_FAILURE);
      }
    });
  }

  /** Release the search that was waiting for a cancel-complete (or for a fresh worker). */
  function flushQueue() {
    if (!queued || closed) return;
    if (quarantined) { dropQueue(SEARCH_ABORT.WORKER_FAILURE); return; } // never release into a fault
    const q = queued;
    queued = null;
    const w = ensureWorker();
    if (!w) {
      if (allowInlineFallback) { runInlineSearch(q.seqQuery, q.documents, q.ctx).then(q.resolve, q.reject); return; }
      q.reject(new SearchAbortError(SEARCH_ABORT.WORKER_FAILURE, 'sequence worker unavailable'));
      return;
    }
    postJob(w, q.seqQuery, q.documents, q.ctx).then(q.resolve, q.reject);
  }

  return {
    searchSequences(seqQuery, documents, ctx = {}) {
      if (closed) return Promise.reject(new SearchAbortError(SEARCH_ABORT.TERMINATED, 'search client closed'));
      // Single stream: supersede any in-flight request COOPERATIVELY — its promise settles now,
      // its worker is asked to stop and stays alive (C2). No respawn on an ordinary keystroke.
      if (pending) cooperativeCancel();
      // Checked AFTER the supersede, because the supersede itself can open the window: if the cancel
      // frame could not be sent, this very call must not go on to spawn the second heavy thread.
      if (quarantined) {
        return Promise.reject(new SearchAbortError(
          SEARCH_ABORT.WORKER_FAILURE,
          'sequence worker quarantined after a silent fault',
        ));
      }
      const w = ensureWorker();
      if (!w) {
        if (allowInlineFallback) return runInlineSearch(seqQuery, documents, ctx);
        return Promise.reject(new SearchAbortError(
          SEARCH_ABORT.WORKER_FAILURE,
          'sequence worker unavailable',
        ));
      }
      // A cancel is still unwinding: hold this search until `cancel-complete`, so the worker is
      // never asked to run two heavy jobs at once. Only the LATEST waiting search survives.
      if (awaitingAck) {
        dropQueue(SEARCH_ABORT.CANCELLED); // only the LATEST waiting search survives
        return new Promise((resolve, reject) => {
          queued = { seqQuery, documents, ctx, resolve, reject };
        });
      }
      return postJob(w, seqQuery, documents, ctx);
    },
    // Supersede / query change: settle the in-flight request now and ask its worker to stop.
    // The worker is HEALTHY and is kept — terminate is reserved for faults.
    //
    // C2.1 P1-1: a search WAITING for the old job's ack is just as cancellable as a running one.
    // Before this, `cancel()` looked only at `pending`, so closing the search left a queued request
    // that fired anyway the moment the ack arrived — a heavy pass nobody was waiting for.
    cancel() {
      dropQueue(SEARCH_ABORT.CANCELLED);
      if (pending) cooperativeCancel();
    },
    // Unmount: reject the in-flight request AND anything queued, tear the worker down, close.
    terminate() {
      abortActive(SEARCH_ABORT.TERMINATED);
      dropQueue(SEARCH_ABORT.TERMINATED);
      clearAck();
      endQuarantine(); // the client is closed for good; no timer should outlive it
      killWorker();
      closed = true;
    },
    get healthy() { return !closed; },
  };
}
