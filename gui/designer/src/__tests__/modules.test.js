import { describe, it, expect, beforeEach } from 'vitest';

// ═══════════ codons.js ═══════════
import { CODON_TABLE, translateDNA, translateCodon, getCodonsForAA, getBestCodon } from '../codons';

describe('codons', () => {
  it('translateDNA translates ATG to M', () => {
    expect(translateDNA('ATG')).toBe('M');
  });

  it('translateDNA handles full ORF', () => {
    expect(translateDNA('ATGGCCTAA')).toBe('MA*');
  });

  it('translateDNA handles lowercase', () => {
    expect(translateDNA('atggcc')).toBe('MA');
  });

  it('translateDNA returns empty for short sequence', () => {
    expect(translateDNA('AT')).toBe('');
  });

  it('translateCodon returns correct amino acid', () => {
    expect(translateCodon('TTT')).toBe('F');
    expect(translateCodon('TGG')).toBe('W');
    expect(translateCodon('TAA')).toBe('*');
  });

  it('getCodonsForAA returns codons sorted by frequency', () => {
    const codons = getCodonsForAA('L', 'E. coli');
    expect(codons.length).toBe(6); // L has 6 codons
    expect(codons[0].codon).toBe('CTG'); // most frequent in E. coli
  });

  it('getBestCodon returns the optimal codon', () => {
    expect(getBestCodon('M')).toBe('ATG'); // only one codon
    expect(getBestCodon('*', 'E. coli')).toBeDefined();
  });

  it('CODON_TABLE has 64 entries', () => {
    expect(Object.keys(CODON_TABLE).length).toBe(64);
  });
});

// ═══════════ theme.js ═══════════
import { getFragColor, isMarker, getColor, darken, FEATURE_COLORS } from '../theme';

describe('theme', () => {
  it('getFragColor returns alternating colors', () => {
    const c0 = getFragColor('CDS', 0);
    const c1 = getFragColor('CDS', 1);
    expect(c0).not.toBe(c1);
    expect(c0).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('getFragColor falls back for unknown type', () => {
    const c = getFragColor('unknown_type', 0);
    expect(c).toBeDefined();
  });

  it('isMarker detects marker keywords', () => {
    expect(isMarker('HygR')).toBe(true);
    expect(isMarker('ampR_cassette')).toBe(true);
    expect(isMarker('pyrG')).toBe(true);
    expect(isMarker('GFP')).toBe(false);
    expect(isMarker('PglaA')).toBe(false);
  });

  it('isMarker handles null/undefined', () => {
    expect(isMarker(null)).toBe(false);
    expect(isMarker(undefined)).toBe(false);
    expect(isMarker('')).toBe(false);
  });

  it('getColor returns marker color for markers', () => {
    expect(getColor({ name: 'HygR', type: 'CDS' })).toBe(FEATURE_COLORS.marker);
  });

  it('darken reduces color brightness', () => {
    expect(darken('#ffffff', 0.5)).toBe('#808080');
    expect(darken('#ff0000', 0.5)).toBe('#800000');
  });

  it('darken handles edge cases', () => {
    expect(darken(null)).toBe('#333'); // returns fallback for invalid input
    expect(darken('#000000', 0.5)).toBe('#000000');
  });
});

// ═══════════ validate.js ═══════════
import { validateConstruct, checkPrimerQuality, pcrProductSize } from '../validate';

describe('validateConstruct', () => {
  it('warns on CDS without ATG', () => {
    const frags = [{ name: 'test', type: 'CDS', sequence: 'GCCGCCGCC' }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('ATG'))).toBe(true);
  });

  it('warns on CDS with frameshift', () => {
    const frags = [{ name: 'test', type: 'CDS', sequence: 'ATGGC' }]; // 5bp, not %3
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('3') || s.includes('рамк'))).toBe(true);
  });

  it('warns on internal stop codon', () => {
    const frags = [{ name: 'test', type: 'CDS', sequence: 'ATGTAAGCC' }]; // TAA at pos 4
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('стоп-кодон') || s.includes('stop'))).toBe(true);
  });

  it('warns on CDS without stop codon at end', () => {
    const frags = [{ name: 'test', type: 'CDS', sequence: 'ATGGCCGCC' }]; // no stop
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('стоп') && s.includes('конце'))).toBe(true);
  });

  it('no false positives for valid CDS', () => {
    const frags = [{ name: 'ok', type: 'CDS', sequence: 'ATGGCCTAA' }]; // ATG...TAA, %3
    const w = validateConstruct(frags);
    // Should not have ATG or frameshift warnings
    expect(w.filter(s => s.includes('ATG') || s.includes('рамк')).length).toBe(0);
  });

  it('warns on CDS after non-promoter', () => {
    const frags = [
      { name: 'TtrpC', type: 'terminator', sequence: 'AAAA' },
      { name: 'GFP', type: 'CDS', sequence: 'ATGGCCTAA' },
    ];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('промотор'))).toBe(true);
  });

  it('warns on flipped promoter', () => {
    const frags = [{ name: 'P', type: 'promoter', strand: -1, sequence: 'AAAA' }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('обратной ориентации'))).toBe(true);
  });

  it('warns on flipped terminator', () => {
    const frags = [{ name: 'T', type: 'terminator', strand: -1, sequence: 'AAAA' }];
    const w = validateConstruct(frags);
    expect(w.some(s => s.includes('перевёрнут'))).toBe(true);
  });

  it('returns empty for non-CDS fragments', () => {
    const frags = [{ name: 'P', type: 'promoter', sequence: 'AAAA' }];
    const w = validateConstruct(frags);
    // No CDS-specific warnings
    expect(w.filter(s => s.includes('ATG') || s.includes('стоп')).length).toBe(0);
  });
});

