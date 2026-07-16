/**
 * REV #2 — S3-CLOSE / K2.1: the pure failure model for the three biological providers.
 *
 * A biologist must always be able to tell «the check ran and found nothing» from «the check
 * did not run, so the absence of a motif / protein / restriction site is NOT proven». That
 * distinction starts here: a tracker that records WHICH dimension failed and WHY, and a
 * guarded matcher that turns any provider misbehaviour (throw on construction, throw on call,
 * a non-array return) into a recorded failure instead of a silent empty result.
 *
 * Deliberately free of raw error text: a snapshot travels into the session and the UI, so it
 * carries a normalized reason only — never `Error.message`, never a stack.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createProviderFailureTracker,
  normalizeFailureReason,
  isSupersededFailure,
  PROVIDER_FAILURE,
  PROVIDER_DIMENSIONS,
} from '../search-provider-failures';
import { SEARCH_ABORT, SearchAbortError } from '../search-worker-client';

const OCC = [{ location: { segments: [{ start: 0, end: 6 }] } }];

describe('normalizeFailureReason — worker reasons map onto the three public causes', () => {
  it('TIMEOUT stays TIMEOUT', () => {
    expect(normalizeFailureReason(new SearchAbortError(SEARCH_ABORT.TIMEOUT))).toBe(PROVIDER_FAILURE.TIMEOUT);
  });

  it('WORKER_FAILURE stays WORKER_FAILURE', () => {
    expect(normalizeFailureReason(new SearchAbortError(SEARCH_ABORT.WORKER_FAILURE))).toBe(PROVIDER_FAILURE.WORKER_FAILURE);
  });

  it('an unknown Error with no reason → PROVIDER_ERROR (never silently dropped)', () => {
    expect(normalizeFailureReason(new Error('inline engine boom'))).toBe(PROVIDER_FAILURE.PROVIDER_ERROR);
    expect(normalizeFailureReason(undefined)).toBe(PROVIDER_FAILURE.PROVIDER_ERROR);
    expect(normalizeFailureReason('nonsense')).toBe(PROVIDER_FAILURE.PROVIDER_ERROR);
  });
});

describe('isSupersededFailure — a cancelled search is NOT a provider failure', () => {
  it('CANCELLED and TERMINATED are superseded; everything else is a real failure', () => {
    expect(isSupersededFailure(new SearchAbortError(SEARCH_ABORT.CANCELLED))).toBe(true);
    expect(isSupersededFailure(new SearchAbortError(SEARCH_ABORT.TERMINATED))).toBe(true);
    expect(isSupersededFailure(new SearchAbortError(SEARCH_ABORT.TIMEOUT))).toBe(false);
    expect(isSupersededFailure(new SearchAbortError(SEARCH_ABORT.WORKER_FAILURE))).toBe(false);
    expect(isSupersededFailure(new Error('boom'))).toBe(false);
  });
});

describe('createProviderFailureTracker — guarded matcher', () => {
  it('a healthy matcher passes its occurrences through untouched and records nothing', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => () => OCC);
    expect(matcher('q', {}, {}, {}, {})).toBe(OCC);
    expect(tracker.hasFailures()).toBe(false);
    expect(tracker.snapshot()).toEqual({ incomplete: false, incompleteDims: [], providerFailures: [] });
  });

  it('an empty array is an HONEST MISS, not a failure', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('sequence', () => () => []);
    expect(matcher('q', {}, {}, {}, {})).toEqual([]);
    expect(tracker.hasFailures()).toBe(false);
  });

  it('a factory that THROWS is recorded before any document is scanned', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => { throw new Error('cannot build translator'); });
    expect(tracker.hasFailures()).toBe(true);
    expect(matcher('q', {}, {}, {}, {})).toEqual([]); // no-op afterwards
    expect(tracker.snapshot().providerFailures).toEqual([
      { dimension: 'protein', reason: PROVIDER_FAILURE.PROVIDER_ERROR },
    ]);
  });

  it('a matcher that THROWS mid-scan is recorded and degrades to a no-op', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('enzyme', () => () => { throw new Error('bad enzyme'); });
    expect(tracker.hasFailures()).toBe(false); // construction was fine
    expect(matcher('q', {}, {}, {}, {})).toEqual([]);
    expect(tracker.hasFailures()).toBe(true);
    expect(tracker.snapshot().incompleteDims).toEqual(['enzyme']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { 0: 'x' }],
    ['a Promise', Promise.resolve([])],
    ['a string', 'GAATTC'],
    ['a number', 3],
  ])('%s is NOT a valid matcher result → PROVIDER_ERROR', (_label, value) => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('sequence', () => () => value);
    expect(matcher('q', {}, {}, {}, {})).toEqual([]);
    expect(tracker.snapshot().providerFailures).toEqual([
      { dimension: 'sequence', reason: PROVIDER_FAILURE.PROVIDER_ERROR },
    ]);
  });

  it('after the first failure the matcher is never invoked again (no repeated cost, no repeated throw)', () => {
    const inner = vi.fn(() => { throw new Error('boom'); });
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => inner);
    matcher('q', {}, {}, {}, {});
    matcher('q', {}, {}, {}, {});
    matcher('q', {}, {}, {}, {});
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('a repeated failure does not duplicate the dimension (first reason wins)', () => {
    const tracker = createProviderFailureTracker();
    tracker.record('sequence', new SearchAbortError(SEARCH_ABORT.TIMEOUT));
    tracker.record('sequence', new SearchAbortError(SEARCH_ABORT.WORKER_FAILURE));
    expect(tracker.snapshot().incompleteDims).toEqual(['sequence']);
    expect(tracker.snapshot().providerFailures).toEqual([
      { dimension: 'sequence', reason: PROVIDER_FAILURE.TIMEOUT },
    ]);
  });
});

// K3.0 — the guard gained an explicit validator seam. Until K3 it accepted ANY array, so an
// inline protein/cut engine could hand back `[null]`, `[{}]` or coordinates off the end of the
// molecule and have them published as a confirmed biological hit. The validator sees the output
// AND the real matcher arguments, so it can check each hit against THAT document's sequence.
describe('createProviderFailureTracker — guard(dimension, factory, validate) seam', () => {
  const OCC = { location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false } };
  const doc = (seq) => ({ ref: { kind: 'entry', id: 'a' }, sequence: { seq } });

  it('without a validator the legacy default still applies: any array passes', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => () => [{ anything: true }]);
    expect(matcher('q', {}, {}, {})).toEqual([{ anything: true }]);
    expect(tracker.hasFailures()).toBe(false);
  });

  it('the validator receives the matcher OUTPUT and its REAL arguments', () => {
    const seen = [];
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => () => [OCC], (out, args) => { seen.push({ out, args }); return true; });
    const d = doc('ACGTACGTAC');
    matcher('HXHH', d, { aaQuery: 'HXHH' }, { ctx: 1 });
    expect(seen).toHaveLength(1);
    expect(seen[0].out).toEqual([OCC]);
    // protein/cut receive the document at index 1 — that is how the validator reaches the length.
    expect(seen[0].args[1]).toBe(d);
  });

  it('a validator REJECT is a provider failure, not an empty result', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('enzyme', () => () => [OCC], () => false);
    expect(matcher('EcoRI', doc('ACGT'), {}, {})).toEqual([]);
    expect(tracker.hasFailures()).toBe(true);
    expect(tracker.snapshot()).toEqual({
      incomplete: true,
      incompleteDims: ['enzyme'],
      providerFailures: [{ dimension: 'enzyme', reason: PROVIDER_FAILURE.PROVIDER_ERROR }],
    });
  });

  it('a rejecting validator degrades the matcher to a no-op (never re-invoked)', () => {
    const inner = vi.fn(() => [OCC]);
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => inner, () => false);
    matcher('q', doc('ACGT'), {}, {});
    matcher('q', doc('ACGT'), {}, {});
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('a validator that THROWS is itself a provider failure — it can never break the search', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => () => [OCC], () => { throw new Error('validator boom'); });
    expect(matcher('q', doc('ACGT'), {}, {})).toEqual([]);
    expect(tracker.snapshot().incompleteDims).toEqual(['protein']);
  });

  it('an honest [] still passes the validator path untouched', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('protein', () => () => [], (out) => Array.isArray(out) && out.length === 0);
    expect(matcher('q', doc('ACGT'), {}, {})).toEqual([]);
    expect(tracker.hasFailures()).toBe(false);
  });
});

describe('createProviderFailureTracker — snapshot', () => {
  it('dimensions are always ordered sequence → protein → enzyme, whatever the failure order', () => {
    const tracker = createProviderFailureTracker();
    tracker.record('enzyme', new Error('a'));
    tracker.record('protein', new Error('b'));
    tracker.record('sequence', new SearchAbortError(SEARCH_ABORT.TIMEOUT));
    const snap = tracker.snapshot();
    expect(snap.incompleteDims).toEqual(['sequence', 'protein', 'enzyme']);
    expect(snap.providerFailures.map((f) => f.dimension)).toEqual(['sequence', 'protein', 'enzyme']);
    expect(PROVIDER_DIMENSIONS).toEqual(['sequence', 'protein', 'enzyme']);
  });

  it('never leaks a raw message or stack into the session', () => {
    const tracker = createProviderFailureTracker();
    const err = new Error('SECRET internal path C:/users/zoman/x.js');
    tracker.record('protein', err);
    const serialized = JSON.stringify(tracker.snapshot());
    expect(serialized).not.toContain('SECRET');
    expect(serialized).not.toContain('stack');
    expect(tracker.snapshot().providerFailures[0]).toEqual({
      dimension: 'protein', reason: PROVIDER_FAILURE.PROVIDER_ERROR,
    });
  });

  it('returns fresh arrays each call (a consumer cannot mutate tracker state)', () => {
    const tracker = createProviderFailureTracker();
    tracker.record('sequence', new Error('x'));
    const a = tracker.snapshot();
    a.incompleteDims.push('protein');
    expect(tracker.snapshot().incompleteDims).toEqual(['sequence']);
  });

  it('a clean tracker snapshots as an explicitly COMPLETE session', () => {
    expect(createProviderFailureTracker().snapshot()).toEqual({
      incomplete: false, incompleteDims: [], providerFailures: [],
    });
  });
});
