/**
 * The oracle validates the engine — so something must validate the oracle.
 *
 * Two layers:
 *   1. DIFFERENTIAL: the Pareto DP must agree with `microBrute` (literal enumeration) on every
 *      small case. This is what catches a wrong dominance relation — the failure mode that
 *      would otherwise make the reference silently lie and take all of K1 down with it.
 *   2. CONTRACT: the numbers SPEC_GAPPED_DNA_SEARCH §2.4 works out by hand.
 *
 * Honesty note (Игорь, K0 review): the helper was written before this file, so this sub-step
 * was NOT TDD-first. It is test-only code, and the compensation is exactly what is here — a
 * second independent reference, differential agreement, and the mutation checks below.
 */
import { describe, it, expect } from 'vitest';
import {
  oracleSearchLinear, bestForSpan, microBrute, columnOp, ratioBps, compareCanonical,
  ORACLE_LIMITS,
} from './helpers/glocal-oracle';

/** Deterministic LCG — a flaky oracle test would be worse than none. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function randSeq(rnd, len, alphabet) {
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(rnd() * alphabet.length)];
  return out;
}

describe('oracle — DIFFERENTIAL: Pareto DP === literal brute force', () => {
  /**
   * `null` from BOTH references is a legitimate, common answer: with the query fully aligned and
   * no leading/trailing D allowed, a short query against a long span simply has no legal
   * alignment (q='A' vs t='GGGGG' — every D is either leading or trailing). What must never
   * happen is the two references DISAGREEING about it.
   */
  const differential = (cases, qAlphabet, tAlphabet, qMax, tMax, seed) => {
    const rnd = lcg(seed);
    let bothNull = 0; let compared = 0;
    for (let n = 0; n < cases; n++) {
      const q = randSeq(rnd, 1 + Math.floor(rnd() * qMax), qAlphabet);
      const t = randSeq(rnd, 1 + Math.floor(rnd() * tMax), tAlphabet);
      const brute = microBrute(q, t);
      const dp = bestForSpan(q, t, 0, t.length);
      if (!brute && !dp) { bothNull += 1; continue; }
      expect(!!dp, `only brute found an alignment: q=${q} t=${t}`).toBe(!!brute);
      expect({ M: dp.M, X: dp.X, I: dp.I, D: dp.D, s: dp.script, g: dp.indelEvents },
        `q=${q} t=${t}`)
        .toEqual({
          M: brute.M, X: brute.X, I: brute.I, D: brute.D,
          s: brute.script, g: brute.indelEvents,
        });
      compared += 1;
    }
    return { compared, bothNull };
  };

  it('agrees on 600 random concrete cases (query<=5, target<=7)', () => {
    const { compared } = differential(600, 'ACGT', 'ACGT', 5, 7, 20260717);
    expect(compared).toBeGreaterThan(50); // the run must actually exercise real alignments
  });

  it('agrees when the TARGET carries unknown glyphs (K3.0 §2.5 — they are plain mismatches)', () => {
    // The query is ACGT-only by contract, but a molecule in the library legitimately contains
    // `N` (or `U` in a badly-imported file). Both references must treat such a column as `X`,
    // never as a wildcard — otherwise a poly-N stretch would read as a perfect hit.
    const { compared } = differential(300, 'ACGT', 'ACGTNRYU', 5, 7, 4242);
    expect(compared).toBeGreaterThan(20);
  });
});

describe('oracle — REGRESSION: the two cases that caught the leading/trailing-D bug', () => {
  // These were found by a random seed. Pinned here so they can never silently stop being
  // covered: both are cases where an ILLEGAL candidate (leading `D`) Pareto-dominates the legal
  // one, so pruning threw the legal alignment away and the winner was then filtered out.
  it('AC vs GGTAA — DP must find the legal XDDDX, not collapse to null', () => {
    const dp = bestForSpan('AC', 'GGTAA', 0, 5);
    const brute = microBrute('AC', 'GGTAA');
    expect(dp).toBeTruthy();
    expect(dp.script).toBe('XDDDX'); // pinned literally, not just "== brute"
    expect(brute.script).toBe('XDDDX');
    expect(dp.script.startsWith('D')).toBe(false);
    expect(dp.script.endsWith('D')).toBe(false);
  });

  it('TC vs NTG — DP must not prefer a longer edit script', () => {
    const dp = bestForSpan('TC', 'NTG', 0, 3);
    const brute = microBrute('TC', 'NTG');
    expect(dp.script).toBe('XDX'); // pinned; the buggy DP produced the longer XDDI
    expect(brute.script).toBe('XDX');
    expect(dp.editDistance).toBe(3); // X + X + D = 2 substitutions + 1 deletion
  });
});

