/**
 * gene-exon-rects.test.jsx — «вариант A» render: a gene with introns draws as
 * exon BLOCKS + flat dashed intron connectors; both are clickable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { GeneExonRects } from '../GeneExonRects';

afterEach(cleanup);

function renderGene(props = {}) {
  return render(
    <svg>
      <GeneExonRects
        region={{ id: 'g1', start: 0, end: 120, strand: 1 }}
        intronKids={[{ id: 'i1', start: 30, end: 90, type: 'intron', name: 'интрон 1' }]}
        charPx={7}
        lineStart={0}
        lineEnd={120}
        fill="#abcdef"
        fillOpacity={0.5}
        stroke="#000000"
        strokeWidth={0.6}
        {...props}
      />
    </svg>,
  );
}

describe('GeneExonRects — вариант A', () => {
  it('renders one exon block per gap around the intron', () => {
    renderGene();
    const exons = screen.getAllByTestId('annotation-exon-rect');
    expect(exons).toHaveLength(2);
    // exon1 = [0,30) → x 0, w 210; exon2 = [90,120) → x 630, w 210
    expect(exons[0].getAttribute('x')).toBe('0');
    expect(exons[0].getAttribute('width')).toBe('210');
    expect(exons[1].getAttribute('x')).toBe('630');
  });

  it('draws a dashed intron connector in the gap', () => {
    renderGene();
    const line = screen.getByTestId('annotation-intron-connector');
    expect(line.getAttribute('stroke-dasharray')).toBe('3 2');
    expect(line.getAttribute('x1')).toBe('210'); // (30-0)*7
    expect(line.getAttribute('x2')).toBe('630'); // (90-0)*7
  });

  it('clicking an exon selects the gene; clicking the intron selects the intron', () => {
    const onAnnotationClick = vi.fn();
    renderGene({ onAnnotationClick });
    fireEvent.click(screen.getAllByTestId('annotation-exon-rect')[0]);
    expect(onAnnotationClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'g1' }));
    fireEvent.click(screen.getByTestId('annotation-intron-hit'));
    expect(onAnnotationClick).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'i1' }));
  });
});
