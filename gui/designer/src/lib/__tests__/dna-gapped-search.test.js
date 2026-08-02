/**
 * K1 — concrete linear glocal engine, tested DIRECTLY (no redContract) and DIFFERENTIALLY
 * against the exhaustive oracle (SEARCH-GAPPED-DNA §6).
 *
 * These assert the SPEC behaviour on the real K1 core, so they are GREEN when the engine is
 * correct. The oracle (accepted in K0) is the source of truth for the random differential.
 *
 * Mutation gates (proven RED by mutating the module, see the sprint report): remove the I
 * transition, remove the D transition, use a query-length denominator, or require an exact
 * 8-mer seed — each breaks one of the pinned cases below.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSearch, editBudget } from '../dna-gapped-search';
import { alignFromStart } from '../dna-gapped-align';
import { oracleSearchLinear, pruneEndpointShadows } from './helpers/glocal-oracle';
// The full 20-mer matrix expectations (every insertion + interior-deletion position) were
// generated ONCE by the accepted oracle and frozen here, so the suite verifies all 40 positions
// without paying ~40 exhaustive-DP runs on every test run (which loaded the machine enough to
// flake unrelated timing-sensitive tests). The live random differential below still runs the
// oracle, so a divergence anywhere is still caught. Regenerate: run oracleSearchLinear over the
// 21 insertion / 19 interior-deletion cases and re-dump.
import MATRIX from './fixtures/gapped-matrix-expected.json';

const CORE20 = 'ACGTACGTACGTACGTACGT';
const flip = (ch) => (ch === 'A' ? 'C' : 'A');
const pick = (hits, start) => hits.find((h) => h.start === start) || null;
const shape = (h) => (h ? {
  start: h.start, end: h.end,
  subs: h.metrics.substitutions, ins: h.metrics.insertions, del: h.metrics.deletions,
  L: h.metrics.alignmentLength, script: h.script,
} : null);
const oShape = (h) => ({
  start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L, script: h.script,
});
/** The oracle is the source of truth; an indel on a periodic sequence can align several equal
 * ways, so anything involving indels is asserted as engine === oracle, never a hand value. */
const agree = (query, target, tBps = 8000) => {
  const eng = dnaGappedSearch(query, target, { thresholdBps: tBps }).map(shape);
  // §3.2.1 — the oracle yields the RAW per-start set; endpoint pruning is applied as its own
  // independent step so the semantic change stays visible and separately verifiable.
  const ref = pruneEndpointShadows(oracleSearchLinear(query, target, { thresholdBps: tBps })).map(oShape);
  expect(eng, `q=${query} t=${target}`).toEqual(ref);
};

// ─── deterministic RNG for the differential ───
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randSeq(rnd, len) { let o = ''; for (let i = 0; i < len; i++) o += 'ACGT'[Math.floor(rnd() * 4)]; return o; }

