/**
 * primer-binding-search — PRIMER-1. Pins «куда комплиментарен»: given a primer, find
 * its binding sites across the library (forward = primer in top strand; reverse = its
 * revcomp in top strand), incl. circular origin wrap.
 */
import { describe, it, expect } from 'vitest';
import { scanLibraryForPrimer, summarizeBindingHits } from '../primer-binding-search';

// top strand chosen so the fwd binding's RC and the rev binding's seq do NOT also appear
// (clean single-strand hits). minLen:6 to allow short test oligos.
const E = { id: 'e1', name: 'molA', sequence: 'ACGTACGTAGGCATTGCAACTTGG', topology: { circular: false } };

describe('scanLibraryForPrimer', () => {
  it('forward binding: primer == top-strand stretch → strand + with position', () => {
    const r = scanLibraryForPrimer({ sequence: 'AGGCATTG' }, [E], { minLen: 6 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      entryId: 'e1', entryName: 'molA', strand: '+', start: 8, end: 16, wraps: false,
    });
  });

  it('reverse binding: RC(primer) == top-strand stretch → strand −', () => {
    const r = scanLibraryForPrimer({ sequence: 'CCAAGTTG' }, [E], { minLen: 6 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ strand: '-', start: 16, end: 24 });
  });

  it('no binding anywhere → empty', () => {
    expect(scanLibraryForPrimer({ sequence: 'TTTTTTTT' }, [E], { minLen: 6 })).toEqual([]);
  });

  it('prefers bindingSequence over sequence (tail ignored)', () => {
    const r = scanLibraryForPrimer({ sequence: 'GGGGGGGGAGGCATTG', bindingSequence: 'AGGCATTG' }, [E], { minLen: 6 });
    expect(r).toHaveLength(1);
    expect(r[0].strand).toBe('+');
    expect(r[0].start).toBe(8);
  });

  it('multiple occurrences in one entry → multiple hits', () => {
    const rep = { id: 'r', name: 'rep', sequence: 'ACGTACGTACGTACGT', topology: { circular: false } };
    const r = scanLibraryForPrimer({ sequence: 'ACGTACGT' }, [rep], { minLen: 6 }).filter((h) => h.strand === '+');
    expect(r.map((h) => h.start)).toEqual([0, 4, 8]);
  });

  it('scans across multiple library entries', () => {
    const e2 = { id: 'e2', name: 'molB', sequence: 'TTTTAGGCATTGTTTT', topology: { circular: false } };
    const r = scanLibraryForPrimer({ sequence: 'AGGCATTG' }, [E, e2], { minLen: 6 });
    expect(r.map((h) => h.entryId).sort()).toEqual(['e1', 'e2']);
  });

  it('circular entry: a binding that wraps the origin is found (wraps:true)', () => {
    const circ = { id: 'c', name: 'plasmid', sequence: 'TTTTACGTACGTAAAA', topology: { circular: true } };
    const r = scanLibraryForPrimer({ sequence: 'AAAATTTT' }, [circ], { minLen: 6 });
    const wrap = r.find((h) => h.wraps);
    expect(wrap).toBeTruthy();
    expect(wrap).toMatchObject({ strand: '+', start: 12, end: 4, wraps: true });
  });

  it('too-short binding region (< minLen) → empty (avoids noise)', () => {
    expect(scanLibraryForPrimer({ sequence: 'ACGT' }, [E])).toEqual([]); // default minLen 12
  });
});

// PRIMER-5 — mismatch-tolerant (weakly-complementary) binding + multi-binding.
// q (12 nt): A0 C1 G2 T3 G4 G5 C6 A7 T8 T9 G10 A11.  k3=5 → 3' region = idx [7,12).
const Q = 'ACGTGGCATTGA';
const RC = 'TCAATGCCACGT'; // reverseComplement(Q)
const wrap = (core) => ({ id: 'm', name: 'mol', sequence: `TTTT${core}TTTT`, topology: { circular: false } });

describe('scanLibraryForPrimer — mismatch tolerance (PRIMER-5)', () => {
  it('default (maxMismatches 0) does NOT find a 1-mismatch site', () => {
    const r = scanLibraryForPrimer({ sequence: Q }, [wrap('ACATGGCATTGA')], { minLen: 6 })
      .filter((h) => h.strand === '+');
    expect(r).toHaveLength(0);
  });

  it('maxMismatches:1 finds an internal 1-mismatch forward site (3′ end intact)', () => {
    // pos2 G→A → internal mismatch (idx 2 ∉ [7,12))
    const r = scanLibraryForPrimer({ sequence: Q }, [wrap('ACATGGCATTGA')], { minLen: 6, maxMismatches: 1 })
      .filter((h) => h.strand === '+');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mismatches: 1, threePrimeMismatch: false, start: 4 });
  });

  it('flags a 3′-end mismatch (priming-critical) as threePrimeMismatch', () => {
    // pos11 A→C → mismatch in 3' region [7,12)
    const r = scanLibraryForPrimer({ sequence: Q }, [wrap('ACGTGGCATTGC')], { minLen: 6, maxMismatches: 1 })
      .filter((h) => h.strand === '+');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mismatches: 1, threePrimeMismatch: true });
  });

  it('exact site is still reported (mismatches 0) when maxMismatches:1', () => {
    const r = scanLibraryForPrimer({ sequence: Q }, [wrap(Q)], { minLen: 6, maxMismatches: 1 })
      .filter((h) => h.strand === '+');
    expect(r).toHaveLength(1);
    expect(r[0].mismatches).toBe(0);
  });

  it('finds a reverse-strand 1-mismatch site (rc with internal mismatch)', () => {
    // RC pos6 C→A → internal for reverse (3' region for '-' is left [0,5))
    const r = scanLibraryForPrimer({ sequence: Q }, [wrap('TCAATGACACGT')], { minLen: 6, maxMismatches: 1 })
      .filter((h) => h.strand === '-');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ mismatches: 1, threePrimeMismatch: false });
  });
});

describe('summarizeBindingHits — multi-binding verdict (PRIMER-5)', () => {
  it('two priming sites → multiBinding true', () => {
    const s = summarizeBindingHits([
      { mismatches: 0, threePrimeMismatch: false },
      { mismatches: 1, threePrimeMismatch: false },
    ]);
    expect(s).toMatchObject({ total: 2, exact: 1, primingSites: 2, multiBinding: true });
  });

  it('a single exact site → unique (not multi-binding)', () => {
    const s = summarizeBindingHits([{ mismatches: 0, threePrimeMismatch: false }]);
    expect(s.multiBinding).toBe(false);
    expect(s.primingSites).toBe(1);
  });

  it('a weak site with a 3′ mismatch does NOT count as a priming site', () => {
    const s = summarizeBindingHits([
      { mismatches: 0, threePrimeMismatch: false },
      { mismatches: 1, threePrimeMismatch: true },
    ]);
    expect(s.primingSites).toBe(1);
    expect(s.multiBinding).toBe(false);
  });
});
