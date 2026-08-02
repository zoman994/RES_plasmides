/**
 * dna-linear-verify.test.js — VERIFY responsibility of the EXPERIMENTAL linear/Dinkelbach kernel:
 * exact per-start verification (src/lib/dna-linear-verify.js — StartSolver, solveStart, the
 * comparators). Spec: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §2.1, §2.3, §2.4, §3.2, §4.2.1(3).
 *
 * WHAT IS PROVEN HERE. The identity boundary is INTEGER arithmetic (M/L cross-multiplied against
 * the threshold, no float drift), the I/D/gapEvents accounting matches §2.4, and every emitted
 * occurrence is internally consistent: counts sum to alignmentLength, the script replays the gap
 * events, no leading/trailing D, identityBps == floor(M*10000/L), bounds and physical end hold.
 *
 * COMPARISON DISCIPLINE. Full-occurrence comparison via shape() from helpers/dna-linear-fixtures.js
 * — never identity alone. The oracle is deliberately NOT imported here; differential coverage lives
 * in dna-linear-differential.test.js, and the §3.2.1 plateau narrative in dna-linear-kernel.test.js.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-verify.test.js
 */

import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';
import { shape, shapes, lcg, randDna } from './helpers/dna-linear-fixtures';

describe('EXPERIMENTAL kernel §2.3/§2.4 — the identity boundary is integer', () => {
  const BASE = 'ACGTTGCAATCGGATCCTTA';          // 20 nt
  const CTX = `GGGG${BASE}GGGG`;
  const flip = (str, positions) => {
    const a = str.split('');
    for (const p of positions) a[p] = a[p] === 'A' ? 'C' : 'A';
    return a.join('');
  };

  it('exact 20-mer -> 100%, start 4, span 20, all-match script', () => {
    const got = findOccurrences(BASE, CTX, { thresholdBps: 8000, bothStrands: false });
    expect(shapes(got)).toEqual([
      `+|s=4|span=20|e=24|M=20|X=0|I=0|D=0|ev=0|L=20|bps=10000|${'='.repeat(20)}`,
    ]);
  });

  it('4 substitutions of 20 = exactly 80,00% -> PASSES with bps exactly 8000', () => {
    const q = flip(BASE, [1, 6, 11, 17]);
    const got = findOccurrences(q, CTX, { thresholdBps: 8000, bothStrands: false });
    expect(got.length, 'exactly 80,00% must pass — no float drift').toBe(1);
    expect(got[0].identityBps).toBe(8000);
    expect(got[0].M).toBe(16);
    expect(got[0].X).toBe(4);
    expect(got[0].alignmentLength).toBe(20);
  });

  it('the same 8000 bps alignment is REJECTED one basis point above, at 8001', () => {
    const q = flip(BASE, [1, 6, 11, 17]);
    // A literal 79,99% identity is unreachable at these lengths: with L = 20 the achievable
    // ratios are multiples of 500 bps, and floor(M*10000/L) can only land in [7999,8000) once
    // L >= 10000. So the sub-threshold side of the boundary is probed from the threshold side —
    // it is the same integer cross-multiplication either way.
    expect(findOccurrences(q, CTX, { thresholdBps: 8001, bothStrands: false })).toEqual([]);
  });

  it('5 substitutions of 20 = 75% -> absent at 80%, present at 75%', () => {
    const q = flip(BASE, [1, 6, 11, 17, 19]);
    expect(findOccurrences(q, CTX, { thresholdBps: 8000, bothStrands: false })).toEqual([]);
    const at75 = findOccurrences(q, CTX, { thresholdBps: 7500, bothStrands: false });
    expect(at75.length).toBe(1);
    expect(at75[0].identityBps).toBe(7500);
  });

  it('§2.4 one extra query base -> 20/21 = 9523 bps with exactly one I', () => {
    const q = `${BASE.slice(0, 10)}G${BASE.slice(10)}`;
    const got = findOccurrences(q, CTX, { thresholdBps: 8000, bothStrands: false });
    expect(got.length).toBe(1);
    expect([got[0].M, got[0].I, got[0].D, got[0].alignmentLength, got[0].identityBps])
      .toEqual([20, 1, 0, 21, 9523]);
    expect(got[0].gapEvents).toBe(1);
  });

  it('§2.4 one extra target base -> 20/21 = 9523 bps with exactly one D', () => {
    const target = `GGGG${BASE.slice(0, 10)}G${BASE.slice(10)}GGGG`;
    const got = findOccurrences(BASE, target, { thresholdBps: 8000, bothStrands: false });
    expect(got.length).toBe(1);
    expect([got[0].M, got[0].I, got[0].D, got[0].alignmentLength, got[0].identityBps])
      .toEqual([20, 0, 1, 21, 9523]);
    expect(got[0].gapEvents).toBe(1);
  });

  it('§2.4 a 3-base contiguous target gap -> 3 indel bases, 1 indel event', () => {
    const target = `GG${BASE.slice(0, 9)}TTT${BASE.slice(9)}GG`;
    const got = findOccurrences(BASE, target, { thresholdBps: 8000, bothStrands: false });
    expect(got.length).toBe(1);
    expect(got[0].D).toBe(3);
    expect(got[0].gapEvents, 'three contiguous D are ONE event').toBe(1);
    expect(got[0].script).toContain('DDD');
  });
});

