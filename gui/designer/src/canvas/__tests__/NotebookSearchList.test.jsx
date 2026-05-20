/**
 * NB-K13 — NotebookSearch + NotebookList.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NotebookSearch, { filterEntries } from '../NotebookSearch';
import NotebookList, { firstLineText } from '../NotebookList';

const ENTRIES = [
  { id: 'nb01', title: 'PCR result', text: 'Verified by Sanger.', tags: ['pcr', 'verified'], updatedAt: '2026-05-14' },
  { id: 'nb02', title: 'Gibson assembly', text: 'Failed first attempt.', tags: ['gibson', 'failed'], updatedAt: '2026-05-15' },
  { id: 'nb03', kind: 'sanger', title: 'clone-3 Sanger', text: 'No mismatches.', tags: ['sanger', 'verified'], updatedAt: '2026-05-16' },
];

describe('NB-K13 — filterEntries (pure)', () => {
  it('empty query → all entries', () => {
    expect(filterEntries(ENTRIES, '')).toHaveLength(3);
    expect(filterEntries(ENTRIES, '   ')).toHaveLength(3);
  });

  it('matches case-insensitively across title / text / tags', () => {
    expect(filterEntries(ENTRIES, 'pcr')).toHaveLength(1);
    expect(filterEntries(ENTRIES, 'Sanger')).toHaveLength(2);   // text + title hits
    expect(filterEntries(ENTRIES, 'failed')).toHaveLength(1);
  });

  it('tag match works', () => {
    expect(filterEntries(ENTRIES, 'verified')).toHaveLength(2);
  });

  it('no-match query → empty array', () => {
    expect(filterEntries(ENTRIES, 'nonexistent')).toHaveLength(0);
  });
});

describe('NB-K13 — NotebookSearch component', () => {
  it('renders input + count + propagates onFiltered', () => {
    const onFiltered = vi.fn();
    render(<NotebookSearch entries={ENTRIES} onFiltered={onFiltered} />);
    expect(screen.getByTestId('notebook-search-input')).toBeTruthy();
    expect(screen.getByTestId('notebook-search-count').textContent).toBe('3 / 3');
    expect(onFiltered).toHaveBeenCalledWith(ENTRIES);
  });

  it('typing in input updates filtered result + count', () => {
    const onFiltered = vi.fn();
    render(<NotebookSearch entries={ENTRIES} onFiltered={onFiltered} />);
    fireEvent.change(screen.getByTestId('notebook-search-input'), { target: { value: 'pcr' } });
    expect(screen.getByTestId('notebook-search-count').textContent).toBe('1 / 3');
    expect(onFiltered).toHaveBeenLastCalledWith([ENTRIES[0]]);
  });
});

describe('NB-K13 — NotebookList', () => {
  it('renders each entry as a clickable row', () => {
    render(<NotebookList entries={ENTRIES} onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByTestId('notebook-list-item-nb01')).toBeTruthy();
    expect(screen.getByTestId('notebook-list-item-nb02')).toBeTruthy();
    expect(screen.getByTestId('notebook-list-item-nb03')).toBeTruthy();
  });

  it('row click → onSelect with entry payload', () => {
    const onSelect = vi.fn();
    render(<NotebookList entries={ENTRIES} onSelect={onSelect} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('notebook-list-item-nb02'));
    expect(onSelect).toHaveBeenCalledWith(ENTRIES[1]);
  });

  it('+ Запись button → onCreate', () => {
    const onCreate = vi.fn();
    render(<NotebookList entries={ENTRIES} onSelect={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByTestId('notebook-list-new'));
    expect(onCreate).toHaveBeenCalled();
  });

  it('empty list shows hint', () => {
    render(<NotebookList entries={[]} onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByTestId('notebook-list-empty')).toBeTruthy();
  });

  it('firstLineText strips markdown markers + truncates at 80', () => {
    expect(firstLineText('# Heading\n\nbody text')).toBe('Heading');
    expect(firstLineText('**bold** and `code`')).toBe('bold and');
    expect(firstLineText('a'.repeat(100))).toMatch(/…$/);
    expect(firstLineText('').length).toBe(0);
  });

  it('sanger kind row uses 🧬 icon', () => {
    render(<NotebookList entries={ENTRIES} onSelect={vi.fn()} onCreate={vi.fn()} />);
    const row = screen.getByTestId('notebook-list-item-nb03');
    expect(row.textContent).toContain('🧬');
  });
});
