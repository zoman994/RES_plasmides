/**
 * search.worker.js — the off-main-thread sequence-search worker (P1.5), made COOPERATIVE by
 * U4-CANCEL C2.
 *
 * WHY IT IS NO LONGER A 2-LINE SHELL. The old worker ran the whole corpus sweep synchronously
 * inside one `onmessage`, so a cancel message could not be delivered until the sweep finished.
 * The only way to stop it was `Worker.terminate()` — which Chromium honours by forcing
 * `TerminateExecution()` after a FIXED ~2 s delay when the thread never yields. Measured on the U4
 * runtime gate: the UI cancelled in 2 ms while the worker kept burning CPU for ~2026 ms, and every
 * ordinary supersede cost a thread respawn.
 *
 * So the sweep is now driven a slice at a time (`drainCooperative`) over the SAME resumable core
 * the synchronous entry point uses. Between slices the thread returns to the TASK QUEUE, which is
 * precisely what lets a `cancel` message arrive mid-search.
 *
 * PROTOCOL
 *   in   { id, seqQuery, docs, ctx }   start a heavy job (at most one at a time)
 *   in   { type:'cancel', id }         ask the ACTIVE job to stop
 *   out  { id, byId }                  the answer
 *   out  { id, error:{code,…} }        a deliberate engine verdict (worker stays healthy)
 *   out  { id, cancelled:true }        ACK — sent ONLY from `finally`, after the job has fully
 *                                      unwound. A client may not start the next heavy job before
 *                                      this arrives, which is what keeps «one heavy job» true
 *                                      without terminating anything.
 *
 * A partial `byId` is NEVER posted for a cancelled job: the drain throws instead of returning, so
 * there is no half-answer to publish (§3.3 — never a half-truth).
 *
 * Anything that is not one of the three deliberate verdicts is a FAULT: it is re-thrown out of the
 * message handler so it reaches the worker's `onerror` and the client tears the thread down. It is
 * re-thrown from a timer because a rejection inside an async handler would surface as an unhandled
 * rejection, which no `onerror` observes.
 */
import { searchAllSequencesSteps, expectedVerdictPayload } from './search-worker-core';
import { drainCooperative, SEARCH_CANCELLED } from './dna-search-cooperative';

let activeId = null;      // id of the job currently being drained
let cancelledId = null;   // id the client asked us to abandon

self.onmessage = async (e) => {
  const msg = (e && e.data) || {};

  // Control frame. Only the ACTIVE job can be cancelled; a cancel for anything else is a late
  // message about a job that already settled and must not poison the next one.
  if (msg.type === 'cancel') {
    if (activeId !== null && msg.id === activeId) cancelledId = msg.id;
    return;
  }

  const { id, seqQuery, docs, ctx } = msg;
  activeId = id;
  cancelledId = null;
  let cancelled = false;
  let reply = null;
  let fault = null;

  try {
    const byId = await drainCooperative(searchAllSequencesSteps(seqQuery, docs, ctx), {
      shouldCancel: () => cancelledId === id,
    });
    reply = { id, byId };
  } catch (err) {
    if (err && err.code === SEARCH_CANCELLED) {
      cancelled = true;
    } else {
      const error = expectedVerdictPayload(err);
      if (error) reply = { id, error }; // never alongside `byId` — verdict and answer are exclusive
      else fault = err;
    }
  } finally {
    activeId = null;
    cancelledId = null;
    // The ACK is posted HERE, after the generator's own `finally` blocks have run inside
    // `drainCooperative` — so «cancel-complete» means the old job is genuinely finished, not
    // merely asked to stop.
    if (cancelled) self.postMessage({ id, cancelled: true });
    else if (reply) self.postMessage(reply);
    if (fault) setTimeout(() => { throw fault; }, 0); // → worker `onerror` → client tears it down
  }
};
