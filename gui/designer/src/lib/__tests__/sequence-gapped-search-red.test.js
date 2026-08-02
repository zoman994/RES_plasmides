/**
 * SPEC CONTRACT for SEARCH-GAPPED-DNA (§6), asserted DIRECTLY against the production entry point
 * `seqMatch`.
 *
 * Lifecycle: this file was born in K0 as a RED contract wrapped in `redContract(fn)` — every case
 * asserted the spec against the OLD engine and was expected to FAIL. At K3 `seqMatch` was rerouted
 * to the unified gapped core, the wrapper self-flipped ("the engine now satisfies the spec; delete
 * the wrapper and assert directly"), and it was removed. What remains is the same spec matrix, now
 * a live GREEN contract.
 *
 * Truth source for the POSITIONAL matrices (§6.1(2)(3)) is the accepted exhaustive oracle, not
 * hand-written values. That is deliberate: the K0 draft assumed "an inserted base is always 1 I at
 * all 21 positions", which is false once the target has flanks — at a boundary the inserted base
 * can align against a flanking base as a substitution, and §3.2 rule 4 (fewer indel events) then
 * makes THAT the canonical alignment. Only the oracle settles such cases.
 */
import { describe, it, expect } from 'vitest';
import { seqMatch as seqMatchSummary } from '../seq-match';

/**
 * U5-A — `seqMatch` answers with the SUMMARY model `{occurrences, locationCount, bestIndex}`, because
 * a row and an inspector must report the same number of loci as the engine found rather than the
 * length of a list that may have been capped. These contracts were written against the bare array and
 * are about the OCCURRENCES, so they unwrap it here — once, explicitly — instead of restating the
 * shape in every assertion.
 */
const seqMatch = (...args) => seqMatchSummary(...args).occurrences;

import { oracleSearchLinear, pruneEndpointShadows } from './helpers/glocal-oracle';

const CORE20 = 'ACGTACGTACGTACGTACGT';
const doc = (seq, topology = 'linear') => ({ seq, topology });
const flip = (ch) => (ch === 'A' ? 'C' : 'A');
const CTX = { identityThreshold: 0.8, bothStrands: false }; // concrete matrix → single strand
const hitsOf = (query, seqStr, ctx = CTX) => seqMatch(query, doc(seqStr), {}, ctx);

/**
 * Select the occurrence at (start, strand) and project the contract fields. Returns a plain
 * record even when nothing matched, so a miss fails as a value mismatch, never a TypeError.
 */
function occAt(hits, start, strand = '+') {
  const h = hits.find((x) => x.location.strand === strand && x.location.segments[0].start === start);
  if (!h) return { found: false };
  const m = h.metrics;
  const last = h.location.segments[h.location.segments.length - 1];
  return {
    found: true,
    start: h.location.segments[0].start,
    end: last.end,
    substitutions: m.substitutions,
    insertions: m.insertions,
    deletions: m.deletions,
    alignmentLength: m.alignmentLength,
  };
}
const identityAt = (hits, start, strand = '+') => {
  const h = hits.find((x) => x.location.strand === strand && x.location.segments[0].start === start);
  return h ? h.metrics.identity : null;
};

/** Project a provider occurrence / an oracle hit onto one comparable shape. */
const engShape = (h) => ({
  start: h.location.segments[0].start,
  end: h.location.segments[h.location.segments.length - 1].end,
  subs: h.metrics.substitutions,
  ins: h.metrics.insertions,
  del: h.metrics.deletions,
  L: h.metrics.alignmentLength,
});
const oraShape = (h) => ({
  start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L,
});
/** The engine, through the real provider, must equal the exhaustive oracle — where the reference
 * is the RAW per-start set with §3.2.1 endpoint pruning applied as its own independent step. */
function agreesWithOracle(query, target) {
  const eng = hitsOf(query, target).map(engShape);
  const ref = pruneEndpointShadows(oracleSearchLinear(query, target, { thresholdBps: 8000 })).map(oraShape);
  expect(eng, `q=${query} t=${target}`).toEqual(ref);
}

describe('§6.1(1) — exact hit with half-open coordinates and the new metric shape', () => {
  it('exact 20-mer → start 2, end 22, zero edits, alignmentLength 20', () => {
    expect(occAt(hitsOf(CORE20, `TT${CORE20}TT`), 2)).toEqual({
      found: true, start: 2, end: 22, substitutions: 0, insertions: 0, deletions: 0, alignmentLength: 20,
    });
  });
});

