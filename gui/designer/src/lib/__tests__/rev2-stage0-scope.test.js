/**
 * REV #2 Stage 0 — fail-closed P1 invariant for the metadata/tree matcher.
 * Doc: docs/SMART_SEARCH_SCOPES_PREFIXES_REV2.md §12 (Этап 0) / §13.1 / §16, task #162.
 *
 * Class B — an unevaluable clause made the metadata/tree matcher match EVERY entry (an
 * ignored clause counted as a match). FIXED in Stage 0: ANY explicit clause the matcher
 * cannot consume fails closed and the surface flags REQUIRES_FULL_SEARCH. This is a
 * GENERAL invariant — not limited to seq/aa/re (see the general-invariant block below).
 *
 * Class A (plain `Bsa`/`EcoRI`/`GAATTC` leaking enzyme cards into the DEFAULT scope) is
 * characterised through the real default document path in
 * components/Library/__tests__/library-topbar-enzyme-scope.test.jsx — an engine test on
 * a hand-assembled document array would not prove the real scope is polluted. Stage 2
 * inverts THOSE assertions.
 */
import { describe, it, expect } from 'vitest';
import {
  matchesEntry, makeEntryMatcher,
  planRequiresFullSearch, treeQueryCapability, REQUIRES_FULL_SEARCH,
} from '../library-search';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';

const doc = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
});
const rawEntry = (over) => ({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
});
// Hand-built QueryPlan so we can test explicit clauses classifyQuery does not emit YET
// (name/feature prefixes land in Stage 1). The engine must already fail closed on them.
const planWith = (explicitFilters) => ({
  raw: '', normalizedText: '', textTerms: [], interpretations: [],
  explicitFilters, inferredFilters: [], seqQuery: null, aaQuery: null, reQuery: null,
});

// ── Class B — un-consumed explicit clause in the metadata/tree matcher (FIXED in Stage 0) ──
describe('REV#2 Stage 0 · class B — fail-closed P1 (seq:/aa:/re: no longer match-all)', () => {
  const nonMatching = doc({ id: 'x', name: 'pUC19', seq: 'AAAAAAAAAAAA' });

  it('matchesEntry no longer treats an unevaluable seq:/aa:/re: clause as a match', () => {
    expect(matchesEntry(nonMatching, classifyQuery('seq:GAATTC'))).toBe(false);
    expect(matchesEntry(nonMatching, classifyQuery('aa:HXHH'))).toBe(false);
    expect(matchesEntry(nonMatching, classifyQuery('re:EcoRI'))).toBe(false);
  });

  it('a supported filter alongside an unevaluable bio clause still fails closed', () => {
    // a release doc, but the seq: clause cannot be evaluated here → NOT a silent
    // «list every release entry»; the whole query escalates to full search.
    const releaseDoc = doc({ id: 'r', name: 'x', seq: 'AAAA' });
    expect(matchesEntry(releaseDoc, classifyQuery('status:release seq:GAATTC'))).toBe(false);
  });

  it('makeEntryMatcher(seq:...) yields a predicate that matches NOTHING (tree/picker)', () => {
    const m = makeEntryMatcher('seq:GAATTC');
    expect(m(rawEntry({ id: 'a', name: 'anything', seq: 'GAATTCGAATTC' }))).toBe(false);
    expect(m(rawEntry({ id: 'b', name: 'other', seq: 'AAAA' }))).toBe(false);
  });

  it('planRequiresFullSearch / treeQueryCapability flag the escalation for seq:/aa:/re:', () => {
    for (const q of ['seq:GAATTC', 'aa:HXHH', 're:EcoRI']) {
      expect(planRequiresFullSearch(classifyQuery(q))).toBe(true);
      expect(treeQueryCapability(q)).toBe(REQUIRES_FULL_SEARCH);
    }
  });

  it('plain metadata, pure filters and AUTO-detected DNA are NOT escalated (stay local)', () => {
    for (const q of ['AmpR', 'type:circular', 'status:release', 'GAATTCGG', '']) {
      expect(treeQueryCapability(q)).toBeNull();
    }
    // auto-DNA (a bare 8-mer, not an explicit seq:) still matches locally by metadata
    expect(makeEntryMatcher('GAATTCGG')(rawEntry({ id: 'n', name: 'GAATTCGG-clone' }))).toBe(true);
  });

  it('non-bio metadata matching is unchanged (regression guard)', () => {
    const e = rawEntry({ id: 'e', name: 'pUC19', tags: ['kanamycin'], topology: 'circular',
      anns: [{ id: 'a1', name: 'AmpR', type: 'CDS' }] });
    expect(makeEntryMatcher('kanamycin')(e)).toBe(true);
    expect(makeEntryMatcher('AmpR')(e)).toBe(true);
    expect(makeEntryMatcher('type:circular')(e)).toBe(true);
    expect(makeEntryMatcher('nope')(e)).toBe(false);
  });
});

// ── GENERAL invariant — the fail-closed rule is not special-cased to seq/aa/re ──
// It applies to ANY explicit clause the metadata matcher does not consume. name:/feature:
// are not emitted by classifyQuery yet (Stage 1), so these use hand-built plans.
describe('REV#2 Stage 0 · general fail-closed invariant (any un-consumed explicit clause)', () => {
  const e = doc({ id: 'x', name: 'pUC19', tags: ['kan'], anns: [{ id: 'a', name: 'AmpR', type: 'CDS' }] });

  it('an un-consumed name: / feature: explicit clause fails closed (not just seq/aa/re)', () => {
    for (const dim of ['name', 'feature', 'someFutureDim']) {
      const plan = planWith([{ dim, value: 'pUC' }]);
      expect(planRequiresFullSearch(plan)).toBe(true);
      // even when the value WOULD match this entry (name «pUC19», feature «AmpR»),
      // the matcher can't consume the clause → it must not silently count it as a match.
      expect(matchesEntry(e, plan)).toBe(false);
    }
  });

  it('a SUPPORTED explicit clause (tag / type / status) is consumed locally, not escalated', () => {
    for (const f of [{ dim: 'tag', value: 'kan' }, { dim: 'status', value: 'release' }]) {
      const plan = planWith([f]);
      expect(planRequiresFullSearch(plan)).toBe(false);
      expect(matchesEntry(e, plan)).toBe(true); // clause is actually evaluated + satisfied
    }
    // and a supported clause the doc FAILS still returns false via passesExplicitFilters,
    // not via the fail-closed guard (proves it was really consumed).
    expect(matchesEntry(e, planWith([{ dim: 'status', value: 'deprecated' }]))).toBe(false);
  });
});
