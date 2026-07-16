/**
 * REV #2 — S3-CLOSE / K1: strict AND-semantics (fixes REV#2-S2-K7-P1-7).
 *
 * A CONFIRMED (final) hit means metadata matched AND every requested biological provider
 * (seq→sequence, aa→protein, cut/re→enzyme) also matched THIS document. A name (or any
 * metadata) hit may no longer mask a missing biological check. A partial (metadata-only)
 * phase may still surface a candidate, flagged `providerPending`, that disappears once the
 * strict final confirms or denies it.
 *
 * The QueryPlan comes from the REAL classifyQuery; the provider engines are injected
 * deterministically (per the spec) so a hit/miss is unambiguous. Engine contract is verified
 * THROUGH runSearch; the facade contract THROUGH the real inline pipeline.
 */
import { describe, it, expect } from 'vitest';
import { runSearch } from '../library-search';
import { createSearchFacade } from '../search-facade';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';
import { resultRowViewModel } from '../search-result-vm';

// A minimal in-scope entry document. The injected provider matchers decide the biological hit
// by id, so the literal `sequence` here is only read by the metadata dims (never scanned).
function doc(id, name, opts = {}) {
  const { tags = [], topology = 'circular', status, kind } = opts;
  return {
    ref: { kind: 'entry', id },
    title: name,
    kind,
    topology,
    textFields: { name, tags, status },
    sequence: { seq: 'ACGTACGT', topology },
    features: [],
  };
}
const OCC = [{ location: { segments: [{ start: 0, end: 6 }], strand: '+' } }];
// Deterministic provider matchers: a REAL (non-empty) hit ONLY for the listed doc ids.
const seqMatchFor = (...hit) => (_q, _seqDoc, _p, _c, d) => (hit.includes(d.ref.id) ? OCC : []);
const proteinMatchFor = (...hit) => (_q, d) => (hit.includes(d.ref.id) ? OCC : []);
const reMatchFor = (...hit) => (_q, d) => (hit.includes(d.ref.id) ? OCC : []);
const ids = (session) => session.results.map((r) => r.entityRef.id);

describe('engine — mol:pUC seq:GAATTC (metadata AND sequence)', () => {
  const plan = classifyQuery('mol:pUC seq:GAATTC');
  const puc = () => doc('puc', 'pUC19');
  const other = () => doc('other', 'gfp-reporter');

  it('name matches but the sequence does NOT → strict final is EMPTY (the core defect)', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor() }))).toEqual([]);
  });
  it('name AND sequence match → the document stays', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor('puc') }))).toEqual(['puc']);
  });
  it("a DIFFERENT document's sequence hit does NOT confirm pUC", () => {
    // 'other' carries the motif but not the name; 'puc' carries the name but not the motif.
    expect(ids(runSearch(plan, [puc(), other()], { seqMatch: seqMatchFor('other') }))).toEqual([]);
  });
});

describe('engine — aa:HXHH pUC (metadata AND protein)', () => {
  const plan = classifyQuery('aa:HXHH pUC');
  const puc = () => doc('puc', 'pUC-fusion');
  it('metadata hit + protein MISS → empty', () => {
    expect(ids(runSearch(plan, [puc()], { proteinMatch: proteinMatchFor() }))).toEqual([]);
  });
  it('metadata hit + protein HIT → result', () => {
    expect(ids(runSearch(plan, [puc()], { proteinMatch: proteinMatchFor('puc') }))).toEqual(['puc']);
  });
});

describe('engine — cut:EcoRI pUC (metadata AND restriction site)', () => {
  const plan = classifyQuery('cut:EcoRI pUC');
  const puc = () => doc('puc', 'pUC-vector');
  it('metadata hit + restriction-site MISS → empty', () => {
    expect(ids(runSearch(plan, [puc()], { reMatch: reMatchFor() }))).toEqual([]);
  });
  it('both conditions met → result', () => {
    expect(ids(runSearch(plan, [puc()], { reMatch: reMatchFor('puc') }))).toEqual(['puc']);
  });
});

describe('engine — bare auto-DNA query (inferred sequence)', () => {
  const motif = 'ATGCATGCATGCATGCATGCATGC';
  const plan = classifyQuery(motif);
  it('the classifier inferred a sequence query', () => {
    expect(plan.seqQuery).toBe(motif);
    expect(plan.providerIntent).toBe('sequence');
  });
  it('the name contains the motif but the SEQUENCE does not → final EMPTY', () => {
    const named = doc('named', motif); // name === motif; injected seqMatch reports a miss
    expect(ids(runSearch(plan, [named], { seqMatch: seqMatchFor() }))).toEqual([]);
  });
});

