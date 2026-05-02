/**
 * Sprint M-B.2 K5 — MultiInspector integration tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import MultiInspector from '../MultiInspector';

vi.mock('../../../PlasmidMiniMap', () => ({
  default: () => <div data-testid="mock-mini-map" />,
}));

const ITEMS = [
  { _fileName: 'a.gb', name: 'a', sequence: 'A'.repeat(2000), length: 2000, topology: 'circular', annotations: [{ id: 'r1', type: 'CDS', name: 'AmpR', start: 0, end: 100, level: 'region' }] },
  { _fileName: 'b.gb', name: 'b', sequence: 'A'.repeat(3000), length: 3000, topology: 'linear', annotations: [] },
  { _fileName: 'c.fasta', name: 'c', sequence: 'A'.repeat(500), length: 500, topology: 'linear', annotations: [] },
];

afterEach(cleanup);

describe('M-B.2 K5 — MultiInspector', () => {
  it('1) renders one row per parsedItem with active row highlighted', () => {
    render(
      <MultiInspector
        items={ITEMS}
        currentIdx={1}
        perFileFlags={{}}
        perFileEdits={{}}
        onSelect={() => {}}
        onUpdateFlags={() => {}}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.getByTestId('importer-multi-row-a.gb')).toBeTruthy();
    expect(screen.getByTestId('importer-multi-row-b.gb')).toBeTruthy();
    expect(screen.getByTestId('importer-multi-row-c.fasta')).toBeTruthy();
    expect(screen.getByTestId('importer-multi-row-b.gb').dataset.active).toBe('true');
    expect(screen.getByTestId('importer-multi-row-a.gb').dataset.active).toBe('false');
  });

  it('2) tristate master cycles 0/3 → 3/3 → 0/3 via onUpdateFlags', () => {
    const onUpdateFlags = vi.fn();
    const { rerender } = render(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{}}  // none on
        perFileEdits={{}}
        onSelect={() => {}}
        onUpdateFlags={onUpdateFlags}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={() => {}}
      />,
    );
    let master = screen.getByTestId('importer-multi-master');
    expect(master.dataset.state).toBe('off');
    expect(master.checked).toBe(false);

    fireEvent.click(master);
    // Should fire onUpdateFlags(fileName, {autoAnnotate:true}) for every file.
    expect(onUpdateFlags).toHaveBeenCalledTimes(3);
    for (const it of ITEMS) {
      expect(onUpdateFlags).toHaveBeenCalledWith(it._fileName, { autoAnnotate: true });
    }

    // Re-render with all flags ON; master should flip to checked.
    onUpdateFlags.mockClear();
    rerender(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{
          'a.gb': { autoAnnotate: true },
          'b.gb': { autoAnnotate: true },
          'c.fasta': { autoAnnotate: true },
        }}
        perFileEdits={{}}
        onSelect={() => {}}
        onUpdateFlags={onUpdateFlags}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={() => {}}
      />,
    );
    master = screen.getByTestId('importer-multi-master');
    expect(master.dataset.state).toBe('on');
    fireEvent.click(master);
    for (const it of ITEMS) {
      expect(onUpdateFlags).toHaveBeenCalledWith(it._fileName, { autoAnnotate: false });
    }
  });

  it('3) row × button calls onRemove(fileName) — does NOT also fire onSelect (stopPropagation)', () => {
    const onRemove = vi.fn();
    const onSelect = vi.fn();
    render(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{}}
        perFileEdits={{}}
        onSelect={onSelect}
        onUpdateFlags={() => {}}
        onUpdateEdits={() => {}}
        onRemove={onRemove}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('importer-multi-remove-b.gb'));
    expect(onRemove).toHaveBeenCalledWith('b.gb');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('4) row click selects the row → onSelect(idx)', () => {
    const onSelect = vi.fn();
    render(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{}}
        perFileEdits={{}}
        onSelect={onSelect}
        onUpdateFlags={() => {}}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('importer-multi-row-c.fasta'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('5) per-row autoAnnotate checkbox toggles only that file flag', async () => {
    const onUpdateFlags = vi.fn();
    render(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{ 'a.gb': { autoAnnotate: true } }}
        perFileEdits={{}}
        onSelect={() => {}}
        onUpdateFlags={onUpdateFlags}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={() => {}}
      />,
    );
    const cb = screen.getByTestId('importer-multi-annot-a.gb');
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    await waitFor(() => {
      expect(onUpdateFlags).toHaveBeenCalledWith('a.gb', { autoAnnotate: false });
    });
  });

  it('6) footer batch buttons forward action ids', () => {
    const onAction = vi.fn();
    render(
      <MultiInspector
        items={ITEMS}
        currentIdx={0}
        perFileFlags={{}}
        perFileEdits={{}}
        onSelect={() => {}}
        onUpdateFlags={() => {}}
        onUpdateEdits={() => {}}
        onRemove={() => {}}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByTestId('importer-multi-batch-library'));
    expect(onAction).toHaveBeenCalledWith('library-batch');
    fireEvent.click(screen.getByTestId('importer-multi-replace-all-link'));
    expect(onAction).toHaveBeenCalledWith('replace-all');
    fireEvent.click(screen.getByTestId('importer-multi-delete-all'));
    expect(onAction).toHaveBeenCalledWith('delete-all');
  });
});
