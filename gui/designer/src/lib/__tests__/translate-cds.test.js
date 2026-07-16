import { describe, it, expect } from 'vitest';
import {
  codonStartToFrame,
  readCodonStart,
  readTranslTable,
  resolveSplicedFrame,
  usesNonStandardCode,
  translateSpliced,
  stripTrailingStops,
  STANDARD_TABLE_ID,
} from '../translate-cds.js';

describe('translate-cds — codon_start → frame offset', () => {
  it('maps INSDC 1|2|3 (1-based) to spliced-frame offset 0|1|2', () => {
    expect(codonStartToFrame('1')).toBe(0);
    expect(codonStartToFrame('2')).toBe(1);
    expect(codonStartToFrame('3')).toBe(2);
    expect(codonStartToFrame(1)).toBe(0);
    expect(codonStartToFrame(3)).toBe(2);
  });
  it('returns null for absent / invalid codon_start', () => {
    expect(codonStartToFrame(undefined)).toBeNull();
    expect(codonStartToFrame('0')).toBeNull();
    expect(codonStartToFrame('4')).toBeNull();
    expect(codonStartToFrame('x')).toBeNull();
  });
  it('reads codon_start off a region qualifiers bag', () => {
    expect(readCodonStart({ qualifiers: { codon_start: '2' } })).toBe(1);
    expect(readCodonStart({ qualifiers: { gene: 'x' } })).toBeNull();
    expect(readCodonStart({})).toBeNull();
    expect(readCodonStart(null)).toBeNull();
  });
});

describe('translate-cds — transl_table', () => {
  it('reads transl_table as an NCBI id, null when absent/invalid', () => {
    expect(readTranslTable({ qualifiers: { transl_table: '11' } })).toBe(11);
    expect(readTranslTable({ qualifiers: { transl_table: 1 } })).toBe(1);
    expect(readTranslTable({ qualifiers: {} })).toBeNull();
    expect(readTranslTable({ qualifiers: { transl_table: 'x' } })).toBeNull();
  });
  it('flags a non-standard genetic code (transl_table !== 1)', () => {
    expect(STANDARD_TABLE_ID).toBe(1);
    expect(usesNonStandardCode({ qualifiers: { transl_table: '4' } })).toBe(true);
    expect(usesNonStandardCode({ qualifiers: { transl_table: '1' } })).toBe(false);
    expect(usesNonStandardCode({ qualifiers: {} })).toBe(false);
  });
});

describe('translate-cds — resolveSplicedFrame priority chain', () => {
  it('honors codon_start over the heuristic (overrides fewest-stops)', () => {
    // spliced reads cleanest at frame 0 (M M M then stop), but codon_start=2
    // pins frame 1 — the resolver must obey the file, not the heuristic.
    const spliced = 'ATGATGATGTAA';
    const region = { qualifiers: { codon_start: '2' } };
    expect(resolveSplicedFrame(region, spliced)).toBe(1);
  });
  it('falls back to a persisted saved frame when no codon_start', () => {
    expect(resolveSplicedFrame({ frame: 2 }, 'ATGAAATAA')).toBe(2);
  });
  it('falls back to the fewest-stops heuristic when nothing is pinned', () => {
    // clean ORF in frame 0 → pickSplicedFrame returns 0.
    expect(resolveSplicedFrame({}, 'ATGAAAAAATAA')).toBe(0);
  });
});

describe('translate-cds — translateSpliced', () => {
  it('translates from frame 0 with the standard code (stop as *)', () => {
    expect(translateSpliced('ATGAAATAA', 0)).toBe('MK*');
  });
  it('honors the frame offset', () => {
    // leading G, codon_start=2 → frame 1 → ATG AAA TAA
    expect(translateSpliced('GATGAAATAA', 1)).toBe('MK*');
  });
  it('lowercase input still translates; unknown codon → X', () => {
    expect(translateSpliced('atgaaa', 0)).toBe('MK');
    expect(translateSpliced('ATGNNN', 0)).toBe('MX');
  });
  it('stripTrailingStops removes a trailing run of stops only', () => {
    expect(stripTrailingStops('MK**')).toBe('MK');
    expect(stripTrailingStops('M*K*')).toBe('M*K');
  });
});
