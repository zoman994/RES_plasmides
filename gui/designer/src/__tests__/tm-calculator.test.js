/**
 * Tests for SantaLucia 1998 Nearest-Neighbor Tm Calculator.
 * Reference values from primer3-py / NEB Tm Calculator.
 */
import { describe, it, expect } from 'vitest';
import { calcTmNN, calcTm, gcPercent, checkHairpin } from '../tm-calculator';

describe('calcTmNN — SantaLucia 1998 NN model', () => {
  it('returns 0 for sequences shorter than 2 nt', () => {
    expect(calcTmNN('A')).toBe(0);
    expect(calcTmNN('')).toBe(0);
  });

  it('calculates Tm for M13 forward within ±3°C of reference', () => {
    // GTAAAACGACGGCCAGT — M13 forward, primer3/NEB reference ~49-52°C
    const tm = calcTmNN('GTAAAACGACGGCCAGT');
    expect(tm).toBeGreaterThan(48);
    expect(tm).toBeLessThan(55);
  });

  it('calculates Tm for M13 reverse within ±3°C of reference', () => {
    // CAGGAAACAGCTATGAC — M13 reverse, reference ~46°C
    const tm = calcTmNN('CAGGAAACAGCTATGAC');
    expect(tm).toBeGreaterThan(43);
    expect(tm).toBeLessThan(49);
  });

  it('GC-rich primers have higher Tm than AT-rich', () => {
    const gcRich = calcTmNN('GCGCGCGCGCGCGCGCGCGC'); // 100% GC
    const atRich = calcTmNN('ATATATATATATATATATATAT'); // 0% GC
    expect(gcRich).toBeGreaterThan(atRich + 20);
  });

  it('longer primers have higher Tm', () => {
    const short = calcTmNN('ATGCGATCGATCGATCG');  // 17mer
    const long = calcTmNN('ATGCGATCGATCGATCGATCGATCG');  // 25mer
    expect(long).toBeGreaterThan(short);
  });

  it('complement sequences have equal Tm', () => {
    const seq = 'ATGCGATCGATCGATCG';
    const comp = 'CGATCGATCGATCGCAT';
    expect(calcTmNN(seq)).toBeCloseTo(calcTmNN(comp), 0);
  });

  it('respects salt concentration parameter', () => {
    const seq = 'ATGCGATCGATCGATCGATCG';
    const lowSalt = calcTmNN(seq, { naConc: 10 });
    const highSalt = calcTmNN(seq, { naConc: 200 });
    expect(highSalt).toBeGreaterThan(lowSalt);
  });

  it('handles Mg2+ dominant conditions', () => {
    const seq = 'ATGCGATCGATCGATCGATCG';
    const withMg = calcTmNN(seq, { naConc: 10, mgConc: 3.0, dntpConc: 0.2 });
    expect(withMg).toBeGreaterThan(40);
    expect(withMg).toBeLessThan(80);
  });

  it('handles ambiguous bases gracefully', () => {
    const tm = calcTmNN('ATGCNNNGATCGATCG');
    expect(tm).toBeGreaterThan(30);
  });

  // RC-CLOSE-GATE (Игорь 25.06) — a 3 nt AT-rich «overlap» (e.g. a degenerate
  // self-closure seam) underflowed the NN two-state model to ≈ −100 °C: the four
  // terminal-initiation corrections outweigh the single stacking pair and flip the
  // entropy sign. A DNA duplex never melts below 0 °C in any meaningful sense, so a
  // sub-physical result on a very short oligo means «no real duplex» → 0, never a
  // garbage negative that then leaks into the selection-Tm tooltip.
  it('very short oligos never return a wildly negative, unphysical Tm', () => {
    for (const s of ['AT', 'ATG', 'TATA', 'AAATT', 'AAACC']) {
      expect(calcTmNN(s)).toBeGreaterThanOrEqual(0);
    }
    // real primers are unaffected (positive, in the calibrated range)
    expect(calcTmNN('GTAAAACGACGGCCAGT')).toBeGreaterThan(40);
  });
});

describe('gcPercent', () => {
  it('returns 50 for ATGC', () => {
    expect(gcPercent('ATGC')).toBe(50);
  });

  it('returns 100 for all GC', () => {
    expect(gcPercent('GCGCGC')).toBe(100);
  });

  it('returns 0 for all AT', () => {
    expect(gcPercent('ATATAT')).toBe(0);
  });

  it('handles empty string', () => {
    expect(gcPercent('')).toBe(0);
  });
});

describe('checkHairpin', () => {
  it('detects strong hairpin (GC-rich stem ≥5bp)', () => {
    // GCGCG...CGCGC — strong stem, ΔG well below threshold
    expect(checkHairpin('ATGCGCGATTTCGCGCAT')).toBe(true);
  });

  it('detects hairpin in self-complementary sequence', () => {
    // Contains GCCG ... CGGC — 4bp GC-rich stem
    expect(checkHairpin('ATGCCGATATCGGCTA')).toBe(true);
  });

  it('returns false for non-hairpin sequence', () => {
    expect(checkHairpin('ATGATGATGATG')).toBe(false);
  });

  it('rejects weak AT-only 4bp stem (false positive filter)', () => {
    // ATAT...ATAT — 4bp AT-only stem is thermodynamically weak at 60°C
    expect(checkHairpin('ATATGGGGATAT')).toBe(false);
  });

  it('accepts 4bp stem with GC content', () => {
    // GCGC...GCGC — 4bp GC stem is stable enough
    expect(checkHairpin('GCGCTTTTGCGC')).toBe(true);
  });

  it('returns false for empty/short sequences', () => {
    expect(checkHairpin('')).toBe(false);
    expect(checkHairpin('ATGC')).toBe(false);
  });
});

describe('calcTm — drop-in replacement', () => {
  it('is an alias for calcTmNN', () => {
    const seq = 'ATGCGATCGATCGATCGATCG';
    expect(calcTm(seq)).toBe(calcTmNN(seq));
  });
});
