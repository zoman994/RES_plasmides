/**
 * restriction-circular-origin-l13.test.js — audit L13. findSitesInSequence did
 * not wrap a circular template, so a recognition site STRADDLING the origin (last
 * bases + first bases) was invisible to both the cut preview and digest(). The
 * new optional `circular` flag searches a wrapped copy (like scanAllSites).
 */
import { describe, it, expect } from 'vitest';
import { findSitesInSequence, digest } from '../restriction-db';
import { getSegments, makeLocation, normalizeLocation } from '../lib/annotation-location';

// EcoRI = GAATTC. This 16-nt sequence has the site split across the origin:
// trailing 'G' + leading 'AATTC' → 'GAATTC' only when wrapped. No GAATTC linearly.
const ORIGIN_SPLIT = 'AATTCTTTTTTTTTTG';

describe('findSitesInSequence — circular origin wrap (L13)', () => {
  it('linear search misses the origin-straddling site', () => {
    expect(findSitesInSequence('EcoRI', ORIGIN_SPLIT, false)).toHaveLength(0);
  });
  it('circular search finds it (one site, near the end)', () => {
    const sites = findSitesInSequence('EcoRI', ORIGIN_SPLIT, true);
    expect(sites).toHaveLength(1);
    expect(sites[0].position).toBeLessThan(ORIGIN_SPLIT.length);
  });
  it('no double-count: a non-straddling circular site is found once', () => {
    // GAATTC fully inside → exactly one site whether wrapped or not.
    const seq = 'TTTGAATTCTTTTTTTTTTTT';
    expect(findSitesInSequence('EcoRI', seq, true)).toHaveLength(1);
  });
  it('digest() (circular) no longer reports «0 cuts» for an origin site', () => {
    const r = digest(ORIGIN_SPLIT, [], 'EcoRI');
    expect(r.error).toBeUndefined(); // was "EcoRI cuts 0 times"
  });

  it('normalizes an origin-crossing PstI cut before rotating sequence and annotations', () => {
    // CTGCAG starts at index 15; PstI top cut is (15 + 5) mod 16 = 4.
    const sequence = 'TGCAGAAAAAAAAAAC';
    const annotation = {
      id: 'cross', level: 'region', start: 2, end: 6, name: 'cross',
      location: makeLocation('single', [{ start: 2, end: 6 }]),
    };
    const result = digest(sequence, [annotation], 'PstI');

    expect(result.error).toBeUndefined();
    expect(result.backbone.sequence).toBe('GAAAAAAAAAACTGCA');
    expect(result.backbone.annotations
      .map(({ start, end }) => ({ start, end }))
      .sort((a, b) => a.start - b.start))
      .toEqual([{ start: 0, end: 2 }, { start: 14, end: 16 }]);
    expect(result.backbone.annotations.every((a) => a.start < a.end)).toBe(true);
    expect(result.backbone.annotations.map(getSegments)).toEqual([
      [{ start: 0, end: 2 }],
      [{ start: 14, end: 16 }],
    ]);
    for (const projected of result.backbone.annotations) {
      expect(() => normalizeLocation(projected, {
        length: result.backbone.length, topology: 'linear',
      })).not.toThrow();
    }
  });

  it('finds the catalog-derived 15 bp XcmI site once across origin', () => {
    const sequence = 'CAAAAAAAAAATGGTTTTTC';
    const sites = findSitesInSequence('XcmI', sequence, true);

    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      position: 19,
      occurrence: {
        topCut: 7,
        bottomCut: 6,
        recognition: { wrapsOrigin: true },
      },
    });
  });
});
