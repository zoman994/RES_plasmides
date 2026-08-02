/**
 * U8 — the SHARED_SCANNER route must be indistinguishable from the shipped EXACT_FIRST route.
 *
 * This is a candidate replacement for how every DNA query is answered, so the bar is not «it is
 * faster» but «it returns the same bytes». The reasoning it rests on:
 *
 *   an exact match costs 0 edits, and 0 ≤ k for every edit budget k, so the approximate scan's
 *   candidate set is a strict SUPERSET of the exact one.
 *
 * That makes the dedicated exact sweep redundant for finding exact hits — it only made them
 * arrive FIRST. Everything below exists to prove the superset claim holds in the shapes that
 * could break it: reverse strand, origin wrap, ties, and the `limit` cap.
 *
 * Parity is asserted on the FULL observable occurrence — coordinates, strand, every metric and
 * the edit script — not on hit counts, because a route that returned the right number of wrong
 * alignments would pass a count check.
 */
import {
  describe, it, expect, afterEach,
} from 'vitest';
import { seqMatch as seqMatchSummary, REQUIRES_ALIGNMENT } from '../seq-match';

/**
 * U5-A — `seqMatch` answers with the SUMMARY model `{occurrences, locationCount, bestIndex}`, because
 * a row and an inspector must report the same number of loci as the engine found rather than the
 * length of a list that may have been capped. These contracts were written against the bare array and
 * are about the OCCURRENCES, so they unwrap it here — once, explicitly — instead of restating the
 * shape in every assertion.
 */
const seqMatch = (...args) => seqMatchSummary(...args).occurrences;

import {
  SEQUENCE_ROUTE, setSequenceRouteForBenchmark, resetSequenceRoute,
} from '../sequence-route-seam';

afterEach(() => resetSequenceRoute());

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
const mutate = (s, at) => `${s.slice(0, at)}${s[at] === 'A' ? 'C' : 'A'}${s.slice(at + 1)}`;

/** Everything a caller can observe, including the alignment itself. */
const shape = (hits) => hits.map((h) => ({
  segments: h.location.segments,
  strand: h.location.strand,
  wraps: h.location.wrapsOrigin,
  identity: h.metrics.identity,
  M: h.metrics.exactMatches,
  X: h.metrics.substitutions,
  I: h.metrics.insertions,
  D: h.metrics.deletions,
  L: h.metrics.alignmentLength,
  span: h.metrics.targetSpan,
  runs: (h.metrics.editRuns || []).map((r) => `${r.op}${r.length}@${r.probeStart}:${r.targetOffsetStart}`).join(','),
}));

/** Run the same query on both routes and return their comparable outcomes. */
function bothRoutes(q, doc, ctx) {
  const out = {};
  for (const [key, route] of [['exactFirst', SEQUENCE_ROUTE.EXACT_FIRST], ['candidate', SEQUENCE_ROUTE.SHARED_SCANNER]]) {
    setSequenceRouteForBenchmark(route);
    try {
      out[key] = { hits: shape(seqMatch(q, doc, null, ctx)), code: null };
    } catch (e) {
      out[key] = { hits: null, code: e.code };
    }
  }
  resetSequenceRoute();
  return out;
}
const agree = (q, doc, ctx, label) => {
  const { exactFirst, candidate } = bothRoutes(q, doc, ctx);
  expect(candidate, label).toEqual(exactFirst);
  return exactFirst;
};

const rnd = lcg(0x7A1);
const BG = randDna(rnd, 4000);
const doc = (seq, topology = 'linear') => ({ seq, topology });
const CTX = { bothStrands: true, identityThreshold: 0.8 };

describe('U8 parity — the four outcomes the route can produce', () => {
  it('EXACT HIT: identical, and still only the exact hits (not the approximate neighbours)', () => {
    const q = BG.slice(1000, 1060);
    const r = agree(q, doc(BG), CTX, 'exact hit');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.identity === 1), 'an exact hit must not be diluted by approximate ones').toBe(true);
  });

  it('APPROXIMATE HIT: identical alignments, not merely the same count', () => {
    const q = mutate(BG.slice(1500, 1560), 30);
    const r = agree(q, doc(BG), CTX, 'approximate hit');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.some((h) => h.identity < 1)).toBe(true);
  });

  it('APPROXIMATE MISS: an honest empty answer on both routes', () => {
    const alien = randDna(lcg(0xA11E), 60);
    const r = agree(alien, doc(BG), CTX, 'approximate miss');
    expect(r.hits).toEqual([]);
    expect(r.code).toBeNull();
  });

  it('EXACT MISS at a 100% threshold: honest complete zero, NOT routed away', () => {
    const alien = randDna(lcg(0xB22E), 60);
    const r = agree(alien, doc(BG), { ...CTX, identityThreshold: 1 }, 'exact miss @100%');
    expect(r.hits).toEqual([]);
    expect(r.code, 'a 100% search that found nothing is a real answer').toBeNull();
  });
});

