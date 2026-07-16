/**
 * search-worker-client — correlates async worker responses to their requests by id
 * and exposes a Promise API. Falls back to inline (main-thread) execution when the
 * factory yields no Worker (SSR / tests / old runtimes).
 *
 * RESILIENCE (task #168): single in-flight stream. A worker runs a SYNCHRONOUS full
 * pass that a message can't interrupt, so aborting active work TERMINATES the worker
 * and the next search spawns a fresh one via the factory. Every abort carries a
 * distinct reason (CANCELLED / TERMINATED / TIMEOUT / WORKER_FAILURE); a pending
 * request always settles — never hangs. terminate() closes the client permanently.
 */
import { describe, it, expect } from 'vitest';
import { createSearchWorkerClient, SEARCH_ABORT, SearchAbortError } from '../search-worker-client';
import { handleSearchMessage } from '../search-worker-core';

const mkDoc = (id, seq, topology = 'linear') => ({ ref: { kind: 'entry', id }, sequence: { seq, topology } });

// A worker whose responses the test flushes on demand, and that can crash / send a
// bad message. Records lifecycle so factory-level respawn is observable.
function controllableWorker() {
  const w = {
    onmessage: null, onerror: null, onmessageerror: null,
    posted: [], queue: [], terminated: false,
    postMessage(msg) { w.posted.push(msg); w.queue.push(handleSearchMessage(msg)); },
    flushLast() { w.onmessage?.({ data: w.queue[w.queue.length - 1] }); },
    flushIndexes(order) { for (const i of order) w.onmessage?.({ data: w.queue[i] }); },
    crash() { w.onerror?.({ message: 'worker crashed' }); },
    badMessage() { w.onmessageerror?.({ message: 'bad message' }); },
    terminate() { w.terminated = true; },
  };
  return w;
}

// A factory that records every worker it hands out (to observe respawn / teardown).
function recordingFactory() {
  const workers = [];
  const factory = () => { const w = controllableWorker(); workers.push(w); return w; };
  factory.workers = workers;
  return factory;
}

