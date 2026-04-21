import { describe, it, expect } from 'vitest';
import { getRegions } from '../annotation-model';

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
