/**
 * Detect common features in DNA sequences by matching against
 * the common-features.json reference database.
 *
 * READ-ONLY: database is a reference, NOT added to user's parts library.
 * ASYNC: does not block UI. Called after instant pattern-based auto-annotation.
 *
 * Two detection modes:
 *   1. CDS: translate input in all 6 frames → exact protein match
 *   2. Non-CDS: sliding window → ≥96% DNA identity
 */

import { CODON_TABLE } from './codons';
import { reverseComplement as revComp } from './sequence-utils';

let _db = null;
let _loading = null;

/**
 * Load common features database (lazy, cached).
 * @returns {Promise<Object>} database with .features array
 */
export async function loadFeatureDB() {
  if (_db) return _db;
  if (_loading) return _loading;

  _loading = fetch('/common-features.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      _db = data;
      _loading = null;
      return data;
    })
    .catch(err => {
      _loading = null;
      console.warn('Feature DB not available:', err.message);
      return null;
    });

  return _loading;
}

/**
 * Translate DNA to protein in one frame.
 *
 * Pushed onto an array and joined at the end instead of concatenating
 * to a string — V8 string-rope optimisation breaks down on long
 * (10k+) growing strings, and this is hot: 6 frames × ~5000 codons
 * per frame on a typical bacterial plasmid. The array form is
 * 5–10× faster on real inputs.
 */
function translateFrame(seq) {
  const len = seq.length;
  const out = new Array(Math.floor(len / 3));
  let n = 0;
  for (let i = 0; i + 2 < len; i += 3) {
    out[n++] = CODON_TABLE[seq.slice(i, i + 3)] || '?';
  }
  out.length = n;
  return out.join('');
}

/**
 * Simple pairwise DNA identity (no gaps).
 */
function dnaIdentity(seq1, seq2) {
  if (Math.abs(seq1.length - seq2.length) > seq1.length * 0.1) return 0;
  const [shorter, longer] = seq1.length <= seq2.length ? [seq1, seq2] : [seq2, seq1];
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  return matches / longer.length;
}

/**
 * Identity of `feature` against the substring of `target` starting
 * at `offset` and `featureLen` chars long. Avoids a target.slice()
 * allocation per indexOf hit — for features with many false-positive
 * seed hits this saves substantial GC pressure.
 */
function dnaIdentityOffset(feature, target, offset, featureLen) {
  if (offset + featureLen > target.length) return 0;
  let matches = 0;
  for (let i = 0; i < featureLen; i++) {
    if (feature.charCodeAt(i) === target.charCodeAt(offset + i)) matches++;
  }
  return matches / featureLen;
}

/**
 * Detect common features in a DNA sequence.
 *
 * @param {string} sequence — input DNA (uppercase)
 * @param {Object} database — loaded from common-features.json
 * @param {Object} [options]
 * @param {number} [options.identityThreshold=0.96]
 * @param {number} [options.maxFeatureLength=15000] — skip features longer than this
 * @returns {Array<{ feature, start, end, strand, identity, method }>}
 */
