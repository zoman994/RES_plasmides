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
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  render, screen, cleanup, fireEvent,
} from '@testing-library/react';
import PrimerTrack from '../tracks/PrimerTrack';
import { reverseComplement } from '../../../sequence-utils';
import { PRIMER_GLYPH_HEIGHT } from '../tracks/PrimerStepGlyph';
import { PRIMER_LABEL_GAP, PRIMER_LABEL_HEIGHT } from '../tracks/primer-track-layout';

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

  // V174 — cross-ecosystem friendship: a PCR-mode primer names its overhang
  // `tailSequence` (local-primer-design), not `tail`. PrimerTrack must still
  // render it so PCR-mode primers show their overhang on the sequence.
  it('forward primer with tailSequence (PCR-mode field) → tail segment renders', () => {
    const p = {
      name: 'fwd', direction: 'forward', bindingSequence: BINDING, tailSequence: TAIL, sequence: TAIL + BINDING,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(Number(tail.getAttribute('x'))).toBeCloseTo(-(TAIL.length * 7.2), 3);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(TAIL);
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

  const expectLabelTemplateFacing = (direction) => {
    const label = screen.getByTestId('sequence-view-primer-label');
    const primer = screen.getByTestId('sequence-view-primer');
    const start = Number(label.getAttribute('x'));
    const end = start + Number(label.getAttribute('textLength'));
    const body = primer.querySelector(
      '[data-testid="sequence-view-primer-compact-run"], '
      + '[data-testid="sequence-view-primer-arrowhead"]',
    );
    const bodyY = Number(body.getAttribute('data-primer-lane-y'));
    expect(Math.min(end, BINDING.length * 7.2) - Math.max(start, 0)).toBeGreaterThan(0);
    if (direction === 'reverse') {
      expect(Number(label.dataset.primerLabelY) + PRIMER_LABEL_HEIGHT + PRIMER_LABEL_GAP)
        .toBe(bodyY);
    } else {
      expect(Number(label.dataset.primerLabelY))
        .toBe(bodyY + PRIMER_GLYPH_HEIGHT + PRIMER_LABEL_GAP);
    }
  };

  it('reverse: name label is above the primer instead of competing with its tail', () => {
    const p = {
      name: 'rev', direction: 'reverse', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING, tmBinding: 60,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    expectLabelTemplateFacing('reverse');
  });

  it('reverse WITHOUT tail → label remains above its body', () => {
    const p = { name: 'rev', direction: 'reverse', bindingSequence: BINDING, tmBinding: 60 };
    render(<PrimerTrack {...base} primers={[p]} />);
    expectLabelTemplateFacing('reverse');
  });

  it('forward: name label is below the binding body instead of competing with its tail', () => {
    const p = {
      name: 'fwd', direction: 'forward', bindingSequence: BINDING, tail: TAIL, sequence: TAIL + BINDING, tmBinding: 60,
    };
    render(<PrimerTrack {...base} primers={[p]} />);
    expectLabelTemplateFacing('forward');
  });
});

describe('PrimerTrack — aligned-v1 M/X/I/D glyphs keep source geometry', () => {
  const DOC = 'sha256:aligned-glyphs';
  const ANCHOR = 'ACGTAGCTTACCGGTA';
  const template = `${'T'.repeat(5)}${ANCHOR}${'G'.repeat(10)}`;
  const site = (over = {}) => ({
    id: over.id || 's1',
    target: { entryId: 'E1', resourceHash: DOC, topology: over.topology || 'linear' },
    location: over.location || { kind: 'single', segments: [{ start: 5, end: 21 }] },
    strand: over.strand || 1,
    annealedSequence: over.annealedSequence || ANCHOR,
    tail: over.tail ?? 'GG',
  });
  const primer = (body, over = {}) => ({
    id: over.id || 'aligned', name: over.name || 'aligned',
    direction: over.direction || 'forward', bindingModel: 'aligned-v1',
    tail: over.tail ?? 'GG', bindingSequence: body,
    sequence: `${over.tail ?? 'GG'}${body}`,
    sites: over.sites || [site()],
  });
  const props = {
    fullSeq: template, lineStart: 0, lineLen: template.length,
    labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    entryId: 'E1', documentHash: DOC, topology: 'linear',
  };

  it('draws a query-only insertion above its boundary, keeps tail separate and footprint 16 nt', () => {
    const body = `${ANCHOR.slice(0, 7)}A${ANCHOR.slice(7)}`;
    render(<PrimerTrack {...props} primers={[primer(body)]} />);
    expect(screen.getByTestId('sequence-view-primer').getAttribute('data-primer-span')).toBe('5-21');
    expect(screen.getByTestId('sequence-view-primer-insertion').textContent).toBe('A');
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe('GG');
    expect(screen.getByTestId('sequence-view-primer-bases').textContent).toHaveLength(ANCHOR.length);
  });

  it('draws a target-only deletion as an empty interval with a dashed bridge', () => {
    const body = `${ANCHOR.slice(0, 6)}${ANCHOR.slice(7)}`;
    render(<PrimerTrack {...props} primers={[primer(body, { tail: '' })]} />);
    const deletion = screen.getByTestId('sequence-view-primer-deletion-bridge');
    expect(deletion.getAttribute('data-primer-alignment-op')).toBe('D');
    expect(deletion.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(screen.queryByTestId('sequence-view-primer-base-deletion')).toBeNull();
    expect(screen.queryAllByTestId('sequence-view-primer-bases')
      .map((node) => node.textContent).join('')).not.toContain('–');
    expect(screen.getByTestId('sequence-view-primer').getAttribute('data-primer-span')).toBe('5-21');
  });

  it('maps a reverse insertion into top-strand orientation without changing the footprint', () => {
    const anchorPrimer = reverseComplement(ANCHOR);
    const body = `${anchorPrimer.slice(0, 5)}A${anchorPrimer.slice(5)}`;
    render(<PrimerTrack {...props} primers={[primer(body, {
      id: 'reverse-aligned', direction: 'reverse', tail: '',
      sites: [site({ strand: -1, annealedSequence: anchorPrimer, tail: '' })],
    })]} />);
    expect(screen.getByTestId('sequence-view-primer').getAttribute('data-primer-strand')).toBe('reverse');
    expect(screen.getByTestId('sequence-view-primer').getAttribute('data-primer-span')).toBe('5-21');
    expect(screen.getByTestId('sequence-view-primer-insertion').textContent).toBe('T');
  });

  it('aligns the same body independently at every declared site', () => {
    const body = `${ANCHOR.slice(0, 4)}A${ANCHOR.slice(4)}`;
    const fullSeq = `${ANCHOR}${'T'.repeat(4)}${ANCHOR}`;
    const sites = [
      site({ id: 'a', location: { kind: 'single', segments: [{ start: 0, end: 16 }] }, tail: '' }),
      site({ id: 'b', location: { kind: 'single', segments: [{ start: 20, end: 36 }] }, tail: '' }),
    ];
    render(<PrimerTrack
      {...props}
      fullSeq={fullSeq}
      lineLen={fullSeq.length}
      primers={[primer(body, { tail: '', sites })]}
    />);
    expect(screen.getAllByTestId('sequence-view-primer')).toHaveLength(2);
    expect(screen.getAllByTestId('sequence-view-primer-insertion')).toHaveLength(2);
  });

  it('shows one insertion at an origin-split boundary and keeps both source segments', () => {
    const circular = 'ACGTACGTACGTACGTACGT';
    const anchor = circular.slice(16) + circular.slice(0, 4);
    const body = `${anchor.slice(0, 4)}A${anchor.slice(4)}`;
    const wrapSite = site({
      id: 'wrap', topology: 'circular', annealedSequence: anchor, tail: '',
      location: {
        kind: 'join', segments: [{ start: 16, end: 20 }, { start: 0, end: 4 }],
      },
    });
    render(<PrimerTrack
      {...props}
      fullSeq={circular}
      lineLen={circular.length}
      topology="circular"
      circular
      primers={[primer(body, { tail: '', sites: [wrapSite] })]}
    />);
    expect(screen.getAllByTestId('sequence-view-primer').map((node) => node.getAttribute('data-primer-span')))
      .toEqual(['16-20', '0-4']);
    expect(screen.getAllByTestId('sequence-view-primer-insertion')).toHaveLength(1);
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

  it('a wrapped tail exposes the same keyboard action as its off-line binding', () => {
    const onPrimerClick = vi.fn();
    const props = { ...fwdLine(0), onPrimerClick };
    const { rerender } = render(<PrimerTrack {...props} />);
    const tailGroup = screen.getByTestId('sequence-view-primer-tail-wrap');

    expect(tailGroup.getAttribute('role')).toBe('button');
    expect(tailGroup.getAttribute('tabindex')).toBe('0');
    expect(tailGroup.getAttribute('aria-label')).toMatch(/f.*прям/i);
    expect(tailGroup.dataset.primerInteractive).toBe('true');
    expect(tailGroup.dataset.primerOccurrenceKey).toBe(tailGroup.dataset.primerKey);
    fireEvent.keyDown(tailGroup, { key: 'Enter' });
    fireEvent.keyDown(tailGroup, { key: ' ' });
    expect(onPrimerClick).toHaveBeenCalledTimes(2);
    expect(onPrimerClick.mock.calls[0][0]).toBe(onPrimerClick.mock.calls[1][0]);

    rerender(
      <PrimerTrack
        {...props}
        selectedPrimerKeys={[tailGroup.dataset.primerKey]}
        expandedPrimerKey={tailGroup.dataset.primerKey}
      />,
    );
    const selectedTail = screen.getByTestId('sequence-view-primer-tail-wrap');
    expect(selectedTail.dataset.selected).toBe('true');
    const shape = screen.getByTestId('sequence-view-primer-tail');
    expect(shape.getAttribute('stroke')).toBe('var(--viz-primer-fwd)');
    expect(selectedTail.querySelectorAll('[data-primer-selection-bracket]')).toHaveLength(0);
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

// ───────────────────────────────────────────────────────────────────────────
// Circularisation primer tails wrap ACROSS THE ORIGIN (Игорь 25.06.2026 —
// «праймеры кольцевания должны показывать как хвосты ложатся на цепь. сейчас
// хвосты уходят в сторону»). A self-/ring-closure primer binds near the
// molecule start (forward) or end (reverse); its 5′-tail runs off that end and,
// on a CIRCULAR molecule, belongs to the OTHER end. We render it on the
// wrap-bridge row at the real columns just before / wrap columns just after the
// ▶1 origin divider — instead of dangling it into the static side margin.
const CBIND = 'ACGTACGTACGT';            // 12 nt, self-rev-comp → reverse reuse
const CTAIL = 'GGGGGG';                   // 6 nt closure overhang
const ASYMMETRIC_TAIL = 'AGTC';           // catches reversal/duplication at origin

describe('PrimerTrack — circularisation tail wraps across the origin', () => {
  // seqLength 90, last partial line [80,90) extended by the first 10 nt → a
  // wrap-bridge row: real half [80,90) at cols [0,10), divider at wrapAt=10,
  // wrap half [0,10) at cols [10,20).
  const FWD_SEQ = CBIND + 'T'.repeat(78); // binding [0,12) at the start
  const fwdBridge = {
    fullSeq: FWD_SEQ, lineStart: 80, lineLen: 20, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    wrapsOrigin: true, wrapAt: 10, seqLength: 90, circular: true, directionFilter: 'forward',
    primers: [{ name: 'f', direction: 'forward', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }],
  };

  it('forward closure tail lands on the real half just BEFORE the ▶1 divider', () => {
    render(<PrimerTrack {...fwdBridge} />);
    const wrap = screen.getByTestId('sequence-view-primer-tail-wrap');
    // tail covers plasmid positions 84..89 → real-half cols 4..9 (right of which
    // the divider sits at col 10), x = (labelChars + 4) * charPx.
    expect(txX(wrap)).toBeCloseTo((8 + 4) * 7.2, 3);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(CTAIL);
    expect(Number(screen.getByTestId('sequence-view-primer-tail').getAttribute('width')))
      .toBeCloseTo(CTAIL.length * 7.2, 3);
  });

  // reverse closure: binding [78,90), 5′-end at 90; tail runs to positions
  // 90..95 ≡ 0..5 (mod 90) → wrap-half cols 10..15 (just past the divider).
  const REV_SEQ = 'T'.repeat(78) + CBIND; // binding [78,90) at the end
  const revBridge = {
    fullSeq: REV_SEQ, lineStart: 80, lineLen: 20, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    wrapsOrigin: true, wrapAt: 10, seqLength: 90, circular: true, directionFilter: 'reverse',
    primers: [{ name: 'r', direction: 'reverse', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }],
  };

  it('reverse closure tail lands on the wrap half just AFTER the ▶1 divider', () => {
    render(<PrimerTrack {...revBridge} />);
    const wrap = screen.getByTestId('sequence-view-primer-tail-wrap');
    expect(txX(wrap)).toBeCloseTo((8 + 10) * 7.2, 3);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(CTAIL);
  });

  it.each([
    ['forward', FWD_SEQ, 80, 20, 10],
    ['reverse', REV_SEQ, 80, 20, 10],
  ])('%s origin tail keeps one asymmetric 5′ sequence', (direction, fullSeq, lineStart, lineLen, wrapAt) => {
    const bindingSequence = CBIND;
    render(<PrimerTrack
      fullSeq={fullSeq}
      lineStart={lineStart}
      lineLen={lineLen}
      labelChars={8}
      primerStyle="filled"
      charPx={7.2}
      wrapsOrigin
      wrapAt={wrapAt}
      seqLength={90}
      circular
      directionFilter={direction}
      primers={[{
        name: `asymmetric-${direction}`,
        direction,
        bindingSequence,
        tail: ASYMMETRIC_TAIL,
        sequence: ASYMMETRIC_TAIL + bindingSequence,
      }]}
    />);
    expect(screen.getAllByTestId('sequence-view-primer-tail')).toHaveLength(1);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent)
      .toBe(ASYMMETRIC_TAIL);
    expect(screen.getByTestId('sequence-view-primer-tail').getAttribute('data-primer-tail-direction'))
      .toBe(direction);
  });

  // The dangle bug: on the FIRST line (lineStart 0, non-wrap) a forward closure
  // primer's tail must NOT render in the left margin for a CIRCULAR molecule
  // (it belongs on the wrap-bridge). For a LINEAR molecule the same tail is a
  // real 5′-overhang sticking out the end → it SHOULD still render.
  const firstLine = (circular) => ({
    fullSeq: FWD_SEQ, lineStart: 0, lineLen: 20, labelChars: 8, primerStyle: 'filled', charPx: 7.2,
    circular, directionFilter: 'forward',
    primers: [{ name: 'f', direction: 'forward', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }],
  });

  it('circular: forward closure tail is SUPPRESSED on the first line (no margin dangle)', () => {
    render(<PrimerTrack {...firstLine(true)} />);
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();        // binding arrow still here
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull();   // tail not dangled into margin
  });

  it('linear: the same tail IS drawn on the first line (real 5′-overhang)', () => {
    render(<PrimerTrack {...firstLine(false)} />);
    expect(screen.getByTestId('sequence-view-primer-tail')).toBeTruthy();   // linear overhang renders
  });

  // The live circular view renders closure primers on the LEADING/TRAILING
  // wrap-context rows (real plasmid coords), not on a single wrap-bridge row.
  // The wrapped tail must surface THERE too: a forward closure primer binding
  // at the start has its tail at the molecule END (a context row), a reverse one
  // at the END has its tail at the START (line 0). No wrap-bridge props here.
  it('forward closure tail surfaces on the leading wrap-context row (molecule end)', () => {
    // FWD_SEQ has the binding at [0,12); a context row shows positions [78,90).
    render(<PrimerTrack
      fullSeq={FWD_SEQ}
      lineStart={78}
      lineLen={12}
      labelChars={8}
      primerStyle="filled"
      charPx={7.2}
      circular
      directionFilter="forward"
      primers={[{ name: 'f', direction: 'forward', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }]}
    />);
    expect(screen.queryByTestId('sequence-view-primer')).toBeNull();        // binding is elsewhere → no arrow
    // tail at plasmid positions 84..89 → cols 6..11 on this [78,90) row.
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 6) * 7.2, 3);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(CTAIL);
  });

  it('reverse closure tail surfaces on line 0 (molecule start)', () => {
    // REV_SEQ has the binding at [78,90); line 0 shows positions [0,12).
    render(<PrimerTrack
      fullSeq={REV_SEQ}
      lineStart={0}
      lineLen={12}
      labelChars={8}
      primerStyle="filled"
      charPx={7.2}
      circular
      directionFilter="reverse"
      primers={[{ name: 'r', direction: 'reverse', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }]}
    />);
    expect(screen.queryByTestId('sequence-view-primer')).toBeNull();
    expect(txX(screen.getByTestId('sequence-view-primer-tail-wrap'))).toBeCloseTo((8 + 0) * 7.2, 3);
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(CTAIL);
  });

  // Regression: a circular primer whose tail does NOT run off an end keeps the
  // ordinary inline-tail rendering (the wrap path must not hijack internal tails).
  it('circular internal tail (not off-end) still renders inline, not wrapped', () => {
    const INT_SEQ = 'T'.repeat(46) + CBIND + 'T'.repeat(32); // len 90, binding [46,58)
    render(<PrimerTrack
      fullSeq={INT_SEQ}
      lineStart={40}
      lineLen={20}
      labelChars={8}
      primerStyle="filled"
      charPx={7.2}
      circular
      directionFilter="forward"
      primers={[{ name: 'f', direction: 'forward', bindingSequence: CBIND, tail: CTAIL, sequence: CTAIL + CBIND }]}
    />);
    expect(screen.getByTestId('sequence-view-primer')).toBeTruthy();          // binding arrow here
    expect(screen.getByTestId('sequence-view-primer-tail')).toBeTruthy();     // inline tail glued to it
    expect(screen.queryByTestId('sequence-view-primer-tail-wrap')).toBeNull(); // NOT the wrap path
  });
});

/**
 * SEQ-VIS-1 — the live pE-SUMOpro Kan shape, drawn by the real track.
 *
 * The record stores `AAAAAAAA` + a 31-nt anchor inside one long
 * `bindingSequence` with `tail:''`, and the site remembers only the 31-nt
 * snapshot. The eight A's are physically there and unbound, so they belong on
 * screen as an overhang beside the landing — not silently dropped, and not
 * pretended to be part of the footprint.
 */
describe('PrimerTrack — anchored source binding with a longer current oligo', () => {
  const ANCHOR = 'ACGTTGCAACGTTGCAACGTTGCAACGTTGC';   // 31 nt
  const POLY_A = 'AAAAAAAA';                           // 8 nt
  const TPL = `${'T'.repeat(10)}${ANCHOR}${'T'.repeat(59)}`; // anchor at [10,41)
  const DOC = 'sha256:seqvis-v1';
  const CHAR_PX = 7.2;

  const legacyPrimer = {
    id: 'p1',
    name: 'SUMO-fwd',
    direction: 'forward',
    tail: '',
    bindingSequence: `${POLY_A}${ANCHOR}`,
    sequence: `${POLY_A}${ANCHOR}`,
    sites: [{
      id: 's1',
      target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
      location: { kind: 'single', segments: [{ start: 10, end: 41 }] },
      strand: 1,
      annealedSequence: ANCHOR,
      tail: '',
    }],
  };

  const renderTrack = (primer = legacyPrimer) => render(
    <PrimerTrack
      fullSeq={TPL}
      lineStart={0}
      lineLen={TPL.length}
      labelChars={8}
      primerStyle="filled"
      charPx={CHAR_PX}
      primers={[primer]}
      entryId="E1"
      documentHash={DOC}
      topology="linear"
    />,
  );

  it('draws the eight unbound A bases as a 5-prime tail beside the 31-nt landing', () => {
    renderTrack();
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(POLY_A);
    const tail = screen.getByTestId('sequence-view-primer-tail');
    expect(tail.getAttribute('data-primer-tail-direction')).toBe('forward');
    expect(Number(tail.getAttribute('width'))).toBeCloseTo(POLY_A.length * CHAR_PX, 3);
  });

  it('the overhang does not lengthen the genomic footprint', () => {
    renderTrack();
    // The binding arrow still covers exactly the 31 nt the site declared.
    const arrow = screen.getAllByTestId('sequence-view-primer')[0];
    expect(Number(arrow.getAttribute('data-primer-len') ?? ANCHOR.length)).toBe(ANCHOR.length);
    // and the tail sits OUTSIDE it, to the 5' side of a forward primer
    expect(Number(screen.getByTestId('sequence-view-primer-tail').getAttribute('x')))
      .toBeCloseTo(-(POLY_A.length * CHAR_PX), 3);
  });

  it('draws no tail when the current oligo is exactly its anchor', () => {
    renderTrack({
      ...legacyPrimer,
      bindingSequence: ANCHOR,
      sequence: ANCHOR,
    });
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull();
  });

  it('inscribes forward current substitution letters and marks the mismatch without changing tail geometry', () => {
    const current = `${ANCHOR.slice(0, 30)}A`;
    renderTrack({
      ...legacyPrimer,
      bindingSequence: `${POLY_A}${current}`,
      sequence: `${POLY_A}${current}`,
    });
    expect(screen.getByTestId('sequence-view-primer-bases').textContent).toBe(current);
    const mismatch = screen.getByTestId('sequence-view-primer-base-mismatch');
    expect(mismatch.textContent).toBe('A');
    expect(mismatch.getAttribute('fill')).toBe('var(--danger-fg)');
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe(POLY_A);
    expect(Number(screen.getByTestId('sequence-view-primer-tail').getAttribute('width')))
      .toBeCloseTo(POLY_A.length * CHAR_PX, 3);
  });

  it('maps reverse current binding into top-strand coordinate order and marks its substitution', () => {
    const top = 'AACCGGTTAACC';
    const primerBinding = 'GGTTAACCGGTT'; // reverse-complement(top)
    const replacement = primerBinding[5] === 'A' ? 'C' : 'A';
    const currentBinding = `${primerBinding.slice(0, 5)}${replacement}${primerBinding.slice(6)}`;
    const expectedTop = reverseComplement(currentBinding);
    const template = `${'T'.repeat(5)}${top}${'T'.repeat(8)}`;
    render(
      <PrimerTrack
        fullSeq={template}
        lineStart={0}
        lineLen={template.length}
        labelChars={8}
        primerStyle="filled"
        charPx={CHAR_PX}
        primers={[{
          id: 'reverse-current', name: 'reverse-current', direction: 'reverse',
          tail: 'GG', bindingSequence: currentBinding, sequence: `GG${currentBinding}`,
          sites: [{
            id: 'reverse-site',
            target: { entryId: 'E1', resourceHash: DOC, topology: 'linear' },
            location: { kind: 'single', segments: [{ start: 5, end: 17 }] },
            strand: -1, annealedSequence: primerBinding, tail: 'GG',
          }],
        }]}
        entryId="E1"
        documentHash={DOC}
        topology="linear"
      />,
    );
    expect(screen.getByTestId('sequence-view-primer-bases').textContent).toBe(expectedTop);
    expect(screen.getByTestId('sequence-view-primer-base-mismatch')).toBeTruthy();
    expect(screen.getByTestId('sequence-view-primer').getAttribute('data-primer-span')).toBe('5-17');
    expect(screen.getByTestId('sequence-view-primer-tail-bases').textContent).toBe('GG');
  });

  it('draws no current binding or tail composition for a contradictory occurrence', () => {
    const short = ANCHOR.slice(4);
    renderTrack({
      ...legacyPrimer,
      tail: 'GAATTC',
      bindingSequence: short,
      sequence: `TTTTTT${short}`,
    });
    const glyph = screen.getByTestId('sequence-view-primer');
    expect(glyph.getAttribute('data-primer-oligo-status')).toBe('conflict');
    expect(screen.queryByTestId('sequence-view-primer-bases')).toBeNull();
    expect(screen.queryByTestId('sequence-view-primer-tail')).toBeNull();
  });

  it('keeps current letters in top-strand order across an origin split and a clipped line', () => {
    const template = 'ACGTACGTACGTACGTACGT';
    const anchorTop = template.slice(16) + template.slice(0, 4);
    const currentTop = `${anchorTop.slice(0, 7)}A`;
    const primer = {
      id: 'origin-current', name: 'origin-current', direction: 'forward',
      tail: '', bindingSequence: currentTop, sequence: currentTop,
      sites: [{
        id: 'origin-site',
        target: { entryId: 'E1', resourceHash: DOC, topology: 'circular' },
        location: {
          kind: 'split',
          segments: [{ start: 16, end: 20 }, { start: 0, end: 4 }],
        },
        strand: 1, annealedSequence: anchorTop, tail: '',
      }],
    };
    const props = {
      fullSeq: template, labelChars: 8, primerStyle: 'filled', charPx: CHAR_PX,
      primers: [primer], entryId: 'E1', documentHash: DOC, topology: 'circular', circular: true,
    };

    const { unmount } = render(<PrimerTrack {...props} lineStart={0} lineLen={20} />);
    expect(screen.getAllByTestId('sequence-view-primer-bases').map((node) => node.textContent).join(''))
      .toBe(currentTop);
    expect(screen.getByTestId('sequence-view-primer-base-mismatch')
      .getAttribute('data-primer-template-coordinate')).toBe('3');
    unmount();

    render(<PrimerTrack {...props} lineStart={0} lineLen={2} />);
    expect(screen.getByTestId('sequence-view-primer-bases').textContent).toBe(currentTop.slice(4, 6));
  });
});
