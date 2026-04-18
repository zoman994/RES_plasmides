import { describe, it, expect } from 'vitest';
import { detectORFs } from '../orf-detection';

// Helper: build a CDS of given length in amino acids (ATG + codons + stop)
function buildCDS(aaLen) {
  return 'ATG' + 'GCC'.repeat(aaLen - 1) + 'TAA';
}

// Helper: reverse complement
function revComp(seq) {
  const rc = { A: 'T', T: 'A', G: 'C', C: 'G' };
  return seq.split('').reverse().map(c => rc[c] || 'N').join('');
}

describe('detectORFs', () => {
  it('finds a single large ORF (200 aa)', () => {
    const cds = buildCDS(200); // 603 nt
    const flanking = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';
    const sequence = flanking + cds + flanking;
    const results = detectORFs(sequence, []);

    expect(results.length).toBeGreaterThanOrEqual(1);
    const orf = results.find(r => r.name.includes('200 aa'));
    expect(orf).toBeDefined();
    expect(orf.type).toBe('CDS');
    expect(orf.level).toBe('region');
    expect(orf.detector).toBe('orf_scan');
    expect(orf.source).toBe('orf_detection');
    expect(orf.confidence).toBe(0.7); // 200 is not > 200, so 0.7
  });

  it('high confidence for ORF > 200 aa', () => {
    const cds = buildCDS(250);
    const results = detectORFs(cds, []);
    const orf = results.find(r => r.name.includes('250 aa'));
    expect(orf).toBeDefined();
    expect(orf.confidence).toBe(0.9);
  });

  it('medium confidence for 150 < aaLen <= 200', () => {
    const cds = buildCDS(180);
    const results = detectORFs(cds, []);
    const orf = results.find(r => r.name.includes('180 aa'));
    expect(orf).toBeDefined();
    expect(orf.confidence).toBe(0.7);
  });

  it('low confidence for 100 <= aaLen <= 150', () => {
    const cds = buildCDS(120);
    const results = detectORFs(cds, []);
    const orf = results.find(r => r.name.includes('120 aa'));
    expect(orf).toBeDefined();
    expect(orf.confidence).toBe(0.5);
  });

  it('does not find ORFs shorter than minAA (100)', () => {
    const cds = buildCDS(50);
    const results = detectORFs(cds, [], 100);
    expect(results.length).toBe(0);
  });

  it('respects custom minAA parameter', () => {
    const cds = buildCDS(50);
    const results = detectORFs(cds, [], 30);
    const orf = results.find(r => r.name.includes('50 aa'));
    expect(orf).toBeDefined();
  });

  it('does not duplicate existing CDS regions', () => {
    const cds = buildCDS(200);
    const existing = [{
      name: 'AmpR',
      type: 'marker',
      start: 0,
      end: cds.length,
      level: 'region',
    }];
    const results = detectORFs(cds, existing);
    // Should find 0 ORFs because the existing marker covers the same region
    expect(results.length).toBe(0);
  });

  it('finds ORF on reverse strand', () => {
    const cds = buildCDS(150);
    const rcCds = revComp(cds);
    const flanking = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';
    const sequence = flanking + rcCds + flanking;
    const results = detectORFs(sequence, []);

    // Should find at least one ORF on strand -1
    const reverseOrfs = results.filter(r => r.strand === -1);
    expect(reverseOrfs.length).toBeGreaterThanOrEqual(1);
  });

  it('limits to 6 ORFs max', () => {
    // Create 8 non-overlapping ORFs
    const spacer = 'GCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGCGC';
    const parts = [];
    for (let i = 0; i < 8; i++) {
      parts.push(spacer + buildCDS(110 + i * 10) + spacer);
    }
    const sequence = parts.join('');
    const results = detectORFs(sequence, []);
    expect(results.length).toBeLessThanOrEqual(6);
  });

  it('returns annotations with correct structure', () => {
    const cds = buildCDS(200);
    const results = detectORFs(cds, []);
    expect(results.length).toBeGreaterThanOrEqual(1);

    const orf = results[0];
    expect(orf).toHaveProperty('id');
    expect(orf).toHaveProperty('name');
    expect(orf).toHaveProperty('type', 'CDS');
    expect(orf).toHaveProperty('start');
    expect(orf).toHaveProperty('end');
    expect(orf).toHaveProperty('strand');
    expect(orf).toHaveProperty('level', 'region');
    expect(orf).toHaveProperty('auto', true);
    expect(orf).toHaveProperty('confidence');
    expect(orf).toHaveProperty('detector', 'orf_scan');
    expect(orf).toHaveProperty('source', 'orf_detection');
    expect(orf.name).toMatch(/^ORF \(\d+ aa\)$/);
  });

  it('handles null existingAnnotations gracefully', () => {
    const cds = buildCDS(150);
    const results = detectORFs(cds, null);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for sequence with no ORFs', () => {
    // Poly-GC — no ATG or stop codons in frame
    const sequence = 'GC'.repeat(500);
    const results = detectORFs(sequence, []);
    expect(results.length).toBe(0);
  });
});
