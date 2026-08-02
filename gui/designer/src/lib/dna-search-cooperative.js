/**
 * dna-search-cooperative — the ONE drain layer over the resumable search core (U4-CANCEL C1).
 *
 * WHY THIS EXISTS. `Worker.terminate()` is not a way to stop a computation. Chromium queues the
 * termination and only forces `TerminateExecution()` after a FIXED ~2 s delay when the worker's
 * synchronous JS never yields the task queue (`kForcibleTerminationDelay`). Measured on the U4
 * runtime gate: the UI cancelled in 2 ms while the worker thread kept burning CPU for ~2026 ms.
 * A `shouldCancel` flag polled INSIDE a synchronous loop cannot fix that either — the cancel
 * message is a task, and a task cannot be delivered until the loop returns to the event loop.
 *
 * The only real fix is that the search itself yields. So the engine is expressed ONCE, as a
 * generator that suspends at bounded interior points (§ scan positions, § verifier states), and
 * this module supplies the two ways to consume it:
 *
 *   • `drainSync`        — pump to completion without ever yielding. This is the production
 *                          main-thread/inline path and the one every existing test exercises.
 *   • `drainCooperative` — pump for a time slice, then hand the thread back to the TASK QUEUE,
 *                          then re-check cancellation. This is the worker path.
 *
 * Both drive the SAME generator, so they execute the same instructions in the same order and must
 * produce byte-identical results; the only difference is where the work pauses. That equivalence is
 * a test, not a hope (`dna-cooperative-parity.test.js`).
 *
 * THE YIELD MUST BE A MACROTASK. `Promise.resolve()` / `queueMicrotask` drain the microtask queue
 * of the CURRENT task — they never return to the event loop, so no `message`, no `postMessage`
 * cancel and no timer can be delivered while the search runs. Yielding to the task queue is the
 * whole mechanism; a microtask "yield" is a no-op that merely looks asynchronous. The mutation gate
 * pins this: swapping `yieldToTaskQueue` for a microtask turns the diagnostic tests RED.
 *
 * Pure scheduling; no engine knowledge, no store, no React.
 */

/** Cooperative cancellation is TRANSPORT CONTROL, never a provider verdict (§3.3 stays untouched). */
export const SEARCH_CANCELLED = 'SEARCH_CANCELLED';

export function cancelledError() {
  const e = new Error(SEARCH_CANCELLED);
  e.code = SEARCH_CANCELLED;
  return e;
}

/** Default work slice between task-queue yields. Small enough that a cancel lands well inside the
 *  100 ms gate, large enough that the yield overhead stays invisible next to the scan itself. */
export const DEFAULT_SLICE_MS = 8;

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ── the macrotask yield ────────────────────────────────────────────────────────────────────────
// One reusable MessageChannel: a port message is a TASK, so the event loop gets to run timers,
// incoming `message` events (the cancel!) and any other pending task before we resume. Creating a
// channel per yield would allocate two ports per slice on the hot path, so waiters queue on one.
let port = null;
const waiters = [];

function ensurePort() {
  if (port) return port;
  const ch = new MessageChannel();
  port = ch.port1;
  port.onmessage = () => { const w = waiters.shift(); if (w) w(); };
  if (port.start) port.start();
  port._other = ch.port2; // kept alive with the channel; never used for anything else
  // A browser page and a persistent worker are supposed to outlive this port, but under Node the
  // same open handle keeps the event loop — and therefore a whole vitest fork — from ever exiting,
  // which surfaces as an intermittent «Worker exited unexpectedly» in large parallel runs. `unref`
  // exists only on Node's MessagePort and makes the handle non-blocking without closing it, so the
  // yield keeps working identically in every host.
  if (typeof port.unref === 'function') port.unref();
  if (typeof ch.port2.unref === 'function') ch.port2.unref();
  return port;
}

/**
 * Return to the TASK QUEUE — not the microtask queue. Awaiting this is what lets a pending
 * `message`/`postMessage` (cancel) or timer be delivered mid-search.
 * @returns {Promise<void>}
 */
export function yieldToTaskQueue() {
  if (typeof MessageChannel === 'function') {
    const p = ensurePort();
    return new Promise((resolve) => { waiters.push(resolve); p._other.postMessage(0); });
  }
  // No MessageChannel (exotic host): a 0 ms timer is still a task, just clamped after nesting.
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

/**
 * Pump a step generator to completion with NO yielding, and return its return value.
 * The synchronous engine entry points are exactly this — which is why the resumable core cannot
 * drift from the production answer: there is no second algorithm to drift from.
 * @param {Generator} steps
 */
export function drainSync(steps) {
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/**
 * Pump a step generator cooperatively: work for `sliceMs`, hand the thread back to the task queue,
 * re-check cancellation, repeat.
 *
 * Cancellation calls `steps.return()` so the generator unwinds through its own `finally` blocks —
 * timers closed, arena size recorded — before the rejection is raised. The caller therefore learns
 * of the cancel only after the old job is fully unwound, which is precisely what makes a
 * `cancel-complete` acknowledgement (C2) truthful rather than optimistic.
 *
 * @param {Generator} steps
 * @param {{ shouldCancel?:() => boolean, sliceMs?:number, yieldFn?:() => Promise<void> }} [opts]
 *   `yieldFn` is injectable ONLY so a test can prove the difference between a task yield and a
 *   microtask; production always uses `yieldToTaskQueue`.
 * @throws {Error & {code:'SEARCH_CANCELLED'}}
 */
export async function drainCooperative(steps, opts = {}) {
  const { shouldCancel, sliceMs = DEFAULT_SLICE_MS, yieldFn = yieldToTaskQueue } = opts;
  const cancelled = () => (typeof shouldCancel === 'function' && shouldCancel() === true);

  // Checked BEFORE the first step too: a job cancelled while still queued must not run at all.
  if (cancelled()) { steps.return(undefined); throw cancelledError(); }

  for (;;) {
    const sliceEnd = now() + sliceMs;
    do {
      const r = steps.next();
      if (r.done) return r.value;
    } while (now() < sliceEnd);

    await yieldFn();

    if (cancelled()) {
      steps.return(undefined); // run the generator's finally blocks — full unwind, then report
      throw cancelledError();
    }
  }
}
