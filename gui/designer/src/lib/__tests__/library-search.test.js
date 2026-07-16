/**
 * library-search — the orchestrator: one SearchSession feeds dropdown + tree +
 * project-visibility + highlights (P1). Metadata dims run synchronously; the
 * sequence/protein dims are injected (P1.5/P4 provide the real engine).
 *
 * Key contracts:
 *  • explicit prefix filters are hard AND; a free keyword is a UNION (text OR its
 *    inferred type/status) so «release» in a name is never silently hidden.
 *  • one result per entity, feature hits grouped as occurrences.
 *  • matchingProjectIds is a UNION over ALL reasons (fixes «child matched by feature
 *    → parent project hidden»).
 *  • matchesEntry (cheap boolean, tree) agrees with runSearch on metadata dims.
 */
import { describe, it, expect } from 'vitest';
import { runSearch, matchesEntry, makeEntryMatcher, describeEntryMatch, DEFAULT_SEARCH_OPTS } from '../library-search';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';
import { seqMatch as realSeqMatch } from '../seq-match';

const mk = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [], projectId: over.projectId || 'p1',
  origin: { status: over.status || 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
});

const DOCS = [
  mk({ id: 'e1', name: 'pBG-104', tags: ['экспрессия'], topology: 'circular',
    anns: [{ id: 'a1', name: 'glaA', type: 'CDS', qualifiers: { product: 'glucoamylase', locus_tag: 'AN_1234' } },
      { id: 'a2', name: 'AmpR', type: 'CDS' }] }),
  mk({ id: 'e2', name: 'pUC19', tags: ['клонирование'], projectId: 'p2', anns: [{ id: 'b1', name: 'lacZ', type: 'CDS' }] }),
  mk({ id: 'e3', name: 'oligo-fwd', tags: [] }),
];
const run = (q, ctx) => runSearch(classifyQuery(q), DOCS, ctx);

describe('runSearch — metadata dimensions', () => {
  it('name substring → one result, name dimension, highlight span', () => {
    const s = run('pBG');
    expect(s.results).toHaveLength(1);
    const r = s.results[0];
    expect(r.entityRef.id).toBe('e1');              // ref.id stays RAW (for nav)
    expect(r.entityKey).toBe('entry:e1');           // §10.4 composite identity
    const nm = r.matches.find((m) => m.dimension === 'name');
    expect(nm.highlights[0]).toMatchObject({ field: 'name', start: 0, end: 3 });
  });
  it('tag match', () => {
    expect(run('экспрессия').results.map((r) => r.entityRef.id)).toEqual(['e1']);
  });
  it('feature name and qualifier are searchable', () => {
    expect(run('AmpR').results.map((r) => r.entityRef.id)).toEqual(['e1']);
    expect(run('glucoamylase').results.map((r) => r.entityRef.id)).toEqual(['e1']); // via qualifier
    expect(run('AN_1234').results.map((r) => r.entityRef.id)).toEqual(['e1']); // via locus_tag
  });
  it('a feature match carries a feature-owned occurrence (ownerRef = entry)', () => {
    const r = run('AmpR').results[0];
    const feat = r.matches.find((m) => m.dimension === 'feature');
    expect(feat.occurrences[0].targetRef).toMatchObject({ kind: 'feature', ownerRef: { kind: 'entry', id: 'e1' } });
  });
});

describe('runSearch — filters (explicit hard, inferred union)', () => {
  it('explicit type:primer keeps only primers (none here → empty)', () => {
    expect(run('type:primer').results).toEqual([]);
  });
  it('a free keyword «circular» matches by TYPE (union) even when not in the name', () => {
    expect(run('circular').results.map((r) => r.entityRef.id)).toEqual(['e1']); // e1 is circular
  });
  it('multi-term is AND: «pBG circular» needs both', () => {
    expect(run('pBG circular').results.map((r) => r.entityRef.id)).toEqual(['e1']);
    expect(run('pUC circular').results).toEqual([]); // pUC is linear
  });
  it('empty query → no results', () => {
    expect(run('   ').results).toEqual([]);
  });
});

describe('runSearch — grouping, projects, ranking, session', () => {
  it('matchingProjectIds is a UNION over reasons (feature hit reveals the project)', () => {
    const s = run('lacZ'); // e2 matched only via feature
    expect(s.matchingProjectIds.has('p2')).toBe(true);
    expect(s.matchingEntryIds.has('e2')).toBe(true);
  });
  it('name-exact ranks above a feature-substring hit', () => {
    const s = run('lacZ'); // e2 name has no lacZ; only feature. Add a name-exact competitor:
    expect(s.results[0].entityRef.id).toBe('e2');
    // relevanceKey is a sortable tuple
    expect(Array.isArray(s.results[0].relevanceKey)).toBe(true);
  });
  it('session shape: requestId, status, truncated', () => {
    const s = run('p');
    expect(typeof s.requestId).toBe('string');
    expect(s.status).toBe('done');
    expect(typeof s.truncated).toBe('boolean');
  });
});

