/**
 * search-worker-client — COOPERATIVE CANCELLATION: the C2.1 races and the C2.1.1 quarantine window.
 *
 * Split out of `search-worker-client.test.js` by the C2.1.1 size-STOP; contents unchanged. This half
 * owns everything about STOPPING work: who may be cancelled, what counts as proof that a cancelled
 * job is over, and what the client refuses to do while it cannot know.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createSearchWorkerClient, SEARCH_ABORT, DEFAULT_QUARANTINE_MS,
} from '../search-worker-client';
import { MAX_APPROX_QUERY_LEN } from '../sequence-search-policy';
import { mkDoc, recordingFactory } from './helpers/search-worker-fakes';

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// U4-CANCEL C2.1 — the three races the C2 protocol left open, plus the ACK's exact shape.
//
// C2's fake workers acknowledged every cancel unconditionally, which hid all four of these: a queued
// search that nothing could stop, a worker that answered BEFORE it saw the cancel (leaving the client
// waiting 15 s for an ack that would never come), a watchdog that started new heavy work while the
// old thread was still dying, and an ack shaped like an answer.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('createSearchWorkerClient — C2.1 cancellation races', () => {
  const docs = [mkDoc('a', 'AAAGAATTGCCC')];
  const search = (client) => client.searchSequences('GAATTG', docs, { bothStrands: false });

  it('P1-1: a QUEUED search can be cancelled — it must not run after the ack', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = search(client);
    const pB = search(client);              // A is asked to stop; B waits for the ack
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });

    client.cancel();                        // the user closes the search while B is still queued
    await expect(pB).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });

    const w = factory.workers[0];
    w.ackCancel();                          // A finishes unwinding…
    await Promise.resolve();
    expect(w.jobs.length, 'a cancelled queued search must never be posted').toBe(1);
  });

  it('P1-2: a valid terminal result for the cancelled job COUNTS as the ack (no 15 s hang)', async () => {
    // The worker had already finished A when the cancel arrived, so it answers normally and then
    // ignores the late cancel — there is no `cancel-complete` coming, ever.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = search(client);
    const w = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });

    w.flushLast();                          // A's ordinary terminal reply, arriving after the cancel
    await Promise.resolve();

    const pB = search(client);              // must go out AT ONCE, not wait for an ack
    expect(w.jobs.length).toBe(2);
    expect(w.terminated, 'answering is not a fault — the worker is healthy').toBe(false);
    w.flushLast();
    expect((await pB).has('entry:a')).toBe(true);
  });

  it('P1-2b: a MALFORMED terminal for the cancelled job is a fault, not an ack', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = search(client);
    const w = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    w.sendRaw({ id: w.pendingCancelId(), byId: null }); // garbage where a terminal was expected
    expect(w.terminated, 'an unusable reply is a fault → tear the thread down').toBe(true);
  });

  it('P1-3: a broken ACK watchdog must NOT auto-start the queued search', async () => {
    // `terminate()` does not prove the thread is dead — the U4 runtime gate measured ~2026 ms to
    // `Target.targetDestroyed`. Starting queued work right after it is exactly how two heavy
    // threads end up running at once, so the queue is failed closed instead.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
    const pA = search(client);
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    const pB = search(client);                       // queued behind an ack that never comes
    await expect(pB).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });

    expect(factory.workers.length, 'no worker is spawned automatically').toBe(1);
    expect(factory.workers[0].terminated).toBe(true);
    // C2.1.1 CORRECTION. This test used to end here by asserting that a NEW, user-initiated search
    // gets worker #2 immediately — which re-opened the very hole the watchdog had just closed: an
    // explicit retry is no more proof that the silent thread stopped than an automatic one. The
    // window, and the recovery after it, are pinned in the quarantine block below.
    await expect(search(client)).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers.length).toBe(1);
  });

  it('P2: the ACK must be exactly { id, cancelled:true } — an answer-shaped ack is a fault', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = search(client);
    const w = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    w.sendRaw({ id: w.pendingCancelId(), cancelled: true, byId: {} }); // ack AND an answer
    expect(w.terminated, 'a suspicious worker must not stay in service').toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// U4-CANCEL C2.1.1 — FAIL-CLOSED means QUARANTINE, not «reject once and carry on».
//
// C2.1 stopped the watchdog from RELEASING queued work onto a fresh thread, but left the client
// immediately usable: the very next user search spawned worker #2 while the silent old one could
// still be computing. `terminate()` is a REQUEST, not a proof — the U4 runtime gate measured
// ~2026 ms from `terminate()` to `Target.targetDestroyed` on a worker whose synchronous JS never
// yielded. So «no parallel heavy work» was still false, merely harder to trigger. A SILENT fault
// (deadline missed, cancel unacknowledged, cancel unsendable) now opens a window during which no
// worker is created at all. An ANNOUNCED fault does not: a thread that answered — even with
// garbage — has returned to its event loop and is not burning CPU.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('createSearchWorkerClient — C2.1.1 fail-closed quarantine', () => {
  const docs = [mkDoc('a', 'AAAGAATTGCCC')];
  const search = (client) => client.searchSequences('GAATTG', docs, { bothStrands: false });

  it('the default window covers the MEASURED forced-termination delay', () => {
    // Not a round number picked for taste: Chromium's kForcibleTerminationDelay showed up as
    // ~2026 ms end-to-end on the U4 gate, so the window has to outlast it with margin.
    expect(DEFAULT_QUARANTINE_MS).toBeGreaterThan(2026);
    expect(DEFAULT_QUARANTINE_MS).toBe(2500);
  });

  it('TIMEOUT → no new worker until the window closes, to the millisecond', async () => {
    vi.useFakeTimers();
    try {
      const factory = recordingFactory();
      const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
      const p = search(client);
      vi.advanceTimersByTime(15);                       // never flushed → deadline missed
      await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.TIMEOUT });
      expect(factory.workers[0].terminated).toBe(true);

      await expect(search(client)).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(factory.workers.length, 'an immediate retry must not open a second heavy thread').toBe(1);

      vi.advanceTimersByTime(DEFAULT_QUARANTINE_MS - 1); // one tick short of the window
      await expect(search(client)).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(factory.workers.length).toBe(1);

      vi.advanceTimersByTime(1);                        // …and now it is over
      const pC = search(client);
      expect(factory.workers.length, 'an explicit retry after the window gets a fresh worker').toBe(2);
      factory.workers[1].flushLast();
      expect((await pC).has('entry:a')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('a broken ACK quarantines too — the wedged thread is still unwinding', async () => {
    vi.useFakeTimers();
    try {
      const factory = recordingFactory();
      const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
      const pA = search(client);
      client.cancel();
      await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
      const pB = search(client);                        // queued behind an ack that never comes
      vi.advanceTimersByTime(15);
      await expect(pB).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });

      await expect(search(client)).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(factory.workers.length, 'no worker #2 beside a thread that never answered').toBe(1);

      vi.advanceTimersByTime(DEFAULT_QUARANTINE_MS);
      const pC = search(client);
      expect(factory.workers.length).toBe(2);
      factory.workers[1].flushLast();
      expect((await pC).has('entry:a')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('a cancel we cannot even SEND quarantines — the same call must not spawn worker #2', async () => {
    // The uncertain-active fault C2.1 missed: `postMessage({type:'cancel'})` throws, so the job is
    // neither stopped nor known to have stopped — and the very `searchSequences` call that tried to
    // supersede it was about to carry on and ask a fresh worker for a second heavy pass.
    vi.useFakeTimers();
    try {
      const factory = recordingFactory();
      const client = createSearchWorkerClient(factory);
      const pA = search(client);
      const w = factory.workers[0];
      w.throwOnCancel = true;
      const pB = search(client);                        // supersede → the cancel frame throws
      await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
      await expect(pB).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(w.terminated).toBe(true);
      expect(factory.workers.length, 'an un-cancellable thread must not be joined by a second').toBe(1);

      await expect(search(client)).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
      expect(factory.workers.length).toBe(1);

      vi.advanceTimersByTime(DEFAULT_QUARANTINE_MS);
      const pC = search(client);
      expect(factory.workers.length).toBe(2);
      factory.workers[1].flushLast();
      expect((await pC).has('entry:a')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('P2 strict: an ack with an EXTRA key is not an ack (own-key allowlist)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = search(client);
    const w = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    w.sendRaw({ id: w.pendingCancelId(), cancelled: true, extra: 1 });
    expect(w.terminated, 'a field we cannot account for means a protocol we do not know').toBe(true);
    // CONTROL: this is an ANNOUNCED fault — the thread spoke, so it is back on its event loop and
    // the client is usable at once. Quarantine is for SILENCE, not for garbage.
    const pB = search(client);
    expect(factory.workers.length).toBe(2);
    factory.workers[1].flushLast();
    expect((await pB).has('entry:a')).toBe(true);
  });

  it('CONTROL: a VALID typed verdict for the cancelled job counts as the ack (worker kept)', async () => {
    // P1-2 is pinned above with an ordinary `byId` result; the other terminal a job can end with is
    // a deliberate §4.2.0 route. It must release the queue onto the SAME healthy worker — killing
    // it would charge a respawn to every over-long query.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const longQuery = 'A'.repeat(MAX_APPROX_QUERY_LEN + 1);
    const pA = client.searchSequences(longQuery, docs, { bothStrands: false });
    const w = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    const pB = search(client);                          // queued behind the ack
    w.sendRaw({
      id: w.pendingCancelId(),
      error: {
        code: SEARCH_ABORT.REQUIRES_ALIGNMENT,
        maxApproxLength: MAX_APPROX_QUERY_LEN,
        queryLength: longQuery.length,
      },
    });
    expect(w.terminated, 'a deliberate route is an answer, not a fault').toBe(false);
    expect(w.jobs.length, 'the queued search is released onto the same worker').toBe(2);
    w.flushLast();
    expect((await pB).has('entry:a')).toBe(true);
  });
});