describe('§2.4 — identity threshold governs, not maxMismatches', () => {
  it('1 substitution (95%) is FOUND at threshold 0.8', () => {
    const t = [...CORE20]; t[5] = flip(t[5]);
    expect(occAt(hitsOf(CORE20, `TTTT${t.join('')}TTTT`), 4)).toEqual({
      found: true, start: 4, end: 24, substitutions: 1, insertions: 0, deletions: 0, alignmentLength: 20,
    });
  });

  it('4 substitutions (exactly 80%) is a hit', () => {
    const q = [...CORE20]; for (const i of [0, 5, 10, 15]) q[i] = flip(q[i]);
    expect(occAt(hitsOf(CORE20, `TTTT${q.join('')}TTTT`), 4)).toEqual({
      found: true, start: 4, end: 24, substitutions: 4, insertions: 0, deletions: 0, alignmentLength: 20,
    });
  });

  it('4 CONTIGUOUS substitutions is a hit (old runOfK=3 must not apply)', () => {
    const q = [...CORE20]; for (const i of [8, 9, 10, 11]) q[i] = flip(q[i]);
    const target = `TTTT${q.join('')}TTTT`;
    expect(hitsOf(CORE20, target).length).toBeGreaterThan(0);
    agreesWithOracle(CORE20, target); // periodic core → the oracle settles the canonical form
  });

  it('5 substitutions (75%) is REJECTED even with a generous legacy maxMismatches', () => {
    const q = [...CORE20]; for (const i of [0, 4, 8, 12, 16]) q[i] = flip(q[i]);
    const hits = hitsOf(CORE20, q.join(''), { identityThreshold: 0.8, bothStrands: false, maxMismatches: 6 });
    expect(hits).toHaveLength(0); // 75% < 80%; maxMismatches no longer executes anywhere
  });
});

describe('§6.1(2) — a QUERY with one inserted base, at every position (0..20)', () => {
  const positions = Array.from({ length: CORE20.length + 1 }, (_, p) => p);
  it.each(positions)('query insertion before index %i equals the oracle', (p) => {
    agreesWithOracle(`${CORE20.slice(0, p)}G${CORE20.slice(p)}`, `TT${CORE20}TT`);
  });
});

describe('§6.1(3) — a TARGET with one INTERIOR inserted base (positions 1..19)', () => {
  const interior = Array.from({ length: CORE20.length - 1 }, (_, k) => k + 1); // 1..19
  it.each(interior)('interior extra target base at index %i equals the oracle', (p) => {
    agreesWithOracle(CORE20, `TT${CORE20.slice(0, p)}G${CORE20.slice(p)}TT`);
  });
});

describe('§3.2 — a boundary target-only base is a FREE flank, NOT a deletion', () => {
  it('extra base at the START → exact 20-mer, start shifts to 3, D=0, L=20', () => {
    expect(occAt(hitsOf(CORE20, `TTG${CORE20}TT`), 3)).toEqual({
      found: true, start: 3, end: 23, substitutions: 0, insertions: 0, deletions: 0, alignmentLength: 20,
    });
  });

  it('extra base at the END → exact 20-mer, start stays 2, D=0, L=20', () => {
    expect(occAt(hitsOf(CORE20, `TT${CORE20}GTT`), 2)).toEqual({
      found: true, start: 2, end: 22, substitutions: 0, insertions: 0, deletions: 0, alignmentLength: 20,
    });
  });
});

describe('§0 — gap metric honesty on a LONG query (no false 100%, symmetric)', () => {
  const LONG = CORE20 + CORE20; // 40 nt — the old engine took its separate long path here

  it('a single TARGET insertion is 1 D, identity 40/41 — not identity 1', () => {
    const target = `${LONG.slice(0, 20)}G${LONG.slice(20)}`; // 41 nt
    expect(occAt(hitsOf(LONG, target), 0)).toEqual({
      found: true, start: 0, end: 41, substitutions: 0, insertions: 0, deletions: 1, alignmentLength: 41,
    });
    expect(identityAt(hitsOf(LONG, target), 0)).toBeCloseTo(40 / 41, 12);
  });

  it('insertion and deletion of the same base score the SAME identity (40/41)', () => {
    const tgtIns = identityAt(hitsOf(LONG, `${LONG.slice(0, 20)}G${LONG.slice(20)}`), 0);
    const qryIns = identityAt(hitsOf(`${LONG.slice(0, 20)}G${LONG.slice(20)}`, LONG), 0);
    expect(tgtIns).toBeCloseTo(40 / 41, 12);
    expect(qryIns).toBeCloseTo(40 / 41, 12); // old engine: 1 vs 0.9756 — asymmetric and false
  });
});
