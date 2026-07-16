/**
 * seq-match — the sequence-dimension provider (P1.5). This is the `ctx.seqMatch`
 * that library-search injects: it ROUTES a DNA query to the right engine and
 * normalizes the output to the SearchOccurrence contract
 * (`{ location:{segments,strand,wrapsOrigin}, metrics }`).
 *
 * Routing: short (≤30) OR degenerate (IUPAC) OR circular → exhaustive scanMotif;
 * otherwise → seed-and-extend (long fuzzy DNA).
 */
import { describe, it, expect } from 'vitest';
import { seqMatch } from '../seq-match';

describe('seq-match — short / exact', () => {
  it('returns SearchOccurrences with location + metrics', () => {
    const occ = seqMatch('GAATTG', { seq: 'AAAGAATTGCCC', topology: 'linear' });
    expect(occ.length).toBeGreaterThanOrEqual(1);
    const plus = occ.find((o) => o.location.strand === '+');
    expect(plus.location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(plus.location.wrapsOrigin).toBe(false);
    expect(plus.metrics.identity).toBe(1);
    expect(plus.metrics.compatibility).toBe(1);
  });
  it('reports every overlapping occurrence (exhaustive path)', () => {
    const occ = seqMatch('AA', { seq: 'AAAA' }, null, { bothStrands: false });
    expect(occ.map((o) => o.location.segments[0].start)).toEqual([0, 1, 2]);
  });
});

describe('seq-match — IUPAC', () => {
  it('a degenerate query routes to the exhaustive scanner; identity is null', () => {
    const occ = seqMatch('GN', { seq: 'GAGTGC' }, null, { bothStrands: false });
    expect(occ.map((o) => o.location.segments[0].start)).toEqual([0, 2, 4]);
    for (const o of occ) expect(o.metrics.identity).toBeNull();
  });
});

describe('seq-match — circular wrap', () => {
  it('a motif spanning the origin is found for a circular sequence', () => {
    const occ = seqMatch('AAGTTC', { seq: 'TTCGGGAAG', topology: 'circular' }, null, { bothStrands: false });
    expect(occ).toHaveLength(1);
    expect(occ[0].location.wrapsOrigin).toBe(true);
    expect(occ[0].location.segments).toEqual([{ start: 6, end: 9 }, { start: 0, end: 3 }]);
  });
});

describe('seq-match — long fuzzy routes to seed-extend', () => {
  it('a long query with one mismatch is found with identity < 1', () => {
    const ref = 'ATGCGTACGTTAGCCTAGCATCGATCGTAGCTAGCTAGCTA'; // 41 nt
    const target = `TTTT${ref}TTTT`;
    // introduce a single mismatch in the query (pos 20: swap one base)
    const q = `${ref.slice(0, 20)}${ref[20] === 'A' ? 'C' : 'A'}${ref.slice(21)}`;
    const occ = seqMatch(q, { seq: target, topology: 'linear' });
    expect(occ.length).toBeGreaterThanOrEqual(1);
    const best = occ[0];
    expect(best.metrics.identity).toBeGreaterThan(0.9);
    expect(best.metrics.identity).toBeLessThan(1);
    expect(best.location.segments[0]).toHaveProperty('start');
  });
});

describe('seq-match — guards', () => {
  it('no sequence → empty', () => {
    expect(seqMatch('ATGC', null)).toEqual([]);
    expect(seqMatch('ATGC', { seq: '' })).toEqual([]);
    expect(seqMatch('', { seq: 'ATGC' })).toEqual([]);
  });
});

describe('seq-match — prefs overrides (REV-1)', () => {
  it('circular:on finds an origin-straddling motif on a linear-topology doc', () => {
    const occ = seqMatch('GAATTC', { seq: 'TTCAAAAAAAGAA', topology: 'linear' }, null, { circular: 'on' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(true);
  });
  it('circular:off disables wrap even on a circular doc', () => {
    const occ = seqMatch('GAATTC', { seq: 'TTCAAAAAAAGAA', topology: 'circular' }, null, { circular: 'off' });
    expect(occ.some((o) => o.location.wrapsOrigin)).toBe(false);
  });
  it('iupac:off makes a degenerate query match literally (no compatibility fallback)', () => {
    expect(seqMatch('GAANTC', { seq: 'AAAGAATTCTTT', topology: 'linear' }, null, { iupac: 'off' })).toHaveLength(0);
  });
});
