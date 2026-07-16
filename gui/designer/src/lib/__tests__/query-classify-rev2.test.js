/**
 * query-classify — REV #2 Stage 1: the lexer + registry now drive classification and
 * classifyQuery emits the EXTENDED QueryPlan (uiPreset / entityScope / providerIntent /
 * fieldClauses / *Query / diagnostics) while keeping the transitional legacy fields
 * (textTerms / explicitFilters / inferredFilters / interpretations / seqQuery / aaQuery
 * / reQuery) so the un-migrated engine keeps working. Plus the canonical serializer
 * round-trip (§6.3). The original legacy assertions live in query-classify.test.js.
 */
import { describe, it, expect } from 'vitest';
import { classifyQuery, serializeQueryPlan } from '../query-classify';

describe('classifyQuery — extended plan fields (REV #2 §7)', () => {
  it('a plain query is a metadata search over the default user-data scope (no enzyme)', () => {
    const p = classifyQuery('pUC19');
    expect(p.uiPreset).toBe('library');
    expect(p.providerIntent).toBe('metadata');
    expect(p.entityScope.includeKinds).toEqual(['entry', 'project', 'primer']);
    expect(p.entityScope.excludeKinds).toContain('enzyme'); // §7 invariant 1
    expect(p.diagnostics).toEqual([]);
  });

  it('seq: → providerIntent sequence + seqQuery (legacy explicitFilter preserved)', () => {
    const p = classifyQuery('seq:GAATTC');
    expect(p.providerIntent).toBe('sequence');
    expect(p.uiPreset).toBe('sequence');
    expect(p.seqQuery).toBe('GAATTC');
    expect(p.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'sequence', value: 'GAATTC' })); // legacy kept (+ K7 clause id)
  });

  it('aa: → providerIntent protein', () => {
    expect(classifyQuery('aa:HXHH').providerIntent).toBe('protein');
  });

  it('enz: → enzymeCatalogQuery + providerIntent enzymeCatalog (new capability)', () => {
    const p = classifyQuery('enz:Bsa');
    expect(p.enzymeCatalogQuery).toBe('Bsa');
    expect(p.providerIntent).toBe('enzymeCatalog');
    expect(p.uiPreset).toBe('enzymeCatalog');
  });

  it('cut: and legacy re: both set cutQuery (+ transitional reQuery mirror)', () => {
    const cut = classifyQuery('cut:BsaI');
    expect(cut.cutQuery).toBe('BsaI');
    expect(cut.reQuery).toBe('BsaI'); // transitional mirror (§4.4)
    expect(cut.providerIntent).toBe('restrictionSites');
    const re = classifyQuery('re:EcoRI');
    expect(re.cutQuery).toBe('EcoRI');
    expect(re.reQuery).toBe('EcoRI');
    expect(re.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'enzyme', value: 'EcoRI' })); // legacy kept
  });

  it('field prefixes → fieldClauses (name/feature carry NO legacy explicitFilter; tag does)', () => {
    const p = classifyQuery('name:pUC feature:glaA tag:gfp');
    expect(p.fieldClauses).toContainEqual(expect.objectContaining({ field: 'name', value: 'pUC', operator: 'contains' }));
    expect(p.fieldClauses).toContainEqual(expect.objectContaining({ field: 'feature', value: 'glaA', operator: 'contains' }));
    expect(p.fieldClauses).toContainEqual(expect.objectContaining({ field: 'tag', value: 'gfp', operator: 'contains' }));
    expect(p.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'tag', value: 'gfp' })); // tag still legacy-consumable
    expect(p.explicitFilters.some((f) => f.dim === 'name' || f.dim === 'feature')).toBe(false); // no global match-all
    expect(p.textTerms).toEqual([]); // field values are NOT free text
  });

  it('type:/status: → fieldClause (normalized) + legacy explicitFilter; in: → withinProject clause', () => {
    const p = classifyQuery('type:кольцевая status:release in:"Gla project"');
    expect(p.fieldClauses).toContainEqual(expect.objectContaining({ field: 'type', value: 'circular', operator: 'equals' }));
    expect(p.explicitFilters).toContainEqual(expect.objectContaining({ dim: 'type', value: 'circular' }));
    expect(p.fieldClauses).toContainEqual(expect.objectContaining({ field: 'withinProject', value: 'Gla project', operator: 'equals' }));
  });

  it('a RU alias produces the same plan as its canonical', () => {
    const ru = classifyQuery('белок:HXHH');
    expect(ru.aaQuery).toBe('HXHH');
    expect(ru.providerIntent).toBe('protein');
  });

  it('an unknown prefix stays literal text (§6.1)', () => {
    const p = classifyQuery('http://x');
    expect(p.textTerms).toContain('http://x');
    expect(p.fieldClauses).toEqual([]);
  });

  it('seq: with non-DNA chars → an ERROR diagnostic (§6.1), not a silent text search', () => {
    const p = classifyQuery('seq:amp');
    expect(p.diagnostics.some((d) => d.code === 'invalid-dna' && d.severity === 'error')).toBe(true);
  });

  it('an unclosed quote surfaces as a diagnostic', () => {
    const p = classifyQuery('feature:"signal peptide');
    expect(p.diagnostics.some((d) => d.code === 'unclosed-quote')).toBe(true);
  });
});

