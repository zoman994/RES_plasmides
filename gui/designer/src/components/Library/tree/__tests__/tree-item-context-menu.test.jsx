import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useStore, bootstrapStore } from '../../../../store';
import TreeItemRow from '../TreeItemRow';

const ENTRY = {
  id: 'e1', name: 'pUC19', kind: 'sample', projectId: null,
  payload: { length: 2686, topology: 'circular', annotations: [] },
};

beforeEach(() => {
  try { bootstrapStore(); } catch { /* idempotent */ }
  useStore.setState((s) => {
    s.currentProjectId = 'proj1';
    s.projects = { proj1: { id: 'proj1', name: 'Проект А' } };
  });
});
afterEach(cleanup);

describe('TreeItemRow — правый клик: контекстное меню (фаза 4)', () => {
  it('правый клик открывает меню действий записи', () => {
    render(<TreeItemRow entry={ENTRY} />);
    expect(screen.queryByText('Удалить в Корзину')).toBeNull();
    fireEvent.contextMenu(screen.getByTestId('tree-item-e1'));
    expect(screen.getByText('Переименовать')).toBeTruthy();
    expect(screen.getByText('Скопировать в активный проект')).toBeTruthy();
    expect(screen.getByText('Извлечь в «Без проекта»')).toBeTruthy();
    expect(screen.getByText('Экспортировать .gb')).toBeTruthy();
    expect(screen.getByText('Удалить в Корзину')).toBeTruthy();
  });

  it('«Удалить в Корзину» вызывает markLibraryEntryPendingDelete(id)', async () => {
    const spy = vi.fn(() => Promise.resolve());
    useStore.setState((s) => { s.markLibraryEntryPendingDelete = spy; });
    render(<TreeItemRow entry={ENTRY} />);
    fireEvent.contextMenu(screen.getByTestId('tree-item-e1'));
    fireEvent.click(screen.getByText('Удалить в Корзину'));
    expect(spy).toHaveBeenCalledWith('e1');
  });

  it('«Извлечь» вызывает extractEntryToLoose(id) для записи в проекте', () => {
    const spy = vi.fn(() => Promise.resolve({ ok: true }));
    useStore.setState((s) => { s.extractEntryToLoose = spy; });
    render(<TreeItemRow entry={{ ...ENTRY, projectId: 'proj1' }} />);
    fireEvent.contextMenu(screen.getByTestId('tree-item-e1'));
    fireEvent.click(screen.getByText('Извлечь в «Без проекта»'));
    expect(spy).toHaveBeenCalledWith('e1');
  });

  it('«Скопировать» disabled, когда нет активного проекта', () => {
    useStore.setState((s) => { s.currentProjectId = null; });
    render(<TreeItemRow entry={ENTRY} />);
    fireEvent.contextMenu(screen.getByTestId('tree-item-e1'));
    const btn = screen.getByText('Скопировать в активный проект').closest('button');
    expect(btn.disabled).toBe(true);
  });

  it('правый клик не всплывает (preventDefault + stopPropagation)', () => {
    const parentCtx = vi.fn();
    render(<div onContextMenu={parentCtx}><TreeItemRow entry={ENTRY} /></div>);
    fireEvent.contextMenu(screen.getByTestId('tree-item-e1'));
    expect(parentCtx).not.toHaveBeenCalled();
  });
});
