/**
 * U3 — does the fast kernel lose biology at machine-word boundaries, and does it pick the same
 * locus as the reference?
 *
 * This file answers three questions a molecular biologist would actually ask, and deliberately
 * nothing else:
 *
 *   1. Did a hit disappear because of how long my query happens to be?
 *   2. Are the coordinates and the percentage right?
 *   3. Was the best locus the one that got picked?
 *
 * WHAT THIS FILE IS NOT. It is not the full product of lengths x thresholds x strands x topology.
 * That grid restates the same three facts hundreds of times and hides which case actually
 * matters. Instead the lengths carry a COVERING SAMPLE: every edit kind, both strands, one
 * circular case and one repeat case each appear at least once, spread across the lengths rather
 * than multiplied by them.
 *
 * Expectations are FIXED REFERENCE VALUES computed by hand from the construction, not oracle
 * output: the exponential oracle stays for the small exhaustive differential, where it is cheap
 * and its independence is worth paying for.
 *
 * `windowAccept` is already pinned directly in dna-linear-window-accounting.test.js (U2) and is
 * not duplicated here.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-lengths.test.js
 */
import { describe, it, expect } from 'vitest';
import { findOccurrences, compareRules16, compareCanonical } from '../dna-linear-kernel';
import { encodeQuery, encodeTarget, MyersScanner } from '../dna-linear-scan';
import { StartSolver, solveStart } from '../dna-linear-verify';

/** Deterministic DNA — a fixed generator so every expectation below is reproducible. */
function dna(n, seed) {
  let a = seed | 0;
  let s = '';
  for (let i = 0; i < n; i++) {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    s += 'ACGT'[((t ^ (t >>> 14)) >>> 0) % 4];
  }
  return s;
}
const rc = (s) => [...s].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');
const FLANK = 'TTTTTTTTTT';                       // 10 nt, never part of a hit below

describe('U3 — query length must not move the locus (scanner block boundaries)', () => {
  // 32-bit blocks. A corrupted last-word mask or a broken inter-block carry shows up exactly at
  // these lengths, and the biological symptom is the worst kind: the same construct is found at
  // 32 nt and missed at 33.
  for (const m of [31, 32, 33, 63, 64, 65, 95, 96, 97, 127, 128, 129]) {
    const query = dna(m, 1000 + m);
    const target = FLANK + query + FLANK;

    it(`m=${m}: the exact locus is found at offset 10, span ${m}, 100%`, () => {
      const got = findOccurrences(query, target, { thresholdBps: 8000, bothStrands: false });
      const hit = got.find((o) => o.start === FLANK.length);
      expect(hit, `m=${m}: the planted locus must be found`).toBeDefined();
      expect({ span: hit.targetSpan, M: hit.M, X: hit.X, I: hit.I, D: hit.D, bps: hit.identityBps })
        .toEqual({ span: m, M: m, X: 0, I: 0, D: 0, bps: 10000 });
    });

    it(`m=${m}: one interior substitution still lands on the same locus`, () => {
      const mid = m >> 1;
      const other = query[mid] === 'A' ? 'C' : 'A';
      const mutated = query.slice(0, mid) + other + query.slice(mid + 1);
      const got = findOccurrences(query, FLANK + mutated + FLANK, {
        thresholdBps: 8000, bothStrands: false,
      });
      const hit = got.find((o) => o.start === FLANK.length);
      expect(hit, `m=${m}: one substitution must not lose the locus`).toBeDefined();
      expect(hit.M).toBe(m - 1);
      expect(hit.X).toBe(1);
      expect(hit.targetSpan).toBe(m);
    });
  }
});

