/**
 * PieceCreateModal.test.jsx — T5 K5. Confirm dispatches name +
 * functionalLabel; auto-name default; method hint by origin; cancel/Esc.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PieceCreateModal from '../popups/PieceCreateModal';

afterEach(cleanup);

const base = (over = {}) => ({
  containerName: 'pUC19',
  range: { start: 100, end: 200, orientation: 'forward' },
  origin: 'selection',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  ...over,
});

describe('T5 K5 PieceCreateModal', () => {
  it('renders source/range info + auto-name default', () => {
    render(<PieceCreateModal {...base()} />);
    expect(screen.getByTestId('piece-create-modal')).toBeTruthy();
    expect(screen.getByText(/pUC19/)).toBeTruthy();
    expect(screen.getByText(/100/)).toBeTruthy();
    const name = screen.getByTestId('piece-name-input');
    expect(name.value).toBe('pUC19(100-200)');
  });

  it('confirm dispatches the (possibly edited) name + functionalLabel', () => {
    const onConfirm = vi.fn();
    render(<PieceCreateModal {...base({ onConfirm })} />);
    fireEvent.change(screen.getByTestId('piece-name-input'), { target: { value: 'U3 gRNA' } });
    fireEvent.change(screen.getByTestId('piece-fnlabel-input'), { target: { value: 'guide' } });
    fireEvent.click(screen.getByTestId('piece-create-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'U3 gRNA', functionalLabel: 'guide' });
  });

  it("origin 'feature' pre-fills name from featureName", () => {
    render(<PieceCreateModal {...base({ origin: 'feature', featureName: 'AmpR' })} />);
    expect(screen.getByTestId('piece-name-input').value).toBe('AmpR');
  });

  it('method hint = ПЦР for primer origins, undefined otherwise', () => {
    const { rerender } = render(<PieceCreateModal {...base()} />);
    expect(screen.getByTestId('piece-method-hint').textContent).toMatch(/не определён/);
    rerender(<PieceCreateModal {...base({ origin: 'existing-primers' })} />);
    expect(screen.getByTestId('piece-method-hint').textContent).toMatch(/ПЦР/);
  });

  it('cancel + Esc both call onCancel', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<PieceCreateModal {...base({ onCancel })} />);
    fireEvent.click(screen.getByTestId('piece-create-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<PieceCreateModal {...base({ onCancel })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('empty name → confirm falls back to the auto-name default', () => {
    const onConfirm = vi.fn();
    render(<PieceCreateModal {...base({ onConfirm })} />);
    fireEvent.change(screen.getByTestId('piece-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('piece-create-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ name: 'pUC19(100-200)', functionalLabel: null });
  });
});
