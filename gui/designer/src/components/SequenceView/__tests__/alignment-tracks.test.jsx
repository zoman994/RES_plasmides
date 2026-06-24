import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import AlignmentReadTrack from '../tracks/AlignmentReadTrack';
import AlignmentChromatogramTrack from '../tracks/AlignmentChromatogramTrack';

afterEach(cleanup);

const alignmentRead = {
  readByRefPos: {
    5: { base: 'A', status: 'match', bi: 0 },
    6: { base: 'T', status: 'mismatch', bi: 1 },
    7: { base: '-', status: 'gapB', bi: null },
  },
  insertions: [{ afterRefPos: 5, bases: 'GG', biStart: 1 }],
};

describe('AlignmentReadTrack', () => {
  it('draws read bases in black by default (colorMode plain)', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} /></svg>);
    const bases = document.querySelectorAll('[data-testid="aln-read-base"]');
    expect(bases.length).toBe(2); // pos 5 + 6 (pos 7 is a deletion dash)
    const a = document.querySelector('[data-testid="aln-read-base"][data-base="A"]');
    expect(a.getAttribute('fill')).toBe('var(--text-primary, #1c1917)');
  });

  it('colours bases by nucleotide when colorMode="nucleotide"', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} colorMode="nucleotide" /></svg>);
    const a = document.querySelector('[data-testid="aln-read-base"][data-base="A"]');
    expect(a.getAttribute('fill')).toBe('#1D9E75');
  });

  it('shows a mismatch as a red letter with no outline (soft fill only)', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} colorMode="nucleotide" /></svg>);
    // the mismatch base (T at pos 6) is red regardless of colorMode
    const mm = document.querySelector('[data-testid="aln-read-base"][data-base="T"]');
    expect(mm.getAttribute('fill')).toBe('#E24B4A');
    // a soft background marker exists, but it has NO stroke (no «red box»)
    const box = document.querySelector('[data-testid="aln-read-mismatch"]');
    expect(box).toBeTruthy();
    expect(box.getAttribute('stroke')).toBeFalsy();
  });

  it('draws an AA-effect badge for a CDS mismatch when aaEffects is provided', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} aaEffects={{ 6: { effect: 'missense', refAA: 'K', altAA: 'Q' } }} /></svg>);
    const badge = document.querySelector('[data-testid="aln-aa-effect"]');
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('data-effect')).toBe('missense');
  });

  it('marks a double-peak (heterozygous) position with a violet underline', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} doublePeaks={{ 5: { code: 'R', primary: 'A', secondary: 'G' } }} /></svg>);
    const dp = document.querySelector('[data-testid="aln-double-peak"]');
    expect(dp).toBeTruthy();
    expect(dp.getAttribute('data-code')).toBe('R');
  });

  it('flags the consensus row label', () => {
    render(<svg><AlignmentReadTrack lineStart={0} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} readName="консенсус" isConsensus /></svg>);
    expect(document.querySelector('[data-testid="aln-read-label"][data-consensus="true"]')).toBeTruthy();
  });

  it('draws no AA-effect badge without aaEffects', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} /></svg>);
    expect(document.querySelector('[data-testid="aln-aa-effect"]')).toBeNull();
  });

  it('clicking a mismatch calls onAcceptBase(refPos, readBase) when wired', () => {
    const onAcceptBase = vi.fn();
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} onAcceptBase={onAcceptBase} /></svg>);
    const mm = document.querySelector('[data-testid="aln-read-mismatch"][data-accept="true"]');
    expect(mm).toBeTruthy();
    fireEvent.click(mm);
    expect(onAcceptBase).toHaveBeenCalledWith(6, 'T'); // ref pos 6 mismatch, read base T
  });

  it('mismatch cells are not click-targets without onAcceptBase', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} /></svg>);
    expect(document.querySelector('[data-testid="aln-read-mismatch"][data-accept="true"]')).toBeNull();
  });

  it('marks insertions with a caret', () => {
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} /></svg>);
    expect(document.querySelectorAll('[data-testid="aln-read-insertion"]').length).toBe(1);
  });

  it('labels every line in the gutter with the read name', () => {
    render(<svg><AlignmentReadTrack lineStart={0} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} readName="pET-28b" /></svg>);
    expect(document.querySelector('[data-testid="aln-read-label"]').textContent).toContain('pET-28b');
    cleanup();
    // per-line (not first-line-only): a later line is still labelled
    render(<svg><AlignmentReadTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} readName="pET-28b" /></svg>);
    expect(document.querySelector('[data-testid="aln-read-label"]').textContent).toContain('pET-28b');
  });

  it('renders nothing without alignmentRead (opt-in)', () => {
    const { container } = render(<svg><AlignmentReadTrack lineStart={0} lineLen={5} charPx={8} labelChars={8} /></svg>);
    expect(container.querySelector('[data-testid="alignment-read-track"]')).toBeNull();
  });
});

describe('AlignmentChromatogramTrack', () => {
  const chromatogram = {
    bases: 'AT', qualities: [40, 40], peakLocations: [10, 30],
    sampleCount: 60,
    traces: { A: Array(60).fill(1), C: Array(60).fill(1), G: Array(60).fill(1), T: Array(60).fill(1) },
  };
  it('draws the 4 trace channels for the aligned read bases', () => {
    render(<svg><AlignmentChromatogramTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} chromatogram={chromatogram} maxVal={1} /></svg>);
    expect(document.querySelectorAll('[data-testid="aln-chromo-path"]').length).toBe(4);
  });

  it('labels the trace «трасса» in the gutter on every line', () => {
    render(<svg><AlignmentChromatogramTrack lineStart={5} lineLen={3} charPx={8} labelChars={8} alignmentRead={alignmentRead} chromatogram={chromatogram} maxVal={1} /></svg>);
    expect(document.querySelector('[data-testid="aln-chromo-label"]').textContent).toContain('трасса');
  });
});