describe('classifyQuery — conflict diagnostics (§6.2), both orders', () => {
  const has = (q, code) => classifyQuery(q).diagnostics.some((d) => d.code === code && d.severity === 'error');

  it('two different providers → multiple-provider-intents (both orders)', () => {
    expect(has('enz:EcoRI seq:GAATTC', 'multiple-provider-intents')).toBe(true);
    expect(has('seq:GAATTC enz:EcoRI', 'multiple-provider-intents')).toBe(true);
    expect(has('seq:GAATTC aa:HXHH', 'multiple-provider-intents')).toBe(true);
    expect(has('aa:HXHH seq:GAATTC', 'multiple-provider-intents')).toBe(true);
  });
  it('the same provider twice → duplicate-provider', () => {
    expect(has('seq:GAATTC seq:CCCC', 'duplicate-provider')).toBe(true);
    expect(has('aa:AAA aa:BBB', 'duplicate-provider')).toBe(true);
  });
  it('two scope presets → multiple-scope-presets', () => {
    expect(has('mol:pUC project:Alpha', 'multiple-scope-presets')).toBe(true);
  });
  it('an incompatible scope+provider → incompatible-scope-provider (both orders, §4.5)', () => {
    expect(has('primer:T7 aa:HHHH', 'incompatible-scope-provider')).toBe(true);
    expect(has('aa:HHHH primer:T7', 'incompatible-scope-provider')).toBe(true);
    expect(has('project:Alpha cut:BsaI', 'incompatible-scope-provider')).toBe(true);
    expect(has('cut:BsaI project:Alpha', 'incompatible-scope-provider')).toBe(true);
  });
  it('compatible combinations have NO conflict diagnostic (§6.2)', () => {
    for (const q of ['cut:BsaI type:circular', 'seq:GAATTC status:release', 'feature:glaA in:"Gla project"', 'mol:pUC seq:GAATTC']) {
      const codes = classifyQuery(q).diagnostics.map((d) => d.code);
      expect(codes).not.toContain('multiple-provider-intents');
      expect(codes).not.toContain('duplicate-provider');
      expect(codes).not.toContain('multiple-scope-presets');
      expect(codes).not.toContain('incompatible-scope-provider');
    }
  });
});

describe('classifyQuery — inferred vs explicit intent + repeated fields', () => {
  it('bare DNA → providerIntent sequence with intentSource inferred (text kept)', () => {
    const p = classifyQuery('GAATTCGG');
    expect(p.providerIntent).toBe('sequence');
    expect(p.intentSource).toBe('inferred');
    expect(p.textTerms).toContain('GAATTCGG');
  });
  it('explicit seq: is intentSource explicit', () => {
    expect(classifyQuery('seq:GAATTCGG').intentSource).toBe('explicit');
  });
  it('an empty explicit bio prefix is an ERROR keeping the explicit intent', () => {
    const p = classifyQuery('seq:');
    expect(p.diagnostics.some((d) => d.code === 'empty-provider-value' && d.severity === 'error')).toBe(true);
    expect(p.providerIntent).toBe('sequence');
    expect(p.intentSource).toBe('explicit');
  });
  it('repeated tag: are kept with AND semantics (both clauses + both legacy filters)', () => {
    const p = classifyQuery('tag:a tag:b');
    expect(p.fieldClauses.filter((c) => c.field === 'tag').map((c) => c.value)).toEqual(['a', 'b']);
    expect(p.explicitFilters.filter((f) => f.dim === 'tag').map((f) => f.value)).toEqual(['a', 'b']);
  });
  it('prefixUsages records each explicit prefix used', () => {
    expect(classifyQuery('name:pUC tag:gfp').prefixUsages.map((u) => u.canonical)).toEqual(['name', 'tag']);
  });
});

