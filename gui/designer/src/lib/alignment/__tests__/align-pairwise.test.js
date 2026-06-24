import { describe, it, expect } from 'vitest';
import { alignPairwise, basesCompatible } from '../align-pairwise';
import { reverseComplement } from '../../../sequence-utils';

function ungap(s) { return s.replace(/-/g, ''); }

describe('basesCompatible', () => {
  it('exact + IUPAC + N', () => {
    expect(basesCompatible('A', 'A')).toBe(true);
    expect(basesCompatible('A', 'G')).toBe(false);
    expect(basesCompatible('N', 'A')).toBe(true);
    expect(basesCompatible('R', 'A')).toBe(true); // R = A/G
    expect(basesCompatible('R', 'C')).toBe(false);
  });
});

describe('alignPairwise — local clips dissimilar flanks (no «сова на глобус»)', () => {
  // A shared homologous core flanked by divergent ends on each side.
  const core = 'ATGCCGTTAGGCATCCGATTACGGATCCGTTAACGGCAT'; // 39 bp, identical in both
  // Flanks at ~50% identity — the trap zone: positive score at match+2/mismatch−1
  // (so a lenient local aligner threads right through them), negative at −3.
  const flA = 'AACC'.repeat(8); // 32 bp
  const flB = 'AAGG'.repeat(8); // 32 bp — AA matches, CC vs GG mismatches → 50%
  const A = flA + core + flA;
  const B = flB + core + flB;

  it('stiff mismatch clips to the core; lenient over-extends through the flanks', () => {
    const strict = alignPairwise(A, B, { mode: 'local', match: 2, mismatch: -3, gapOpen: -6, gapExtend: -1 });
    const lenient = alignPairwise(A, B, { mode: 'local', match: 2, mismatch: -1, gapOpen: -5, gapExtend: -1 });
    // strict ≈ the 39-bp core (near-identical), NOT end-to-end
    expect(strict.alignedLength).toBeLessThan(60);
    expect(strict.identity).toBeGreaterThan(90);
    // lenient threads through the divergent flanks → much longer, low-identity match
    expect(lenient.alignedLength).toBeGreaterThan(strict.alignedLength);
    expect(strict.identity).toBeGreaterThan(lenient.identity);
  });
});

describe('alignPairwise — global', () => {
  it('identical sequences → 100% identity, no gaps', () => {
    const r = alignPairwise('ACGTACGT', 'ACGTACGT');
    expect(r.identity).toBe(100);
    expect(r.gaps).toBe(0);
    expect(r.alignedA).toBe('ACGTACGT');
    expect(r.alignedB).toBe('ACGTACGT');
    expect(r.strand).toBe('forward');
  });

  it('single substitution → 1 mismatch, equal length', () => {
    const r = alignPairwise('ACGTACGT', 'ACGAACGT');
    expect(r.mismatches).toBe(1);
    expect(r.gaps).toBe(0);
    expect(r.alignedA.length).toBe(8);
  });

  it('insertion in B → one gap in A, sequences preserved', () => {
    const r = alignPairwise('ACGTACGT', 'ACGTTACGT');
    expect(r.gaps).toBe(1);
    expect(ungap(r.alignedA)).toBe('ACGTACGT');
    expect(ungap(r.alignedB)).toBe('ACGTTACGT');
    expect(r.alignedA).toContain('-');
    expect(r.alignedB).not.toContain('-');
  });

  it('deletion in B → one gap in B', () => {
    const r = alignPairwise('ACGTTACGT', 'ACGTACGT');
    expect(r.gaps).toBe(1);
    expect(r.alignedB).toContain('-');
    expect(r.alignedA).not.toContain('-');
    expect(ungap(r.alignedB)).toBe('ACGTACGT');
  });

  it('IUPAC N aligns as a match, not a mismatch', () => {
    const r = alignPairwise('ACGTACGT', 'ACGNACGT');
    expect(r.mismatches).toBe(0);
    expect(r.identity).toBe(100);
  });

  it('unrelated short-vs-long sequences report LOW identity (not ~100%)', () => {
    // a 12bp seq embedded in a 60bp one: global identity over the full
    // alignment must stay low, never inflated by trimming the flanking gaps.
    const a = 'ACGTACGTACGT';
    const b = 'TTTTTTTTTTTTTTTTTTTTTTTTACGTACGTACGTGGGGGGGGGGGGGGGGGGGGGGGG';
    const r = alignPairwise(a, b, { mode: 'global' });
    expect(r.identity).toBeLessThan(40);
  });

  it('reports coverage per side — a local hit covers the short seq fully, the long one partially', () => {
    const a = 'CTCTCTCTCTCT'; // 12 bp, contains no A → flanks below cannot extend the hit
    const b = `AAAAAAAAAAAAAAAAAAAAAAAA${a}AAAAAAAAAAAAAAAAAAAAAAAA`; // 60 bp
    const r = alignPairwise(a, b, { mode: 'local' });
    expect(r.coverageA).toBeCloseTo(100, 0);
    expect(r.coverageB).toBeLessThan(30);
    expect(r.identity).toBe(100); // the matched region itself is a perfect hit
  });
});

