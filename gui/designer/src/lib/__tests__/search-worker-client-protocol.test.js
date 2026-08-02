/**
 * search-worker-client — REPLY PROTOCOL VALIDATION (S3-CLOSE K2.2).
 *
 * Split out of `search-worker-client.test.js` by the C2.1.1 size-STOP; contents unchanged. This half
 * owns the trust boundary: what the client is allowed to BELIEVE about a message whose `id` matches.
 */
import { describe, it, expect } from 'vitest';
import { createSearchWorkerClient, SEARCH_ABORT } from '../search-worker-client';
import { mkDoc } from './helpers/search-worker-fakes';

// S3-CLOSE K2.2 — PROTOCOL VALIDATION. A reply whose `id` matches is not automatically
// trustworthy: `Object.entries(byId || {})` used to turn a null/garbage payload into an
// EMPTY map, which the facade then published as an honest «no sites found». For a biologist
// that is a fabricated negative. Only a well-formed payload may resolve; anything else is a
// WORKER_FAILURE that tears the worker down so the next search runs on a fresh one.
describe('createSearchWorkerClient — reply protocol validation (S3-CLOSE K2.2)', () => {
  const docs = [mkDoc('a', 'GAATTG')];
  // The FULL canonical summary a real 6-mer exact hit carries — not just a drawable segment. The
  // compact boundary now re-validates every metric and the allowlist, so a valid injected reply must
  // be exactly what the worker-core finalizer emits: 16 metrics, `identityBps`, no alignment detail.
  const OCC = {
    location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false },
    metrics: {
      length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 1, coverage: 1,
      exactMatches: 6, substitutions: 0, insertions: 0, deletions: 0,
      indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
    },
  };
  // The per-document value is a LOCUS ENVELOPE (P1-2/P1-3), not a bare array: the retained window
  // plus how many loci exist and which retained one is the §3.2 winner. Neither number is derivable
  // downstream — `locationCount` was measured before the engine's payload cap, and `bestIndex` while
  // the edit script still existed — so the client refuses a reply that omits them.
  const ENV = (occurrences = [OCC]) => ({ occurrences, locationCount: occurrences.length, bestIndex: 0 });
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
    bare['entry:a'] = ENV();
    factory.workers[0].replyToLast({ byId: bare });
    expect((await p).get('entry:a').occurrences).toHaveLength(1);
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
    ['an UNKNOWN entityKey', { byId: { 'entry:ghost': ENV() } }],
    // A BARE ARRAY is the stale-engine reply: structurally fine, but silently «no winner, count =
    // whatever survived the cap». It must be refused by NAME, not merely as a side effect.
    ['a byId VALUE is a bare occurrence array, not an envelope', { byId: { 'entry:a': [OCC] } }],
    ['an envelope with no declared winner', { byId: { 'entry:a': { occurrences: [OCC], locationCount: 1, bestIndex: -1 } } }],
    ['an envelope whose count is smaller than its window', { byId: { 'entry:a': { occurrences: [OCC], locationCount: 0, bestIndex: 0 } } }],
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
    factory.workers[1].replyToLast({ byId: { 'entry:a': ENV() } });
    expect((await p2).has('entry:a')).toBe(true);
  });

  it('a LATE malformed reply from a superseded generation cannot kill the new search', async () => {
    // The superseded generation is now created by a FAULT (the only thing that still replaces a
    // worker); the invariant is unchanged — a dead generation cannot touch the live one.
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', docs);
    const w1 = factory.workers[0];
    w1.onerror?.({ message: 'worker crashed' }); // FAULT → w1 killed + detached
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.WORKER_FAILURE });

    const pB = client.searchSequences('GAATTG', docs, { bothStrands: false });
    const w2 = factory.workers[1];
    w1.reply({ id: w1.posted[0].id, byId: null }); // the OLD worker speaks garbage, late
    w2.replyToLast({ byId: { 'entry:a': ENV() } });
    expect((await pB).has('entry:a')).toBe(true);
    expect(w2.terminated).toBe(false);
  });

  it('a stale CANCEL-ACK from a dead generation does not release anything', async () => {
    // An ack is only meaningful from the worker we are actually waiting on.
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory);
    const pA = client.searchSequences('GAATTG', docs);
    const w1 = factory.workers[0];
    client.cancel();
    await expect(pA).rejects.toMatchObject({ reason: SEARCH_ABORT.CANCELLED });
    w1.onerror?.({ message: 'worker crashed' }); // FAULT while the ack was outstanding → w1 dropped
    const pB = client.searchSequences('GAATTG', docs, { bothStrands: false });
    const w2 = factory.workers[1];
    expect(w2).not.toBe(w1);
    w1.reply({ id: w1.posted[0].id, cancelled: true }); // late ack from the dead generation
    w2.replyToLast({ byId: { 'entry:a': ENV() } });
    expect((await pB).has('entry:a')).toBe(true);
    expect(w2.terminated).toBe(false);
  });

  it('a malformed reply carrying an UNKNOWN id stays a stale reply (ignored, not a failure)', async () => {
    const factory = rawFactory();
    const client = createSearchWorkerClient(factory, { timeoutMs: 0 });
    const p = client.searchSequences('GAATTG', docs);
    factory.workers[0].reply({ id: 'w-not-mine', byId: null }); // different request → ignore
    expect(factory.workers[0].terminated).toBe(false);
    factory.workers[0].replyToLast({ byId: { 'entry:a': ENV() } });
    expect((await p).has('entry:a')).toBe(true);
  });
});
