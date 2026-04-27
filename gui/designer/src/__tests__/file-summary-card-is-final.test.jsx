/**
 * Sprint IS-Final K6 — FileSummaryCard cosmetic unification.
 *
 * Closes #3d (categories + CDS unified table format)
 * Closes #3e (RE relabel «🔬 САЙТЫ РЕСТРИКЦИИ»)
 * Closes #3f (overflow «…ещё N CDS» now clickable)
 */
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import FileSummaryCard from '../components/ImportStartScreen/FileSummaryCard';

describe('FileSummaryCard IS-Final unification', () => {
  it('overflow «…ещё N CDS» click expands to show all rows', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, type: 'CDS', name: `cdsX${i}`, start: i * 100, end: i * 100 + 50, level: 'region',
    }));
    const { getByTestId, queryAllByText } = render(
      <FileSummaryCard parsedItem={{
        annotations: many, sequence: 'A'.repeat(2000), topology: 'circular',
      }} />,
    );
    expect(getByTestId('cds-overflow')).toBeTruthy();
    expect(queryAllByText(/cdsX9/).length).toBe(0); // hidden initially
    fireEvent.click(getByTestId('cds-overflow'));
    expect(queryAllByText(/cdsX9/).length).toBeGreaterThanOrEqual(1);
  });

  it('RE-section is labelled «🔬 САЙТЫ РЕСТРИКЦИИ» (not «УНИКАЛЬНЫЕ/РЕДКИЕ САЙТЫ»)', () => {
    // Use a small sequence with at least one RE site so the section renders.
    // EcoRI = GAATTC. Place once in a 200 bp seq.
    const seq = 'A'.repeat(80) + 'GAATTC' + 'A'.repeat(114);
    const { container } = render(
      <FileSummaryCard parsedItem={{ annotations: [], sequence: seq, topology: 'linear' }} />,
    );
    // The relabel should be visible.
    expect(container.textContent).toMatch(/САЙТЫ РЕСТРИКЦИИ/);
    expect(container.textContent).not.toMatch(/УНИКАЛЬНЫЕ\/РЕДКИЕ САЙТЫ/);
  });

  it('category headers use new format «(N)» suffix and uppercase labels', () => {
    const regions = [
      { id: 'amp', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
      { id: 'lac', type: 'promoter', name: 'lac', start: 0, end: 100, level: 'region' },
    ];
    const { getByTestId, container } = render(
      <FileSummaryCard parsedItem={{ annotations: regions, sequence: 'A'.repeat(2000), topology: 'circular' }} />,
    );
    // Headers contain (N) count and uppercase label.
    expect(getByTestId('cat-selection').textContent).toMatch(/СЕЛЕКЦИЯ \(1\)/);
    expect(getByTestId('cat-promoters').textContent).toMatch(/ПРОМОТОРЫ \(1\)/);
    expect(container.textContent).not.toMatch(/Селекция:/);
  });

  it('category section row uses unified bp-aligned format with item count', () => {
    const regions = [
      { id: 'amp', type: 'CDS', name: 'AmpR', start: 0, end: 800, level: 'region' },
    ];
    const { getByTestId } = render(
      <FileSummaryCard parsedItem={{ annotations: regions, sequence: 'A'.repeat(2000), topology: 'circular' }} />,
    );
    const cat = getByTestId('cat-selection');
    // Expect the row to contain the bp value with font-mono right-aligned.
    expect(cat.textContent).toMatch(/AmpR/);
    expect(cat.textContent).toMatch(/800 bp/);
  });
});
