/**
 * RS-LIN3 — the picker's кольцо/линия map shape (Игорь 22.06: «линейная — когда
 * сам входной фрагмент линейный … линейная колбаска тоже неплохо в добавок»).
 * A linear source defaults to (and stays) the linear «колбаска»; a circular source
 * defaults to the circular map but can toggle to linear.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import RangePickerModal from '../editor/assembly-mode/RangePickerModal';
import { bootstrapStore } from '../../../store';

afterEach(cleanup);
beforeEach(() => { try { bootstrapStore(); } catch { /* idempotent */ } });

const SEQ = `GAATTC${'A'.repeat(20)}GAATTC${'T'.repeat(20)}`;
const ANN = [{ id: 'f1', level: 'region', type: 'CDS', name: 'gene', start: 6, end: 26, strand: 1 }];
const linearSrc = { name: 'pLin', sequence: SEQ, circular: false, annotations: ANN };
const circularSrc = { name: 'pCirc', sequence: SEQ, circular: true, annotations: ANN };

const openVisual = (source) => {
  render(<RangePickerModal source={source} onConfirm={() => {}} onCancel={() => {}} />);
  fireEvent.click(screen.getByTestId('range-picker-tab-visual'));
};

describe('RangePickerModal — map shape (RS-LIN3)', () => {
  it('a LINEAR source shows the linear «колбаска», no circle, no shape toggle', () => {
    openVisual(linearSrc);
    expect(screen.getByTestId('linear-map-v2')).toBeTruthy();
    expect(screen.queryByTestId('plasmid-map-v2')).toBeNull();
    expect(screen.queryByTestId('range-picker-map-shape')).toBeNull();
  });

  it('a CIRCULAR source defaults to the circular map + offers a shape toggle', () => {
    openVisual(circularSrc);
    expect(screen.getByTestId('plasmid-map-v2')).toBeTruthy();
    expect(screen.queryByTestId('linear-map-v2')).toBeNull();
    expect(screen.getByTestId('range-picker-map-shape')).toBeTruthy();
  });

  it('toggling «Линия» switches a circular source to the linear view', () => {
    openVisual(circularSrc);
    fireEvent.click(screen.getByTestId('range-picker-map-linear'));
    expect(screen.getByTestId('linear-map-v2')).toBeTruthy();
    expect(screen.queryByTestId('plasmid-map-v2')).toBeNull();
  });
});
