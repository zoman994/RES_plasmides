/**
 * library-search — entity scope (REV #2 §3.3/§4/§10.3) + enz:/cut: route separation (§6).
 * A default query searches ONLY user data (entry+project+primer); enzyme/reSite are
 * excluded and never spend the limit. `enz:` searches the catalog; `cut:`/`re:` scan
 * molecules — the two never cross.
 */
import { describe, it, expect } from 'vitest';
import { runSearch, filterDocumentsByScope, planNeedsEnzymeCatalog } from '../library-search';
import { classifyQuery } from '../query-classify';
import { entryToDocument, primerToDocument } from '../search-document-adapters';

const entryDoc = (id, name, seq = 'ATGCGAATTCATGC') => ({
  ref: { kind: 'entry', id }, title: name, textFields: { name, tags: [], status: null }, sequence: { seq, topology: 'circular' }, features: [],
});
const enzymeDoc = (name, site) => ({
  ref: { kind: 'enzyme', id: name }, title: name, textFields: { name, tags: [site].filter(Boolean), status: null }, kind: 'enzyme',
});
const projectDoc = (id, name) => ({
  ref: { kind: 'project', id }, title: name, textFields: { name, tags: [], status: null }, features: [],
});
const primerDoc = (id, name) => ({
  ref: { kind: 'primer', id }, title: name, textFields: { name, tags: [], status: null }, sequence: { seq: 'ACGTACGT', topology: 'linear' }, features: [],
});

describe('filterDocumentsByScope — kind gate (§10.3)', () => {
  const docs = [entryDoc('e1', 'x'), projectDoc('p1', 'x'), enzymeDoc('EcoRI', 'GAATTC')];
  it('default scope keeps entry+project+primer, drops enzyme/reSite', () => {
    const kept = filterDocumentsByScope(docs, { includeKinds: ['entry', 'project', 'primer'], excludeKinds: ['enzyme', 'reSite'] });
    expect(kept.map((d) => d.ref.kind).sort()).toEqual(['entry', 'project']);
  });
  it('enzyme scope keeps only enzyme docs', () => {
    const kept = filterDocumentsByScope(docs, { includeKinds: ['enzyme'], excludeKinds: [] });
    expect(kept.map((d) => d.ref.kind)).toEqual(['enzyme']);
  });
  it('a missing entityScope passes everything through (back-compat)', () => {
    expect(filterDocumentsByScope(docs, undefined)).toHaveLength(3);
  });
});

describe('runSearch — enzyme cards excluded from the DEFAULT scope (§3.3/§5, inverts Stage 0)', () => {
  const docs = [entryDoc('e1', 'EcoRI-host'), enzymeDoc('EcoRI', 'GAATTC')];
  it('a plain name query surfaces the user molecule but NOT the enzyme card', () => {
    const s = runSearch(classifyQuery('EcoRI'), docs);
    const kinds = s.results.map((r) => r.entityRef.kind);
    expect(kinds).toContain('entry');
    expect(kinds).not.toContain('enzyme'); // enzyme is out of default scope now
  });
  it('a bare recognition-site-looking name still never lists enzyme cards', () => {
    const s = runSearch(classifyQuery('GAATTC'), docs); // 6<minDnaLen8 → text term
    expect(s.results.every((r) => r.entityRef.kind !== 'enzyme')).toBe(true);
  });
});

describe('runSearch — enz: searches the catalog (§6), cut:/re: scan molecules', () => {
  const enzymes = [enzymeDoc('EcoRI', 'GAATTC'), enzymeDoc('EcoRV', 'GATATC'), enzymeDoc('BamHI', 'GGATCC')];
  it('enz:Eco matches enzyme cards by name — and only enzyme docs', () => {
    const s = runSearch(classifyQuery('enz:Eco'), [entryDoc('e1', 'Eco-plasmid'), ...enzymes]);
    const ids = s.results.map((r) => r.entityRef.id);
    expect(ids).toEqual(expect.arrayContaining(['EcoRI', 'EcoRV']));
    expect(ids).not.toContain('BamHI');   // name doesn't contain "Eco"
    expect(ids).not.toContain('e1');      // molecule excluded by enzyme scope
    expect(s.results.every((r) => r.entityRef.kind === 'enzyme')).toBe(true);
  });
  it('enz:GAATTC matches an enzyme by its recognition-site tag', () => {
    const s = runSearch(classifyQuery('enz:GAATTC'), enzymes);
    expect(s.results.map((r) => r.entityRef.id)).toEqual(['EcoRI']);
  });
  it('enz:Zzz (no catalog match) returns nothing — never lists the whole catalog', () => {
    expect(runSearch(classifyQuery('enz:Zzz'), enzymes).results).toHaveLength(0);
  });
  it('cut:/re: scans MOLECULES (via reMatch), never the enzyme catalog', () => {
    const reMatch = (q, doc) => (doc.ref.kind === 'entry' ? [{ location: { segments: [{ start: 4, end: 10 }], strand: '+', wrapsOrigin: false } }] : []);
    const s = runSearch(classifyQuery('re:EcoRI'), [entryDoc('e1', 'host'), ...enzymes], { reMatch });
    const ids = s.results.map((r) => r.entityRef.id);
    expect(ids).toContain('e1');                                     // molecule with the site
    expect(s.results.every((r) => r.entityRef.kind === 'entry')).toBe(true); // no enzyme cards
  });
});

