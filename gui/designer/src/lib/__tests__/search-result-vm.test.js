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
import { locusSummary } from '../search-locus-summary';
import { searchAllSequences } from '../search-worker-core';

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

// ── U5-A · the ONE locus summary ──────────────────────────────────────────────────────────────
describe('locusSummary — what the biologist reads about a hit', () => {
  /** A canonical occurrence, exactly as the finalizer emits it. */
  const occ = (over = {}) => ({
    location: { segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false, ...(over.location || {}) },
    metrics: {
      length: 6, queryLength: 6, alignmentLength: 6, targetSpan: 6, identity: 1, coverage: 1,
      exactMatches: 6, substitutions: 0, insertions: 0, deletions: 0,
      indelBases: 0, indelEvents: 0, editDistance: 0, mismatches: 0, indels: 0, identityBps: 10000,
      ...(over.metrics || {}),
    },
  });

  it('identity comes from identityBps, NOT a re-rounded float', () => {
    // 9999/10000 is 99.99 %. `Math.round(identity * 100)` — what the dropdown did — prints «100 %»,
    // telling a biologist a construct is perfect while one base is wrong. Two decimals, from the
    // engine's own integer, make that impossible.
    const s = locusSummary(occ({ metrics: { identityBps: 9999, identity: 0.9999 } }));
    expect(s.identityPct).toBe('99.99');
    expect(s.identityBps).toBe(9999);
  });

  it('M/L is matched over ALIGNMENT length, and X/I/D stay three separate LABELLED numbers', () => {
    // The legacy `indels` alias is I+D, which cannot tell an insertion from a deletion — opposite
    // events for a reading frame. And `indelEvents` is not `indelBases`: one 3-nt gap is one event.
    const s = locusSummary(occ({
      metrics: {
        alignmentLength: 8, exactMatches: 5, substitutions: 1, insertions: 1, deletions: 1,
        indelBases: 2, indelEvents: 1, editDistance: 3, identityBps: 6250,
      },
    }));
    expect(s.ntText).toBe('5/8 нт');
    expect(s.indelEvents).toBe(1);
    // The numbers stay separate AND carry their words. A bare «1·1·1» put the meaning in a `title`
    // on a non-focusable span, so a keyboard user and a screen reader got three anonymous digits.
    expect(s.substitutions).toBe(1);
    expect(s.insertions).toBe(1);
    expect(s.deletions).toBe(1);
    expect(s.xidText).toBe('замен: 1 · вставок: 1 · делеций: 1');
  });

  it('the physical locus COUNT travels in the same summary — 501 found, 500 listed', () => {
    // The count is measured before the caps, so it legitimately exceeds the retained window. It
    // belongs to this object because the surface that formats it separately is the surface that
    // eventually prints the window size instead (`occurrences.length`) and calls it «found».
    const s = locusSummary(occ(), { locationCount: 501 });
    expect(s.locationCount).toBe(501);
    expect(s.locationsText).toBe('501 лок.');
    // …and no count at all when the caller has none to state — not a zero, which would be a claim.
    const bare = locusSummary(occ());
    expect(bare.locationCount).toBeNull();
    expect(bare.locationsText).toBe('');
  });

  it('strand renders as + / − / ±', () => {
    expect(locusSummary(occ({ location: { strand: '+' } })).strand).toBe('+');
    expect(locusSummary(occ({ location: { strand: '-' } })).strand).toBe('−'); // U+2212, not a hyphen
    expect(locusSummary(occ({ location: { strand: 'both' } })).strand).toBe('±');
  });

  it('coordinates are explicitly half-open', () => {
    expect(locusSummary(occ()).coords).toBe('[3, 9)');
  });

  it('a WRAP keeps BOTH segments — collapsing them would name a span that does not exist', () => {
    // An origin-crossing hit occupies the tail AND the head. One merged range `[4980, 30)` is not a
    // place on the molecule, and `[0, 5000)` would claim the whole plasmid.
    const s = locusSummary(occ({
      location: { segments: [{ start: 4980, end: 5000 }, { start: 0, end: 30 }], strand: '-', wrapsOrigin: true },
    }));
    expect(s.coords).toBe('[4980, 5000) + [0, 30)');
    expect(s.segments).toHaveLength(2);
    expect(s.wrapsOrigin).toBe(true);
  });

  it('an occurrence with no alignment numbers summarises to NOTHING, not to zeros', () => {
    // A protein / enzyme / metadata hit has no M/L. Rendering «0/0 · 0·0·0» would be a claim about
    // the alignment rather than an absence of one.
    expect(locusSummary({ location: { segments: [{ start: 0, end: 6 }], strand: '+' }, metrics: { identity: 1 } })).toBeNull();
    expect(locusSummary({ metrics: { identityBps: 10000, alignmentLength: 6 } })).toBeNull();
    expect(locusSummary(null)).toBeNull();
  });

  it('the summary carries NO alignment internals — no script, editRuns, mismatchPositions or sequence', () => {
    // Those are stripped at the worker boundary and must not reappear on the way to a row.
    const s = locusSummary(occ());
    const keys = Object.keys(s);
    for (const forbidden of ['script', 'editRuns', 'mismatchPositions', 'seq', 'sequence', 'cigar']) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
    expect(JSON.stringify(s)).not.toMatch(/ACGT/);
  });

  it('the VM carries the summary, so the row never computes one of its own', () => {
    // Fed the way the FACADE feeds it: occurrences that crossed the boundary finalizer, which is
    // what stamps `identityBps`. The raw engine emits the float only — so a summary built from a
    // pre-boundary occurrence is correctly absent rather than silently re-rounded (see below).
    const SEQ = 'AAAGAATTGCCC';
    const env = searchAllSequences('GAATTG', [{ id: 'entry:z', seq: SEQ, topology: 'linear' }], { bothStrands: false });
    const vm = vmFor('seq:GAATTG', { id: 'z', name: 'z', seq: SEQ }, {
      seqMatch: () => env['entry:z'],
    });
    expect(vm.locus).toBeTruthy();
    expect(vm.locus.strand).toBe('+');
    expect(vm.locus.coords).toBe('[3, 9)');
    expect(vm.locus.identityPct).toBe('100.00');
  });

  it('a PRE-boundary occurrence yields no summary — absence, not a re-rounded guess', () => {
    // `identityBps` is stamped by the boundary finalizer; the raw engine carries the float only.
    // The tree/picker path injects `seqMatch` directly and therefore has no basis points, so the
    // honest answer is «no summary here», not a percentage recomputed from the float.
    const vm = vmFor('seq:GAATTG', { id: 'z', name: 'z', seq: 'AAAGAATTGCCC' }, { seqMatch, bothStrands: false });
    expect(vm.locationCount).toBeGreaterThanOrEqual(1); // the hit is real…
    expect(vm.locus).toBeNull(); //                        …but it cannot be summarised yet
  });
});

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

  it('a degenerate DNA query never reaches the view-model at all (K3.0 §2.5)', () => {
    // Was: «IUPAC sequence match → совместимость». DNA search is ACGT-only now, so there is no
    // такой row to render — the query is blocked in the plan, before any provider runs. The
    // «совместимость» wording survives only where identity genuinely is undefined: a degenerate
    // ENZYME recognition site (see the enz:/cut: rows), not a DNA motif.
    const plan = classifyQuery('seq:GN');
    expect(plan.diagnostics.some((d) => d.code === 'invalid-dna' && d.severity === 'error')).toBe(true);
    expect(plan.seqQuery).toBeNull();
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
