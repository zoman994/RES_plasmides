/**
 * search-facade — REV#2 Stage 2 K7: the error-gate. Any severity:error diagnostic BLOCKS the
 * search BEFORE collectors/providers run (§16). `enz:Bsa seq:GAATTC` (multiple-provider-intents)
 * must not construct the worker, must not run providers, and the UI receives a blocked session
 * — never partial results.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';
import { planIsBlocked, planBlockingErrors } from '../library-search';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';

const mk = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: 'linear', annotations: [] },
});
const DOCS = [mk({ id: 'a', name: 'pBG-104', seq: 'AAAGAATTGCCC' }), mk({ id: 'b', name: 'pUC19', seq: 'TTTTTTTTTTTT' })];

describe('K7.3 — planIsBlocked', () => {
  it('flags ANY severity:error diagnostic; a clean plan is not blocked', () => {
    expect(planIsBlocked(classifyQuery('enz:Bsa seq:GAATTC'))).toBe(true); // multiple-provider-intents
    expect(planIsBlocked(classifyQuery('seq:XYZ'))).toBe(true);           // invalid-dna
    expect(planIsBlocked(classifyQuery('seq:'))).toBe(true);              // empty-provider-value
    expect(planIsBlocked(classifyQuery('pUC'))).toBe(false);
    expect(planIsBlocked(classifyQuery('seq:GAATTC'))).toBe(false);
    expect(planBlockingErrors(classifyQuery('enz:Bsa seq:GAATTC')).length).toBeGreaterThan(0);
  });
});

describe('K7.3 — facade error-gate', () => {
  it('a blocked query returns a blocked session WITHOUT constructing or calling the worker', async () => {
    const postMessage = vi.fn();
    let built = 0;
    const workerFactory = () => {
      built += 1;
      return { postMessage, terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null };
    };
    const facade = createSearchFacade({ workerFactory });
    const seen = [];
    const out = await facade.search('enz:Bsa seq:GAATTC', DOCS, {}, (s) => seen.push(s));
    expect(out.session.status).toBe('blocked');
    expect(out.session.blocked).toBe(true);
    expect(out.session.results).toEqual([]);
    expect(built).toBe(0);                        // worker NEVER constructed (before collectors/providers)
    expect(postMessage).not.toHaveBeenCalled();   // providers never run
    expect(seen.some((s) => s.blocked)).toBe(true); // UI gets the blocked session
  });

  it('does NOT over-block — a valid seq: query still runs the sequence provider', async () => {
    const facade = createSearchFacade(); // inline
    const out = await facade.search('seq:GAATTG', DOCS, { bothStrands: false });
    expect(out.session.status).not.toBe('blocked');
    expect(out.session.results.some((r) => r.entityRef.id === 'a')).toBe(true);
  });

  // P1-4: a blocked query must INVALIDATE a prior in-flight search, or that search's late final
  // overwrites the blocked state (the UI then shows «Ничего не найдено» over B's notice).
  it('a blocked query cancels the service so a prior search is invalidated (latestRequestId null)', async () => {
    const facade = createSearchFacade(); // inline
    await facade.search('pUC', DOCS, {});
    expect(facade.latestRequestId).not.toBeNull();      // a prior search owns the service
    await facade.search('enz:Bsa seq:GAATTC', DOCS, {}); // blocked
    expect(facade.latestRequestId).toBeNull();           // …and the blocked query invalidated it
  });

  it('A(in-flight) → B(blocked): A’s late final is stale-dropped, never delivered over B', async () => {
    // A worker that never replies on its own; A’s final only settles when B aborts its worker.
    const worker = { onmessage: null, onerror: null, onmessageerror: null, terminate: () => {}, postMessage: () => {} };
    const facade = createSearchFacade({ workerFactory: () => worker });
    const seen = [];
    const onResult = (s) => seen.push(s);
    const pA = facade.search('seq:GAATTG', DOCS, {}, onResult); // A: metadata partial + worker-pending final
    const pB = facade.search('enz:Bsa seq:GAATTC', DOCS, {}, onResult); // B: blocked (aborts A’s worker)
    const [aOut] = await Promise.all([pA, pB]);
    expect(aOut.stale).toBe(true);                                 // A’s final is stale
    expect(seen.filter((s) => s.status === 'done').length).toBe(0); // A’s final NEVER delivered
    expect(seen.some((s) => s.blocked)).toBe(true);                 // B’s blocked session stands
  });
});

describe('K7 round-3 — scope+status blocking matrix (before the worker)', () => {
  const spyFacade = () => {
    let built = 0;
    const postMessage = vi.fn();
    const workerFactory = () => { built += 1; return { postMessage, terminate: vi.fn(), onmessage: null, onerror: null, onmessageerror: null }; };
    return { facade: createSearchFacade({ workerFactory }), built: () => built, postMessage };
  };

  // INCOMPATIBLE explicit scope + status → blocked; the worker is never even constructed.
  it.each(['primer:foo status:release', 'status:release primer:foo', 'mol:foo status:archived'])(
    'incompatible %s → blocked, worker never built', async (q) => {
      const { facade, built, postMessage } = spyFacade();
      const out = await facade.search(q, DOCS, {});
      expect(out.session.status).toBe('blocked');
      expect(built()).toBe(0);
      expect(postMessage).not.toHaveBeenCalled();
    },
  );

  // COMPATIBLE scope + status → NOT blocked (a normal metadata search runs).
  it.each(['primer:foo status:archived', 'mol:foo status:deprecated', 'lib:foo status:archived'])(
    'compatible %s → not blocked', async (q) => {
      const { facade } = spyFacade();
      const out = await facade.search(q, DOCS, {});
      expect(out.session.status).not.toBe('blocked');
    },
  );
});