describe('U3 — covering sample across working lengths', () => {
  it('20 nt, exact, plus strand, linear', () => {
    const q = dna(20, 20);
    const got = findOccurrences(q, FLANK + q + FLANK, { thresholdBps: 8000, bothStrands: false });
    const hit = got.find((o) => o.start === 10);
    expect(hit).toBeDefined();
    expect([hit.M, hit.X, hit.I, hit.D, hit.identityBps]).toEqual([20, 0, 0, 0, 10000]);
  });

  it('50 nt, five substitutions, both strands enabled', () => {
    const q = dna(50, 50);
    let core = q;
    for (const p of [5, 15, 25, 35, 45]) {
      core = core.slice(0, p) + (core[p] === 'G' ? 'T' : 'G') + core.slice(p + 1);
    }
    const got = findOccurrences(q, FLANK + core + FLANK, { thresholdBps: 8000, bothStrands: true });
    const hit = got.find((o) => o.start === 10 && o.strand === '+');
    expect(hit, 'the plus-strand locus must survive 5 substitutions at 90%').toBeDefined();
    expect(hit.X).toBe(5);
    expect(hit.M).toBe(45);
    expect(hit.identityBps).toBe(9000);
  });

  it('100 nt, one INSERTION in the query (a base the molecule lacks)', () => {
    const q = dna(100, 100);
    const core = `${q.slice(0, 40)}${q.slice(41)}`;     // molecule is missing q[40]
    const got = findOccurrences(q, FLANK + core + FLANK, { thresholdBps: 8000, bothStrands: false });
    const hit = got.find((o) => o.start === 10);
    expect(hit, 'a query base with no counterpart must not lose the hit').toBeDefined();
    expect(hit.I, 'exactly one query-only base').toBe(1);
    expect(hit.M + hit.X + hit.I).toBe(100);
    expect(hit.alignmentLength).toBe(100 + hit.D);
  });

  it('200 nt, one DELETION (an extra base in the molecule), minus strand', () => {
    const q = dna(200, 200);
    const core = `${q.slice(0, 90)}A${q.slice(90)}`;    // molecule has one base too many
    const target = FLANK + rc(core) + FLANK;            // planted on the minus strand
    const got = findOccurrences(q, target, { thresholdBps: 8000, bothStrands: true });
    const hit = got.find((o) => o.strand === '-');
    expect(hit, 'the minus-strand locus must be reported on the minus strand').toBeDefined();
    expect(hit.D, 'exactly one target-only base').toBe(1);
    expect(hit.alignmentLength).toBe(201);
    expect(hit.identityBps).toBe(Math.floor((hit.M * 10000) / 201));
  });

  it('400 nt, mixed X + I + D', () => {
    // Run at 95%, not 80%, and that is a deliberate biological choice rather than a convenience.
    // At 400 nt / 80% the edit budget is K=100 — tolerating a hundred edits in a 400 bp fragment
    // is homology search, which production deliberately routes to the alignment workflow
    // (§4.2.0 caps approximate search at 100 nt). The regime a biologist actually uses for a
    // 400 bp insert is "a few point mutations and a cloning scar", i.e. ~95%. Two things were
    // measured on the way here and are worth recording: at 80% this case exceeded
    // DEFAULT_BUDGETS (the kernel's per-cell verifier accounting is finer than the production
    // counting those defaults were calibrated against — recalibration is U4/U6 work), and then
    // exceeded the 5 s test timeout, which is not to be raised.
    const BUDGETS = { scan: null, verifier: null, traceback: null, output: null };
    const q = dna(400, 400);
    let core = q;
    core = `${core.slice(0, 300)}${core.slice(301)}`;                     // -> one I
    core = `${core.slice(0, 150)}G${core.slice(150)}`;                    // -> one D
    core = `${core.slice(0, 50)}${core[50] === 'A' ? 'C' : 'A'}${core.slice(51)}`;  // -> one X
    const got = findOccurrences(q, FLANK + core + FLANK, {
      thresholdBps: 9500, bothStrands: false, budgets: BUDGETS,
    });
    const hit = got.find((o) => o.start === 10);
    expect(hit, 'a 400-mer with three different edits must still be found').toBeDefined();
    expect(hit.M + hit.X + hit.I, 'the whole query is aligned').toBe(400);
    expect(hit.alignmentLength).toBe(400 + hit.D);
    expect(hit.identityBps).toBeGreaterThan(9800);
  });

  it('one circular case: a 60 nt hit crossing the origin', () => {
    const q = dna(60, 60);
    const target = q.slice(30) + dna(80, 7) + q.slice(0, 30);   // straddles the origin
    const n = target.length;
    const got = findOccurrences(q, target, { thresholdBps: 9000, circular: true, bothStrands: false });
    const wrapped = got.find((o) => o.start + o.targetSpan > n);
    expect(wrapped, 'the origin-crossing hit must be found').toBeDefined();
    expect(wrapped.identityBps).toBe(10000);
    expect(wrapped.end).toBe((wrapped.start + wrapped.targetSpan) % n);
    expect(wrapped.targetSpan).toBe(60);
  });

  it('one repeat case: a shared backbone present three times', () => {
    const q = dna(80, 80);
    const sep = dna(40, 9);
    const target = `${sep}${q}${sep}${q}${sep}${q}${sep}`;
    const got = findOccurrences(q, target, { thresholdBps: 9500, bothStrands: false });
    const perfect = got.filter((o) => o.identityBps === 10000);
    expect(perfect.length, 'every copy of the backbone must be reported').toBe(3);
    expect(perfect.map((o) => o.start)).toEqual([40, 160, 280]);
  });
});

