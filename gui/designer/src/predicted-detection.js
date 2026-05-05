/**
 * predicted-detection.js — Sprint M-X.1 K2.
 *
 * Four structural detectors + orchestrator. All output regions carry
 * the predicted-shape (annotation-model.js K1: predicted / source /
 * confidence / signals). Internal evidence stays inside `signals[]`
 * per DEC-PRED-01 — Modal Evidence tab in M-X.2 will surface it.
 *
 * Why no backend: M-X.1 is the frontend baseline. PWM scan + heuristic
 * stem-loop scoring + DNA-identity match for the Cas9 scaffold all run
 * in pure JS and complete in < 200 ms on an 8 kb plasmid. Pfam
 * (M-X.3), SignalP (M-X.4) and AUGUSTUS (M-X.5) bring richer biology
 * but require backend infra; not part of this sprint.
 *
 * Detector specificity tuned for biolog UX: defaults bias to
 * high-precision (CDS/ORF + sgRNA on, promoter + terminator OFF —
 * see DEC-PRED-03 in spec). Threshold slider in settings allows
 * stricter pruning if PWM finds too many candidates.
 *
 * Performance contract: `runPredictors` is O(n) per detector for total
 * O(n) on sequence length. Called from SequenceView consumer through
 * useMemo (DEC-PRED-06) — re-runs only when sequence or settings shift.
 */

import { generateRegionId } from './domain-detection';
import { PREDICTOR_SOURCES } from './annotation-model';
import { detectORFs } from './orf-detection';
import { reverseComplement } from './sequence-utils';

// ─── Constants ────────────────────────────────────────────────────────

/**
 * SpCas9 sgRNA scaffold (76 nt). Sequence below the spacer in a
 * standard sgRNA construct (TracrRNA fusion → repeat → tetraloop →
 * stem-loop → terminator). High specificity: detection requires ≥95 %
 * identity over the full 76 nt window, ~zero false positives outside
 * CRISPR plasmids.
 */
export const CAS9_SCAFFOLD =
  'GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC';

/**
 * Variant scaffolds for SpCas9 derivatives. Empty for now; M-X.1.2
 * will add SaCas9 (smaller scaffold), engineered improvers, etc.
 */
export const CAS9_SCAFFOLD_VARIANTS = [];

/**
 * σ70 -35 element PWM (Lisser & Margalit 1993, normalised counts).
 * Rows = position 0..5 (TTGACA consensus). Columns = A, C, G, T base
 * frequencies. Sum per row ≈ 1.0.
 */
const SIGMA70_MINUS35_PWM = [
  // A,    C,    G,    T
  [0.10, 0.10, 0.11, 0.69], // pos 0 → consensus T
  [0.05, 0.08, 0.08, 0.79], // pos 1 → consensus T
  [0.10, 0.13, 0.61, 0.16], // pos 2 → consensus G
  [0.54, 0.10, 0.10, 0.26], // pos 3 → consensus A
  [0.16, 0.54, 0.14, 0.16], // pos 4 → consensus C
  [0.50, 0.13, 0.10, 0.27], // pos 5 → consensus A
];

/**
 * σ70 -10 element PWM (TATAAT consensus).
 */
const SIGMA70_MINUS10_PWM = [
  [0.07, 0.10, 0.06, 0.77], // pos 0 → T
  [0.76, 0.07, 0.10, 0.07], // pos 1 → A
  [0.13, 0.13, 0.14, 0.60], // pos 2 → T
  [0.61, 0.16, 0.13, 0.10], // pos 3 → A
  [0.56, 0.16, 0.13, 0.15], // pos 4 → A
  [0.10, 0.06, 0.02, 0.82], // pos 5 → T
];

const BASE_INDEX = { A: 0, C: 1, G: 2, T: 3 };

// ─── PWM scoring ──────────────────────────────────────────────────────

/**
 * Score a hexamer against a 6×4 PWM. Returns log-odds (sum of
 * log2(P / 0.25) per position), then normalises to 0..1 using the PWM's
 * theoretical max as the upper bound. Zero or negative log-odds saturate
 * to 0 — only positive evidence (above-background P) contributes.
 */
