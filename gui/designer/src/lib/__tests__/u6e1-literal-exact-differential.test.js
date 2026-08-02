/**
 * U6-E1 — the literal exact scan must answer EXACTLY what the gapped engine answers at 100 %.
 *
 * A faster exact path is only allowed if it is the same answer. So this is a differential: the same
 * query and molecule go through `literalExactSessionSteps` and through `dnaGappedSessionSteps` at a
 * 10 000 bps threshold, and the whole envelope is compared — coordinates, strands, origin crossing,
 * every metric, the edit script and the run-length edit runs, the locus count and the winner.
 *
 * Comparing only counts, or only starts, would let the two agree about how many hits exist while
 * disagreeing about what a hit IS — which is the failure mode that matters, because everything
 * downstream (the overlay, the jump target, the ranking) reads those fields.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSessionSteps } from '../dna-gapped-session-steps';
import { literalExactSessionSteps } from '../dna-literal-exact';
import { drainSync } from '../dna-search-cooperative';

const EXACT_BPS = 10000;

const engineExact = (q, t, opts = {}) => drainSync(dnaGappedSessionSteps(q, t, { ...opts, thresholdBps: EXACT_BPS }));
const literalExact = (q, t, opts = {}) => drainSync(literalExactSessionSteps(q, t, opts));

/** The comparable shape of a session: everything a caller downstream can observe. */
const shapeOf = (s) => ({
  incomplete: s.incomplete,
  reason: s.reason,
  locationCount: s.locationCount,
  bestIndex: s.bestIndex,
  occurrences: s.occurrences.map((o) => ({
    strand: o.strand,
    wrapsOrigin: o.wrapsOrigin,
    segments: o.segments,
    start: o.start,
    end: o.end,
    script: o.script,
    editRuns: o.editRuns,
    metrics: o.metrics,
  })),
});

function expectSame(q, t, opts = {}) {
  const a = shapeOf(engineExact(q, t, opts));
  const b = shapeOf(literalExact(q, t, opts));
  expect(b).toEqual(a);
  return a;
}

const rc = (s) => s.split('').reverse().map((c) => ({
  A: 'T', C: 'G', G: 'C', T: 'A',
}[c] || c)).join('');

/** Deterministic pseudo-random DNA — a fixed generator so a failure is reproducible by seed. */
function seq(seed, n, alphabet = 'ACGT') {
  let a = seed;
  let out = '';
  for (let i = 0; i < n; i += 1) {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    out += alphabet[(a >>> 7) % alphabet.length];
  }
  return out;
}

