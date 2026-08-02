/**
 * K3 — the product boundary of live DNA search (SPEC §4.2.0, revised).
 *
 * The length limit applies ONLY to search with substitutions and gaps. Exact search has no
 * length limit, because finding a 400-nt sequence verbatim in a library is both cheap and
 * exactly what a biologist pasting a whole insert expects to work.
 *
 * SCOPE — this file is the ONE-MOLECULE contract. `seqMatch` is handed a single sequence and
 * answers about that sequence only, so `REQUIRES_ALIGNMENT` here is a per-document SIGNAL, not a
 * product verdict: it says «this molecule holds no exact hit and the query is too long to compare
 * approximately», which is a true statement about one molecule and says nothing about the library.
 * Deciding what the LIBRARY should answer is a strictly separate question, aggregated over every
 * eligible document in `search-worker-core` and asserted in `corpus-exact-routing.test.js` (U1).
 * Reading the rule below as the product route is what previously let one document's signal veto
 * every document after it.
 *
 * Route, for any valid ACGT query, WITHIN one molecule:
 *   1. exact first — both strands, origin wrap, no second lap;
 *   2. exact hit found → return it, whatever the length;
 *   3. no exact hit → `≤100` runs the K3.1 gapped kernel; `>100` signals `REQUIRES_ALIGNMENT`.
 *
 * The load-bearing property of `REQUIRES_ALIGNMENT` is that it is NOT a miss. «Ничего не найдено»
 * for a 400-mer would tell a biologist their sequence is absent from the library, when in truth
 * it was never compared approximately. That is the failure this route exists to prevent, so it
 * is asserted as its own contract below rather than left to the UI to get right.
 */
import { describe, it, expect } from 'vitest';
import { seqMatch as seqMatchSummary, REQUIRES_ALIGNMENT, MAX_APPROX_QUERY_LEN } from '../seq-match';

/**
 * U5-A — `seqMatch` answers with the SUMMARY model `{occurrences, locationCount, bestIndex}`, because
 * a row and an inspector must report the same number of loci as the engine found rather than the
 * length of a list that may have been capped. These contracts were written against the bare array and
 * are about the OCCURRENCES, so they unwrap it here — once, explicitly — instead of restating the
 * shape in every assertion.
 */
const seqMatch = (...args) => seqMatchSummary(...args).occurrences;


function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randDna = (rnd, n) => {
  let out = '';
  for (let i = 0; i < n; i++) out += 'ACGT'[(rnd() * 4) | 0];
  return out;
};
const RC = (q) => [...q].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');

const rnd = lcg(0x10E);
const BG = randDna(rnd, 6000);
const doc = (seq, topology = 'linear') => ({ seq, topology });
/** Catch the typed route signal the way a provider consumer would. */
const run = (q, d, ctx = {}) => {
  try {
    return { hits: seqMatch(q, d, null, { bothStrands: true, ...ctx }), code: null };
  } catch (e) {
    return { hits: null, code: e.code };
  }
};

describe('§4.2.0 — the boundary is 100 nt, and it applies only to approximate search', () => {
  it('MAX_APPROX_QUERY_LEN is 100 and is exported, not buried in a magic number', () => {
    expect(MAX_APPROX_QUERY_LEN).toBe(100);
    expect(REQUIRES_ALIGNMENT).toBe('REQUIRES_ALIGNMENT');
  });

  it.each([101, 200, 400, 1000])('an EXACT hit is returned for a %i-nt query', (len) => {
    const probe = BG.slice(1000, 1000 + len);
    const r = run(probe, doc(BG));
    expect(r.code, 'an exact hit must never be routed away').toBeNull();
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.location.segments[0].start === 1000)).toBe(true);
    expect(r.hits.some((h) => h.metrics.identity === 1)).toBe(true);
  });

  it('the exact route covers the REVERSE strand at any length', () => {
    const probe = RC(BG.slice(2000, 2400)); // 400 nt, present only as the reverse complement
    const r = run(probe, doc(BG));
    expect(r.code).toBeNull();
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.location.strand === '-' || h.location.strand === 'both')).toBe(true);
  });

  it('the exact route wraps the origin on a circular molecule, without a second lap', () => {
    const ring = BG.slice(0, 500);
    const probe = ring.slice(460) + ring.slice(0, 140); // 180 nt across the origin
    const r = run(probe, doc(ring, 'circular'));
    expect(r.code).toBeNull();
    const wrapped = r.hits.find((h) => h.location.wrapsOrigin);
    expect(wrapped, 'the origin-crossing hit must be found').toBeTruthy();
    expect(wrapped.location.segments).toHaveLength(2);
    expect(wrapped.metrics.identity).toBe(1);
    expect(wrapped.metrics.targetSpan).toBeLessThanOrEqual(ring.length); // no second lap
  });

  it('a 100-nt query with NO exact hit still runs the approximate kernel', () => {
    const probe = BG.slice(3000, 3100);
    const mutated = `${probe.slice(0, 50)}${probe[50] === 'A' ? 'C' : 'A'}${probe.slice(51)}`;
    const r = run(mutated, doc(BG), { identityThreshold: 0.8 });
    expect(r.code, 'exactly at the boundary the approximate kernel must still run').toBeNull();
    const atLocus = r.hits.find((h) => h.location.segments[0].start === 3000);
    expect(atLocus, 'the near-identical locus must be found').toBeTruthy();
    expect(atLocus.metrics.identity).toBeLessThan(1);
    expect(atLocus.metrics.identity).toBeGreaterThan(0.95);
  });

  it('a 101-nt query with NO exact hit returns REQUIRES_ALIGNMENT — one base over the line', () => {
    const probe = BG.slice(3000, 3101);
    const mutated = `${probe.slice(0, 50)}${probe[50] === 'A' ? 'C' : 'A'}${probe.slice(51)}`;
    const r = run(mutated, doc(BG), { identityThreshold: 0.8 });
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
    expect(r.hits).toBeNull();
  });

  it('A LONG QUERY NEVER BECOMES A FALSE ZERO', () => {
    // The whole point. A 400-mer that is present at 97% identity must not come back as «нет
    // совпадений» — the engine did not look, and it has to say so.
    const probe = BG.slice(4000, 4400);
    const mutated = `${probe.slice(0, 100)}${probe[100] === 'A' ? 'C' : 'A'}${probe.slice(101)}`;
    const r = run(mutated, doc(BG), { identityThreshold: 0.8 });
    expect(r.hits, 'an empty hit list here would be a lie about the molecule').toBeNull();
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
  });

  it('…and a long query that is genuinely ABSENT is also routed, not called a miss', () => {
    // Even when the answer really is «not here», this engine has not established that: it only
    // ran the exact pass. Claiming a miss would be claiming knowledge it does not have.
    const alien = randDna(lcg(0xABC), 300);
    const r = run(alien, doc(BG), { identityThreshold: 0.8 });
    expect(r.code).toBe(REQUIRES_ALIGNMENT);
  });

  it('a query shorter than the minimum is unaffected by this route', () => {
    // The 8-nt floor is a separate gate (§2.5 / plan level); routing must not swallow it.
    const r = run('ACGTACGTACGT', doc(BG), { identityThreshold: 0.8 });
    expect(r.code).toBeNull();
  });

  it('an invalid alphabet is still INVALID_DNA, not REQUIRES_ALIGNMENT, at any length', () => {
    const long = `${randDna(lcg(0x77), 300)}N`;
    const r = run(long, doc(BG));
    expect(r.code, 'a length route must not mask an alphabet error').toBe('INVALID_DNA');
  });
});