function scorePwm(hexamer, pwm) {
  if (hexamer.length !== 6) return 0;
  let score = 0;
  let maxScore = 0;
  for (let i = 0; i < 6; i++) {
    const idx = BASE_INDEX[hexamer[i]];
    const row = pwm[i];
    if (idx === undefined) {
      // N or non-canonical → no contribution.
      continue;
    }
    const p = row[idx];
    if (p > 0.25) score += Math.log2(p / 0.25);
    const maxP = Math.max(...row);
    maxScore += Math.log2(maxP / 0.25);
  }
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(1, score / maxScore));
}

// ─── Detector 1: σ70 promoter PWM ────────────────────────────────────

/**
 * Scan top strand for σ70 promoters. Returns predicted regions with
 * `signals: [{-35}, {-10}, {spacer}]`.
 *
 * Algorithm: for every -35 candidate position with score ≥ threshold,
 * scan downstream 15..19 nt for a -10 candidate above threshold.
 * Composite confidence = (score-35 + score-10) / 2.
 *
 * Only top strand for now — promoter directionality matters; reverse
 * strand σ70 promoters are valid but rare in user-facing constructs
 * and add detection noise. Add reverse-strand pass in M-X.1.1 if
 * acceptance shows demand.
 */
export function detectPromotersSigma70(sequence, threshold = 0.7) {
  const seq = (sequence || '').toUpperCase();
  if (seq.length < 50) return [];
  const hits = [];
  // Spacer length window per spec (17 ± 2 → 15..19 inclusive).
  const SPACER_MIN = 15;
  const SPACER_MAX = 19;
  // Track positions already claimed by a higher-scoring promoter so
  // overlapping candidates don't multiply.
  const claimed = new Set();

  for (let i = 0; i < seq.length - (6 + SPACER_MIN + 6); i++) {
    if (claimed.has(i)) continue;
    const minus35 = seq.slice(i, i + 6);
    const score35 = scorePwm(minus35, SIGMA70_MINUS35_PWM);
    if (score35 < threshold) continue;

    let bestComposite = 0;
    let bestSpacerLen = 0;
    let bestMinus10Start = 0;
    let bestScore10 = 0;
    for (let sp = SPACER_MIN; sp <= SPACER_MAX; sp++) {
      const m10Start = i + 6 + sp;
      if (m10Start + 6 > seq.length) break;
      const minus10 = seq.slice(m10Start, m10Start + 6);
      const score10 = scorePwm(minus10, SIGMA70_MINUS10_PWM);
      if (score10 < threshold) continue;
      const composite = (score35 + score10) / 2;
      if (composite > bestComposite) {
        bestComposite = composite;
        bestSpacerLen = sp;
        bestMinus10Start = m10Start;
        bestScore10 = score10;
      }
    }

    if (bestComposite < threshold) continue;
    // Mark region as claimed.
    for (let k = i; k < bestMinus10Start + 6; k++) claimed.add(k);

    hits.push({
      id: generateRegionId(),
      name: 'Probable σ70 promoter',
      type: 'promoter',
      start: i,
      end: bestMinus10Start + 6,
      strand: 1,
      level: 'region',
      predicted: true,
      source: PREDICTOR_SOURCES.SIGMA70_PWM,
      confidence: Number(bestComposite.toFixed(3)),
      signals: [
        {
          type: '-35',
          start: i,
          end: i + 6,
          score: Number(score35.toFixed(3)),
          sequence: minus35,
        },
        {
          type: 'spacer',
          start: i + 6,
          end: bestMinus10Start,
          length: bestSpacerLen,
        },
        {
          type: '-10',
          start: bestMinus10Start,
          end: bestMinus10Start + 6,
          score: Number(bestScore10.toFixed(3)),
          sequence: seq.slice(bestMinus10Start, bestMinus10Start + 6),
        },
      ],
    });
  }
  return hits;
}

// ─── Detector 2: terminator stem-loop ────────────────────────────────

/**
 * Scan for inverted-repeat stem-loop terminators. Heuristic: stem
 * 5..12 nt, loop 3..8 nt, mismatch ≤ 1, scored by stem GC content
 * × stem length × (1 − mismatch_fraction). NOT a true ΔG model —
 * see open question 3 in spec; full thermodynamics deferred to a
 * later sprint when ViennaRNA WASM (or similar) is integrated.
 */