describe('alignPairwise — semiglobal (read vs reference)', () => {
  it('short read maps inside a longer reference with no terminal gaps', () => {
    const ref = 'TTTTTTACGTACGTACGTGGGGGG';
    const read = 'ACGTACGTACGT';
    const r = alignPairwise(ref, read, { mode: 'semiglobal' });
    expect(r.identity).toBe(100);
    expect(r.alignedA).not.toMatch(/^-/);
    expect(r.alignedA).not.toMatch(/-$/);
    expect(ungap(r.alignedB)).toBe(read);
    expect(r.bStart).toBe(0);
    expect(r.aStart).toBe(6); // read starts at ref index 6
  });
});

describe('alignPairwise — local', () => {
  it('returns only the matching subregion', () => {
    const a = 'GGGGGACGTACGTCCCCC';
    const b = 'TTTTTACGTACGTAAAAA';
    const r = alignPairwise(a, b, { mode: 'local' });
    expect(ungap(r.alignedA)).toBe('ACGTACGT');
    expect(ungap(r.alignedB)).toBe('ACGTACGT');
    expect(r.identity).toBe(100);
  });
});

describe('alignPairwise — reverse complement detection', () => {
  it('detects reverse strand when B is revcomp of A', () => {
    const a = 'ATGGGCCCAAATTTCCGACGTACAG'; // non-palindromic
    const b = reverseComplement(a);
    const r = alignPairwise(a, b, { tryRevComp: true });
    expect(r.strand).toBe('reverse');
    expect(r.identity).toBe(100);
  });

  it('keeps forward strand when forward already matches', () => {
    const a = 'ATGGGCCCAAATTTCCGACGTACAG';
    const r = alignPairwise(a, a, { tryRevComp: true });
    expect(r.strand).toBe('forward');
  });
});

describe('alignPairwise — guards', () => {
  it('empty input returns a safe empty result with a warning', () => {
    const r = alignPairwise('', 'ACGT');
    expect(r.alignedA).toBe('');
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.identity).toBe(0);
  });
});

describe('alignPairwise — banded matches full DP', () => {
  it('forced banded alignment equals full DP on a medium pair', () => {
    let a = '';
    for (let i = 0; i < 300; i++) a += 'ACGT'[(i * 7 + 3) % 4];
    // b = a with a couple substitutions + a short insertion
    let b = a.slice(0, 120) + 'AC' + a.slice(120);
    b = b.slice(0, 50) + (b[50] === 'A' ? 'C' : 'A') + b.slice(51);
    const full = alignPairwise(a, b, { mode: 'global' });
    const banded = alignPairwise(a, b, { mode: 'global', band: 40 });
    expect(banded.score).toBe(full.score);
    expect(banded.alignedA).toBe(full.alignedA);
    expect(banded.alignedB).toBe(full.alignedB);
    expect(banded.banded).toBe(true);
  });
});
