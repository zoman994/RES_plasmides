/**
 * Sprint M-B.1 K6 — AutonameModal unit tests (DEC-IMP-10 rewrite v1.1).
 *
 * Covers the three behaviours from §6 K6 and §10 open question 2:
 *   1) Default action labels with the suggested name; click → onApply(suggested).
 *   2) Custom name typed into the input → onApply receives the typed value.
 *   3) Advanced toggle reveals the two legacy actions (Replace / Skip).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AutonameModal from '../modals/AutonameModal';

const EXISTING = {
  id: 'lib-1',
  name: 'pUC19',
  payload: { length: 2686 },
  addedAt: '2026-04-30T10:00:00Z',
};

beforeEach(() => cleanup());

describe('M-B.1 K6 — AutonameModal', () => {
  it('1) primary button label matches the suggested name + click fires onApply(suggested)', () => {
    const onApply = vi.fn();
    render(
      <AutonameModal
        baseName="pUC19"
        suggested="pUC19 (1)"
        existing={EXISTING}
        onApply={onApply}
        onReplace={() => {}}
        onSkip={() => {}}
        onCancel={() => {}}
      />,
    );
    const primary = screen.getByTestId('importer-autoname-primary');
    expect(primary.textContent).toContain('pUC19 (1)');
    fireEvent.click(primary);
    expect(onApply).toHaveBeenCalledWith('pUC19 (1)');
  });

  it('2) editable input + Apply → onApply receives the typed custom name', () => {
    const onApply = vi.fn();
    render(
      <AutonameModal
        baseName="pUC19"
        suggested="pUC19 (1)"
        existing={EXISTING}
        onApply={onApply}
        onReplace={() => {}}
        onSkip={() => {}}
        onCancel={() => {}}
      />,
    );
    const input = screen.getByTestId('importer-autoname-input');
    fireEvent.change(input, { target: { value: 'my-pUC19-fork' } });
    fireEvent.click(screen.getByTestId('importer-autoname-primary'));
    expect(onApply).toHaveBeenCalledWith('my-pUC19-fork');
  });

  it('3) Advanced caret expands to reveal Replace + Skip buttons', () => {
    const onReplace = vi.fn();
    const onSkip = vi.fn();
    render(
      <AutonameModal
        baseName="pUC19"
        suggested="pUC19 (1)"
        existing={EXISTING}
        onApply={() => {}}
        onReplace={onReplace}
        onSkip={onSkip}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByTestId('importer-autoname-advanced')).toBeNull();

    fireEvent.click(screen.getByTestId('importer-autoname-advanced-toggle'));
    expect(screen.getByTestId('importer-autoname-advanced')).toBeTruthy();
    fireEvent.click(screen.getByTestId('importer-autoname-replace'));
    expect(onReplace).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('importer-autoname-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});
