/**
 * primer-track-tail.test.jsx — overlap-tail rendering fix (file 2).
 *
 * Overlap-PCR primers carry a 5'-overhang `tail` (built in primer-derive.js).
 * PrimerTrack drew only the binding arrow → two internal primers butted at the
 * boundary, no visible overlap. Now, when `hit.tail` is a non-empty string, a
 * separate semi-transparent tail segment is drawn beside the binding arrow
 * (forward: left of binding; reverse: right), with the tail bases inscribed,
 * and the click hit-target extended to cover it. Strictly additive — primers
 * without a tail render exactly as before.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import PrimerTrack from '../tracks/PrimerTrack';

afterEach(cleanup);

// Binding 'ACGTACGTACGT' (12 nt, ≥ findHits 10-min) is its own reverse
// complement (ACGT repeat), so a reverse primer finds it at the same spot.
const BINDING = 'ACGTACGTACGT';
const SEQ = BINDING + 'T'.repeat(40);
const base = {
  fullSeq: SEQ, lineStart: 0, lineLen: SEQ.length, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
};
const TAIL = 'GGGGG'; // 5 nt

describe('PrimerTrack — overlap tail segment', () => {
  it('forward primer with tail → tail rect drawn LEFT of binding (x = -tailW) + tail bases', () => {
    const p = {
      name: 'fwd', direction: 'forward', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(tail.getAttribute('data-primer-tail-direction')).toBe('forward');
    expect(Number(tail.getAttribute('x'))).toBeCloseTo(-(TAIL.length * 7.2), 3);
    expect(Number(tail.getAttribute('width'))).toBeCloseTo(TAIL.length * 7.2, 3);
    // semi-transparent (not solid like the binding arrow)
    expect(Number(tail.getAttribute('fill-opacity'))).toBeLessThan(1);
    // tail bases come from hit.tail, not the template slice
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(TAIL);
  });

  it('reverse primer with tail → tail rect drawn RIGHT of binding (x = W)', () => {
    const p = {
      name: 'rev', direction: 'reverse', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(tail.getAttribute('data-primer-tail-direction')).toBe('reverse');
    // W = binding length (12) * charPx
    expect(Number(tail.getAttribute('x'))).toBeCloseTo(12 * 7.2, 3);
    expect(Number(tail.getAttribute('width'))).toBeCloseTo(TAIL.length * 7.2, 3);
  });

  it('primer without a tail → no tail segment (unchanged behaviour)', () => {
    const p = { name: 'noTail', direction: 'forward', bindingSequence: BINDING };
    render(<PrimerTrack {...base} primers={[p]} />);
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull();
    // the binding arrow + bases still render
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();
  });

  it('clickable + tail → the hit-target rect is widened to cover the tail', () => {
    const p = {
      name: 'fwd', direction: 'forward', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING,
    };
    const { container } = render(<PrimerTrack {...base} primers={[p]} onPrimerClick={() => {}} />);
    const hitRect = container.querySelector('[data-primer-hit="true"]');
    expect(hitRect).toBeTruthy();
    // forward: hit-target starts left of the tail (x ≤ -tailW).
    expect(Number(hitRect.getAttribute('x'))).toBeLessThanOrEqual(-(TAIL.length * 7.2));
  });

  // The reverse tail sits to the RIGHT of binding [W, W+tailW]; the name label
  // must clear it (else the name renders on top of the tail bases).
  it('reverse: name label is placed PAST the tail (no overlap with the tail segment)', () => {
    const p = {
      name: 'rev', direction: 'reverse', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING, tmBinding: 60,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    const W = BINDING.length * 7.2;
    const label = screen.getByTestId('sequence-view-primer-label');
    expect(Number(label.getAttribute('x'))).toBeGreaterThanOrEqual(W + TAIL.length * 7.2);
  });

  it('reverse WITHOUT tail → label at W+4 (unchanged)', () => {
    const p = { name: 'rev', direction: 'reverse', bindingSequence: BINDING, tmBinding: 60 };
    render(<PrimerTrack {...base} primers={[p]} />);
    const W = BINDING.length * 7.2;
    expect(Number(screen.getByTestId('sequence-view-primer-label').getAttribute('x'))).toBeCloseTo(W + 4, 3);
  });

  it('forward: tail is on the left, so the right-side label is unaffected (W+HEAD+4)', () => {
    const p = {
      name: 'fwd', direction: 'forward', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING, tmBinding: 60,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    const W = BINDING.length * 7.2;
    expect(Number(screen.getByTestId('sequence-view-primer-label').getAttribute('x'))).toBeCloseTo(W + 6 + 4, 3);
  });
});

// Binding crosses a line-wrap (rendered as one PrimerTrack per line). The
// tail is a 5'-overhang → drawn ONCE, only on the fragment holding the 5'-end
// (forward: hit.start; reverse: hit.end), never duplicated at the wrap column.
// binding 'ACGTACGTACGT' sits at fullSeq[5..17); the wrap boundary is at 12.
const SPLIT_SEQ = `TTTTT${BINDING}${'T'.repeat(23)}`;
const splitLine = (lineStart, dir) => ({
  fullSeq: SPLIT_SEQ, lineStart, lineLen: 12, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
  primers: [{
    name: dir, direction: dir, bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING,
  }],
});

describe('PrimerTrack — tail drawn once at the 5′-end of a wrapped binding', () => {
  it('forward: tail on the start-fragment (line 0), none on the continuation (line 1)', () => {
    const { unmount } = render(<PrimerTrack {...splitLine(0, 'forward')} />);
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeTruthy(); // 5′ = start, on line 0
    unmount();
    render(<PrimerTrack {...splitLine(12, 'forward')} />);
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull(); // no spurious tail at wrap col
  });

  it('reverse: tail on the end-fragment (line 1), none on the start-fragment (line 0)', () => {
    const { unmount } = render(<PrimerTrack {...splitLine(0, 'reverse')} />);
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull(); // 5′ = end, not on line 0
    unmount();
    render(<PrimerTrack {...splitLine(12, 'reverse')} />);
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeTruthy(); // 5′ = end, on line 1
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Tail line-WRAP (Игорь 24.05.2026 — «хвосты праймеров не переносятся на
// другую строку»). When the binding sits flush at a line edge, the 5'-tail's
// columns belong to the NEIGHBOURING line. The tail must render THERE — at its
// own char columns — not stay glued to the binding (overflowing into the
// margin / past the line edge). PrimerTrack renders one instance per line
// (SequenceLine does this), so we render each line and assert where the tail
// lands.
const WBIND = 'ACGTACGTACGT';          // 12 nt, self-rev-comp → reverse reuse
const WTAIL = 'GGGGGG';                 // 6 nt
const txX = (el) => Number(/translate\(([-\d.]+)/.exec(el.getAttribute('transform'))[1]);

describe('PrimerTrack — 5′-tail wraps onto the adjacent line', () => {
  // binding at [20,32); two 20-col lines → 5' end (col 20) is flush at line 2's
  // start, so the 6-nt tail belongs to columns [14,20) on line 1.
  const FWD_SEQ = 'T'.repeat(20) + WBIND + 'T'.repeat(8); // len 40
  const fwdLine = (lineStart) => ({
    fullSeq: FWD_SEQ, lineStart, lineLen: 20, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    primers: [{ name: 'f', direction: 'forward', bindingSequence: WBIND, tail: WTAIL, sequence: WTAIL + WBIND }],
  });

  it('forward flush at line start: binding line shows the arrow but NO tail', () => {
    render(<PrimerTrack {...fwdLine(20)} />);
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();   // binding arrow here
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull(); // tail NOT glued here
  });

  it('forward flush at line start: the PREVIOUS line carries the full tail at cols [14,20)', () => {
    render(<PrimerTrack {...fwdLine(0)} />);
    expect(screen.queryByTestId('sequence-view-primer')).toBeNull();   // no binding on the prev line
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(WTAIL);
    // positioned at column 14 → translate x = (labelChars + 14) * charPx
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 14) * 7.2, 3);
    expect(Number(tail.getAttribute('width'))).toBeCloseTo(WTAIL.length * 7.2, 3);
  });

  // reverse: 16-col lines → binding [20,32) ends flush at line [16,32)'s edge,
  // so the tail belongs to columns [32,38) on the NEXT line [32,48).
  const REV_SEQ = 'T'.repeat(20) + WBIND + 'T'.repeat(8); // len 40
  const revLine = (lineStart) => ({
    fullSeq: REV_SEQ, lineStart, lineLen: 16, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    primers: [{ name: 'r', direction: 'reverse', bindingSequence: WBIND, tail: WTAIL, sequence: WTAIL + WBIND }],
  });

  it('reverse flush at line end: binding line shows the arrow but NO tail', () => {
    render(<PrimerTrack {...revLine(16)} />);
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull();
  });

  it('reverse flush at line end: the NEXT line carries the full tail at cols [32,38)', () => {
    render(<PrimerTrack {...revLine(32)} />);
    expect(screen.queryByTestId('sequence-view-primer')).toBeNull();
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(WTAIL);
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 0) * 7.2, 3);
  });

  // Partial wrap: binding at [22,34) on 20-col lines → tail [16,22) splits:
  // cols [16,20) on line 1, cols [20,22) on line 2.
  const PART_SEQ = 'T'.repeat(22) + WBIND + 'T'.repeat(10); // len 44
  const partLine = (lineStart) => ({
    fullSeq: PART_SEQ, lineStart, lineLen: 20, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    primers: [{ name: 'p', direction: 'forward', bindingSequence: WBIND, tail: WTAIL, sequence: WTAIL + WBIND }],
  });

  it('forward partial wrap: prev line gets the 5′ part of the tail, binding line the rest', () => {
    const { unmount } = render(<PrimerTrack {...partLine(0)} />);
    expect(screen.queryByTestId('sequence-view-primer')).toBeNull();          // binding not here
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe('GGGG'); // cols 16..19
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 16) * 7.2, 3);
    unmount();
    render(<PrimerTrack {...partLine(20)} />);
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();          // binding starts here
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe('GG'); // cols 20..21
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 0) * 7.2, 3);
  });
});
