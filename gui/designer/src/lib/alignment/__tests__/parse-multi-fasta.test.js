import { describe, it, expect } from 'vitest';
import { parseMultiFasta } from '../parse-multi-fasta';

describe('parseMultiFasta', () => {
  it('parses two records', () => {
    const recs = parseMultiFasta('>a desc one\nACGT\nACGT\n>b\nTTTT');
    expect(recs).toHaveLength(2);
    expect(recs[0]).toEqual({ name: 'a', description: 'desc one', sequence: 'ACGTACGT' });
    expect(recs[1]).toEqual({ name: 'b', description: '', sequence: 'TTTT' });
  });

  it('parses a single record without trailing newline', () => {
    const recs = parseMultiFasta('>only\nACGTACGT');
    expect(recs).toHaveLength(1);
    expect(recs[0].sequence).toBe('ACGTACGT');
  });

  it('handles CRLF line endings', () => {
    const recs = parseMultiFasta('>a\r\nACGT\r\n>b\r\nGGCC\r\n');
    expect(recs).toHaveLength(2);
    expect(recs[0].sequence).toBe('ACGT');
    expect(recs[1].sequence).toBe('GGCC');
  });

  it('ignores blank lines and lowercases/strips non-letters', () => {
    const recs = parseMultiFasta('>a\nac gt\n\n12ac\n');
    expect(recs[0].sequence).toBe('ACGTAC');
  });

  it('treats headerless raw sequence as a single anonymous record', () => {
    const recs = parseMultiFasta('ACGTACGT\nTTTT');
    expect(recs).toHaveLength(1);
    expect(recs[0].name).toBe('seq_1');
    expect(recs[0].sequence).toBe('ACGTACGTTTTT');
  });

  it('rescues a header-line sequence (>F1 ACGT with no body)', () => {
    const recs = parseMultiFasta('>F1 ACGTACGT');
    expect(recs[0].name).toBe('F1');
    expect(recs[0].sequence).toBe('ACGTACGT');
    expect(recs[0].description).toBe('');
  });

  it('returns [] for empty input', () => {
    expect(parseMultiFasta('')).toEqual([]);
    expect(parseMultiFasta(null)).toEqual([]);
  });
});
