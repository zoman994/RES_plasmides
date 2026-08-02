/**
 * search-worker-fakes — the SHARED fake worker + factory for the search-worker-client contracts.
 *
 * Extracted by the C2.1.1 size-STOP: the client's test file had grown past the hard budget and was
 * split by contract (lifecycle · reply protocol · cancellation). All three drive the same client,
 * so the double is defined ONCE here — otherwise three copies drift and the files stop testing the
 * same worker. Not a `.test.js`, so vitest does not collect it.
 */
import { handleSearchMessage } from '../../search-worker-core';

export const mkDoc = (id, seq, topology = 'linear') => ({ ref: { kind: 'entry', id }, sequence: { seq, topology } });
// A worker whose responses the test flushes on demand, and that can crash / send a
// bad message. Records lifecycle so factory-level respawn is observable.
export function controllableWorker() {
  const w = {
    onmessage: null, onerror: null, onmessageerror: null,
    posted: [], queue: [], cancels: [], terminated: false,
    // C2.1.1 — set to simulate a port we can no longer even ask to stop (`postMessage` throws).
    throwOnCancel: false,
    postMessage(msg) {
      w.posted.push(msg);
      // U4-CANCEL C2 — a cancel is a CONTROL frame, not a job: the worker keeps running and will
      // acknowledge once the old job has unwound (`ackCancel`). It never produces a reply queue
      // entry, and it never yields a partial `byId`.
      if (msg && msg.type === 'cancel') {
        if (w.throwOnCancel) throw new Error('port closed');
        w.cancels.push(msg.id); return;
      }
      w.queue.push(handleSearchMessage(msg));
    },
    /** Deliver `cancel-complete` for the oldest un-acked cancel — the C2 gate. */
    ackCancel() {
      const id = w.cancels.shift();
      w.onmessage?.({ data: { id, cancelled: true } });
      return id;
    },
    /** Heavy jobs the worker was actually asked to run (control frames excluded). */
    get jobs() { return w.posted.filter((m) => !m || m.type !== 'cancel'); },
    /** id of the oldest cancel the client is still waiting on. */
    pendingCancelId() { return w.cancels[0]; },
    /** Deliver an ARBITRARY frame — for the C2.1 races the happy-path helpers cannot express. */
    sendRaw(payload) { w.onmessage?.({ data: payload }); },
    flushLast() { w.onmessage?.({ data: w.queue[w.queue.length - 1] }); },
    /** id of the newest heavy job — hold on to it to answer THAT job later (C2.2). */
    lastJobId() { return w.jobs.length ? w.jobs[w.jobs.length - 1].id : null; },
    /**
     * Answer ONE named job, however much has happened since.
     *
     * `flushLast()` answers whatever was posted most recently, which after a cooperative cancel is a
     * different job entirely — so a "late reply" test written on it was not testing lateness at all.
     * A late terminal has to name the job it belongs to.
     */
    flushJob(id) {
      const r = w.queue.find((x) => x && x.id === id);
      if (r) w.onmessage?.({ data: r });
      return !!r;
    },
    /** Answer a named job with a HAND-BUILT payload (verdicts, malformed frames). */
    replyToJob(id, over) { w.onmessage?.({ data: { id, ...over } }); },
    flushIndexes(order) { for (const i of order) w.onmessage?.({ data: w.queue[i] }); },
    crash() { w.onerror?.({ message: 'worker crashed' }); },
    badMessage() { w.onmessageerror?.({ message: 'bad message' }); },
    terminate() { w.terminated = true; },
  };
  return w;
}

// A factory that records every worker it hands out (to observe respawn / teardown).
export function recordingFactory() {
  const workers = [];
  const factory = () => { const w = controllableWorker(); workers.push(w); return w; };
  factory.workers = workers;
  return factory;
}