describe('oracle — deterministic state budget (no wall-clock)', () => {
  // The first Pareto draft kept every distinct `script` per numeric vector, so equivalent paths
  // multiplied combinatorially: 20x20 took 92 s. Budget is asserted in STATES, not seconds —
  // a timing assertion would be flaky on a loaded machine and would not name the cause.
  it('a mixed 12x12 span stays far below the state budget', () => {
    const stats = {};
    bestForSpan('ACGTACGTACGT', 'ACGTAGCTACGT', 0, 12, { stats });
    expect(stats.accountedStates).toBeLessThan(ORACLE_LIMITS.MAX_STATES);
    expect(stats.accountedStates).toBeLessThan(4000); // lex-min dedup keeps cells tiny
    // peak (simultaneously held) is even smaller and is a DIFFERENT number from accounted.
    expect(stats.peakStates).toBeLessThanOrEqual(stats.accountedStates);
    expect(stats.peakStates).toBeGreaterThan(0);
  });

  it('the per-span budget branch is REACHABLE and enforced (injectable small budget)', () => {
    // The size guard (24x48) would otherwise fire first, leaving `state budget exceeded` dead —
    // its mutation would stay GREEN. A tiny injected budget forces the branch on a legal input.
    expect(() => bestForSpan('ACGTA', 'ACGTACG', 0, 7, { budget: 5 }))
      .toThrow(/state budget exceeded/);
    // …and a generous budget on the same input completes.
    expect(() => bestForSpan('ACGTA', 'ACGTACG', 0, 7, { budget: 100000 })).not.toThrow();
  });

  it('the AGGREGATE budget bounds the WHOLE search, not one span', () => {
    // Each span alone is cheap, but a full search runs O(targetLen^2) of them. A tiny aggregate
    // budget must trip even though no single span would.
    expect(() => oracleSearchLinear('ACGT', 'ACGTACGTACGT', { thresholdBps: 5000, aggregateBudget: 20 }))
      .toThrow(/aggregate state budget exceeded/);
    // A normal search stays under the real aggregate ceiling.
    expect(() => oracleSearchLinear('ACGT', 'ACGTACGTACGT', { thresholdBps: 5000 })).not.toThrow();
  });

  it('same numeric vector + lastOp keeps exactly ONE script (the lex-min one)', () => {
    const stats = {};
    bestForSpan('AAAAA', 'AAAAA', 0, 5, { stats });
    expect(stats.accountedStates).toBeLessThan(200);
  });
});

describe('oracle — s/e validation', () => {
  it.each([
    ['non-integer s', 1.5, 4],
    ['non-integer e', 0, 3.2],
    ['negative s', -1, 4],
    ['e beyond target', 0, 99],
    ['s > e', 3, 1],
  ])('rejects %s', (_label, s, e) => {
    expect(() => bestForSpan('ACGT', 'ACGTACGT', s, e)).toThrow(/span/i);
  });

  it('accepts the degenerate but legal empty span', () => {
    expect(() => bestForSpan('ACGT', 'ACGTACGT', 2, 2)).not.toThrow();
  });
});

