/**
 * Kfix-5 — SessionSummary + FileSummaryCard.
 *
 * SessionSummary: list of items with action badge + mini-map; «Открыть холст
 * →» surfaces only when there's at least one canvas action.
 *
 * FileSummaryCard: type counters, top-5 longest features, RE-sites summary,
 * sub-sections hide when their data source is empty.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import SessionSummary from '../components/ImportStartScreen/SessionSummary';
import FileSummaryCard from '../components/ImportStartScreen/FileSummaryCard';

const SAMPLE_MINI = { length: 100, topology: 'circular', annotations: [] };

describe('SessionSummary', () => {
  it('renders nothing when addedItems is empty', () => {
    const { queryByTestId } = render(<SessionSummary addedItems={[]} />);
    expect(queryByTestId('session-summary')).toBeNull();
  });

  it('renders one row per item with the right badge', () => {
    const items = [
      { name: 'pUC19', action: 'canvas', miniMapData: SAMPLE_MINI },
      { name: 'pET28a', action: 'library', miniMapData: SAMPLE_MINI },
      { name: 'fragX', action: 'annotate', miniMapData: SAMPLE_MINI, regionsAdded: 4 },
    ];
    const { getByTestId, getAllByText, getByText } = render(<SessionSummary addedItems={items} />);
    expect(getByTestId('session-summary')).toBeTruthy();
    expect(getByText(/Канвас/)).toBeTruthy();
    expect(getByText(/Библиотека/)).toBeTruthy();
    expect(getByText(/\+4 регионов/)).toBeTruthy();
  });

  it('«Открыть холст →» visible only when at least one canvas action present', () => {
    const onOpen = vi.fn();
    const libOnly = [{ name: 'a', action: 'library', miniMapData: SAMPLE_MINI }];
    const { queryByTestId, rerender, getByTestId } = render(
      <SessionSummary addedItems={libOnly} onOpenCanvas={onOpen} />
    );
    expect(queryByTestId('session-summary-open-canvas')).toBeNull();
    rerender(
      <SessionSummary
        addedItems={[...libOnly, { name: 'b', action: 'canvas', miniMapData: SAMPLE_MINI }]}
        onOpenCanvas={onOpen}
      />
    );
    fireEvent.click(getByTestId('session-summary-open-canvas'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('FileSummaryCard', () => {
  const ANN = [
    { id: 'a', start: 0, end: 800, level: 'region', type: 'CDS', name: 'AmpR' },
    { id: 'b', start: 850, end: 1100, level: 'region', type: 'CDS', name: 'lacZα' },
    { id: 'c', start: 1200, end: 1900, level: 'region', type: 'rep_origin', name: 'ori' },
    { id: 'd', start: 1950, end: 1990, level: 'region', type: 'misc_feature', name: 'site' },
    { id: 'e', start: 2000, end: 2100, level: 'region', type: 'promoter', name: 'lac' },
    { id: 'f', start: 2150, end: 2200, level: 'region', type: 'CDS', name: 'extra' },
  ];

  it('renders type counts + top-5 longest features', () => {
    const { getByTestId, getAllByText } = render(
      <FileSummaryCard parsedItem={{ annotations: ANN, sequence: 'A'.repeat(2300), topology: 'circular' }} />
    );
    expect(getByTestId('file-summary-types').textContent).toMatch(/CDS/);
    const top = getByTestId('file-summary-top-features');
    // AmpR is the longest (800 bp) — must appear
    expect(top.textContent).toMatch(/AmpR/);
    expect(top.textContent).toMatch(/ori/);
    // 5 children only (top-5 cap)
    expect(top.querySelectorAll('div.flex').length).toBe(5);
  });

  it('returns null when parsedItem is empty / has no actionable data', () => {
    const { queryByTestId } = render(<FileSummaryCard parsedItem={null} />);
    expect(queryByTestId('file-summary-card')).toBeNull();
    const { queryByTestId: q2 } = render(
      <FileSummaryCard parsedItem={{ annotations: [], sequence: '', topology: 'linear' }} />
    );
    expect(q2('file-summary-card')).toBeNull();
  });

  it('hides RE-sites sub-block when sequence too short to scan', () => {
    const { queryByTestId } = render(
      <FileSummaryCard parsedItem={{ annotations: ANN, sequence: 'AT', topology: 'linear' }} />
    );
    expect(queryByTestId('file-summary-re-sites')).toBeNull();
  });

  it('renders warnings sub-block when parsedItem.warnings has entries', () => {
    const { getByTestId } = render(
      <FileSummaryCard parsedItem={{ annotations: ANN, sequence: 'A'.repeat(50), warnings: ['no stop codon', 'short ORF'], topology: 'linear' }} />
    );
    expect(getByTestId('file-summary-warnings').textContent).toMatch(/no stop/);
    expect(getByTestId('file-summary-warnings').textContent).toMatch(/short ORF/);
  });
});
