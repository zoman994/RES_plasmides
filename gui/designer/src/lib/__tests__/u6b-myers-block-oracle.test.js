/**
 * U6-B — the block-vector scanner answers exactly what the BigInt scanner answered.
 *
 * WHY THE COMPARISON REACHES INSIDE THE SCANNER. End-to-end parity is the wrong instrument for this
 * change. The failure a block-Myers port actually has is a wrong `hbit` on the last word or a carry
 * that does not cross a word boundary, and both of those usually produce EXTRA candidate starts. The
 * verifier downstream discards extras, so occurrences stay identical and the suite stays green while
 * the scan quietly does more work — and the same defect, on a different input, drops a candidate
 * instead. So the assertions below are against the scanner's own output: the whole end-distance
 * array and the exact/approx start sets, position by position.
 *
 * The reference is `_myers-bigint-oracle` — a frozen copy of the recurrence being replaced, imported
 * only by tests. Comparing against a hand-written expected array would only prove that someone
 * copied today's behaviour into a file.
 *
 * WORD BOUNDARIES ARE THE POINT of the length list: 31/32/33, 63/64/65, 95/96/97 sit either side of
 * every word edge, and 99/100 are the live product boundary.
 */
import { describe, it, expect } from 'vitest';
import {
  myersEndDistances, scanCandidateStarts, scanCandidateStartsSplit,
  scanCandidateStartsSteps, scanCandidateStartsSplitSteps,
} from '../dna-approx-scan';
import { makeMeter, resolveBudgets } from '../dna-search-budget';
import { drainSync } from '../dna-search-cooperative';
import {
  oracleEndDistances, oracleCandidateStarts, oracleCandidateStartsSplit,
} from './_myers-bigint-oracle';
import { seqMatch } from '../seq-match';
import {
  SEQUENCE_KERNEL, setSequenceKernelForBenchmark, resetSequenceKernel,
} from '../sequence-kernel-seam';

/** Deterministic PRNG — the fuzz has to be reproducible or a failure cannot be re-run. */
const rng32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function seq(seed, n, alphabet = 'ACGT') {
  const r = rng32(seed);
  let s = '';
  for (let i = 0; i < n; i += 1) s += alphabet[(r() * alphabet.length) | 0];
  return s;
}

/** Every word-boundary length that matters, plus the live product boundary. */
const LENGTHS = [1, 30, 31, 32, 33, 63, 64, 65, 95, 96, 97, 99, 100];

describe('U6-B · end distances — the whole array, at every word boundary', () => {
  for (const m of LENGTHS) {
    it(`m=${m}: distance at EVERY position matches the BigInt sweep`, () => {
      const pattern = seq(1000 + m, m);
      // A target that contains the pattern twice, once perturbed, plus noise: distances vary across
      // the whole range instead of sitting at the maximum everywhere.
      const noise = seq(2000 + m, 300);
      const perturbed = `${pattern.slice(0, m >> 1)}T${pattern.slice((m >> 1) + 1)}`;
      const text = `${noise}${pattern}${seq(3000 + m, 120)}${perturbed}${noise}`;
      expect(myersEndDistances(pattern, text)).toEqual(oracleEndDistances(pattern, text));
    });
  }

  it('an empty pattern is distance 0 everywhere, exactly as before', () => {
    const text = seq(7, 200);
    expect(myersEndDistances('', text)).toEqual(oracleEndDistances('', text));
  });

  it('symbols the pattern does not contain match NOTHING — never everything', () => {
    // The literal-equality rule: a run of `N` must raise the distance, not mask it. A wrong
    // «unknown = wildcard» would show up here as a lower distance than the oracle reports.
    const pattern = 'ACGTACGTACGTACGTACGT';
    const text = `${seq(11, 60)}NNNNNNNNNN${pattern}NNNN${seq(12, 60)}`;
    expect(myersEndDistances(pattern, text)).toEqual(oracleEndDistances(pattern, text));
  });
});