describe('planNeedsEnzymeCatalog — the lazy-collection gate (§8/§10.2)', () => {
  it('is false for a plain / scope / cut query — the catalog is NOT collected', () => {
    for (const q of ['pUC19', 'mol:pUC', 'seq:GAATTC', 'aa:HHHH', 'cut:EcoRI', 're:EcoRI', 'tag:x']) {
      expect(planNeedsEnzymeCatalog(classifyQuery(q))).toBe(false);
    }
  });
  it('is true ONLY for enz: (the enzyme catalog search)', () => {
    expect(planNeedsEnzymeCatalog(classifyQuery('enz:EcoRI'))).toBe(true);
    expect(planNeedsEnzymeCatalog(classifyQuery('фермент:Bsa'))).toBe(true); // RU alias
  });
});

describe('docType — topology is ENTRY-only; project/enzyme have no `type` (P1-C, §4.5)', () => {
  it('type:primer finds a canonical pool primer by ref.kind (not just a name heuristic)', () => {
    const s = runSearch(classifyQuery('type:primer'), [primerDoc('pr1', 'Kan-fwd'), entryDoc('e1', 'plasmid')]);
    expect(s.results.map((r) => r.entityRef.id)).toEqual(['pr1']);
  });
  it('type:linear captures only the linear molecule — never a project', () => {
    const linMol = { ref: { kind: 'entry', id: 'e1' }, title: 'linmol', textFields: { name: 'linmol', tags: [], status: null }, sequence: { seq: 'ATGC', topology: 'linear' }, features: [] };
    const s = runSearch(classifyQuery('type:linear'), [projectDoc('p1', 'Proj'), linMol]);
    const ids = s.results.map((r) => r.entityRef.id);
    expect(ids).not.toContain('p1');   // project has no topology `type`
    expect(ids).toContain('e1');
  });
  it('type:project finds NOTHING — a project has no topology `type` (no false match)', () => {
    const s = runSearch(classifyQuery('type:project'), [projectDoc('p1', 'Proj'), entryDoc('e1', 'mol')]);
    expect(s.results.map((r) => r.entityRef.id)).not.toContain('p1');
  });
  it('enz:EcoRI type:linear does NOT leak an enzyme through the topology fallback', () => {
    const s = runSearch(classifyQuery('enz:EcoRI type:linear'), [enzymeDoc('EcoRI', 'GAATTC')]);
    expect(s.results).toHaveLength(0); // enzyme has no `type` → excluded by type:linear
  });
});

describe('status: is entity-scoped — archived is a PRIMER status, deprecated an ENTRY status (round-3)', () => {
  // REAL adapter chain: raw store objects → entryToDocument / primerToDocument → runSearch, so the
  // status flows through the same path the app uses (entry.origin.status / primer.origin.status),
  // not a hand-patched textFields.status.
  const archivedPrimer = primerToDocument({ id: 'pr1', name: 'old-oligo', sequence: 'ACGTACGT', origin: { status: 'archived' } });
  const deprecatedEntry = entryToDocument({ id: 'e1', name: 'old-plasmid', origin: { status: 'deprecated' }, payload: { sequence: 'ATGCGAATTCATGC', topology: 'circular', annotations: [] } });
  const docs = [archivedPrimer, deprecatedEntry];

  it('the adapters put the status where the engine reads it (sanity)', () => {
    expect(archivedPrimer.textFields.status).toBe('archived');
    expect(deprecatedEntry.textFields.status).toBe('deprecated');
  });
  it('status:archived returns the archived PRIMER, never the deprecated entry', () => {
    const s = runSearch(classifyQuery('status:archived'), docs);
    expect(s.results.map((r) => r.entityRef.id)).toEqual(['pr1']);
  });
  it('status:deprecated returns the ENTRY, never the archived primer', () => {
    const s = runSearch(classifyQuery('status:deprecated'), docs);
    expect(s.results.map((r) => r.entityRef.id)).toEqual(['e1']);
  });
});

describe('runSearch — kind-aware visibility sets (§10.4)', () => {
  it('a project name-match populates matchingProjectIds, NOT matchingEntryIds', () => {
    const s = runSearch(classifyQuery('Gla'), [projectDoc('p1', 'Gla project'), entryDoc('e1', 'unrelated')]);
    expect([...s.matchingProjectIds]).toContain('p1');
    expect([...s.matchingEntryIds]).not.toContain('p1'); // a project id never poses as an entry
  });
});
