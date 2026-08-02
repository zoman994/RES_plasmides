/**
 * finalizeSequenceOccurrences on the REAL engine (U4) — no `seq-match` mock.
 *
 * The mocked matrix proves the boundary rejects forgeries; this proves it ACCEPTS the genuine
 * article. Three shapes the finalizer must pass through untouched — a both-strand palindrome, an
 * origin-crossing wrap, and a real single-indel approximate hit — driven end-to-end through
 * `searchAllSequences`, which finalizes every hit. After finalization each result must be canonical:
 * the transport `identityBps` present, and every alignment internal (`editRuns`, `script`,
 * `mismatchPositions`) gone.
 *
 * Each per-document value is a LOCUS ENVELOPE (P1-2/P1-3) — the retained window plus the true locus
 * count and the §3.2 winner — so a genuine reply must satisfy the envelope rules too, not only the
 * per-occurrence ones. That is asserted here rather than only unwrapped: these three shapes are the
 * proof that the boundary lets the real engine through, and the real engine now declares both facts.
 */
import { describe, it, expect } from 'vitest';
import { searchAllSequences } from '../search-worker-core';
import { isValidSequenceEnvelope } from '../search-sequence-envelope';

/** The reply must satisfy the SEQUENCE envelope rules, not merely contain the right occurrences:
 * a non-empty window names a winner, the count fits the molecule (≤ 2n), and the named winner does
 * not lose to another retained hit on the rules that survived the boundary. */
const expectEnvelope = (env, seqLen, circular) => {
  expect(isValidSequenceEnvelope(env, { length: seqLen, circular })).toBe(true);
  expect(env.locationCount).toBe(env.occurrences.length); // nothing was capped on these fixtures
};

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randDna = (rnd, n) => { let o = ''; for (let i = 0; i < n; i++) o += 'ACGT'[(rnd() * 4) | 0]; return o; };

/** No alignment detail may survive the boundary, and the transport percent must be present. */
const isCanonical = (hit) => {
  const has = (v, key) => {
    if (Array.isArray(v)) return v.some((x) => has(x, key));
    if (v && typeof v === 'object') return key in v || Object.values(v).some((x) => has(x, key));
    return false;
  };
  return Number.isInteger(hit.metrics.identityBps)
    && !has(hit, 'editRuns') && !has(hit, 'script') && !has(hit, 'mismatchPositions');
};

describe('real engine hits survive finalization as canonical summaries', () => {
  it('a both-strand palindrome exact hit', () => {
    // 'GAATTCGAATTC' is its own reverse-complement, so + and - collapse to strand:'both'.
    const q = 'GAATTCGAATTC';
    const seq = `TTTAAA${q}CCCGGG`;
    const byId = searchAllSequences(q, [{ id: 'p', seq, topology: 'linear' }], { bothStrands: true, identityThreshold: 1 });
    expect(byId.p, 'the palindrome must be found').toBeDefined();
    expectEnvelope(byId.p, seq.length, false);
    expect(byId.p.occurrences.some((h) => h.location.strand === 'both')).toBe(true);
    expect(byId.p.occurrences.every(isCanonical)).toBe(true);
  });

  it('an origin-crossing wrap exact hit on a circular molecule', () => {
    // ring ends '…AAACC' and starts 'GATTAC…'; the query only matches ACROSS the origin.
    const q = 'AAACCCGATTAC';
    const ring = `GATTAC${'TGTGTGTG'}AAACCC`; // 20 nt: [14,20)=AAACCC + [0,6)=GATTAC
    const byId = searchAllSequences(q, [{ id: 'r', seq: ring, topology: 'circular' }], { bothStrands: true, identityThreshold: 1, circular: 'auto' });
    expect(byId.r, 'the wrap hit must be found').toBeDefined();
    expectEnvelope(byId.r, ring.length, true);
    const wrap = byId.r.occurrences.find((h) => h.location.wrapsOrigin);
    expect(wrap, 'a hit that crosses the origin').toBeTruthy();
    expect(wrap.location.segments).toHaveLength(2);
    expect(byId.r.occurrences.every(isCanonical)).toBe(true);
  });

  it('a real single-indel approximate hit', () => {
    const BG = randDna(lcg(0xC0FFEE), 300);
    const window = BG.slice(100, 160);         // 60 nt, present exactly in BG
    const delQuery = window.slice(0, 30) + window.slice(31); // one base removed → 59 nt, no exact hit
    const byId = searchAllSequences(delQuery, [{ id: 'g', seq: BG, topology: 'linear' }], { bothStrands: true, identityThreshold: 0.8 });
    expect(byId.g, 'the near-identical region must be found approximately').toBeDefined();
    expectEnvelope(byId.g, BG.length, false);
    expect(byId.g.occurrences.some((h) => h.metrics.insertions + h.metrics.deletions > 0), 'the alignment must carry the gap').toBe(true);
    expect(byId.g.occurrences.every(isCanonical)).toBe(true);
  });
});
