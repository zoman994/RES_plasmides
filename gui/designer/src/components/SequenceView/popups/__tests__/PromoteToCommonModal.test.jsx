/**
 * PromoteToCommonModal (SPEC_COMMON_FEATURES DEC-CF-04/05). Prefill from the
 * region draft; live dedup probe surfaces a non-blocking name warning or a
 * blocking duplicate banner; confirm passes the edited fields to onCreate.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import PromoteToCommonModal from '../PromoteToCommonModal.jsx';

afterEach(cleanup);

const DRAFT = { name: 'GFP', type: 'CDS', sequence: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACC' };
const noDup = async () => ({ duplicate: false, by: null });

describe('PromoteToCommonModal', () => {
  it('prefills name / type / sequence from the draft', () => {
    render(<PromoteToCommonModal draft={DRAFT} checkCommonDuplicate={noDup} onCreate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('promote-modal-name').value).toBe('GFP');
    expect(screen.getByTestId('promote-modal-type').value).toBe('CDS');
    expect(screen.getByTestId('promote-modal-seq').value).toBe(DRAFT.sequence);
  });

  it('shows a non-blocking name-collision warning', async () => {
    const check = async () => ({ duplicate: false, by: 'name', against: { name: 'GFP' } });
    render(<PromoteToCommonModal draft={DRAFT} checkCommonDuplicate={check} onCreate={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('promote-modal-warn')).toBeTruthy());
    expect(screen.getByTestId('promote-modal-confirm').disabled).toBe(false);
  });

  it('blocks confirm on a true PSO duplicate', async () => {
    const check = async () => ({ duplicate: true, by: 'protein', against: { name: 'GFP' } });
    render(<PromoteToCommonModal draft={DRAFT} checkCommonDuplicate={check} onCreate={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('promote-modal-dup')).toBeTruthy());
    expect(screen.getByTestId('promote-modal-confirm').disabled).toBe(true);
  });

  it('confirm passes the edited fields to onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue({ ok: true });
    render(<PromoteToCommonModal draft={DRAFT} checkCommonDuplicate={noDup} onCreate={onCreate} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('promote-modal-confirm').disabled).toBe(false));
    fireEvent.change(screen.getByTestId('promote-modal-name'), { target: { value: 'GFPmut' } });
    fireEvent.click(screen.getByTestId('promote-modal-confirm'));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toEqual({ name: 'GFPmut', type: 'CDS', sequence: DRAFT.sequence });
  });

  it('Esc closes the modal', () => {
    const onClose = vi.fn();
    render(<PromoteToCommonModal draft={DRAFT} checkCommonDuplicate={noDup} onCreate={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('promote-to-common-modal'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
