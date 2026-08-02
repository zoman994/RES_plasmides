/**
 * dna-linear-kernel.test.js — ORCHESTRATION responsibility of the EXPERIMENTAL linear/Dinkelbach
 * kernel (src/lib/dna-linear-kernel.js — searchStrand, pruneEndpointShadows, findOccurrences):
 * endpoint retention/shadowing, strand merge, circular topology, and the input contract.
 * Spec: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.5, §2.6, §2.7, §3.2, §3.2.1.
 *
 * WHY THIS FILE EXISTS. The linear-score reformulation and its measurements previously existed
 * only as a report. A report is not a proof: it cannot be re-run and it cannot go red. This suite
 * moves the evidence into the repository test contour.
 *
 * THE DEFECT IT GUARDS (P1). "Plateau reduction" — inside a valley of the Myers distance profile
 * keep only the minima — is NOT lossless. Counterexample: query AAAACCCC, target AAAACCCCC at
 * 80%. The profile end=6:d2 end=7:d1 end=8:d0 end=9:d1 is ONE valley, but there are TWO legitimate
 * occurrences: start=0 (end=8, 100%) and start=1 (end=9, 87.50%). The physical endpoints 8 and 9
 * differ, so §3.2.1 forbids merging them. Collapsing the valley to its minimum destroys start=1.
 * The first test below is the permanent regression gate for that.
 *
 * COMPARISON DISCIPLINE. Every assertion compares the FULL occurrence — strand, start, span,
 * physical end, M, X, I, D, gapEvents, alignmentLength, identityBps AND script — never identity
 * alone (shape() in helpers/dna-linear-fixtures.js). Six of eight realistic corruptions are
 * invisible to an identity-only comparison.
 *
 * SPLIT (U0). Scan-side evidence lives in dna-linear-scan.test.js, verifier-side evidence in
 * dna-linear-verify.test.js, and the oracle differential corpora in dna-linear-differential.test.js.
 * The pointwise oracle comparisons kept here are single fixed inputs, not a differential sweep.
 *
 * REFERENCE. helpers/dna-glocal-oracle.js: literal enumeration, no linear score, no Dinkelbach,
 * no Myers, no plateau, no banding. It is capped at query<=12 / target<=20 by design, so its
 * verdicts are SMALL-INPUT verdicts and say nothing about 100 nt behaviour.
 *
 * HONESTY NOTES.
 *  - This was not written TDD-first: the kernel was prototyped in a scratchpad, then both the
 *    kernel and this oracle were ported here and re-run. What is new is that the evidence is now
 *    reproducible by the command below.
 *  - §3.2 rule 7 ("stable lexical edit script") is implemented on both sides as plain lexical
 *    order over '=' < 'D' < 'I' < 'X'. The spec does not define that order. A differential cannot
 *    detect an assumption both sides share, so rule-7 ties are verified as SELF-CONSISTENT here,
 *    not as spec-correct. (The repo's other oracle, helpers/glocal-oracle.js, happens to order
 *    them the same way, which is corroboration but not proof.)
 *  - No wall-clock assertion anywhere: §4.3 forbids brittle timing asserts in the ordinary suite.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-kernel.test.js
 */

import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';
import { findOccurrences as oracleFind } from './helpers/dna-glocal-oracle';
import { shapes } from './helpers/dna-linear-fixtures';

