/**
 * §4.2.0 — `REQUIRES_ALIGNMENT` travels to the UI as a ROUTE, never as a failure or a zero.
 *
 * SCOPE — this file asserts what the SESSION does with the route once it has been raised, and is
 * deliberately blind to where it came from. Since U1 the signal is raised ONCE for the whole
 * collection (`search-worker-core` aggregates it over every eligible document; the per-document
 * throw out of `seqMatch` is buffered, never published from inside the sweep). The tracker
 * behaviour below is identical either way, which is the point: the corpus fix changed WHEN the
 * signal is raised, not WHAT it looks like on the wire.
 *
 * Three things must then be true of the session, and each has bitten a search product before:
 *
 *   1. it is NOT recorded as a provider failure — otherwise the bar says «проверка не выполнена»
 *      and the user hunts for a bug that does not exist;
 *   2. it does NOT trigger the deferred re-run — the metadata results around it are trustworthy
 *      and must stay openable;
 *   3. the session carries enough to render the specific message with the real limit.
 */
import { describe, it, expect } from 'vitest';
import { createProviderFailureTracker } from '../search-provider-failures';
import { deriveSearchSessionPresentation } from '../search-session-presentation';

const requiresAlignmentError = (queryLength = 400) => {
  const e = new Error('REQUIRES_ALIGNMENT');
  e.code = 'REQUIRES_ALIGNMENT';
  e.maxApproxLength = 100;
  e.queryLength = queryLength;
  return e;
};

describe('the tracker treats the length route as a route', () => {
  it('does not mark the dimension failed and does not make the session incomplete', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('sequence', () => () => { throw requiresAlignmentError(); });
    expect(matcher('q', {})).toEqual([]);
    expect(tracker.has('sequence'), 'the provider is not broken').toBe(false);
    expect(tracker.hasFailures(), 'no deferred re-run must be triggered').toBe(false);
    const snap = tracker.snapshot();
    expect(snap.incomplete).toBe(false);
    expect(snap.incompleteDims).toEqual([]);
    expect(snap.providerFailures).toEqual([]);
  });

  it('carries the limit and the offending length for the message', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('sequence', () => () => { throw requiresAlignmentError(400); });
    matcher('q', {});
    expect(tracker.snapshot().requiresAlignment).toEqual({ maxApproxLength: 100, queryLength: 400 });
  });

  it('a genuine provider error is still a failure — the route must not swallow real breakage', () => {
    const tracker = createProviderFailureTracker();
    const matcher = tracker.guard('sequence', () => () => { throw new Error('boom'); });
    matcher('q', {});
    expect(tracker.hasFailures()).toBe(true);
    expect(tracker.snapshot().incomplete).toBe(true);
    expect(tracker.snapshot().requiresAlignment).toBeNull();
  });

  it('a clean session reports no route at all', () => {
    expect(createProviderFailureTracker().snapshot().requiresAlignment).toBeNull();
  });
});

describe('the presentation ranks the route above «nothing found»', () => {
  const base = { ownsQuery: true, phase: 'final', rowCount: 0, providerExpected: true };

  it('with no rows it shows the route, NOT the empty state', () => {
    const p = deriveSearchSessionPresentation({ ...base, requiresAlignment: true });
    expect(p.statusKind).toBe('requires-alignment');
    expect(p.statusKind).not.toBe('empty');
    expect(p.countKind, '«· 0» beside the notice would read as zero matches').toBe('none');
  });

  it('rows are UNSELECTABLE candidates — the DNA leg of the query was never compared', () => {
    // Reviewer decision (21.07.2026), until a dedicated design pass: a row surfaced under this
    // route is a candidate, not an answer. Opening it would put an unchecked molecule in front of
    // the biologist as though the search had confirmed it. The only live action here is the move
    // to alignment. (Both this and `countKind` were corrected from an earlier, laxer reading.)
    const p = deriveSearchSessionPresentation({ ...base, rowCount: 3, requiresAlignment: true });
    expect(p.countKind).toBe('candidates');
    expect(p.showRows).toBe(true);
    expect(p.rowsDisabled, 'an uncompared molecule must not be openable as a result').toBe(true);
  });

  it('a blocked query still outranks it — that search never ran at all', () => {
    const p = deriveSearchSessionPresentation({ ...base, blocked: true, requiresAlignment: true });
    expect(p.statusKind).toBe('blocked');
  });

  it('without the flag nothing changes for existing states', () => {
    expect(deriveSearchSessionPresentation({ ...base, rowCount: 0 }).statusKind).toBe('empty');
    expect(deriveSearchSessionPresentation({ ...base, rowCount: 0, incomplete: true }).statusKind)
      .toBe('incomplete');
  });
});
