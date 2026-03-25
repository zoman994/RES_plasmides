/**
 * Aggressive biological validation tests.
 * Tests real-world scenarios a molecular biology student would encounter.
 */
import { describe, it, expect } from 'vitest';
import { CODON_TABLE, translateDNA, translateCodon, getCodonsForAA, getBestCodon, ORGANISMS } from '../codons';
import { validateConstruct, checkPrimerQuality, pcrProductSize } from '../validate';
import { detectSignalPeptide, detectHisTag, detectPropeptide, detectLinkers, autoDetectDomains } from '../domain-detection';
import { findCompatiblePrimers, buildOrderSheet } from '../primer-reuse';
import { darken, getFragColor, isMarker } from '../theme';

// ═══════════════════════════════════════════════════════════
// REAL GENE SEQUENCES (truncated but biologically accurate)
// ═══════════════════════════════════════════════════════════

// EGFP: starts with ATG, ends with stop, 720bp (240 aa)
const EGFP_DNA = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA';

// AmpR (bla): beta-lactamase, 861bp
const AMPR_DNA = 'ATGAGTATTCAACATTTCCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCTGTTTTTGCTCACCCAGAAACGCTGGTGAAAGTAAAAGATGCTGAAGATCAGTTGGGTGCACGAGTGGGTTACATCGAACTGGATCTCAACAGCGGTAAGATCCTTGAGAGTTTTCGCCCCGAAGAACGTTTTCCAATGATGAGCACTTTTAAAGTTCTGCTATGTGGCGCGGTATTATCCCGTATTGACGCCGGGCAAGAGCAACTCGGTCGCCGCATACACTATTCTCAGAATGACTTGGTTGAGTACTCACCAGTCACAGAAAAGCATCTTACGGATGGCATGACAGTAAGAGAATTATGCAGTGCTGCCATAACCATGAGTGATAACACTGCGGCCAACTTACTTCTGACAACGATCGGAGGACCGAAGGAGCTAACCGCTTTTTTGCACAACATGGGGGATCATGTAACTCGCCTTGATCGTTGGGAACCGGAGCTGAATGAAGCCATACCAAACGACGAGCGTGACACCACGATGCCTGTAGCAATGGCAACAACGTTGCGCAAACTATTAACTGGCGAACTACTTACTCTAGCTTCCCGGCAACAATTAATAGACTGGATGGAGGCGGATAAAGTTGCAGGACCACTTCTGCGCTCGGCCCTTCCGGCTGGCTGGTTTATTGCTGATAAATCTGGAGCCGGTGAGCGTGGGTCTCGCGGTATCATTGCAGCACTGGGGCCAGATGGTAAGCCCTCCCGTATCGTAGTTATCTACACGACGGGGAGTCAGGCAACTATGGATGAACGAAATAGACAGATCGCTGAGATAGGTGCCTCACTGATTAAGCATTGGTAA';

// Short CDS without stop codon (bug scenario)
const NO_STOP_CDS = 'ATGGCCGCCGCCGCCGCCGCC';

// CDS with internal stop (bug)
const INTERNAL_STOP_CDS = 'ATGGCCTAGGCCGCCGCCTAA';

// CDS with frameshift (not %3)
const FRAMESHIFT_CDS = 'ATGGCCGCCGC'; // 11bp

// glaA signal peptide (A. niger glucoamylase, 18 aa = 54 nt)
const GLAA_SP_DNA = 'ATGTTCTCTCCCATCCTCACTGCCGTCGCTCTCGCAGCCGGCCTGGCCGCCCCC';

// Protein with clear signal peptide (hydrophobic N-term)
const SP_PROTEIN = 'MSFRSLLALSGLVCTGLA' + 'DDDEEEKKKRRR'.repeat(20);

// Protein without signal peptide (cytoplasmic, charged N-term)
const CYTO_PROTEIN = 'MDDEEEKKKRRRDDDEEE' + 'AAAAAAAAAA'.repeat(20);

// Protein with His-tag at C-terminus
const HIS_C_PROTEIN = 'M' + 'ACDEFG'.repeat(30) + 'HHHHHH';

// Protein with N-terminal His-tag
const HIS_N_PROTEIN = 'MHHHHHH' + 'ACDEFG'.repeat(30);

