import { describe, expect, it } from 'vitest';
import {
  maxRecognitionLength,
  occurrenceCuts,
  occurrenceLabelPosition,
  scanOccurrences,
} from '../restriction-occurrence';

const EcoRI = {
  site: 'GAATTC', cut: [1, 5], end: '5prime', overhang: 'AATT',
};

describe('canonical restriction occurrence', () => {
  it('owns the physical forward cuts for EcoRI@100', () => {
    const sequence = `${'A'.repeat(100)}GAATTC${'T'.repeat(40)}`;
    const [occurrence] = scanOccurrences(sequence, {
      enzymes: { EcoRI },
      names: ['EcoRI'],
    });

    expect(occurrence).toMatchObject({
      occurrenceKey: 'EcoRI:1:100',
      enzyme: 'EcoRI',
      source: 'catalog',
      strand: 1,
      recognition: {
        start: 100,
        end: 106,
        segments: [{ start: 100, end: 106 }],
        wrapsOrigin: false,
        site: 'GAATTC',
        matchedSequence: 'GAATTC',
      },
      topCut: 101,
      bottomCut: 105,
      overhang: { type: '5overhang', seq: 'AATT', length: 4 },
    });
    expect(occurrenceCuts(occurrence)).toEqual({ topCut: 101, bottomCut: 105 });
    expect(occurrenceLabelPosition(occurrence)).toBe(101);
  });

  it('uses reverse-strand cut geometry for an asymmetric custom enzyme', () => {
    const FlipI = {
      site: 'ACGTTA', cut: [1, 4], end: '5prime', overhang: 'AAC', isCustom: true,
    };
    const [occurrence] = scanOccurrences('TTTTTTTTTTTAACGTTTT', {
      enzymes: { FlipI },
      names: ['FlipI'],
    });

    expect(occurrence).toMatchObject({
      occurrenceKey: 'FlipI:-1:10',
      source: 'custom',
      strand: -1,
      recognition: {
        start: 10,
        end: 16,
        pattern: 'ACGTTA',
        matchedTop: 'TAACGT',
      },
      topCut: 12,
      bottomCut: 15,
      topCutOffset: 2,
      bottomCutOffset: 5,
      topCutUnwrapped: 12,
      bottomCutUnwrapped: 15,
      overhang: { type: '5overhang', seq: 'ACG', length: 3 },
    });
  });

  it('finds a 15 bp XcmI site once across a circular origin', () => {
    const XcmI = {
      site: 'CCANNNNNNNNNTGG', cut: [8, 7], end: '3prime', overhang: 'N',
    };
    const concrete = XcmI.site.replace(/N/g, 'A');
    const sequence = `${concrete.slice(1)}${'G'.repeat(9)}${concrete.slice(0, 1)}`;

    const occurrences = scanOccurrences(sequence, {
      circular: true,
      enzymes: { XcmI },
      names: ['XcmI'],
    });

    expect(maxRecognitionLength({ XcmI })).toBe(15);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      occurrenceKey: 'XcmI:1:23',
      recognition: {
        start: 23,
        end: 38,
        pattern: 'CCANNNNNNNNNTGG',
        matchedTop: concrete,
        segments: [{ start: 23, end: 24 }, { start: 0, end: 14 }],
        wrapsOrigin: true,
      },
      topCut: 7,
      bottomCut: 6,
      topCutUnwrapped: 31,
      bottomCutUnwrapped: 30,
      overhang: { type: '3overhang', seq: 'A', length: 1 },
    });
  });

  it('retains overlapping palindromic occurrences without reverse duplicates', () => {
    const AccII = { site: 'CGCG', cut: [2, 2], end: 'blunt', overhang: null };
    const occurrences = scanOccurrences('CGCGCG', {
      enzymes: { AccII },
      names: ['AccII'],
    });

    expect(occurrences.map((occurrence) => ({
      start: occurrence.recognition.start,
      topCut: occurrence.topCut,
      strand: occurrence.strand,
    }))).toEqual([
      { start: 0, topCut: 2, strand: 1 },
      { start: 2, topCut: 4, strand: 1 },
    ]);
  });

  it('derives circular extension from a custom recognition site longer than 15 bp', () => {
    const LongI = {
      site: 'ACGTTGCAACCTAGGTA', cut: [3, 14], isCustom: true,
    };
    const sequence = `${LongI.site.slice(1)}${'C'.repeat(23)}${LongI.site[0]}`;
    const occurrences = scanOccurrences(sequence, {
      circular: true,
      enzymes: { LongI },
      names: ['LongI'],
    });

    expect(maxRecognitionLength({ LongI })).toBe(17);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]).toMatchObject({
      occurrenceKey: 'LongI:1:39',
      source: 'custom',
      recognition: {
        start: 39,
        end: 56,
        segments: [{ start: 39, end: 40 }, { start: 0, end: 16 }],
      },
    });
  });

  it('fails closed for invalid cut metadata', () => {
    expect(scanOccurrences('GAATTC', {
      enzymes: { Broken: { site: 'GAATTC', cut: [1, 99] } },
      names: ['Broken'],
    })).toEqual([]);
  });

  it('fails closed for a palindromic motif with strand-ambiguous cuts', () => {
    expect(scanOccurrences('GAATTC', {
      enzymes: { AmbiguousPalI: { site: 'GAATTC', cut: [1, 4], isCustom: true } },
      names: ['AmbiguousPalI'],
    })).toEqual([]);
  });
});