describe('U6-E1 — literal exact vs the previous path: lengths', () => {
  // 31/32/33 and 63/64/65 are the word boundaries of the bit-parallel engine: if the literal scan
  // and the engine ever disagree about a boundary, it will be here.
  for (const m of [1, 20, 31, 32, 33, 63, 64, 65, 100]) {
    it(`length ${m}, both strands, linear`, () => {
      const target = seq(m * 7919, 4000);
      const q = target.slice(1234, 1234 + m);
      const env = expectSame(q, target, { bothStrands: true, limit: 500 });
      expect(env.occurrences.length).toBeGreaterThan(0);
    });
    it(`length ${m}, circular, hit across the origin`, () => {
      const base = seq(m * 104729, 3000);
      const head = base.slice(0, m - (m > 1 ? Math.ceil(m / 2) : 0));
      // Build a molecule whose origin sits inside a copy of the query.
      const q = base.slice(500, 500 + m);
      const rotated = q.slice(Math.floor(m / 2)) + base.slice(600, 2600) + q.slice(0, Math.floor(m / 2));
      expectSame(q, rotated, { bothStrands: true, circular: true, limit: 500 });
      expect(head.length).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('U6-E1 — literal exact vs the previous path: biology', () => {
  it('overlapping repeats — AA occurs twice in AAA', () => {
    const env = expectSame('AA', 'AAA', { bothStrands: false, limit: 500 });
    expect(env.occurrences.map((o) => o.start)).toEqual([0, 1]);
  });

  it('a tandem repeat longer than the query', () => {
    expectSame('ACGACG', `${'ACG'.repeat(20)}TTTT`, { bothStrands: false, limit: 500 });
  });

  it('low complexity — a homopolymer', () => {
    expectSame('AAAAAAAA', `${'A'.repeat(60)}C${'A'.repeat(40)}`, { bothStrands: true, limit: 500 });
  });

  it('minus strand only', () => {
    const target = seq(31337, 2000);
    const q = rc(target.slice(700, 740));
    const env = expectSame(q, target, { bothStrands: true, limit: 500 });
    expect(env.occurrences.every((o) => o.strand === '-')).toBe(true);
  });

  it('a palindrome collapses to one both-strand locus', () => {
    const half = 'ACGTTGCACCTGAAG';
    const pal = half + rc(half);
    const target = `${seq(4242, 500)}${pal}${seq(99, 500)}`;
    const env = expectSame(pal, target, { bothStrands: true, limit: 500 });
    expect(env.occurrences).toHaveLength(1);
    expect(env.occurrences[0].strand).toBe('both');
  });

  it('an honest miss', () => {
    const env = expectSame('ACGTACGTACGTACGTACGT', seq(7, 3000).replace(/ACGTACGTACGTACGTACGT/g, 'TTTT'), { bothStrands: true, limit: 500 });
    expect(env.occurrences).toEqual([]);
    expect(env.locationCount).toBe(0);
    expect(env.bestIndex).toBe(-1);
  });

  it('degenerate target: N never matches', () => {
    const target = `${seq(11, 300)}ACGTNNACGT${seq(12, 300)}`;
    expectSame('ACGTNNACGT'.replace(/N/g, 'A'), target, { bothStrands: true, limit: 500 });
    expectSame('ACGT', target, { bothStrands: true, limit: 500 });
  });

  it('a fully mixed IUPAC target', () => {
    const target = seq(13, 2000, 'ACGTNRYSWKMBDHV');
    expectSame('ACGT', target, { bothStrands: true, limit: 500 });
    expectSame(seq(14, 25), target, { bothStrands: true, limit: 500 });
  });

  it('one strand versus two', () => {
    const target = seq(555, 2000);
    const q = target.slice(100, 130);
    expectSame(q, target, { bothStrands: false, limit: 500 });
    expectSame(q, target, { bothStrands: true, limit: 500 });
  });

  it('circular: a query longer than the molecule creates no artificial wrap hit', () => {
    const small = 'ACGTACGT';
    const q = `${small}${small}ACG`;                 // longer than the molecule
    const env = expectSame(q, small, { bothStrands: true, circular: true, limit: 500 });
    expect(env.occurrences).toEqual([]);
  });

  it('circular: a query exactly the length of the molecule', () => {
    const small = seq(77, 40);
    expectSame(small, small, { bothStrands: true, circular: true, limit: 500 });
  });

  it('circular topology off — no origin-crossing hit appears', () => {
    const q = seq(88, 30);
    const rotated = q.slice(15) + seq(89, 500) + q.slice(0, 15);
    const env = expectSame(q, rotated, { bothStrands: true, circular: false, limit: 500 });
    expect(env.occurrences).toEqual([]);
  });
});

describe('U6-E1 — literal exact vs the previous path: truncation', () => {
  it('the cap preserves the locus count and the winner', () => {
    // 40 tandem copies, cap of 7: the payload shrinks, `locationCount` must not.
    const unit = 'ACGTTGCA';
    const target = `${seq(21, 200)}${unit.repeat(40)}${seq(22, 200)}`;
    const env = expectSame(unit, target, { bothStrands: false, limit: 7 });
    expect(env.occurrences.length).toBe(7);
    expect(env.locationCount).toBeGreaterThan(7);
    expect(env.bestIndex).toBeGreaterThanOrEqual(0);
    expect(env.bestIndex).toBeLessThan(7);
  });

  it('cap 1', () => {
    const unit = 'ACGTTGCA';
    expectSame(unit, `${unit.repeat(12)}`, { bothStrands: true, limit: 1 });
  });
});

describe('U6-E1 — literal exact: typed refusals and degenerate inputs', () => {
  it('an empty query and an empty target give an empty envelope, not a throw', () => {
    expect(literalExact('', 'ACGT')).toEqual({
      occurrences: [], locationCount: 0, bestIndex: -1, incomplete: false, reason: null,
    });
    expect(literalExact('ACGT', '')).toEqual({
      occurrences: [], locationCount: 0, bestIndex: -1, incomplete: false, reason: null,
    });
  });

  it('never reports incomplete: a literal pass has no budget to exhaust', () => {
    const target = `${'A'.repeat(200000)}`;
    const s = literalExact('AAAAAAAAAA', target, { bothStrands: true, limit: 10 });
    expect(s.incomplete).toBe(false);
    expect(s.reason).toBeNull();
    expect(s.locationCount).toBeGreaterThan(10);
  });

  it('the generator really suspends — otherwise cancellation is unobservable', () => {
    const target = 'A'.repeat(400000);
    const it2 = literalExactSessionSteps('AAAA', target, { bothStrands: true, limit: 5 });
    let suspensions = 0;
    let step = it2.next();
    while (!step.done) { suspensions += 1; step = it2.next(); }
    expect(suspensions).toBeGreaterThan(5);
  });
});

describe('U6-E1 — literal exact vs the previous path: randomised sweep', () => {
  it('200 randomised cases agree in full', () => {
    for (let i = 0; i < 200; i += 1) {
      const n = 200 + (i * 37) % 1800;
      const target = seq(1000 + i, n, i % 5 === 0 ? 'ACGTN' : 'ACGT');
      const m = 1 + ((i * 13) % 60);
      const from = (i * 29) % Math.max(1, n - m);
      const q = (i % 3 === 0 ? seq(90000 + i, m) : target.slice(from, from + m)).replace(/[^ACGT]/g, 'A');
      if (!q) continue;
      const opts = {
        bothStrands: i % 2 === 0,
        circular: i % 4 === 0,
        limit: [1, 5, 500][i % 3],
      };
      const a = shapeOf(engineExact(q, target, opts));
      const b = shapeOf(literalExact(q, target, opts));
      expect({ i, ...b }).toEqual({ i, ...a });
    }
  });
});
