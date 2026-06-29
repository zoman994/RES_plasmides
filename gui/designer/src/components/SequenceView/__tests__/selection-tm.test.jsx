/**
 * selection-tm.test.jsx — V76: near-cursor annealing-Tm readout while a
 * DNA range is selected. Opt-in via `showSelectionTm` (PCR viewer
 * enables it; Library/Importer leave it off). Tm uses the v0.5-derived
 * SantaLucia NN `calcTm` (src/tm-calculator.js) — no new formula.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';
import { calcTm } from '../../../tm-calculator';

const SEQ = 'ATGGCATGCAAAGGTTTCCCGGGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGG';
const FRAGMENT = { id: 'f1', name: 'demo', type: 'misc_feature', sequence: SEQ, strand: 1, annotations: [] };

function resetSettings() {
  useStore.setState({
    sequenceView: {
      showBottomStrand: true, framesMode: 'auto', autoThreshold: 0.8,
      primerStyle: 'filled', reOrientation: 'vertical',
      predictions: { cds: true, sgRNA: false, promoter: false, terminator: false, threshold: 0.5 },
    },
  });
}
beforeEach(resetSettings);
afterEach(cleanup);

function renderSV(props) {
  return render(<SequenceView fragments={[FRAGMENT]} {...props} />);
}

describe('V76 — near-cursor selection Tm', () => {
  it('shows Tm tooltip for a DNA selection after pointer move', () => {
    renderSV({ showSelectionTm: true, caretAnchor: 0, caretPos: 22 });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    const tip = screen.getByTestId('sequence-view-tm-tooltip');
    expect(tip).toBeTruthy();
    const expected = calcTm(SEQ.slice(0, 22));
    expect(tip.textContent).toMatch(/Tm/i);
    expect(tip.textContent).toContain(String(expected));
  });

  it('no tooltip when showSelectionTm is off (default — Library/Importer)', () => {
    renderSV({ caretAnchor: 0, caretPos: 22 });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    expect(screen.queryByTestId('sequence-view-tm-tooltip')).toBeNull();
  });

  it('no tooltip without a selection (anchor === pos)', () => {
    renderSV({ showSelectionTm: true, caretAnchor: 10, caretPos: 10 });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    expect(screen.queryByTestId('sequence-view-tm-tooltip')).toBeNull();
  });

  it('no Tm for amino-acid selection (Tm is a DNA concept)', () => {
    renderSV({ showSelectionTm: true, caretAnchor: 0, caretPos: 22, selectionMode: 'aa' });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    expect(screen.queryByTestId('sequence-view-tm-tooltip')).toBeNull();
  });

  // Игорь 18.05.2026: для выделений >150 bp Tm НЕ считается (праймер
  // такой длины невозможен), НО счётчик нуклеотидов остаётся — убрана
  // только температура отжига.
  it('>150 bp: count stays, Tm is dropped', () => {
    const LONG = { ...FRAGMENT, sequence: 'ACGT'.repeat(60) }; // 240 bp
    render(<SequenceView fragments={[LONG]} showSelectionTm caretAnchor={0} caretPos={200} />);
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    const tip = screen.getByTestId('sequence-view-tm-tooltip');
    expect(tip).toBeTruthy();
    expect(tip.textContent).toContain('200 bp');
    expect(tip.textContent).not.toMatch(/Tm/i);
  });

  // RC-CLOSE-GATE (Игорь 25.06) — symmetric lower bound: a tiny selection (<7 bp)
  // can't anneal as a primer and the NN Tm there is unreliable (it produced a
  // nonsensical «−100.6 °C · 3 bp»). Drop the Tm, keep the nucleotide count.
  it('<7 bp selection: count stays, Tm is dropped (no garbage negative)', () => {
    renderSV({ showSelectionTm: true, caretAnchor: 0, caretPos: 3 });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    const tip = screen.getByTestId('sequence-view-tm-tooltip');
    expect(tip.textContent).toContain('3 bp');
    expect(tip.textContent).not.toMatch(/Tm/i);
  });

  it('Tm shows again at the 7 bp lower boundary', () => {
    renderSV({ showSelectionTm: true, caretAnchor: 0, caretPos: 7 });
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    expect(screen.getByTestId('sequence-view-tm-tooltip').textContent).toMatch(/Tm/i);
  });

  it('Tm still shows (with count) at the 150 bp boundary', () => {
    const LONG = { ...FRAGMENT, sequence: 'ACGT'.repeat(60) };
    render(<SequenceView fragments={[LONG]} showSelectionTm caretAnchor={0} caretPos={150} />);
    fireEvent.pointerMove(screen.getByTestId('sequence-view-root'), { clientX: 120, clientY: 90 });
    const tip = screen.getByTestId('sequence-view-tm-tooltip');
    expect(tip.textContent).toMatch(/Tm/i);
    expect(tip.textContent).toContain('150 bp');
  });
});