describe('engine — regressions: plain metadata / type / status / tag / enz are UNCHANGED', () => {
  it('plain pUC still matches', () => {
    expect(ids(runSearch(classifyQuery('pUC'), [doc('puc', 'pUC19')]))).toEqual(['puc']);
  });
  it('type:circular still lists circular docs only', () => {
    const s = runSearch(classifyQuery('type:circular'), [doc('c', 'A', { topology: 'circular' }), doc('l', 'B', { topology: 'linear' })]);
    expect(ids(s)).toEqual(['c']);
  });
  it('status:release and tag:cloning still filter', () => {
    expect(ids(runSearch(classifyQuery('status:release'), [doc('r', 'A', { status: 'release' }), doc('w', 'B', { status: 'wip' })]))).toEqual(['r']);
    expect(ids(runSearch(classifyQuery('tag:cloning'), [doc('a', 'A', { tags: ['cloning'] }), doc('b', 'B', { tags: ['other'] })]))).toEqual(['a']);
  });
  it('enz:EcoRI still finds the enzyme card via its own catalog gate', () => {
    const enzDoc = { ref: { kind: 'enzyme', id: 'EcoRI' }, title: 'EcoRI', textFields: { name: 'EcoRI', tags: [] }, features: [] };
    expect(ids(runSearch(classifyQuery('enz:EcoRI'), [enzDoc]))).toEqual(['EcoRI']);
  });
});

describe('engine — providerPolicy (fail-closed)', () => {
  const plan = classifyQuery('mol:pUC seq:GAATTC');
  const puc = () => doc('puc', 'pUC19');
  it("'deferred' keeps the metadata candidate (flagged providerPending) despite a provider miss", () => {
    const s = runSearch(plan, [puc()], { seqMatch: seqMatchFor(), providerPolicy: 'deferred' });
    expect(ids(s)).toEqual(['puc']);
    expect(s.results[0].providerPending).toBe(true);
  });
  it('an UNKNOWN providerPolicy stays strict (fail-closed) → empty', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor(), providerPolicy: 'whatever' }))).toEqual([]);
  });
  it('absent providerPolicy is strict → empty', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor() }))).toEqual([]);
  });
  it('a confirmed strict result is not providerPending', () => {
    const s = runSearch(plan, [puc()], { seqMatch: seqMatchFor('puc') });
    expect(s.results[0].providerPending).toBe(false);
  });
});

describe('engine — a hand-built contradictory plan requires EVERY provider dimension', () => {
  // The normal UI blocks a two-provider plan earlier; this is the fail-closed defence.
  const plan = { ...classifyQuery('pUC'), seqQuery: 'GAATTC', aaQuery: 'HXHH', providerIntent: 'sequence' };
  const puc = () => doc('puc', 'pUC19');
  it('sequence hit but protein MISS → dropped', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor('puc'), proteinMatch: proteinMatchFor() }))).toEqual([]);
  });
  it('BOTH sequence AND protein hit → kept', () => {
    expect(ids(runSearch(plan, [puc()], { seqMatch: seqMatchFor('puc'), proteinMatch: proteinMatchFor('puc') }))).toEqual(['puc']);
  });
});

// ── facade: partial (deferred) vs final (strict), through the REAL inline pipeline ──────────
const mk = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'circular', annotations: over.anns || [] },
});

describe('facade — the partial shows a candidate; the final confirms or denies it', () => {
  it('mixed query: partial keeps the name candidate, final DROPS it when the motif is absent', async () => {
    const facade = createSearchFacade(); // inline fallback (no worker)
    const puc = mk({ id: 'puc', name: 'pUC19', seq: 'AAAACCCCGGGGTTTT' }); // NO GAATTC
    const phases = [];
    await facade.search('mol:pUC seq:GAATTC', [puc], { bothStrands: false }, (session, meta) => {
      phases.push({ phase: meta.phase, status: session.status, ids: session.results.map((r) => r.entityRef.id) });
    });
    const partial = phases.find((p) => p.phase === 'partial');
    const final = phases.find((p) => p.phase === 'final');
    expect(partial.status).toBe('partial'); // explicitly a partial/loading phase
    expect(partial.ids).toContain('puc'); // metadata candidate visible while loading
    expect(final.ids).not.toContain('puc'); // gone after the negative sequence check
  });

  it('mixed query: the object STAYS in final (with a sequence dimension) when the motif IS present', async () => {
    const facade = createSearchFacade();
    const puc = mk({ id: 'puc', name: 'pUC19', seq: 'AAAAGAATTCCCCC' }); // contains GAATTC
    let final = null;
    await facade.search('mol:pUC seq:GAATTC', [puc], { bothStrands: false }, (session, meta) => { if (meta.phase === 'final') final = session; });
    const r = final.results.find((x) => x.entityRef.id === 'puc');
    expect(r).toBeTruthy();
    expect(r.matches.some((m) => m.dimension === 'sequence')).toBe(true);
  });

  it('plain metadata query is unaffected (pUC stays in the final)', async () => {
    const facade = createSearchFacade();
    const puc = mk({ id: 'puc', name: 'pUC19', seq: 'ACGTACGT' });
    let final = null;
    await facade.search('pUC', [puc], {}, (session, meta) => { if (meta.phase === 'final') final = session; });
    expect(final.results.map((r) => r.entityRef.id)).toContain('puc');
  });

  it('stale/cancel is not regressed: a superseded search resolves stale', async () => {
    const facade = createSearchFacade();
    const docs = [mk({ id: 'puc', name: 'pUC19', seq: 'AAAAGAATTCCCCC' })];
    const first = facade.search('mol:pUC seq:GAATTC', docs, { bothStrands: false });
    facade.cancel();
    const out = await first;
    expect(out.stale).toBe(true);
  });
});

