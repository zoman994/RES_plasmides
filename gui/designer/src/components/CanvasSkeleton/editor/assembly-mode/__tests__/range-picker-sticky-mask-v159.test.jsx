/**
 * V159 — RE-pair picker: the out-of-range MASK extends to the sticky-end
 * duplex extent so the protruding-strand overhang (5′ right / 3′ left) is no
 * longer dimmed («в тени»), while the CONFIRMED fragment range stays at the
 * top cuts (the top-cut convention keeps each shared overhang counted once
 * when adjacent RE fragments concatenate — extending the slice would double
 * the overhang at ligation junctions).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

// Capture the props handed to the embedded SequenceTab (heavy viewer stubbed).
let captured = {};
vi.mock('../../../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => { captured = props; return <div data-testid="seqtab-stub" />; },
}));

import RangePickerModal from '../RangePickerModal';

afterEach(() => { cleanup(); captured = {}; });

// Long enough that the extended end (24) is well inside the sequence.
const SRC = { name: 'pTest', sequence: 'A'.repeat(40), circular: false, annotations: [] };

function rePair(left, right) {
  act(() => { window.dispatchEvent(new CustomEvent('__v88_re_click__', { detail: left })); });
  act(() => { window.dispatchEvent(new CustomEvent('__v88_re_click__', { detail: right })); });
}

describe('V159 — picker mask covers the sticky-end overhang', () => {
  it('extends the mask past the right top cut for a 5′ overhang, confirm stays at the cut', () => {
    let got = null;
    render(<RangePickerModal source={SRC} onConfirm={(p) => { got = p; }} onCancel={() => {}} />);
    // blunt left (PvuII top cut @5) + 5′ right (EcoRI top cut @20, overhang +4)
    rePair({ enzyme: 'PvuII', position: 5 }, { enzyme: 'EcoRI', position: 20 });

    // Mask un-dims [5, 24] — the EcoRI bottom-strand AATT (20..24) is no longer shadowed.
    expect(captured.outOfRangeMask).toEqual({ start: 5, end: 24 });

    // The confirmed fragment range is still the top-cut span [5, 20].
    act(() => { fireEvent.click(screen.getByTestId('range-picker-confirm')); });
    expect(got).toEqual(expect.objectContaining({ start: 5, end: 20, acquisitionMethod: 'restriction' }));
    expect(got.acquisitionParams.enzymes).toEqual(['PvuII', 'EcoRI']);
  });

  it('extends the mask before the left top cut for a 3′ overhang', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    // 3′ left (PstI top cut @10, overhang −4) + blunt right (SmaI top cut @30)
    rePair({ enzyme: 'PstI', position: 10 }, { enzyme: 'SmaI', position: 30 });
    expect(captured.outOfRangeMask).toEqual({ start: 6, end: 30 });
  });

  it('blunt-only pair leaves the mask at the top cuts', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    rePair({ enzyme: 'PvuII', position: 5 }, { enzyme: 'SmaI', position: 25 });
    expect(captured.outOfRangeMask).toEqual({ start: 5, end: 25 });
  });
});
