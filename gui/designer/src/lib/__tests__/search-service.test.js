/**
 * search-service — the async facade (P1). Metadata dims are instant; the
 * sequence/protein dims may be slow (worker in P1.5), so the facade:
 *   • stamps every search with a monotonic requestId,
 *   • drops a response whose request is no longer the latest (stale-drop),
 *   • can emit an instant `partial` (metadata) before the `final` result.
 * It is engine-agnostic: `resolve` does the real work (calls runSearch + worker).
 */
import { describe, it, expect, vi } from 'vitest';
import { createSearchService } from '../search-service';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

describe('createSearchService — happy path', () => {
  it('resolves fresh, invokes onResult with the final session', async () => {
    const resolve = vi.fn(async (plan) => ({ status: 'done', results: [{ q: plan.raw }] }));
    const svc = createSearchService({ resolve });
    const onResult = vi.fn();
    const out = await svc.search({ raw: 'x' }, [], {}, onResult);
    expect(out.stale).toBe(false);
    expect(out.session.results[0].q).toBe('x');
    expect(out.session.requestId).toBe(out.requestId);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][1]).toMatchObject({ stale: false, phase: 'final' });
  });

  it('with no resolve dep, returns an empty done session', async () => {
    const svc = createSearchService({});
    const out = await svc.search({ raw: '' }, []);
    expect(out.stale).toBe(false);
    expect(out.session.status).toBe('done');
    expect(out.session.results).toEqual([]);
  });
});

describe('createSearchService — stale-drop', () => {
  it('a slow earlier search is dropped when a newer one has started', async () => {
    const queue = [];
    const resolve = vi.fn(() => { const d = deferred(); queue.push(d); return d.promise; });
    const svc = createSearchService({ resolve });
    const onResult = vi.fn();

    const pA = svc.search({ raw: 'A' }, [], {}, onResult); // requestId r1
    const pB = svc.search({ raw: 'B' }, [], {}, onResult); // requestId r2 (now latest)

    queue[1].resolve({ status: 'done', results: [{ q: 'B' }] }); // B finishes first
    queue[0].resolve({ status: 'done', results: [{ q: 'A' }] }); // A finishes late → stale

    const [outA, outB] = await Promise.all([pA, pB]);
    expect(outB.stale).toBe(false);
    expect(outB.session.results[0].q).toBe('B');
    expect(outA.stale).toBe(true);
    expect(outA.session).toBeNull();

    // onResult fired only for the fresh (B) final, never for the stale (A) final.
    const finals = onResult.mock.calls.filter((c) => c[1].phase === 'final');
    expect(finals).toHaveLength(1);
    expect(finals[0][0].results[0].q).toBe('B');
  });
});

describe('createSearchService — instant partial then final', () => {
  it('emits a metadata partial synchronously, then the async final', async () => {
    const runMetadata = (plan) => ({ status: 'partial', results: [{ dim: 'name', q: plan.raw }] });
    const d = deferred();
    const resolve = () => d.promise;
    const svc = createSearchService({ resolve, runMetadata });
    const onResult = vi.fn();

    const p = svc.search({ raw: 'pBG' }, [], {}, onResult);
    // partial must be delivered before the async final resolves
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult.mock.calls[0][1].phase).toBe('partial');
    expect(onResult.mock.calls[0][0].status).toBe('partial');

    d.resolve({ status: 'done', results: [{ dim: 'sequence' }] });
    await p;
    expect(onResult).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls[1][1].phase).toBe('final');
  });

  it('does not emit a partial for a search once it is superseded before final', async () => {
    const runMetadata = (plan) => ({ status: 'partial', results: [{ q: plan.raw }] });
    const queue = [];
    const resolve = () => { const dd = deferred(); queue.push(dd); return dd.promise; };
    const svc = createSearchService({ resolve, runMetadata });
    const onResult = vi.fn();

    const pA = svc.search({ raw: 'A' }, [], {}, onResult);
    const pB = svc.search({ raw: 'B' }, [], {}, onResult);
    queue[1].resolve({ status: 'done', results: ['B'] });
    queue[0].resolve({ status: 'done', results: ['A'] });
    await Promise.all([pA, pB]);

    // Two partials (A,B) allowed, but only ONE final (B). No stale-A final.
    const finals = onResult.mock.calls.filter((c) => c[1].phase === 'final');
    expect(finals).toHaveLength(1);
  });
});

describe('createSearchService — lifecycle', () => {
  it('latestRequestId tracks the most recent search', async () => {
    const svc = createSearchService({ resolve: async () => ({ status: 'done', results: [] }) });
    await svc.search({ raw: '1' }, []);
    const first = svc.latestRequestId;
    await svc.search({ raw: '2' }, []);
    expect(svc.latestRequestId).not.toBe(first);
  });

  it('cancel() makes an in-flight request resolve stale', async () => {
    const d = deferred();
    const svc = createSearchService({ resolve: () => d.promise });
    const onResult = vi.fn();
    const p = svc.search({ raw: 'x' }, [], {}, onResult);
    svc.cancel();
    d.resolve({ status: 'done', results: [1] });
    const out = await p;
    expect(out.stale).toBe(true);
    expect(out.session).toBeNull();
    expect(onResult.mock.calls.filter((c) => c[1].phase === 'final')).toHaveLength(0);
  });
});
