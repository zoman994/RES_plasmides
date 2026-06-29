/**
 * PrimerPoolList — PRIMER-2/2b. Pins the flat pool list + status filter +
 * lifecycle advance + delete + scope badge. Store mutations are doubled here
 * (real promotePrimerStatus/removePrimerFromPool covered in primerSlice.test.js);
 * this test owns rendering / filtering / wiring.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PrimerPoolList from '../PrimerPoolList';
import { useStore } from '../../store';

function seed(primers) {
  const byId = {};
  for (const p of primers) byId[p.id] = p;
  useStore.setState({
    primersById: byId,
    _primersHydrated: true,
    projects: { 'PROJ-A': { id: 'PROJ-A', name: 'Проект А' } },
    currentProjectId: 'PROJ-A',
    libraryEntries: {},
    promotePrimerStatus: (id, status) => {
      const cur = useStore.getState().primersById;
      useStore.setState({ primersById: { ...cur, [id]: { ...cur[id], status } } });
    },
    removePrimerFromPool: (id) => {
      const cur = { ...useStore.getState().primersById };
      delete cur[id];
      useStore.setState({ primersById: cur });
    },
    updatePrimerFields: (id, patch) => {
      const cur = useStore.getState().primersById;
      const e = cur[id];
      if (!e) return null;
      const next = { ...e };
      if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
      if (Array.isArray(patch.tags)) next.tags = patch.tags;
      useStore.setState({ primersById: { ...cur, [id]: next } });
      return next;
    },
  });
}

beforeEach(() => {
  try { useStore.setState({ primersById: {}, _primersHydrated: true, libraryEntries: {} }); } catch { /* */ }
});

describe('PrimerPoolList', () => {
  it('default «active» filter lists non-archived and hides archived', () => {
    seed([
      { id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered', projectId: 'PROJ-A' },
      { id: 'p2', name: 'old', sequence: 'TTTTTTTT', status: 'archived' },
    ]);
    render(<PrimerPoolList />);
    expect(screen.getByTestId('primer-pool-row-p1')).toBeTruthy();
    expect(screen.queryByTestId('primer-pool-row-p2')).toBeNull();
    expect(screen.getByTestId('primer-pool-count').textContent).toContain('1');
  });

  it('filter «all» reveals archived primers', () => {
    seed([
      { id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered' },
      { id: 'p2', name: 'old', sequence: 'TTTTTTTT', status: 'archived' },
    ]);
    render(<PrimerPoolList />);
    fireEvent.change(screen.getByTestId('primer-pool-status-filter'), { target: { value: 'all' } });
    expect(screen.getByTestId('primer-pool-row-p2')).toBeTruthy();
  });

  it('advance moves ordered → received (status pill updates)', () => {
    seed([{ id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered' }]);
    render(<PrimerPoolList />);
    expect(screen.getByTestId('primer-status-pill-p1').textContent).toBe('Заказан');
    fireEvent.click(screen.getByTestId('primer-status-advance-p1'));
    expect(screen.getByTestId('primer-status-pill-p1').textContent).toBe('Получен');
  });

  it('archive button moves a primer to archived (then hidden under active filter)', () => {
    seed([{ id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'designed' }]);
    render(<PrimerPoolList />);
    fireEvent.click(screen.getByTestId('primer-status-archive-p1'));
    expect(screen.queryByTestId('primer-pool-row-p1')).toBeNull();
  });

  it('delete removes the row from the pool', () => {
    seed([{ id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered' }]);
    render(<PrimerPoolList />);
    fireEvent.click(screen.getByTestId('primer-pool-delete-p1'));
    expect(screen.queryByTestId('primer-pool-row-p1')).toBeNull();
  });

  it('scope badge reads «текущий» for the active project, «Библиотека» for orphans', () => {
    seed([
      { id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered', projectId: 'PROJ-A' },
      { id: 'p2', name: 'L1', sequence: 'ACGTACGT', status: 'ordered', projectId: null },
    ]);
    render(<PrimerPoolList />);
    expect(screen.getByTestId('primer-pool-scope-p1').textContent).toContain('текущий');
    expect(screen.getByTestId('primer-pool-scope-p2').textContent).toBe('Библиотека');
  });

  it('empty pool shows the empty hint', () => {
    seed([]);
    render(<PrimerPoolList />);
    expect(screen.getByTestId('primer-pool-empty')).toBeTruthy();
  });

  it('inline rename: click name → edit → Enter commits via updatePrimerFields', () => {
    seed([{ id: 'p1', name: 'oldName', sequence: 'ACGTACGT', status: 'ordered' }]);
    render(<PrimerPoolList />);
    fireEvent.click(screen.getByTestId('primer-pool-name-p1'));
    const input = screen.getByTestId('primer-pool-name-input-p1');
    fireEvent.change(input, { target: { value: 'renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().primersById.p1.name).toBe('renamed');
    expect(screen.getByTestId('primer-pool-name-p1').textContent).toBe('renamed');
  });

  it('add a tag: chip appears + persisted via updatePrimerFields', () => {
    seed([{ id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered', tags: [] }]);
    render(<PrimerPoolList />);
    fireEvent.click(screen.getByTestId('primer-pool-tag-add-p1'));
    const input = screen.getByTestId('primer-pool-tag-input-p1');
    fireEvent.change(input, { target: { value: 'колония' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useStore.getState().primersById.p1.tags).toEqual(['колония']);
    expect(screen.getByTestId('primer-pool-tag-p1-колония')).toBeTruthy();
  });

  it('remove a tag: × drops it from the primer', () => {
    seed([{ id: 'p1', name: 'F1', sequence: 'ACGTACGT', status: 'ordered', tags: ['a', 'b'] }]);
    render(<PrimerPoolList />);
    fireEvent.click(screen.getByTestId('primer-pool-tag-remove-p1-a'));
    expect(useStore.getState().primersById.p1.tags).toEqual(['b']);
  });

  it('tag filter narrows the list to primers carrying that tag', () => {
    seed([
      { id: 'p1', name: 'A', sequence: 'ACGTACGT', status: 'ordered', tags: ['seq'] },
      { id: 'p2', name: 'B', sequence: 'ACGTACGT', status: 'ordered', tags: ['колония'] },
    ]);
    render(<PrimerPoolList />);
    fireEvent.change(screen.getByTestId('primer-pool-tag-filter'), { target: { value: 'seq' } });
    expect(screen.getByTestId('primer-pool-row-p1')).toBeTruthy();
    expect(screen.queryByTestId('primer-pool-row-p2')).toBeNull();
  });
});
