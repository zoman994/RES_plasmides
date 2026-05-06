/**
 * wrap-tail-edge — Sprint M-X.3 K5 edge case coverage.
 *
 * shouldEnableWrapTail decides at runtime whether wrap-tail
 * rendering kicks in. Big-screen short-plasmid case → disabled
 * (everything fits). Small-screen long-plasmid case → enabled.
 * The pure helper is already covered by wrap-tail.test.js;
 * these tests pin that the runtime wiring honours the helper
 * decision when integrated into SequenceView.
 *
 * Note: happy-dom returns 0 for clientHeight on most elements,
 * so the runtime defaults (viewportHeight=800, mainLineHeight=120)
 * win on test-mounted plasmids unless we override sequenceWrap so
 * a 5000 bp plasmid produces enough main lines that wrap-tail is
 * always on regardless of viewport. K5's main wiring is exercised
 * by the wrap-tail-render existing tests; this file specifically
 * pins the auto-disable code path through unit-level helper calls.
 */
import { describe, it, expect } from 'vitest';
import { shouldEnableWrapTail, pickWrapTailLines } from '../lib/wrap-tail.js';

describe('M-X.3 K5 — wrap-tail enable boundary (round-4 simplification)', () => {
  it('any circular plasmid with ≥3 main lines → enabled', () => {
    // Round 4 (06.05.2026): viewport check dropped because nested
    // scroll parents (importer-single-tab-content) made
    // SequenceView's clientHeight equal full content height, not
    // the visible viewport. Now wrap-tail enables purely on
    // line-count.
    expect(shouldEnableWrapTail({
      circular: true,
      seqLength: 1500,
      cpl: 80,
      viewportHeight: 1200,
      lineHeight: 18,
    })).toBe(true);
    expect(shouldEnableWrapTail({
      circular: true,
      seqLength: 5000,
      cpl: 80,
      viewportHeight: 800,
      lineHeight: 18,
    })).toBe(true);
  });

  it('linear topology → disabled regardless of viewport', () => {
    expect(shouldEnableWrapTail({
      circular: false,
      seqLength: 5000,
      cpl: 80,
      viewportHeight: 800,
      lineHeight: 18,
    })).toBe(false);
  });

  it('matrix combination — pickWrapTailLines stays consistent', () => {
    // Sanity: helper composition matches the runtime decision in
    // SequenceView (totalMainLines pins the count regardless of
    // viewport size).
    expect(pickWrapTailLines({ totalMainLines: 63 })).toBe(2);
    expect(pickWrapTailLines({ totalMainLines: 19 })).toBe(2);
    expect(pickWrapTailLines({ totalMainLines: 4 })).toBe(1);
    expect(pickWrapTailLines({ totalMainLines: 2 })).toBe(0);
  });
});
