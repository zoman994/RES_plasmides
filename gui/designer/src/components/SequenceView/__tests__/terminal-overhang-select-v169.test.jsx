/**
 * «Выделить до конца» (Игорь 22.06): a LINEAR fragment's terminal sticky-end
 * overhang that protrudes on the BOTTOM strand (a 5′ right end / a 3′ left end)
 * lives OUTSIDE the top-strand `fullSeq`, so the caret (which drives the top
 * strand) could not reach it — the right end was unselectable while the left
 * (top-strand) overhang selected fine. Now the caret domain extends over the
 * protruding overhang and Ctrl+C appends/prepends those bases (chosen behaviour:
 * «Тянуть + копировать выступ»).
 *
 * Pure pieces are unit-tested here; the caret-reach drag + the live band are
 * verified in the browser.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceTab from '../../Library/inspector/tabs/SequenceTab';
import { selectionSlice, terminalCaretBounds } from '../hooks/useSelectionState.js';

afterEach(cleanup);

const SEQ32 = 'AAAACCCCGGGGTTTTAAAACCCCGGGGTTTT'; // 32 bp, one line

describe('terminalCaretBounds — caret may reach the protruding overhang', () => {
  it('no terminalSelect → bounds are exactly [0, seqLength]', () => {
    expect(terminalCaretBounds(32, null)).toEqual({ min: 0, max: 32 });
  });
  it('right overhang → max extends by rightLen; left overhang → min goes negative', () => {
    expect(terminalCaretBounds(32, { rightLen: 4, leftLen: 0 })).toEqual({ min: 0, max: 36 });
    expect(terminalCaretBounds(32, { rightLen: 0, leftLen: 3 })).toEqual({ min: -3, max: 32 });
  });
});

describe('selectionSlice — copy includes the terminal overhang bases', () => {
  const seq = SEQ32;
  it('right: selection reaching past seqLength appends the overhang bases (clipped)', () => {
    const ts = { rightLen: 4, leftLen: 0, rightBases: 'TCGA', leftBases: '' };
    // [28, 36] → top strand [28,32] (last 4 nt) + all 4 overhang bases.
    expect(selectionSlice({ fullSeq: seq, anchor: 28, focus: 36, seqLength: 32, terminalSelect: ts }))
      .toBe(`${seq.slice(28, 32)}TCGA`);
    // partial overhang: [30, 34] → top [30,32] + first 2 overhang bases.
    expect(selectionSlice({ fullSeq: seq, anchor: 30, focus: 34, seqLength: 32, terminalSelect: ts }))
      .toBe(`${seq.slice(30, 32)}TC`);
  });
  it('left: selection reaching below 0 prepends the overhang bases (rightmost first)', () => {
    const ts = { rightLen: 0, leftLen: 4, rightBases: '', leftBases: 'TGCA' };
    // [-3, 5] → last 3 overhang bases ('GCA') + top strand [0,5].
    expect(selectionSlice({ fullSeq: seq, anchor: -3, focus: 5, seqLength: 32, terminalSelect: ts }))
      .toBe(`GCA${seq.slice(0, 5)}`);
  });
  it('without terminalSelect a >seqLength selection still wrap-stitches (circular path unchanged)', () => {
    // legacy circular behaviour: [30, 34] on a 32-mer → seq[30..32] + seq[0..2]
    expect(selectionSlice({ fullSeq: seq, anchor: 30, focus: 34, seqLength: 32 }))
      .toBe(seq.slice(30, 32) + seq.slice(0, 2));
  });
  it('a normal in-bounds selection is unaffected by a present terminalSelect', () => {
    const ts = { rightLen: 4, leftLen: 0, rightBases: 'TCGA', leftBases: '' };
    expect(selectionSlice({ fullSeq: seq, anchor: 4, focus: 8, seqLength: 32, terminalSelect: ts }))
      .toBe(seq.slice(4, 8));
  });
});

// 5′ stagger: right end protrudes on the bottom strand (the unselectable one).
const STAGGER_5PRIME = {
  left: { end: 'left', protruding: 'top', recessed: 'bottom', len: 4, seq: 'AGCT', type: '5prime' },
  right: { end: 'right', protruding: 'bottom', recessed: 'top', len: 4, seq: 'AGCT', type: '5prime' },
};

describe('SelectionOverlay — selection band reaches the protruding overhang', () => {
  it('caret past seqLength → a terminal selection rect covers the overhang columns', () => {
    render(
      <SequenceTab sequence={SEQ32} annotations={[]} topology="linear" name="x"
        terminalStagger={STAGGER_5PRIME} caretAnchor={20} caretPos={36} />,
    );
    const term = screen.getAllByTestId('sequence-view-selection')
      .find((n) => n.getAttribute('data-terminal-end') === 'right');
    expect(term).toBeTruthy();
    // 4-nt overhang → 4 columns wide; right edge sits past the duplex selection.
    const w = parseFloat(term.style.width);
    expect(w).toBeGreaterThan(0);
    const duplex = screen.getAllByTestId('sequence-view-selection')
      .filter((n) => !n.getAttribute('data-terminal-end'))
      .map((n) => parseFloat(n.style.left) + parseFloat(n.style.width));
    const termRight = parseFloat(term.style.left) + w;
    expect(termRight).toBeGreaterThan(Math.max(...duplex) - 0.01); // band continues to the end
  });

  it('in-bounds selection (no terminal reach) → no terminal rect', () => {
    render(
      <SequenceTab sequence={SEQ32} annotations={[]} topology="linear" name="x"
        terminalStagger={STAGGER_5PRIME} caretAnchor={4} caretPos={12} />,
    );
    const term = screen.queryAllByTestId('sequence-view-selection')
      .find((n) => n.getAttribute('data-terminal-end'));
    expect(term).toBeFalsy();
  });
});