describe('classifyQuery — auto-DNA never overwrites an explicit provider (§6.2)', () => {
  it('aa:/enz:/cut: + a bare DNA token keeps the EXPLICIT intent (both orders, no overwrite)', () => {
    for (const q of ['aa:HXHH GAATTCGG', 'GAATTCGG aa:HXHH']) {
      const p = classifyQuery(q);
      expect(p.providerIntent).toBe('protein');
      expect(p.intentSource).toBe('explicit');
      expect(p.aaQuery).toBe('HXHH');
      expect(p.seqQuery).toBeNull();         // the bare DNA is NOT auto-detected
      expect(p.textTerms).toContain('GAATTCGG');
    }
    expect(classifyQuery('enz:Bsa GAATTCGG').providerIntent).toBe('enzymeCatalog');
    expect(classifyQuery('cut:BsaI GAATTCGG').providerIntent).toBe('restrictionSites');
  });
  it('an EMPTY explicit provider + a bare DNA token stays explicit (error), not inferred', () => {
    const p = classifyQuery('aa: GAATTCGG');
    expect(p.providerIntent).toBe('protein');
    expect(p.intentSource).toBe('explicit');
    expect(p.seqQuery).toBeNull();
    expect(p.diagnostics.some((d) => d.code === 'empty-provider-value')).toBe(true);
  });
  it('project:DNA gets the inferred DNA intent BUT is flagged incompatible (§4.5)', () => {
    const p = classifyQuery('project:GAATTCGG');
    expect(p.providerIntent).toBe('sequence');
    expect(p.intentSource).toBe('inferred');
    expect(p.diagnostics.some((d) => d.code === 'incompatible-scope-provider' && d.severity === 'error')).toBe(true);
  });
});

describe('classifyQuery — lib counts in scope conflicts (both orders)', () => {
  const dup = (q) => classifyQuery(q).diagnostics.some((d) => d.code === 'multiple-scope-presets');
  it('every scope pair including lib and repeated lib is a multiple-scope-presets error', () => {
    for (const q of [
      'lib:a project:b', 'project:b lib:a', 'lib:a mol:b', 'mol:b lib:a',
      'lib:a lib:b', 'mol:a project:b', 'primer:a project:b',
    ]) expect(dup(q)).toBe(true);
  });
  it('a single scope prefix (incl. lib) is NOT a conflict', () => {
    for (const q of ['lib:a', 'mol:a', 'primer:a', 'project:a']) expect(dup(q)).toBe(false);
  });
});

describe('classifyQuery — lib is the EXPLICIT user-library scope (enzymes excluded)', () => {
  const hasIncompat = (q) => classifyQuery(q).diagnostics.some(
    (d) => d.code === 'incompatible-scope-provider' && d.severity === 'error');
  it('lib + enz → incompatible-scope-provider (both orders, canonical + RU alias)', () => {
    for (const q of [
      'lib:pUC enz:Bsa', 'enz:Bsa lib:pUC',
      'библиотека:pUC рестриктаза:Bsa', 'рестриктаза:Bsa библиотека:pUC',
    ]) expect(hasIncompat(q)).toBe(true);
  });
  it('lib + seq/aa/cut stay VALID (the library holds molecules/primers carrying these)', () => {
    for (const q of ['lib:pUC seq:GAATTC', 'seq:GAATTC lib:pUC', 'lib:pUC aa:HHHH', 'cut:BsaI lib:pUC']) {
      expect(hasIncompat(q)).toBe(false);
    }
  });
  it('explicit lib is PRESERVED through serialization + a semantically-equivalent round-trip', () => {
    expect(serializeQueryPlan(classifyQuery('lib:gla'))).toBe('lib:gla'); // no longer dropped
    expect(classifyQuery('lib:gla').scopePreset).toBe('lib');
    for (const q of ['lib:pUC seq:GAATTC', 'seq:GAATTC lib:pUC']) {
      const before = classifyQuery(q);
      const after = classifyQuery(serializeQueryPlan(before));
      expect(after.scopePreset).toBe('lib');
      expect(after.providerIntent).toBe(before.providerIntent);
      expect(after.entityScope).toEqual(before.entityScope);
    }
  });
  it('a REJECTED provider does not hijack entityScope: lib+enz keeps lib DEFAULT scope', () => {
    // The provider is incompatible → its scope (['enzyme']) must NOT override the user's
    // explicit lib scope. lib:X enz:Y stays the library, enzymes excluded (both orders + alias).
    for (const q of ['lib:pUC enz:Bsa', 'enz:Bsa lib:pUC', 'библиотека:pUC рестриктаза:Bsa']) {
      const p = classifyQuery(q);
      expect(p.entityScope.includeKinds).toEqual(['entry', 'project', 'primer']); // NOT ['enzyme']
      expect(p.entityScope.excludeKinds).toContain('enzyme');                      // enzyme stays out
    }
    // A narrowing scope keeps ITS own scope, not the rejected provider's (symmetry).
    expect(classifyQuery('mol:pUC enz:Bsa').entityScope.includeKinds).toEqual(['entry']);
    // A COMPATIBLE provider still narrows within lib (entry+primer carry sequences).
    expect(classifyQuery('lib:pUC seq:GAATTC').entityScope.includeKinds).toEqual(['entry', 'primer']);
  });
});

