/**
 * PiecePrimersPickModal.test.jsx — T5 K6. Pick fwd/rev primers →
 * binding preview via buildPieceFromExistingPrimers; confirm gated on
 * a valid amplicon; empty-primers hint; Esc/cancel.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import PiecePrimersPickModal from '../popups/PiecePrimersPickModal';

afterEach(cleanup);

// container 'AAAACCCCGGGGTTTTACGTACGT' — fwd AAAACCCC @0, revRC ACGTACGT @16.
const primers = [
  { id: 'pf', name: 'F1', sequence: 'AAAACCCC' },
  { id: 'pr', name: 'R1', sequence: 'ACGTACGT' },
  { id: 'bad', name: 'X', sequence: 'ZZZZ' },
];
const base = (over = {}) => ({
  containerId: 'c-1',
  containerName: 'pUC',
  containerSequence: 'AAAACCCCGGGGTTTTACGTACGT',
  primers,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
  ...over,
});

describe('T5 K6 PiecePrimersPickModal', () => {
  it('renders fwd/rev selects + binding hint until both chosen', () => {
    render(<PiecePrimersPickModal {...base()} />);
    expect(screen.getByTestId('primers-pick-modal')).toBeTruthy();
    expect(screen.getByTestId('primer-pick-fwd')).toBeTruthy();
    expect(screen.getByTestId('primer-pick-rev')).toBeTruthy();
    expect(screen.getByTestId('primers-pick-status').textContent).toMatch(/Выберите оба/);
    expect(screen.getByTestId('primers-pick-confirm').disabled).toBe(true);
  });

  it('valid pair → amplicon preview + confirm enabled + correct payload', () => {
    const onConfirm = vi.fn();
    render(<PiecePrimersPickModal {...base({ onConfirm })} />);
    fireEvent.change(screen.getByTestId('primer-pick-fwd'), { target: { value: 'pf' } });
    fireEvent.change(screen.getByTestId('primer-pick-rev'), { target: { value: 'pr' } });
    expect(screen.getByTestId('primers-pick-status').textContent).toMatch(/Ампликон/);
    const confirm = screen.getByTestId('primers-pick-confirm');
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.origin).toBe('existing-primers');
    expect(arg.acquisitionMethod).toBe('pcr');
    expect(arg.ranges[0]).toMatchObject({ sourceId: 'c-1', start: 0 });
    expect(arg.name).toBeTruthy();
  });

  it('binding not found → error + confirm stays disabled', () => {
    render(<PiecePrimersPickModal {...base()} />);
    fireEvent.change(screen.getByTestId('primer-pick-fwd'), { target: { value: 'bad' } });
    fireEvent.change(screen.getByTestId('primer-pick-rev'), { target: { value: 'pr' } });
    expect(screen.getByTestId('primers-pick-status').textContent).toMatch(/не найден/);
    expect(screen.getByTestId('primers-pick-confirm').disabled).toBe(true);
  });

  it('empty primer list → empty hint', () => {
    render(<PiecePrimersPickModal {...base({ primers: [] })} />);
    expect(screen.getByTestId('primers-pick-status').textContent).toMatch(/Праймеров пока нет/);
  });

  it('cancel + Esc call onCancel', () => {
    const onCancel = vi.fn();
    const { rerender } = render(<PiecePrimersPickModal {...base({ onCancel })} />);
    fireEvent.click(screen.getByTestId('primers-pick-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    rerender(<PiecePrimersPickModal {...base({ onCancel })} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
