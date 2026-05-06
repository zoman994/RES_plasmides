/**
 * lib/wrap-tail tests — Sprint M-X.3 K1.
 *
 * Pure helpers for wrap-tail line math. TDD-first per CLAUDE.md
 * правило 1: tests live, then implementation. Covers:
 *   - shouldEnableWrapTail decision matrix (circular/linear, viewport
 *     fit, plasmid length boundaries)
 *   - pickWrapTailLines mapping (total main lines → 0/1/2 wrap-tail)
 *   - buildWrapTailLines slicing (leading from end, trailing from
 *     start, abs offsets preserved)
 *   - filterAnnotationsForLine half-open overlap math (consistent
 *     with existing AnnotationTrack [start, end) semantics)
 */
import { describe, it, expect } from 'vitest';
import {
  shouldEnableWrapTail,
  pickWrapTailLines,
  buildWrapTailLines,
  filterAnnotationsForLine,
} from '../wrap-tail.js';

describe('shouldEnableWrapTail', () => {
  it('returns false for linear topology', () => {
    expect(shouldEnableWrapTail({
      circular: false, seqLength: 5000, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(false);
  });

  it('returns false when seqLength is 0 or non-finite', () => {
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 0, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(false);
    expect(shouldEnableWrapTail({
      circular: true, seqLength: NaN, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(false);
  });

  it('returns true on a long circular plasmid (viewport size irrelevant)', () => {
    // 5000 bp / cpl=80 = 63 main lines → enabled regardless of
    // viewport height since round 4 (06.05.2026 — see helper notes
    // for the rationale: nested scroll parents made the viewport
    // probe unreliable).
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 5000, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(true);
  });

  it('returns true even when plasmid would visually fit in viewport (round-4 simplification)', () => {
    // 1000 bp / cpl=80 = 13 main lines → enabled. The previous
    // viewport-fit short-circuit was dropped because nested scroll
    // parents broke the probe (biolog 06.05.2026 feedback).
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 1000, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(true);
  });

  it('returns false when totalMainLines < 3 (degenerate)', () => {
    // 100 bp / cpl=80 = 2 lines. Wrap-tail lines would equal the
    // entire plasmid → no useful context.
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 100, cpl: 80, viewportHeight: 50, lineHeight: 18,
    })).toBe(false);
  });
});

describe('pickWrapTailLines', () => {
  it('returns 2 when there are at least 5 main lines', () => {
    expect(pickWrapTailLines({ totalMainLines: 5 })).toBe(2);
    expect(pickWrapTailLines({ totalMainLines: 60 })).toBe(2);
  });

  it('returns 1 when totalMainLines is 3 or 4', () => {
    expect(pickWrapTailLines({ totalMainLines: 3 })).toBe(1);
    expect(pickWrapTailLines({ totalMainLines: 4 })).toBe(1);
  });

  it('returns 0 when totalMainLines is below 3 (no useful context)', () => {
    expect(pickWrapTailLines({ totalMainLines: 2 })).toBe(0);
    expect(pickWrapTailLines({ totalMainLines: 1 })).toBe(0);
    expect(pickWrapTailLines({ totalMainLines: 0 })).toBe(0);
  });
});

describe('buildWrapTailLines', () => {
  it('slices last N lines from end into leading + first N lines into trailing', () => {
    // 320 chars / cpl=80 = 4 main lines. leadingCount=2, trailingCount=2.
    const seq = 'A'.repeat(80) + 'C'.repeat(80) + 'G'.repeat(80) + 'T'.repeat(80);
    const out = buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 2, trailingCount: 2 });
    expect(out.leading).toHaveLength(2);
    expect(out.trailing).toHaveLength(2);
    // leading: last 2 main lines (160..240 G's, 240..320 T's)
    expect(out.leading[0]).toEqual({ start: 160, seq: 'G'.repeat(80), kind: 'leading-wrap' });
    expect(out.leading[1]).toEqual({ start: 240, seq: 'T'.repeat(80), kind: 'leading-wrap' });
    // trailing: first 2 main lines (0..80 A's, 80..160 C's)
    expect(out.trailing[0]).toEqual({ start: 0, seq: 'A'.repeat(80), kind: 'trailing-wrap' });
    expect(out.trailing[1]).toEqual({ start: 80, seq: 'C'.repeat(80), kind: 'trailing-wrap' });
  });

  it('returns empty arrays when leadingCount or trailingCount is 0', () => {
    const seq = 'A'.repeat(160);
    expect(buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 0, trailingCount: 0 }))
      .toEqual({ leading: [], trailing: [] });
  });

  it('handles plasmid not divisible by cpl (last line shorter)', () => {
    // 250 chars / cpl=80 = 4 lines (80, 80, 80, 10).
    const seq = 'A'.repeat(80) + 'C'.repeat(80) + 'G'.repeat(80) + 'T'.repeat(10);
    const out = buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 2, trailingCount: 1 });
    expect(out.leading[0].start).toBe(160);
    expect(out.leading[0].seq).toBe('G'.repeat(80));
    expect(out.leading[1].start).toBe(240);
    expect(out.leading[1].seq).toBe('T'.repeat(10));
    expect(out.trailing[0]).toEqual({ start: 0, seq: 'A'.repeat(80), kind: 'trailing-wrap' });
  });
});

describe('filterAnnotationsForLine', () => {
  // Half-open [start, end) overlap with line [lineStart, lineEnd).
  const anns = [
    { id: 'a', start: 0, end: 50 },     // ends inside line 0..80 → match
    { id: 'b', start: 80, end: 200 },   // spans across multiple lines
    { id: 'c', start: 300, end: 400 },  // outside lines we're testing
    { id: 'd', start: 200, end: 280 },  // touches lineEnd=240 boundary
  ];

  it('includes annotations overlapping the line range', () => {
    const out = filterAnnotationsForLine(anns, 0, 80);
    expect(out.map((a) => a.id).sort()).toEqual(['a']);
  });

  it('includes annotations spanning the line range', () => {
    const out = filterAnnotationsForLine(anns, 80, 160);
    expect(out.map((a) => a.id).sort()).toEqual(['b']);
  });

  it('excludes annotations entirely outside the line range', () => {
    const out = filterAnnotationsForLine(anns, 0, 80);
    expect(out.map((a) => a.id)).not.toContain('c');
    expect(out.map((a) => a.id)).not.toContain('d');
  });

  it('handles annotation that touches lineEnd as an open bound (excluded)', () => {
    // Annotation { start: 80, end: 200 } at line [0, 80) — should NOT match.
    const out = filterAnnotationsForLine([{ id: 'x', start: 80, end: 200 }], 0, 80);
    expect(out).toHaveLength(0);
  });

  it('handles empty annotation array gracefully', () => {
    expect(filterAnnotationsForLine([], 0, 80)).toEqual([]);
    expect(filterAnnotationsForLine(null, 0, 80)).toEqual([]);
  });
});
