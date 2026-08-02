/**
 * search-worker-core — the pure, worker-portable heart of the sequence dimension
 * (P1.5). The real worker (search.worker.js) is a 2-line shell around this; keeping
 * the logic here means it is unit-tested without a Worker runtime.
 *
 * It searches ONE query across MANY document sequences in a single call (one
 * message per search, not per-doc) → { docId: occurrences[] }.
 */
import { describe, it, expect } from 'vitest';
import { searchAllSequences, handleSearchMessage } from '../search-worker-core';

const doc = (id, seq, topology = 'linear') => ({ id, seq, topology });

describe('searchAllSequences', () => {
  it('returns per-doc occurrences keyed by id (only docs that hit)', () => {
    const docs = [
      doc('a', 'AAAGAATTGCCC'),
      doc('b', 'TTTTTTTTTTTT'), // no GAATTG
      doc('c', 'GAATTGGAATTG'),
    ];
    const byId = searchAllSequences('GAATTG', docs, { bothStrands: false });
    expect(Object.keys(byId).sort()).toEqual(['a', 'c']); // b omitted (no hit)
    // Each value is a LOCUS ENVELOPE (P1-2/P1-3) — the retained window plus how many loci exist and
    // which retained one is the §3.2 winner. Both numbers are measured inside the engine and cannot
    // be recomputed here, so the sweep carries them rather than returning a bare array.
    expect(byId.a.occurrences[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(byId.a.locationCount).toBe(byId.a.occurrences.length); // nothing was capped away
    expect(byId.a.occurrences[byId.a.bestIndex]).toBe(byId.a.occurrences[0]);
    // Both exact copies are found…
    const exact = byId.c.occurrences.filter((o) => o.metrics.identity === 1).map((o) => o.location.segments[0].start);
    expect(exact).toEqual([0, 6]);
    // …and the near-matches the old exact-only path hid are resolved by §3.2.1: everything that
    // ends where an exact copy ends collapses onto it, in BOTH nesting directions — the leading-
    // insertion variants at starts 1 and 7 (nested inside) and the interior-deletion variant at
    // start 5 (which contains the exact hit at 6). One tandem copy, one occurrence.
    expect(byId.c.occurrences.map((o) => o.location.segments[0].start)).toEqual([0, 6]);
  });
  it('honours circular topology per doc', () => {
    const byId = searchAllSequences('AAGTTC', [doc('z', 'TTCGGGAAG', 'circular')], { bothStrands: false });
    expect(byId.z.occurrences[0].location.wrapsOrigin).toBe(true);
  });
  it('empty query / non-array → empty object', () => {
    expect(searchAllSequences('', [doc('a', 'ACGT')])).toEqual({});
    expect(searchAllSequences('ACGT', null)).toEqual({});
  });
});

describe('handleSearchMessage', () => {
  it('echoes the request id and wraps the results', () => {
    const out = handleSearchMessage({ id: 'w7', seqQuery: 'GAATTG', docs: [doc('a', 'AAAGAATTGCCC')], ctx: { bothStrands: false } });
    expect(out.id).toBe('w7');
    expect(out.byId.a).toBeTruthy();
  });
});
