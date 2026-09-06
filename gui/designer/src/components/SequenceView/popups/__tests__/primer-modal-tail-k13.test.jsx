/**
 * primer-modal-tail-k13.test.jsx — M-CANVAS-WORKFLOW-UX K13, revised for P4.
 *
 * The 5'-tail field + helper buttons (snippet catalog + common RE sites) + final
 * order remain. P4 removed the standalone SiteDuplex `primer-modal-re-preview`
 * section, the occurrence chips, the redundant `primer-modal-tail-binding-viz`
 * length bar and the long legend: restriction context now lives only in the
 * unified inspector. The active-site flanking-protection warning is kept and must
 * still update as protective bases are prefixed.
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

describe('K13 / P4 — tail field + helpers, standalone RE preview removed', () => {
  it('renders the 5\'-tail textarea + helper groups but no standalone duplex / chips / length bar', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('primer-modal-tail')).toBeTruthy();
    expect(screen.getByText('5′-добавки (вспомогательное поле)')).toBeTruthy();
    expect(screen.getByPlaceholderText('Необязательно: сайт рестрикции, перекрытие или тег')).toBeTruthy();
    expect(screen.getByText('Часто используемые сайты рестрикции:')).toBeTruthy();
    // P4 — the removed surfaces are gone.
    expect(screen.queryByTestId('primer-modal-tail-binding-viz')).toBeNull();
    expect(screen.queryByTestId('primer-modal-re-preview')).toBeNull();
    expect(screen.queryByTestId('primer-modal-re-title')).toBeNull();
    expect(screen.queryByTestId('rs-duplex-label')).toBeNull();
    expect(screen.queryByText('Обвес:')).toBeNull();
    expect(screen.queryByText('RE:')).toBeNull();
  });

  it('always shows the final order sequence and updates it as tail + binding', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);

    const finalSequence = screen.getByTestId('primer-modal-final-sequence');
    expect(finalSequence.textContent).toBe(DRAFT.sequence);
    expect(finalSequence.style.fontFamily).toContain('var(--font-mono)');
    expect(screen.getByTestId('primer-modal-final-binding').textContent).toBe(DRAFT.sequence);

    act(() => {
      fireEvent.change(screen.getByTestId('primer-modal-tail'), { target: { value: 'ggtc' } });
    });

    expect(finalSequence.textContent).toBe(`GGTC${DRAFT.sequence}`);
    expect(screen.getByTestId('primer-modal-final-tail').textContent).toBe('GGTC');
    expect(screen.getByTestId('primer-modal-final-binding').textContent).toBe(DRAFT.sequence);
  });

  it('snippet helper «+ 6xHis» appends the snippet sequence to tail', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-snippet-6xHis')); });
    expect(screen.getByTestId('primer-modal-tail').value).toBe('CATCATCATCATCATCAT');
  });

  it('RE-site helper «+ NotI» appends the canonical bare recognition site to tail', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-re-NotI')); });
    expect(screen.getByTestId('primer-modal-tail').value).toBe('GCGGCCGC');
  });

  it('keeps the active-site flanking-protection warning and clears it when protective bases are prefixed', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);

    // EcoRI at tail position 0 → 0 of 1 protective bases.
    act(() => { fireEvent.click(screen.getByTestId('primer-modal-helper-re-EcoRI')); });
    expect(screen.getByTestId('primer-modal-tail').value).toBe('GAATTC');
    expect(screen.getByTestId('primer-modal-re-flanking-warning').textContent).toContain(
      'Перед EcoRI 0/1 защитных нт',
    );
    // Exactly one polite live region (the modal status). The inspector adds none.
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getAllByRole('status')[0].textContent).toContain('Перед EcoRI 0/1 защитных нт');

    // Prefix a protective base: the warning disappears.
    act(() => {
      fireEvent.change(screen.getByTestId('primer-modal-tail'), { target: { value: 'AGAATTC' } });
    });
    expect(screen.queryByTestId('primer-modal-re-flanking-warning')).toBeNull();
  });

  it('removes any stale flanking warning once the tail motif is edited away', () => {
    const draft = {
      ...DRAFT,
      tail: 'GAATTC',
      binding: DRAFT.sequence,
      sequence: `GAATTC${DRAFT.sequence}`,
    };
    render(<PrimerFromSelectionModal draft={draft} onCreate={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('primer-modal-re-flanking-warning')).toBeTruthy();

    act(() => {
      fireEvent.change(screen.getByTestId('primer-modal-tail'), { target: { value: 'GACTTC' } });
    });
    expect(screen.queryByTestId('primer-modal-re-flanking-warning')).toBeNull();
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

  it('does not offer Golden-Gate enzymes in the helper set', () => {
    render(<PrimerFromSelectionModal draft={DRAFT} onCreate={() => {}} onClose={() => {}} />);
    expect(screen.queryByTestId('primer-modal-helper-re-BsaI')).toBeNull();
  });
});
