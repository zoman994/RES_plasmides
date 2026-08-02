/**
 * sequence-search — Sprint M-X.9 K1 (DEC-SEARCH-SEED-EXTEND-01).
 *
 * Pinned biolog use cases (10.05.2026 contract):
 *   1. ~30 nt query, up to 5 mismatches → still a hit at ≥80%.
 *   2. Primer with overhang — hit shows partial coverage on the
 *      anchored part; 3'-end indicator surfaces.
 *   3. 1000 nt gene with 2 mismatches in a homologue → single hit
 *      with 99.8% identity.
 */
import { describe, it, expect } from 'vitest';
import {
  searchSequence,
  searchLibrary,
  buildGlobalIndex,
  buildSeedIndex,
  adaptiveSeedLen,
  reverseComplement,
  identityBucket,
  canonicalDnaQuery,
} from '../sequence-search';

describe('reverseComplement — IUPAC fix (P1.5, was truncated {A,T,G,C,N})', () => {
  it('plain DNA unchanged', () => {
    expect(reverseComplement('ATGC')).toBe('GCAT');
  });
  it('IUPAC codes are complemented, not N-ified', () => {
    expect(reverseComplement('RYSWKM')).toBe('KMWSRY');
    expect(reverseComplement('N')).toBe('N');
    expect(reverseComplement('B')).toBe('V'); // was → N
  });
  it('RNA (U) is normalized and complemented (U→A)', () => {
    expect(reverseComplement('AUGC')).toBe('GCAT');
  });
  it('is an involution over the full IUPAC alphabet', () => {
    const s = 'ATGCNRYSWKMBDHV';
    expect(reverseComplement(reverseComplement(s))).toBe(s);
  });
});