// Protein with propeptide (KR cleavage site)
const PROPEPTIDE_PROTEIN = 'MSFRSLLALSGLVCTGLA' + 'TTTTTTTTTTTTTKR' + 'ACDEFG'.repeat(30);

// O-glycosylated linker (S/T/P/G rich, typical of fungal enzymes)
const LINKER_PROTEIN = 'A'.repeat(50) + 'SSTPGSSGPTSSTPGSSGPT' + 'A'.repeat(50);


// ═══════════════════════════════════════════════════════════
// CODON BIOLOGY TESTS
// ═══════════════════════════════════════════════════════════

describe('Codon biology', () => {
  it('translates real EGFP correctly — starts with M, ends with *', () => {
    const prot = translateDNA(EGFP_DNA);
    expect(prot[0]).toBe('M');
    expect(prot[prot.length - 1]).toBe('*');
    expect(prot.length).toBe(240);
  });

  it('translates real AmpR correctly — starts with M', () => {
    const prot = translateDNA(AMPR_DNA);
    expect(prot[0]).toBe('M');
    expect(prot[prot.length - 1]).toBe('*');
  });

  it('all 20 amino acids + stop are represented in codon table', () => {
    const aas = new Set(Object.values(CODON_TABLE));
    expect(aas.size).toBe(21); // 20 aa + *
    'ACDEFGHIKLMNPQRSTVWY*'.split('').forEach(aa => {
      expect(aas.has(aa)).toBe(true);
    });
  });

  it('every amino acid has at least one codon', () => {
    'ACDEFGHIKLMNPQRSTVWY*'.split('').forEach(aa => {
      const codons = getCodonsForAA(aa);
      expect(codons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('methionine has exactly one codon (ATG)', () => {
    expect(getCodonsForAA('M').length).toBe(1);
    expect(getCodonsForAA('M')[0].codon).toBe('ATG');
  });

  it('tryptophan has exactly one codon (TGG)', () => {
    expect(getCodonsForAA('W').length).toBe(1);
    expect(getCodonsForAA('W')[0].codon).toBe('TGG');
  });

  it('leucine has 6 codons (most degenerate)', () => {
    expect(getCodonsForAA('L').length).toBe(6);
  });

  it('stop has 3 codons (TAA, TAG, TGA)', () => {
    const stops = getCodonsForAA('*');
    expect(stops.length).toBe(3);
    expect(stops.map(s => s.codon).sort()).toEqual(['TAA', 'TAG', 'TGA']);
  });

  it('E. coli prefers CTG for leucine (52/1000)', () => {
    expect(getBestCodon('L', 'E. coli')).toBe('CTG');
  });

  it('S. cerevisiae prefers TTA/TTG for leucine (codon bias)', () => {
    const best = getBestCodon('L', 'S. cerevisiae');
    expect(['TTA', 'TTG']).toContain(best);
  });

  it('codon bias differs between organisms', () => {
    const ecoliLeu = getBestCodon('L', 'E. coli');
    const yeastLeu = getBestCodon('L', 'S. cerevisiae');
    expect(ecoliLeu).not.toBe(yeastLeu);
  });

  it('all 5 organisms are available', () => {
    expect(ORGANISMS).toContain('E. coli');
    expect(ORGANISMS).toContain('A. niger');
    expect(ORGANISMS).toContain('S. cerevisiae');
    expect(ORGANISMS).toContain('T. reesei');
    expect(ORGANISMS).toContain('P. pastoris');
  });

  it('handles mixed case DNA', () => {
    expect(translateDNA('atgGCCtaa')).toBe('MA*');
  });

  it('handles unknown codons as X', () => {
    expect(translateDNA('ATGNNN')).toBe('MX');
  });
});


// ═══════════════════════════════════════════════════════════
// CONSTRUCT VALIDATION — REAL CLONING SCENARIOS
// ═══════════════════════════════════════════════════════════

describe('Construct validation — real scenarios', () => {
  it('valid expression cassette: promoter → CDS → terminator', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'A'.repeat(850) },
      { name: 'GFP', type: 'CDS', sequence: EGFP_DNA },
      { name: 'TtrpC', type: 'terminator', sequence: 'A'.repeat(567) },
    ];
    const w = validateConstruct(frags);
    // Should have NO ATG/frameshift/stop warnings (EGFP is valid)
    expect(w.filter(s => s.includes('ATG') && s.includes('нет')).length).toBe(0);
    expect(w.filter(s => s.includes('рамк')).length).toBe(0);
  });

  it('CDS without stop codon: warns', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'AAAA' },
      { name: 'noStop', type: 'CDS', sequence: NO_STOP_CDS },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('стоп') && s.includes('конце'))).toBe(true);
  });

  it('CDS with internal stop: warns at correct position', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'AAAA' },
      { name: 'bad', type: 'CDS', sequence: INTERNAL_STOP_CDS },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('внутренний') && s.includes('TAG'))).toBe(true);
  });

  it('CDS with frameshift: warns with remainder', () => {
    const frags = [{ name: 'fs', type: 'CDS', sequence: FRAMESHIFT_CDS }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('11') && s.includes('3'))).toBe(true);
  });

  it('missing promoter before CDS: warns', () => {
    const frags = [
      { name: 'TtrpC', type: 'terminator', sequence: 'AAAA' },
      { name: 'GFP', type: 'CDS', sequence: EGFP_DNA },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('промотор'))).toBe(true);
  });

  it('CDS at end without terminator: warns', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'AAAA' },
      { name: 'GFP', type: 'CDS', sequence: EGFP_DNA },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('терминатор') && s.includes('после'))).toBe(true);
  });

  it('two CDS in a row: warns about polycistronic', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'AAAA' },
      { name: 'GFP', type: 'CDS', sequence: EGFP_DNA },
      { name: 'AmpR', type: 'CDS', sequence: AMPR_DNA },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('подряд') || s.includes('полицистрон'))).toBe(true);
  });

  it('intron warning for eukaryotic gene in E. coli', () => {
    const frags = [{
      name: 'EukGene', type: 'CDS', sequence: EGFP_DNA,
      has_introns: true, introns: [{ start: 100, end: 200 }],
    }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('интрон'))).toBe(true);
  });

  it('reversed promoter: warns about antisense transcription', () => {
    const frags = [{ name: 'PglaA', type: 'promoter', strand: -1, sequence: 'AAAA' }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('обратной ориентации'))).toBe(true);
  });

  it('reversed terminator: warns it wont work', () => {
    const frags = [{ name: 'TtrpC', type: 'terminator', strand: -1, sequence: 'AAAA' }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('перевёрнут'))).toBe(true);
  });

  it('empty sequence on CDS: no crash', () => {
    const frags = [{ name: 'empty', type: 'CDS', sequence: '' }];
    expect(() => validateConstruct(frags)).not.toThrow();
  });

  it('non-CDS fragments: no CDS-specific warnings', () => {
    const frags = [
      { name: 'PglaA', type: 'promoter', sequence: 'AAAA' },
      { name: 'TtrpC', type: 'terminator', sequence: 'GGGG' },
    ];
    const w = validateConstruct(frags);
    expect(w.filter(s => s.includes('ATG') || s.includes('стоп') || s.includes('рамк')).length).toBe(0);
  });
});


