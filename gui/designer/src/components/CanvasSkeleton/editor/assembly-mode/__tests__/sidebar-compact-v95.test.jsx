/**
 * V95 — AssemblySidebar compact + collapsible. Default body collapsed
 * — видна только полоса заголовка «Контейнеры · N» с chevron и × close.
 * Chevron expand → видны filter input + список contenders.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import AssemblySidebar from '../AssemblySidebar';

const C = (id, name, seq = 'ATGC') => ({
  id, name, sequence: seq, topology: { circular: false }, annotations: [],
});

afterEach(cleanup);

describe('V95 — AssemblySidebar compact + collapsible', () => {
  it('по-умолчанию body свёрнут — filter input и items не видны', () => {
    render(<AssemblySidebar containers={[C('cA', 'pUC'), C('cB', 'pET')]} />);
    expect(screen.getByTestId('assembly-sidebar').getAttribute('data-collapsed')).toBe('true');
    expect(screen.queryByTestId('assembly-sidebar-filter')).toBeNull();
    expect(screen.queryAllByTestId('assembly-sidebar-item')).toHaveLength(0);
  });

  it('header показывает «Контейнеры · N» counter', () => {
    render(<AssemblySidebar containers={[C('cA', 'pUC'), C('cB', 'pET')]} />);
    const sidebar = screen.getByTestId('assembly-sidebar');
    expect(sidebar.textContent).toMatch(/Контейнеры/);
    expect(sidebar.textContent).toMatch(/· 2/);
  });

  it('chevron toggle раскрывает body — появляется filter + items', () => {
    render(<AssemblySidebar containers={[C('cA', 'pUC'), C('cB', 'pET')]} />);
    act(() => { fireEvent.click(screen.getByTestId('assembly-sidebar-toggle')); });
    expect(screen.getByTestId('assembly-sidebar').getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('assembly-sidebar-filter')).toBeTruthy();
    expect(screen.getAllByTestId('assembly-sidebar-item').length).toBe(2);
  });

  it('повторный chevron сворачивает body обратно', () => {
    render(<AssemblySidebar containers={[C('cA', 'pUC')]} />);
    act(() => { fireEvent.click(screen.getByTestId('assembly-sidebar-toggle')); });
    expect(screen.getByTestId('assembly-sidebar').getAttribute('data-collapsed')).toBe('false');
    act(() => { fireEvent.click(screen.getByTestId('assembly-sidebar-toggle')); });
    expect(screen.getByTestId('assembly-sidebar').getAttribute('data-collapsed')).toBe('true');
    expect(screen.queryByTestId('assembly-sidebar-filter')).toBeNull();
  });

  it('× close-button сохранён (V92) и вызывает onClose', () => {
    const onClose = vi.fn();
    render(<AssemblySidebar containers={[C('cA', 'pUC')]} onClose={onClose} />);
    act(() => { fireEvent.click(screen.getByTestId('assembly-sidebar-close')); });
    expect(onClose).toHaveBeenCalled();
  });
});
