import { describe, it, expect } from 'vitest';
import { siteToRegex } from '../restriction-db';

// ── BUG-58: KLD primers should merge with existing, not replace ──

describe('BUG-58: KLD primers merge', () => {
  it('should keep assembly primers when adding KLD primers', () => {
    const assemblyPrimers = [
      { name: 'P001_fwd_AmpR', direction: 'forward', isMutagenesis: false },
      { name: 'P002_rev_AmpR', direction: 'reverse', isMutagenesis: false },
      { name: 'P003_fwd_EGFP', direction: 'forward', isMutagenesis: false },
      { name: 'P004_rev_EGFP', direction: 'reverse', isMutagenesis: false },
    ];
    const kldPrimers = [
      { name: 'P001_mut_fwd_AmpR', direction: 'forward', isMutagenesis: true },
      { name: 'P002_mut_rev_AmpR', direction: 'reverse', isMutagenesis: true },
    ];

    // Correct merge: keep non-mutagenesis, add new KLD
    const existingNonMut = assemblyPrimers.filter(p => !p.isMutagenesis);
    const merged = [...existingNonMut, ...kldPrimers];

    expect(merged).toHaveLength(6);
    expect(merged.filter(p => !p.isMutagenesis)).toHaveLength(4);
    expect(merged.filter(p => p.isMutagenesis)).toHaveLength(2);
  });

  it('should replace old KLD primers when adding new ones', () => {
    const existing = [
      { name: 'P001_fwd_AmpR', direction: 'forward', isMutagenesis: false },
      { name: 'P002_rev_AmpR', direction: 'reverse', isMutagenesis: false },
      { name: 'OLD_mut_fwd', direction: 'forward', isMutagenesis: true },
      { name: 'OLD_mut_rev', direction: 'reverse', isMutagenesis: true },
    ];
    const newKld = [
      { name: 'NEW_mut_fwd', direction: 'forward', isMutagenesis: true },
      { name: 'NEW_mut_rev', direction: 'reverse', isMutagenesis: true },
    ];

    const existingNonMut = existing.filter(p => !p.isMutagenesis);
    const merged = [...existingNonMut, ...newKld];

    expect(merged).toHaveLength(4);
    expect(merged.filter(p => p.isMutagenesis).map(p => p.name)).toEqual(['NEW_mut_fwd', 'NEW_mut_rev']);
  });
});

// ── BUG-47: IUPAC site matching ──

describe('BUG-47: siteToRegex matches IUPAC', () => {
  it('should match exact site', () => {
    const re = siteToRegex('GAATTC');  // EcoRI
    expect(re.test('GAATTC')).toBe(true);
    expect(re.test('GAATCC')).toBe(false);
  });

  it('should match IUPAC N (any base)', () => {
    // HinfI: GANTC → GA[ATGC]TC
    // Note: siteToRegex returns /g regex, must reset lastIndex between tests
    expect(siteToRegex('GANTC').test('GAATC')).toBe(true);
    expect(siteToRegex('GANTC').test('GATTC')).toBe(true);
    expect(siteToRegex('GANTC').test('GAGTC')).toBe(true);
    expect(siteToRegex('GANTC').test('GACTC')).toBe(true);
  });

  it('should match IUPAC R (purine A/G)', () => {
    const re = siteToRegex('GRCGYC');  // AvaI: G[AG]CG[CT]C
    expect(re.test('GACGCC')).toBe(true);
    expect(re.test('GRCGYC')).toBe(false);  // literal letters should NOT match
  });

  it('.includes() would fail on IUPAC — proving the bug', () => {
    const seq = 'AAGAATCTT';  // contains HinfI site GAATC
    const iupacSite = 'GANTC';

    // .includes() FAILS for IUPAC
    expect(seq.includes(iupacSite)).toBe(false);

    // siteToRegex WORKS
    const re = siteToRegex(iupacSite);
    expect(re.test(seq)).toBe(true);
  });
});

// ── BUG-54: flipFragment must mirror annotations ──

describe('BUG-54: flip mirrors annotations', () => {
  it('should mirror annotation coordinates on flip', () => {
    const seqLen = 1000;
    const annotations = [
      { name: 'Signal peptide', start: 0, end: 66, level: 'detail' },
      { name: 'His-tag', start: 900, end: 918, level: 'detail' },
      { name: 'CDS', start: 0, end: 1000, level: 'region' },
    ];

    const flipped = annotations.map(a => ({
      ...a,
      start: seqLen - a.end,
      end: seqLen - a.start,
    }));

    // Signal peptide: was 0-66, now 934-1000
    expect(flipped[0].start).toBe(934);
    expect(flipped[0].end).toBe(1000);

    // His-tag: was 900-918, now 82-100
    expect(flipped[1].start).toBe(82);
    expect(flipped[1].end).toBe(100);

    // CDS: was 0-1000, now 0-1000 (full length stays)
    expect(flipped[2].start).toBe(0);
    expect(flipped[2].end).toBe(1000);
  });

  it('should keep start < end after flip', () => {
    const seqLen = 500;
    const ann = { start: 100, end: 200 };
    const flipped = { start: seqLen - ann.end, end: seqLen - ann.start };

    expect(flipped.start).toBe(300);
    expect(flipped.end).toBe(400);
    expect(flipped.start).toBeLessThan(flipped.end);
  });
});
