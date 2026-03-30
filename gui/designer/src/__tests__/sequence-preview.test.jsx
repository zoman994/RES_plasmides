import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import SequencePreview from '../components/SequencePreview';

const SHORT_SEQ = 'ATGGCTAGCAAATTTGGGCCCAAATAA'; // 27 nt, single line
const CDS_ANN = { name: 'cds', type: 'CDS', level: 'region', start: 0, end: 27 };
const DETAIL_ANN = { name: 'site', type: 'misc_feature', level: 'detail', start: 6, end: 12 };

/** Helper: get all leaf spans (no child spans) from container */
function leafSpans(container) {
  return Array.from(container.querySelectorAll('span'))
    .filter(s => s.querySelectorAll('span').length === 0);
}

/**
 * All rows must use the same CH grid: display:inline-block + width:1ch + textAlign:center.
 * If nucleotide spans miss CH, subpixel drift accumulates on short lines.
 */
describe('SequencePreview — CH grid alignment', () => {

  it('no leaf span with single ATGC content is missing the CH grid', () => {
    const { container } = render(
      <SequencePreview sequence={SHORT_SEQ} annotations={[CDS_ANN]} />
    );

    // Leaf spans containing exactly one nucleotide character
    const ntLeaves = leafSpans(container)
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()));

    // Must have at least the sequence length (sense strand)
    expect(ntLeaves.length).toBeGreaterThanOrEqual(SHORT_SEQ.length);

    // Every one of them must be on the CH grid
    const offGrid = ntLeaves.filter(s =>
      s.style.display !== 'inline-block' || s.style.width !== '1ch'
    );
    expect(offGrid).toHaveLength(0);
  });

  it('every 1ch span also has textAlign:center', () => {
    const { container } = render(
      <SequencePreview sequence={SHORT_SEQ} annotations={[CDS_ANN, DETAIL_ANN]} />
    );

    const chSpans = leafSpans(container).filter(s => s.style.width === '1ch');
    expect(chSpans.length).toBeGreaterThan(0);

    const misaligned = chSpans.filter(s => s.style.textAlign !== 'center');
    expect(misaligned).toHaveLength(0);
  });

  it('short last line (3 nt) has nucleotides on CH grid', () => {
    // 63 nt → line 1: 60 chars, line 2: 3 chars ("TAA")
    const seq = 'ATGGCTAGCAAATTTGGGCCCAAATTTGGGCCCAAATTTGGGCCCAAATTTGGGCCCAAATAA';
    expect(seq.length).toBe(63);

    const { container } = render(
      <SequencePreview
        sequence={seq}
        annotations={[{ name: 'cds', type: 'CDS', level: 'region', start: 0, end: 63 }]}
      />
    );

    const lineBlocks = container.querySelectorAll('div.mb-2');
    expect(lineBlocks.length).toBe(2);

    // In the short (second) line block, every ATGC leaf span must be on CH grid
    const shortLeaves = leafSpans(lineBlocks[1])
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()));
    expect(shortLeaves.length).toBeGreaterThanOrEqual(3);

    for (const span of shortLeaves) {
      expect(span.style.display).toBe('inline-block');
      expect(span.style.width).toBe('1ch');
      expect(span.style.textAlign).toBe('center');
    }
  });

  it('color strip and nucleotide spans share the same grid base', () => {
    const { container } = render(
      <SequencePreview sequence={SHORT_SEQ} annotations={[CDS_ANN]} />
    );

    const all = leafSpans(container);

    // Color strip spans: height 3px or 5px, on the 1ch grid
    const stripSpans = all.filter(s =>
      (s.style.height === '3px' || s.style.height === '5px') && s.style.width === '1ch'
    );
    // Nucleotide spans: single ATGC content
    const ntSpans = all.filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.style.width === '1ch');

    expect(stripSpans.length).toBeGreaterThan(0);
    expect(ntSpans.length).toBeGreaterThan(0);

    for (const s of [...stripSpans, ...ntSpans]) {
      expect(s.style.display).toBe('inline-block');
      expect(s.style.width).toBe('1ch');
    }
  });
});