describe('oracle — DIFFERENTIAL over the FULL search, not one span', () => {
  /**
   * INDEPENDENT §3.2 comparator, written from the spec here in the test — it deliberately does
   * NOT call `compareCanonical`, so the reference search shares no ranking code with the thing
   * under test. Returns <0 if `a` is the canonical winner.
   */
  const canonCmp = (a, b) => {
    if (a.M * b.L !== b.M * a.L) return b.M * a.L - a.M * b.L; // 1 identity ratio
    if (a.M !== b.M) return b.M - a.M;                       // 2 more matched bases
    if (a.editDistance !== b.editDistance) return a.editDistance - b.editDistance; // 3
    if (a.indelEvents !== b.indelEvents) return a.indelEvents - b.indelEvents;     // 4
    const da = Math.abs(a.targetSpan - a.queryLength);
    const db = Math.abs(b.targetSpan - b.queryLength);
    if (da !== db) return da - db;                           // 5
    if (a.targetEnd !== b.targetEnd) return a.targetEnd - b.targetEnd;             // 6
    return a.script < b.script ? -1 : a.script > b.script ? 1 : 0;                 // 7
  };

  /** Reference: enumerate every span with microBrute, rank by the independent comparator. */
  const bruteSearch = (q, t, thresholdBps) => {
    // Assert, not silently skip: a case outside the brute cap must be a test-generation bug,
    // not a quietly-uncompared pair (which would inflate the "agrees" count with nothing).
    if (q.length > 5 || t.length > 7) {
      throw new Error(`bruteSearch fixture out of cap: q=${q}(${q.length}) t=${t}(${t.length})`);
    }
    const byStart = new Map();
    for (let s = 0; s <= t.length; s++) {
      for (let e = s; e <= t.length; e++) {
        const sc = microBrute(q, t.slice(s, e), s);
        if (!sc || sc.acceptBps < thresholdBps) continue;
        const prev = byStart.get(s);
        if (!prev || canonCmp(sc, prev) < 0) byStart.set(s, sc);
      }
    }
    return [...byStart.values()].sort((a, b) => a.targetStart - b.targetStart);
  };

  it('oracleSearchLinear === span-by-span brute force (independent comparator)', () => {
    const rnd = lcg(99001);
    let compared = 0; let nonEmptyCases = 0; let totalHits = 0;
    for (let n = 0; n < 150; n++) {
      // Generation kept strictly inside the brute cap so bruteSearch never throws.
      const q = randSeq(rnd, 1 + Math.floor(rnd() * 4), 'ACGT'); // 1..5
      const t = randSeq(rnd, 1 + Math.floor(rnd() * 6), 'ACGT'); // 1..7
      const ref = bruteSearch(q, t, 5000);
      const got = oracleSearchLinear(q, t, { thresholdBps: 5000 });
      expect(got.map((h) => `${h.targetStart}:${h.targetEnd}:${h.script}`), `q=${q} t=${t}`)
        .toEqual(ref.map((h) => `${h.targetStart}:${h.targetEnd}:${h.script}`));
      compared += 1;
      if (ref.length) { nonEmptyCases += 1; totalHits += ref.length; }
    }
    expect(compared).toBe(150);          // every generated case was actually compared
    expect(nonEmptyCases).toBeGreaterThan(40); // and a real number produced ≥1 hit…
    expect(totalHits).toBeGreaterThan(60);     // …so the agreement is not vacuous
  });
});

describe('oracle — guards are on every public entry', () => {
  it('microBrute refuses anything above 5x7 instead of hanging', () => {
    expect(() => microBrute('ACGTAC', 'ACGTACG')).toThrow(/test-only/);
    expect(() => microBrute('ACGTA', 'ACGTACGT')).toThrow(/test-only/);
  });
  it('bestForSpan and oracleSearchLinear are guarded too (no bypass)', () => {
    const long = 'A'.repeat(600);
    expect(() => bestForSpan('ACGT', long, 0, 600)).toThrow(/test-only/);
    expect(() => oracleSearchLinear('ACGT', long)).toThrow(/test-only/);
    expect(() => bestForSpan(null, 'ACGT', 0, 4)).toThrow(TypeError);
  });
});

