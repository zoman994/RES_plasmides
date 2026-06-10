/**
 * aa-reporter-types-v134.test.jsx — one shared set of translatable types
 * (TRANSLATABLE_TYPES) across AATrack, aa-opacity and frames-mode, and it
 * INCLUDES `reporter`. Биолог: репортёр (GFP) детектится как белок, но три
 * display-набора исключали `reporter` → у репортёров не было AA-трека.
 *
 * Coding types (CDS / gene / marker / reporter) translate; regulatory
 * (promoter / misc_feature) do not.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AATrack from '../tracks/AATrack';
import { resolveFramesMode } from '../lib/frames-mode';
import { frameHasSignal, computeAAOpacity } from '../lib/aa-opacity';
import { TRANSLATABLE_TYPES } from '../constants.js';

afterEach(cleanup);

// M A A A * — clean frame-0 ORF.
const ORF = 'ATGGCTGCTGCTTAA'; // 15 nt

function renderSingle(region) {
  return render(
    <AATrack
      fullSeq={ORF}
      lineStart={0}
      lineLen={ORF.length}
      labelChars={8}
      strategy="single"
      framesMode="single"
      orfRanges={[]}
      dominantCDS={region}
      regions={[region]}
    />,
  );
}

describe('TRANSLATABLE_TYPES (V134) — shared coding set', () => {
  it('includes the four coding types and excludes regulatory ones', () => {
    expect(TRANSLATABLE_TYPES.has('CDS')).toBe(true);
    expect(TRANSLATABLE_TYPES.has('gene')).toBe(true);
    expect(TRANSLATABLE_TYPES.has('marker')).toBe(true);
    expect(TRANSLATABLE_TYPES.has('reporter')).toBe(true);
    expect(TRANSLATABLE_TYPES.has('promoter')).toBe(false);
    expect(TRANSLATABLE_TYPES.has('misc_feature')).toBe(false);
  });
});

describe('AATrack single — reporter draws an AA row (V134)', () => {
  it('reporter feature → AA row rendered with the start M', () => {
    const region = { id: 'r', type: 'reporter', start: 0, end: ORF.length, strand: 1 };
    const { container } = renderSingle(region);
    const rows = screen.getAllByTestId('sequence-view-aa-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // first codon of the reporter ORF is M
    expect(container.querySelector('[data-aa="M"]')).not.toBeNull();
  });

  it('CDS / gene / marker still draw an AA row (regression anchor)', () => {
    for (const type of ['CDS', 'gene', 'marker']) {
      const { unmount } = renderSingle({ id: 't', type, start: 0, end: ORF.length, strand: 1 });
      expect(screen.getAllByTestId('sequence-view-aa-row').length).toBeGreaterThanOrEqual(1);
      unmount();
    }
  });

  it('promoter / misc_feature → no AA row (not translatable)', () => {
    for (const type of ['promoter', 'misc_feature']) {
      const { container, unmount } = renderSingle({ id: 'n', type, start: 0, end: ORF.length, strand: 1 });
      expect(container.querySelectorAll('[data-testid="sequence-view-aa-row"]').length).toBe(0);
      unmount();
    }
  });
});

describe('frames-mode dominant includes reporter (V134)', () => {
  it('a reporter region is picked as the dominant annotated coding region', () => {
    const regions = [{ type: 'reporter', start: 0, end: 90 }];
    const out = resolveFramesMode('single', 0.8, regions, 1000, []);
    expect(out.dominant).not.toBeNull();
    expect(out.dominant.type).toBe('reporter');
  });
});

describe('aa-opacity treats reporter as coding (V134)', () => {
  const reporter = { type: 'reporter', start: 0, end: ORF.length, strand: 1 };

  it('frameHasSignal: reporter contributes signal on its frame', () => {
    expect(frameHasSignal({ frame: 0, strand: 1, orfRanges: [], regions: [reporter], seq: ORF })).toBe(true);
  });

  it('computeAAOpacity: full opacity inside an annotated reporter', () => {
    const op = computeAAOpacity({
      position: 1, // middle base of codon 0 (ATG)
      frame: 0,
      strand: 1,
      strategy: 'hybrid',
      framesMode: 'auto',
      orfRanges: [],
      regions: [reporter],
      seq: ORF,
    });
    expect(op).toBe(1);
  });
});
