/**
 * K1.5 — SearchFilterChips: ONLY removable filter chips. Each chip's remove
 * control is a type=button with a localized accessible name (supplied by the
 * caller — no hardcoded strings). `disabled` blocks removal. Fixed-domain
 * labels (ДНК/Праймер/Фермент) and «remove all» are NOT this component's job —
 * they belong to the mode slot / K2.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SearchFilterChips from '../SearchFilterChips';

afterEach(cleanup);

const CHIPS = [
  { id: 'c0', label: 'тег: his', removeLabel: 'Удалить фильтр тег: his' },
  { id: 'c1', label: 'тип: circular', removeLabel: 'Удалить фильтр тип: circular' },
];

describe('SearchFilterChips', () => {
  it('renders every chip label', () => {
    render(<SearchFilterChips chips={CHIPS} onRemove={vi.fn()} />);
    expect(screen.getByTestId('search-chip-c0').textContent).toMatch(/тег: his/);
    expect(screen.getByTestId('search-chip-c1').textContent).toMatch(/тип: circular/);
  });

  it('each chip has a type=button remove control with the localized accessible name', () => {
    render(<SearchFilterChips chips={CHIPS} onRemove={vi.fn()} />);
    const btn = screen.getByTestId('search-chip-remove-c0');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('Удалить фильтр тег: his');
  });

  it('clicking a remove control calls onRemove with the chip id', () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips chips={CHIPS} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('search-chip-remove-c1'));
    expect(onRemove).toHaveBeenCalledWith('c1');
  });

  it('disabled blocks removal (buttons disabled, no callback)', () => {
    const onRemove = vi.fn();
    render(<SearchFilterChips chips={CHIPS} onRemove={onRemove} disabled />);
    const btn = screen.getByTestId('search-chip-remove-c0');
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('does not set outline:none on the remove control', () => {
    render(<SearchFilterChips chips={CHIPS} onRemove={vi.fn()} />);
    expect(screen.getByTestId('search-chip-remove-c0').style.outlineStyle).not.toBe('none');
  });

  it('fail-closed: a whitespace-only removeLabel renders no remove button (never an unnamed control)', () => {
    render(<SearchFilterChips chips={[{ id: 'c9', label: 'blank', removeLabel: '   ' }]} onRemove={vi.fn()} />);
    expect(screen.getByTestId('search-chip-c9')).toBeTruthy(); // the chip itself still shows the active filter
    expect(screen.queryByTestId('search-chip-remove-c9')).toBeNull(); // but no button without an accessible name
  });

  it('fail-closed: a missing removeLabel also renders no remove button', () => {
    render(<SearchFilterChips chips={[{ id: 'c8', label: 'nolabel' }]} onRemove={vi.fn()} />);
    expect(screen.queryByTestId('search-chip-remove-c8')).toBeNull();
  });

  it('renders nothing for an empty / missing chip list', () => {
    const { container, rerender } = render(<SearchFilterChips chips={[]} onRemove={vi.fn()} />);
    expect(container.querySelectorAll('[data-testid^="search-chip-"]').length).toBe(0);
    rerender(<SearchFilterChips onRemove={vi.fn()} />);
    expect(container.querySelectorAll('[data-testid^="search-chip-"]').length).toBe(0);
  });
});
