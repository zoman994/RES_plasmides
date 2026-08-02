/**
 * U6-E1.1 — the safeguards the first literal scanner shipped without.
 *
 * The scan itself was right and fast; three properties that the bit-parallel engine provided for
 * free were lost when the exact pass moved off it, and the first round of tests did not notice
 * because each one was pinned by a case that happened to be trivial:
 *
 *   • FULL CIRCLE. A hit may use every physical base exactly once (`targetSpan === n`). The guard
 *     `n > m` silenced that whole class, and the test that should have caught it compared a molecule
 *     against ITSELF — where a linear match at 0 exists anyway.
 *   • BOUNDED OUTPUT. Every start was collected, every occurrence materialised, and only then was
 *     `limit` applied. A homopolymer answers with five loci after building two hundred thousand.
 *   • CANCELLATION. One `indexOf` over the remainder of a molecule is atomic. The suspension test
 *     used a target that matches at every position, so it suspended after each hit and never
 *     exercised the case that matters: a long stretch with nothing in it.
 *
 * And two contract points: a literal pass consumes no verifier or traceback, but it does consume
 * scan and output, so it can still be legitimately incomplete.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSessionSteps } from '../dna-gapped-session-steps';
import { literalExactSessionSteps } from '../dna-literal-exact';
import { drainSync, drainCooperative, SEARCH_CANCELLED } from '../dna-search-cooperative';

const EXACT_BPS = 10000;
const engine = (q, t, o = {}) => drainSync(dnaGappedSessionSteps(q, t, { ...o, thresholdBps: EXACT_BPS }));
const literal = (q, t, o = {}) => drainSync(literalExactSessionSteps(q, t, o));

/** Everything a caller downstream can observe about a locus. */
const shapeOf = (s) => ({
  locationCount: s.locationCount,
  bestIndex: s.bestIndex,
  occurrences: s.occurrences.map((o) => ({
    strand: o.strand,
    wrapsOrigin: o.wrapsOrigin,
    segments: o.segments,
    start: o.start,
    end: o.end,
    script: o.script,
    metrics: o.metrics,
  })),
});
const expectSame = (q, t, o = {}) => {
  const a = shapeOf(engine(q, t, o));
  expect(shapeOf(literal(q, t, o))).toEqual(a);
  return a;
};
const brief = (s) => s.occurrences.map((o) => `${o.strand}@${o.start}${o.wrapsOrigin ? 'w' : ''}`);

const CIRC = { bothStrands: true, circular: true, limit: 500 };

describe('U6-E1.1 — full circle: a hit may use every base exactly once', () => {
  it('rotated full-circle on the plus strand', () => {
    // ATGC read as a ring is also GCAT, starting at 2 and crossing the origin.
    const env = expectSame('GCAT', 'ATGC', CIRC);
    expect(brief(env)).toContain('+@2w');
  });

  it('rotated full-circle on the minus strand only', () => {
    // rc(TCGT) = ACGA, which is AACG rotated by one.
    const env = expectSame('TCGT', 'AACG', CIRC);
    expect(brief(env)).toEqual(['-@1w']);
  });

  it('a periodic palindrome has SEVERAL both-strand starts around the ring', () => {
    const env = expectSame('ATAT', 'ATAT', CIRC);
    expect(brief(env)).toEqual(['both@0', 'both@2w']);
    expect(env.locationCount).toBe(2);
  });

  it('a full-circle hit that is only reachable across the origin', () => {
    const env = expectSame('CATG', 'ATGC', CIRC);
    expect(brief(env)).toEqual(['both@3w']);
  });

  it('longer rings, full circle, both strands', () => {
    const ring = 'ACGTTGCACCTGAAGTCCATGGATCCGTAA';
    for (let rot = 0; rot < ring.length; rot += 1) {
      const q = ring.slice(rot) + ring.slice(0, rot);
      expectSame(q, ring, CIRC);
    }
  });

  it('a query LONGER than the molecule is still a miss — no second turn', () => {
    const small = 'ACGTACGT';
    const env = expectSame(`${small}A`, small, CIRC);
    expect(env.occurrences).toEqual([]);
    expect(expectSame(`${small}${small}`, small, CIRC).occurrences).toEqual([]);
  });

  it('the whole envelope agrees, not only the coordinates', () => {
    const env = expectSame('GCAT', 'ATGC', CIRC);
    const wrapped = env.occurrences.find((o) => o.wrapsOrigin);
    expect(wrapped.segments).toEqual([{ start: 2, end: 4 }, { start: 0, end: 2 }]);
    expect(wrapped.metrics.targetSpan).toBe(4);
    expect(wrapped.metrics.identity).toBe(1);
  });
});

