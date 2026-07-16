/**
 * REV #2 — S3-CLOSE / K2.3: the PROTEIN provider (`aa:`) fails like every other provider.
 *
 * Before K2 an exception from the protein engine — thrown while BUILDING the matcher, or while
 * translating one CDS — escaped `resolve()` as a rejected promise. search-service has no
 * `.catch`, so no final callback ever landed: the UI froze in the partial phase with an
 * unhandled rejection. A biologist was left staring at unconfirmed candidates forever.
 *
 * Isolated file: it mocks `protein-match` so hit / miss / throw / garbage are exact. The real
 * translation biology is covered by protein-match's own suite; what is under test HERE is the
 * facade's orchestration around it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';

// vi.hoisted: the mock factory is lifted above the imports, so its closure must read a
// hoisted cell rather than a module-level `let` (which is still in its TDZ at that point).
const stub = vi.hoisted(() => ({ mode: 'hit' }));
vi.mock('../protein-match', () => ({
  makeProteinMatch: () => {
    if (stub.mode === 'factory-throw') throw new Error('cannot build the translator');
    return () => {
      if (stub.mode === 'matcher-throw') throw new Error('protein engine boom');
      if (stub.mode === 'invalid-null') return null;
      if (stub.mode === 'invalid-object') return { 0: 'occurrence' };
      if (stub.mode === 'invalid-promise') return Promise.resolve([]);
      if (stub.mode === 'miss') return [];
      // K3.0 — the two forged claims a structural gate must stop.
      if (stub.mode === 'spoof-ref') {
        return [{
          location: { segments: [{ start: 0, end: 12 }], strand: '+', wrapsOrigin: false },
          targetRef: { kind: 'entry', id: 'some-other-plasmid' },
        }];
      }
      if (stub.mode === 'out-of-bounds') {
        return [{ location: { segments: [{ start: 5_000_000, end: 5_000_012 }], strand: '+', wrapsOrigin: false } }];
      }
      return [{ location: { segments: [{ start: 0, end: 12 }], strand: '+', wrapsOrigin: false } }];
    };
  },
}));

const doc = (id, name) => ({
  ref: { kind: 'entry', id },
  title: name,
  topology: 'circular',
  textFields: { name, tags: [], status: 'release' },
  sequence: { seq: 'ACGTACGTACGT', topology: 'circular' },
  features: [],
});
const PUC = doc('puc', 'pUC19');
const ids = (session) => session.results.map((r) => r.entityRef.id);

const finalOf = async (query, docs = [PUC], ctx = {}) => {
  const facade = createSearchFacade();
  let final = null;
  await facade.search(query, docs, ctx, (session, meta) => { if (meta.phase === 'final') final = session; });
  return final;
};

beforeEach(() => { stub.mode = 'hit'; });

describe('facade — protein provider: the honest outcomes', () => {
  it('HIT → confirmed, selectable, and explicitly complete', async () => {
    const final = await finalOf('aa:HXHH pUC');
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(false);
    expect(final.incomplete).toBe(false);
    expect(final.incompleteDims).toEqual([]);
    expect(final.providerFailures).toEqual([]);
  });

  it('an honest MISS → no rows, and NOT flagged incomplete («the check ran, nothing matched»)', async () => {
    stub.mode = 'miss';
    const final = await finalOf('aa:HXHH pUC');
    expect(ids(final)).toEqual([]);
    expect(final.incomplete).toBe(false);
    expect(final.providerFailures).toEqual([]);
  });
});

describe('facade — protein provider: a failure is never a proven absence', () => {
  it.each([
    ['the factory throws', 'factory-throw'],
    ['the matcher throws mid-scan', 'matcher-throw'],
    ['the matcher returns null', 'invalid-null'],
    ['the matcher returns an object', 'invalid-object'],
    ['the matcher returns a Promise', 'invalid-promise'],
  ])('%s → incomplete + providerFailures[protein], metadata candidate stays PENDING', async (_label, mode) => {
    stub.mode = mode;
    const final = await finalOf('aa:HXHH pUC');
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['protein']);
    expect(final.providerFailures).toEqual([{ dimension: 'protein', reason: 'PROVIDER_ERROR' }]);
    // the metadata candidate survives — but explicitly UNCONFIRMED, so the UI cannot open it
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(true);
  });

  it('a PURE provider query whose engine fails → zero rows, but still incomplete (not «nothing found»)', async () => {
    stub.mode = 'matcher-throw';
    const final = await finalOf('aa:HXHH');
    expect(ids(final)).toEqual([]);
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['protein']);
  });

  it('the facade RESOLVES on a provider failure — it never leaves a rejected promise or a partial UI', async () => {
    stub.mode = 'matcher-throw';
    const facade = createSearchFacade();
    const phases = [];
    const out = await facade.search('aa:HXHH pUC', [PUC], {}, (_s, meta) => phases.push(meta.phase));
    expect(out.stale).toBe(false);
    expect(out.session).toBeTruthy();
    expect(phases).toEqual(['partial', 'final']); // the final ALWAYS lands
  });

  it('a RETRY after a failure yields a clean, complete session (no stale failure fields)', async () => {
    stub.mode = 'matcher-throw';
    const failed = await finalOf('aa:HXHH pUC');
    expect(failed.incomplete).toBe(true);

    stub.mode = 'hit'; // the engine recovers
    const healthy = await finalOf('aa:HXHH pUC');
    expect(healthy.incomplete).toBe(false);
    expect(healthy.incompleteDims).toEqual([]);
    expect(healthy.providerFailures).toEqual([]);
    expect(healthy.results[0].providerPending).toBe(false);
  });

  // K3.0 — the two forged claims, driven through the REAL facade (not the pure validator).
  it('a provider-owned targetRef cannot re-attribute a hit to another molecule', async () => {
    stub.mode = 'spoof-ref';
    const final = await finalOf('aa:HXHH pUC');
    // library-search enriches with `{ targetRef: doc.ref, ...o }` — the spread runs LAST, so an
    // accepted `o.targetRef` would silently rewrite the owner. The gate refuses it instead.
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['protein']);
    expect(final.results[0].providerPending).toBe(true); // never a confirmed hit
    // …and nothing in the session ever points at the molecule the provider tried to name.
    expect(JSON.stringify(final.results)).not.toContain('some-other-plasmid');
  });

  it('coordinates off the end of the molecule are a failure, not a confirmed hit', async () => {
    stub.mode = 'out-of-bounds'; // 5 Mb into a 12 bp document
    const final = await finalOf('aa:HXHH pUC');
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['protein']);
    expect(final.results[0].providerPending).toBe(true);
  });

  it('an external ctx.providerPolicy cannot turn a failed check into a confirmed result', async () => {
    stub.mode = 'matcher-throw';
    const final = await finalOf('aa:HXHH pUC', [PUC], { providerPolicy: 'required' });
    expect(final.results[0].providerPending).toBe(true); // still a candidate, not confirmed
    expect(final.incomplete).toBe(true);
  });
});