describe('oracle — §2.4 control examples', () => {
  const CORE20 = 'ACGTACGTACGTACGTACGT';

  // The 20-mer cases align the WHOLE query against ONE prescribed span (the flanks are fixed),
  // so they call bestForSpan on that span instead of asking the full search to solve a 20xN
  // matrix at every start. That full-search path is what pushed the file into a load-dependent
  // timeout; §2.4 is a per-alignment contract, so a single span is the honest unit here.
  const alignAt = (query, target, s, e, mode) => bestForSpan(query, target, s, e, mode);

  it('20/20 exact → identity 1 (a real 20-mer)', () => {
    expect(CORE20).toHaveLength(20);
    const best = alignAt(CORE20, `TT${CORE20}TT`, 2, 22);
    expect(best.identity).toBe(1);
    expect(best.M).toBe(20);
    expect(best.L).toBe(20);
    expect(best.targetEnd).toBe(22);
    expect(best.editDistance).toBe(0);
  });

  it('query with ONE extra base → 20/21 = 95.24%, exactly 1 I, passes 80%', () => {
    const query = `${CORE20.slice(0, 10)}G${CORE20.slice(10)}`; // 21 nt
    expect(query).toHaveLength(21);
    const best = alignAt(query, `TT${CORE20}TT`, 2, 22); // span holds the 20 target bases
    expect(best.I).toBe(1);
    expect(best.D).toBe(0);
    expect(best.M).toBe(20);
    expect(best.L).toBe(21);
    expect(ratioBps(best.M, best.L)).toBe(9523); // 20/21 = 95.238% → floor 9523
  });

  it('target with ONE extra base → 20/21, exactly 1 D (mirror)', () => {
    const target = `TT${CORE20.slice(0, 10)}G${CORE20.slice(10)}TT`; // 21 target bases in [2,23)
    const best = alignAt(CORE20, target, 2, 23);
    expect(best.D).toBe(1);
    expect(best.I).toBe(0);
    expect(best.M).toBe(20);
    expect(best.L).toBe(21);
  });

  it('insertion and deletion cost the same ratio (symmetry)', () => {
    const ins = alignAt(`${CORE20.slice(0, 10)}G${CORE20.slice(10)}`, `TT${CORE20}TT`, 2, 22);
    const del = alignAt(CORE20, `TT${CORE20.slice(0, 10)}G${CORE20.slice(10)}TT`, 2, 23);
    expect(ratioBps(ins.M, ins.L)).toBe(ratioBps(del.M, del.L));
  });

  it('FOUR substitutions out of 20 → exactly 80.00%, PASSES', () => {
    // Built explicitly, then the substitution count is ASSERTED — the first draft's fixture
    // silently produced 3 because its leading A happened to match the target.
    const q = [...CORE20];
    for (const i of [0, 5, 10, 15]) {
      q[i] = CORE20[i] === 'A' ? 'C' : 'A'; // guaranteed different from the target base
    }
    const query = q.join('');
    const diffs = [...query].filter((c, i) => c !== CORE20[i]).length;
    expect(diffs).toBe(4); // the assertion the old fixture lacked

    const scored = bestForSpan(query, `TTTT${CORE20}TTTT`, 4, 24);
    expect(scored.X).toBe(4);
    expect(scored.M).toBe(16);
    expect(scored.L).toBe(20);
    expect(scored.acceptBps).toBe(8000);
    expect(scored.acceptBps >= 8000).toBe(true);
  });

  it('FIVE substitutions out of 20 → 75%, FAILS at 80%', () => {
    const q = [...CORE20];
    for (const i of [0, 4, 8, 12, 16]) q[i] = CORE20[i] === 'A' ? 'C' : 'A';
    const query = q.join('');
    expect([...query].filter((c, i) => c !== CORE20[i]).length).toBe(5);

    const scored = bestForSpan(query, `TTTT${CORE20}TTTT`, 4, 24);
    expect(scored.M).toBe(15);
    expect(scored.acceptBps).toBe(7500);
    expect(scored.acceptBps >= 8000).toBe(false);
  });

  it('80.00% passes, 79.99% does not — integer basis points, no float drift', () => {
    expect(ratioBps(16, 20)).toBe(8000);
    expect(ratioBps(7999, 10000)).toBe(7999);
    expect(0.1 + 0.7 >= 0.8).toBe(false); // the float trap this design avoids
  });
});