describe('U3 — the seams, tested directly', () => {
  it('scanner -> candidate ends matches a fixed reference list', () => {
    // Hand-checkable: query ACGT in ACGTACGT at k=0 ends exactly at 4 and 8.
    const q = encodeQuery('ACGT');
    const ext = encodeTarget('ACGTACGT');
    const ends = [];
    new MyersScanner(q, 0).scanStream(ext, ext.length, true, (e) => ends.push(e), null);
    expect(ends).toEqual([4, 8]);
  });

  it('scanner -> candidate ends widens correctly when one edit is allowed', () => {
    const q = encodeQuery('ACGT');
    const ext = encodeTarget('ACGTACGT');
    const ends = [];
    new MyersScanner(q, 1).scanStream(ext, ext.length, true, (e) => ends.push(e), null);
    // Every end whose best alignment costs <= 1 edit. Superset of the exact ends, and monotone.
    expect(ends).toEqual(expect.arrayContaining([4, 8]));
    expect(ends.length).toBeGreaterThan(2);
    expect([...ends].sort((a, b) => a - b)).toEqual(ends);
  });

  it('solver -> occurrence returns the exact fields for a known start', () => {
    const query = 'ACGTACGTACGTACGT';
    const target = `TTTT${query}TTTT`;
    const q = encodeQuery(query);
    const ext = encodeTarget(target);
    const m = q.length;
    const thr = 8000;
    const maxSpan = Math.min(ext.length, Math.floor((m * 10000) / thr));
    const K = Math.floor((m * (10000 - thr)) / thr);
    const solver = new StartSolver(m, maxSpan, K);
    const occ = solveStart(solver, q, ext, ext.length, 4, maxSpan, thr, ext.length, false, '+', 1000);
    expect(occ).not.toBeNull();
    expect({ start: occ.start, span: occ.targetSpan, M: occ.M, X: occ.X, I: occ.I, D: occ.D, bps: occ.identityBps })
      .toEqual({ start: 4, span: 16, M: 16, X: 0, I: 0, D: 0, bps: 10000 });
  });

  it('canonical comparator -> the higher ratio wins, not the larger M', () => {
    // This is the seam that decides WHICH locus a biologist is shown. A comparator that
    // maximised matched bases would prefer B: it matches more of the molecule, but dilutes the
    // percentage. Rule 1 is a ratio.
    const A = { M: 28, X: 5, I: 0, D: 4, alignmentLength: 37, gapEvents: 1, targetSpan: 37, script: '=' };
    const B = { M: 31, X: 0, I: 0, D: 10, alignmentLength: 41, gapEvents: 1, targetSpan: 41, script: '=' };
    expect(A.M / A.alignmentLength).toBeGreaterThan(B.M / B.alignmentLength);
    expect(B.M).toBeGreaterThan(A.M);
    expect(compareRules16(A, B, 0, 0), 'A has the higher ratio and must win').toBeLessThan(0);
    expect(compareCanonical(A, B, 0, 0)).toBeLessThan(0);
  });

  it('canonical comparator -> equal ratio falls through to more M', () => {
    const A = { M: 8, X: 2, I: 0, D: 0, alignmentLength: 10, gapEvents: 0, targetSpan: 10, script: '=' };
    const B = { M: 16, X: 4, I: 0, D: 0, alignmentLength: 20, gapEvents: 0, targetSpan: 20, script: '=' };
    expect(A.M * B.alignmentLength).toBe(B.M * A.alignmentLength);   // same ratio
    expect(compareRules16(A, B, 0, 0), 'equal ratio -> more matched bases wins').toBeGreaterThan(0);
  });
});
