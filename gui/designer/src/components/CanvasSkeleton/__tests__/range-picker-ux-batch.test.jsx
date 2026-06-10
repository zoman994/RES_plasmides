/**
 * range-picker-ux-batch.test.jsx — WT-UX-14 + WT-UX-15.
 *
 * WT-UX-14: the Tm readout is gated to primer-sized selections — a fragment
 * (>60 nt) gets `showSelectionTm` falsy so «Tm 77°» can't be misread as
 * «anneals fine». WT-UX-15: the footer hint names the SELECTION method
 * («выделено: …»), not «метод:» (which read as the acquisition method).
 *
 * SequenceTab is stubbed to capture the props RangePickerModal passes it.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';

let lastProps = null;
vi.mock('../../Library/inspector/tabs/SequenceTab', () => ({
  default: (props) => { lastProps = props; return <div data-testid="seqtab-stub" />; },
}));

import RangePickerModal from '../editor/assembly-mode/RangePickerModal';

afterEach(() => { cleanup(); lastProps = null; });

const SRC = { name: 'pUC19', sequence: 'A'.repeat(300), circular: false, annotations: [] };

describe('WT-UX-14 — Tm readout gated to primer-sized selections', () => {
  it('fragment-sized default selection (300 bp) → showSelectionTm falsy', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    expect(lastProps).toBeTruthy();
    expect(lastProps.showSelectionTm).toBeFalsy();
  });

  it('primer-sized selection (≤60 nt) → showSelectionTm truthy', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '30' } });
    expect(lastProps.showSelectionTm).toBeTruthy();
  });
});

describe('WT-UX-15 — footer hint names the selection method, not «метод»', () => {
  it('numeric selection → «выделено: по координатам», no «метод:»', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId('range-picker-end'), { target: { value: '30' } });
    const panel = screen.getByTestId('range-picker-panel');
    expect(panel.textContent).not.toMatch(/метод:/);
    expect(panel.textContent).toMatch(/выделено: по координатам/);
  });

  it('default selection → hint uses «выделено:» (selection method), never «метод:»', () => {
    render(<RangePickerModal source={SRC} onConfirm={() => {}} onCancel={() => {}} />);
    const panel = screen.getByTestId('range-picker-panel');
    expect(panel.textContent).toMatch(/выделено:/);
    expect(panel.textContent).not.toMatch(/метод:/);
  });
});