describe('U8 parity — the shapes that could break the superset claim', () => {
  it('REVERSE strand exact hit', () => {
    const q = RC(BG.slice(2000, 2070));
    const r = agree(q, doc(BG), CTX, 'reverse exact');
    expect(r.hits.some((h) => h.strand === '-' || h.strand === 'both')).toBe(true);
  });

  it('REVERSE strand approximate hit', () => {
    const q = mutate(RC(BG.slice(2200, 2270)), 35);
    agree(q, doc(BG), CTX, 'reverse approximate');
  });

  it('CIRCULAR exact hit across the origin', () => {
    const ring = BG.slice(0, 400);
    const q = ring.slice(370) + ring.slice(0, 40);
    const r = agree(q, doc(ring, 'circular'), CTX, 'circular exact');
    expect(r.hits.some((h) => h.wraps)).toBe(true);
  });

  it('CIRCULAR approximate hit across the origin', () => {
    const ring = BG.slice(0, 400);
    const q = mutate(ring.slice(370) + ring.slice(0, 40), 20);
    agree(q, doc(ring, 'circular'), CTX, 'circular approximate');
  });

  it('THE CASE THAT KILLED U7 — a repeat-rich molecule with an exact hit stays complete', () => {
    // U7's single-pass turned this from 229 exact loci into RESOURCE_LIMIT, because it forced the
    // exact query through the approximate DP. U8 must not: the score-0 candidates are verified on
    // a k=0 band and returned before the expensive verifier is ever built. This is the acceptance
    // criterion "exact hits in repetitive molecules must stay complete", asserted directly.
    const unit = 'ACGTTGCAACGTTGCAACGTTGCA';
    const tandem = unit.repeat(40);
    const r = agree(unit + unit, doc(tandem), CTX, 'tandem exact');
    expect(r.code, 'must not be RESOURCE_LIMIT').toBeNull();
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.identity === 1)).toBe(true);
  });

  it('…but on a repeat-rich molecule with NO exact hit both routes agree (both pay the same DP)', () => {
    const unit = 'ACGTTGCAACGTTGCAACGTTGCA';
    agree(mutate(unit + unit, 10), doc(unit.repeat(12)), CTX, 'tandem approximate');
  }, 60_000);

  it('the LIMIT cap: an exact hit past the cap is still found (parity guard)', () => {
    // The corner the guard exists for. With a low `limit`, the approximate ranking fills up with
    // near-identical repeat loci; a naive single-pass would filter those and never see an exact
    // hit sitting further along the molecule.
    const unit = 'ACGTTGCAACGTTGCAACGTTGCA'; // 24 nt
    const molecule = `${unit.repeat(30)}${mutate(unit, 5).repeat(2)}${unit.repeat(10)}`;
    for (const limit of [3, 5, 10]) {
      agree(unit, doc(molecule), { ...CTX, limit }, `limit=${limit}`);
    }
  });

  it('threshold sweep — parity holds across acceptance levels', () => {
    // Generous timeout, not a relaxed assertion: at 0.5 the edit budget equals the query length,
    // so both routes legitimately do a lot of work. The comparison is unchanged.
    const q = mutate(BG.slice(2500, 2560), 25);
    for (const identityThreshold of [0.5, 0.7, 0.8, 0.9, 0.95, 1]) {
      agree(q, doc(BG), { ...CTX, identityThreshold }, `threshold=${identityThreshold}`);
    }
  }, 120_000);

  it('single strand only — the seam must not quietly re-enable the other strand', () => {
    const q = RC(BG.slice(3000, 3060));
    agree(q, doc(BG), { ...CTX, bothStrands: false }, 'single strand');
  });
});

describe('U8 parity — routing statuses must not blur', () => {
  it('REQUIRES_ALIGNMENT for a >100 nt approximate query is preserved', () => {
    const q = mutate(BG.slice(500, 800), 100); // 300 nt, no exact hit
    const { exactFirst, candidate } = bothRoutes(q, doc(BG), CTX);
    expect(exactFirst.code).toBe(REQUIRES_ALIGNMENT);
    expect(candidate.code, 'the length route must survive the single-pass seam').toBe(REQUIRES_ALIGNMENT);
  });

  it('a >100 nt EXACT hit is still returned on both routes', () => {
    const q = BG.slice(500, 800);
    const r = agree(q, doc(BG), CTX, 'long exact');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.identity === 1)).toBe(true);
  });

  it('INVALID_DNA is still INVALID_DNA, on both routes', () => {
    const { exactFirst, candidate } = bothRoutes('ACGTNACGTACGT', doc(BG), CTX);
    expect(exactFirst.code).toBe('INVALID_DNA');
    expect(candidate.code).toBe('INVALID_DNA');
  });

  it('random differential — 120 pairs across both strands and topologies', () => {
    const r2 = lcg(0xC0FFEE);
    for (let n = 0; n < 120; n++) {
      const target = randDna(r2, 200 + Math.floor(r2() * 300));
      const at = Math.floor(r2() * (target.length - 80));
      let q = target.slice(at, at + 20 + Math.floor(r2() * 50));
      const kind = n % 4;
      if (kind === 1) q = mutate(q, Math.floor(q.length / 2));
      else if (kind === 2) q = RC(q);
      else if (kind === 3) q = randDna(r2, 30); // usually absent
      agree(q, doc(target, n % 2 ? 'circular' : 'linear'), {
        bothStrands: n % 3 !== 0,
        identityThreshold: [0.7, 0.8, 0.9][n % 3],
      }, `n=${n} q=${q}`);
    }
  }, 120_000);
});
