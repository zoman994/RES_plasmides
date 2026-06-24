/**
 * sequence-line-placeholder.test.jsx
 *
 * Virtualization (perf, 19.06.2026 — Игорь «выравниватель всё ещё медленный»
 * on >5 kb references). A windowed SequenceView renders off-screen line
 * indices as fixed-height placeholders (active={false}). This locks the two
 * invariants that keep the rest of the viewer working through windowing:
 *   1. A placeholder DROPS the heavy track subtree (the perf win).
 *   2. A placeholder KEEPS the same outer <div> + every data-attribute the
 *      DOM-measuring machinery (SelectionOverlay / CaretOverlay /
 *      scrollToPosition / computeVisible) relies on to find the slot.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import SequenceLine from '../SequenceLine';

afterEach(cleanup);

const SEQ = 'ACGTGAATTCACGT'.padEnd(60, 'A');
const LINE = { start: 120, seq: SEQ, wrapsOrigin: false };

const baseProps = {
  line: LINE,
  fullSeq: SEQ,
  features: [],
  primers: [],
  reSites: [],
  charPx: 10,
  showBottomStrand: true,
  framesMode: 'off',
  primerStyle: 'arrow',
  reOrientation: 'horizontal',
  visibleFrames: { F1: true, F2: false, F3: false, R1: false, R2: false, R3: false },
  framesResolution: { strategy: 'none', dominant: null },
  orfRanges: [],
  renderHybrid: false,
  tracksReady: true,
  seqLength: SEQ.length,
  kind: 'main',
  nextKind: 'main',
};

describe('SequenceLine — virtualization placeholder', () => {
  it('active (default) renders the real DNA strands', () => {
    render(<SequenceLine {...baseProps} />);
    expect(screen.getAllByTestId('sequence-view-strands-top').length).toBeGreaterThan(0);
    const line = screen.getByTestId('sequence-view-line');
    expect(line.getAttribute('data-placeholder')).toBe(null);
  });

  it('active={false} drops the heavy track subtree', () => {
    render(<SequenceLine {...baseProps} active={false} lineIndex={7} placeholderHeight={88} />);
    const line = screen.getByTestId('sequence-view-line');
    expect(line.getAttribute('data-placeholder')).toBe('true');
    // No strands / ruler / annotation tracks inside a placeholder.
    expect(within(line).queryAllByTestId('sequence-view-strands-top').length).toBe(0);
    expect(within(line).queryAllByTestId('sequence-view-ruler').length).toBe(0);
  });

  it('placeholder keeps the slot-locating data-attributes', () => {
    render(<SequenceLine {...baseProps} active={false} lineIndex={7} placeholderHeight={88} />);
    const line = screen.getByTestId('sequence-view-line');
    expect(line.getAttribute('data-line-start')).toBe('120');
    expect(line.getAttribute('data-line-idx')).toBe('7');
    expect(line.getAttribute('data-wraptail-kind')).toBe('main');
    expect(line.style.height).toBe('88px');
  });

  it('placeholder preserves wrap-bridge attributes', () => {
    const bridgeLine = { start: 4000, seq: SEQ, wrapsOrigin: true, wrapAt: 30 };
    render(<SequenceLine {...baseProps} line={bridgeLine} active={false} lineIndex={50} placeholderHeight={100} />);
    const line = screen.getByTestId('sequence-view-line');
    expect(line.getAttribute('data-wraps-origin')).toBe('true');
    expect(line.getAttribute('data-wrap-at')).toBe('30');
  });

  it('the real line carries data-line-idx for the scroll driver', () => {
    render(<SequenceLine {...baseProps} lineIndex={12} />);
    const line = screen.getByTestId('sequence-view-line');
    expect(line.getAttribute('data-line-idx')).toBe('12');
  });
});
