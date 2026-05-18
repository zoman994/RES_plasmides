/**
 * skeleton-primer-order-r6.test.jsx — Primer ordering UI.
 *
 * R6-3 (14.05.2026). Verifies:
 *   - Panel hidden by default, toggle открывает.
 *   - Empty oligo list → empty message.
 *   - Format switching TSV / FASTA / plain.
 *   - Close button hides panel.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkeletonProvider } from '../store/skeleton-context';
import PrimerOrderPanel from '../PrimerOrderPanel';

function renderWithProvider() {
  return render(
    <SkeletonProvider>
      <PrimerOrderPanel />
    </SkeletonProvider>,
  );
}

describe('R6-3 — PrimerOrderPanel UI', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue() },
      configurable: true,
    });
  });

  it('Toggle button is rendered always', () => {
    renderWithProvider();
    expect(screen.getByTestId('skeleton-primer-order-toggle')).toBeTruthy();
  });

  it('Panel hidden by default', () => {
    renderWithProvider();
    expect(screen.queryByTestId('skeleton-primer-order-panel')).toBeNull();
  });

  it('Click toggle opens panel', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('skeleton-primer-order-toggle'));
    expect(screen.getByTestId('skeleton-primer-order-panel')).toBeTruthy();
  });

  it('Close button hides panel', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('skeleton-primer-order-toggle'));
    fireEvent.click(screen.getByTestId('skeleton-primer-order-close'));
    expect(screen.queryByTestId('skeleton-primer-order-panel')).toBeNull();
  });

  it('Empty state shows "Нет олигонуклеотидов" message', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('skeleton-primer-order-toggle'));
    expect(screen.getByText(/Нет олигонуклеотидов/)).toBeTruthy();
  });

  it('Format switcher работает (TSV / FASTA / plain)', () => {
    renderWithProvider();
    fireEvent.click(screen.getByTestId('skeleton-primer-order-toggle'));
    const sel = screen.getByTestId('skeleton-primer-order-format');
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('tsv');
    fireEvent.change(sel, { target: { value: 'fasta' } });
    expect(sel.value).toBe('fasta');
    fireEvent.change(sel, { target: { value: 'plain' } });
    expect(sel.value).toBe('plain');
  });
});
