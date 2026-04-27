/**
 * Sprint Import-Start-Screen K9 — entry-point cleanup regression.
 *
 * After K9, QuickStart has exactly 3 actions: 'import' / 'catalog' / 'free'.
 * Wizard-preset shortcuts (restriction / gibson / golden_gate / mutagenesis)
 * are removed, and the hidden file <input> picker is gone — drag-drop and the
 * ImportStartScreen modal cover those flows.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import QuickStart from '../components/QuickStart';

describe('QuickStart — post-K9 3-button layout', () => {
  it('renders exactly 3 actionable buttons (📂 Импортировать файл / 📚 Выбрать из каталога / 📦 Начать с нуля)', () => {
    const onAction = vi.fn();
    const { getByText, container } = render(<QuickStart onAction={onAction} />);
    expect(getByText(/Импортировать файл/)).toBeTruthy();
    expect(getByText(/Выбрать из каталога/)).toBeTruthy();
    expect(getByText(/Начать с нуля/)).toBeTruthy();
    // No hidden file input remains.
    expect(container.querySelector('input[type="file"]')).toBeNull();
    // No legacy preset buttons.
    expect(container.textContent).not.toMatch(/Рестрикционное клонирование/);
    expect(container.textContent).not.toMatch(/Gibson/);
    expect(container.textContent).not.toMatch(/Golden Gate/);
    expect(container.textContent).not.toMatch(/Мутагенез/);
    expect(container.textContent).not.toMatch(/Свободная сборка/);
  });

  it('Click 📂 Импортировать файл → onAction("import"); 📚 Выбрать из каталога → "catalog"; 📦 Начать с нуля → "free"', () => {
    const onAction = vi.fn();
    const { getByText } = render(<QuickStart onAction={onAction} />);
    fireEvent.click(getByText(/Импортировать файл/));
    fireEvent.click(getByText(/Выбрать из каталога/));
    fireEvent.click(getByText(/Начать с нуля/));
    expect(onAction.mock.calls.map(c => c[0])).toEqual(['import', 'catalog', 'free']);
  });
});