describe('createSearchWorkerClient — correlation + lifecycle', () => {
  it('resolves a search with a Map<docId, occurrences> (spawns a worker lazily)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    expect(factory.workers.length).toBe(0); // not spawned until the first search
    const p = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(1);
    factory.workers[0].flushLast();
    const map = await p;
    expect(map.get('entry:a')[0].location.segments[0]).toEqual({ start: 3, end: 9 });
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
    expect(map.get('entry:a')[0].location.segments[0]).toEqual({ start: 3, end: 9 });
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

  it('cancel() → CANCELLED, tears the busy worker down but keeps the client usable', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    client.cancel();
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    expect(factory.workers[0].terminated).toBe(true);
    expect(client.healthy).toBe(true);
    // the next search RESPAWNS a fresh worker and works
    const p2 = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    expect(factory.workers.length).toBe(2);
    factory.workers[1].flushLast();
    expect((await p2).has('entry:a')).toBe(true);
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

  it('a LATE error from a superseded worker does NOT reject the new search or kill the new worker', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', docs);
    const w1 = factory.workers[0];
    client.cancel(); // A cancelled → w1 killed + detached
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    const pB = client.searchSequences('GAATTG', [mkDoc('a', 'AAAGAATTGCCC')], { bothStrands: false });
    const w2 = factory.workers[1];
    expect(w2).not.toBe(w1);
    w1.crash();       // a late runtime error from the OLD, killed worker
    w1.badMessage();  // and a late deserialization error
    w2.flushLast();   // B's own worker replies
    expect((await pB).has('entry:a')).toBe(true); // B survived
    expect(w2.terminated).toBe(false);      // the healthy new worker was not torn down
  });

  it('after a timeout the next search spawns a FRESH worker and succeeds', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 15 });
    const p1 = client.searchSequences('GAATTG', docs);
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.TIMEOUT });
    expect(factory.workers[0].terminated).toBe(true);
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

  it('a new search supersedes the prior in-flight one (single stream)', async () => {
    const factory = recordingFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', [mkDoc('a', 'GAATTG')]);
    const pB = client.searchSequences('CCCC', [mkDoc('b', 'AACCCCAA')], { bothStrands: false });
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    factory.workers[factory.workers.length - 1].flushLast();
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

// S3-CLOSE K2.2 — PROTOCOL VALIDATION. A reply whose `id` matches is not automatically
// trustworthy: `Object.entries(byId || {})` used to turn a null/garbage payload into an
// EMPTY map, which the facade then published as an honest «no sites found». For a biologist
// that is a fabricated negative. Only a well-formed payload may resolve; anything else is a
// WORKER_FAILURE that tears the worker down so the next search runs on a fresh one.
describe('createSearchWorkerClient — reply protocol validation (S3-CLOSE K2.2)', () => {
  const docs = [mkDoc('a', 'GAATTG')];
  // The one shape a real occurrence has: a segment a caret can actually be drawn at.
  const OCC = { location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false } };
  // Posts nothing back on its own — the test injects the exact payload it wants to test.
  function rawWorker() {
    const w = {
      onmessage: null, onerror: null, onmessageerror: null,
      posted: [], terminated: false,
      postMessage(msg) { w.posted.push(msg); },
      reply(payload) { w.onmessage?.({ data: payload }); },
      replyToLast(over) { w.reply({ id: w.posted[w.posted.length - 1].id, ...over }); },
      terminate() { w.terminated = true; },
    };
    return w;
  }
  function rawFactory() {
    const workers = [];
    const factory = () => { const w = rawWorker(); workers.push(w); return w; };
    factory.workers = workers;
    return factory;
  }

  it('an EMPTY byId is a valid honest miss → resolves with an empty Map', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].replyToLast({ byId: {} });
    const map = await p;
    expect(map.size).toBe(0);
    expect(factory.workers[0].terminated).toBe(false); // healthy worker kept
  });

  it('a null-prototype record is still a plain record → valid', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    const bare = Object.create(null);
    bare['entry:a'] = [OCC];
    factory.workers[0].replyToLast({ byId: bare });
    expect((await p).get('entry:a')).toHaveLength(1);
  });

  it.each([
    ['byId: null', { byId: null }],
    ['byId missing entirely', {}],
    ['byId is an array', { byId: [] }],
    ['byId is a non-empty array', { byId: [['entry:a', []]] }],
    ['byId is a string', { byId: 'entry:a' }],
    ['byId is a number', { byId: 7 }],
    // ── P1-1: «looks like an object» is not proof of shape ──────────────────────────────
    // A Map/Date survives `typeof === 'object'` but Object.entries() yields [] → the old gate
    // published it as an honest «motif absent». That is a fabricated negative.
    ['byId is a Map', { byId: new Map([['entry:a', [OCC]]]) }],
    ['byId is a Date', { byId: new Date() }],
    ['a byId VALUE is not an array', { byId: { 'entry:a': { start: 3 } } }],
    ['a byId VALUE is null', { byId: { 'entry:a': null } }],
    ['a byId VALUE is a string', { byId: { 'entry:a': 'occurrences' } }],
    // A real worker NEVER writes an empty key (`if (occ.length) byId[d.id] = occ`), so an empty
    // array is corruption — not «this molecule has no site».
    ['a byId VALUE is an EMPTY array', { byId: { 'entry:a': [] } }],
    // …and these are the opposite failure: a truthy array the old gate read as a real DNA hit.
    ['occurrences are [null]', { byId: { 'entry:a': [null] } }],
    ['occurrences are [{}] (no location)', { byId: { 'entry:a': [{}] } }],
    ['an occurrence has no segments', { byId: { 'entry:a': [{ location: {} }] } }],
    ['an occurrence has EMPTY segments', { byId: { 'entry:a': [{ location: { segments: [] } }] } }],
    ['a segment is null', { byId: { 'entry:a': [{ location: { segments: [null] } }] } }],
    ['segment coords are non-integer', { byId: { 'entry:a': [{ location: { segments: [{ start: 0.5, end: 6 }] } }] } }],
    ['segment coords are NaN', { byId: { 'entry:a': [{ location: { segments: [{ start: NaN, end: 6 }] } }] } }],
    ['segment coords are Infinite', { byId: { 'entry:a': [{ location: { segments: [{ start: 0, end: Infinity }] } }] } }],
    ['a segment spans nothing (end === start)', { byId: { 'entry:a': [{ location: { segments: [{ start: 6, end: 6 }] } }] } }],
    ['a segment is inverted (end < start)', { byId: { 'entry:a': [{ location: { segments: [{ start: 9, end: 3 }] } }] } }],
    // The reply is not even about the document set we sent.
    ['an UNKNOWN entityKey', { byId: { 'entry:ghost': [OCC] } }],
  ])('%s → WORKER_FAILURE, never a fabricated result', async (_label, payload) => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].replyToLast(payload);
    await expect(p).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });
    expect(factory.workers[0].terminated).toBe(true); // a worker speaking garbage is torn down
  });

  it('after a malformed reply the NEXT search runs on a fresh worker and succeeds', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const p1 = client.searchSequences('GAATTG', docs);
    factory.workers[0].replyToLast({ byId: null });
    await expect(p1).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });

    const p2 = client.searchSequences('GAATTG', docs, { bothStrands: false });
    expect(factory.workers.length).toBe(2); // respawned
    factory.workers[1].replyToLast({ byId: { 'entry:a': [OCC] } });
    expect((await p2).has('entry:a')).toBe(true);
  });

  it('a LATE malformed reply from a superseded generation cannot kill the new search', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', docs);
    const w1 = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });

    const pB = client.searchSequences('GAATTG', docs, { bothStrands: false });
    const w2 = factory.workers[1];
    w1.reply({ id: w1.posted[0].id, byId: null }); // the OLD worker speaks garbage, late
    w2.replyToLast({ byId: { 'entry:a': [OCC] } });
    expect((await pB).has('entry:a')).toBe(true);
    expect(w2.terminated).toBe(false);
  });

  it('a malformed reply carrying an UNKNOWN id stays a stale reply (ignored, not a failure)', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 0 });
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].reply({ id: 'w-not-mine', byId: null }); // different request → ignore
    expect(factory.workers[0].terminated).toBe(false);
    factory.workers[0].replyToLast({ byId: { 'entry:a': [OCC] } });
    expect((await p).has('entry:a')).toBe(true);
  });
});
