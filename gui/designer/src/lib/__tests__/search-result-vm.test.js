/**
 * search-result-vm — turn a SearchResult (+ its SearchDocument) into the flat
 * view-model SmartResultRow renders (P2): title + name-highlights, a reason chip
 * for non-name matches, the honest sequence metrics + strength, and a location
 * count. Pure — keeps the row component dumb.
 */
import { afterEach, describe, it, expect } from 'vitest';
import { setLang } from '../../i18n';
import { runSearch } from '../library-search';
import { classifyQuery } from '../query-classify';
import { entryToDocument } from '../search-document-adapters';
import { seqMatch } from '../seq-match';
import { makeProteinMatch } from '../protein-match';
import { makeReMatch } from '../re-match';
import { resultRowViewModel, REASON_LABELS } from '../search-result-vm';

afterEach(() => setLang('ru'));

const doc = (over) => entryToDocument({
  id: over.id, name: over.name, tags: over.tags || [],
  origin: { status: 'release' },
  payload: { sequence: over.seq || '', topology: over.topology || 'linear', annotations: over.anns || [] },
});

const vmFor = (query, over, ctx) => {
  const d = doc(over);
  const s = runSearch(classifyQuery(query), [d], ctx);
  return resultRowViewModel(s.results[0], d);
};

describe('resultRowViewModel', () => {
  it('name match → highlights, no reason chip, no metrics', () => {
    const vm = vmFor('pBG', { id: 'e', name: 'pBG-104' });
    expect(vm.id).toBe('e');
    expect(vm.title).toBe('pBG-104');
    expect(vm.nameHighlights).toEqual([{ start: 0, end: 3 }]);
    expect(vm.reason).toBeNull();
    expect(vm.metricsText).toBe('');
    expect(vm.locationCount).toBe(0);
  });

  it('tag match → reason chip «тег»', () => {
    const vm = vmFor('экспрессия', { id: 'e', name: 'pUC19', tags: ['экспрессия'] });
    expect(vm.reason).toBe('tag');
    expect(REASON_LABELS.tag).toBe('search.reason.tag');
    expect(vm.reasonLabel).toBe('тег');
  });

  it('sequence match → honest metrics + strength + location count', () => {
    const vm = vmFor('seq:GAATTG', { id: 'e', name: 'z', seq: 'AAAGAATTGCCC' }, { seqMatch, bothStrands: false });
    expect(vm.locationCount).toBeGreaterThanOrEqual(1);
    expect(vm.metricsText).toContain('идентичность');
    expect(vm.strengthPct).toBe(1);
  });

  it('IUPAC sequence match → «совместимость», strength = compatibility', () => {
    const vm = vmFor('seq:GN', { id: 'e', name: 'z', seq: 'GAGTGC' }, { seqMatch, bothStrands: false });
    expect(vm.metricsText).toContain('совместимость');
    expect(vm.strengthPct).toBe(1); // compatibility 1
  });

  it('protein (aa:) hit → protein-worded metrics + explanation line, never «нт»', () => {
    const vm = vmFor(
      'aa:HHHHHH',
      { id: 'p', name: 'HisFusion', seq: 'ATGCATCATCATCATCATCATTAA', anns: [{ id: 'c', name: 'gene1', type: 'CDS', start: 0, end: 24, strand: 1 }] },
      { proteinMatch: makeProteinMatch({}) },
    );
    expect(vm.reason).toBe('protein');
    expect(vm.reasonLabel).toBe('белок');
    expect(vm.metricsText).toContain('совпадение белка');
    expect(vm.metricsText).not.toContain('нт');
    expect(vm.proteinExplain).toContain('прямая цепь');
    expect(vm.proteinExplain).toMatch(/2–7 aa/);
  });

  it('enzyme (re:) hit → reason «фермент» + ✂️ explanation line', () => {
    const vm = vmFor('re:EcoRI', { id: 'r', name: 'has-EcoRI', seq: 'AAAGAATTCTTT' }, { reMatch: makeReMatch({}) });
    expect(vm.reason).toBe('enzyme');
    expect(vm.reasonLabel).toBe('фермент');
    expect(vm.enzymeExplain).toContain('EcoRI · GAATTC');
    expect(vm.locationCount).toBe(1);
    expect(vm.refKind).toBe('entry');
  });

  it('localizes the reason chip and metrics through the active locale', () => {
    setLang('en');
    const tag = vmFor('expression', { id: 'e', name: 'pUC19', tags: ['expression'] });
    expect(tag.reasonLabel).toBe('tag');
    const seq = vmFor('seq:GAATTG', { id: 's', name: 'z', seq: 'AAAGAATTGCCC' }, { seqMatch, bothStrands: false });
    expect(seq.metricsText).toContain('identity');
  });
});