describe('checkPrimerQuality', () => {
  it('warns on self-complementary 3 end', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCGATCGCGATCGAT' });
    expect(w.some(s => s.includes('самокомплементарность') || s.includes('complementary'))).toBe(true);
  });

  it('warns on no GC clamp', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCGATCGAA' });
    expect(w.some(s => s.includes('GC'))).toBe(true);
  });

  it('warns on homopolymer run', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCGAAAAAAT' });
    expect(w.some(s => s.includes('омополимер') || s.includes('Homopolymer'))).toBe(true);
  });

  it('warns on very long primer', () => {
    const w = checkPrimerQuality({ bindingSequence: 'ATCG'.repeat(5), length: 60 });
    expect(w.some(s => s.includes('55') || s.includes('длинный') || s.includes('PAGE'))).toBe(true);
  });

  it('returns empty for good primer', () => {
    // Good primer: ends with GC (clamp), no self-comp, no homopolymer
    const w = checkPrimerQuality({ bindingSequence: 'ACGTACGTACGTACGTACGC' });
    expect(w.length).toBe(0);
  });
});

describe('pcrProductSize', () => {
  it('calculates with both junctions', () => {
    const frag = { length: 1000, needsAmplification: true };
    const left = { overlapLength: 15 };
    const right = { overlapLength: 15 };
    expect(pcrProductSize(frag, left, right)).toBe(1030);
  });

  it('returns null if no amplification', () => {
    const frag = { length: 1000, needsAmplification: false };
    expect(pcrProductSize(frag, null, null)).toBeNull();
  });

  it('handles missing junctions', () => {
    const frag = { length: 500, needsAmplification: true };
    expect(pcrProductSize(frag, null, null)).toBe(500);
  });
});

// ═══════════ domain-detection.js ═══════════
import { detectSignalPeptide, detectHisTag, detectLinkers, autoDetectDomains, DOMAIN_COLORS } from '../domain-detection';

