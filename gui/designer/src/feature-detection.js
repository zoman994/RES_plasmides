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
 */
function translateFrame(seq) {
  let protein = '';
  for (let i = 0; i + 2 < seq.length; i += 3) {
    const codon = seq.slice(i, i + 3);
    protein += CODON_TABLE[codon] || '?';
  }
  return protein;
}

/**
 * Get reverse complement.
 */
function revComp(seq) {
  const comp = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  return seq.split('').reverse().map(c => comp[c] || 'N').join('');
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

    // CDS: protein exact match
    if (feat.protein && feat.protein.length >= 10) {
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
          break; // one match per feature is enough
        }
      }
      continue;
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
        while (pos >= 0 && pos + flen <= targetSeq.length) {
          const window = targetSeq.slice(pos, pos + flen);
          const ident = dnaIdentity(fseq, window);

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
            break; // one match per feature
          }

          pos = targetSeq.indexOf(seed, pos + 1);
        }
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