describe('EXPERIMENTAL kernel §3.2.1 — the plateau counterexample (P1 regression gate)', () => {
  it('AAAACCCC in AAAACCCCC @80% -> TWO occurrences, endpoints 8 and 9 both survive', () => {
    const got = findOccurrences('AAAACCCC', 'AAAACCCCC', {
      thresholdBps: 8000, circular: false, bothStrands: false,
    });

    // The whole point: a plateau-minima reduction returns ONE here.
    expect(got.length, 'a Myers-valley collapse would return 1, not 2').toBe(2);
    expect(shapes(got)).toEqual([
      '+|s=0|span=8|e=8|M=8|X=0|I=0|D=0|ev=0|L=8|bps=10000|========',
      '+|s=1|span=8|e=9|M=7|X=1|I=0|D=0|ev=0|L=8|bps=8750|===X====',
    ]);
    // The two physical endpoints differ, which is exactly why §3.2.1 may not merge them.
    expect(got[0].end).not.toBe(got[1].end);
  });

  it('the independent oracle agrees, field for field', () => {
    const opts = { thresholdBps: 8000, circular: false, bothStrands: false };
    expect(shapes(findOccurrences('AAAACCCC', 'AAAACCCCC', opts)))
      .toEqual(shapes(oracleFind('AAAACCCC', 'AAAACCCCC', opts)));
  });

  it('the counterexample holds across thresholds and topologies', () => {
    for (const thresholdBps of [5000, 7000, 8000, 8750]) {
      for (const circular of [false, true]) {
        for (const bothStrands of [false, true]) {
          const opts = { thresholdBps, circular, bothStrands };
          const label = `thr=${thresholdBps} circ=${circular} both=${bothStrands}`;
          expect(shapes(findOccurrences('AAAACCCC', 'AAAACCCCC', opts)), label)
            .toEqual(shapes(oracleFind('AAAACCCC', 'AAAACCCCC', opts)));
        }
      }
    }
  });
});

describe('EXPERIMENTAL kernel §3.2.1 — endpoint shadows and tandem repeats', () => {
  it('spec minimal example q=ACGT t=AACGT @80% -> the exact hit shadows the outer =D===', () => {
    const got = findOccurrences('ACGT', 'AACGT', { thresholdBps: 8000, bothStrands: false });
    expect(shapes(got)).toEqual(['+|s=1|span=4|e=5|M=4|X=0|I=0|D=0|ev=0|L=4|bps=10000|====']);
  });

  it('§6.1(22) AA in AAAA @100% -> starts 0,1,2 all survive (endpoints 2,3,4 differ)', () => {
    const got = findOccurrences('AA', 'AAAA', { thresholdBps: 10000, bothStrands: false });
    expect(got.map((o) => o.start), 'overlap clustering would collapse these').toEqual([0, 1, 2]);
    expect(got.map((o) => o.end)).toEqual([2, 3, 4]);
    expect(shapes(got)).toEqual(shapes(
      oracleFind('AA', 'AAAA', { thresholdBps: 10000, bothStrands: false }),
    ));
  });

  it('AA in AAAA survives every threshold/topology/strand combination', () => {
    for (const thresholdBps of [5000, 8000, 10000]) {
      for (const circular of [false, true]) {
        for (const bothStrands of [false, true]) {
          const opts = { thresholdBps, circular, bothStrands };
          const label = `thr=${thresholdBps} circ=${circular} both=${bothStrands}`;
          expect(shapes(findOccurrences('AA', 'AAAA', opts)), label)
            .toEqual(shapes(oracleFind('AA', 'AAAA', opts)));
        }
      }
    }
  });
});