describe('K1 §2.4 — control examples on the real engine', () => {
  it('exact 20-mer → 100%, start 2, end 22, zero edits', () => {
    const got = pick(dnaGappedSearch(CORE20, `TT${CORE20}TT`, { thresholdBps: 8000 }), 2);
    expect(shape(got)).toEqual({
      start: 2, end: 22, subs: 0, ins: 0, del: 0, L: 20, script: '='.repeat(20),
    });
    expect(got.metrics.identity).toBe(1);
  });

  it('query with one extra base → 20/21 = 95.24%, exactly 1 I', () => {
    const query = `${CORE20.slice(0, 10)}G${CORE20.slice(10)}`; // 21 nt
    const got = pick(dnaGappedSearch(query, `TT${CORE20}TT`, { thresholdBps: 8000 }), 2);
    expect(shape(got)).toMatchObject({ start: 2, end: 22, subs: 0, ins: 1, del: 0, L: 21 });
    expect(got.metrics.identity).toBeCloseTo(20 / 21, 10);
  });

  it('interior target extra base → 20/21, exactly 1 D, L 21', () => {
    const target = `TT${CORE20.slice(0, 10)}G${CORE20.slice(10)}TT`;
    const got = pick(dnaGappedSearch(CORE20, target, { thresholdBps: 8000 }), 2);
    expect(shape(got)).toMatchObject({ start: 2, end: 23, subs: 0, ins: 0, del: 1, L: 21 });
  });

  it('4 substitutions → exactly 80%, passes', () => {
    const q = [...CORE20]; for (const i of [0, 5, 10, 15]) q[i] = flip(q[i]);
    const got = pick(dnaGappedSearch(CORE20, `TTTT${q.join('')}TTTT`, { thresholdBps: 8000 }), 4);
    expect(shape(got)).toMatchObject({ start: 4, end: 24, subs: 4, ins: 0, del: 0, L: 20 });
    expect(got.metrics.identity).toBeCloseTo(0.8, 10);
  });

  it('4 CONTIGUOUS substitutions → found (no runOfK gate), matching the oracle', () => {
    const q = [...CORE20]; for (const i of [8, 9, 10, 11]) q[i] = flip(q[i]);
    const target = `TTTT${q.join('')}TTTT`;
    // On a periodic core the canonical alignment may trade some subs for indels — whatever it
    // is, it must equal the oracle and it must be a hit (the old runOfK=3 would have dropped it).
    expect(dnaGappedSearch(CORE20, target, { thresholdBps: 8000 }).length).toBeGreaterThan(0);
    agree(CORE20, target, 8000);
  });

  it('5 substitutions → 75%, no hit at 80%', () => {
    const q = [...CORE20]; for (const i of [0, 4, 8, 12, 16]) q[i] = flip(q[i]);
    expect(dnaGappedSearch(CORE20, q.join(''), { thresholdBps: 8000 })).toHaveLength(0);
  });
});

describe('K1 §3.2 — a boundary target base is a FREE flank, not a deletion', () => {
  it('extra base at START → exact 20-mer, start shifts, D=0, L=20', () => {
    const got = pick(dnaGappedSearch(CORE20, `TTG${CORE20}TT`, { thresholdBps: 8000 }), 3);
    expect(shape(got)).toMatchObject({ start: 3, end: 23, subs: 0, ins: 0, del: 0, L: 20 });
  });
  it('extra base at END → exact 20-mer, start stays, D=0, L=20', () => {
    const got = pick(dnaGappedSearch(CORE20, `TT${CORE20}GTT`, { thresholdBps: 8000 }), 2);
    expect(shape(got)).toMatchObject({ start: 2, end: 22, subs: 0, ins: 0, del: 0, L: 20 });
  });
});

describe('K1 — full 20-mer matrix: all 21 insertion + all 19 interior deletion positions', () => {
  // Every position of the full 20-mer (SPEC §6.1(2)(3)), compared against the frozen oracle
  // truth. At a boundary a query insertion legitimately becomes a substitution against a
  // neighbouring base (§3.2 rule 4 prefers fewer indel events), so "always 1 I" is false — the
  // engine must reproduce the exact oracle occurrence list at every position.
  it.each(Array.from({ length: CORE20.length + 1 }, (_, p) => p))('query insertion at %i', (p) => {
    const query = `${CORE20.slice(0, p)}G${CORE20.slice(p)}`; // 21 nt
    const got = dnaGappedSearch(query, CORE20, { thresholdBps: 8000 }).map(shape);
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(MATRIX.ins[p]);
  });
  it.each(Array.from({ length: CORE20.length - 1 }, (_, k) => k + 1))('interior deletion at %i', (p) => {
    const target = `${CORE20.slice(0, p)}G${CORE20.slice(p)}`; // 21 nt core, deletion strictly inside
    const got = dnaGappedSearch(CORE20, target, { thresholdBps: 8000 }).map(shape);
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(MATRIX.del[p]);
  });
});

