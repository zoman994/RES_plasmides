/**
 * search-worker-client — CORRELATION, INLINE FALLBACK and RESILIENCE contracts.
 *
 * Correlates async worker responses to their requests by id and exposes a Promise API; falls back
 * to inline (main-thread) execution when the factory yields no Worker (SSR / tests / old runtimes).
 *
 * RESILIENCE (task #168) → COOPERATIVE CANCEL (U4-CANCEL C2 → C2.1.1): single in-flight stream.
 * An ORDINARY cancel no longer terminates anything — the resumable engine is asked to stop and
 * acknowledges, and the healthy worker stays in service. Termination is the FAULT path, and after a
 * SILENT fault the client quarantines itself instead of handing out a fresh worker beside a thread
 * that may still be running. Every abort carries a distinct reason (CANCELLED / TERMINATED /
 * TIMEOUT / WORKER_FAILURE); a pending request always settles — never hangs. terminate() closes the
 * client permanently.
 *
 * Split by contract (C2.1.1 size-STOP): the reply-protocol envelope lives in
 * `search-worker-client-protocol.test.js`, the cancellation races and the quarantine window in
 * `search-worker-client-cancel.test.js`. Same client, same fakes, same assertions.
 */
import { describe, it, expect } from 'vitest';
import { createSearchWorkerClient, SEARCH_ABORT, SearchAbortError } from '../search-worker-client';
import { mkDoc, controllableWorker, recordingFactory } from './helpers/search-worker-fakes';

describe('createSearchWorkerClient — correlation + lifecycle', () => {
  it('resolves a search with a Map<docId, occurrences> (spawns a worker lazily)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    expect(factory.workers.length).toBe(0); // not spawned until the first search
    const p = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(1);
    factory.workers[0].flushLast();
    const map = await p;
    // The map value is a LOCUS ENVELOPE (P1-2/P1-3): the retained window, plus how many loci exist
    // and which retained one is the §3.2 winner — neither recomputable on this side of the boundary.
    expect(map.get('entry:a').occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
  });

  it('only forwards docs that carry a sequence', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const docs = [mkDoc('a', 'GAATTG'), { ref: { kind: 'entry', id: 'noSeq' } }];
    const p = client.searchSequences('GAATTG', docs);
    expect(factory.workers[0].posted[0].docs.map((d) => d.id)).toEqual(['entry:a']); // composite key (§10.4)
    factory.workers[0].flushLast();
    await p;
  });
});

