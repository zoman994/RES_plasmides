/**
 * K2e — deterministic benchmark for the gapped DNA engine (SEARCH-GAPPED-DNA §4.3).
 *
 * SPEC §4.3 forbids fragile wall-clock asserts in the ordinary unit suite, so this file asserts
 * only BEHAVIOUR — a large ordinary target is searched correctly and completely; a low-complexity
 * worst case terminates as a well-formed session (complete OR typed incomplete), never a hang or a
 * silent miss. Timings are measured and logged for the bench profile, not asserted.
 *
 * The 10 Mb stress ceiling is opt-in (BENCH_STRESS=1) so the default suite stays fast and
 * load-stable; running it prints wall-clock and rough heap so the number can be published
 * separately, as §4.3 requires.
 */
import { describe, it, expect } from 'vitest';
import { dnaGappedSearchSession, RESOURCE_LIMIT } from '../dna-gapped-search';

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function randDna(rnd, len) {
  const B = 'ACGT';
  const a = new Array(len);
  for (let i = 0; i < len; i++) a[i] = B[(rnd() * 4) | 0];
  return a.join('');
}

describe('K2e §4.3 — deterministic benchmark (behaviour, not fragile timing)', () => {
  it('1 Mb ordinary target: an implanted 30-mer is found exactly, session is complete', () => {
    const N = 1_000_000;
    const rnd = lcg(0x1000003);
    const bg = randDna(rnd, N);
    const implantAt = 500_000;
    const probe = 'ACGTCAGTGACTGCATCTGAACGTCAGTGA'; // 30 nt, non-degenerate
    const target = bg.slice(0, implantAt) + probe + bg.slice(implantAt + probe.length);

    const t0 = Date.now();
    const s = dnaGappedSearchSession(probe, target, { thresholdBps: 8000 });
    const ms = Date.now() - t0;

    expect(s.incomplete).toBe(false);
    expect(s.reason).toBeNull();
    const hit = s.occurrences.find((h) => h.start === implantAt);
    expect(hit).toBeTruthy();
    expect(hit.metrics.identity).toBe(1);
    expect(hit.metrics.alignmentLength).toBe(probe.length);
    console.log(`[bench] 1Mb ordinary, 30-mer @80%: ${ms} ms, ${s.occurrences.length} hit(s)`);
  }, 30_000);

  it('low-complexity worst case terminates as a well-formed session, never a hang or silent miss', () => {
    // A pathological low-complexity target: with a bounded budget the engine must EITHER finish
    // OR report a typed RESOURCE_LIMIT incomplete — but always in finite, deterministic work.
    const target = 'AC'.repeat(50_000); // 100 kb, maximally repetitive
    const t0 = Date.now();
    const s = dnaGappedSearchSession('ACACACACACACACAC', target, { thresholdBps: 7000, stateBudget: 200_000 });
    const ms = Date.now() - t0;

    expect(typeof s.incomplete).toBe('boolean');
    if (s.incomplete) {
      expect(s.reason).toBe(RESOURCE_LIMIT);
      expect(s.occurrences).toEqual([]);
    } else {
      // A complete low-complexity pass MUST have found the (many) real ACAC hits — a complete
      // session with an empty array would be a silent miss, not a valid result.
      expect(s.reason).toBeNull();
      expect(s.occurrences.length).toBeGreaterThan(0);
      expect(s.occurrences.some((h) => h.metrics.identity === 1)).toBe(true);
    }
    // determinism: same input → identical outcome
    expect(dnaGappedSearchSession('ACACACACACACACAC', target, { thresholdBps: 7000, stateBudget: 200_000 })).toEqual(s);
    console.log(`[bench] 100kb low-complexity, budget 200k: ${ms} ms, incomplete=${s.incomplete}`);
  }, 30_000);

  it('PROFILE 20/100/200/400 nt on 1 Mb — per-stage breakdown (§4.2.1)', () => {
    // Behaviour-only assertions; the numbers are LOGGED so a missed `<1 s` gate says WHERE the
    // time went (scan / scoring / traceback / pruning), not merely that it was slow. §4.2.0 caps
    // the interactive range at 400 nt, so the table stops there.
    const N = 1_000_000;
    const rnd = lcg(0x5EED);
    const bg = randDna(rnd, N);
    const implantAt = 500_000;
    const rows = [];
    for (const qLen of [20, 100, 200, 400]) {
      const probe = bg.slice(implantAt, implantAt + qLen);
      // Warm-up + best-of-3: a single wall-clock reading is far too noisy to compare against a
      // 1 s gate, and the JIT needs a pass before the numbers mean anything.
      dnaGappedSearchSession(probe, bg, { thresholdBps: 8000, collectStats: true });
      let s = null;
      for (let r = 0; r < 3; r++) {
        const run = dnaGappedSearchSession(probe, bg, { thresholdBps: 8000, collectStats: true });
        if (!s || run.stats.totalMs < s.stats.totalMs) s = run;
      }
      const st = s.stats;
      rows.push(st);
      // Either it completed and found the implanted locus, or it stopped with a TYPED reason.
      if (!s.incomplete) {
        expect(s.occurrences.some((h) => h.start === implantAt), `q=${qLen} implant`).toBe(true);
      } else {
        expect(s.reason).toBe(RESOURCE_LIMIT);
        expect(s.occurrences).toEqual([]);
      }
    }
    for (const r of rows) {
      console.log(`[profile] qLen=${r.queryLength} scanMs=${r.scanMs} rawStarts=${r.rawStarts} `
        + `alignCalls=${r.alignCalls} alignMs=${r.alignMs} attempts=${r.attempts} `
        + `accepted=${r.accepted} dup=${r.duplicates} rejDom=${r.rejectedDominated} `
        + `remDom=${r.removedDominated} peakFrontier=${r.peakFrontier} rule7=${r.rule7Compares} `
        + `parentLinks=${r.parentLinks} boundPruned=${r.boundPruned} arenaKB=${r.arenaKB} retained=${r.retainedLoci} `
        + `totalMs=${r.totalMs} ${r.reason ?? 'complete'}`);
    }
  }, 300_000);

  // MEASURED (18.07, pre-kernel): an UNCAPPED 400 nt alignment does not finish — it ran ~680 s
  // before hitting the test timeout. The 1 Mb profile above explains why: at 200/400 nt a SINGLE
  // `alignFromStart` consumes the whole 3 000 000-state budget in ~20 s. The cost is the
  // Pareto-set-per-cell (dozens of incomparable count vectors per cell, each carrying a script
  // string), not the number of alignments — `alignCalls` is 1. Kept opt-in until the §4.2.1
  // kernel replaces the Pareto set with a single score-only state per cell; it is the gate that
  // proves that work landed.
  it.runIf(globalThis.process?.env?.BENCH_UNCAPPED === '1')('PROFILE 400 nt on 50 kb — UNCAPPED cost split (opt-in)', () => {
    const rnd = lcg(0x5EEE);
    const bg = randDna(rnd, 50_000);
    const probe = bg.slice(20_000, 20_400);
    const s = dnaGappedSearchSession(probe, bg, { thresholdBps: 8000, collectStats: true, stateBudget: null });
    const r = s.stats;
    expect(s.incomplete).toBe(false);
    expect(s.occurrences.some((h) => h.start === 20_000)).toBe(true);
    console.log(`[profile-400/50k] scanMs=${r.scanMs} scanPos=${r.scanPositions} rawStarts=${r.rawStarts} `
      + `alignCalls=${r.alignCalls} alignMs=${r.alignMs} scoreStates=${r.scoreStates} `
      + `preprune=${r.beforePrune} retained=${r.retainedLoci} pruneMs=${r.pruneMs} totalMs=${r.totalMs}`);
  }, 600_000);

  it.runIf(globalThis.process?.env?.BENCH_STRESS === '1')('10 Mb stress: bounded, well-formed session (opt-in)', () => {
    const N = 10_000_000;
    const rnd = lcg(0x9aa9aa);
    const target = randDna(rnd, N);
    const probe = 'ACGTCAGTGACTGCATCTGAACGTCAGTGA';
    const t0 = Date.now();
    const s = dnaGappedSearchSession(probe, target, { thresholdBps: 8000 }); // default budget → bounded
    const ms = Date.now() - t0;
    expect(typeof s.incomplete).toBe('boolean');
    const heapMb = Math.round(globalThis.process.memoryUsage().heapUsed / 1e6);
    console.log(`[bench] 10Mb stress: ${ms} ms, incomplete=${s.incomplete}, heapUsed≈${heapMb} MB`);
  }, 120_000);
});