describe('K1 — required concrete contracts (SPEC §2.4, §3.1, §3.2)', () => {
  // A non-periodic core: distinct local context so an interior gap can't slide, giving a clean
  // single 3-base event rather than several equal placements.
  const NP = 'ACGTCAGTGACTGCATCTGA'; // 20 nt

  it('a 3-base contiguous gap → indelBases 3, indelEvents 1', () => {
    const target = `${NP.slice(0, 8)}TTT${NP.slice(8)}`; // 3 extra bases inside → 3 D, one run
    const got = pick(dnaGappedSearch(NP, target, { thresholdBps: 7000 }), 0);
    expect(got).toBeTruthy();
    expect(got.metrics.indelBases).toBe(3);
    expect(got.metrics.indelEvents).toBe(1);
    expect(got.metrics.deletions).toBe(3);
    agree(NP, target, 7000);
  });

  it('mixed 2 substitutions + 1 indel in one alignment', () => {
    const t = [...NP]; t[3] = flip(t[3]); t[14] = flip(t[14]); // 2 subs
    const target = `${t.slice(0, 9).join('')}A${t.slice(9).join('')}`; // + 1 inserted base → 1 D
    const got = pick(dnaGappedSearch(NP, target, { thresholdBps: 7000 }), 0);
    expect(got).toBeTruthy();
    expect(got.metrics.substitutions).toBe(2);
    expect(got.metrics.indelBases).toBe(1);
    agree(NP, target, 7000);
  });

  it('deterministic canonical choice when one start has several alignments/ends', () => {
    // A tail that can extend by a match or stop short → multiple valid ends at start 0.
    const target = `${NP}${NP.slice(0, 4)}`; // repeat a prefix so extensions tie on length
    const a = dnaGappedSearch(NP, target, { thresholdBps: 8000 });
    const b = dnaGappedSearch(NP, target, { thresholdBps: 8000 });
    expect(a.map(shape)).toEqual(b.map(shape));     // deterministic across runs
    agree(NP, target, 8000);                         // and it is the §3.2-canonical (oracle)
  });

  it('replay of editRuns reconstructs the script, coordinates and counts', () => {
    const target = `TT${NP.slice(0, 6)}G${NP.slice(6)}TT`; // one interior D
    const [h] = dnaGappedSearch(NP, target, { thresholdBps: 8000 });
    expect(h.editRuns.length).toBeGreaterThan(0);
    let script = ''; let probe = 0; let toff = 0; let subs = 0; let ins = 0; let del = 0;
    for (const r of h.editRuns) {
      expect(r.probeStart).toBe(probe);        // runs are contiguous in probe space
      expect(r.targetOffsetStart).toBe(toff);  // …and in target-offset space
      script += r.op.repeat(r.length);
      if (r.op === '=' || r.op === 'X') { probe += r.length; toff += r.length; if (r.op === 'X') subs += r.length; } else if (r.op === 'I') { probe += r.length; ins += r.length; } else { toff += r.length; del += r.length; }
      expect(r.probeEnd).toBe(probe);
      expect(r.targetOffsetEnd).toBe(toff);
    }
    expect(script).toBe(h.script);                 // runs replay to the character script
    expect(probe).toBe(h.metrics.queryLength);     // probe covers the whole query
    expect(toff).toBe(h.metrics.targetSpan);       // target offset covers the whole span
    expect(h.start + toff).toBe(h.end);            // physical end = start + span
    expect(subs).toBe(h.metrics.substitutions);
    expect(ins).toBe(h.metrics.insertions);
    expect(del).toBe(h.metrics.deletions);
  });

  it('a partial query is NOT a hit (whole query must align, §2.1)', () => {
    // The first half of a long query matches perfectly; the second half is absent. Even a
    // perfect 10-nt prefix is not a hit — the whole 20-nt query must align.
    const target = `TTTT${NP.slice(0, 10)}TTTT`;
    expect(dnaGappedSearch(NP, target, { thresholdBps: 8000 })).toHaveLength(0);
  });

  it('alignFromStart aligns the WHOLE query, never a soft-clipped prefix (§2.1)', () => {
    // Prefix matches at start 0, suffix fully mismatches. The full-query alignment is 10 '=' +
    // 10 'X' (identity 0.5) — NOT a partial 100% on the prefix. This is the gate a "partial
    // query" mutation breaks; it is tested on the align unit because the scan budget alone would
    // otherwise hide it.
    const query = 'ACGTACGTAC' + 'GGGGGGGGGG'; // 20 nt
    const target = 'ACGTACGTAC' + 'TTTTTTTTTT'; // 20 nt
    const a = alignFromStart(query, target, 0, 20);
    expect(a).toBeTruthy();
    expect(a.M).toBe(10);
    expect(a.X).toBe(10);
    expect(a.alignmentLength).toBe(20);   // whole query consumed, no soft-clip
    expect(a.acceptBps).toBeLessThan(8000);
  });
});

