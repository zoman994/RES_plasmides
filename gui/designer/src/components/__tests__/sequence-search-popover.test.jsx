/**
 * SequenceSearchPopover — Sprint M-X.9 K2 + K4.
 *
 * Covers:
 *   • renders nothing when closed; mounts when opened
 *   • too-short query surfaces a min-length toast
 *   • IUPAC degenerate codes surface a toast and skip the search
 *   • valid query produces hits + the count badge
 *   • Esc / overlay click closes
 *   • recent searches persist via localStorage
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore } from '../../store';
import SequenceSearchPopover from '../SequenceSearchPopover';
import { clearRecentSearches, getRecentSearches } from '../../lib/sequence-search-recent';

const TARGET = 'AAATTTGCATGCATGCATGCATGCATGCATGCATGCAAATTT';

beforeEach(() => {
  useStore.setState((s) => { s.toasts = []; });
  try { clearRecentSearches(); } catch { /* */ }
});
afterEach(cleanup);

describe('M-X.9 K2 — SequenceSearchPopover', () => {
  it('renders nothing when closed', () => {
    render(<SequenceSearchPopover open={false} targetSequence={TARGET} />);
    expect(screen.queryByTestId('sequence-search-popover')).toBeNull();
  });

  it('mounts dialog + input + threshold slider when open', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} targetName="t1" onClose={() => {}} />);
    expect(screen.getByTestId('sequence-search-popover')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-input')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-threshold')).toBeTruthy();
    expect(screen.getByTestId('sequence-search-target-name').textContent).toMatch(/t1/);
  });

  it('too-short query shows the min-length hint inline (no toast unless submitted)', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGT' } });
    expect(screen.getByTestId('sequence-search-results').textContent).toMatch(/Минимум 8 нт/);
  });

  it('clicking submit on too-short query fires the «for RE-sites» info toast', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGT' } });
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /Минимум 8/.test(t.msg))).toBe(true);
  });

  it('IUPAC ambiguity (N/W/R) surfaces a toast and shows hint inline', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), { target: { value: 'ACGTNCGT' } });
    expect(screen.getByTestId('sequence-search-results').textContent).toMatch(/IUPAC/);
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    const toasts = useStore.getState().toasts || [];
    expect(toasts.some((t) => /IUPAC/.test(t.msg))).toBe(true);
  });

  it('valid ACGT query produces a hit count + at least one row', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), {
      target: { value: 'GCATGCATGCATGC' },
    });
    expect(screen.getByTestId('sequence-search-hit-count').textContent).toMatch(/Найдено: \d+/);
    // At least one search-hit-* row.
    const hits = document.querySelectorAll('[data-testid^="search-hit-"]');
    expect(hits.length).toBeGreaterThan(0);
  });

  it('Esc closes the popover', () => {
    const onClose = vi.fn();
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('publishes hits into uiSlice.searchHits when entryId + valid query supplied (TD-SEARCH-OVERLAY-RECTS)', async () => {
    useStore.setState((s) => { s.searchHits = { entryId: null, query: '', hits: [] }; });
    render(<SequenceSearchPopover open targetSequence={TARGET} entryId="e1" onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), {
      target: { value: 'GCATGCATGCATGC' },
    });
    // Wait one tick for the publish effect.
    await new Promise((r) => setTimeout(r, 30));
    const slot = useStore.getState().searchHits;
    expect(slot.entryId).toBe('e1');
    expect(slot.query).toBe('GCATGCATGCATGC');
    expect(slot.hits.length).toBeGreaterThan(0);
  });

  it('clears uiSlice.searchHits when popover closes', async () => {
    useStore.setState((s) => {
      s.searchHits = { entryId: 'e1', query: 'PRIOR', hits: [{ targetStart: 0, targetEnd: 5 }] };
    });
    const { rerender } = render(
      <SequenceSearchPopover open={false} targetSequence={TARGET} entryId="e1" onClose={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(useStore.getState().searchHits.hits.length).toBe(0);
    rerender(<SequenceSearchPopover open={false} />); // no-op
  });

  it('successful submit pushes the query into the recent-searches list', () => {
    render(<SequenceSearchPopover open targetSequence={TARGET} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('sequence-search-input'), {
      target: { value: 'GCATGCATGCATGC' },
    });
    fireEvent.click(screen.getByTestId('sequence-search-submit'));
    expect(getRecentSearches()).toContain('GCATGCATGCATGC');
  });
});
