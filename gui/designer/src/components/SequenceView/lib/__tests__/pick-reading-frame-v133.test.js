/**
 * pick-reading-frame-v133.test.js — choose a CDS reading frame from the DNA
 * itself (fewest in-window stops), not from start%3. Биолог: партиал AmpR
 * (граница не на кодоне) → наивная рамка идёт мимо → стопы по всей строке.
 *
 * Fixture «GTAATG»×3: frame 0 reads GTA ATG GTA … (V M V …, 0 stops); the
 * offset-1 read is TAA TGG TAA … (stops). So a region whose naive frame is 1
 * must be re-picked to the clean frame 0.
 */
import { describe, it, expect } from 'vitest';
import { pickReadingFrame } from '../codon-walker.js';

const SEQ = 'GTAATG'.repeat(3); // 18 nt

describe('pickReadingFrame (V133)', () => {
  it('off-codon region: naive frame is stop-heavy → returns the clean frame', () => {
    // [1,18): naive = 1%3 = 1 (TAA×3 in window); frame 0 is clean → pick 0.
    expect(pickReadingFrame(SEQ, 1, 18, false)).toBe(0);
  });

  it('on-codon region: naive frame already clean → keeps naive (anchor)', () => {
    expect(pickReadingFrame(SEQ, 0, 18, false)).toBe(0);
  });

  it('terminal-stop tolerance: clean ORF with a terminal stop keeps naive frame', () => {
    // ATG GCT GCT GCT TAA — frame 0 has 1 (terminal) stop; off-frames here are
    // coincidentally stop-free, but the +1 tolerance keeps naive 0 (a real
    // CDS frame must not be displaced by a stop-free junk off-frame).
    const orf = 'ATGGCTGCTGCTTAA'; // 15 nt
    expect(pickReadingFrame(orf, 0, 15, false)).toBe(0);
  });

  it('falls back to naive on a too-short / empty region without throwing', () => {
    expect(pickReadingFrame(SEQ, 0, 0, false)).toBe(0);
    expect(pickReadingFrame('', 0, 0, false)).toBe(0);
  });

  it('reverse off-codon region: stop-heavy naive frame → returns the clean frame', () => {
    // Top strand whose ANTISENSE (5'→3') is the same clean «GTAATG»×3 read.
    // revComp('GTAATG'.repeat(3)) === 'CATTAC'.repeat(3).
    const rev = 'CATTAC'.repeat(3); // 18 nt
    // region [0,17) reverse: naive = (18-17)%3 = 1 (TAA-heavy); frame 0 clean.
    expect(pickReadingFrame(rev, 0, 17, true)).toBe(0);
  });
});
