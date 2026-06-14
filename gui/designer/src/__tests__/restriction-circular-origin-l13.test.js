/**
 * restriction-circular-origin-l13.test.js — audit L13. findSitesInSequence did
 * not wrap a circular template, so a recognition site STRADDLING the origin (last
 * bases + first bases) was invisible to both the cut preview and digest(). The
 * new optional `circular` flag searches a wrapped copy (like scanAllSites).
 */
import { describe, it, expect } from 'vitest';
import { findSitesInSequence, digest } from '../restriction-db';

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
});