describe('EXPERIMENTAL kernel §2.6/§2.7 — strands and circular topology', () => {
  it('§6.1(16) a minus-strand-only hit is reported on the minus strand', () => {
    // AACCGT is the reverse complement of ACGGTT.
    const got = findOccurrences('ACGGTT', 'TTAACCGTTT', { thresholdBps: 10000 });
    expect(shapes(got)).toEqual(['-|s=2|span=6|e=8|M=6|X=0|I=0|D=0|ev=0|L=6|bps=10000|======']);
    expect(shapes(got)).toEqual(shapes(
      oracleFind('ACGGTT', 'TTAACCGTTT', { thresholdBps: 10000 }),
    ));
  });

  it('§6.1(17) bothStrands:false never emits a minus-strand occurrence', () => {
    expect(findOccurrences('ACGGTT', 'TTAACCGTTT', {
      thresholdBps: 10000, bothStrands: false,
    })).toEqual([]);
  });

  it('§6.1(19) a circular exact wrap is found circular and absent linear', () => {
    const target = 'AACCGGGGGGGGACGT';        // the site spans the origin: ACGT | AACC
    const opts = { thresholdBps: 10000, circular: true, bothStrands: false };
    const got = findOccurrences('ACGTAACC', target, opts);
    expect(shapes(got)).toEqual(['+|s=12|span=8|e=4|M=8|X=0|I=0|D=0|ev=0|L=8|bps=10000|========']);
    expect(got[0].end, 'end is the PHYSICAL endpoint, (start+span) mod n').toBe(4);
    expect(findOccurrences('ACGTAACC', target, { ...opts, circular: false })).toEqual([]);
  });

  it('§6.1(20) a gap sitting exactly at the origin is one wrapped occurrence', () => {
    // One extra base 'G' at index 0 turns the wrapped exact site into 8M + 1D at the origin.
    const target = 'GAACCGGGGGGGGACGT';       // n = 17
    const opts = { thresholdBps: 8000, circular: true, bothStrands: false };
    const got = findOccurrences('ACGTAACC', target, opts);
    expect(shapes(got)).toEqual(['+|s=13|span=9|e=5|M=8|X=0|I=0|D=1|ev=1|L=9|bps=8888|====D====']);
    expect(shapes(got), 'oracle agreement on the origin gap')
      .toEqual(shapes(oracleFind('ACGTAACC', target, opts)));
  });

  it('§6.1(21) a second lap around the circle is forbidden: targetSpan <= targetLength', () => {
    const opts = { thresholdBps: 5000, circular: true, bothStrands: false };
    const got = findOccurrences('AAAAAAAA', 'AAAA', opts);
    for (const o of got) {
      expect(o.targetSpan, `span ${o.targetSpan} exceeds the 4 nt circle`).toBeLessThanOrEqual(4);
    }
    expect(shapes(got)).toEqual(shapes(oracleFind('AAAAAAAA', 'AAAA', opts)));
  });

  it('circular results are invariant to where the origin sits', () => {
    const seq = 'ACGTTGCAATCGGATC';           // n = 16
    const rotate = (s, k) => s.slice(k) + s.slice(0, k);
    const opts = { thresholdBps: 8000, circular: true, bothStrands: false };
    const asSites = (list, n, k) => list
      .map((o) => `${(o.start + k) % n}:${o.targetSpan}:${o.identityBps}:${o.script}`)
      .sort();
    const base = findOccurrences('ATCGGA', seq, opts);
    for (const k of [1, 5, 15]) {
      const rot = findOccurrences('ATCGGA', rotate(seq, k), opts);
      expect(asSites(rot, 16, k), `rotation by ${k}`).toEqual(asSites(base, 16, 0));
    }
  });
});

describe('EXPERIMENTAL kernel §2.5 — ACGT-only contract', () => {
  it('a non-ACGT query is rejected fail-closed, not silently rewritten', () => {
    for (const bad of ['ACGN', 'ACGU', 'AC-GT', 'ACG T', 'ACGY']) {
      expect(() => findOccurrences(bad, 'ACGTACGT', { thresholdBps: 8000 }), bad)
        .toThrow(/invalid-dna/);
    }
  });

  it('lowercase and surrounding whitespace normalise; internal symbols still throw', () => {
    const lower = findOccurrences('  acgtacgt  ', 'TTACGTACGTTT', {
      thresholdBps: 10000, bothStrands: false,
    });
    expect(lower.length).toBe(1);
    expect(lower[0].identityBps).toBe(10000);
    expect(() => findOccurrences('acg-tacgt', 'TTACGTACGTTT', {})).toThrow(/invalid-dna/);
  });

  it('§6.1(15) an ambiguous TARGET base counts as X, never as a match', () => {
    const got = findOccurrences('ACGTACGTAC', 'ACGTNCGTAC', {
      thresholdBps: 8000, bothStrands: false,
    });
    expect(got.length).toBe(1);
    expect([got[0].M, got[0].X, got[0].identityBps]).toEqual([9, 1, 9000]);
    expect(got[0].script).toBe('====X=====');
    // At 100% the same input must vanish: N cannot prove a match.
    expect(findOccurrences('ACGTACGTAC', 'ACGTNCGTAC', {
      thresholdBps: 10000, bothStrands: false,
    })).toEqual([]);
  });
});