describe('createSearchWorkerClient — inline fallback (factory yields no worker)', () => {
  it('runs inline only when the caller explicitly opts into the test/core fallback', async () => {
    const client = createSearchWorkerClient(() => null, { allowInlineFallback: true });
    const map = await client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    // The map value is a LOCUS ENVELOPE (P1-2/P1-3): the retained window, plus how many loci exist
    // and which retained one is the §3.2 winner — neither recomputable on this side of the boundary.
    expect(map.get('entry:a').occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
  });

  it('fails closed when a runtime worker factory cannot create a worker', async () => {
    const client = createSearchWorkerClient(() => null);
    await expect(client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
  });

  it('retries the factory after one unavailable attempt and recovers on the next search', async () => {
    let attempts = 0;
    let recoveredWorker = null;
    const client = createSearchWorkerClient(() => {
      attempts += 1;
      if (attempts === 1) return null;
      recoveredWorker = controllableWorker();
      return recoveredWorker;
    });

    await expect(client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')]))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });

    const next = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    recoveredWorker.flushLast();
    expect((await next).has('entry:a')).toBe(true);
    expect(attempts).toBe(2);
  });
  it('a missing factory is pure inline; cancel() / terminate() are safe no-ops', async () => {
    const client = createSearchWorkerClient(null);
    const map = await client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(map.has('entry:a')).toBe(true);
    expect(() => { client.cancel(); client.terminate(); }).not.toThrow();
  });
});

// A crashed / hung / torn-down worker must SETTLE its pending promise with a distinct
// reason, terminate the worker (a sync loop ignores messages) and let the next search
// spawn a fresh one — never hang, never wait 15 s on a dead worker.
describe('createSearchWorkerClient — resilience (kill + respawn, distinct reasons)', () => {
  const docs = [mkDoc('a', 'GAATTG')];

  it('worker onerror → WORKER_FAILURE, tears the worker down', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].crash();
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('worker onmessageerror → WORKER_FAILURE', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].badMessage();
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
  });

  it('timeout → TIMEOUT, tears the worker down (no 15 s wait on a hung worker)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
    const p = client.searchSequences('GAATTG', docs); // never flushed
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.TIMEOUT });
    expect(factory.workers[0].terminated).toBe(true);
  });

  it('terminate() → TERMINATED, tears the worker down and CLOSES the client', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    client.terminate();
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.TERMINATED });
    expect(factory.workers[0].terminated).toBe(true);
    expect(client.healthy).toBe(false);
  });

  it('a search after terminate() is rejected IMMEDIATELY (never waits on a dead worker)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 9999 });
    client.terminate();
    const p = client.searchSequences('GAATTG', docs);
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.TERMINATED });
    expect(factory.workers.length).toBe(0); // no worker spawned for a closed client
  });

  // ── U4-CANCEL C2: an ordinary cancel no longer kills anything ────────────────────────────────
  // DELIBERATELY INVERTED. Before C2 the only way to stop a busy worker was `terminate()`, so this
  // test asserted a teardown and a respawn on every supersede. That is exactly the behaviour the U4
  // runtime gate measured as ~2026 ms of CPU still burning after the UI had cancelled — Chromium
  // only forces termination ~2 s after a thread that never yields. Now the worker cooperates: the
  // caller's promise settles at once, the thread unwinds itself and stays in service.
  it('cancel() → CANCELLED at once, and the HEALTHY worker is kept (no teardown, no respawn)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    expect(factory.workers[0].terminated).toBe(false); // NOT torn down — it is healthy, just busy
    expect(factory.workers[0].cancels.length).toBe(1); // it was ASKED to stop
    expect(client.healthy).toBe(true);
  });

  it('the next heavy job waits for cancel-complete, then runs on the SAME worker', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });

    const w = factory.workers[0];
    const p2 = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(1);   // no respawn
    expect(w.jobs.length).toBe(1);            // …and the new job is NOT posted yet — ack gates it

    w.ackCancel();                            // «the old job has fully unwound»
    expect(w.jobs.length).toBe(2);            // only NOW is the next heavy job sent
    w.flushLast();
    expect((await p2).has('entry:a')).toBe(true);
    expect(w.terminated).toBe(false);
  });

  it('only the LATEST queued search survives while a cancel is still unwinding', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    const w = factory.workers[0];
    const pA = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    const pB = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED }); // superseded in the queue
    w.ackCancel();
    w.flushLast();
    expect((await pB).has('entry:a')).toBe(true);
    expect(w.jobs.length).toBe(2); // the first job + exactly ONE queued job — never two heavy jobs
  });

  it('a cancelled job never publishes a partial byId', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    const w = factory.workers[0];
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    // Even if the worker's ORIGINAL reply arrives late, it must not resolve anything.
    let resolved = false;
    p1.then(() => { resolved = true; }, () => {});
    w.flushLast();
    w.ackCancel();
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it('a wedged worker that never acknowledges is torn down by the ack watchdog', async () => {
    // The ONLY remaining hard-terminate for a cancel: the thread did not answer at all.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
    const p1 = client.searchSequences('GAATTG', docs);
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    await new Promise((r) => { setTimeout(r, 40); }); // no ack ever comes
    expect(factory.workers[0].terminated).toBe(true);
    // C2.1.1 — and the client does NOT immediately hand out a second thread beside it; the window
    // and the recovery after it are pinned in the quarantine block below.
    await expect(client.searchSequences('GAATTG', docs))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers.length).toBe(1);
  });

  it('a fresh search after a crash respawns and succeeds (repeat after failure)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    factory.workers[0].crash();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    const p2 = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(2); // respawned
    factory.workers[1].flushLast();
    expect((await p2).has('entry:a')).toBe(true);
  });

  it('a LATE error from a CRASHED worker does NOT reject the new search or kill the new worker', async () => {
    // A crash still respawns (faults are the fault-fallback path C2 keeps); the point pinned here
    // is that the dead generation can no longer touch the live one.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', docs);
    const w1 = factory.workers[0];
    w1.crash(); // FAULT → w1 killed + detached
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    const pB = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    const w2 = factory.workers[1];
    expect(w2).not.toBe(w1);
    w1.crash();       // a late runtime error from the OLD, killed worker
    w1.badMessage();  // and a late deserialization error
    w2.flushLast();   // B's own worker replies
    expect((await pB).has('entry:a')).toBe(true); // B survived
    expect(w2.terminated).toBe(false);      // the healthy new worker was not torn down
  });

  it('after a timeout the next search spawns a FRESH worker — once the quarantine window closes', async () => {
    // DELIBERATELY INVERTED by C2.1.1. This used to assert an INSTANT respawn, which is precisely
    // the second heavy thread the U4 gate measured: the timed-out worker can keep burning CPU for
    // ~2 s after `terminate()`. Recovery is still guaranteed — just not before then.
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 15, quarantineMs: 30 });
    const p1 = client.searchSequences('GAATTG', docs);
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.TIMEOUT });
    expect(factory.workers[0].terminated).toBe(true);
    await expect(client.searchSequences('GAATTG', docs))
      .rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers.length).toBe(1);

    await new Promise((r) => { setTimeout(r, 50); }); // the window closes
    const p2 = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(2); // respawned
    factory.workers[1].flushLast();
    expect((await p2).has('entry:a')).toBe(true);
  });

  it('a factory that yields no worker (inline mode) still closes on terminate()', async () => {
    const client = createSearchWorkerClient(() => null, { allowInlineFallback: true });
    client.terminate();
    await expect(client.searchSequences('GAATTG', docs)).rejects.toMatchObject({ reason: SEARCH_ABORT.TERMINATED });
    expect(client.healthy).toBe(false);
  });

  it('the pure-inline (no factory) client rejects a search after terminate() (unified lifecycle)', async () => {
    const client = createSearchWorkerClient(null);
    client.terminate();
    await expect(client.searchSequences('GAATTG', docs)).rejects.toMatchObject({ reason: SEARCH_ABORT.TERMINATED });
    expect(client.healthy).toBe(false);
  });

  it('a new search supersedes the prior in-flight one (single stream, same worker after ack)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', [mkDoc('a', 'GAATTG')]);
    const pB = client.searchSequences('CCCC', [mkDoc('b', 'AACCCCAA')], { bothStrands: false });
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    const w = factory.workers[0];
    expect(factory.workers.length).toBe(1); // C2: supersede reuses the healthy worker
    w.ackCancel();                          // B is released only once A has unwound
    w.flushLast();
    expect((await pB).has('entry:b')).toBe(true);
  });

  it('a late reply for an already-settled request is ignored (no throw)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    p.catch(() => {});
    client.terminate();
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.TERMINATED });
    expect(() => factory.workers[0].flushIndexes([0])).not.toThrow();
  });

  it('SearchAbortError is a real Error carrying the reason', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    client.cancel();
    const err = await p.catch((e) => e);
    expect(err).toBeInstanceOf(SearchAbortError);
    expect(err).toBeInstanceOf(Error);
    expect(err.reason).toBe(SEARCH_ABORT.CANCELLED);
  });
});
