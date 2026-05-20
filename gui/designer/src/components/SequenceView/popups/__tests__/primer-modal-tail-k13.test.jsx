/**
 * primer-modal-tail-k13.test.jsx — M-CANVAS-WORKFLOW-UX K13.
 *
 * PrimerFromSelectionModal — extension: separate 5'-tail field +
 * helper buttons (snippet catalog + common RE sites) + binding/tail
 * split visualization. The biolog can paste a binding region from the
 * selection AND build up the tail with one-click helpers.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  render, screen, cleanup, fireEvent, act,
} from '@testing-library/react';
import PrimerFromSelectionModal from '../PrimerFromSelectionModal';

afterEach(cleanup);

const DRAFT = {
  name: '',
  sequence: 'AAAACCCCGGGGTTTTAAAA', // 20 nt binding region (from selection)
  direction: 'forward',
};

describe('K13 — tail field + helpers', () => {
  it('renders a 5\'-tail textarea + binding/tail split preview', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('primer-modal-tail')).toBeTruthy();
    expect(screen.getByTestId('primer-modal-tail-binding-viz')).toBeTruthy();
  });

  it('snippet helper «+ 6xHis» appends the snippet sequence to tail', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-snippet-6xHis')); });
    expect(screen.getByTestId('primer-modal-tail').value).toBe('CATCATCATCATCATCAT');
  });

  it('RE-site helper «+ NotI» appends GCGGCCGC (with padding) to tail', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-re-NotI')); });
    expect(screen.getByTestId('primer-modal-tail').value.includes('GCGGCCGC')).toBe(true);
  });

  it('typing a tail updates the binding/tail split preview length', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByTestId('primer-modal-tail'), { target: { value: 'GGGCCC' } });
    });
    const viz = screen.getByTestId('primer-modal-tail-binding-viz');
    expect(viz.textContent).toMatch(/tail 6/);
    expect(viz.textContent).toMatch(/binding 20/);
  });

  it('submit emits sequence = tail + binding, plus split fields', () => {
    let got = null;
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={(p) => { got = p; }} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-snippet-6xHis')); });
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-create')); });
    expect(got.tail).toBe('CATCATCATCATCATCAT');
    expect(got.binding).toBe('AAAACCCCGGGGTTTTAAAA');
    expect(got.sequence).toBe('CATCATCATCATCATCATAAAACCCCGGGGTTTTAAAA');
  });

  it('RC toggle reverses the binding region but leaves the tail intact', () => {
    let got = null;
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={(p) => { got = p; }} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-snippet-6xHis')); });
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-rc')); });
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-create')); });
    expect(got.direction).toBe('reverse');
    expect(got.tail).toBe('CATCATCATCATCATCAT');
    // Original binding AAAACCCCGGGGTTTTAAAA → RC = TTTTAAAACCCCGGGGTTTT
    expect(got.binding).toBe('TTTTAAAACCCCGGGGTTTT');
  });
});
