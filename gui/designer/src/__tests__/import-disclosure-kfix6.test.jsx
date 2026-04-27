/**
 * Kfix-6 — disclosure pattern empty ↔ catalog inside ImportStartScreen.
 *
 * empty mode renders a purple «📚 Выбрать из каталога» strip below the
 * dropzone; clicking it expands CatalogTree inline + collapses the
 * dropzone to compact. A «▲ Свернуть каталог» button reverses it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import InputZone from '../components/ImportStartScreen/InputZone';

describe('InputZone — Kfix-6 disclosure strip', () => {
  it('empty mode renders purple disclosure strip when onExpandCatalog is provided', () => {
    const onExpand = vi.fn();
    const { getByTestId } = render(
      <InputZone mode="empty" onFiles={vi.fn()} onPasteText={vi.fn()} onExpandCatalog={onExpand} />
    );
    const strip = getByTestId('catalog-disclosure');
    expect(strip).toBeTruthy();
    expect(strip.textContent).toMatch(/каталога/);
    fireEvent.click(strip);
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('empty mode without onExpandCatalog renders no strip', () => {
    const { queryByTestId } = render(
      <InputZone mode="empty" onFiles={vi.fn()} onPasteText={vi.fn()} />
    );
    expect(queryByTestId('catalog-disclosure')).toBeNull();
  });

  it('compact mode never renders the strip', () => {
    const onExpand = vi.fn();
    const { queryByTestId } = render(
      <InputZone mode="compact" onFiles={vi.fn()} onPasteText={vi.fn()} onExpandCatalog={onExpand} />
    );
    expect(queryByTestId('catalog-disclosure')).toBeNull();
  });

  it('progress payload renders linear bar in empty mode (Kfix-7 hookup verified here)', () => {
    const { getByTestId } = render(
      <InputZone mode="empty" onFiles={vi.fn()} onPasteText={vi.fn()} progress={{ current: 2, total: 5 }} />
    );
    const bar = getByTestId('import-progress');
    expect(bar.textContent).toMatch(/2 из 5/);
    expect(bar.textContent).toMatch(/40%/);
  });

  it('progress with total<=1 hides bar (single-file = no progress noise)', () => {
    const { queryByTestId } = render(
      <InputZone mode="empty" onFiles={vi.fn()} onPasteText={vi.fn()} progress={{ current: 1, total: 1 }} />
    );
    expect(queryByTestId('import-progress')).toBeNull();
  });
});
