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

describe('shouldEnableWrapTail (V102 23.05 — always on for circular)', () => {
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

  it('returns true for any valid circular plasmid (no origin-crossing gate, no length limit)', () => {
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 5000, cpl: 80, viewportHeight: 400, lineHeight: 18,
    })).toBe(true);
  });

  it('returns true even for a SHORT circular plasmid (< 3 lines) — length gate removed (V102 23.05)', () => {
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 100, cpl: 80, viewportHeight: 50, lineHeight: 18,
    })).toBe(true);
    expect(shouldEnableWrapTail({
      circular: true, seqLength: 60, cpl: 80, viewportHeight: 50, lineHeight: 18,
    })).toBe(true);
  });
});

describe('pickWrapTailLines (V102 23.05 — fixed ≈200 bp / cpl, both sides)', () => {
  it('returns ceil(200 / cpl) whole lines', () => {
    expect(pickWrapTailLines({ cpl: 80 })).toBe(3); // ceil(200/80)=3
    expect(pickWrapTailLines({ cpl: 100 })).toBe(2);
    expect(pickWrapTailLines({ cpl: 200 })).toBe(1);
    expect(pickWrapTailLines({ cpl: 250 })).toBe(1); // ceil(0.8)=1
    expect(pickWrapTailLines({ cpl: 60 })).toBe(4); // ceil(200/60)=4
  });

  it('returns 0 for invalid cpl', () => {
    expect(pickWrapTailLines({ cpl: 0 })).toBe(0);
    expect(pickWrapTailLines({ cpl: -5 })).toBe(0);
    expect(pickWrapTailLines({ cpl: NaN })).toBe(0);
    expect(pickWrapTailLines({})).toBe(0);
  });
});

describe('buildWrapTailLines (round-12: trailing strip restored after bridge)', () => {
  it('returns leading shift-anchored to seqLen + trailing grid-aligned from 0', () => {
    const seq = 'A'.repeat(80) + 'C'.repeat(80) + 'G'.repeat(80) + 'T'.repeat(80);
    const out = buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 2, trailingCount: 2 });
    expect(out.leading).toHaveLength(2);
    expect(out.leading[0]).toEqual({ start: 160, seq: 'G'.repeat(80), kind: 'leading-wrap' });
    expect(out.leading[1]).toEqual({ start: 240, seq: 'T'.repeat(80), kind: 'leading-wrap' });
    // Round 12: trailing wrap-tail RESTORED — biolog «надо чтобы
    // вниз тоже был призрачный сиквенс на 200-300 п.о.». Lives
    // BELOW the inline wrap-bridge line, gives a drag-selection
    // surface for features that span origin from the start-side.
    expect(out.trailing).toHaveLength(2);
    expect(out.trailing[0]).toEqual({ start: 0, seq: 'A'.repeat(80), kind: 'trailing-wrap' });
    expect(out.trailing[1]).toEqual({ start: 80, seq: 'C'.repeat(80), kind: 'trailing-wrap' });
  });

  it('shift-anchors leading even when seqLen is not a multiple of cpl', () => {
    const seq = 'A'.repeat(80) + 'C'.repeat(80) + 'G'.repeat(80) + 'T'.repeat(10);
    const out = buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 2, trailingCount: 1 });
    expect(out.leading).toHaveLength(2);
    expect(out.leading[0].start).toBe(90);
    expect(out.leading[0].seq.length).toBe(80);
    expect(out.leading[1].start).toBe(170);
    expect(out.leading[1].seq.length).toBe(80);
    expect(out.leading[1].start + out.leading[1].seq.length).toBe(seq.length);
  });

  it('pUC19-shaped 4948 bp / cpl=140 — leading ends at 4948', () => {
    const seq = 'X'.repeat(4948);
    const out = buildWrapTailLines({ fullSeq: seq, cpl: 140, leadingCount: 2, trailingCount: 2 });
    expect(out.leading).toHaveLength(2);
    expect(out.leading[0].start).toBe(4668);
    expect(out.leading[0].seq.length).toBe(140);
    expect(out.leading[1].start).toBe(4808);
    expect(out.leading[1].seq.length).toBe(140);
    expect(out.leading[1].start + out.leading[1].seq.length).toBe(4948);
  });

  it('returns empty arrays when leadingCount is 0', () => {
    const seq = 'A'.repeat(160);
    expect(buildWrapTailLines({ fullSeq: seq, cpl: 80, leadingCount: 0, trailingCount: 0 }))
      .toEqual({ leading: [], trailing: [] });
  });
});

describe('buildWrapBridgeLine (round-10 inline trailing wrap)', () => {
  it('extends partial last main line to a full cpl with wrap chars', async () => {
    const { buildWrapBridgeLine } = await import('../wrap-tail.js');
    // 100 chars / cpl=80: last main line was 80..100 (20 chars).
    // Bridge extends with first (80-20)=60 chars from origin.
    const seq = 'A'.repeat(80) + 'C'.repeat(20);
    const bridge = buildWrapBridgeLine({ fullSeq: seq, cpl: 80, circular: true });
    expect(bridge).not.toBeNull();
    expect(bridge.start).toBe(80);
    expect(bridge.wrapAt).toBe(20);
    expect(bridge.seq.length).toBe(80);
    expect(bridge.seq.slice(0, 20)).toBe('C'.repeat(20));
    expect(bridge.seq.slice(20)).toBe('A'.repeat(60));
    expect(bridge.kind).toBe('main');
    expect(bridge.wrapsOrigin).toBe(true);
  });

  it('returns null on linear topology', async () => {
    const { buildWrapBridgeLine } = await import('../wrap-tail.js');
    const seq = 'A'.repeat(100);
    expect(buildWrapBridgeLine({ fullSeq: seq, cpl: 80, circular: false })).toBeNull();
  });

  it('returns null when last line is already full cpl', async () => {
    const { buildWrapBridgeLine } = await import('../wrap-tail.js');
    const seq = 'A'.repeat(160); // 2 lines × 80, both full
    expect(buildWrapBridgeLine({ fullSeq: seq, cpl: 80, circular: true })).toBeNull();
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
