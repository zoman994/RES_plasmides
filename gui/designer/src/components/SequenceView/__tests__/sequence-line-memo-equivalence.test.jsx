/**
 * sequence-line-memo-equivalence.test.jsx — PERF-6 safety net.
 *
 * The custom SequenceLine memo comparator lets unchanged lines BAIL on a
 * sequence edit. A bug (a too-loose relaxed comparison) would leave a stale line
 * in the DOM. This test renders the viewer, applies an edit via rerender (which
 * exercises the memo: unchanged lines keep their prior DOM), and asserts the
 * resulting line text equals a FRESH render of the edited sequence. If any line
 * wrongly bailed, the two diverge and the test fails — empirical correctness
 * independent of reasoning about each track.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import SequenceView from '..';

afterEach(cleanup);

// A multi-line sequence with a CDS annotation so the feature + (when enabled)
// AA tracks participate. Deterministic, ~360 nt.
function genSeq(len, seed) {
  const b = 'ACGT'; let x = seed >>> 0; let s = '';
  for (let i = 0; i < len; i++) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; s += b[(x >>> 16) & 3]; }
  return s;
}
const SEQ = 'ATG' + genSeq(354, 7) + 'TAA';
const FRAG = (sequence) => ({
  id: 'f1', name: 'pTest', sequence, topology: 'linear',
  annotations: [{ id: 'cds1', type: 'CDS', level: 'region', start: 0, end: 60, name: 'orf', strand: 1 }],
});

function lineText(container) {
  return [...container.querySelectorAll('[data-testid="sequence-view-line"]')]
    .map((el) => `${el.dataset.lineStart}:${el.textContent}`).join('\n');
}

// Apply `op` to SEQ, render-then-rerender (memo path) vs fresh, assert equal.
function assertEquivalent(label, editedSeq) {
  const { container, rerender } = render(<SequenceView fragments={[FRAG(SEQ)]} />);
  rerender(<SequenceView fragments={[FRAG(editedSeq)]} />);
  const memoText = lineText(container);
  const fresh = render(<SequenceView fragments={[FRAG(editedSeq)]} />);
  const freshText = lineText(fresh.container);
  expect(memoText, `memo re-render diverged from fresh render: ${label}`).toBe(freshText);
}

describe('SequenceLine memo — edited render equals fresh render (no stale lines)', () => {
  it('substitution in the middle', () => {
    const i = 180;
    assertEquivalent('subst-mid', SEQ.slice(0, i) + (SEQ[i] === 'A' ? 'C' : 'A') + SEQ.slice(i + 1));
  });
  it('substitution at the very start (inside CDS)', () => {
    assertEquivalent('subst-start', 'T' + SEQ.slice(1));
  });
  it('substitution at the very end', () => {
    assertEquivalent('subst-end', SEQ.slice(0, -1) + (SEQ[SEQ.length - 1] === 'A' ? 'C' : 'A'));
  });
  it('insertion in the middle (shifts everything after)', () => {
    const i = 200;
    assertEquivalent('insert-mid', SEQ.slice(0, i) + 'G' + SEQ.slice(i));
  });
  it('insertion at the start (shifts the whole sequence + CDS)', () => {
    assertEquivalent('insert-start', 'G' + SEQ);
  });
  it('deletion in the middle', () => {
    const i = 150;
    assertEquivalent('delete-mid', SEQ.slice(0, i) + SEQ.slice(i + 1));
  });
  it('deletion at a line boundary (codon-straddle stress)', () => {
    // delete near a typical 150-char line boundary so a boundary codon shifts
    const i = 149;
    assertEquivalent('delete-boundary', SEQ.slice(0, i) + SEQ.slice(i + 1));
  });
});
