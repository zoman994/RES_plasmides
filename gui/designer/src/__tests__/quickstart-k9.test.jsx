/**
 * Sprint Catalog Polish K4 (V45) — QuickStart entry-point cleanup.
 *
 * Post-K4: PRIMARY 2 → 1 («Старт сборки» merges import + catalog), so the
 * empty-canvas welcome screen offers 2 actionable buttons total:
 *   📂 Старт сборки  → onAction('import')  (file · catalog · paste)
 *   📦 Начать с нуля → onAction('free')    (palette drag)
 *
 * The legacy 3-action layout (import / catalog / free) is retired here —
 * see `docs/SPRINT_CATALOG_POLISH.md` §6 K4. Older test name preserved for
 * git history continuity.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import QuickStart from '../components/QuickStart';

describe('QuickStart — post-Catalog-Polish K4 2-button layout', () => {
  it('renders exactly 2 actionable buttons (📂 Старт сборки / 📦 Начать с нуля), no «Каталог»', () => {
    const onAction = vi.fn();
    const { getByText, container } = render(<QuickStart onAction={onAction} />);
    expect(getByText(/Старт сборки/)).toBeTruthy();
    expect(getByText(/Начать с нуля/)).toBeTruthy();
    // Catalog entry retired.
    expect(container.textContent).not.toMatch(/Выбрать из каталога/);
    expect(container.textContent).not.toMatch(/📚/);
    // No hidden file input remains.
    expect(container.querySelector('input[type="file"]')).toBeNull();
    // No legacy preset buttons.
    expect(container.textContent).not.toMatch(/Рестрикционное клонирование/);
    expect(container.textContent).not.toMatch(/Gibson/);
    expect(container.textContent).not.toMatch(/Golden Gate/);
    expect(container.textContent).not.toMatch(/Мутагенез/);
    expect(container.textContent).not.toMatch(/Свободная сборка/);
  });

  it('Click 📂 Старт сборки → onAction("import"); 📦 Начать с нуля → onAction("free"); never onAction("catalog")', () => {
    const onAction = vi.fn();
    const { getByText } = render(<QuickStart onAction={onAction} />);
    fireEvent.click(getByText(/Старт сборки/));
    fireEvent.click(getByText(/Начать с нуля/));
    expect(onAction.mock.calls.map(c => c[0])).toEqual(['import', 'free']);
    expect(onAction.mock.calls.map(c => c[0])).not.toContain('catalog');
  });
});