describe('M-X.9 K1 — sequence-search core', () => {
  it('exact match — single full-length hit, identity 1.0', () => {
    const target = 'AAATTTGCATGCATGCATGCAAA';
    const query = 'GCATGCATGCATGC'; // 14 nt inside target
    const hits = searchSequence(query, target);
    const fwd = hits.filter((h) => h.strand === 1);
    expect(fwd.length).toBeGreaterThanOrEqual(1);
    const top = fwd[0];
    expect(top.identity).toBeCloseTo(1, 5);
    expect(top.length).toBe(14);
    expect(top.matches).toBe(14);
    expect(top.mismatches).toBe(0);
    expect(target.slice(top.targetStart, top.targetEnd)).toBe(query);
  });

  it('use case 1: 30 nt query with 5 mismatches still passes 80% threshold (25/30 ≈ 83%)', () => {
    const original = 'GCATGCATGCATGCATGCATGCATGCATGC'; // 30 nt
    const target = `AAA${original}AAA`;
    // Introduce 5 mismatches scattered.
    const queryArr = original.split('');
    queryArr[3] = 'A';
    queryArr[10] = 'T';
    queryArr[17] = 'A';
    queryArr[22] = 'C';
    // Last mismatch placed AWAY from the 3' end (not in last 3 nt)
    // so the run-of-3 stop doesn't kill the right-extend before
    // the seed has a chance — and the 3'-end indicator stays clean.
    queryArr[26] = 'G';
    const query = queryArr.join('');
    const hits = searchSequence(query, target).filter((h) => h.strand === 1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const best = hits.sort((a, b) => b.length - a.length)[0];
    expect(best.length).toBeGreaterThanOrEqual(20);
    expect(best.identity).toBeGreaterThanOrEqual(0.8);
  });

  it('use case 2 (overhang): primer with non-matching 5\' tail anneals on 3\' part (slider relaxed to 50%)', () => {
    // Primer with 8 nt junk tail on 5' (it doesn't match anything).
    // The 3' end is a perfect 22 nt anneal. Query length = 30.
    // FAIL-fix-pass 6 — threshold is now per-query identity. With
    // 22/30 = 0.73, the default 0.8 filters this out, and the
    // biolog explicitly relaxes the slider for overhang search.
    const anneal = 'GCATGCATGCATGCATGCATGC'; // 22 nt
    const tail = 'AAAAAAAA';                  // 8 nt junk
    const primer = tail + anneal;             // 30 nt total
    const target = `TTT${anneal}TTT`;
    const hits = searchSequence(primer, target, { identityThreshold: 0.5 })
      .filter((h) => h.strand === 1);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const best = hits[0];
    // Coverage reflects only the matched portion of the query, not
    // its full length.
    expect(best.coverage).toBeGreaterThanOrEqual(20);
    expect(best.coverage).toBeLessThan(primer.length);
    // queryStart > 0 because the tail wasn't matched.
    expect(best.queryStart).toBeGreaterThan(0);
    // 3'-end indicator: the primer-mode threshold (≤50 nt) applies;
    // and last 3 nt of the query (anneal end) are matched → ✓.
    expect(best.threePrimeOk).toBe(true);
  });

  it('use case 3: 50 nt gene fragment with 2 mismatches → identity ≈ 0.96', () => {
    const original = 'ATGGCAGCTACGGTAGCAGTAGCATCAGTACGTAGCAGTAGCATCAGCTA'; // 50 nt
    const target = `AAA${original}TTT`;
    // Two mismatches in the middle.
    const q = original.split('');
    q[15] = q[15] === 'A' ? 'T' : 'A';
    q[30] = q[30] === 'C' ? 'G' : 'C';
    const hits = searchSequence(q.join(''), target).filter((h) => h.strand === 1);
    expect(hits.length).toBe(1);
    const h = hits[0];
    expect(h.matches).toBeGreaterThanOrEqual(48);
    expect(h.identity).toBeGreaterThanOrEqual(0.95);
    expect(h.mismatchPositions.length).toBeLessThanOrEqual(2);
  });

  it('reverse strand: revcomp query of a forward-strand region matches as strand=-1', () => {
    const target = 'AAACCCAAAGCATGCATGCATGCAAA';
    const fwdRegion = 'GCATGCATGCATGC';
    const revQuery = reverseComplement(fwdRegion);
    const hits = searchSequence(revQuery, target);
    const rev = hits.filter((h) => h.strand === -1);
    expect(rev.length).toBeGreaterThanOrEqual(1);
    expect(rev[0].identity).toBeCloseTo(1, 5);
  });

  it('drops queries shorter than 8 nt', () => {
    expect(searchSequence('ACGTACG', 'ACGTACGTACGT')).toEqual([]);
  });

  it('drops hits with identity < threshold (50% mismatches → rejected)', () => {
    const target = 'AAACCCGGGTTT';
    const query = 'AAATTTGGG'; // very different, low identity
    const hits = searchSequence(query, target, { identityThreshold: 0.95 });
    expect(hits).toEqual([]);
  });

  it('adaptiveSeedLen: cap at 8, floor 4, half of query length in between', () => {
    expect(adaptiveSeedLen(8)).toBe(4);
    expect(adaptiveSeedLen(12)).toBe(6);
    expect(adaptiveSeedLen(16)).toBe(8);
    expect(adaptiveSeedLen(100)).toBe(8);
    expect(adaptiveSeedLen(0)).toBe(4);
  });

  it('buildSeedIndex enumerates all k-mers and skips N-containing seeds', () => {
    const idx = buildSeedIndex('AAAANTTTTAAAA', 4);
    expect(idx.get('AAAA')?.length).toBeGreaterThan(0);
    // No seed should contain N.
    for (const seed of idx.keys()) expect(seed.includes('N')).toBe(false);
  });

  it('searchLibrary tags hits with entryId and pulls per-entry sequence', () => {
    const entries = [
      { id: 'plasmid-A', sequence: 'AAA' + 'GCATGCATGCATGC' + 'AAA' },
      { id: 'plasmid-B', sequence: 'TTT' + 'GCATGCATGCATGC' + 'TTT' },
      { id: 'plasmid-C', sequence: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCC' },
    ];
    const hits = searchLibrary('GCATGCATGCATGC', entries);
    const ids = new Set(hits.map((h) => h.entryId));
    expect(ids.has('plasmid-A')).toBe(true);
    expect(ids.has('plasmid-B')).toBe(true);
    expect(ids.has('plasmid-C')).toBe(false);
  });

  it('buildGlobalIndex aggregates positions per entryId; missing seeds absent', () => {
    const entries = [
      { id: 'a', sequence: 'AAAATTTT' },
      { id: 'b', sequence: 'AAAACCCC' },
    ];
    const idx = buildGlobalIndex(entries, 4);
    const aaaa = idx.get('AAAA') || [];
    expect(aaaa.length).toBe(2);
    expect(aaaa.find((p) => p.entryId === 'a')).toBeTruthy();
    expect(aaaa.find((p) => p.entryId === 'b')).toBeTruthy();
    expect(idx.get('GGGG')).toBeUndefined();
  });

  it('identityBucket bins by 90/80/70 thresholds (FAIL-fix-pass 6 — added orange tier)', () => {
    expect(identityBucket(0.95)).toBe('high');
    expect(identityBucket(0.85)).toBe('mid');
    expect(identityBucket(0.7)).toBe('orange'); // changed from low
    expect(identityBucket(0.5)).toBe('low');    // grey now
  });

  it('canonicalDnaQuery returns the canonical string or null (K3.0 §2.5)', () => {
    // One helper replaces the old isDnaQuery/hasIupacAmbiguity pair. It returns the STRING so the
    // plan and the engine cannot disagree about what was searched — a boolean let the untrimmed
    // original through to an engine that then rejected it.
    expect(canonicalDnaQuery('ACGTACGT')).toBe('ACGTACGT');
    expect(canonicalDnaQuery('  acgtacgt  ')).toBe('ACGTACGT'); // trim + uppercase
    expect(canonicalDnaQuery('not a dna string')).toBeNull();
    expect(canonicalDnaQuery('ACGT')).toBeNull();      // too short
    expect(canonicalDnaQuery('ACGTNCGT')).toBeNull();  // degenerate: rejected, not flagged
    expect(canonicalDnaQuery('ACGTRCGT')).toBeNull();
    expect(canonicalDnaQuery('ACGUACGU')).toBeNull();  // U is NOT rewritten to T here
    expect(canonicalDnaQuery('ACGT ACGT')).toBeNull(); // interior space: invalid, not stripped
  });

  it('3\'-end indicator is `null` for queries longer than the primer-mode threshold (>50 nt)', () => {
    const long = 'GCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCATGCAT'; // 51 nt
    const target = 'AAA' + long + 'AAA';
    const hits = searchSequence(long, target);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].threePrimeOk).toBeNull();
  });

  // FAIL-fix-pass 6 — per-query identity is the primary metric.
  describe('per-query identity + coverage (FAIL-fix-pass 6)', () => {
    it('full-length perfect match → queryIdentity = 1.0, queryCoverage = 1.0 (Фикс 7: hitIdentity removed)', () => {
      const original = 'GCATGCATGCATGCATGCATGCATGCATGC'; // 30 nt
      const target = `AAA${original}TTT`;
      const hits = searchSequence(original, target).filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const h = hits[0];
      expect(h.queryIdentity).toBeCloseTo(1, 5);
      expect(h.queryCoverage).toBeCloseTo(1, 5);
      expect(h.hitIdentity).toBeUndefined();
    });

    it('overhang primer: queryIdentity ≈ 0.73 (matches/queryLen still 22/30); coverage now ~0.83 (full-window expands alignment to target edges)', () => {
      // 8 nt junk tail + 22 nt perfect anneal = 30 nt query.
      const anneal = 'GCATGCATGCATGCATGCATGC'; // 22 nt
      const tail = 'AAAAAAAA';                  // 8 nt junk
      const primer = tail + anneal;             // 30 nt total
      const target = `TTT${anneal}TTT`;
      const hits = searchSequence(primer, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const h = hits.sort((a, b) => b.matches - a.matches)[0];
      expect(h.queryIdentity).toBeGreaterThanOrEqual(0.7);
      expect(h.queryIdentity).toBeLessThanOrEqual(0.8);
      // Фикс 7 — full-window alignment expands the window past the
      // extension as long as a target position exists. Pre-anchor
      // walks back from the anneal start (target pos 3) until target
      // index goes < 0, so query positions 5..7 are now alignable
      // (mismatching tail vs target's `TTT`). alignableLen = 25.
      expect(h.queryCoverage).toBeCloseTo(25 / 30, 2);
    });

    it('top-level sort: long-with-1-mm hit ranks above short-perfect-subseed hit', () => {
      // Target has TWO good regions for the same query:
      //   region A: 30 nt full match with 1 mismatch (queryIdent = 29/30 ≈ 0.97)
      //   region B: 12 nt PERFECT subseed only      (queryIdent = 12/30 = 0.40)
      const original = 'GCATGCATGCATGCATGCATGCATGCATGC';   // 30 nt
      const oneMm = 'GCATGAATGCATGCATGCATGCATGCATGC';     // pos 5 G→A
      const subseed = 'GCATGCATGCAT';                      // 12 nt — first 12 of original
      const target = `AAAA${oneMm}TTTT${subseed}TTTT`;
      const hits = searchSequence(original, target, { identityThreshold: 0.3 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(2);
      // First hit (sort order) MUST be the long one.
      expect(hits[0].queryIdentity).toBeGreaterThan(hits[1].queryIdentity);
      expect(hits[0].length).toBeGreaterThan(hits[1].length);
    });

    it('queryStart / queryEnd reflect the FULL alignable window (Фикс 7) — clipped only by target edges', () => {
      const anneal = 'GCATGCATGCATGCATGCATGC'; // 22 nt
      const primer = 'AAAAAAAA' + anneal;       // 8 nt tail + anneal
      const target = `TTT${anneal}TTT`;          // 28 nt target
      const hits = searchSequence(primer, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      const h = hits.sort((a, b) => b.matches - a.matches)[0];
      // pre-anchor = -5; query positions 5..7 are alignable to
      // target positions 0..2. Position 4 → target -1 (off-edge).
      expect(h.queryStart).toBe(5);
      expect(h.queryEnd).toBe(30);
    });

    it('identityBucket adds an `orange` tier for 70-79% (was `low`)', () => {
      expect(identityBucket(0.95)).toBe('high');
      expect(identityBucket(0.85)).toBe('mid');
      expect(identityBucket(0.75)).toBe('orange');
      expect(identityBucket(0.5)).toBe('low');
    });
  });

  // 11.05.2026 — single-nt indel recovery. Biolog reported that a
  // 15 nt query with one extra A in the middle surfaced as 9/15 (60%)
  // because the no-gap extension stopped at the indel. With
  // limited-gap support (1 indel per side) the same query should
  // surface as 14/15 (~93%).
  describe('single-nt indel recovery (gap-tolerant extension)', () => {
    it('query has a 1-nt insertion in the middle → hit covers full query at ~93%', () => {
      // Target: 14 nt of context + a sequence biolog wants to find.
      const targetCore = 'AAAAATAGATGAGT';                  // 14 nt
      const target = `CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC${targetCore}TTTT`;
      // Query has one extra A inserted at position 9 (between AGA and TGAGT).
      const query = 'AAAAATAGAATGAGT';                       // 15 nt
      const hits = searchSequence(query, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const best = hits.sort((a, b) => b.queryIdentity - a.queryIdentity)[0];
      // 14 of the query's 15 nt matched somewhere in the alignment.
      expect(best.matches).toBeGreaterThanOrEqual(13);
      expect(best.queryIdentity).toBeGreaterThanOrEqual(0.85);
      // Exactly one gap was used (insertion in query).
      expect(best.gapsInTarget).toBeGreaterThanOrEqual(1);
    });

    it('query has a 1-nt deletion in the middle → still surfaces near full coverage', () => {
      // Target: 16 nt with one extra char vs query.
      const targetCore = 'AAAAATAGATTTGAGTAGGT';                // 20 nt
      const target = `CCCCCCCCCCCCC${targetCore}TTTT`;
      // Query is the same as target except missing one T at position 10.
      const query = 'AAAAATAGATTGAGTAGGT';                       // 19 nt
      const hits = searchSequence(query, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const best = hits.sort((a, b) => b.queryIdentity - a.queryIdentity)[0];
      expect(best.matches).toBeGreaterThanOrEqual(17);
      expect(best.queryIdentity).toBeGreaterThanOrEqual(0.85);
    });

    it('2 mismatches near the start of extension do NOT break the run (drop=8 tolerance)', () => {
      // Pattern: M, m, m, M, M, M, M, M, M, M, M, M, M, M, M
      // Old drop=5 broke this after the second m (score 1→-1→-3,
      // drop=4, plus one more advance to drop=5 → break). With
      // drop=8 the run survives and the rest of the matches accrue.
      const seed = 'GCATGCAT';                          // 8 nt seed
      const tail = 'TGCATGCATGCATG';                    // 14 nt clean tail
      const queryTail = 'TAATGCATGCATG';                // 13 nt: T,A,A,T,G,C,A,T,G,C,A,T,G — 2 mm near start (positions 1+2)
      const target = `AAA${seed}${tail}TTT`;             // tail at target positions [11..25)
      const query = `${seed}${queryTail}`;              // query: 8+13 = 21 nt total, 2 mm at positions 9,10
      // Verify mismatches are isolated:
      // pos 8 = T (target T) match, pos 9 = A (target G) MM, pos 10 = A (target C) MM, pos 11 = T (target A) MM... hmm let me adjust.
      const altTail = 'TGCAAGCATGCAT';                  // 13: T match G, C match C, A mm A, A match A, G match G, C match C, A match A, T match T, G match G, C match C, A match A, T match T
      const altQ = `${seed}${altTail}`;
      const hits = searchSequence(altQ, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const best = hits[0];
      // Most of the query (≥18/21) should match.
      expect(best.matches).toBeGreaterThanOrEqual(18);
    });

    it('3 mismatches in a row still trigger `runOfK` stop in extension (Фикс 7: full-window adds them as mm rather than truncating length)', () => {
      // Pattern: M*16 in seed region then 3 mm vs target.
      // Pre-Фикс-7: hit length truncated.
      // Post-Фикс-7: full-window keeps length=queryLen but counts the
      // 3 mm correctly. queryIdentity drops. So this test now asserts
      // matches < length (mismatches present) rather than truncation.
      const seedRegion = 'GCATGCATGCATGCAT';                // 16 nt clean
      const target = `AAA${seedRegion}AAATTGGCCAA`;
      const query = `${seedRegion}TTGCAT`;                   // 22 nt
      const hits = searchSequence(query, target, { identityThreshold: 0.5 })
        .filter((h) => h.strand === 1);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      const best = hits[0];
      expect(best.matches).toBeLessThan(best.length);
      // queryIdentity < 1.0 — there ARE recognised mismatches in the right tail.
      expect(best.queryIdentity).toBeLessThan(1);
    });

    // 11.05.2026 — Фикс 7. Position-independence invariant.
    // For a fixed query of length N with K mismatches, queryIdentity
    // must equal (N-K)/N regardless of where the mismatches fall.
    describe('queryIdentity is position-independent (Фикс 7)', () => {
      const QUERY = 'GCATGCATGCATGCATGCATGCATGCATGC'; // 30 nt, all distinct enough
      const flipNt = (c) => (c === 'A' ? 'T' : c === 'T' ? 'A' : c === 'G' ? 'C' : 'G');
      function targetWithMismatchAt(positions) {
        const t = QUERY.split('');
        for (const p of positions) t[p] = flipNt(t[p]);
        return `AAAA${t.join('')}TTTT`; // padded so seed-extend has clean anchors
      }

      it('1 mismatch — queryIdentity = 29/30 ≈ 0.9667 for ALL positions 0..29', () => {
        const expected = 29 / 30;
        for (let p = 0; p < QUERY.length; p++) {
          const target = targetWithMismatchAt([p]);
          const hits = searchSequence(QUERY, target, { identityThreshold: 0.5 })
            .filter((h) => h.strand === 1);
          expect(hits.length, `position ${p}`).toBeGreaterThanOrEqual(1);
          const best = hits.sort((a, b) => b.queryIdentity - a.queryIdentity)[0];
          expect(best.queryIdentity, `position ${p}`).toBeCloseTo(expected, 3);
        }
      });

      it('2 mismatches — queryIdentity = 28/30 ≈ 0.9333 for representative pairs', () => {
        const expected = 28 / 30;
        const pairs = [[0, 1], [0, 15], [0, 29], [10, 20], [14, 15], [28, 29]];
        for (const pair of pairs) {
          const target = targetWithMismatchAt(pair);
          const hits = searchSequence(QUERY, target, { identityThreshold: 0.5 })
            .filter((h) => h.strand === 1);
          expect(hits.length, `pair ${pair}`).toBeGreaterThanOrEqual(1);
          const best = hits.sort((a, b) => b.queryIdentity - a.queryIdentity)[0];
          expect(best.queryIdentity, `pair ${pair}`).toBeCloseTo(expected, 3);
        }
      });

      it('hitIdentity field is gone (replaced by queryIdentity as the sole canonical metric)', () => {
        const target = `AAA${QUERY}TTT`;
        const hits = searchSequence(QUERY, target);
        expect(hits[0].hitIdentity).toBeUndefined();
        // `identity` alias kept for back-compat — equals queryIdentity.
        expect(hits[0].identity).toBeCloseTo(hits[0].queryIdentity, 5);
      });
    });

    it('clean perfect match still uses zero gaps (no false-positive indel reporting)', () => {
      const seq = 'GCATGCATGCATGCATGCATGCATGCATGC'; // 30 nt
      const target = `AAA${seq}TTT`;
      const hits = searchSequence(seq, target).filter((h) => h.strand === 1);
      expect(hits[0].queryIdentity).toBeCloseTo(1, 5);
      expect(hits[0].gapsInQuery).toBe(0);
      expect(hits[0].gapsInTarget).toBe(0);
    });
  });
});
