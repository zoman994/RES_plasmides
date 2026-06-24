import { describe, it, expect } from 'vitest';
import {
  VIRTUALIZE_THRESHOLD,
  DEFAULT_OVERSCAN,
  shouldVirtualize,
  clampIdx,
  computeDesiredWindow,
  windowFromAnchor,
  unionWindow,
  windowsEqual,
  isActiveIdx,
  directionalOverscan,
} from '../line-window.js';

describe('line-window — shouldVirtualize (size gate)', () => {
  it('is false at/below the threshold (small fixtures keep the eager path)', () => {
    expect(shouldVirtualize(1)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD)).toBe(false);
    expect(shouldVirtualize(0)).toBe(false);
  });
  it('is true above the threshold (large reference)', () => {
    expect(shouldVirtualize(VIRTUALIZE_THRESHOLD + 1)).toBe(true);
    expect(shouldVirtualize(99)).toBe(true); // 7904 bp @ 80 cpl
  });
  it('guards non-finite counts', () => {
    expect(shouldVirtualize(undefined)).toBe(false);
    expect(shouldVirtualize(NaN)).toBe(false);
  });
});

describe('line-window — clampIdx', () => {
  it('clamps into [0, count-1]', () => {
    expect(clampIdx(-5, 10)).toBe(0);
    expect(clampIdx(0, 10)).toBe(0);
    expect(clampIdx(9, 10)).toBe(9);
    expect(clampIdx(50, 10)).toBe(9);
  });
  it('floors fractional indices', () => {
    expect(clampIdx(3.9, 10)).toBe(3);
  });
  it('returns 0 for empty / non-finite', () => {
    expect(clampIdx(5, 0)).toBe(0);
    expect(clampIdx(NaN, 10)).toBe(0);
  });
});

describe('line-window — computeDesiredWindow', () => {
  it('expands the visible band by overscan on both sides, clamped', () => {
    const w = computeDesiredWindow({ count: 100, firstVisibleIdx: 30, lastVisibleIdx: 37, overscan: 10 });
    expect(w).toEqual({ first: 20, last: 47 });
  });
  it('clamps the lower edge at 0 and upper edge at count-1', () => {
    expect(computeDesiredWindow({ count: 100, firstVisibleIdx: 2, lastVisibleIdx: 9, overscan: 10 }))
      .toEqual({ first: 0, last: 19 });
    expect(computeDesiredWindow({ count: 100, firstVisibleIdx: 94, lastVisibleIdx: 99, overscan: 10 }))
      .toEqual({ first: 84, last: 99 });
  });
  it('falls back to a head window when the visible band is unknown', () => {
    const w = computeDesiredWindow({ count: 100, firstVisibleIdx: NaN, lastVisibleIdx: NaN, overscan: 10 });
    expect(w.first).toBe(0);
    expect(w.last).toBe(20);
  });
  it('falls back when the band is inverted (fv > lv)', () => {
    const w = computeDesiredWindow({ count: 100, firstVisibleIdx: 40, lastVisibleIdx: 30, overscan: 8 });
    expect(w.first).toBe(0);
    expect(w.last).toBe(16);
  });
  it('handles empty sequences', () => {
    expect(computeDesiredWindow({ count: 0, firstVisibleIdx: 0, lastVisibleIdx: 0 })).toEqual({ first: 0, last: 0 });
  });
  it('uses DEFAULT_OVERSCAN when omitted', () => {
    const w = computeDesiredWindow({ count: 200, firstVisibleIdx: 50, lastVisibleIdx: 55 });
    expect(w).toEqual({ first: 50 - DEFAULT_OVERSCAN, last: 55 + DEFAULT_OVERSCAN });
  });
  it('supports ASYMMETRIC overscan (lead the scroll direction)', () => {
    // scrolling down → bigger overscanAfter pre-mounts below
    const w = computeDesiredWindow({
      count: 200, firstVisibleIdx: 50, lastVisibleIdx: 55, overscanBefore: 8, overscanAfter: 30,
    });
    expect(w).toEqual({ first: 42, last: 85 });
  });
  it('asymmetric overscan still clamps at the ends', () => {
    expect(computeDesiredWindow({
      count: 100, firstVisibleIdx: 3, lastVisibleIdx: 9, overscanBefore: 20, overscanAfter: 5,
    })).toEqual({ first: 0, last: 14 });
  });
  it('uses the larger overscan in the head fallback when the band is unknown', () => {
    const w = computeDesiredWindow({
      count: 100, firstVisibleIdx: NaN, lastVisibleIdx: NaN, overscanBefore: 6, overscanAfter: 30,
    });
    expect(w.first).toBe(0);
    expect(w.last).toBe(60); // 2 × max(6,30)
  });
});