describe('domain-detection', () => {
  it('detectSignalPeptide finds hydrophobic N-terminus', () => {
    // Typical signal peptide: Met + hydrophobic stretch
    const sp = 'MSFRSLLALSGLVCTGLANVISKRATL' + 'E'.repeat(200);
    const result = detectSignalPeptide(sp);
    expect(result.found).toBe(true);
    expect(result.cleavageSite).toBeGreaterThanOrEqual(15);
    expect(result.cleavageSite).toBeLessThanOrEqual(35);
  });

  it('detectSignalPeptide rejects non-secreted protein', () => {
    const cytoplasmic = 'MEEEEKKKDDDDEEEEKKKKDDDD' + 'A'.repeat(200);
    const result = detectSignalPeptide(cytoplasmic);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('detectHisTag finds 6xHis', () => {
    const prot = 'MGSSHHHHHH' + 'A'.repeat(100);
    const result = detectHisTag(prot);
    expect(result).not.toBeNull();
    expect(result.startAA).toBe(5);
    expect(result.endAA).toBe(10);
    expect(result.length).toBe(6);
  });

  it('detectHisTag finds 10xHis', () => {
    const prot = 'A'.repeat(50) + 'HHHHHHHHHH' + 'A'.repeat(50);
    const result = detectHisTag(prot);
    expect(result).not.toBeNull();
    expect(result.length).toBe(10);
  });

  it('detectHisTag returns null when no His-tag', () => {
    expect(detectHisTag('MAAACCCDDDEEE')).toBeNull();
  });

  it('detectLinkers finds S/T/P/G-rich regions', () => {
    const prot = 'A'.repeat(50) + 'SSTPGSSTPGSSTPGSSTPG' + 'A'.repeat(50);
    const linkers = detectLinkers(prot);
    expect(linkers.length).toBeGreaterThanOrEqual(1);
  });

  it('autoDetectDomains returns array with at least one domain', () => {
    const dna = 'ATG' + 'GCC'.repeat(100) + 'TAA';
    const domains = autoDetectDomains(dna, 'TestGene');
    expect(domains.length).toBeGreaterThanOrEqual(1);
    // Each domain has required fields
    domains.forEach(d => {
      expect(d.name).toBeDefined();
      expect(d.type).toBeDefined();
      expect(d.startAA).toBeGreaterThanOrEqual(1);
      expect(d.endAA).toBeGreaterThanOrEqual(d.startAA);
      expect(d.color).toMatch(/^#/);
    });
  });

  it('autoDetectDomains covers full protein length', () => {
    const dna = 'ATG' + 'GCC'.repeat(50) + 'TAA';
    const domains = autoDetectDomains(dna, 'Test');
    const protLen = Math.floor(dna.length / 3);
    // Domains should cover from 1 to protLen without gaps
    const covered = new Set();
    domains.forEach(d => {
      for (let i = d.startAA; i <= d.endAA; i++) covered.add(i);
    });
    for (let i = 1; i <= protLen; i++) {
      expect(covered.has(i)).toBe(true);
    }
  });

  it('DOMAIN_COLORS has all required types', () => {
    expect(DOMAIN_COLORS.signal).toBeDefined();
    expect(DOMAIN_COLORS.domain).toBeDefined();
    expect(DOMAIN_COLORS.linker).toBeDefined();
    expect(DOMAIN_COLORS.tag).toBeDefined();
  });
});

// ═══════════ primer-reuse.js ═══════════
import { findCompatiblePrimers, buildOrderSheet } from '../primer-reuse';

describe('primer-reuse', () => {
  it('findCompatiblePrimers matches identical primer', () => {
    const tail = 'A'.repeat(25); // must be >= minOverlap (20)
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: tail, tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: tail, tmBinding: 60 }];
    const matches = findCompatiblePrimers(newP, existing);
    expect(matches.length).toBe(1);
    expect(matches[0].reason).toContain('совпадение');
  });

  it('findCompatiblePrimers matches shorter tail if >= minOverlap', () => {
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: 'A'.repeat(30), tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: 'A'.repeat(25), tmBinding: 60 }];
    const matches = findCompatiblePrimers(newP, existing, { minOverlap: 20 });
    expect(matches.length).toBe(1);
  });

  it('findCompatiblePrimers rejects too short tail', () => {
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: 'A'.repeat(30), tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: 'A'.repeat(10), tmBinding: 60 }];
    const matches = findCompatiblePrimers(newP, existing, { minOverlap: 20 });
    expect(matches.length).toBe(0);
  });

  it('findCompatiblePrimers rejects different binding', () => {
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: '', tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'forward', bindingSequence: 'GCTAGCTAGCTA', tailSequence: '', tmBinding: 60 }];
    expect(findCompatiblePrimers(newP, existing).length).toBe(0);
  });

  it('findCompatiblePrimers rejects different direction', () => {
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: '', tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'reverse', bindingSequence: 'ATCGATCGATCG', tailSequence: '', tmBinding: 60 }];
    expect(findCompatiblePrimers(newP, existing).length).toBe(0);
  });

  it('findCompatiblePrimers rejects Tm too different', () => {
    const newP = { name: 'P1', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: '', tmBinding: 60 };
    const existing = [{ name: 'P_old', direction: 'forward', bindingSequence: 'ATCGATCGATCG', tailSequence: '', tmBinding: 70 }];
    expect(findCompatiblePrimers(newP, existing, { maxTmDiff: 3 }).length).toBe(0);
  });

  it('buildOrderSheet separates new from reused', () => {
    const primers = [
      { name: 'P1', sequence: 'ATCG' },
      { name: 'P2', sequence: 'GCTA' },
    ];
    const reused = new Set(['P2']);
    const sheet = buildOrderSheet(primers, reused);
    expect(sheet).toContain('ЗАКАЗАТЬ');
    expect(sheet).toContain('В НАЛИЧИИ');
    expect(sheet).toContain('P1');
  });
});

// ═══════════ part-descriptions.js ═══════════
import { getPartDescription, PART_DESCRIPTIONS } from '../part-descriptions';

describe('part-descriptions', () => {
  it('getPartDescription returns exact match', () => {
    const desc = getPartDescription('AmpR', 'marker');
    expect(desc.short).toContain('Ампициллин');
  });

  it('getPartDescription does fuzzy match', () => {
    const desc = getPartDescription('pUC ori region', 'rep_origin');
    expect(desc.short).toContain('копий');
  });

  it('getPartDescription returns generic for unknown', () => {
    const desc = getPartDescription('UnknownXYZ', 'CDS');
    expect(desc.short).toContain('UnknownXYZ');
  });

  it('getPartDescription handles null', () => {
    const desc = getPartDescription(null, null);
    expect(desc.short).toBeDefined();
  });

  it('PART_DESCRIPTIONS has entries for common parts', () => {
    expect(PART_DESCRIPTIONS['AmpR']).toBeDefined();
    expect(PART_DESCRIPTIONS['ori']).toBeDefined();
    expect(PART_DESCRIPTIONS['PglaA']).toBeDefined();
    expect(PART_DESCRIPTIONS['EGFP']).toBeDefined();
  });
});