describe('serializeQueryPlan — canonical, LOSSLESS round-trip (§6.3 / §13.7)', () => {
  const cmp = (p) => ({
    uiPreset: p.uiPreset, scopePreset: p.scopePreset,
    providerIntent: p.providerIntent, intentSource: p.intentSource,
    seqQuery: p.seqQuery, aaQuery: p.aaQuery, enzymeCatalogQuery: p.enzymeCatalogQuery,
    cutQuery: p.cutQuery, reQuery: p.reQuery, fieldClauses: p.fieldClauses,
    textTerms: p.textTerms, entityScope: p.entityScope,
  });
  const roundtrips = (q) => expect(cmp(classifyQuery(serializeQueryPlan(classifyQuery(q))))).toEqual(cmp(classifyQuery(q)));

  it('serializes to the documented canonical form', () => {
    expect(serializeQueryPlan(classifyQuery('aa:HXHH status:release'))).toBe('aa:HXHH status:release');
    expect(serializeQueryPlan(classifyQuery('белок:HXHH'))).toBe('aa:HXHH'); // alias → canonical
    expect(serializeQueryPlan(classifyQuery('re:EcoRI'))).toBe('cut:EcoRI'); // legacy → canonical
  });

  it('round-trips canonical / EN / RU forms, incl. bare DNA, scope presets AND scope+provider', () => {
    for (const q of [
      'pUC19 glaA', 'seq:GAATTC', 'aa:HXHH status:release', 'cut:BsaI', 're:EcoRI',
      'feature:glaA in:"Gla project"', 'tag:gfp pUC19', 'enz:Bsa', 'днк:GAATTC',
      'GAATTCGG', 'lib:gla', 'mol:pUC', 'primer:T7', 'project:Alpha',
      // scope + provider — the independent scope must survive (both orders)
      'mol:pUC seq:GAATTC', 'seq:GAATTC mol:pUC', 'primer:T7 seq:GAATTC',
    ]) roundtrips(q);
  });

  it('a compatible scope keeps its narrowed entityScope through the round-trip', () => {
    const before = classifyQuery('mol:pUC seq:GAATTC');
    expect(before.entityScope.includeKinds).toEqual(['entry']); // mol narrows to entry, not entry+primer
    const after = classifyQuery(serializeQueryPlan(before));
    expect(after.entityScope.includeKinds).toEqual(['entry']);
    expect(after.scopePreset).toBe('mol');
  });

  it('quotes provider values with spaces (enz:/cut:)', () => {
    roundtrips('enz:"Bsa I"');
    roundtrips('cut:"enzyme alias"');
    expect(serializeQueryPlan(classifyQuery('enz:"Bsa I"'))).toBe('enz:"Bsa I"');
  });

  it('literal `"seq:foo"` / `"name:value"` stay text, do not become prefixes', () => {
    roundtrips('"seq:foo"');
    roundtrips('"name:value"');
    expect(classifyQuery('"seq:foo"').seqQuery).toBeNull();
    expect(serializeQueryPlan(classifyQuery('"seq:foo"'))).toBe('"seq:foo"');
  });

  it('explicit `lib:` shares the default entityScope but is PRESERVED (not normalized away)', () => {
    const lib = classifyQuery('lib:gla');
    const plain = classifyQuery('gla');
    expect(lib.entityScope).toEqual(plain.entityScope); // same scope (enzyme/reSite excluded)
    expect(lib.scopePreset).toBe('lib');                // …but its provenance is kept
    expect(serializeQueryPlan(lib)).toBe('lib:gla');    // …so `lib:` survives the round-trip
  });
});