describe('U6-B · candidate starts — exact and approximate, separately', () => {
  for (const m of LENGTHS) {
    it(`m=${m}: exact and approx start sets match the BigInt sweep`, () => {
      const pattern = seq(4000 + m, m);
      const k = Math.max(0, Math.floor(m * 0.2));
      const text = `${seq(5000 + m, 200)}${pattern}${seq(6000 + m, 80)}${pattern.slice(1)}${seq(7000 + m, 200)}`;
      const got = scanCandidateStartsSplit(pattern, text, k);
      const want = oracleCandidateStartsSplit(pattern, text, k);
      // Split first: a single merged set would hide a candidate that moved from exact to approximate.
      expect(got.exact, 'exact starts').toEqual(want.exact);
      expect(got.approx, 'approximate starts').toEqual(want.approx);
      // …and the union is what the single-threshold entry point returns.
      expect(scanCandidateStarts(pattern, text, k)).toEqual(oracleCandidateStarts(pattern, text, k));
    });
  }

  it('k = 0 and k >= m are both answered identically', () => {
    const pattern = seq(31, 40);
    const text = `${seq(32, 150)}${pattern}${seq(33, 150)}`;
    for (const k of [0, 1, 39, 40, 41]) {
      expect(scanCandidateStartsSplit(pattern, text, k), `k=${k}`)
        .toEqual(oracleCandidateStartsSplit(pattern, text, k));
    }
  });

  it('a pattern longer than the text + k is refused the same way', () => {
    expect(scanCandidateStartsSplit(seq(41, 50), seq(42, 10), 2))
      .toEqual(oracleCandidateStartsSplit(seq(41, 50), seq(42, 10), 2));
  });
});

describe('U6-B · the chunk size changes WHEN it suspends, never WHAT it answers', () => {
  const pattern = seq(51, 64);
  const text = `${seq(52, 500)}${pattern}${seq(53, 500)}`;
  const k = 12;

  for (const chunk of [1, 31, 8192, Infinity]) {
    it(`chunk=${chunk}: same starts as the un-chunked oracle`, () => {
      const split = drainSync(scanCandidateStartsSplitSteps(pattern, text, k, null, chunk));
      expect(split).toEqual(oracleCandidateStartsSplit(pattern, text, k));
      const union = drainSync(scanCandidateStartsSteps(pattern, text, k, null, chunk));
      expect(union).toEqual(oracleCandidateStarts(pattern, text, k));
    });
  }

  it('a chunk of 1 really does suspend once per position — the resumability the worker needs', () => {
    const gen = scanCandidateStartsSteps(pattern, text, k, null, 1);
    let steps = 0;
    let r = gen.next();
    while (!r.done) { steps += 1; if (steps > text.length + 10) break; r = gen.next(); }
    expect(steps).toBe(text.length - 1);
  });
});

describe('U6-B · budget semantics are unchanged', () => {
  const pattern = seq(61, 40);
  const text = `${seq(62, 400)}${pattern}${seq(63, 400)}`;

  it('one target position costs exactly one unit on scanUsed, scanPositions and legacy states', () => {
    const meter = makeMeter(resolveBudgets(null), 10_000_000);
    scanCandidateStartsSplit(pattern, text, 8, meter);
    expect(meter.scanUsed, 'scan axis').toBe(text.length);
    expect(meter.scanPositions, 'breakdown counter').toBe(text.length);
    expect(meter.states, 'legacy combined counter').toBe(text.length);
    expect(meter.limitedAxis).toBeNull();
  });

  it('an exhausted scan axis fails closed on the SCAN axis, not on another one', () => {
    const meter = makeMeter({ ...resolveBudgets(null), scan: 100 }, null);
    let code = null;
    let axis;
    try {
      scanCandidateStartsSplit(pattern, text, 8, meter);
    } catch (e) { code = e.code; axis = meter.limitedAxis; }
    expect(code).toBe('RESOURCE_LIMIT');
    expect(axis).toBe('scan');
  });
});

describe('U6-B · seeded differential fuzz', () => {
  it('300 random (query, target, k) cases agree with the BigInt sweep, position for position', () => {
    let checked = 0;
    for (let i = 0; i < 300; i += 1) {
      const r = rng32(90000 + i);
      const m = 1 + ((r() * 100) | 0);
      const n = m + ((r() * 400) | 0);
      const q = seq(100000 + i, m);
      // Every fourth case puts symbols outside ACGT into the TARGET — the unknown-glyph rule is
      // where a masking bug would hide, and it is invisible on a clean ACGT corpus.
      const alphabet = (i % 4 === 0) ? 'ACGTNRYU' : 'ACGT';
      const t = seq(200000 + i, n, alphabet);
      const k = (r() * (m + 1)) | 0;
      expect(scanCandidateStartsSplit(q, t, k), `case ${i} m=${m} n=${n} k=${k}`)
        .toEqual(oracleCandidateStartsSplit(q, t, k));
      checked += 1;
    }
    expect(checked).toBe(300);
  });

  it('60 random cases agree on the FULL end-distance array as well', () => {
    for (let i = 0; i < 60; i += 1) {
      const r = rng32(300000 + i);
      const m = 1 + ((r() * 100) | 0);
      const n = m + ((r() * 250) | 0);
      const q = seq(400000 + i, m);
      const t = seq(500000 + i, n, (i % 3 === 0) ? 'ACGTN' : 'ACGT');
      expect(myersEndDistances(q, t), `case ${i} m=${m} n=${n}`).toEqual(oracleEndDistances(q, t));
    }
  });
});

