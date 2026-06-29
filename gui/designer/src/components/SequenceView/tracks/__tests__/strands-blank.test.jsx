/**
 * StrandsTrack recessed-strand blanking (RC-SEP-SEAM, Игорь 26.06 «просто буквы
 * убрать»): the recessed strand under an incompatible overhang renders its bases as
 * SPACES so the join reads as a real single-stranded staircase (width preserved, the
 * zone band tint stays). Opt-in: no blankRanges → full sequence (every existing consumer).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import StrandsTrack from '../StrandsTrack';

afterEach(cleanup);

// concat the nt-run spans → pure strand text (skips the gutter number/label).
const strandText = (which) => {
  const root = screen.getByTestId(`sequence-view-strands-${which}`);
  return [...root.querySelectorAll('[data-testid="sequence-view-nt-run"]')]
    .map((r) => r.textContent).join('');
};

describe('StrandsTrack — recessed-strand blanking', () => {
  it('blanks the BOTTOM strand bases over the given range (space, width kept)', () => {
    // bottom = complement(ACGTACGT) = TGCATGCA; blank cols 2,3,4 → spaces.
    render(<StrandsTrack lineStart={0} seq="ACGTACGT" which="bottom" showBottomStrand charPx={8} labelChars={0} blankRanges={[{ pos0: 2, pos1: 5, strand: 'bottom' }]} />);
    const text = strandText('bottom');
    expect(text.length).toBe(8);          // column width preserved
    expect(text).toBe('TG   GCA');        // cols 2-4 blanked
  });

  it('TOP strand untouched by a bottom-only blank', () => {
    render(<StrandsTrack lineStart={0} seq="ACGTACGT" which="top" showBottomStrand charPx={8} labelChars={0} blankRanges={[{ pos0: 2, pos1: 5, strand: 'bottom' }]} />);
    expect(strandText('top')).toBe('ACGTACGT');
  });

  it('no blankRanges → full strand (back-compat)', () => {
    render(<StrandsTrack lineStart={0} seq="ACGTACGT" which="bottom" showBottomStrand charPx={8} labelChars={0} />);
    expect(strandText('bottom')).toBe('TGCATGCA');
  });

  it('honours absolute positions via lineStart', () => {
    render(<StrandsTrack lineStart={10} seq="ACGTACGT" which="bottom" showBottomStrand charPx={8} labelChars={0} blankRanges={[{ pos0: 12, pos1: 13, strand: 'bottom' }]} />);
    // abs pos 12 → local index 2 ('C') → blanked; the rest of TGCATGCA intact.
    expect(strandText('bottom')).toBe('TG ATGCA');
  });
});
