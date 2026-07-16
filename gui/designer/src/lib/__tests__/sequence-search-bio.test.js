/**
 * sequence-search-bio — exhaustive short-motif scanner (P1.5). Seed-and-extend
 * can't do IUPAC (an ambiguous base breaks the exact seed lookup), so short /
 * degenerate / circular queries go through a full Hamming-style window scan where
 * every position is compared with iupacMatch. Delivers three plan items at once:
 * IUPAC compatibility, exact-short completeness (ALL overlapping hits), circular.
 *
 * Metrics contract (SeqMetrics): identity is NULL for a degenerate query
 * («compatibility» ≠ «identity»); compatibility is always defined.
 */
import { describe, it, expect } from 'vitest';
import { scanMotif } from '../sequence-search-bio';

const starts = (hits) => hits.map((h) => h.segments[0].start);

describe('scanMotif — exact motifs', () => {
  it('finds a single exact motif on the + strand, identity 1', () => {
    const hits = scanMotif('GAATTG', 'AAAGAATTGCCC', { bothStrands: false });
    expect(hits).toHaveLength(1);
    expect(hits[0].segments).toEqual([{ start: 3, end: 9 }]);
    expect(hits[0].strand).toBe('+');
    expect(hits[0].metrics.identity).toBe(1);
    expect(hits[0].metrics.compatibility).toBe(1);
    expect(hits[0].metrics.mismatches).toBe(0);
  });
  it('reports ALL overlapping occurrences (completeness)', () => {
    const hits = scanMotif('AA', 'AAAA', { bothStrands: false });
    expect(starts(hits)).toEqual([0, 1, 2]); // seed-extend would collapse these
  });
  it('no hit → empty array', () => {
    expect(scanMotif('GGGG', 'AAAAAA', { bothStrands: false })).toEqual([]);
  });
});

describe('scanMotif — IUPAC compatibility', () => {
  it('a degenerate query matches every compatible target; identity is null', () => {
    const hits = scanMotif('GN', 'GAGTGC', { bothStrands: false });
    // GN matches GA(0), GT(2)?, GC(4) → positions where target[i]==='G'
    expect(starts(hits)).toEqual([0, 2, 4]);
    for (const h of hits) {
      expect(h.metrics.identity).toBeNull(); // degenerate query → compatibility, not identity
      expect(h.metrics.compatibility).toBe(1);
      expect(h.metrics.exactMatches).toBe(1); //   the concrete G
      expect(h.metrics.uncertainMatches).toBe(1); // the N position (matched via ambiguity)
    }
  });
  it('R matches A/G but not C/T', () => {
    expect(starts(scanMotif('R', 'ACGT', { bothStrands: false }))).toEqual([0, 2]);
  });
});

describe('scanMotif — reverse strand + palindrome dedup', () => {
  it('finds a motif on the reverse strand', () => {
    // target contains GAATTC's revcomp-target: put motif so only reverse matches.
    // query = 'AAT' ; revcomp = 'ATT'. Place 'ATT' in target, no 'AAT'.
    const hits = scanMotif('AAT', 'CCATTCC');
    const minus = hits.filter((h) => h.strand === '-');
    expect(minus.length).toBeGreaterThanOrEqual(1);
    expect(minus[0].segments[0]).toEqual({ start: 2, end: 5 }); // ATT at 2..5
  });
  it('a palindrome hit is reported once as strand "both", not duplicated', () => {
    const hits = scanMotif('GAATTC', 'AAGAATTCAA'); // EcoRI palindrome
    const atSite = hits.filter((h) => h.segments[0].start === 2);
    expect(atSite).toHaveLength(1);
    expect(atSite[0].strand).toBe('both');
  });
});

describe('scanMotif — circular wrap', () => {
  it('finds a motif spanning the origin only when circular', () => {
    // target 'TTCGGGAAG' (len 9). Motif 'AAGTTC' spans end(AAG)+start(TTC).
    const linear = scanMotif('AAGTTC', 'TTCGGGAAG', { circular: false, bothStrands: false });
    expect(linear).toEqual([]);
    const circ = scanMotif('AAGTTC', 'TTCGGGAAG', { circular: true, bothStrands: false });
    expect(circ).toHaveLength(1);
    expect(circ[0].wrapsOrigin).toBe(true);
    // segments split at the origin: [6..9) + [0..3)
    expect(circ[0].segments).toEqual([{ start: 6, end: 9 }, { start: 0, end: 3 }]);
  });
  it('rotation invariance: rotating the target rotates the hit set count', () => {
    const t = 'ATGCGTACGT';
    const a = scanMotif('CGT', t, { circular: true, bothStrands: false }).length;
    const rot = t.slice(3) + t.slice(0, 3);
    const b = scanMotif('CGT', rot, { circular: true, bothStrands: false }).length;
    expect(a).toBe(b);
  });
});

describe('scanMotif — mismatch tolerance + robustness', () => {
  it('maxMismatches allows a near-match and records the mismatch count', () => {
    // window 'GACTTG' vs 'GAATTC' = 2 mismatches → rejected at default (0).
    expect(scanMotif('GAATTC', 'AAGACTTGAA', { bothStrands: false })).toEqual([]);
    // window 'GACTTC' vs 'GAATTC' = 1 mismatch (pos2 A→C) → accepted at maxMismatches 1.
    const near = scanMotif('GAATTC', 'AAGACTTCAA', { bothStrands: false, maxMismatches: 1 });
    expect(near).toHaveLength(1);
    expect(near[0].metrics.mismatches).toBe(1);
    expect(near[0].metrics.identity).toBeCloseTo(5 / 6, 5);
  });
  it('low-complexity does not explode and respects the limit cap', () => {
    const hits = scanMotif('AAAA', 'A'.repeat(500), { bothStrands: false, limit: 50 });
    expect(hits.length).toBeLessThanOrEqual(50);
  });
  it('normalizes an RNA query (U→T)', () => {
    expect(scanMotif('AUG', 'CCATGCC', { bothStrands: false })).toHaveLength(1);
  });
  it('empty / too-short-vs-target → empty', () => {
    expect(scanMotif('', 'ACGT')).toEqual([]);
    expect(scanMotif('ACGTA', 'ACG')).toEqual([]);
  });
});

describe('scanMotif — iupac:off (literal matching, REV-1)', () => {
  it('a degenerate query matches ONLY literally with iupac off', () => {
    // GAANTC vs GAATTC: N≠T literally → no hit with iupac off; auto → N~T → hit
    expect(scanMotif('GAANTC', 'AAAGAATTCTTT', { iupac: 'off', maxMismatches: 0 })).toHaveLength(0);
    expect(scanMotif('GAANTC', 'AAAGAATTCTTT', { maxMismatches: 0 }).length).toBeGreaterThanOrEqual(1);
  });
  it('with iupac off a literal-N match reports a defined identity (not null)', () => {
    const hits = scanMotif('GAANTC', 'AAAGAANTCTTT', { iupac: 'off' });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].metrics.identity).not.toBeNull();
  });
});