export function detectTerminatorsStemLoop(sequence, threshold = 0.7) {
  const seq = (sequence || '').toUpperCase();
  if (seq.length < 30) return [];
  const STEM_MIN = 5;
  const STEM_MAX = 12;
  const LOOP_MIN = 3;
  const LOOP_MAX = 8;
  const hits = [];
  const claimed = new Set();

  for (let i = 0; i + STEM_MIN * 2 + LOOP_MIN <= seq.length; i++) {
    if (claimed.has(i)) continue;
    let bestScore = 0;
    let bestEntry = null;
    for (let stemLen = STEM_MIN; stemLen <= STEM_MAX; stemLen++) {
      for (let loopLen = LOOP_MIN; loopLen <= LOOP_MAX; loopLen++) {
        const stem1Start = i;
        const stem1End = i + stemLen;
        const loopStart = stem1End;
        const loopEnd = loopStart + loopLen;
        const stem2Start = loopEnd;
        const stem2End = stem2Start + stemLen;
        if (stem2End > seq.length) break;
        const stem1 = seq.slice(stem1Start, stem1End);
        const stem2 = seq.slice(stem2Start, stem2End);
        const stem2Rc = reverseComplement(stem2);
        let mismatches = 0;
        for (let k = 0; k < stemLen; k++) {
          if (stem1[k] !== stem2Rc[k]) mismatches += 1;
        }
        if (mismatches > 1) continue;
        const gcCount = (stem1.match(/[GC]/g) || []).length;
        const gcFrac = gcCount / stemLen;
        // Score grows with longer GC-rich stems, penalised by mismatch.
        const score =
          gcFrac * (stemLen / STEM_MAX) * (1 - mismatches / stemLen);
        if (score > bestScore) {
          bestScore = score;
          bestEntry = {
            stemStart: stem1Start,
            stemEnd: stem1End,
            loopStart,
            loopEnd,
            stem2Start,
            stem2End,
            stemLen,
            mismatches,
            gcFrac,
          };
        }
      }
    }
    if (!bestEntry || bestScore < threshold) continue;
    // Mark the full footprint as claimed.
    for (let k = bestEntry.stemStart; k < bestEntry.stem2End; k++) {
      claimed.add(k);
    }

    hits.push({
      id: generateRegionId(),
      name: 'Probable stem-loop terminator',
      type: 'terminator',
      start: bestEntry.stemStart,
      end: bestEntry.stem2End,
      strand: 1,
      level: 'region',
      predicted: true,
      source: PREDICTOR_SOURCES.STEM_LOOP,
      confidence: Number(bestScore.toFixed(3)),
      signals: [
        {
          type: 'hairpin',
          stemStart: bestEntry.stemStart,
          stemEnd: bestEntry.stemEnd,
          loopStart: bestEntry.loopStart,
          loopEnd: bestEntry.loopEnd,
          stem2Start: bestEntry.stem2Start,
          stem2End: bestEntry.stem2End,
          mismatches: bestEntry.mismatches,
          gcFraction: Number(bestEntry.gcFrac.toFixed(3)),
        },
      ],
    });
  }
  return hits;
}

// ─── Detector 3: sgRNA Cas9 scaffold ─────────────────────────────────

/**
 * Identity (matches / length) between two equal-length sequences.
 */
function identity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) matches += 1;
  return matches / a.length;
}

/**
 * Slide the SpCas9 scaffold (and any variants) across the sequence.
 * Threshold ≥0.95 identity → scaffold hit. 20 bp upstream → spacer
 * region (DEC open question 4: separate region, not signal).
 */