describe('U6-E1.1 — cancellation: safe points exist where there is nothing to find', () => {
  const MB = 1_000_000;
  const filler = (n) => {
    let a = 12345;
    let out = '';
    for (let i = 0; i < n; i += 1) { a = (a * 1103515245 + 12345) & 0x7fffffff; out += 'ACGT'[(a >>> 13) % 4]; }
    return out;
  };
  const countSteps = (gen) => { let n = 0; let s = gen.next(); while (!s.done) { n += 1; s = gen.next(); } return n; };

  it('1 Mb with NO hit still suspends many times', () => {
    const target = filler(MB);
    const steps = countSteps(literalExactSessionSteps('GGGGGGGGGGGGGGGGGGGGGGGG', target, { bothStrands: true, limit: 500 }));
    // Two per strand would mean «only the yield before each strand» — the defect this pins.
    expect(steps).toBeGreaterThan(20);
  });

  it('1 Mb whose only hit sits at the very end suspends long before reaching it', () => {
    const q = 'GGGGGGGGGGGGGGGGGGGGGGGG';
    const target = filler(MB - q.length) + q;
    const it = literalExactSessionSteps(q, target, { bothStrands: false, limit: 500 });
    let before = 0;
    let step = it.next();
    while (!step.done) { before += 1; step = it.next(); }
    expect(before).toBeGreaterThan(20);
  });

  it('the default cooperative drive really cancels a long no-hit scan', async () => {
    const target = filler(MB);
    const gen = literalExactSessionSteps('GGGGGGGGGGGGGGGGGGGGGGGG', target, { bothStrands: true, limit: 500 });
    let cancelled = false;
    const err = await drainCooperative(gen, { shouldCancel: () => cancelled, sliceMs: 0 })
      .then(() => null, (e) => e);
    cancelled = true;
    const err2 = err || await drainCooperative(
      literalExactSessionSteps('GGGGGGGGGGGGGGGGGGGGGGGG', target, { bothStrands: true, limit: 500 }),
      { shouldCancel: () => true, sliceMs: 0 },
    ).then(() => null, (e) => e);
    expect(err2).toBeTruthy();
    expect(err2.code).toBe(SEARCH_CANCELLED);
  });
});

describe('U6-E1.1 — bounded output: a cap is a ceiling on WORK, not only on the payload', () => {
  const HOMO = 'A'.repeat(200_000);

  it('200 000 loci with limit 5: exact count, five retained, bounded work', () => {
    const s = literal('AAAA', HOMO, { bothStrands: false, limit: 5, collectStats: true });
    expect(s.locationCount).toBe(HOMO.length - 3);
    expect(s.occurrences).toHaveLength(5);
    expect(s.occurrences.map((o) => o.start)).toEqual([0, 1, 2, 3, 4]);
    // The proof that the cap bounded the work and not just the answer.
    expect(s.stats.occurrencesBuilt).toBeLessThanOrEqual(6);
    expect(s.stats.peakRetained).toBeLessThanOrEqual(5);
  });

  it('the canonical winner survives the cap even when it lies beyond it', () => {
    // The winner is the locus with the SMALLEST physical endpoint (§3.2 rule 6; for exact hits every
    // earlier rule ties). On a line that is always the first locus, so the cap can never lose it —
    // the case only exists on a ring, where the endpoint folds modulo n.
    //
    // 20-mer ring: `ACGT` sits at 5 (endpoint 9) and again across the origin at 18 (endpoint
    // (18+4) mod 20 = 2). The winner is therefore the SECOND locus positionally, and with a cap of
    // one it lies outside the retained window. An earlier version of this test used a ring with two
    // loci and a cap of two — nothing was ever truncated, so it proved nothing.
    const ring = 'GT' + 'TTT' + 'ACGT' + 'T'.repeat(9) + 'AC';
    expect(ring).toHaveLength(20);
    const opts = { bothStrands: false, circular: true };
    const full = literal('ACGT', ring, { ...opts, limit: 500 });
    expect(full.occurrences.map((o) => o.start)).toEqual([5, 18]);
    expect(full.bestIndex).toBe(1);
    // The engine agrees about who wins — the streaming rule is not a second opinion.
    expect(shapeOf(engine('ACGT', ring, { ...opts, limit: 500 }))).toEqual(shapeOf(full));

    const capped = literal('ACGT', ring, { ...opts, limit: 1 });
    expect(capped.locationCount).toBe(2);
    expect(capped.occurrences).toHaveLength(1);
    expect(capped.occurrences[capped.bestIndex].start).toBe(18);
    expect(capped.occurrences[capped.bestIndex].wrapsOrigin).toBe(true);
  });

  it('positional order is kept inside the retained window', () => {
    const s = literal('ACGT', `${'ACGT'.repeat(50)}`, { bothStrands: false, limit: 4 });
    expect(s.occurrences.map((o) => o.start)).toEqual([0, 4, 8, 12]);
  });
});

describe('U6-E1.1 — budgets: a literal pass spends scan and output, and says so', () => {
  const LONG = 'ACGT'.repeat(50_000);

  it('a small scan budget on a long no-hit is a typed RESOURCE_LIMIT, not an honest zero', () => {
    let thrown = null;
    try {
      literal('GGGGGGGGGG', LONG, { bothStrands: false, limit: 500, budgets: { scan: 1000 } });
    } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('RESOURCE_LIMIT');
    expect(thrown.axis).toBe('scan');
  });

  it('the legacy stateBudget is honoured too', () => {
    let thrown = null;
    try {
      literal('GGGGGGGGGG', LONG, { bothStrands: false, limit: 500, stateBudget: 1000 });
    } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('RESOURCE_LIMIT');
  });

  it('an output budget below the retained window fails typed, and publishes nothing', () => {
    let thrown = null;
    try {
      literal('ACGT', 'ACGT'.repeat(100), { bothStrands: false, limit: 10, budgets: { output: 3 } });
    } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('RESOURCE_LIMIT');
    expect(thrown.axis).toBe('output');
  });

  it('an output budget equal to the retained window completes', () => {
    const s = literal('ACGT', 'ACGT'.repeat(100), { bothStrands: false, limit: 10, budgets: { output: 10 } });
    expect(s.occurrences).toHaveLength(10);
    expect(s.locationCount).toBe(100);
  });

  it('a malformed budget keeps the existing INVALID_BUDGET contract', () => {
    let thrown = null;
    try { literal('ACGT', 'ACGTACGT', { budgets: { scan: -5 } }); } catch (e) { thrown = e; }
    expect(thrown).toBeTruthy();
    expect(thrown.code).toBe('INVALID_BUDGET');
  });
});
