/**
 * nav-target — turn a SearchOccurrence location into what the sequence view needs
 * to JUMP (P3): a caret range for the highlight, a scroll position, and overlay
 * hit rects. Coordinates stay 0-based half-open [start,end) end-to-end. A circular
 * hit selects its PRIMARY (first) segment as the caret but paints ALL segments as
 * overlay rects (SelectionOverlay is one contiguous range; SearchHitsOverlay isn't).
 */
import { describe, it, expect } from 'vitest';
import { navFromLocation, overlayHitsFromLocation } from '../nav-target';

describe('navFromLocation', () => {
  it('linear + strand: caret = the segment, scroll to its start', () => {
    const nav = navFromLocation({ segments: [{ start: 3, end: 9 }], strand: '+', wrapsOrigin: false });
    expect(nav).toMatchObject({ caret: { start: 3, end: 9 }, scrollPos: 3, strand: 1, wrapsOrigin: false });
  });
  it('reverse strand → strand -1', () => {
    expect(navFromLocation({ segments: [{ start: 2, end: 5 }], strand: '-' }).strand).toBe(-1);
  });
  it('circular wrap: caret = the FIRST segment; wrapsOrigin surfaced', () => {
    const nav = navFromLocation({ segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }], strand: '+', wrapsOrigin: true });
    expect(nav.caret).toEqual({ start: 6, end: 9 });
    expect(nav.scrollPos).toBe(6);
    expect(nav.wrapsOrigin).toBe(true);
    expect(nav.segments).toHaveLength(2);
  });
  it('empty / missing → null', () => {
    expect(navFromLocation({ segments: [] })).toBeNull();
    expect(navFromLocation(null)).toBeNull();
  });

  it('the CANONICAL strand travels beside the ±1 selection strand (U5-A)', () => {
    // The selection is drawn on ONE strand, so it has to collapse `both` to the forward one. The
    // overlay can paint both, and a palindromic hit must not arrive there as «forward only».
    const pal = navFromLocation({ segments: [{ start: 0, end: 8 }], strand: 'both' });
    expect(pal.strand).toBe(1);
    expect(pal.strandRaw).toBe('both');
    expect(navFromLocation({ segments: [{ start: 2, end: 5 }], strand: '-' }).strandRaw).toBe('-');
    expect(navFromLocation({ segments: [{ start: 2, end: 5 }], strand: '+' }).strandRaw).toBe('+');
  });

  it('identityBps travels for the overlay colour; absent → null, never a guess from the float', () => {
    const loc = { segments: [{ start: 0, end: 6 }], strand: '+' };
    expect(navFromLocation(loc, { identityBps: 9500 }).identityBps).toBe(9500);
    expect(navFromLocation(loc).identityBps).toBeNull();
    expect(navFromLocation(loc, { identity: 0.95 }).identityBps).toBeNull();
  });
});

describe('overlayHitsFromLocation', () => {
  it('emits one overlay rect per segment with identity + strand', () => {
    const hits = overlayHitsFromLocation(
      { segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }], strand: '-' },
      { identity: 0.9, mismatchPositions: [7] },
    );
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ targetStart: 6, targetEnd: 9, strand: -1, queryIdentity: 0.9 });
    expect(hits[0].mismatchPositions).toEqual([7]); // mismatches on the first rect only
    expect(hits[1].mismatchPositions).toEqual([]);
  });
  it('IUPAC (identity null) falls back to compatibility for the rect colour', () => {
    const hits = overlayHitsFromLocation({ segments: [{ start: 0, end: 6 }], strand: '+' },
      { identity: null, compatibility: 1 });
    expect(hits[0].queryIdentity).toBe(1);
  });
});
