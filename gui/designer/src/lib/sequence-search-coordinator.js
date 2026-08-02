/**
 * sequence-search-coordinator — ONE owner of the sequence-search worker for the whole app.
 *
 * The global bar and the in-molecule Ctrl+F are two surfaces onto the same engine, and a megabase
 * pass is the heaviest thing this product does. If each surface owned a worker, two of them could
 * grind at once on the machine least able to afford it — so ownership is centralised here and
 * handed out as named CHANNELS rather than as clients. One heavy job at a time is a product rule,
 * not an optimisation.
 *
 * What a channel guarantees:
 *   • starting work as one owner first stops whatever pass is running, whoever owns it. The
 *     abandoned promise rejects as CANCELLED — a superseded search is not a failure, and the
 *     surface that owned it must be able to tell the difference;
 *   • `cancel()` stops YOUR work only. Cancelling `popover` while `global` is mid-sweep is a no-op,
 *     because dismissing one surface never means aborting another's search;
 *   • stopping an ACTIVE pass ASKS its worker to stop and keeps the thread. This used to read «the
 *     pass is one synchronous sweep, so a cancel message would sit unread until it finished: the
 *     thread is expendable». U4-CANCEL made the engine resumable, so the cancel is delivered at an
 *     interior safe point and answered after a full unwind — and killing the thread instead would
 *     charge ~2 s of Chromium forced-termination delay to every keystroke. `terminate()` is now only
 *     `dispose()` (unmount) and the client's own fault path.
 *
 * The worker is spawned LAZILY by the client, on the first search — mounting the app must not cost
 * a thread. And there is no inline fallback: silently running a megabase scan on the UI thread is
 * exactly the failure this indirection exists to prevent.
 *
 * Pure: no React, no store. Validation of engine payloads stays at the client boundary.
 */
import { createSearchWorkerClient, SEARCH_ABORT } from './search-worker-client';

/** Owner channels. Not free-form strings: an unknown owner is a wiring mistake, not a new feature. */
export const SEARCH_OWNER = Object.freeze({ GLOBAL: 'global', POPOVER: 'popover' });

const isOwner = (o) => o === SEARCH_OWNER.GLOBAL || o === SEARCH_OWNER.POPOVER;

/**
 * @param {{ workerFactory?: Function, timeoutMs?: number }} opts
 * @returns {{ channel:Function, cancel:Function, dispose:Function, disposed:boolean }}
 */
export function createSequenceSearchCoordinator({ workerFactory, timeoutMs } = {}) {
  // FAIL-CLOSED: a real factory with `allowInlineFallback: false`. When the worker cannot be
  // spawned the search rejects — it never quietly becomes a main-thread scan.
  const client = createSearchWorkerClient(workerFactory, {
    allowInlineFallback: false,
    ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
  });
  let disposed = false;
  // The pass in flight, tagged with a per-run token. The token is what stops a LATE settlement from
  // an abandoned run clearing the state of the run that replaced it — the two can share an owner.
  let activeRun = null;

  function search(owner, query, documents, ctx) {
    if (disposed) {
      return Promise.reject(new Error('sequence search coordinator is disposed'));
    }
    const token = {};
    // Recorded BEFORE the call: `searchSequences` supersedes any pass in flight, so from this line
    // on the newest run is the one that owns the worker.
    activeRun = { owner, token };
    const running = client.searchSequences(query, documents, ctx);
    const settle = () => { if (activeRun && activeRun.token === token) activeRun = null; };
    // Observes BOTH outcomes. This also marks `running` as handled, so a caller that ignores a
    // CANCELLED rejection cannot turn a routine supersede into an unhandled rejection — while a
    // caller that DOES care still receives it from the promise we return.
    running.then(settle, settle);
    return running;
  }

  function cancel(owner) {
    if (!activeRun || activeRun.owner !== owner) return false; // somebody else's work: not ours to stop
    activeRun = null;
    client.cancel();
    return true;
  }

  return {
    /** @param {'global'|'popover'} owner */
    channel(owner) {
      if (!isOwner(owner)) throw new Error(`unknown search owner: ${String(owner)}`);
      return {
        owner,
        search: (query, documents, ctx) => search(owner, query, documents, ctx),
        cancel: () => cancel(owner),
      };
    },
    cancel,
    /** Idempotent: React StrictMode runs cleanup twice, and a double teardown must be harmless. */
    dispose() {
      if (disposed) return;
      disposed = true;
      activeRun = null;
      client.terminate();
    },
    get disposed() { return disposed; },
  };
}

export { SEARCH_ABORT };
