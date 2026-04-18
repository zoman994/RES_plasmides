import { describe, it, expect } from 'vitest';
import { detectCommonFeatures } from '../feature-detection';
import { CODON_TABLE } from '../codons';

// Helper: translate DNA -> protein (same as in feature-detection.js)
function translate(seq) {
  let p = '';
  for (let i = 0; i + 2 < seq.length; i += 3) {
    p += CODON_TABLE[seq.slice(i, i + 3)] || '?';
  }
  return p;
}

// Build a small mock feature database
// AmpR TEM-1 protein fragment (first 50aa, real sequence)
const AMPR_PROTEIN_50 = 'MSIQHFRVALIPFFAAFCLPVFAHPETLVKVKDAEDQLGARVGYIELDL';
// DNA that encodes this protein (we'll build it from codons)
function proteinToDNA(prot) {
  // Simple codon table (one codon per aa)
  const revTable = {};
  for (const [codon, aa] of Object.entries(CODON_TABLE)) {
    if (!revTable[aa]) revTable[aa] = codon;
  }
  return prot.split('').map(aa => revTable[aa] || 'NNN').join('');
}

const AMPR_DNA_50 = proteinToDNA(AMPR_PROTEIN_50);

// Create a mutated version (~95% identity)
function mutateProtein(prot, rate) {
  const AAs = 'ACDEFGHIKLMNPQRSTVWY';
  return prot.split('').map((aa, i) => {
    if (i % Math.round(1 / rate) === 0 && i > 0) {
      const replacement = AAs[(AAs.indexOf(aa) + 1) % AAs.length];
      return replacement;
    }
    return aa;
  }).join('');
}

const AMPR_MUTANT = mutateProtein(AMPR_PROTEIN_50, 0.05); // ~5% mutations

// Ori DNA sequence (200bp placeholder)
const ORI_DNA = 'AAAGGATCTTCTTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACCAGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTTCAGCAGAGCGCAGATACCAAATACTGTTCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTCAAGAACTCTGTAG';

const mockDB = {
  version: '2.0',
  features: [
    {
      name: 'AmpR',
      type: 'marker',
      sequence: AMPR_DNA_50,
      protein: AMPR_PROTEIN_50,
      length: AMPR_DNA_50.length,
      description: 'Beta-lactamase TEM-1',
    },
    {
      name: 'ori',
      type: 'rep_origin',
      sequence: ORI_DNA,
      protein: null,
      length: ORI_DNA.length,
      description: 'pMB1 origin of replication',
    },
  ],
};

describe('detectCommonFeatures', () => {
  it('exact protein match: finds AmpR in sequence', () => {
    // Build a plasmid-like sequence with AmpR CDS embedded
    const prefix = 'ATGCGATCGATCGATCGATCG'.repeat(5); // 105bp filler
    const amprCDS = 'ATG' + AMPR_DNA_50 + 'TAA'; // CDS with start/stop
    const suffix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const seq = prefix + amprCDS + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ampr = results.find(r => r.feature.name === 'AmpR');
    expect(ampr).toBeDefined();
    expect(ampr.method).toBe('protein_exact');
    expect(ampr.identity).toBe(1.0);
    // Position should be within the sequence (after prefix + ATG)
    expect(ampr.start).toBeGreaterThanOrEqual(prefix.length);
  });

  it('fuzzy protein match: AmpR variant with ~5% mutations still detected', () => {
    const mutantDNA = proteinToDNA(AMPR_MUTANT);
    const prefix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const mutantCDS = 'ATG' + mutantDNA + 'TAA';
    const suffix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const seq = prefix + mutantCDS + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ampr = results.find(r => r.feature.name === 'AmpR');
    expect(ampr).toBeDefined();
    expect(ampr.method).toBe('protein_fuzzy');
    expect(ampr.identity).toBeGreaterThanOrEqual(0.90);
  });

  it('DNA identity match: ori found by >=96% DNA identity', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const seq = prefix + ORI_DNA + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ori = results.find(r => r.feature.name === 'ori');
    expect(ori).toBeDefined();
    expect(ori.method).toBe('dna_identity');
    expect(ori.identity).toBeGreaterThanOrEqual(0.96);
  });

  it('no false positives: random sequence has 0 hits', () => {
    // Random sequence with no RE sites, no known proteins
    const random = 'TACGTACGTACGTACGTACGTACGTACGTACG'.repeat(30); // repetitive but not in DB
    const results = detectCommonFeatures(random, mockDB);
    expect(results).toHaveLength(0);
  });

  it('empty/short sequence returns empty', () => {
    expect(detectCommonFeatures('', mockDB)).toHaveLength(0);
    expect(detectCommonFeatures('ATG', mockDB)).toHaveLength(0);
  });

  it('null database returns empty', () => {
    expect(detectCommonFeatures('ATGCGATCGATCGATCGATCG', null)).toHaveLength(0);
  });
});