describe('structural invariants of every occurrence the kernel emits', () => {
  it('counts, script replay, flank rules and bounds hold over a deterministic corpus', () => {
    const rnd = lcg(13579);
    let checked = 0;
    for (let trial = 0; trial < 600; trial++) {
      const q = randDna(rnd, 1 + ((rnd() * 12) | 0));
      const t = randDna(rnd, 1 + ((rnd() * 40) | 0));
      const circular = rnd() < 0.5;
      const thresholdBps = [5000, 7000, 8000, 9000, 10000][(rnd() * 5) | 0];
      for (const o of findOccurrences(q, t, { thresholdBps, circular, bothStrands: true })) {
        const label = `q=${q} t=${t} thr=${thresholdBps} circ=${circular} ${shape(o)}`;
        const L = o.M + o.X + o.I + o.D;
        expect(L, label).toBe(o.alignmentLength);
        expect(o.script.length, label).toBe(L);
        expect(o.M + o.X + o.I, `${label} (query fully aligned, §2.1)`).toBe(q.length);
        expect(o.M + o.X + o.D, `${label} (target span)`).toBe(o.targetSpan);
        expect(o.script[0], `${label} (no leading D, §3.2)`).not.toBe('D');
        expect(o.script[o.script.length - 1], `${label} (no trailing D)`).not.toBe('D');
        expect(o.identityBps, label).toBe(Math.floor((o.M * 10000) / L));
        expect(o.identityBps >= thresholdBps, `${label} (threshold)`).toBe(true);
        expect(o.start >= 0 && o.start < t.length, `${label} (start bounds)`).toBe(true);
        expect(o.targetSpan <= t.length, `${label} (no second lap)`).toBe(true);
        const expectedEnd = circular
          ? (o.start + o.targetSpan) % t.length
          : o.start + o.targetSpan;
        expect(o.end, `${label} (physical end)`).toBe(expectedEnd);
        // gapEvents replayed from the script itself
        let events = 0;
        for (let k = 0; k < o.script.length; k++) {
          const op = o.script[k];
          if ((op === 'I' || op === 'D') && (k === 0 || o.script[k - 1] !== op)) events += 1;
        }
        expect(events, `${label} (gapEvents replay)`).toBe(o.gapEvents);
        checked += 1;
      }
    }
    expect(checked, 'the corpus must actually produce occurrences').toBeGreaterThan(100);
  }, 120_000);

  it('results are deterministic and sorted by (strand, start)', () => {
    const q = 'ACGTAC';
    const t = 'TACGTTACGTACGGACGTAC';
    const opts = { thresholdBps: 7000, circular: true, bothStrands: true };
    const a = shapes(findOccurrences(q, t, opts));
    const b = shapes(findOccurrences(q, t, opts));
    expect(a).toEqual(b);
    const plus = findOccurrences(q, t, opts).filter((o) => o.strand === '+');
    const minus = findOccurrences(q, t, opts).filter((o) => o.strand === '-');
    expect(findOccurrences(q, t, opts).map((o) => o.strand))
      .toEqual([...plus.map(() => '+'), ...minus.map(() => '-')]);
    for (const list of [plus, minus]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].start > list[i - 1].start, 'starts strictly increase per strand').toBe(true);
      }
    }
  });
});
