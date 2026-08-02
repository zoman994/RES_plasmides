/**
 * REV #2 — S3-CLOSE / K2 corrective (P1-1): the INLINE path gets no more trust than the worker.
 *
 * `runInline` used to hand `searchAllSequences`'s return straight into `new Map(Object.entries(…))`
 * with zero validation — so a malformed inline result became either a silent «motif absent» or a
 * fabricated hit, exactly the failure the worker gate was built to stop. Both paths must run the
 * SAME structural check.
 *
 * The distinction that matters downstream: a broken WORKER is `WORKER_FAILURE` (kill it, respawn),
 * a broken INLINE ENGINE is `PROVIDER_ERROR` — there is no worker to blame or restart. Both are
 * failures; neither is a result.
 *
 * Isolated file: the real engine never returns garbage, so it is mocked here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSearchWorkerClient } from '../search-worker-client';
import { normalizeFailureReason, isSupersededFailure, PROVIDER_FAILURE } from '../search-provider-failures';

const stub = vi.hoisted(() => ({ ret: {}, throws: false }));
vi.mock('../search-worker-core', () => ({
  searchAllSequences: () => {
    if (stub.throws) throw new Error('inline engine boom');
    return stub.ret;
  },
}));

// A FULL canonical summary for the 6-mer `GAATTG` at [3,9). The inline path is now held to the
// SEQUENCE gate rather than the looser generic provider gate, so a location-only stub is no longer
// a well-formed reply — the metrics and the query length are part of what is verified.
const OCC = {
  location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false },
  metrics: {
    length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 1, coverage: 1,
    exactMatches: 6, substitutions: 0, insertions: 0, deletions: 0,
    indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
  },
};
const DOCS = [{ ref: { kind: 'entry', id: 'a' }, sequence: { seq: 'AAAGAATTGCCC', topology: 'linear' } }];

// Two ways to reach runInline: no factory at all (pure inline), and a factory that yields nothing
// while the caller explicitly opted into the fallback. Both must gate identically.
const CLIENTS = [
  ['pure inline (no factory)', () => createSearchWorkerClient(null)],
  ['inline fallback (factory yields null)', () => createSearchWorkerClient(() => null, { allowInlineFallback: true })],
];

beforeEach(() => { stub.ret = {}; stub.throws = false; });

describe.each(CLIENTS)('%s — the engine is validated, not trusted', (_label, makeClient) => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a Map', new Map([['entry:a', [OCC]]])],
    ['a Date', new Date()],
    ['an array', []],
    ['a string', 'entry:a'],
    ['an EMPTY occurrence array', { 'entry:a': [] }],
    ['[null] occurrences', { 'entry:a': [null] }],
    ['[{}] occurrences', { 'entry:a': [{}] }],
    ['empty segments', { 'entry:a': [{ location: { segments: [] } }] }],
    ['a zero-width segment', { 'entry:a': [{ location: { segments: [{ start: 4, end: 4 }] } }] }],
    ['non-integer coords', { 'entry:a': [{ location: { segments: [{ start: 1.5, end: 9 }] } }] }],
    ['an unknown entityKey', { 'entry:ghost': [OCC] }],
  ])('%s → PROVIDER_ERROR, never a complete miss', async (_l, ret) => {
    stub.ret = ret;
    const err = await makeClient().searchSequences('GAATTG', DOCS).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    // NOT a superseded drop (which is silently ignored) and NOT blamed on a worker.
    expect(isSupersededFailure(err)).toBe(false);
    expect(normalizeFailureReason(err)).toBe(PROVIDER_FAILURE.PROVIDER_ERROR);
  });

  it('an engine THROW is a PROVIDER_ERROR too (same cause, same honesty)', async () => {
    stub.throws = true;
    const err = await makeClient().searchSequences('GAATTG', DOCS).catch((e) => e);
    expect(normalizeFailureReason(err)).toBe(PROVIDER_FAILURE.PROVIDER_ERROR);
  });

  it('a well-formed result still resolves', async () => {
    // The inline path is held to the SEQUENCE gate, exactly like the worker path: the per-document
    // value is a locus envelope, and a bare array is refused (it carries neither the true locus
    // count nor the rule-7 winner).
    stub.ret = { 'entry:a': { occurrences: [OCC], locationCount: 1, bestIndex: 0 } };
    const map = await makeClient().searchSequences('GAATTG', DOCS);
    expect(map.get('entry:a').occurrences).toHaveLength(1);
  });

  it('an EMPTY result stays an honest miss (the engine ran and found nothing)', async () => {
    stub.ret = {};
    const map = await makeClient().searchSequences('GAATTG', DOCS);
    expect(map.size).toBe(0);
  });
});
