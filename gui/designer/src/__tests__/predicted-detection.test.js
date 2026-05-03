/**
 * predicted-detection.test.js — Sprint M-X.1 K2 unit coverage.
 *
 * Verifies the four predicted-region detectors and the orchestrator:
 *   - detectORFsAsPredicted   — wrapper over detectORFs (K1 retrofit)
 *   - detectPromotersSigma70  — PWM scan for -35 + -10 + spacer
 *   - detectTerminatorsStemLoop — inverted-repeat heuristic
 *   - detectGuideRNAScaffolds — Cas9 scaffold DNA-identity match
 *   - runPredictors           — orchestrator, dedup, settings respect
 *
 * Each detector has at least one POSITIVE (synthetic input known to
 * trigger) and one NEGATIVE (random / pUC19) case. Orchestrator tests
 * exercise toggle gating + overlap dedup against confident regions.
 */
import { describe, it, expect } from 'vitest';
import {
  detectORFsAsPredicted,
  detectPromotersSigma70,
  detectTerminatorsStemLoop,
  detectGuideRNAScaffolds,
  runPredictors,
  CAS9_SCAFFOLD,
} from '../predicted-detection';
import { PREDICTOR_SOURCES, isPredicted } from '../annotation-model';

// Pseudo-random but deterministic — seeded LCG so tests are stable.
function pseudoRandomSeq(len, seed = 12345) {
  const bases = 'ACGT';
  let s = seed;
  let out = '';
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += bases[s % 4];
  }
  return out;
}

