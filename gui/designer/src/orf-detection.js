/**
 * orf-detection.js — ORF scanner for unannotated plasmids.
 *
 * Detects open reading frames ≥ minAA in both strands, all 3 frames.
 * Filters out ORFs overlapping with existing CDS/marker/reporter regions.
 *
 * Extracted from auto-annotate.js so it can be dynamically imported —
 * if this module fails, enrichment continues without ORF scan.
 */

import { generateRegionId } from './domain-detection';
import { PREDICTOR_SOURCES } from './annotation-model';

const RC_MAP = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
const STOPS = new Set(['TAA', 'TAG', 'TGA']);

/**
 * Detect open reading frames ≥ minAA in a sequence.
 * Scans both strands, all 3 frames.
 * Filters out ORFs overlapping with existing CDS/marker/reporter regions.
 *
 * @param {string} sequence — uppercase DNA
 * @param {Array} existingAnnotations — already-found annotations (to avoid duplicates)
 * @param {number} minAA — minimum ORF size in amino acids (default: 100)
 * @returns {Array} region-level annotations for detected ORFs
 */
export function detectORFs(sequence, existingAnnotations, minAA = 100) {
  const seq = sequence.toUpperCase();
  const seqLen = seq.length;
  const rcSeq = seq.split('').reverse().map(c => RC_MAP[c] || 'N').join('');

  // Existing CDS regions — don't duplicate
  const existingCDS = (existingAnnotations || []).filter(a =>
    a.level === 'region' && (a.type === 'CDS' || a.type === 'marker' || a.type === 'reporter' || a.type === 'gene')
  );

  const rawORFs = [];

  for (const [strand, s] of [[1, seq], [-1, rcSeq]]) {
    for (let frame = 0; frame < 3; frame++) {
      let i = frame;
      while (i + 2 < s.length) {
        if (s.slice(i, i + 3) === 'ATG') {
          const start = i;
          let j = i + 3;
          while (j + 2 < s.length) {
            if (STOPS.has(s.slice(j, j + 3))) {
              const aaLen = (j - start) / 3;
              if (aaLen >= minAA) {
                const realStart = strand === 1 ? start : seqLen - j - 3;
                const realEnd = strand === 1 ? j + 3 : seqLen - start;
                rawORFs.push({
                  start: Math.min(realStart, realEnd),
                  end: Math.max(realStart, realEnd),
                  strand,
                  aaLen,
                });
              }
              i = j; // skip past stop codon
              break;
            }
            j += 3;
          }
        }
        i += 3;
      }
    }
  }

  // Sort by size (largest first), take only non-overlapping with existing CDS
  rawORFs.sort((a, b) => b.aaLen - a.aaLen);

  const results = [];
  const usedRanges = existingCDS.map(a => [a.start, a.end]);

  for (const orf of rawORFs) {
    // Check overlap with existing CDS or already-added ORFs
    const overlapsExisting = usedRanges.some(([s, e]) => {
      const overlap = Math.min(orf.end, e) - Math.max(orf.start, s);
      const orfLen = orf.end - orf.start;
      return overlap > orfLen * 0.5; // >50% overlap = same gene
    });

    if (overlapsExisting) continue;

    usedRanges.push([orf.start, orf.end]);
    // Sprint M-X.1 K1 retrofit: ORFs now flagged `predicted: true` and
    // carry internal evidence in `signals[]` per DEC-PRED-01. `source`
    // aligns with PREDICTOR_SOURCES.ORF_SCAN so consumers can match by
    // canonical id; legacy `detector: 'orf_scan'` preserved alongside
    // (any module that grew around the old name keeps working).
    results.push({
      id: generateRegionId(),
      name: `ORF (${orf.aaLen} aa)`,
      type: 'CDS',
      start: orf.start,
      end: orf.end,
      strand: orf.strand,
      level: 'region',
      auto: true,
      predicted: true,
      source: PREDICTOR_SOURCES.ORF_SCAN,
      confidence: orf.aaLen > 200 ? 0.9 : orf.aaLen > 150 ? 0.7 : 0.5,
      detector: 'orf_scan', // legacy
      signals: [{ type: 'orf', aaLen: orf.aaLen }],
    });

    // Limit to 6 ORFs max (avoid noise)
    if (results.length >= 6) break;
  }

  return results;
}