// ══ S3-CLOSE K1 CORRECTIVE (Igor 16.07) — strict AND must be a system invariant ══

describe('engine — P1-1: strict fail-closed does NOT depend on a matcher being injected', () => {
  const plan = classifyQuery('mol:pUC seq:GAATTC');
  const puc = () => doc('puc', 'pUC19');
  it('required policy + NO seqMatch → EMPTY (a missing matcher is not a free pass)', () => {
    expect(ids(runSearch(plan, [puc()], {}))).toEqual([]);
  });
  it('unknown policy + NO seqMatch → EMPTY (fail-closed)', () => {
    expect(ids(runSearch(plan, [puc()], { providerPolicy: 'whatever' }))).toEqual([]);
  });
  it('multi-provider: one matcher absent → EMPTY (both dims required)', () => {
    // seq matcher present + hits; protein matcher ABSENT → protein dim unconfirmed → still dropped.
    const p = { ...classifyQuery('pUC'), seqQuery: 'GAATTC', aaQuery: 'HXHH', providerIntent: 'sequence' };
    expect(ids(runSearch(p, [puc()], { seqMatch: seqMatchFor('puc') }))).toEqual([]);
  });
  it('ONLY explicit deferred + no matcher → pending candidate survives', () => {
    const s = runSearch(plan, [puc()], { providerPolicy: 'deferred' });
    expect(ids(s)).toEqual(['puc']);
    expect(s.results[0].providerPending).toBe(true);
  });
});

describe('engine — P2: a modern cutQuery (reQuery null) is enforced like reQuery', () => {
  const plan = { ...classifyQuery('pUC'), cutQuery: 'EcoRI', reQuery: null, providerIntent: 'restrictionSites' };
  const puc = () => doc('puc', 'pUC-vector');
  it('metadata hit + cut-site HIT (reMatch on cutQuery) → result', () => {
    expect(ids(runSearch(plan, [puc()], { reMatch: reMatchFor('puc') }))).toEqual(['puc']);
  });
  it('metadata hit + cut-site MISS → empty', () => {
    expect(ids(runSearch(plan, [puc()], { reMatch: reMatchFor() }))).toEqual([]);
  });
});

describe('search-result-vm — P1-3: providerPending is carried into the row VM', () => {
  const d = { ref: { kind: 'entry', id: 'x' }, title: 'X', textFields: { name: 'X' } };
  it('a pending result → vm.providerPending true; a confirmed one → false', () => {
    expect(resultRowViewModel({ entityRef: { kind: 'entry', id: 'x' }, matches: [], providerPending: true }, d).providerPending).toBe(true);
    expect(resultRowViewModel({ entityRef: { kind: 'entry', id: 'x' }, matches: [], providerPending: false }, d).providerPending).toBe(false);
  });
});

describe('facade — P1-2: the final phase cannot be weakened by an external providerPolicy', () => {
  it('mixed-negative + {providerPolicy:deferred} → final EMPTY, incomplete=false', async () => {
    const facade = createSearchFacade();
    const puc = mk({ id: 'puc', name: 'pUC19', seq: 'AAAACCCCGGGGTTTT' }); // no GAATTC
    let final = null;
    await facade.search('mol:pUC seq:GAATTC', [puc], { providerPolicy: 'deferred', bothStrands: false }, (s, m) => { if (m.phase === 'final') final = s; });
    expect(final.results.map((r) => r.entityRef.id)).not.toContain('puc');
    expect(!!final.incomplete).toBe(false);
  });
});

describe('facade — P2: the partial phase respects user opts (limit) like the final', () => {
  it('opts.limit clips the partial metadata phase too', async () => {
    const facade = createSearchFacade();
    const docs = [mk({ id: 'a', name: 'plasmid-1' }), mk({ id: 'b', name: 'plasmid-2' }), mk({ id: 'c', name: 'plasmid-3' })];
    const partials = [];
    await facade.search('plasmid', docs, { opts: { limit: 2 } }, (s, m) => { if (m.phase === 'partial') partials.push(s.results.length); });
    expect(partials[0]).toBeLessThanOrEqual(2);
  });
});
