import { describe, it, expect } from 'vitest';
import { calcTmNN } from '../tm-calculator';
import { checkInternalSites } from '../golden-gate';
import { detectORFs } from '../orf-detection';
import { reverseComplement } from '../sequence-utils';
import { designPrimersLocal } from '../local-primer-design';

describe('QA fix-pack #1', () => {
  describe('C8 — Golden Gate checkInternalSites reports ALL sites, not just the first', () => {
    it('flags both internal BsaI sites in a fragment', () => {
      const seq = `AAA${'GGTCTC'}TTTTTTTT${'GGTCTC'}AAA`; // two GGTCTC sites
      const r = checkInternalSites([{ name: 'f1', sequence: seq }], 'BsaI');
      expect(r.ok).toBe(false);
      const fwd = r.problems.filter((p) => p.strand === '+');
      expect(fwd).toHaveLength(2); // both, not just indexOf's first
      expect(fwd.map((p) => p.position)).toEqual([4, 18]);
    });
  });

  describe('C1/C5 — ORF dedup is strand-aware (opposite-strand genes survive)', () => {
    it('a reverse-strand ORF is NOT filtered by a forward CDS at the same locus', () => {
      const S = reverseComplement('ATGAAACCCGGGTAA'); // reverse strand carries M-K-P-G-*
      const noAnn = detectORFs(S, [], 4);
      const revOrf = noAnn.find((o) => o.strand === -1);
      expect(revOrf).toBeTruthy();
      const fwdCds = { level: 'region', type: 'CDS', start: revOrf.start, end: revOrf.end, strand: 1 };
      const withAnn = detectORFs(S, [fwdCds], 4);
      expect(withAnn.some((o) => o.strand === -1)).toBe(true); // survives (different gene)
    });
  });

  describe('C18 — RE-ligation junction without enzyme warns instead of a silent empty tail', () => {
    it('pushes a warning when a re_ligation junction has no enzyme', () => {
      const frags = [
        { name: 'a', sequence: 'ATGC'.repeat(20), needsAmplification: true },
        { name: 'b', sequence: 'GGCC'.repeat(20), needsAmplification: true },
      ];
      const res = designPrimersLocal(frags, [{ type: 're_ligation' }], false, {});
      expect(res.warnings.some((w) => /RE-лигирование без выбранного фермента/.test(w))).toBe(true);
    });
  });

  describe('Tm cluster — C6 (Mg alive), C4 (naConc=0 guard), C17 (degenerate)', () => {
    const seq = 'ATGCGATCGTAGCTAGCTAG'; // 20-mer

    it('C6 — Mg²⁺ raises Tm in the PCR range, monotonically, no discontinuity', () => {
      const tm0 = calcTmNN(seq, { mgConc: 0 });
      const tm3 = calcTmNN(seq, { mgConc: 3 });
      const tm6 = calcTmNN(seq, { mgConc: 6 });
      expect(tm3).toBeGreaterThan(tm0); // Mg correction no longer dead
      expect(tm6).toBeGreaterThan(tm3); // monotonic
      expect(Math.abs(calcTmNN(seq, { mgConc: 3 }) - calcTmNN(seq, { mgConc: 3.05 }))).toBeLessThan(1);
      expect(tm3).toBeGreaterThan(45);
      expect(tm3).toBeLessThan(80);
    });

    it('C4 — naConc=0 does not blow up to −273 °C', () => {
      const t = calcTmNN(seq, { naConc: 0, mgConc: 0 });
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(-50);
    });

    it('C17 — degenerate bases are not silently stripped to a 0 Tm', () => {
      const t = calcTmNN('NNNNNNNNNN');
      expect(Number.isFinite(t)).toBe(true);
      expect(t).not.toBe(0);
    });

    it('short oligos stay finite (no NaN/Infinity)', () => {
      expect(Number.isFinite(calcTmNN('AT'))).toBe(true);
      expect(Number.isFinite(calcTmNN('ATGC'))).toBe(true);
    });
  });
});