// ═══════════════════════════════════════════════════════════
// SIGNAL PEPTIDE DETECTION
// ═══════════════════════════════════════════════════════════

describe('Signal peptide detection', () => {
  it('detects glaA signal peptide (classic secretory, 18 aa)', () => {
    const result = detectSignalPeptide(SP_PROTEIN);
    expect(result.found).toBe(true);
    expect(result.cleavageSite).toBeGreaterThanOrEqual(15);
    expect(result.cleavageSite).toBeLessThanOrEqual(25);
    expect(result.confidence).toBeGreaterThan(0.4);
  });

  it('rejects cytoplasmic protein (charged N-terminus)', () => {
    const result = detectSignalPeptide(CYTO_PROTEIN);
    // Either not found or very low confidence
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('short protein (< 25 aa): does not crash, returns low confidence', () => {
    const result = detectSignalPeptide('MSFRSLLALSG');
    expect(result.cleavageSite).toBe(0);
  });

  it('all-hydrophobic protein: detects as signal (maybe false positive)', () => {
    const allHydro = 'MALLLLLLLLLLLLLLLLLLLL' + 'A'.repeat(100);
    const result = detectSignalPeptide(allHydro);
    expect(result.found).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════
// HIS-TAG DETECTION
// ═══════════════════════════════════════════════════════════

describe('His-tag detection', () => {
  it('detects C-terminal 6xHis', () => {
    const result = detectHisTag(HIS_C_PROTEIN);
    expect(result).not.toBeNull();
    expect(result.length).toBe(6);
    // Should be near the end
    expect(result.endAA).toBe(HIS_C_PROTEIN.length);
  });

  it('detects N-terminal 6xHis', () => {
    const result = detectHisTag(HIS_N_PROTEIN);
    expect(result).not.toBeNull();
    expect(result.startAA).toBe(2); // after M
    expect(result.length).toBe(6);
  });

  it('detects 10xHis', () => {
    const prot = 'M' + 'A'.repeat(50) + 'HHHHHHHHHH' + 'A'.repeat(50);
    const result = detectHisTag(prot);
    expect(result.length).toBe(10);
  });

  it('does not detect 5xHis (below threshold)', () => {
    const prot = 'M' + 'A'.repeat(50) + 'HHHHH' + 'A'.repeat(50);
    expect(detectHisTag(prot)).toBeNull();
  });

  it('does not detect scattered histidines', () => {
    const prot = 'MHAHAHAHAHAHA' + 'A'.repeat(100);
    expect(detectHisTag(prot)).toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════
// PROPEPTIDE DETECTION
// ═══════════════════════════════════════════════════════════

describe('Propeptide detection', () => {
  it('detects KR cleavage site after signal peptide', () => {
    const result = detectPropeptide(PROPEPTIDE_PROTEIN, 18);
    expect(result).not.toBeNull();
    expect(result.endAA).toBeGreaterThan(18);
  });

  it('returns null when no KR/KK site', () => {
    const noKR = 'MSFRSLLALSGLVCTGLA' + 'AAAAAAAAAAAAA' + 'ACDEFG'.repeat(30);
    expect(detectPropeptide(noKR, 18)).toBeNull();
  });

  it('returns null when signalEnd is null', () => {
    expect(detectPropeptide(PROPEPTIDE_PROTEIN, null)).toBeNull();
  });

  it('returns null when protein too short after signal', () => {
    expect(detectPropeptide('MSFRSLLALSGLVCTGLAKR', 18)).toBeNull();
  });
});


// ═══════════════════════════════════════════════════════════
// LINKER DETECTION
// ═══════════════════════════════════════════════════════════

describe('Linker detection', () => {
  it('detects S/T/P/G-rich region', () => {
    const linkers = detectLinkers(LINKER_PROTEIN);
    expect(linkers.length).toBeGreaterThanOrEqual(1);
    const lnk = linkers[0];
    expect(lnk.startAA).toBeGreaterThan(40);
    expect(lnk.endAA).toBeLessThan(80);
  });

  it('does not detect linker in all-alanine protein', () => {
    const linkers = detectLinkers('A'.repeat(200));
    expect(linkers.length).toBe(0);
  });

  it('detects multiple linkers', () => {
    const prot = 'A'.repeat(30) + 'SSTPGSSTPGSSTPGSST' + 'A'.repeat(30) + 'GPTSGPTSGPTSGPTSGP' + 'A'.repeat(30);
    const linkers = detectLinkers(prot);
    expect(linkers.length).toBeGreaterThanOrEqual(2);
  });
});


// ═══════════════════════════════════════════════════════════
// FULL DOMAIN DETECTION (autoDetectDomains)
// ═══════════════════════════════════════════════════════════

describe('autoDetectDomains — integrated', () => {
  it('detects signal peptide in glaA SP DNA', () => {
    // glaA SP + mature protein
    const dna = GLAA_SP_DNA + 'GCC'.repeat(100) + 'TAA';
    const domains = autoDetectDomains(dna, 'glaA');
    const signal = domains.find(d => d.type === 'signal');
    expect(signal).toBeDefined();
    expect(signal.startAA).toBe(1);
  });

  it('detects His-tag in tagged construct', () => {
    // ATG + 50 Ala codons + 6×His codons + stop
    const dna = 'ATG' + 'GCC'.repeat(50) + 'CATCACCATCACCATCAC' + 'TAA';
    const domains = autoDetectDomains(dna, 'tagged');
    const tag = domains.find(d => d.type === 'tag');
    expect(tag).toBeDefined();
    expect(tag.name).toContain('His');
  });

  it('domains are non-overlapping', () => {
    const dna = 'ATG' + 'GCC'.repeat(100) + 'TAA';
    const domains = autoDetectDomains(dna, 'test');
    for (let i = 1; i < domains.length; i++) {
      expect(domains[i].startAA).toBeGreaterThan(domains[i - 1].endAA);
    }
  });

  it('domains cover entire protein without gaps', () => {
    const dna = 'ATG' + 'GCC'.repeat(80) + 'TAA';
    const domains = autoDetectDomains(dna, 'test');
    const protLen = Math.floor(dna.length / 3);
    let covered = 0;
    domains.forEach(d => { covered += d.endAA - d.startAA + 1; });
    expect(covered).toBe(protLen);
  });

  it('returns empty for very short sequence', () => {
    expect(autoDetectDomains('ATGGCCTAA', 'short').length).toBe(0); // 3 aa, < 20
  });
});


// ═══════════════════════════════════════════════════════════
// PRIMER QUALITY — REAL PRIMER SCENARIOS
// ═══════════════════════════════════════════════════════════

describe('Primer quality — real scenarios', () => {
  it('good primer: 20bp, ends GC, no problems', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ACGTACGTACGTACGTACGC', length: 20 });
    expect(w.length).toBe(0);
  });

  it('primer ending with AT: warns no GC clamp', () => {
    const w = checkPrimerQuality({ bindingSequence: 'GCGCGCGCGCGCGCGCGCAT' });
    expect(w.some(s => s.includes('GC'))).toBe(true);
  });

  it('poly-T run: warns homopolymer', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCGTTTTTTTGCGC' });
    expect(w.some(s => s.includes('омополимер'))).toBe(true);
  });

  it('60nt primer: warns PAGE purification needed', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCG'.repeat(5), length: 60 });
    expect(w.some(s => s.includes('PAGE'))).toBe(true);
  });

  it('palindromic primer: warns self-complementarity', () => {
    // AATT is palindromic (RC = AATT)
    const w = checkPrimerQuality({ bindingSequence: 'GCGCGCGCAATTGCGC' });
    expect(w.some(s => s.includes('самокомплементарность'))).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════
// PCR PRODUCT SIZE CALCULATION
// ═══════════════════════════════════════════════════════════

describe('PCR product size — assembly scenarios', () => {
  it('3-fragment overlap assembly: sizes include overlaps', () => {
    const frags = [
      { name: 'PglaA', length: 850, needsAmplification: true },
      { name: 'GFP', length: 720, needsAmplification: true },
      { name: 'TtrpC', length: 567, needsAmplification: true },
    ];
    const junctions = [{ overlapLength: 30 }, { overlapLength: 30 }];

    // PglaA: no left junction, right junction 30bp
    expect(pcrProductSize(frags[0], null, junctions[0])).toBe(880);
    // GFP: left 30bp + right 30bp
    expect(pcrProductSize(frags[1], junctions[0], junctions[1])).toBe(780);
    // TtrpC: left 30bp, no right junction
    expect(pcrProductSize(frags[2], junctions[1], null)).toBe(597);
  });

  it('fragment from tube (no amplification): returns null', () => {
    const frag = { name: 'backbone', length: 5000, needsAmplification: false };
    expect(pcrProductSize(frag, { overlapLength: 30 }, { overlapLength: 30 })).toBeNull();
  });

  it('uses sequence length when length field is missing', () => {
    const frag = { name: 'X', sequence: 'ATCG'.repeat(100), needsAmplification: true };
    expect(pcrProductSize(frag, null, null)).toBe(400);
  });
});


// ═══════════════════════════════════════════════════════════
// PRIMER REUSE — PRACTICAL SCENARIOS
// ═══════════════════════════════════════════════════════════

describe('Primer reuse — lab scenarios', () => {
  it('exact reuse: same primer from previous experiment', () => {
    const newP = {
      name: 'IS001_fwd_GFP', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'A'.repeat(25), tmBinding: 62,
    };
    const old = [{
      name: 'IS050_fwd_GFP', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'A'.repeat(25), tmBinding: 62,
    }];
    const matches = findCompatiblePrimers(newP, old);
    expect(matches.length).toBe(1);
    expect(matches[0].overlapDiff).toBe(0);
  });

  it('shorter tail reuse: 25bp overlap instead of 30bp — acceptable', () => {
    const newP = {
      name: 'P1', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'ATCGATCGATCGATCGATCGATCGATCGATCG', // 32bp
      tmBinding: 62,
    };
    const old = [{
      name: 'P_old', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'ATCGATCGATCGATCGATCGATCGATCG', // 28bp, endsWith match
      tmBinding: 61,
    }];
    const matches = findCompatiblePrimers(newP, old, { minOverlap: 20 });
    expect(matches.length).toBe(1);
    expect(matches[0].overlapDiff).toBe(4); // 32 - 28
  });

  it('tail too short: 15bp overlap below minimum — rejected', () => {
    const newP = {
      name: 'P1', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'A'.repeat(30), tmBinding: 62,
    };
    const old = [{
      name: 'P_old', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: 'A'.repeat(15), tmBinding: 62,
    }];
    expect(findCompatiblePrimers(newP, old, { minOverlap: 20 }).length).toBe(0);
  });

  it('different template: same tail but different binding — no match', () => {
    const newP = {
      name: 'P1', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG', // GFP
      tailSequence: 'A'.repeat(25), tmBinding: 62,
    };
    const old = [{
      name: 'P_old', direction: 'forward',
      bindingSequence: 'ATGAGTATTCAACATTTCC', // AmpR
      tailSequence: 'A'.repeat(25), tmBinding: 62,
    }];
    expect(findCompatiblePrimers(newP, old).length).toBe(0);
  });

  it('no tail primers (verification/sequencing): compatible if same binding', () => {
    const newP = {
      name: 'seq_fwd', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: '', tmBinding: 62,
    };
    const old = [{
      name: 'old_seq', direction: 'forward',
      bindingSequence: 'ATGGTGAGCAAGGGCGAGG',
      tailSequence: '', tmBinding: 61,
    }];
    const matches = findCompatiblePrimers(newP, old);
    expect(matches.length).toBe(1);
  });

  it('order sheet separates correctly', () => {
    const primers = [
      { name: 'P1', sequence: 'ATCGATCG' },
      { name: 'P2', sequence: 'GCTAGCTA', reusedFrom: 'P_old' },
      { name: 'P3', sequence: 'TTTTAAAA' },
    ];
    const sheet = buildOrderSheet(primers, new Set(['P2']));
    expect(sheet).toContain('P1');
    expect(sheet).toContain('P3');
    expect(sheet).toContain('ЗАКАЗАТЬ');
    expect(sheet).toContain('В НАЛИЧИИ');
    expect(sheet).toContain('P_old'); // reusedFrom name
  });
});


// ═══════════════════════════════════════════════════════════
// EDGE CASES AND ROBUSTNESS
// ═══════════════════════════════════════════════════════════

describe('Edge cases and robustness', () => {
  it('translateDNA: empty string → empty', () => {
    expect(translateDNA('')).toBe('');
  });

  it('translateDNA: single nucleotide → empty', () => {
    expect(translateDNA('A')).toBe('');
  });

  it('validateConstruct: empty array → no crash', () => {
    expect(validateConstruct([])).toEqual([]);
  });

  it('validateConstruct: fragment with undefined sequence → no crash', () => {
    const frags = [{ name: 'x', type: 'CDS' }];
    expect(() => validateConstruct(frags)).not.toThrow();
  });

  it('detectSignalPeptide: empty string → no crash', () => {
    expect(() => detectSignalPeptide('')).not.toThrow();
  });

  it('detectHisTag: empty string → null', () => {
    expect(detectHisTag('')).toBeNull();
  });

  it('autoDetectDomains: non-DNA characters → handles gracefully', () => {
    const domains = autoDetectDomains('XXXNNNXXX'.repeat(20), 'test');
    // Should not crash, may return domains with X amino acids
    expect(Array.isArray(domains)).toBe(true);
  });

  it('checkPrimerQuality: empty binding → empty warnings', () => {
    expect(checkPrimerQuality({ bindingSequence: '' })).toEqual([]);
  });

  it('pcrProductSize: missing length and sequence → returns 0', () => {
    expect(pcrProductSize({ needsAmplification: true }, null, null)).toBe(0);
  });

  it('findCompatiblePrimers: empty binding → empty matches', () => {
    expect(findCompatiblePrimers({ bindingSequence: '' }, [{ bindingSequence: 'ATCG' }])).toEqual([]);
  });

  it('findCompatiblePrimers: empty existing list → empty matches', () => {
    expect(findCompatiblePrimers({ bindingSequence: 'ATCG' }, []).length).toBe(0);
  });
});
