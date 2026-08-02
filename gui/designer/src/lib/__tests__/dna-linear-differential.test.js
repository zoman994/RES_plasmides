/**
 * dna-linear-differential.test.js — DIFFERENTIAL coverage of the EXPERIMENTAL linear/Dinkelbach
 * kernel against the independent reference helpers/dna-glocal-oracle.js.
 * Spec: docs/specs/SPEC_GAPPED_DNA_SEARCH.md §6.2.
 *
 * REFERENCE. helpers/dna-glocal-oracle.js: literal enumeration, no linear score, no Dinkelbach,
 * no Myers, no plateau, no banding. It is capped at query<=12 / target<=20 by design, so everything
 * here is a SMALL-INPUT verdict and says nothing about 100 nt behaviour. Its two independent span
 * enumerators are cross-checked against each other in the second describe, because agreement with a
 * quietly wrong reference would prove nothing.
 *
 * COMPARISON DISCIPLINE. Full-occurrence comparison via shape() from helpers/dna-linear-fixtures.js
 * — never identity alone. This file carries the long-running exhaustive/randomized corpora ONLY;
 * mutation suites must NOT be added here (they get their own file), so neither approaches the size
 * threshold. The §3.2.1 plateau narrative lives in dna-linear-kernel.test.js.
 *
 * Run: cd gui/designer && npm test -- src/lib/__tests__/dna-linear-differential.test.js
 */

import { describe, it, expect } from 'vitest';
import { findOccurrences } from '../dna-linear-kernel';
import {
  findOccurrences as oracleFind,
  bruteSpan,
  dpSpan,
} from './helpers/dna-glocal-oracle';
import { shapes, lcg, randDna, words } from './helpers/dna-linear-fixtures';

describe('EXPERIMENTAL kernel §6.2 — differential against the independent oracle', () => {
  // The oracle is capped at query<=12 / target<=20, so everything here is a SMALL-INPUT verdict.
  const CONFIGS = [];
  for (const thresholdBps of [5000, 8000, 10000]) {
    for (const circular of [false, true]) {
      CONFIGS.push({ thresholdBps, circular, bothStrands: true });
    }
  }

  it('EXHAUSTIVE: every query 1..3 nt x every target 1..4 nt over {A,C,G} x 6 configs', () => {
    let cases = 0;
    for (let ql = 1; ql <= 3; ql++) {
      for (const q of words(['A', 'C', 'G'], ql)) {
        for (let tl = 1; tl <= 4; tl++) {
          for (const t of words(['A', 'C', 'G'], tl)) {
            for (const cfg of CONFIGS) {
              const label = `q=${q} t=${t} thr=${cfg.thresholdBps} circ=${cfg.circular}`;
              expect(shapes(findOccurrences(q, t, cfg)), label)
                .toEqual(shapes(oracleFind(q, t, cfg)));
              cases += 1;
            }
          }
        }
      }
    }
    expect(cases).toBe(28080);
  }, 300_000);

  it('RANDOMIZED: query <= 6 nt, target <= 12 nt, deterministic corpus', () => {
    const rnd = lcg(987654321);
    for (let trial = 0; trial < 400; trial++) {
      const q = randDna(rnd, 1 + ((rnd() * 6) | 0));
      const t = randDna(rnd, 1 + ((rnd() * 12) | 0));
      const cfg = {
        thresholdBps: [5000, 6000, 7000, 8000, 9000, 10000][(rnd() * 6) | 0],
        circular: rnd() < 0.5,
        bothStrands: rnd() < 0.7,
      };
      const label = `trial=${trial} q=${q} t=${t} thr=${cfg.thresholdBps} `
        + `circ=${cfg.circular} both=${cfg.bothStrands}`;
      expect(shapes(findOccurrences(q, t, cfg)), label).toEqual(shapes(oracleFind(q, t, cfg)));
    }
  }, 300_000);

  it('ADVERSARIAL: homopolymers, tandem repeats and periodic strings agree', () => {
    const pairs = [
      ['AAAA', 'AAAAAAAA'], ['ACAC', 'ACACACAC'], ['ACG', 'ACGACGACG'],
      ['AAAACCCC', 'AAAACCCCC'], ['AT', 'ATATATATAT'], ['ACGT', 'AACGT'],
      ['GGGG', 'GGGGGGGGGGGG'], ['ACGTA', 'ACGTACGTACGTA'], ['AAC', 'AACAACAAC'],
      ['CAGCAG', 'CAGCAGCAGCAG'], ['TTTT', 'TTTATTTT'], ['ACGTAC', 'ACGTTAC'],
    ];
    for (const [q, t] of pairs) {
      for (const cfg of CONFIGS) {
        const label = `q=${q} t=${t} thr=${cfg.thresholdBps} circ=${cfg.circular}`;
        expect(shapes(findOccurrences(q, t, cfg)), label)
          .toEqual(shapes(oracleFind(q, t, cfg)));
      }
    }
  }, 120_000);

  it('§2.5 targets carrying ambiguous symbols agree', () => {
    const rnd = lcg(424242);
    for (let trial = 0; trial < 120; trial++) {
      const q = randDna(rnd, 1 + ((rnd() * 5) | 0));
      const t = randDna(rnd, 1 + ((rnd() * 10) | 0), 'ACGTNRY-');
      const cfg = {
        thresholdBps: [5000, 8000, 10000][(rnd() * 3) | 0],
        circular: rnd() < 0.5,
        bothStrands: true,
      };
      const label = `trial=${trial} q=${q} t=${t} thr=${cfg.thresholdBps}`;
      expect(shapes(findOccurrences(q, t, cfg)), label).toEqual(shapes(oracleFind(q, t, cfg)));
    }
  }, 120_000);
});

describe('the oracle fixture validates itself', () => {
  // If the reference were quietly wrong, agreement with it would prove nothing. Its two
  // independent span enumerators are therefore cross-checked here as well.
  it('dpSpan (no dominance pruning) == bruteSpan (literal path enumeration)', () => {
    let compared = 0;
    for (let ql = 1; ql <= 3; ql++) {
      for (const q of words(['A', 'C', 'G'], ql)) {
        for (let tl = 1; tl <= 4; tl++) {
          for (const t of words(['A', 'C', 'G'], tl)) {
            for (const thresholdBps of [5000, 8000, 10000]) {
              for (const circular of [false, true]) {
                const withDp = oracleFind(q, t, { thresholdBps, circular, spanSolver: dpSpan });
                const withBrute = oracleFind(q, t, {
                  thresholdBps, circular, spanSolver: bruteSpan,
                });
                expect(shapes(withDp), `q=${q} t=${t} thr=${thresholdBps} circ=${circular}`)
                  .toEqual(shapes(withBrute));
                compared += 1;
              }
            }
          }
        }
      }
    }
    expect(compared).toBe(28080);
  }, 300_000);

  it('the oracle refuses inputs above its declared caps instead of guessing', () => {
    expect(() => oracleFind('ACGTACGTACGTA', 'ACGT', {})).toThrow(/small-input only/);
    expect(() => oracleFind('ACGT', 'A'.repeat(21), {})).toThrow(/small-input only/);
  });
});
