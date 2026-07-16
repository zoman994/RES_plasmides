/**
 * REV #2 — S3-CLOSE / K2.3: the ENZYME provider (`cut:` / legacy `re:`) fails like every other.
 *
 * `cut:EcoRI` scans a molecule for real cut sites. If that scan throws (or hands back garbage
 * instead of an occurrence array), the old facade either rejected out of `resolve()` — freezing
 * the UI in the partial phase — or let `|| []` in library-search silently turn the garbage into
 * «no sites in this plasmid». Both hand a biologist a fabricated negative about a restriction
 * site they are about to design a digest around.
 *
 * Isolated file (mocks `re-match`): the real cut-site biology lives in re-match's own suite.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSearchFacade } from '../search-facade';

const stub = vi.hoisted(() => ({ mode: 'hit' }));
vi.mock('../re-match', () => ({
  makeReMatch: () => {
    if (stub.mode === 'factory-throw') throw new Error('cannot build the enzyme registry');
    return () => {
      if (stub.mode === 'matcher-throw') throw new Error('cut-site scan boom');
      if (stub.mode === 'invalid-null') return null;
      if (stub.mode === 'invalid-object') return { site: 'GAATTC' };
      if (stub.mode === 'miss') return [];
      return [{ location: { segments: [{ start: 0, end: 6 }], strand: '+', wrapsOrigin: false } }];
    };
  },
}));

const doc = (id, name) => ({
  ref: { kind: 'entry', id },
  title: name,
  topology: 'circular',
  textFields: { name, tags: [], status: 'release' },
  sequence: { seq: 'GAATTCACGT', topology: 'circular' },
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

describe('facade — enzyme provider: the honest outcomes', () => {
  it('HIT → confirmed and explicitly complete', async () => {
    const final = await finalOf('cut:EcoRI pUC');
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(false);
    expect(final.incomplete).toBe(false);
    expect(final.providerFailures).toEqual([]);
  });

  it('an honest MISS → no rows, NOT incomplete («this plasmid truly has no EcoRI site»)', async () => {
    stub.mode = 'miss';
    const final = await finalOf('cut:EcoRI pUC');
    expect(ids(final)).toEqual([]);
    expect(final.incomplete).toBe(false);
    expect(final.incompleteDims).toEqual([]);
  });
});

describe('facade — enzyme provider: a failed scan is never «no sites»', () => {
  it.each([
    ['the factory throws', 'factory-throw'],
    ['the matcher throws mid-scan', 'matcher-throw'],
    ['the matcher returns null', 'invalid-null'],
    ['the matcher returns an object', 'invalid-object'],
  ])('%s → incomplete + providerFailures[enzyme], candidate stays PENDING', async (_label, mode) => {
    stub.mode = mode;
    const final = await finalOf('cut:EcoRI pUC');
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['enzyme']);
    expect(final.providerFailures).toEqual([{ dimension: 'enzyme', reason: 'PROVIDER_ERROR' }]);
    expect(ids(final)).toEqual(['puc']);
    expect(final.results[0].providerPending).toBe(true);
  });

  it('the legacy `re:` alias routes through the SAME guarded enzyme dimension', async () => {
    stub.mode = 'matcher-throw';
    const final = await finalOf('re:EcoRI pUC');
    expect(final.incompleteDims).toEqual(['enzyme']);
  });

  it('a PURE cut: query whose scan fails → zero rows, but incomplete (absence NOT proven)', async () => {
    stub.mode = 'matcher-throw';
    const final = await finalOf('cut:EcoRI');
    expect(ids(final)).toEqual([]);
    expect(final.incomplete).toBe(true);
    expect(final.incompleteDims).toEqual(['enzyme']);
  });

  it('the facade RESOLVES and always delivers a final (no unhandled rejection, no frozen partial)', async () => {
    stub.mode = 'factory-throw';
    const facade = createSearchFacade();
    const phases = [];
    const out = await facade.search('cut:EcoRI pUC', [PUC], {}, (_s, meta) => phases.push(meta.phase));
    expect(out.stale).toBe(false);
    expect(phases).toEqual(['partial', 'final']);
  });

  it('a RETRY after a failure yields a clean session', async () => {
    stub.mode = 'matcher-throw';
    expect((await finalOf('cut:EcoRI pUC')).incomplete).toBe(true);
    stub.mode = 'hit';
    const healthy = await finalOf('cut:EcoRI pUC');
    expect(healthy.incomplete).toBe(false);
    expect(healthy.incompleteDims).toEqual([]);
    expect(healthy.providerFailures).toEqual([]);
  });
});