describe('U6-B · whole-session parity for both-strands and circular', () => {
  /**
   * The scanner comparisons above are per-strand and linear by construction. `both` and a circular
   * molecule are decided ABOVE the scanner — the reverse-complement probe, the bounded overlay, the
   * §2.6 merge — so they get their own check at the level where those decisions are made.
   *
   * BE PRECISE ABOUT WHAT THIS COMPARES. Since U6-B the linear kernel is no longer an independent
   * implementation: it runs the SAME `dna-myers-block` recurrence the production adapter runs, with a
   * forward traversal and the active-block cutoff. So these cases do not re-prove the arithmetic —
   * the frozen BigInt oracle above is the only independent reference in this file. What they do prove
   * is the GEOMETRY layered on top of that shared recurrence: that two callers which reverse-
   * complement, overlay a circle and merge strands differently still arrive at the same loci.
   */
  const withKernel = (kernel, fn) => {
    setSequenceKernelForBenchmark(kernel);
    try { return fn(); } finally { resetSequenceKernel(); }
  };
  const bio = (env) => env.occurrences.map((o) => ({
    segments: o.location.segments,
    strand: o.location.strand,
    wrapsOrigin: !!o.location.wrapsOrigin,
    identity: o.metrics.identity,
    substitutions: o.metrics.substitutions,
    insertions: o.metrics.insertions,
    deletions: o.metrics.deletions,
  }));

  const CASES = [
    {
      name: 'both strands at one palindromic locus',
      q: 'GAATTC',
      seq: () => ({ seq: `${seq(71, 300)}GAATTC${seq(72, 300)}`, topology: 'linear' }),
      ctx: { identityThreshold: 1, bothStrands: true },
    },
    {
      name: 'minus strand only, approximate',
      q: 'GAATTCACGTACGTACGTAC',
      seq: () => {
        const rc = 'GAATTCACGTACGTACGTAC'.split('').reverse()
          .map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' }[c])).join('');
        return { seq: `${seq(73, 300)}${rc.slice(0, 9)}A${rc.slice(10)}${seq(74, 300)}`, topology: 'linear' };
      },
      ctx: { identityThreshold: 0.8, bothStrands: true },
    },
    {
      name: 'circular molecule with a locus across the origin',
      q: 'GAATTCACGTACGT',
      seq: () => ({ seq: `ACGTACGT${seq(75, 400)}GAATTC`, topology: 'circular' }),
      ctx: { identityThreshold: 1, bothStrands: true, circular: true },
    },
    {
      name: 'circular, approximate, both strands',
      q: 'GAATTCACGTACGTACGT',
      seq: () => ({ seq: `ACGTACGTACGT${seq(76, 500)}GAATTC`, topology: 'circular' }),
      ctx: { identityThreshold: 0.85, bothStrands: true, circular: true },
    },
  ];

  for (const c of CASES) {
    it(`${c.name} — the two geometries over the shared recurrence agree`, () => {
      const target = c.seq();
      const prod = withKernel(SEQUENCE_KERNEL.PRODUCTION, () => seqMatch(c.q, target, null, c.ctx));
      const lin = withKernel(SEQUENCE_KERNEL.LINEAR, () => seqMatch(c.q, target, null, c.ctx));
      expect(bio(prod)).toEqual(bio(lin));
      expect(prod.locationCount).toBe(lin.locationCount);
    });
  }

  it('the wrap fixture really does wrap — otherwise the circular cases prove nothing', () => {
    const target = { seq: `ACGTACGT${seq(75, 400)}GAATTC`, topology: 'circular' };
    const env = withKernel(SEQUENCE_KERNEL.PRODUCTION, () => seqMatch('GAATTCACGTACGT', target, null, { identityThreshold: 1, bothStrands: true, circular: true }));
    expect(env.occurrences.some((o) => o.location.wrapsOrigin)).toBe(true);
  });
});

describe('U6-B · the oracle stays out of production', () => {
  it('nothing under src/lib imports the BigInt oracle', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = new URL('../', import.meta.url).pathname.replace(/^\//, '');
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (name === '__tests__' || name === 'node_modules') continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.jsx?$/.test(name)) continue;
        if (/_myers-bigint-oracle/.test(readFileSync(full, 'utf8'))) offenders.push(full);
      }
    };
    walk(root);
    expect(offenders, 'a test-only oracle imported by shipped code is a second algorithm').toEqual([]);
  });
});