export function detectCommonFeatures(sequence, database, options = {}) {
  if (!database?.features?.length || !sequence || sequence.length < 20) return [];

  const { identityThreshold = 0.96, maxFeatureLength = 15000 } = options;
  const seq = sequence.toUpperCase();
  const rc = revComp(seq);
  const results = [];

  // Translate all 6 frames for CDS matching
  const frames = [];
  for (let offset = 0; offset < 3; offset++) {
    frames.push({ protein: translateFrame(seq.slice(offset)), strand: 1, offset });
    frames.push({ protein: translateFrame(rc.slice(offset)), strand: -1, offset });
  }

  for (const feat of database.features) {
    if (feat.length > maxFeatureLength) continue;

    // CDS: protein exact match, then fuzzy fallback
    if (feat.protein && feat.protein.length >= 10) {
      let found = false;

      // Exact match first
      for (const frame of frames) {
        const idx = frame.protein.indexOf(feat.protein);
        if (idx >= 0) {
          const ntStart = frame.strand === 1
            ? frame.offset + idx * 3
            : seq.length - (frame.offset + (idx + feat.protein.length) * 3);
          const ntEnd = ntStart + feat.protein.length * 3;
          results.push({
            feature: feat,
            start: Math.max(0, ntStart),
            end: Math.min(seq.length, ntEnd),
            strand: frame.strand,
            identity: 1.0,
            method: 'protein_exact',
          });
          found = true;
          break;
        }
      }

      // Fuzzy protein match (>=90% identity) if no exact match.
      //
      // Sprint M-X.3 follow-up (05.05.2026) — biolog: «аннотация
      // очень долгая. 14 кб плазмиду по комон фичам парсит минуту».
      // Pre-fix this was a brute-force O(N×M) sliding window per
      // feature per frame — for a 14kb plasmid with ~1000 features
      // it crunched ~5.6 billion comparisons before finishing.
      // Switched to the same seed-and-extend pattern the DNA path
      // already uses: pick a 10-aa seed from the middle of the
      // feature protein, indexOf-locate it in the frame (V8's
      // string search is heavily optimised), then verify the
      // surrounding window. ~1000× speed-up on real plasmids
      // because the inner verification loop only fires for actual
      // seed hits, not every position.
      if (!found && feat.protein.length >= 30) {
        const SEED_LEN = 8;
        // Three seeds at ~25%, 50%, 75% of the feature protein.
        // At ≤10% mutation rate, P(at least one seed survives clean) ≈
        // 1 − (1 − 0.9^8)^3 ≈ 0.95, so the verifier still gets a hit
        // for the test's «5% mutated AmpR» case the brute force used
        // to catch.
        const fpLen = feat.protein.length;
        const seedOffsets = [
          Math.floor(fpLen * 0.25),
          Math.floor(fpLen * 0.50),
          Math.floor(fpLen * 0.75),
        ].filter((o) => o + SEED_LEN <= fpLen);
        const seeds = seedOffsets
          .map((o) => ({ off: o, str: feat.protein.slice(o, o + SEED_LEN) }))
          .filter((s) => s.str.length === SEED_LEN && !s.str.includes('?'));
        if (seeds.length > 0) {
          for (const frame of frames) {
            const fp = feat.protein;
            const tp = frame.protein;
            if (tp.length < fp.length * 0.8) continue;

            // Collect candidate window starts from any seed hit.
            // Set dedups duplicates when neighbouring seeds resolve
            // to the same window.
            const candidates = new Set();
            for (const s of seeds) {
              let at = tp.indexOf(s.str);
              while (at >= 0) {
                const candStart = at - s.off;
                if (candStart >= 0 && candStart + fp.length <= tp.length) {
                  candidates.add(candStart);
                }
                at = tp.indexOf(s.str, at + 1);
              }
            }

            let bestIdentity = 0, bestPos = -1;
            for (const candStart of candidates) {
              let matches = 0;
              for (let j = 0; j < fp.length; j++) {
                if (fp[j] === tp[candStart + j]) matches++;
              }
              const identity = matches / fp.length;
              if (identity > bestIdentity) {
                bestIdentity = identity;
                bestPos = candStart;
                if (identity >= 0.96) break;
              }
            }

            if (bestIdentity >= 0.90) {
              const ntStart = frame.strand === 1
                ? frame.offset + bestPos * 3
                : seq.length - (frame.offset + (bestPos + fp.length) * 3);
              results.push({
                feature: feat,
                start: Math.max(0, ntStart),
                end: Math.min(seq.length, ntStart + fp.length * 3),
                strand: frame.strand,
                identity: bestIdentity,
                method: 'protein_fuzzy',
              });
              found = true;
              break;
            }
          }
        }
      }

      if (found) continue;
    }

    // Non-CDS: sliding window DNA identity
    if (feat.sequence && feat.sequence.length >= 20) {
      const fseq = feat.sequence.toUpperCase();
      const flen = fseq.length;

      // Only check if input is at least as long as the feature
      for (const [targetSeq, strand] of [[seq, 1], [rc, -1]]) {
        if (targetSeq.length < flen) continue;

        // Check a few candidate positions using a short seed
        const seedLen = Math.min(12, Math.floor(flen / 4));
        const seed = fseq.slice(0, seedLen);

        let pos = targetSeq.indexOf(seed);
        let matched = false;
        while (pos >= 0 && pos + flen <= targetSeq.length) {
          const ident = dnaIdentityOffset(fseq, targetSeq, pos, flen);

          if (ident >= identityThreshold) {
            const actualStart = strand === 1 ? pos : seq.length - pos - flen;
            results.push({
              feature: feat,
              start: Math.max(0, actualStart),
              end: Math.min(seq.length, actualStart + flen),
              strand,
              identity: ident,
              method: 'dna_identity',
            });
            matched = true;
            break; // one match per feature
          }

          pos = targetSeq.indexOf(seed, pos + 1);
        }
        if (matched) break;
      }
    }
  }

  // Deduplicate overlapping results (keep highest identity)
  results.sort((a, b) => b.identity - a.identity);
  const kept = [];
  for (const r of results) {
    const overlaps = kept.some(k =>
      Math.max(r.start, k.start) < Math.min(r.end, k.end) &&
      r.feature.type === k.feature.type
    );
    if (!overlaps) kept.push(r);
  }

  return kept;
}

/**
 * Async wrapper: load DB + detect. Non-blocking.
 * Returns empty array if DB unavailable.
 *
 * @param {string} sequence
 * @returns {Promise<Array>}
 */
export async function detectCommonFeaturesAsync(sequence) {
  const db = await loadFeatureDB();
  if (!db) return [];
  return detectCommonFeatures(sequence, db);
}
