/**
 * library-search — REV#2 Stage 2 K7: the consumed-clause ledger. The metadata matcher records
 * `consumedClauseIds`; a match is valid ONLY if every mandatory clause is consumed. No prefix /
 * filter / provider intent may be silently ignored AND counted as a match (§1A.6). Repeated
 * tag: clauses stay distinct via their parser-owned ids.
 */
import { describe, it, expect } from 'vitest';
import { classifyQuery } from '../query-classify';
import { matchesEntry, evaluateEntryClauses, planRequiresFullSearch } from '../library-search';

const doc = (over = {}) => ({
  ref: { kind: 'entry', id: 'e1' }, title: 'pUC19',
  textFields: { name: 'pUC19', tags: ['gfp', 'colony'], status: 'release' },
  features: [], ...over,
});

describe('K7.2 — consumed-clause ledger', () => {
  it('consumes each satisfied filter by its parser-owned id; all consumed → matched', () => {
    const plan = classifyQuery('tag:gfp');
    const tagClause = plan.explicitFilters.find((f) => f.dim === 'tag');
    const v = evaluateEntryClauses(doc(), plan);
    expect(v.matched).toBe(true);
    expect(v.consumedClauseIds.has(tagClause.id)).toBe(true);
  });

  it('two DISTINCT tag clauses both present → BOTH ids consumed (repeated tag: do not collapse)', () => {
    const plan = classifyQuery('tag:gfp tag:colony');
    const ids = plan.explicitFilters.filter((f) => f.dim === 'tag').map((f) => f.id);
    expect(new Set(ids).size).toBe(2);
    const v = evaluateEntryClauses(doc(), plan);
    expect(v.matched).toBe(true);
    expect(ids.every((id) => v.consumedClauseIds.has(id))).toBe(true);
  });

  it('a mandatory clause left UNsatisfied → NOT matched (tag:gfp tag:missing on a gfp-only doc)', () => {
    const v = evaluateEntryClauses(doc(), classifyQuery('tag:gfp tag:missing'));
    expect(v.matched).toBe(false);
  });

  it('a clause the metadata matcher CANNOT consume (seq:) → unconsumable, never a match', () => {
    const v = evaluateEntryClauses(doc(), classifyQuery('seq:GAATTC'));
    expect(v.matched).toBe(false);
    expect(v.unconsumable).toBe(true);
  });

  it('every free text term is a mandatory clause — an unmatched term → not matched', () => {
    expect(evaluateEntryClauses(doc(), classifyQuery('pUC nonexistentxyz')).matched).toBe(false);
    expect(evaluateEntryClauses(doc(), classifyQuery('pUC')).matched).toBe(true);
  });

  it('matchesEntry delegates to the ledger — behavior preserved', () => {
    expect(matchesEntry(doc(), classifyQuery('tag:gfp'))).toBe(true);
    expect(matchesEntry(doc(), classifyQuery('tag:missing'))).toBe(false);
    expect(matchesEntry(doc(), classifyQuery('seq:GAATTC'))).toBe(false); // unconsumable, not match-all
    expect(matchesEntry(doc(), classifyQuery(''))).toBe(false); // empty plan → no mandatory clause
  });

  // P1-3: the ledger must cover the WHOLE plan — every structured clause / provider the metadata
  // matcher cannot execute is unconsumable (never silently ignored, never match-all).
  it('the ledger covers the WHOLE plan — enz: / name: / feature: / in: are all unconsumable', () => {
    for (const q of ['enz:Bsa', 'name:pUC', 'feature:glaA', 'in:proj']) {
      const v = evaluateEntryClauses(doc(), classifyQuery(q));
      expect(v.matched, `${q} must not match`).toBe(false);
      expect(v.unconsumable, `${q} must be unconsumable`).toBe(true);
    }
  });

  it('planRequiresFullSearch escalates enz: / name: / feature: / in: (not only legacy explicitFilters)', () => {
    for (const q of ['enz:Bsa', 'name:pUC', 'feature:glaA', 'in:proj', 'seq:GAATTC', 'aa:HHHHHH', 'cut:EcoRI']) {
      expect(planRequiresFullSearch(classifyQuery(q)), `${q} escalates`).toBe(true);
    }
    // plain metadata does NOT escalate
    expect(planRequiresFullSearch(classifyQuery('tag:gfp'))).toBe(false);
    expect(planRequiresFullSearch(classifyQuery('pUC'))).toBe(false);
  });
});