describe('K1 — seed-free (a hit with no surviving exact 8-mer)', () => {
  it('finds an 87.5% hit whose every 8-mer window carries a mismatch', () => {
    const query = 'ACGTACGTACGTACGTACGTACGT'; // 24 nt
    const t = [...query]; for (const i of [3, 10, 17]) t[i] = flip(t[i]); // gaps ≤ 7 → no clean 8-mer
    const got = pick(dnaGappedSearch(query, `TT${t.join('')}TT`, { thresholdBps: 8000 }), 2);
    expect(got).toBeTruthy();
    expect(got.metrics.substitutions).toBe(3);
    expect(got.metrics.identity).toBeCloseTo(21 / 24, 10);
  });
});

describe('K1 — occurrences: one per start, overlaps preserved, symmetric metrics', () => {
  it('AA in AAAA → starts 0,1,2 (low complexity not collapsed)', () => {
    const got = dnaGappedSearch('AA', 'AAAA', { thresholdBps: 10000 });
    expect(got.map((h) => h.start)).toEqual([0, 1, 2]);
  });

  it('metrics are non-negative and the columns sum exactly', () => {
    const target = `TT${CORE20.slice(0, 6)}G${CORE20.slice(6)}TT`;
    for (const h of dnaGappedSearch(CORE20, target, { thresholdBps: 7000 })) {
      const m = h.metrics;
      for (const v of [m.substitutions, m.insertions, m.deletions, m.exactMatches]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
      expect(m.exactMatches + m.substitutions + m.insertions).toBe(m.queryLength);
      expect(m.exactMatches + m.substitutions + m.deletions).toBe(m.targetSpan);
      expect(m.exactMatches + m.substitutions + m.insertions + m.deletions).toBe(m.alignmentLength);
    }
  });

  it('insertion and deletion of the same base score the same identity (symmetry)', () => {
    const ins = pick(dnaGappedSearch(`${CORE20.slice(0, 10)}G${CORE20.slice(10)}`, `TT${CORE20}TT`, { thresholdBps: 8000 }), 2);
    const del = pick(dnaGappedSearch(CORE20, `TT${CORE20.slice(0, 10)}G${CORE20.slice(10)}TT`, { thresholdBps: 8000 }), 2);
    expect(ins.metrics.identity).toBeCloseTo(del.metrics.identity, 12);
  });
});

describe('K1 — editBudget is exact, not heuristic', () => {
  it.each([
    [20, 8000, 5], [10, 8000, 2], [20, 10000, 0], [21, 8000, 5],
  ])('editBudget(%i, %i) = %i', (q, t, k) => { expect(editBudget(q, t)).toBe(k); });
});

describe('K1 — DIFFERENTIAL against the exhaustive oracle', () => {
  const oShape = (h) => ({
    start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L, script: h.script,
  });
  // Small targets keep the exhaustive oracle cheap so each split runs well under the default
  // per-test timeout even when the full suite loads the machine — the coverage is broad (250
  // random cases per threshold), not the case size. NOT a timeout relaxation: the work fits.
  const differential = (seed, tBps) => {
    const rnd = lcg(seed);
    let nonEmpty = 0;
    for (let n = 0; n < 250; n++) {
      const q = randSeq(rnd, 1 + Math.floor(rnd() * 5));   // 1..6
      const t = randSeq(rnd, 1 + Math.floor(rnd() * 11));  // 1..12
      const ref = pruneEndpointShadows(oracleSearchLinear(q, t, { thresholdBps: tBps })).map(oShape);
      const got = dnaGappedSearch(q, t, { thresholdBps: tBps }).map(shape);
      expect(got, `q=${q} t=${t} thr=${tBps}`).toEqual(ref);
      if (ref.length) nonEmpty += 1;
    }
    expect(nonEmpty).toBeGreaterThan(40); // not vacuous
  };
  it('agrees at threshold 70%', () => differential(20260718, 7000));
  it('agrees at threshold 80%', () => differential(70481920, 8000));
  it('agrees at threshold 90%', () => differential(13571113, 9000));
});
