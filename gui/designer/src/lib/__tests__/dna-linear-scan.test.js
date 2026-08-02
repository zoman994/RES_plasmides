/**
 * dna-linear-scan.test.js — SCAN responsibility of the EXPERIMENTAL linear/Dinkelbach kernel:
 * candidate-end production (src/lib/dna-linear-scan.js — encodeQuery/encodeTarget, MyersScanner,
 * windowAccept). Spec: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.1, §4.2, §4.2.1(2), §4.2.1(4).
 *
 * WHAT IS PROVEN HERE. A corrupted candidate-end list silently DROPS real hits, so every case
 * asserts the hit is FOUND and fully correct — not merely that nothing crashed. The 32-bit block
 * boundaries and the "a perfect seed is not a hit / a hit with no surviving seed is still found"
 * pair both live on this side of the split.
 *
 * COMPARISON DISCIPLINE. Full-occurrence comparison via shape() from helpers/dna-linear-fixtures.js
 * — never identity alone. The oracle is deliberately NOT imported here; differential coverage lives
 * in dna-linear-differential.test.js, and the §3.2.1 plateau narrative in dna-linear-kernel.test.js.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-scan.test.js
 */

import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';
import { shapes, lcg, randDna } from './helpers/dna-linear-fixtures';

describe('EXPERIMENTAL kernel §4.2.1(4) — block-vector Myers boundaries', () => {
  // 32-bit blocks: 31/32/33 crosses the first boundary, 63/64/65 the second. Each case asserts
  // the hit is FOUND and fully correct, not merely that nothing crashed.
  //
  // SCOPE, measured in U0 — do not overstate what these cases prove. They run through
  // findOccurrences, so they only see corruption that DROPS candidate ends. Setting the last
  // block's score bit to 31 (the classic block-Myers bug) leaves all 50 tests GREEN, because
  // that corruption under-states Score and therefore ADDS ends, which the verifier absorbs.
  // A guard on the scanner arithmetic itself needs an assertion on MyersScanner.scan() output;
  // U3 owns adding it. See the banner in dna-linear-scan.js.
  const rnd = lcg(20260719);
  const FLANK = randDna(rnd, 40);
  const TAIL = randDna(rnd, 40);

  for (const m of [31, 32, 33, 63, 64, 65]) {
    const probe = randDna(lcg(1000 + m), m);
    const target = FLANK + probe + TAIL;

    it(`m=${m} exact -> 100% at start 40, span ${m}`, () => {
      const got = findOccurrences(probe, target, { thresholdBps: 8000, bothStrands: false });
      expect(shapes(got), `m=${m}`).toEqual([
        `+|s=40|span=${m}|e=${40 + m}|M=${m}|X=0|I=0|D=0|ev=0|L=${m}|bps=10000|${'='.repeat(m)}`,
      ]);
    });

    it(`m=${m} one edit at the last block boundary -> found, exactly one edit`, () => {
      // Position m-1 lives in the LAST block, i.e. exactly at the padded bit region.
      // The assertion deliberately does NOT pin which single-edit explanation wins: when the
      // flipped base happens to equal the first TAIL base, explaining it as one deletion gives
      // M/L = m/(m+1), which strictly beats the substitution's (m-1)/m, and §3.2 rule 1 then
      // REQUIRES the deletion. What must hold regardless is that the candidate scan did not
      // lose the locus and that the optimum costs exactly one edit.
      const arr = probe.split('');
      arr[m - 1] = arr[m - 1] === 'A' ? 'C' : 'A';
      const q = arr.join('');
      const got = findOccurrences(q, target, { thresholdBps: 8000, bothStrands: false });
      expect(got.length, `m=${m} edit at the last position must still be found`).toBe(1);
      expect(got[0].start, `m=${m}`).toBe(40);
      const edits = got[0].alignmentLength - got[0].M;
      expect(edits, `m=${m} the optimum must cost exactly one edit`).toBe(1);
      expect(got[0].M, `m=${m}`).toBeGreaterThanOrEqual(m - 1);
      expect(got[0].identityBps, `m=${m}`)
        .toBeGreaterThanOrEqual(Math.floor(((m - 1) * 10000) / m));
    });

    it(`m=${m} one extra target base -> found with exactly one D`, () => {
      const target2 = `${FLANK + probe.slice(0, 5)}G${probe.slice(5)}${TAIL}`;
      const got = findOccurrences(probe, target2, { thresholdBps: 8000, bothStrands: false });
      expect(got.length, `m=${m} single deletion must survive the block boundary`).toBe(1);
      expect([got[0].M, got[0].D, got[0].alignmentLength]).toEqual([m, 1, m + 1]);
      expect(got[0].gapEvents).toBe(1);
    });
  }
});

describe('EXPERIMENTAL kernel §2.1 — the whole query must align', () => {
  it('§6.1 a perfect short seed of a long query is NOT a hit', () => {
    // 6 of 12 query bases match perfectly; identity is 50%, far under 80%.
    expect(findOccurrences('ACGTACGGGGGG', 'ACGTACTTTTTT', {
      thresholdBps: 8000, bothStrands: false,
    })).toEqual([]);
  });

  it('§6.1(11) an 83% hit with NO surviving exact 8-mer is still found', () => {
    // Substitutions at positions 4 and 8 break every 8-mer of the 12-mer.
    const got = findOccurrences('ACGTTGCAATCG', 'ACGTAGCACTCG', {
      thresholdBps: 8000, bothStrands: false,
    });
    expect(got.length, 'exact-seed-only routing is forbidden by §4.2').toBe(1);
    expect([got[0].M, got[0].X, got[0].identityBps]).toEqual([10, 2, 8333]);
  });
});
