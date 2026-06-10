/**
 * aa-frame-pick-v133.test.jsx — AATrack picks the CDS reading frame from the
 * DNA (fewest stops), so a partial CDS whose boundary isn't on a codon reads
 * as protein, not «*» everywhere. Биолог: AmpR-кусок в AA-режиме должен
 * читаться белком.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AATrack from '../tracks/AATrack';
import { regionFrame } from '../lib/aa-opacity';

afterEach(cleanup);

// frame 0 clean (V M V …); offset-1 read is stop-heavy.
const SEQ = 'GTAATG'.repeat(3); // 18 nt
// Top strand whose antisense (5'→3') is the same clean read (reverse CDS).
const REV_SEQ = 'CATTAC'.repeat(3); // 18 nt; revComp('GTAATG'×3)

describe('AATrack — V133 reading frame from DNA', () => {
  it('single: forward CDS off the codon boundary → productive frame, no internal stops', () => {
    const region = { id: 'cds', type: 'CDS', start: 1, end: 18, strand: 1 };
    const { container } = render(
      <AATrack
        fullSeq={SEQ}
        lineStart={0}
        lineLen={SEQ.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={[]}
        dominantCDS={region}
        regions={[region]}
      />,
    );
    const rows = screen.getAllByTestId('sequence-view-aa-row');
    expect(rows).toHaveLength(1);
    // productive frame 0, NOT the naive 1%3 = 1
    expect(rows[0].dataset.aaFrame).toBe('0');
    // clean read — no scattered stop codons
    expect(container.querySelectorAll('[data-aa="*"]').length).toBe(0);
  });

  it('single: forward CDS already on the codon boundary → frame unchanged (regression anchor)', () => {
    const orf = 'ATGGCTGCTGCTTAA'; // frame 0 = M A A A *
    const region = { id: 'cds', type: 'CDS', start: 0, end: orf.length, strand: 1 };
    render(
      <AATrack
        fullSeq={orf}
        lineStart={0}
        lineLen={orf.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={[]}
        dominantCDS={region}
        regions={[region]}
      />,
    );
    const rows = screen.getAllByTestId('sequence-view-aa-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.aaFrame).toBe('0'); // naive = productive, unchanged
  });

  it('single: reverse CDS off the codon boundary → productive frame, no internal stops', () => {
    const region = { id: 'cds', type: 'CDS', start: 0, end: 17, strand: -1 };
    const { container } = render(
      <AATrack
        fullSeq={REV_SEQ}
        lineStart={0}
        lineLen={REV_SEQ.length}
        labelChars={8}
        strategy="single"
        framesMode="single"
        orfRanges={[]}
        dominantCDS={region}
        regions={[region]}
      />,
    );
    const rows = screen.getAllByTestId('sequence-view-aa-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].dataset.aaStrand).toBe('-1');
    expect(rows[0].dataset.aaFrame).toBe('0'); // productive, NOT naive 1
    expect(container.querySelectorAll('[data-aa="*"]').length).toBe(0);
  });
});

describe('regionFrame — V133 hybrid frame match', () => {
  it('returns the productive frame for an off-codon region (drives the right hybrid row)', () => {
    // forward region [1,18) on SEQ — naive 1, productive 0.
    expect(regionFrame({ start: 1, end: 18, strand: 1 }, SEQ)).toBe(0);
    // reverse region [0,17) on REV_SEQ — naive 1, productive 0.
    expect(regionFrame({ start: 0, end: 17, strand: -1 }, REV_SEQ)).toBe(0);
  });
});