describe('line-window — directionalOverscan (velocity-aware, fixes fast-scroll blank)', () => {
  it('leads DOWN: extends the trailing (after) edge proportional to speed, keeps base before', () => {
    const r = directionalOverscan({ deltaLines: 12, base: 10, max: 40 });
    expect(r.overscanBefore).toBe(10);
    expect(r.overscanAfter).toBe(10 + Math.ceil(12 * 1.5)); // 28
  });
  it('leads UP: extends the leading (before) edge, keeps base after', () => {
    const r = directionalOverscan({ deltaLines: -8, base: 10, max: 40 });
    expect(r.overscanAfter).toBe(10);
    expect(r.overscanBefore).toBe(10 + Math.ceil(8 * 1.5)); // 22
  });
  it('caps the lead at max so a fling does not mount the whole document', () => {
    const r = directionalOverscan({ deltaLines: 999, base: 10, max: 40 });
    expect(r.overscanAfter).toBe(40);
    expect(r.overscanBefore).toBe(10);
  });
  it('symmetric base when idle (delta 0 / non-finite)', () => {
    expect(directionalOverscan({ deltaLines: 0, base: 10 })).toEqual({ overscanBefore: 10, overscanAfter: 10 });
    expect(directionalOverscan({ deltaLines: NaN, base: 12 })).toEqual({ overscanBefore: 12, overscanAfter: 12 });
  });
});

describe('line-window — windowFromAnchor (programmatic jumps)', () => {
  it('centres a window around the anchor with overscan + viewport lines', () => {
    const w = windowFromAnchor({ count: 100, anchorIdx: 50, viewportLines: 6, overscan: 10 });
    expect(w).toEqual({ first: 40, last: 66 });
  });
  it('clamps at the ends', () => {
    expect(windowFromAnchor({ count: 100, anchorIdx: 0, viewportLines: 6, overscan: 10 }).first).toBe(0);
    expect(windowFromAnchor({ count: 100, anchorIdx: 99, viewportLines: 6, overscan: 10 }).last).toBe(99);
  });
});

describe('line-window — unionWindow', () => {
  it('returns the union so neither source drops a mounted line', () => {
    expect(unionWindow({ first: 10, last: 20 }, { first: 15, last: 30 })).toEqual({ first: 10, last: 30 });
  });
  it('passes through when one side is null', () => {
    expect(unionWindow(null, { first: 1, last: 2 })).toEqual({ first: 1, last: 2 });
    expect(unionWindow({ first: 1, last: 2 }, null)).toEqual({ first: 1, last: 2 });
  });
});

describe('line-window — windowsEqual / isActiveIdx', () => {
  it('windowsEqual compares first/last', () => {
    expect(windowsEqual({ first: 1, last: 5 }, { first: 1, last: 5 })).toBe(true);
    expect(windowsEqual({ first: 1, last: 5 }, { first: 1, last: 6 })).toBe(false);
    expect(windowsEqual(null, { first: 1, last: 5 })).toBe(false);
  });
  it('isActiveIdx is inclusive on both ends', () => {
    const win = { first: 10, last: 20 };
    expect(isActiveIdx(9, win)).toBe(false);
    expect(isActiveIdx(10, win)).toBe(true);
    expect(isActiveIdx(20, win)).toBe(true);
    expect(isActiveIdx(21, win)).toBe(false);
  });
  it('treats a null window as all-active (eager path)', () => {
    expect(isActiveIdx(999, null)).toBe(true);
  });
});
