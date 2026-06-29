/**
 * PRIMER-11 (V176) — file-import must surface importFeatures().primers in
 * _metadata.primers, not drop them. Before the fix, a GenBank/.dna with a
 * primer_bind feature parsed its annotations but discarded the primers, so they
 * never reached the pool (Library primerCandidates reads _metadata.primers).
 */
import { describe, it, expect } from 'vitest';
import { parseFile } from '../file-import';

const GB = `LOCUS       testseq                60 bp    DNA     linear   UNA 01-JAN-2020
FEATURES             Location/Qualifiers
     primer_bind     1..20
                     /label="myPrimer"
                     /primer_seq="ACGTACGTACGTACGTACGT"
ORIGIN
        1 acgtacgtac gtacgtacgt tttttttttt cccccccccc gggggggggg aaaaaaaaaa
//
`;

const GB_NO_PRIMER = `LOCUS       plain                  30 bp    DNA     linear
FEATURES             Location/Qualifiers
     CDS             1..30
                     /label="gene"
ORIGIN
        1 acgtacgtac gtacgtacgt acgtacgtac
//
`;

describe('parseFile — primer passthrough (V176)', () => {
  it('surfaces a primer_bind feature in _metadata.primers', async () => {
    const file = new File([GB], 'test.gb', { type: 'text/plain' });
    const result = await parseFile(file);
    expect(result._metadata?.primers?.length).toBe(1);
    expect(result._metadata.primers[0].name).toBe('myPrimer');
  });

  it('no primers → _metadata stays null (back-compat)', async () => {
    const file = new File([GB_NO_PRIMER], 'plain.gb', { type: 'text/plain' });
    const result = await parseFile(file);
    expect(result._metadata).toBe(null);
  });
});
