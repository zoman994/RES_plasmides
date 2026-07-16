/**
 * search-result-format — honest metric strings for a sequence hit (P2). The row
 * must NEVER say «100% identity» for an IUPAC query (identity is undefined there) —
 * it says «100% совместимость · 14/20 точных · 6 неоднозначных». Colour is by
 * strength (identity ?? compatibility), never «valid/invalid».
 */
import { afterEach, describe, it, expect } from 'vitest';
import { setLang } from '../../i18n';
import {
  formatSeqMetrics, metricPercent, formatProteinMetrics, formatProteinExplain,
  formatEnzymeMetrics, formatEnzymeExplain,
} from '../search-result-format';

afterEach(() => setLang('ru'));

describe('formatSeqMetrics — concrete query (identity known)', () => {
  it('clean full match', () => {
    expect(formatSeqMetrics({ identity: 1, length: 20, exactMatches: 20, mismatches: 0 }))
      .toBe('100% идентичность · 20/20 нт');
  });
  it('partial identity surfaces mismatches', () => {
    expect(formatSeqMetrics({ identity: 0.9, length: 20, exactMatches: 18, mismatches: 2 }))
      .toBe('90% идентичность · 18/20 точных · 2 несовп.');
  });
  it('indels are surfaced', () => {
    expect(formatSeqMetrics({ identity: 0.95, length: 20, exactMatches: 19, mismatches: 0, indels: 1 }))
      .toBe('95% идентичность · 20/20 нт · 1 indel');
  });
});

describe('formatSeqMetrics — degenerate query (identity null → compatibility)', () => {
  it('says «совместимость», not «идентичность», and shows the uncertain count', () => {
    expect(formatSeqMetrics({
      identity: null, compatibility: 1, length: 20, exactMatches: 14, uncertainMatches: 6, mismatches: 0,
    })).toBe('100% совместимость · 14/20 точных · 6 неоднозн.');
  });
});

describe('formatProteinMetrics — protein-worded, never «нт»', () => {
  it('says «совпадение белка» + aa count, not nucleotides', () => {
    expect(formatProteinMetrics({ identity: 1, length: 6, uncertainMatches: 0 }))
      .toBe('100% совпадение белка · 6 aa');
  });
  it('surfaces wildcard residues (X)', () => {
    expect(formatProteinMetrics({ identity: 1, length: 4, uncertainMatches: 1 }))
      .toBe('100% совпадение белка · 4 aa · 1×X');
  });
});

describe('formatProteinExplain — the explainability line (flagship)', () => {
  it('spells out cds/strand/residues/frame/exons/intron', () => {
    expect(formatProteinExplain({
      cdsName: 'glaA', strand: -1, aaStart: 117, aaEnd: 146, frame: 0,
      exonCount: 3, intronExcluded: true, geneticCode: 1, nonStandardCode: false,
    })).toBe('glaA · обратная цепь · 117–146 aa · рамка 1 · 3 экзона · интрон исключён');
  });
  it('omits exon/intron parts for a single-exon forward CDS', () => {
    expect(formatProteinExplain({
      cdsName: 'gfp', strand: 1, aaStart: 2, aaEnd: 7, frame: 0,
      exonCount: 1, intronExcluded: false, geneticCode: 1, nonStandardCode: false,
    })).toBe('gfp · прямая цепь · 2–7 aa · рамка 1');
  });
  it('flags a non-standard genetic code', () => {
    expect(formatProteinExplain({
      cdsName: 'cox1', strand: 1, aaStart: 1, aaEnd: 5, frame: 0,
      exonCount: 1, intronExcluded: false, geneticCode: 4, nonStandardCode: true,
    })).toContain('код 4');
  });
});

describe('formatEnzymeExplain / formatEnzymeMetrics — enzyme (re:) hit', () => {
  it('spells out name · site · overhang for a 5′ enzyme', () => {
    expect(formatEnzymeExplain({ name: 'EcoRI', site: 'GAATTC', end: '5prime', overhang: 'AATT' }))
      .toBe('EcoRI · GAATTC · 5′-выступ AATT');
  });
  it('says «тупой конец» for a blunt cutter', () => {
    expect(formatEnzymeExplain({ name: 'EcoRV', site: 'GATATC', end: 'blunt', overhang: null }))
      .toBe('EcoRV · GATATC · тупой конец');
  });
  it('flags Type IIS', () => {
    expect(formatEnzymeExplain({ name: 'BsaI', site: 'GGTCTC', typeIIS: true }))
      .toBe('BsaI · GGTCTC · Type IIS');
  });
  it('metrics: exact site → empty, IUPAC site → «IUPAC-сайт»', () => {
    expect(formatEnzymeMetrics({ identity: 1 })).toBe('');
    expect(formatEnzymeMetrics({ identity: null })).toBe('IUPAC-сайт');
  });
});

describe('metricPercent — the number for colouring', () => {
  it('uses identity when present, compatibility when null', () => {
    expect(metricPercent({ identity: 0.83, compatibility: 1 })).toBeCloseTo(0.83);
    expect(metricPercent({ identity: null, compatibility: 0.75 })).toBeCloseTo(0.75);
    expect(metricPercent(null)).toBeNull();
  });
});

describe('search-result-format — active locale', () => {
  it('formats DNA, protein provenance, and enzyme chemistry in English', () => {
    setLang('en');
    expect(formatSeqMetrics({ identity: 0.9, length: 20, exactMatches: 18, mismatches: 2 }))
      .toBe('90% identity · 18/20 exact · 2 mismatches');
    expect(formatProteinExplain({
      cdsName: 'glaA', strand: -1, aaStart: 117, aaEnd: 146, frame: 0,
      exonCount: 3, intronExcluded: true, geneticCode: 1, nonStandardCode: false,
    })).toBe('glaA · reverse strand · 117–146 aa · frame 1 · 3 exons · intron excluded');
    expect(formatEnzymeExplain({ name: 'EcoRV', site: 'GATATC', end: 'blunt', overhang: null }))
      .toBe('EcoRV · GATATC · blunt end');
  });
});
