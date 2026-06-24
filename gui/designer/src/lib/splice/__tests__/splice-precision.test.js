/**
 * splice-precision.test.js — false-positive / precision regression for the
 * intron detector (Игорь 17.06.2026: «нейронка справляется хорошо но НЕ идеально
 * … а PWM куча ложноположительных»).
 *
 * Ground truth = the real Trichoderma reesei CBHI (cel7a) gene, which has TWO
 * introns. The detector must return EXACTLY those two (correct boundaries) with
 * the CNN scorer, and ZERO introns on non-gene (random) DNA — the ORF-aware
 * selection + combined-site gate + relative ORF-gain null gate together suppress
 * the over-calling without losing the real introns.
 */
import { describe, it, expect } from 'vitest';
import { detectIntrons } from '../intron-detect.js';
import { scoreSpliceSitesCNN } from '../cnn-scorer.js';

// Real CBHI gene (2 verified introns).
const CBHI =
  'ATGTATCGGAAGTTGGCCGTCATCTCGGCCTTCTTGGCCACAGCTCGTGCTCAGTCGGCCTGCACTCTCCAATCGGAGACTCACCCGCCTCTGACATGGCAGAAATGCTCGTCTGGTGGCACGTGCACTCAACAGACAGGCTCCGTGGTCATCGACGCCAACTGGCGCTGGACTCACGCTACGAACAGCAGCACGAACTGCTACGATGGCAACACTTGGAGCTCGACCCTATGTCCTGACAACGAGACCTGCGCGAAGAACTGCTGTCTGGACGGTGCCGCCTACGCGTCCACGTACGGAGTTACCACGAGCGGTAACAGCCTCTCCATTGGCTTTGTCACCCAGTCTGCGCAGAAGAACGTTGGCGCTCGCCTTTACCTTATGGCGAGCGACACGACCTACCAGGAATTCACCCTGCTTGGCAACGAGTTCTCTTTCGATGTTGATGTTTCGCAGCTGCCGTAAGTGACTTACCATGAACCCCTGACGCTATCTTCTTGTTGGCTCCCAGCTGACTGGCCAATTCAAGGTGCGGCTTGAACGGAGCTCTCTACTTCGTGTCCATGGACGCGGATGGTGGCGTGAGCAAGTATCCCACCAACACCGCTGGCGCCAAGTACGGCACGGGGTACTGTGACAGCCAGTGTCCCCGCGATCTGAAGTTCATCAATGGCCAGGCCAACGTTGAGGGCTGGGAGCCGTCATCCAACAACGCGAACACGGGCATTGGAGGACACGGAAGCTGCTGCTCTGAGATGGATATCTGGGAGGCCAACTCCATCTCCGAGGCTCTTACCCCCCACCCTTGCACGACTGTCGGCCAGGAGATCTGCGAGGGTGATGGGTGCGGCGGAACTTACTCCGATAACAGATATGGCGGCACTTGCGATCCCGATGGCTGCGACTGGAACCCATACCGCCTGGGCAACACCAGCTTCTACGGCCCTGGCTCAAGCTTTACCCTCGATACCACCAAGAAATTGACCGTTGTCACCCAGTTCGAGACGTCGGGTGCCATCAACCGATACTATGTCCAGAATGGCGTCACTTTCCAGCAGCCCAACGCCGAGCTTGGTAGTTACTCTGGCAACGAGCTCAACGATGATTACTGCACAGCTGAGGAGGCAGAATTCGGCGGATCCTCTTTCTCAGACAAGGGCGGCCTGACTCAGTTCAAGAAGGCTACCTCTGGCGGCATGGTTCTGGTCATGAGTCTGTGGGATGATGTGAGTTTGATGGACAAACATGCGCGTTGACAAAGAGTCAAGCAGCTGACTGAGATGTTACAGTACTACGCCAACATGCTGTGGCTGGACTCCACCTACCCGACAAACGAGACCTCCTCCACACCCGGTGCCGTGCGCGGAAGCTGCTCCACCAGCTCCGGTGTCCCTGCTCAGGTCGAATCTCAGTCTCCCAACGCCAAGGTCACCTTCTCCAACATCAAGTTCGGACCCATTGGCAGCACCGGCAACCCTAGCGGCGGCAACCCTCCCGGCGGAAACCCGCCTGGCACCACCACCACCCGCCGCCCAGCCACTACCACTGGAAGCTCTCCCGGACCTACCCAGTCTCACTACGGCCAGTGCGGCGGTATTGGCTACAGCGGCCCCACGGTCTGCGCCAGCGGCACAACTTGCCAGGTCCTGAACCCTTACTACTCTCAGTGCCTGTAA';

// deterministic pseudo-random DNA (LCG) — a non-gene control
const randDna = (seed, n) => {
  let x = seed >>> 0;
  let s = '';
  for (let i = 0; i < n; i++) { x = (1103515245 * x + 12345) & 0x7fffffff; s += 'ACGT'[(x >> 16) & 3]; }
  return s;
};

// 2-intron synthetic gene (consensus sites): introns [120,150) & [267,297)
const DEMO =
  'ATG' + 'GCT'.repeat(38) + 'CAG'
  + 'GTAAGT' + 'TAA' + 'CCCC' + 'TTTTCTTTCTTTCC' + 'CAG'
  + 'GCT'.repeat(38) + 'CAG'
  + 'GTAAGT' + 'TAA' + 'CCCC' + 'TTTTCTTTCTTTCC' + 'CAG'
  + 'GCT'.repeat(40) + 'TAA';

describe('intron detection — precision on real + random sequences (CNN)', () => {
  it('finds EXACTLY the two real CBHI introns with correct boundaries', () => {
    const r = detectIntrons(CBHI, { scorer: scoreSpliceSitesCNN });
    expect(r.strand).toBe(1);
    const iv = r.introns.map((i) => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
    expect(iv).toEqual([[461, 529], [1226, 1289]]);
  });

  it('returns ZERO introns on non-gene random DNA (no false positives)', () => {
    for (const seed of [7, 99, 1234]) {
      const r = detectIntrons(randDna(seed, 3000), { scorer: scoreSpliceSitesCNN });
      expect(r.introns).toHaveLength(0);
    }
  });

  it('still recovers both introns of a clean 2-intron gene', () => {
    const r = detectIntrons(DEMO, { scorer: scoreSpliceSitesCNN });
    const iv = r.introns.map((i) => [i.start, i.end]).sort((a, b) => a[0] - b[0]);
    expect(iv).toEqual([[120, 150], [267, 297]]);
  });
});

describe('intron detection — PWM baseline is far tighter than before', () => {
  it('no longer floods random DNA (was ~31/80, now single digits or fewer)', () => {
    const r = detectIntrons(randDna(7, 3000)); // PWM default
    expect(r.introns.length).toBeLessThan(5);
  });
});