export function detectGuideRNAScaffolds(sequence) {
  const seq = (sequence || '').toUpperCase();
  if (seq.length < CAS9_SCAFFOLD.length + 20) return [];
  const variants = [CAS9_SCAFFOLD, ...CAS9_SCAFFOLD_VARIANTS];
  const hits = [];
  const claimed = new Set();

  for (const variant of variants) {
    const len = variant.length;
    for (let i = 0; i + len <= seq.length; i++) {
      if (claimed.has(i)) continue;
      const window = seq.slice(i, i + len);
      const ident = identity(window, variant);
      if (ident < 0.95) continue;

      // Mark scaffold + spacer footprint claimed.
      for (let k = Math.max(0, i - 20); k < i + len; k++) claimed.add(k);

      hits.push({
        id: generateRegionId(),
        name: 'Probable sgRNA scaffold',
        type: 'misc_RNA',
        start: i,
        end: i + len,
        strand: 1,
        level: 'region',
        predicted: true,
        source: PREDICTOR_SOURCES.SGRNA_SCAFFOLD,
        confidence: Number(ident.toFixed(3)),
        signals: [
          {
            type: 'scaffold',
            start: i,
            end: i + len,
            identity: Number(ident.toFixed(3)),
            variant: variant === CAS9_SCAFFOLD ? 'SpCas9' : 'variant',
          },
        ],
      });

      // Spacer = 20 nt directly upstream — emit as a SECOND predicted
      // region so the biolog can see the target sequence at a glance
      // (DEC open question 4).
      if (i >= 20) {
        const spacerStart = i - 20;
        const spacerEnd = i;
        hits.push({
          id: generateRegionId(),
          name: 'Probable sgRNA spacer',
          type: 'misc_RNA',
          start: spacerStart,
          end: spacerEnd,
          strand: 1,
          level: 'region',
          predicted: true,
          source: PREDICTOR_SOURCES.SGRNA_SCAFFOLD,
          confidence: Number(ident.toFixed(3)),
          signals: [
            {
              type: 'spacer',
              start: spacerStart,
              end: spacerEnd,
              length: 20,
            },
          ],
        });
      }
    }
  }
  return hits;
}

// ─── Detector 4: ORF wrapper ─────────────────────────────────────────

/**
 * Thin wrapper over `detectORFs()` (already predicted-flagged after
 * K1). Exists so the orchestrator has a uniform per-detector entry
 * point and so M-X.2 Modal can call ORF detection with the same shape
 * as the other three.
 */
export function detectORFsAsPredicted(sequence, existingConfident = []) {
  return detectORFs(sequence, existingConfident);
}

// ─── Orchestrator ────────────────────────────────────────────────────

/**
 * Run the enabled detectors against `sequence` and return a single
 * deduplicated array of predicted regions.
 *
 * @param {string} sequence
 * @param {object} predictionsSettings — { cds, promoter, terminator, sgRNA, threshold }
 * @param {Array} existingConfident — confident regions for overlap dedup
 * @returns {Array<region>}
 */
export function runPredictors(sequence, predictionsSettings = {}, existingConfident = []) {
  const seq = (sequence || '').toUpperCase();
  if (!seq) return [];
  const {
    cds = false,
    promoter = false,
    terminator = false,
    sgRNA = false,
    threshold = 0.7,
  } = predictionsSettings;

  let raw = [];
  if (cds) raw = raw.concat(detectORFsAsPredicted(seq, existingConfident));
  if (promoter) raw = raw.concat(detectPromotersSigma70(seq, threshold));
  if (terminator) raw = raw.concat(detectTerminatorsStemLoop(seq, threshold));
  if (sgRNA) raw = raw.concat(detectGuideRNAScaffolds(seq));

  // Threshold filter — applies uniformly across detectors. ORF
  // confidence is already aaLen-based (0.5/0.7/0.9) — `threshold` cuts
  // low-confidence wrappers same as PWM scores.
  raw = raw.filter((r) => (r.confidence ?? 1) >= threshold);

  // Dedup vs confident regions: any predicted overlapping a confident
  // region by >50 % is dropped.
  const filtered = raw.filter((pred) => {
    return !existingConfident.some((conf) => {
      if (conf.level && conf.level !== 'region') return false;
      const overlap =
        Math.max(0, Math.min(pred.end, conf.end) - Math.max(pred.start, conf.start));
      const predLen = pred.end - pred.start;
      return predLen > 0 && overlap / predLen > 0.5;
    });
  });

  // Predicted-predicted dedup: keep highest confidence per overlap
  // group. Sort desc by confidence, then greedy-take if not >50 %
  // overlapping any already-taken hit.
  filtered.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  const kept = [];
  for (const cand of filtered) {
    const overlapped = kept.some((k) => {
      const overlap =
        Math.max(0, Math.min(cand.end, k.end) - Math.max(cand.start, k.start));
      const candLen = cand.end - cand.start;
      return candLen > 0 && overlap / candLen > 0.5;
    });
    if (!overlapped) kept.push(cand);
  }

  // Sort final output by `start` for stable downstream rendering.
  kept.sort((a, b) => a.start - b.start || a.end - b.end);
  return kept;
}
