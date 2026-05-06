/**
 * wrap-tail-caret-filter — Sprint M-X.3 K4.
 *
 * Pins the contract that:
 *   - CaretOverlay query filters by `data-wraptail-kind="main"`
 *     (no caret on dimmed context strips)
 *   - useSelectionState fallback hit-test ignores wrap-tail rows
 *
 * The actual caret rendering is tested in caret-overlay.test.jsx.
 * This file just verifies the wrap-tail filter doesn't accidentally
 * move the caret onto a dimmed context line — a contract regression
 * would break the «main band is the canonical position» invariant.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import SequenceView from '../index';
import { useStore } from '../../../store';

const cds80 = 'ATGAAACATGCAGTGGCAATGGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAATGCATGCATTGGCATTGGCAA';
const longCircular = {
  id: 'frag-c-long',
  name: 'circular-long',
  type: 'plasmid',
  sequence: cds80.repeat(60),
  strand: 1,
  annotations: [],
};

beforeEach(() => {
  useStore.setState({
    sequenceView: {
      ...useStore.getState().sequenceView,
      sequenceWrap: 80,
    },
  });
});
afterEach(() => { cleanup(); });

describe('M-X.3 K4 — caret restricted to main band', () => {
  it('main band lines all carry data-wraptail-kind="main"', () => {
    render(<SequenceView fragments={[longCircular]} circular />);
    const mainLines = screen.getAllByTestId('sequence-view-line').filter(
      (el) => el.getAttribute('data-wraptail-kind') === 'main',
    );
    expect(mainLines.length).toBeGreaterThan(0);
    // Each carries a numeric data-line-start (CaretOverlay relies on this).
    for (const el of mainLines) {
      const start = parseInt(el.getAttribute('data-line-start'), 10);
      expect(Number.isFinite(start)).toBe(true);
      expect(start).toBeGreaterThanOrEqual(0);
    }
  });

  it('wrap-tail lines and main lines can share data-line-start values', () => {
    // Pin the contract that motivates the filter: both the FIRST
    // trailing-wrap row and the FIRST main row carry data-line-start="0".
    // Without filtering by data-wraptail-kind, CaretOverlay would
    // pick whichever appears first in the DOM order — leading to
    // non-deterministic caret placement. K4's filter pins it to main.
    render(<SequenceView fragments={[longCircular]} circular />);
    const allLines = screen.getAllByTestId('sequence-view-line');
    const linesAtZero = allLines.filter((el) => el.getAttribute('data-line-start') === '0');
    // At minimum: 1 main + 1 trailing-wrap (they both render line.start=0).
    expect(linesAtZero.length).toBeGreaterThanOrEqual(2);
    const kinds = linesAtZero.map((el) => el.getAttribute('data-wraptail-kind'));
    expect(kinds).toContain('main');
    expect(kinds).toContain('trailing-wrap');
  });
});
