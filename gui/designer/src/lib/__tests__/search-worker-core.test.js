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
    expect(byId.a[0].location.segments[0]).toEqual({ start: 3, end: 9 });
    expect(byId.c.length).toBe(2); // two overlapping-free occurrences
  });
  it('honours circular topology per doc', () => {
    const byId = searchAllSequences('AAGTTC', [doc('z', 'TTCGGGAAG', 'circular')], { bothStrands: false });
    expect(byId.z[0].location.wrapsOrigin).toBe(true);
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