describe('oracle — boundary: a single target-only base at the 80% edge', () => {
  it('ACGT vs ACAGT at 8000 bps → ==D==, 4/5, end=5', () => {
    // The target carries one extra A (index 2). Aligning the whole 4-mer costs exactly one D:
    // A=A, C=C, [A]=D, G=G, T=T. That is 4/5 = 8000 bps — the threshold passes on the nose.
    const hits = oracleSearchLinear('ACGT', 'ACAGT', { thresholdBps: 8000 });
    const best = hits.find((h) => h.targetStart === 0);
    expect(best).toBeTruthy();
    expect(best.script).toBe('==D==');
    expect(best.M).toBe(4);
    expect(best.D).toBe(1);
    expect(best.L).toBe(5);
    expect(best.acceptBps).toBe(8000);
    expect(best.targetEnd).toBe(5);
  });

  it('the same case at 8001 bps just misses', () => {
    expect(oracleSearchLinear('ACGT', 'ACAGT', { thresholdBps: 8001 }))
      .toEqual([]);
  });
});

describe('oracle — query-global (§2.1): a perfect seed is NOT a hit', () => {
  it('a 5-nt exact seed of a 10-nt query does not pass 80%', () => {
    expect(oracleSearchLinear('ACGTACGTAC', 'TTTTACGTATTTT', { thresholdBps: 8000 })).toHaveLength(0);
  });
  it('every accepted hit aligns the FULL query', () => {
    const hits = oracleSearchLinear('ACGTAGCGTAC', 'TTACGTACGTACTT', { thresholdBps: 5000 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.M + h.X + h.I).toBe(h.queryLength);
      expect(h.M + h.X + h.D).toBe(h.targetSpan);
    }
  });
});

describe('oracle — column semantics (§2.2, §2.5 ACGT-only)', () => {
  it.each([
    ['A', 'A', '='], ['A', 'C', 'X'],
    // No wildcard column exists any more: a degenerate glyph on EITHER side is just a character
    // that either equals the other one or does not.
    ['N', 'A', 'X'], ['R', 'A', 'X'], ['A', 'N', 'X'], ['T', 'U', 'X'],
    ['N', 'N', '='],
  ])('columnOp(%s,%s) → %s', (q, t, expected) => {
    expect(columnOp(q, t)).toBe(expected);
  });

  it('a degenerate TARGET base is a mismatch, and identity stays a real number', () => {
    // Was: «identity null, compatibility real». There is no compatibility surrogate now — the
    // biologist is told 9/10, not «unknown, but compatible».
    const best = oracleSearchLinear('ACGTACGTAC', 'TTACGTNCGTACTT').find((h) => h.targetStart === 2);
    expect(best.identity).toBeCloseTo(0.9, 10);
    expect(best.X).toBe(1);
    expect(best).not.toHaveProperty('compatibility');
  });
});

describe('oracle — §3.2 canonical choice', () => {
  it('never emits a leading or trailing D', () => {
    for (const h of oracleSearchLinear('ACGT', 'TTACGTTT', { thresholdBps: 5000 })) {
      expect(h.script.startsWith('D')).toBe(false);
      expect(h.script.endsWith('D')).toBe(false);
    }
  });
  it('one occurrence per start', () => {
    const starts = oracleSearchLinear('ACGT', 'ACGTACGT', { thresholdBps: 7500 }).map((h) => h.targetStart);
    expect(new Set(starts).size).toBe(starts.length);
  });
  it('overlapping starts are all kept (AA in AAAA)', () => {
    expect(oracleSearchLinear('AA', 'AAAA', { thresholdBps: 10000 }).map((h) => h.targetStart))
      .toEqual([0, 1, 2]);
  });
  it('tie-break rule 7 compares the REAL edit script, not the routing skeleton', () => {
    // Two scores identical everywhere except the script text: `=` must sort before `X`.
    const base = {
      M: 1, X: 1, I: 0, D: 0, L: 2, editDistance: 1, indelEvents: 0,
      queryLength: 2, targetSpan: 2, targetEnd: 2,
    };
    const a = { ...base, script: '=X' };
    const b = { ...base, script: 'X=' };
    expect(compareCanonical(a, b)).toBeLessThan(0);
  });
});
