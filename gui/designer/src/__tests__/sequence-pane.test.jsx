import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SequencePane from '../components/SequencePane';

const SEQ = 'ATGGCTAGCAAATTTGGGCCCAAATAA'; // 27 nt, single line
const CDS_REGION = { id: 'r-cds', name: 'cds', type: 'CDS', level: 'region', start: 0, end: 27 };
const PROM_REGION = { id: 'r-prom', name: 'prom', type: 'promoter', level: 'region', start: 0, end: 27 };

describe('SequencePane — render', () => {
  it('renders empty-state message when no fragments', () => {
    const { getByText } = render(<SequencePane fragments={[]} selectedRegionId={null} onSelectRegion={() => {}} />);
    expect(getByText(/Пустая сборка/)).toBeTruthy();
  });

  it('renders totalBp in header for a single fragment', () => {
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    const header = container.querySelector('[data-testid="sequence-pane"]')?.querySelector('.uppercase');
    expect(header?.textContent).toMatch(/27/);
  });

  it('renders concatenated sequence across two fragments with region label', () => {
    const fragments = [
      { id: 'f1', sequence: 'AAAAAAAA', annotations: [CDS_REGION, ...[]] },
      { id: 'f2', sequence: 'GGGGGGGG', annotations: [{ ...PROM_REGION, start: 0, end: 8 }] },
    ];
    const { container, getByText } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={() => {}} />
    );
    // Region labels render region name
    expect(getByText(/prom/)).toBeTruthy();
    // Data-line attribute on each rendered line
    const lines = container.querySelectorAll('[data-line]');
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onSelectRegion when clicking a nucleotide inside a region', () => {
    const onSelectRegion = vi.fn();
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId={null} onSelectRegion={onSelectRegion} />
    );
    // Find sense-strand nucleotide spans (inline-block w-[1ch] wrappers with single A/T/G/C text)
    const ntSpans = Array.from(container.querySelectorAll('span'))
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.getAttribute('title'));
    expect(ntSpans.length).toBeGreaterThan(0);
    fireEvent.click(ntSpans[0]);
    expect(onSelectRegion).toHaveBeenCalledWith('r-cds');
  });

  it('toggles off when clicking the already selected region', () => {
    const onSelectRegion = vi.fn();
    const fragments = [{ id: 'f1', sequence: SEQ, annotations: [CDS_REGION] }];
    const { container } = render(
      <SequencePane fragments={fragments} selectedRegionId="r-cds" onSelectRegion={onSelectRegion} />
    );
    const ntSpans = Array.from(container.querySelectorAll('span'))
      .filter(s => /^[ATGC]$/.test(s.textContent.trim()) && s.getAttribute('title'));
    fireEvent.click(ntSpans[0]);
    expect(onSelectRegion).toHaveBeenCalledWith(null);
  });
});
