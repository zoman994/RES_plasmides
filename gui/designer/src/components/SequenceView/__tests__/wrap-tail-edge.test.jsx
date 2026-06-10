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

describe('M-X.3 K5 — wrap-tail enable boundary (V102 23.05 — always on for circular)', () => {
  it('any valid circular plasmid → enabled, regardless of length / viewport', () => {
    // V102 (23.05.2026): wrap-tail is a wanted feature, always on for
    // circular plasmids. The origin-crossing gate + length limit were
    // reverted (gate killed the feature + flickered during drag).
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 1500, cpl: 80, viewportHeight: 1200, lineHeight: 18,
    })).toBe(true);
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 5000, cpl: 80, viewportHeight: 800, lineHeight: 18,
    })).toBe(true);
    // Short circular plasmid — still on (length gate removed).
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 300, cpl: 80, viewportHeight: 1200, lineHeight: 18,
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

  it('matrix combination — pickWrapTailLines is a fixed ceil(200/cpl)', () => {
    // Independent of total main lines now — driven only by cpl.
    expect(pickWrapTailLines({ cpl: 80 })).toBe(3);
    expect(pickWrapTailLines({ cpl: 140 })).toBe(2);
    expect(pickWrapTailLines({ cpl: 200 })).toBe(1);
    expect(pickWrapTailLines({ cpl: 0 })).toBe(0);
  });
});
