import { describe, it, expect } from 'vitest';
import { detectFormat } from '../format-detect';

describe('detectFormat', () => {
  it('GenBank header → genbank', () => {
    const text = 'LOCUS pUC19  2686 bp    DNA  circular  SYN  10-AUG-2023\nFEATURES';
    expect(detectFormat(text)).toBe('genbank');
  });

  it('FASTA header → fasta', () => {
    const text = '>seq1 some description\nATGCATGCATGCATGC';
    expect(detectFormat(text)).toBe('fasta');
  });

  it('raw nucleotides ≥10 valid IUPAC → raw', () => {
    expect(detectFormat('ATGCATGCATGCATGC')).toBe('raw');
  });

  it('mostly punctuation / numbers / non-IUPAC letters → unknown', () => {
    expect(detectFormat('!!! ??? 12345 :::: ;;;; ()()()')).toBe('unknown');
    expect(detectFormat('')).toBe('unknown');
    expect(detectFormat('   \n\t  ')).toBe('unknown');
  });
});