describe('detectPromotersSigma70 — Sprint M-X.1 K2', () => {
  it('positive: synthetic TTGACA-N17-TATAAT triggers a hit', () => {
    // Idealized σ70 promoter: -35 hexamer, 17 nt spacer, -10 hexamer,
    // padded with random flanks so detector can scan and score.
    const flank = 'GCGCGCGCGCGCGCGCGCGCGCGC';
    const promoter =
      'TTGACA' +
      pseudoRandomSeq(17, 100) +
      'TATAAT' +
      pseudoRandomSeq(20, 200);
    const seq = flank + promoter + flank;
    const hits = detectPromotersSigma70(seq, 0.55);
    expect(hits.length).toBeGreaterThan(0);
    const top = hits.find((h) => h.confidence >= 0.65);
    expect(top).toBeDefined();
    expect(top.predicted).toBe(true);
    expect(top.source).toBe(PREDICTOR_SOURCES.SIGMA70_PWM);
    expect(top.type).toBe('promoter');
    expect(top.signals).toBeDefined();
    const sigTypes = top.signals.map((s) => s.type);
    expect(sigTypes).toContain('-35');
    expect(sigTypes).toContain('-10');
    expect(sigTypes).toContain('spacer');
    // Spacer length within 15-19 nt window
    const spacer = top.signals.find((s) => s.type === 'spacer');
    expect(spacer.length).toBeGreaterThanOrEqual(15);
    expect(spacer.length).toBeLessThanOrEqual(19);
  });

  it('negative: random 200 bp seq yields ≤1 hit at threshold 0.7', () => {
    const seq = pseudoRandomSeq(200, 999);
    const hits = detectPromotersSigma70(seq, 0.7);
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it('respects threshold — 0.95 yields fewer or equal hits than 0.55', () => {
    const flank = pseudoRandomSeq(50, 1);
    const seq =
      flank +
      'TTGACA' + pseudoRandomSeq(17, 2) + 'TATAAT' +
      flank;
    const loose = detectPromotersSigma70(seq, 0.55);
    const strict = detectPromotersSigma70(seq, 0.95);
    expect(strict.length).toBeLessThanOrEqual(loose.length);
  });
});

describe('detectTerminatorsStemLoop — Sprint M-X.1 K2', () => {
  it('positive: synthetic palindrome with GC stem triggers a hit', () => {
    // Stem 8 GC-rich, loop 4, perfect inverted repeat.
    const flank = pseudoRandomSeq(40, 1);
    const stem5 = 'GCCGGGCC';
    const loop = 'TTAA';
    const stem3 = 'GGCCCGGC'; // reverse-complement of stem5
    const polyU = 'TTTTTT';
    const seq = flank + stem5 + loop + stem3 + polyU + flank;
    const hits = detectTerminatorsStemLoop(seq, 0.55);
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.predicted).toBe(true);
    expect(top.source).toBe(PREDICTOR_SOURCES.STEM_LOOP);
    expect(top.type).toBe('terminator');
    const hairpin = top.signals.find((s) => s.type === 'hairpin');
    expect(hairpin).toBeDefined();
    expect(hairpin.stemEnd).toBeGreaterThan(hairpin.stemStart);
    expect(hairpin.loopEnd).toBeGreaterThan(hairpin.loopStart);
  });

  it('negative: pure poly-A stretch yields 0 hits', () => {
    const seq = 'A'.repeat(200);
    const hits = detectTerminatorsStemLoop(seq, 0.6);
    // Poly-A has no GC stem → score ~0 → no hits at threshold 0.6.
    expect(hits.length).toBe(0);
  });

  it('respects threshold — strict filter prunes weaker palindromes', () => {
    const flank = pseudoRandomSeq(30, 5);
    const seq = flank + 'GCGCGC' + 'TTAA' + 'GCGCGC' + flank;
    const loose = detectTerminatorsStemLoop(seq, 0.5);
    const strict = detectTerminatorsStemLoop(seq, 0.95);
    expect(strict.length).toBeLessThanOrEqual(loose.length);
  });
});

describe('detectGuideRNAScaffolds — Sprint M-X.1 K2', () => {
  it('positive: SpCas9 scaffold embedded → detect scaffold + 20 bp spacer', () => {
    const spacer20 = 'ACGTACGTACGTACGTACGT';
    const flank = pseudoRandomSeq(40, 1);
    const seq = flank + spacer20 + CAS9_SCAFFOLD + flank;
    const hits = detectGuideRNAScaffolds(seq);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const scaffold = hits.find((h) =>
      h.signals && h.signals.some((s) => s.type === 'scaffold'),
    );
    expect(scaffold).toBeDefined();
    expect(scaffold.predicted).toBe(true);
    expect(scaffold.source).toBe(PREDICTOR_SOURCES.SGRNA_SCAFFOLD);
    expect(scaffold.type).toBe('misc_RNA'); // sgRNA scaffold rendered as RNA region
    const scaffoldSignal = scaffold.signals.find((s) => s.type === 'scaffold');
    expect(scaffoldSignal.identity).toBeGreaterThanOrEqual(0.95);
    // Spacer region as separate predicted region (DEC-PRED open question 4 → separate)
    const spacerHit = hits.find((h) =>
      h.signals && h.signals.some((s) => s.type === 'spacer'),
    );
    expect(spacerHit).toBeDefined();
    expect(spacerHit.end - spacerHit.start).toBe(20);
  });

  it('negative: random sequence without scaffold yields 0 hits', () => {
    const seq = pseudoRandomSeq(500, 7);
    const hits = detectGuideRNAScaffolds(seq);
    expect(hits.length).toBe(0);
  });

  it('positive with single mismatch: scaffold with 1 nt mutation still detected (≥95% identity)', () => {
    // Mutate 1 base out of 76 → 75/76 ≈ 98.7% identity, still above 95%.
    const mutated = CAS9_SCAFFOLD.slice(0, 30) + 'C' + CAS9_SCAFFOLD.slice(31);
    const flank = pseudoRandomSeq(40, 9);
    const seq = flank + 'A'.repeat(20) + mutated + flank;
    const hits = detectGuideRNAScaffolds(seq);
    const scaffold = hits.find((h) =>
      h.signals && h.signals.some((s) => s.type === 'scaffold'),
    );
    expect(scaffold).toBeDefined();
  });
});

describe('detectORFsAsPredicted — Sprint M-X.1 K2', () => {
  it('wraps detectORFs and tags ORFs with predicted=true / source=orf_scan', () => {
    const cds = 'ATG' + 'GCC'.repeat(149) + 'TAA';
    const seq = pseudoRandomSeq(50, 1) + cds + pseudoRandomSeq(50, 2);
    const hits = detectORFsAsPredicted(seq, []);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const orf = hits[0];
    expect(orf.predicted).toBe(true);
    expect(orf.source).toBe(PREDICTOR_SOURCES.ORF_SCAN);
    expect(isPredicted(orf)).toBe(true);
    expect(orf.signals).toBeDefined();
    expect(orf.signals[0].type).toBe('orf');
  });

  it('skips ORFs overlapping confident regions in `existing`', () => {
    const cds = 'ATG' + 'GCC'.repeat(199) + 'TAA';
    const seq = cds + pseudoRandomSeq(50, 3);
    const existing = [{
      level: 'region',
      type: 'CDS',
      name: 'AmpR',
      start: 0,
      end: cds.length,
    }];
    const hits = detectORFsAsPredicted(seq, existing);
    // The detected ORF overlaps the existing CDS by ~100% → dropped.
    expect(hits.length).toBe(0);
  });
});

describe('runPredictors orchestrator — Sprint M-X.1 K2', () => {
  const synthetic =
    pseudoRandomSeq(40, 1) +
    'ATG' + 'GCC'.repeat(149) + 'TAA' + // ORF
    pseudoRandomSeq(40, 2);

  it('runs only enabled detectors per settings.predictions toggles', () => {
    const settings = {
      predictions: {
        cds: true,
        promoter: false,
        terminator: false,
        sgRNA: false,
        threshold: 0.5,
      },
    };
    const hits = runPredictors(synthetic, settings.predictions, []);
    // Only ORF detector runs → all hits must come from orf_scan.
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.source).toBe(PREDICTOR_SOURCES.ORF_SCAN);
    }
  });

  it('returns [] when every detector toggled off', () => {
    const settings = {
      cds: false, promoter: false, terminator: false, sgRNA: false,
      threshold: 0.5,
    };
    const hits = runPredictors(synthetic, settings, []);
    expect(hits).toEqual([]);
  });

  it('drops predicted regions overlapping confident regions (>50%)', () => {
    const cds = 'ATG' + 'GCC'.repeat(199) + 'TAA';
    const seq = cds + pseudoRandomSeq(50, 3);
    const existingConfident = [{
      level: 'region',
      type: 'CDS',
      name: 'AmpR (confident)',
      start: 0,
      end: cds.length,
    }];
    const settings = { cds: true, threshold: 0.4 };
    const hits = runPredictors(seq, settings, existingConfident);
    // ORF would otherwise be detected → dropped due to overlap.
    expect(hits.length).toBe(0);
  });

  it('filters predicted by settings.threshold (low-confidence pruning)', () => {
    const settings = { cds: true, threshold: 0.95 };
    // Min ORF (≥100 aa) without padding → confidence 0.5, below 0.95.
    const seq = 'ATG' + 'GCC'.repeat(149) + 'TAA';
    const hits = runPredictors(seq, settings, []);
    expect(hits.every((h) => (h.confidence ?? 1) >= 0.95)).toBe(true);
  });

  it('predicted-predicted overlap → highest-confidence wins', () => {
    // Two synthetic detectors would overlap on the same region. We
    // simulate by feeding the orchestrator a sequence where the same
    // region produces both an ORF (confidence ~0.9) and could plausibly
    // produce a stem-loop. The dedup rule is implementation-side; here
    // we just assert that within `runPredictors` overlapping outputs
    // are not double-rendered as identical regions.
    const cds = 'ATG' + 'GCC'.repeat(199) + 'TAA';
    const seq = cds;
    const settings = { cds: true, terminator: true, threshold: 0.5 };
    const hits = runPredictors(seq, settings, []);
    // Each region should appear once (no exact duplicates by start/end).
    const keys = hits.map((h) => `${h.start}:${h.end}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
