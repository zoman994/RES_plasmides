/**
 * K3.1 — the admissible threshold bound (§2.3).
 *
 * The bound drops a DP state when NO completion of it can still reach the threshold. That is a
 * claim about arithmetic, not about biology: the set of accepted alignments must be BYTE-IDENTICAL
 * with and without it. If a differential moves, the bound is wrong and the search has started
 * lying about molecules — not running faster.
 *
 * Two things this file has to prove, and they need different instruments:
 *
 *   1. CORRECTNESS — engine ≡ oracle, and specifically that a hit sitting EXACTLY on the
 *      threshold survives. `(M+r)·10000 < t·(L+r)` prunes on STRICT less-than; flipping it to
 *      `≤` would silently move the acceptance boundary by one basis point, which no ordinary
 *      «does it find the motif» test would notice.
 *
 *   2. THAT IT ACTUALLY PRUNES — and this is where a differential is useless: with an unlimited
 *      budget the bounded and unbounded searches return the same hits, so a mutation that
 *      disables the bound stays GREEN. The gate therefore runs both variants against a SMALL
 *      `stateBudget`: the bound must fit inside it, the unbounded search must not.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSearch, dnaGappedSearchSession, RESOURCE_LIMIT } from '../dna-gapped-search';
import { oracleSearchLinear, pruneEndpointShadows } from './helpers/glocal-oracle';

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const randFrom = (rnd, alphabet, len) => {
  let o = '';
  for (let i = 0; i < len; i++) o += alphabet[Math.floor(rnd() * alphabet.length)];
  return o;
};
const shape = (h) => ({
  start: h.start, end: h.end, subs: h.metrics.substitutions, ins: h.metrics.insertions,
  del: h.metrics.deletions, L: h.metrics.alignmentLength, script: h.script,
});
const oShape = (h) => ({
  start: h.targetStart, end: h.targetEnd, subs: h.X, ins: h.I, del: h.D, L: h.L, script: h.script,
});

describe('K3.1 — the bound does not change the answer', () => {
  it('DIFFERENTIAL: engine ≡ oracle across thresholds, with the bound live', () => {
    for (const [seed, tBps] of [[0x11, 10000], [0x22, 9000], [0x33, 8000], [0x44, 7000], [0x55, 6000]]) {
      const rnd = lcg(seed);
      let nonEmpty = 0;
      for (let n = 0; n < 150; n++) {
        const q = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 5));
        const t = randFrom(rnd, 'ACGT', 1 + Math.floor(rnd() * 10));
        const ref = pruneEndpointShadows(oracleSearchLinear(q, t, { thresholdBps: tBps })).map(oShape);
        const eng = dnaGappedSearch(q, t, { thresholdBps: tBps }).map(shape);
        expect(eng, `q=${q} t=${t} thr=${tBps}`).toEqual(ref);
        if (ref.length) nonEmpty += 1;
      }
      expect(nonEmpty, `thr=${tBps} produced no hits at all`).toBeGreaterThan(10);
    }
  });

  it('bounded and UNBOUNDED searches agree hit-for-hit (the bound is pure pruning)', () => {
    const rnd = lcg(0x99);
    for (let n = 0; n < 200; n++) {
      const q = randFrom(rnd, 'ACGT', 3 + Math.floor(rnd() * 6));
      const t = randFrom(rnd, 'ACGT', 6 + Math.floor(rnd() * 14));
      const thresholdBps = [6000, 7500, 8000, 9500][n % 4];
      const withBound = dnaGappedSearch(q, t, { thresholdBps }).map(shape);
      const without = dnaGappedSearch(q, t, { thresholdBps, disableThresholdBound: true }).map(shape);
      expect(withBound, `q=${q} t=${t} thr=${thresholdBps}`).toEqual(without);
    }
  });

  it('EQUALITY SURVIVES: a hit exactly ON the threshold is still returned', () => {
    // 4 matches + 1 substitution = 4/5 = exactly 80.00%. At thresholdBps 8000 this must pass;
    // pruning on `≤` instead of `<` would drop the very state that produces it.
    const [hit] = dnaGappedSearch('ACGTA', 'TTACGTTTT', { thresholdBps: 8000 });
    expect(hit, 'the 80.00% hit must not be pruned at threshold 80.00%').toBeTruthy();
    expect(hit.metrics.exactMatches).toBe(4);
    expect(hit.metrics.alignmentLength).toBe(5);
    expect(hit.metrics.identity).toBeCloseTo(0.8, 12);
    // …and one basis point higher it legitimately disappears — the boundary is where it says.
    expect(dnaGappedSearch('ACGTA', 'TTACGTTTT', { thresholdBps: 8001 })).toHaveLength(0);
  });

  it('EXHAUSTIVE: every query≤3 × target≤4 over ACGT, bounded ≡ unbounded, at 3 thresholds', () => {
    // Random sampling can miss the adversarial shape that breaks an admissibility argument. This
    // enumerates the whole small space instead — ~28.5k pairs × 3 thresholds — so a bound that is
    // wrong for ANY short configuration has nowhere to hide. Short inputs are where the pruning
    // decision is tightest (r is a large fraction of L), which is exactly where it would break.
    const alpha = 'ACGT';
    const words = (maxLen) => {
      const out = [];
      const rec = (s) => {
        if (s.length) out.push(s);
        if (s.length === maxLen) return;
        for (const c of alpha) rec(s + c);
      };
      rec('');
      return out;
    };
    const queries = words(3);
    const targets = words(4);
    let compared = 0; let withHits = 0;
    for (const tBps of [10000, 8000, 6000]) {
      for (const q of queries) {
        for (const t of targets) {
          const on = dnaGappedSearch(q, t, { thresholdBps: tBps }).map(shape);
          const off = dnaGappedSearch(q, t, { thresholdBps: tBps, disableThresholdBound: true }).map(shape);
          expect(on, `q=${q} t=${t} thr=${tBps}`).toEqual(off);
          compared += 1;
          if (on.length) withHits += 1;
        }
      }
    }
    expect(compared).toBe(queries.length * targets.length * 3);
    expect(withHits, 'the sweep must contain real hits, not only empty answers').toBeGreaterThan(1000);
  }, 300_000);

  it('EQUALITY SURVIVES at other exact ratios too (9/10 = 90.00%, 100%)', () => {
    const nine = dnaGappedSearch('ACGTACGTAC', 'TTACGTACGTTCTT', { thresholdBps: 9000 });
    expect(nine.some((h) => h.metrics.exactMatches === 9 && h.metrics.alignmentLength === 10)).toBe(true);
    const exact = dnaGappedSearch('ACGTACGT', 'TTACGTACGTTT', { thresholdBps: 10000 });
    expect(exact.some((h) => h.metrics.identity === 1)).toBe(true);
  });
});

describe('K3.1 — MUTATION GATE: the bound must actually prune', () => {
  // A budget chosen so the two variants land on OPPOSITE sides of it. Both assertions are made,
  // so this cannot rot quietly: if the bound stops pruning, the first fails; if the engine gets
  // so much cheaper that even the unbounded run fits, the second fails and the budget needs
  // re-picking. Neither may be "fixed" by raising the budget — that is the whole gate.
  const rnd = lcg(0xDEC0DE);
  let target = '';
  for (let i = 0; i < 4000; i++) target += 'ACGT'[(rnd() * 4) | 0];
  const probe = target.slice(1500, 1530); // 30 nt, present verbatim
  // MEASURED on this exact fixture: ~17k DP states with the bound, ~177k without (plus ~4k scan
  // positions, which the budget also counts). 60k sits between them with ~3x headroom on each
  // side, so neither assertion is balanced on a knife edge.
  const STATE_BUDGET = 60_000;

  it('WITH the bound the search completes inside a small budget and finds the locus', () => {
    const s = dnaGappedSearchSession(probe, target, {
      thresholdBps: 8000, stateBudget: STATE_BUDGET, collectStats: true,
    });
    expect(s.incomplete, 'the bound should keep this inside budget').toBe(false);
    expect(s.occurrences.some((h) => h.start === 1500)).toBe(true);
    expect(s.stats.boundPruned, 'the bound must have refused states').toBeGreaterThan(0);
  });

  it('WITHOUT the bound the same search on the same budget hits RESOURCE_LIMIT', () => {
    const s = dnaGappedSearchSession(probe, target, {
      thresholdBps: 8000, stateBudget: STATE_BUDGET, disableThresholdBound: true, collectStats: true,
    });
    expect(s.incomplete, 'disabling the bound must be observable').toBe(true);
    expect(s.reason).toBe(RESOURCE_LIMIT);
    expect(s.occurrences).toEqual([]);
    expect(s.stats.boundPruned).toBe(0);
  });

  it('…and with an unlimited budget BOTH variants return the same hits — hence the gate above', () => {
    // This is the test that proves a plain differential could never catch the mutation.
    const on = dnaGappedSearch(probe, target, { thresholdBps: 8000, stateBudget: null }).map(shape);
    const off = dnaGappedSearch(probe, target, {
      thresholdBps: 8000, stateBudget: null, disableThresholdBound: true,
    }).map(shape);
    expect(on).toEqual(off);
    expect(on.length).toBeGreaterThan(0);
  });
});
