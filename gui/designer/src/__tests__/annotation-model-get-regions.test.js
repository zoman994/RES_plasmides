import { describe, it, expect } from 'vitest';
import { getRegions, enclosingRegionId } from '../annotation-model';

describe('getRegions — id fallback (Map-WS-1-fix-B K4.1)', () => {
  it('backfills a deterministic id for annotations without one', () => {
    const anns = [
      { level: 'region', type: 'CDS', name: 'KanR', start: 100, end: 900 },
    ];
    const first = getRegions(anns);
    const second = getRegions(anns);
    expect(first[0].id).toBeTruthy();
    expect(first[0].id).toBe(second[0].id);
    expect(first[0].id).toMatch(/^region:100:900:CDS:KanR$/);
  });

  it('does not overwrite an existing id', () => {
    const anns = [
      { id: 'ext-1', level: 'region', type: 'CDS', name: 'bla', start: 0, end: 861 },
    ];
    const [r] = getRegions(anns);
    expect(r.id).toBe('ext-1');
  });

  it('gives distinct ids to regions with identical type/name but different coordinates', () => {
    const anns = [
      { level: 'region', type: 'repeat_region', name: 'AMA1', start: 100, end: 200 },
      { level: 'region', type: 'repeat_region', name: 'AMA1', start: 500, end: 600 },
    ];
    const [a, b] = getRegions(anns);
    expect(a.id).not.toBe(b.id);
  });

  it('returns empty array for null / undefined / empty inputs (regression guard)', () => {
    expect(getRegions(null)).toEqual([]);
    expect(getRegions(undefined)).toEqual([]);
    expect(getRegions([])).toEqual([]);
  });
});

describe('enclosingRegionId (UX-9 — auto-parent a sub-feature to its gene)', () => {
  const ANNS = [
    { id: 'gene', level: 'region', type: 'CDS', name: 'glaA', start: 100, end: 900 },
    { id: 'big', level: 'region', type: 'misc_feature', name: 'locus', start: 0, end: 1000 },
  ];

  it('returns the SMALLEST region fully containing the span', () => {
    // [300,400) is inside both 'gene' (100..900) and 'big' (0..1000) → smaller wins.
    expect(enclosingRegionId(ANNS, 300, 400)).toBe('gene');
  });

  it('returns null when no region contains the span', () => {
    expect(enclosingRegionId(ANNS, 950, 980)).toBe('big'); // inside big only
    expect(enclosingRegionId([{ id: 'g', level: 'region', start: 100, end: 200 }], 300, 400)).toBeNull();
  });

  it('does not link a span that crosses a region boundary', () => {
    // [850,950) overlaps 'gene' but isn't contained → only 'big' encloses it.
    expect(enclosingRegionId(ANNS, 850, 950)).toBe('big');
    // crosses the outer boundary too → no enclosing region
    expect(enclosingRegionId(ANNS, 900, 1100)).toBeNull();
  });

  it('a whole-region span still counts as enclosed (whole-CDS domain)', () => {
    expect(enclosingRegionId(ANNS, 100, 900)).toBe('gene');
  });

  it('backfills region ids so a region without an explicit id can still be the parent', () => {
    const anns = [{ level: 'region', type: 'CDS', name: 'x', start: 10, end: 90 }];
    expect(enclosingRegionId(anns, 20, 30)).toBe('region:10:90:CDS:x');
  });

  it('null/empty inputs → null', () => {
    expect(enclosingRegionId(null, 1, 2)).toBeNull();
    expect(enclosingRegionId([], 1, 2)).toBeNull();
    expect(enclosingRegionId(ANNS, NaN, 5)).toBeNull();
  });
});
