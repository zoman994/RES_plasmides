import { describe, it, expect } from 'vitest';
import { detectCommonFeatures } from '../feature-detection';
import { CODON_TABLE } from '../codons';
import realDB from '../../public/common-features.json';

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

// Real DB fixture for the cut-and-paste regression (DEC-FDP-03 amendment).
const REAL_AMPR = realDB.features.find((f) => f.name === 'AmpR');
const REAL_ORI = realDB.features.find((f) => f.name === 'ori');
const mockDB_REAL = { version: realDB.version, features: [REAL_AMPR, REAL_ORI] };

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

  // --- Partial seed-extend (SPEC_FEATURE_DETECTION_PARTIAL) ---

  it('protein partial: AmpR truncated to first 30 aa -> protein_partial', () => {
    // 105bp prefix is frame-0 aligned (105 % 3 === 0) so the ATG starts in frame 0
    const prefix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const truncCDS = 'ATG' + proteinToDNA(AMPR_PROTEIN_50.slice(0, 30)) + 'TAA';
    const suffix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const seq = prefix + truncCDS + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ampr = results.filter(r => r.feature.name === 'AmpR');
    expect(ampr).toHaveLength(1);
    expect(ampr[0].method).toBe('protein_partial');
    expect(ampr[0].featureStart).toBe(0);
    expect(ampr[0].featureEnd).toBeGreaterThanOrEqual(85);
    expect(ampr[0].featureEnd).toBeLessThanOrEqual(95);
    expect(ampr[0].coverage).toBeGreaterThanOrEqual(0.55);
    expect(ampr[0].coverage).toBeLessThanOrEqual(0.65);
    expect(ampr[0].identity).toBeGreaterThanOrEqual(0.90);
  });

  it('dna partial: ori truncated to first 110 nt -> dna_partial', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const seq = prefix + ORI_DNA.slice(0, 110) + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ori = results.filter(r => r.feature.name === 'ori');
    expect(ori).toHaveLength(1);
    expect(ori[0].method).toBe('dna_partial');
    expect(ori[0].featureStart).toBe(0);
    expect(ori[0].featureEnd).toBeGreaterThanOrEqual(105);
    expect(ori[0].featureEnd).toBeLessThanOrEqual(115);
    expect(ori[0].coverage).toBeGreaterThanOrEqual(0.50);
    expect(ori[0].coverage).toBeLessThanOrEqual(0.60);
  });

  it('partial under 50-nt floor: 40-nt ori fragment -> not found', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const seq = prefix + ORI_DNA.slice(0, 40) + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    expect(results.find(r => r.feature.name === 'ori')).toBeUndefined();
  });

  it('partial coverage <50% but length >=50nt: 80-nt fragment of ~205-nt ori -> dna_partial found', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const seq = prefix + ORI_DNA.slice(0, 80) + suffix;
    const results = detectCommonFeatures(seq, mockDB);
    const ori = results.find(r => r.feature.name === 'ori');
    expect(ori).toBeDefined();
    expect(ori.method).toBe('dna_partial');
    expect(ori.coverage).toBeLessThan(0.5);
    expect(ori.coverage).toBeGreaterThanOrEqual(0.30);
  });

  it('partial does not replace full match: full + partial ori -> keep full only', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const spacer = 'AGCT'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const seq = prefix + ORI_DNA + spacer + ORI_DNA.slice(0, 120) + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ori = results.filter(r => r.feature.name === 'ori');
    expect(ori).toHaveLength(1);
    expect(ori[0].method).toBe('dna_identity');
    expect(ori[0].identity).toBeGreaterThanOrEqual(0.96);
  });

  it('split partial DNA: ori split by 100-nt insertion -> 2 dna_partial rows', () => {
    const prefix = 'GCGATCGATCGATCGATCGATC'.repeat(5);
    const suffix = 'ATGCGATCGATCGATCGATCG'.repeat(5);
    const oriFirst = ORI_DNA.slice(0, 120);   // 120/205 ~ 0.585
    const oriSecond = ORI_DNA.slice(100);     // 105/205 ~ 0.512, overlaps feature [100,120)
    const foreign = 'AGCT'.repeat(25);        // 100 nt, not in DB, not in ori
    const seq = prefix + oriFirst + foreign + oriSecond + suffix;

    const results = detectCommonFeatures(seq, mockDB);
    const ori = results
      .filter(r => r.feature.name === 'ori')
      .sort((a, b) => a.featureStart - b.featureStart);
    expect(ori).toHaveLength(2);
    expect(ori[0].method).toBe('dna_partial');
    expect(ori[1].method).toBe('dna_partial');
    // target-spans (row.start/end) must not overlap
    expect(Math.min(ori[0].end, ori[1].end))
      .toBeLessThanOrEqual(Math.max(ori[0].start, ori[1].start));
    // first piece anchored at feature start, second around mid-feature
    expect(ori[0].featureStart).toBeLessThanOrEqual(5);
    expect(ori[1].featureStart).toBeGreaterThanOrEqual(90);
    expect(ori[1].featureStart).toBeLessThanOrEqual(110);
  });

  it('real cut-and-paste fragment (805nt): AmpR 40% + ori 49% coverage both found', () => {
    // Igor's real fragment 27.05.2026: AmpR C-term ~348nt + ori N-term ~287nt.
    // Pre-hotfix: dropped by 50% coverage floor. Post-hotfix (30% OR 150nt): both pass.
    const fragment = 'CCAAACGACGAGCGTGACACCACGATGCCTGTAGCAATGGCAACAACGTTGCGCAAACTATTAACTGGCGAACTACTTACTCTAGCTTCCCGGCAACAATTAATAGACTGGATGGAGGCGGATAAAGTTGCAGGACCACTTCTGCGCTCGGCCCTTCCGGCTGGCTGGTTTATTGCTGATAAATCTGGAGCCGGTGAGCGTGGGTCTCGCGGTATCATTGCAGCACTGGGGCCAGATGGTAAGCCCTCCCGTATCGTAGTTATCTACACGACGGGGAGTCAGGCAACTATGGATGAACGAAATAGACAGATCGCTGAGATAGGTGCCTCACTGATTAAGCATTGGTAACTGTCAGACCAAGTTTACTCATATATACTTTAGATTGATTTAAAACTTCATTTTTAATTTAAAAGGATCTAGGTGAAGATCCTTTTTGATAATCTCATGACCAAAATCCCTTAACGTGAGTTTTCGTTCCACTGAGCGTCAGACCCCGTAGAAAAGATCAAAGGATCTTCTTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACCAGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTTCAGCAGAGCGCAGATACCAAATACTGTCCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTCAAGAACTCTGTAGCACCGCCTACATACCTCGCTCTGCTAATCCTGTTACCAGTGGCTGCTGCCAGTGGCGATAAGTCGTGTCTTACCGGGTTGGACTCAAGACGAT';
    const results = detectCommonFeatures(fragment, mockDB_REAL);
    const amp = results.find(r => r.feature.name === 'AmpR');
    const ori = results.find(r => r.feature.name === 'ori');
    expect(amp).toBeDefined();
    expect(amp.method).toBe('dna_partial');  // comma-encoded -> DNA branch
    expect(amp.coverage).toBeGreaterThan(0.35);
    expect(amp.coverage).toBeLessThan(0.50);
    expect(ori).toBeDefined();
    expect(ori.method).toBe('dna_partial');
    expect(ori.coverage).toBeGreaterThan(0.40);
    expect(ori.coverage).toBeLessThan(0.55);
  });

  it('protein-pathway type filter: promoter with feat.protein is not protein-matched', () => {
    // Synthetic edge case: a promoter that accidentally has a feat.protein
    // field. The matcher must skip the CDS branch for it regardless.
    const badPromoter = {
      name: 'fake-prom',
      type: 'promoter',
      sequence: AMPR_DNA_50,       // share DNA with AmpR to force a hit if not gated
      protein: AMPR_PROTEIN_50,
      length: AMPR_DNA_50.length,
    };
    const dbWithBadPromoter = { version: '2.0', features: [badPromoter] };
    // Build target that contains the protein in-frame — so if the type
    // gate fails, protein_exact would fire.
    const seq = 'AAA' + 'ATG' + AMPR_DNA_50 + 'TAA' + 'TTT';
    const results = detectCommonFeatures(seq, dbWithBadPromoter);
    const hit = results.find(r => r.feature.name === 'fake-prom');
    // If found, must be via DNA pathway (sequence match), not protein.
    if (hit) {
      expect(hit.method).not.toBe('protein_exact');
      expect(hit.method).not.toBe('protein_fuzzy');
      expect(hit.method).not.toBe('protein_partial');
    }
  });
});