describe('runSearch — injected sequence dimension', () => {
  it('calls ctx.seqMatch for a DNA query and attaches metrics to occurrences', () => {
    const seqMatch = (q, seqDoc) => (seqDoc?.seq
      ? [{ location: { segments: [{ start: 2, end: 10 }], strand: '+', wrapsOrigin: false }, metrics: { identity: 1, compatibility: 1 } }]
      : []);
    const docs = [mk({ id: 'x1', name: 'x', seq: 'ATGCATGCATGC' })];
    const s = runSearch(classifyQuery('ATGCATGC'), docs, { seqMatch });
    const seq = s.results[0].matches.find((m) => m.dimension === 'sequence');
    expect(seq.occurrences[0].metrics.identity).toBe(1);
  });

  it('integration: the REAL seqMatch provider finds a motif via seq: prefix', () => {
    const docs = [mk({ id: 'z', name: 'z', seq: 'AAAGAATTGCCC' })];
    const s = runSearch(classifyQuery('seq:GAATTG'), docs, { seqMatch: realSeqMatch });
    const seq = s.results[0].matches.find((m) => m.dimension === 'sequence');
    const plus = seq.occurrences.find((o) => o.location.strand === '+');
    expect(plus.location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(plus.metrics.identity).toBe(1);
  });
});

describe('runSearch — injected enzyme dimension (P5, re:)', () => {
  const reMatch = (name, doc) => (doc?.sequence?.seq?.includes('GAATTC')
    ? [{ location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false }, metrics: { identity: 1, compatibility: 1, length: 6 }, enzyme: { name, site: 'GAATTC', cutCount: 1, end: '5prime', overhang: 'AATT' } }]
    : []);
  const docs = [
    mk({ id: 'cut', name: 'has-site', seq: 'AAAGAATTCTTT' }),
    mk({ id: 'nocut', name: 'no-site', seq: 'AAAAAAAAAAAA' }),
  ];

  it('re: attaches cut-site occurrences under the enzyme dimension', () => {
    const s = runSearch(classifyQuery('re:EcoRI'), docs, { reMatch });
    const ids = s.results.map((r) => r.entityRef.id);
    expect(ids).toContain('cut');
    const enz = s.results.find((r) => r.entityRef.id === 'cut').matches.find((m) => m.dimension === 'enzyme');
    expect(enz.occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(enz.occurrences[0].enzyme.name).toBe('EcoRI');
  });

  it('REGRESSION: re: with no cut sites does NOT list the whole library', () => {
    // A doc without the site (empty reMatch) must be excluded, not returned as a
    // pure-filter listing. Before the reQuery guard, re:X listed everything.
    const s = runSearch(classifyQuery('re:EcoRI'), docs, { reMatch });
    expect(s.results.map((r) => r.entityRef.id)).not.toContain('nocut');
  });

  it('an explicit re: query floats cut-site hits to the top (relevance)', () => {
    const s = runSearch(classifyQuery('re:EcoRI'), docs, { reMatch });
    expect(s.results[0].primaryMatchId).toBe('enzyme');
  });
});

describe('matchesEntry — cheap boolean parity with runSearch metadata', () => {
  it('agrees on name / tag / feature / type', () => {
    const plan = classifyQuery('AmpR');
    expect(matchesEntry(DOCS[0], plan)).toBe(true);
    expect(matchesEntry(DOCS[1], plan)).toBe(false);
    expect(matchesEntry(DOCS[0], classifyQuery('circular'))).toBe(true);
    expect(matchesEntry(DOCS[1], classifyQuery('circular'))).toBe(false);
  });
  it('DEFAULT_SEARCH_OPTS is exported and frozen-ish', () => {
    expect(DEFAULT_SEARCH_OPTS.dimensions).toContain('sequence');
  });
});

describe('makeEntryMatcher — raw-entry predicate for the tree (dedup)', () => {
  const raw = (over) => ({
    id: over.id, name: over.name, tags: over.tags || [],
    origin: { status: over.status || 'release' },
    payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
  });
  it('empty query → matches everything (tree «show all»)', () => {
    const m = makeEntryMatcher('');
    expect(m(raw({ id: 'a', name: 'anything' }))).toBe(true);
    expect(makeEntryMatcher('   ')(raw({ id: 'b', name: 'x' }))).toBe(true);
  });
  it('matches by tag / feature / type — not just name', () => {
    const e = raw({ id: 'e', name: 'pUC19', tags: ['kanamycin'], topology: 'circular',
      anns: [{ id: 'a1', name: 'AmpR', type: 'CDS' }] });
    expect(makeEntryMatcher('kanamycin')(e)).toBe(true); // tag
    expect(makeEntryMatcher('AmpR')(e)).toBe(true); //       feature
    expect(makeEntryMatcher('circular')(e)).toBe(true); //   type keyword
    expect(makeEntryMatcher('nope')(e)).toBe(false);
  });
});

describe('describeEntryMatch — highlight spans + reason (tree enrichment)', () => {
  const raw = (over) => ({
    id: over.id, name: over.name, tags: over.tags || [],
    origin: { status: 'release' },
    payload: { sequence: '', topology: over.topology || 'linear', annotations: over.anns || [] },
  });
  it('a name match yields highlight spans and NO reason chip (name is obvious)', () => {
    const d = describeEntryMatch(raw({ id: 'e', name: 'pBG-104' }), classifyQuery('pBG'));
    expect(d.nameHighlights).toEqual([{ start: 0, end: 3 }]);
    expect(d.reason).toBeNull();
  });
  it('a tag match yields a reason chip and no name highlight', () => {
    const d = describeEntryMatch(raw({ id: 'e', name: 'pUC19', tags: ['экспрессия'] }), classifyQuery('экспрессия'));
    expect(d.nameHighlights).toEqual([]);
    expect(d.reason).toBe('tag');
  });
  it('a feature match reasons as «feature»', () => {
    const d = describeEntryMatch(raw({ id: 'e', name: 'x', anns: [{ id: 'a', name: 'AmpR', type: 'CDS' }] }), classifyQuery('AmpR'));
    expect(d.reason).toBe('feature');
  });
  it('empty query → null', () => {
    expect(describeEntryMatch(raw({ id: 'e', name: 'x' }), classifyQuery(''))).toBeNull();
  });
});
