/**
 * U4-CANCEL C2 — the cooperative worker protocol.
 *
 * C1 made the engine resumable; C2 makes the transport use that instead of `Worker.terminate()`.
 * What is pinned here:
 *   • the corpus loop and the §4.2.0 route are ONE resumable owner each — the synchronous entry
 *     points are those same generators drained without suspending (no second async exact-first);
 *   • the worker drives them cooperatively, answers `cancel` while still working, and ACKs only
 *     after the job has fully unwound;
 *   • a cancelled job never publishes a partial `byId`;
 *   • `CANCELLED` is transport control — it never appears as a provider verdict.
 *
 * The worker shell is exercised for real: the module assigns `self.onmessage`, so a stubbed `self`
 * lets the actual protocol run in-process.
 */
import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';
import { searchAllSequences, searchAllSequencesSteps, expectedVerdictPayload } from '../search-worker-core';
import { seqMatch, seqMatchSteps, REQUIRES_ALIGNMENT } from '../seq-match';
import { drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';

const countSteps = (gen) => { let n = 0; while (!gen.next().done) n += 1; return n; };
const CTX = { identityThreshold: 0.8, bothStrands: true };
const doc = (id, seq, topology = 'linear') => ({ id, seq, topology });

/**
 * A corpus heavy enough that the sweep really suspends before a cancel can arrive.
 *
 * It used to be 8 kb of poly-A per document against a 20-mer, which was heavy while the exact pass
 * ran through the bit-parallel engine. The exact phase is now a literal scan, and 16 kb of poly-A
 * finishes before the cancel is delivered — so the fixture, not the contract, had to grow. The query
 * is a MISS, which forces the approximate phase to run over every document: that is the phase a
 * biologist actually waits on, and the one a cancel has to be able to interrupt.
 */
const HEAVY_QUERY = 'ACGTTGCACCTGAAGTCCATGG';
const HEAVY = [
  doc('entry:a', 'ACGT'.repeat(75_000)),
  doc('entry:b', 'ACGT'.repeat(75_000)),
];

describe('C2 · the owners are resumable, and their sync entry points are the same code', () => {
  it('seqMatchSteps suspends; seqMatch is that generator drained', () => {
    const seq = { seq: 'A'.repeat(6000), topology: 'linear' };
    expect(countSteps(seqMatchSteps('A'.repeat(20), seq, null, { identityThreshold: 1 }))).toBeGreaterThan(0);
    const sync = seqMatch('A'.repeat(20), seq, null, { identityThreshold: 1 });
    // U5-A — the drained result is the SUMMARY model, not a bare array: `locationCount` is the count
    // the row and the inspector both display, and it must come from the engine rather than from
    // `occurrences.length` at each call site (a truncated list would then report a smaller molecule
    // than the one that was searched).
    expect(Array.isArray(sync.occurrences)).toBe(true);
    expect(sync.occurrences.length).toBeGreaterThan(0);
    expect(sync.locationCount).toBeGreaterThanOrEqual(sync.occurrences.length);
  });

  it('searchAllSequencesSteps suspends across the CORPUS, not just within one document', () => {
    const steps = countSteps(searchAllSequencesSteps(HEAVY_QUERY, HEAVY, CTX));
    expect(steps).toBeGreaterThan(0);
  });

  it('cooperative and synchronous corpus sweeps are byte-identical', async () => {
    const sync = searchAllSequences(HEAVY_QUERY, HEAVY, CTX);
    const coop = await drainCooperative(searchAllSequencesSteps(HEAVY_QUERY, HEAVY, CTX), { sliceMs: 0 });
    expect(JSON.stringify(coop)).toBe(JSON.stringify(sync));
  });

  it('the §4.2.0 route is decided identically on both drains (one exact-first, not two)', async () => {
    const q = 'ACGT'.repeat(30); // 120 nt > MAX_APPROX_QUERY_LEN, no exact hit anywhere
    const corpus = [doc('entry:a', 'TTTT'.repeat(400))];
    let syncCode = null;
    try { searchAllSequences(q, corpus, CTX); } catch (e) { syncCode = e.code; }
    let coopCode = null;
    try {
      await drainCooperative(searchAllSequencesSteps(q, corpus, CTX), { sliceMs: 0 });
    } catch (e) { coopCode = e.code; }
    expect(syncCode).toBe(REQUIRES_ALIGNMENT);
    expect(coopCode).toBe(REQUIRES_ALIGNMENT);
  });
});

describe('C2 · cancelling a corpus sweep', () => {
  it('rejects CANCELLED and publishes NO partial byId', async () => {
    let steps = 0;
    const gen = searchAllSequencesSteps(HEAVY_QUERY, HEAVY, CTX);
    const counting = { next: () => { steps += 1; return gen.next(); }, return: (v) => gen.return(v) };
    let value;
    await expect(
      drainCooperative(counting, { sliceMs: 0, shouldCancel: () => steps >= 2 })
        .then((v) => { value = v; }),
    ).rejects.toMatchObject({ code: SEARCH_CANCELLED });
    expect(value).toBeUndefined(); // a half-swept corpus is never returned (§3.3)
  });

  it('CANCELLED is transport control — never an engine verdict', () => {
    // The worker only serialises the three deliberate verdicts; a cancellation is not one of them,
    // so it can never reach a provider as an outcome about the molecule.
    expect(expectedVerdictPayload({ code: SEARCH_CANCELLED })).toBeNull();
    expect(expectedVerdictPayload({ code: 'RESOURCE_LIMIT' })).toEqual({ code: 'RESOURCE_LIMIT' });
    expect(expectedVerdictPayload({ code: 'INVALID_DNA' })).toEqual({ code: 'INVALID_DNA' });
    expect(expectedVerdictPayload(new Error('boom'))).toBeNull(); // a fault is not an answer
  });
});

describe('C2 · the worker shell speaks the protocol', () => {
  let posted;
  let realSelf;

  beforeEach(async () => {
    posted = [];
    realSelf = globalThis.self;
    globalThis.self = { onmessage: null, postMessage: (m) => posted.push(m) };
    // Fresh module instance per test so the worker's own activeId state is clean.
    vi.resetModules();
    await import('../search.worker.js');
  });
  afterEach(() => { globalThis.self = realSelf; });

  const send = (data) => globalThis.self.onmessage({ data });
  const settle = () => new Promise((r) => { setTimeout(r, 30); });

  it('answers an ordinary search with { id, byId }', async () => {
    send({ id: 'j1', seqQuery: 'GAATTG', docs: [doc('entry:a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    await settle();
    expect(posted.length).toBe(1);
    expect(posted[0].id).toBe('j1');
    expect(Object.keys(posted[0].byId)).toEqual(['entry:a']);
  });

  it('a cancel mid-search yields ONE cancel-complete and NO byId', async () => {
    send({ id: 'j2', seqQuery: HEAVY_QUERY, docs: HEAVY, ctx: CTX });
    send({ type: 'cancel', id: 'j2' }); // delivered while the sweep is still suspending
    await settle();
    expect(posted.length).toBe(1);
    expect(posted[0]).toEqual({ id: 'j2', cancelled: true });
    expect(posted[0].byId).toBeUndefined(); // never a half-answer
  });

  it('a cancel for a DIFFERENT job is ignored — the active one still answers', async () => {
    send({ id: 'j3', seqQuery: 'GAATTG', docs: [doc('entry:a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    send({ type: 'cancel', id: 'someone-else' });
    await settle();
    expect(posted.length).toBe(1);
    expect(posted[0].id).toBe('j3');
    expect(posted[0].cancelled).toBeUndefined();
  });

  it('a deliberate verdict is answered as data and does NOT cancel or crash the worker', async () => {
    const q = 'ACGT'.repeat(30);
    send({ id: 'j4', seqQuery: q, docs: [doc('entry:a', 'TTTT'.repeat(400))], ctx: CTX });
    await settle();
    expect(posted.length).toBe(1);
    expect(posted[0].id).toBe('j4');
    expect(posted[0].error.code).toBe(REQUIRES_ALIGNMENT);
    expect(posted[0].byId).toBeUndefined(); // verdict and answer are exclusive
    // …and the worker is still in service:
    send({ id: 'j5', seqQuery: 'GAATTG', docs: [doc('entry:a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    await settle();
    expect(posted[1].id).toBe('j5');
    expect(posted[1].byId).toBeDefined();
  });

  it('a cancel arriving after the job finished cannot poison the next job', async () => {
    send({ id: 'j6', seqQuery: 'GAATTG', docs: [doc('entry:a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    await settle();
    send({ type: 'cancel', id: 'j6' }); // late — j6 already answered
    send({ id: 'j7', seqQuery: 'GAATTG', docs: [doc('entry:a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    await settle();
    expect(posted.map((m) => m.id)).toEqual(['j6', 'j7']);
    expect(posted[1].byId).toBeDefined(); // j7 answered normally, not cancelled
  });
});
