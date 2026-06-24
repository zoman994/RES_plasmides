/**
 * RC-B2 — junctionSeamView: nucleotide context at an assembly seam + the
 * reading-frame codon that straddles it (premature-stop detection).
 */
import { describe, it, expect } from 'vitest';
import { junctionSeamView, seamFrameForBoundary } from '../junction-seam.js';

const TT = new Set(['CDS', 'gene', 'marker', 'reporter']);

describe('junctionSeamView', () => {
  // 12 nt; boundary at 6 → left = first 6, right = last 6.
  const SEQ = 'AAACCCGGGTTT';

  it('returns the bases on each side of the seam (windowed)', () => {
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 6, window: 3 });
    expect(r.left).toBe('CCC');   // positions 3..6
    expect(r.right).toBe('GGG');  // positions 6..9
    expect(r.boundaryPos).toBe(6);
  });

  it('clamps the window at the sequence ends', () => {
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 1, window: 6 });
    expect(r.left).toBe('A');           // only 1 base before pos 1
    expect(r.right).toBe('AACCCG');     // 6 bases after
  });

  it('frame=null → no codon/translation', () => {
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 6 });
    expect(r.onCodonBoundary).toBe(null);
    expect(r.codonAtSeam).toBe(null);
    expect(r.stopAtSeam).toBe(false);
  });

  it('seam on a codon boundary (frame 0, pos 6) → onCodonBoundary, no straddling codon', () => {
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 6, frame: 0 });
    expect(r.onCodonBoundary).toBe(true);
    expect(r.codonAtSeam).toBe(null);
  });

  it('seam INSIDE a codon → returns the straddling codon + its AA', () => {
    // frame 0 codons: AAA CCC GGG TTT. Boundary at 7 splits codon #3 (GGG).
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 7, frame: 0 });
    expect(r.onCodonBoundary).toBe(false);
    expect(r.codonAtSeam).toEqual({ dna: 'GGG', aa: 'G', isStop: false, start: 6 });
    expect(r.stopAtSeam).toBe(false);
  });

  it('flags a STOP codon straddling the seam', () => {
    // Construct so a stop (TGA) straddles the boundary in frame 0.
    // codons: ATG (0) GCA (3) TGA(6=stop). Boundary 7 splits TGA.
    const seq = 'ATGGCATGACCC';
    const r = junctionSeamView({ seq, boundaryPos: 7, frame: 0 });
    expect(r.codonAtSeam.dna).toBe('TGA');
    expect(r.codonAtSeam.isStop).toBe(true);
    expect(r.stopAtSeam).toBe(true);
  });

  it('respects a non-zero frame offset', () => {
    // frame 1 codons start at 1: AAC CCG GGT … Boundary at 5 splits CCG (start 4).
    const r = junctionSeamView({ seq: SEQ, boundaryPos: 5, frame: 1 });
    expect(r.codonAtSeam.start).toBe(4);
    expect(r.codonAtSeam.dna).toBe('CCG');
  });

  it('guards empty/bad input', () => {
    expect(junctionSeamView()).toBe(null);
    expect(junctionSeamView({ seq: '', boundaryPos: 0 })).toBe(null);
  });
});

describe('seamFrameForBoundary — RC-BIO-2 (CDS-anchored seam frame)', () => {
  it('spanning forward CDS → frame = start % 3', () => {
    expect(seamFrameForBoundary([{ type: 'CDS', start: 3, end: 30, strand: 1 }], 15, TT)).toBe(0);
    expect(seamFrameForBoundary([{ type: 'CDS', start: 4, end: 30, strand: 1 }], 15, TT)).toBe(1);
    expect(seamFrameForBoundary([{ type: 'gene', start: 5, end: 30, strand: 1 }], 15, TT)).toBe(2);
  });

  it('no CDS spans the boundary → fallback', () => {
    expect(seamFrameForBoundary([{ type: 'CDS', start: 3, end: 10, strand: 1 }], 15, TT, 2)).toBe(2);
    expect(seamFrameForBoundary([], 15, TT, null)).toBe(null);
  });

  it('minus-strand CDS is skipped (AA reads on complement) → fallback', () => {
    expect(seamFrameForBoundary([{ type: 'CDS', start: 3, end: 30, strand: -1 }], 15, TT, null)).toBe(null);
  });

  it('non-translatable type is ignored', () => {
    expect(seamFrameForBoundary([{ type: 'misc_feature', start: 3, end: 30, strand: 1 }], 15, TT, 7)).toBe(7);
  });

  it('boundary exactly at CDS start counts as inside; at CDS end does not', () => {
    expect(seamFrameForBoundary([{ type: 'CDS', start: 6, end: 30, strand: 1 }], 6, TT, null)).toBe(0);
    expect(seamFrameForBoundary([{ type: 'CDS', start: 6, end: 30, strand: 1 }], 30, TT, null)).toBe(null);
  });
});
