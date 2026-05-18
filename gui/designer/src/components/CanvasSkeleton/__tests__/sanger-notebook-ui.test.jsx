/**
 * sanger-notebook-ui.test.jsx — T10 K5/K6/K7.
 * SangerStatusPicker / SangerCloneRow / SangerLabNotebook.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, within,
} from '@testing-library/react';
import SangerStatusPicker from '../canvas/SangerStatusPicker';
import SangerCloneRow from '../canvas/SangerCloneRow';
import SangerLabNotebook from '../canvas/SangerLabNotebook';

afterEach(cleanup);

describe('T10 K5 — SangerStatusPicker', () => {
  it('renders 4 segments; active reflects status; onSet fires', () => {
    const onSet = vi.fn();
    render(<SangerStatusPicker status="verified" onSet={onSet} />);
    const picker = screen.getByTestId('sanger-status-picker');
    expect(picker.querySelector('[data-status="verified"]').getAttribute('data-active')).toBe('true');
    fireEvent.click(within(picker).getByTestId('sanger-status-failed'));
    expect(onSet).toHaveBeenCalledWith('failed');
    fireEvent.click(within(picker).getByTestId('sanger-status-reset'));
    expect(onSet).toHaveBeenCalledWith(null);
  });
});

describe('T10 K6 — SangerCloneRow', () => {
  const clone = { cloneId: 'c1', label: 'clone 1', sangerVerified: 'pending', notes: '' };

  it('status click dispatches SET_CLONE_SANGER_STATUS', () => {
    const dispatch = vi.fn();
    render(<SangerCloneRow clone={clone} opId="op1" dispatch={dispatch} />);
    fireEvent.click(within(screen.getByTestId('sanger-clone-row')).getByTestId('sanger-status-verified'));
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_CLONE_SANGER_STATUS', operationId: 'op1', cloneId: 'c1', status: 'verified',
    });
  });

  it('notes blur dispatches SET_CLONE_NOTES only when changed', () => {
    const dispatch = vi.fn();
    render(<SangerCloneRow clone={clone} opId="op1" dispatch={dispatch} />);
    const ta = screen.getByTestId('sanger-clone-notes');
    fireEvent.blur(ta); // unchanged → no dispatch
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.change(ta, { target: { value: 'mutation at 234' } });
    fireEvent.blur(ta);
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_CLONE_NOTES', operationId: 'op1', cloneId: 'c1', notes: 'mutation at 234',
    });
  });

  it('label click → input → Enter dispatches SET_CLONE_LABEL', () => {
    const dispatch = vi.fn();
    render(<SangerCloneRow clone={clone} opId="op1" dispatch={dispatch} />);
    fireEvent.click(screen.getByTestId('sanger-clone-label'));
    const input = screen.getByTestId('sanger-clone-label-input');
    fireEvent.change(input, { target: { value: 'best' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_CLONE_LABEL', operationId: 'op1', cloneId: 'c1', label: 'best',
    });
  });

  it('row carries data-status', () => {
    render(<SangerCloneRow clone={{ ...clone, sangerVerified: 'failed' }} opId="op1" dispatch={vi.fn()} />);
    expect(screen.getByTestId('sanger-clone-row').getAttribute('data-status')).toBe('failed');
  });
});

describe('T10 K7 — SangerLabNotebook', () => {
  function st() {
    return {
      containers: [{ id: 'prod', name: 'p', zoneId: 'z1' }, { id: 'c2', name: 'p2', zoneId: 'z1' }],
      operations: [{
        id: 'op1', kind: 'gibson', zoneId: 'z1',
        materializedClones: [
          { cloneId: 'prod', label: 'clone 1', sangerVerified: 'verified', notes: '' },
          { cloneId: 'c2', label: 'clone 2', sangerVerified: 'pending', notes: '' },
        ],
      }],
      zones: [{ id: 'z1', name: 'My Zone' }],
      pieces: [],
    };
  }

  it('renders header + zone name + summary counts + rows', () => {
    render(<SangerLabNotebook state={st()} dispatch={vi.fn()} zoneId="z1" onClose={vi.fn()} />);
    const nb = screen.getByTestId('sanger-lab-notebook');
    expect(nb.textContent).toMatch(/My Zone/);
    expect(nb.textContent).toMatch(/1 подтверждено/);
    expect(nb.textContent).toMatch(/1 в ожидании/);
    expect(screen.getAllByTestId('sanger-clone-row')).toHaveLength(2);
  });

  it('filter "verified" hides non-verified rows', () => {
    render(<SangerLabNotebook state={st()} dispatch={vi.fn()} zoneId="z1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('sanger-filter-verified'));
    const rows = screen.getAllByTestId('sanger-clone-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-status')).toBe('verified');
  });

  it('empty zone → empty hint', () => {
    render(<SangerLabNotebook state={st()} dispatch={vi.fn()} zoneId="zEmpty" onClose={vi.fn()} />);
    expect(screen.getByTestId('sanger-lab-notebook').textContent).toMatch(/Нет materialized/);
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(<SangerLabNotebook state={st()} dispatch={vi.fn()} zoneId="z1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('sanger-notebook-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
