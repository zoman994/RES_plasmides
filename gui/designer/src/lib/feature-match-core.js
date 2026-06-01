/**
 * feature-match-core — identity/scoring engine for common-feature detection
 * + promote-dedup (SPEC_COMMON_FEATURES DEC-CF-08). Extracted verbatim from
 * feature-detection.js: bodies are byte-for-byte the V134/V138 originals,
 * only import paths + exports changed, so «дедуп = детекция» holds by
 * construction. Pure — fetch/Dexie/store stay in feature-detection.js, which
 * re-exports the public names for back-compat. Modes: CDS = 6-frame protein
 * match; non-CDS = sliding-window ≥96% DNA identity.
 */

import { CODON_TABLE } from '../codons';
import { reverseComplement as revComp } from '../sequence-utils';

// Types eligible for protein-pathway matching. Non-coding regulatory
// features (promoters, terminators, replication origins, misc) stay on
// the DNA pathway even if the DB carries a feat.protein field —
// translating them is biologically wrong, and stray DB protein entries
// must not drag them in.
export const PROTEIN_PATHWAY_TYPES = new Set(['CDS', 'marker', 'reporter']);

/**
 * Canonical display name for a detected feature (V136). For a partial
 * (truncated / split) hit, append the matched sub-range `_part_(start+1)-end`
 * (1-based, GenBank convention) so the biologist sees «KanR_part_40-289»
 * instead of a bare «KanR» on an imported fragment; for a full hit, the flat
 * feature name. The ONE place every detector consumer (Annotator plugin,
 * enrich, file-import) builds the name, so the partial suffix can't be
 * flattened back to flat by a downstream consumer.
 *
 * @param {{ name?: string, method?: string, featureStart?: number, featureEnd?: number }} hit
 * @returns {string}
 */
export function featureRegionName({ name, method, featureStart, featureEnd }) {
  if (!name) return '(unnamed)';
  if (method === 'protein_partial' || method === 'dna_partial') {
    const s = (featureStart || 0) + 1;
    const e = featureEnd != null ? featureEnd : (featureStart || 0) + 1;
    return `${name}_part_${s}-${e}`;
  }
  return name;
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
 * Simple pairwise DNA identity (no gaps). Also reused by the promote-dedup
 * check (feature-dedup.js) so «дедуп = детекция» share one identity fn.
 */
export function dnaIdentity(seq1, seq2) {
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
 * Gapless local seed-extend around a single exact seed hit, for the
 * partial-feature fallback (truncated / split features the full-length
 * verifiers drop because their window runs off the fragment).
 *
 * Anchored on the seed [seedFeatIdx, seedFeatIdx+seedLen) ↔
 * [seedTargetIdx, …); extends both ways along the fixed diagonal with a
 * BLAST-style X-drop (V134): score +1 per match / −1 per mismatch, remember the
 * peak score and its position, stop once score falls `xdrop` below the peak; the
 * boundary is the PEAK position (snap-back to the last real match). This bridges
 * a short mismatch run (a substituted codon — the clean feature after it climbs
 * back to a new peak) so a point edit no longer splits a fragment or drops a
 * sub-floor sliver, while a true truncation / off-diagonal insertion drives the
 * score down monotonically → stop exactly at the boundary with no flank overrun.
 * No gaps — within-piece gaps are an L3-BLAST concern, not this path's.
 *
 * Returns null unless the span clears the absolute floor (`minLen`) and a
 * hybrid coverage floor: ≥30% of the feature, OR ≥`minStrongLen` nt/aa
 * absolute (so real cut-and-paste vector fragments at 40-50% coverage are
 * kept, while short spurious hits in a ~1000-feature DB are still gated). The
 * identity gate + coverage floor are the backstop against drifting into noise.
 *
 * @returns {{identity,coverage,featStart,featEnd,targetStart,targetEnd}|null}
 */
function extendSeedPartial(feat, target, seedTargetIdx, seedFeatIdx, seedLen, xdrop, minLen, minStrongLen, threshold) {
  const flen = feat.length;
  const tlen = target.length;
  const diag = seedTargetIdx - seedFeatIdx; // targetIdx === featIdx + diag
  const seedStart = Math.max(0, seedFeatIdx);
  const seedEnd = Math.min(seedFeatIdx + seedLen, flen);

  // Extend right from the seed end (X-drop, snap to peak).
  let rightBound = seedEnd;
  {
    let score = 0, peak = 0, peakPos = seedEnd;
    for (let f = seedEnd; f < flen; f++) {
      const t = f + diag;
      if (t >= tlen) break;
      score += feat.charCodeAt(f) === target.charCodeAt(t) ? 1 : -1;
      if (score > peak) { peak = score; peakPos = f + 1; }
      else if (score <= peak - xdrop) break;
    }
    rightBound = peakPos;
  }

  // Extend left from the seed start (X-drop, snap to peak).
  let leftBound = seedStart;
  {
    let score = 0, peak = 0, peakPos = seedStart;
    for (let f = seedStart - 1; f >= 0; f--) {
      const t = f + diag;
      if (t < 0) break;
      score += feat.charCodeAt(f) === target.charCodeAt(t) ? 1 : -1;
      if (score > peak) { peak = score; peakPos = f; }
      else if (score <= peak - xdrop) break;
    }
    leftBound = peakPos;
  }

  const featStart = leftBound;
  const featEnd = rightBound;
  const extLen = featEnd - featStart;
  if (extLen < minLen) return null;

  let matches = 0;
  for (let f = featStart; f < featEnd; f++) {
    if (feat.charCodeAt(f) === target.charCodeAt(f + diag)) matches++;
  }
  const identity = matches / extLen;
  const coverage = extLen / flen;
  if (identity < threshold) return null;
  // Hybrid coverage floor (DEC-FDP-03 amendment): keep if ≥30% of the
  // feature, OR the matched span is absolutely long enough (minStrongLen).
  if (coverage < 0.30 && extLen < minStrongLen) return null;

  return {
    identity, coverage,
    featStart, featEnd,
    targetStart: featStart + diag,
    targetEnd: featEnd + diag,
  };
}

/** Protein partial extend: 8-aa seed, X-drop 8, 17-aa floor, 50-aa strong-floor. */
function extendProteinPartial(featProt, targetProt, seedTargetIdx, seedFeatIdx, threshold) {
  return extendSeedPartial(featProt, targetProt, seedTargetIdx, seedFeatIdx, 8, 8, 17, 50, threshold);
}

/** DNA partial extend: 12-nt seed, X-drop 20, 50-nt floor, 150-nt strong-floor. */
function extendDnaPartial(featSeq, targetSeq, seedTargetIdx, seedFeatIdx, threshold) {
  return extendSeedPartial(featSeq, targetSeq, seedTargetIdx, seedFeatIdx, 12, 20, 50, 150, threshold);
}

// V134 — max gap (nt, BOTH feature- and target-side) across which two collinear
// partial pieces of one feature are glued into one. Between a local edit (≤15 nt:
// substituted codon / small indel → merge) and a tag/linker insert (≥30 nt →
// stay split).
export const PARTIAL_MERGE_MAX_GAP = 18;

/**
 * Fold a cluster of collinear partial pieces (one feature, one strand) into one
 * span. Coords = bounding box (min/max). Identity = length-weighted member
 * matches over the merged feature span: each piece keeps its OWN diagonal, so an
 * internal insertion isn't penalised as a mismatch wall, while a substituted gap
 * (no piece covers it → 0 matches) lowers identity proportionally.
 */
function combineCluster(cluster, featLength) {
  if (cluster.length === 1) return cluster[0];
  let featureStart = Infinity, featureEnd = -Infinity, start = Infinity, end = -Infinity;
  let matches = 0;
  for (const p of cluster) {
    featureStart = Math.min(featureStart, p.featureStart);
    featureEnd = Math.max(featureEnd, p.featureEnd);
    start = Math.min(start, p.start);
    end = Math.max(end, p.end);
    const pLen = Math.max(0, p.featureEnd - p.featureStart);
    matches += (typeof p.identity === 'number' ? p.identity : 0) * pLen;
  }
  const mergedFeatLen = featureEnd - featureStart;
  const identity = mergedFeatLen > 0 ? Math.min(1, matches / mergedFeatLen) : cluster[0].identity;
  const coverage = featLength > 0 ? mergedFeatLen / featLength : cluster[0].coverage;
  return { ...cluster[0], start, end, featureStart, featureEnd, identity, coverage };
}

/**
 * V134 — merge collinear partial pieces of ONE feature that a local edit
 * (substituted codon / small indel) split into separate `_part_` rows. Per
 * feature, after greedy target-dedup: group by strand, sort by target `start`,
 * glue neighbours when BOTH the feature gap AND the target gap are ≤
 * PARTIAL_MERGE_MAX_GAP. A foreign insertion or a distant second copy has a huge
 * `targetGap` → the AND fails → stays split. Exported for unit testing.
 *
 * @param {Array<{start,end,strand,identity,coverage,featureStart,featureEnd}>} pieces
 * @param {{length?:number}} feat
 * @returns {Array} merged pieces (same shape)
 */
export function mergeCollinearPartials(pieces, feat) {
  if (!Array.isArray(pieces) || pieces.length <= 1) return pieces || [];
  const featLength = feat?.length || 0;
  const byStrand = new Map();
  for (const p of pieces) {
    const k = p.strand === -1 ? -1 : 1;
    if (!byStrand.has(k)) byStrand.set(k, []);
    byStrand.get(k).push(p);
  }
  const out = [];
  for (const group of byStrand.values()) {
    group.sort((a, b) => a.start - b.start);
    let cluster = [group[0]];
    for (let i = 1; i < group.length; i++) {
      const p = group[i];
      const last = cluster[cluster.length - 1];
      const featureGap = p.featureStart - last.featureEnd;
      const targetGap = p.start - last.end;
      if (featureGap <= PARTIAL_MERGE_MAX_GAP && targetGap <= PARTIAL_MERGE_MAX_GAP) {
        cluster.push(p);
      } else {
        out.push(combineCluster(cluster, featLength));
        cluster = [p];
      }
    }
    out.push(combineCluster(cluster, featLength));
  }
  return out;
}

/**
 * Local dedup + push of one feature's partial hits (DEC-FDP-09).
 * Sort by identity desc, greedily keep partials whose target-span (in
 * absolute seq nt coords) does not overlap an already-kept one — this
 * collapses duplicate extends from neighbouring seeds resolving to the
 * same locus while preserving genuinely separate split pieces. Then
 * (V134) merge collinear pieces of one feature that a local edit split.
 * @returns {number} count pushed
 */
function pushDedupedPartials(results, feat, partials, method) {
  if (partials.length === 0) return 0;
  partials.sort((a, b) => b.identity - a.identity);
  const accepted = [];
  for (const p of partials) {
    const overlaps = accepted.some(
      (a) => Math.max(p.start, a.start) < Math.min(p.end, a.end)
    );
    if (!overlaps) accepted.push(p);
  }
  const merged = mergeCollinearPartials(accepted, feat);
  for (const p of merged) {
    results.push({
      feature: feat,
      start: p.start,
      end: p.end,
      strand: p.strand,
      identity: p.identity,
      method,
      featureStart: p.featureStart,
      featureEnd: p.featureEnd,
      coverage: p.coverage,
    });
  }
  return merged.length;
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

    // CDS: protein exact match, then fuzzy fallback. Gate on type so
    // stray protein fields on regulatory features stay on the DNA path.
    if (feat.protein && feat.protein.length >= 10 && PROTEIN_PATHWAY_TYPES.has(feat.type)) {
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

          // Partial fallback (DEC-FDP-01/09): truncated / split CDS.
          // Reuse the same seeds; every seed hit drives its own extend,
          // all non-overlapping pieces survive (split-feature case).
          //
          // Skip comma-encoded proteins (27/234 in the SnapGene DB carry
          // variant N-termini like EGFP «M,V,SKGE…»): the commas are not
          // codons, so featStart*3 would be inflated and a clean-stretch
          // seed would mask the correct full DNA-identity match. These
          // route to the DNA branch instead, where coords are direct.
          if (!found && !feat.protein.includes(',')) {
            const featurePartials = [];
            for (const frame of frames) {
              const fp = feat.protein;
              const tp = frame.protein;
              for (const s of seeds) {
                let at = tp.indexOf(s.str);
                while (at >= 0) {
                  const r = extendProteinPartial(fp, tp, at, s.off, 0.90);
                  if (r) {
                    let ntStart = frame.strand === 1
                      ? frame.offset + r.targetStart * 3
                      : seq.length - (frame.offset + r.targetEnd * 3);
                    let ntEnd = frame.strand === 1
                      ? frame.offset + r.targetEnd * 3
                      : seq.length - (frame.offset + r.targetStart * 3);
                    // V138 — nt-refine: the protein match snaps box edges to the
                    // codon grid, clipping ≤2 nt of the gene's own DNA on a fragment
                    // cut mid-codon. Pull each edge outward (cap 2 nt = one partial
                    // codon) while the target still matches the feature's OWN DNA
                    // (`feat.sequence`, strand-aware) → box covers the whole gene DNA
                    // (matches the bare-import box `0..len`); cap stops a flank leak.
                    // Feature with only `.protein` (no DNA) → gd empty → skip (safe).
                    let fS = r.featStart * 3;
                    let fE = r.featEnd * 3;
                    const gd = (feat.sequence || '').toUpperCase();
                    if (gd) {
                      if (frame.strand === 1) {
                        let k = 0;
                        while (k < 2 && ntStart > 0 && fS > 0 && seq.charCodeAt(ntStart - 1) === gd.charCodeAt(fS - 1)) { ntStart--; fS--; k++; }
                        k = 0;
                        while (k < 2 && ntEnd < seq.length && fE < gd.length && seq.charCodeAt(ntEnd) === gd.charCodeAt(fE)) { ntEnd++; fE++; k++; }
                      } else {
                        // Gene on the − strand: target top strand = revComp(gd), so
                        // compare against the COMPLEMENT of the feature DNA. Left edge
                        // tracks the gene 3′ end (fE↑), right edge the 5′ start (fS↓).
                        const comp = (ch) => (ch === 65 ? 84 : ch === 84 ? 65 : ch === 71 ? 67 : ch === 67 ? 71 : 0);
                        let k = 0;
                        while (k < 2 && ntStart > 0 && fE < gd.length && seq.charCodeAt(ntStart - 1) === comp(gd.charCodeAt(fE))) { ntStart--; fE++; k++; }
                        k = 0;
                        while (k < 2 && ntEnd < seq.length && fS > 0 && seq.charCodeAt(ntEnd) === comp(gd.charCodeAt(fS - 1))) { ntEnd++; fS--; k++; }
                      }
                    }
                    featurePartials.push({
                      start: Math.max(0, ntStart),
                      end: Math.min(seq.length, ntEnd),
                      strand: frame.strand,
                      identity: r.identity,
                      coverage: r.coverage,
                      featureStart: fS,
                      featureEnd: fE,
                    });
                  }
                  at = tp.indexOf(s.str, at + 1);
                }
              }
            }
            if (pushDedupedPartials(results, feat, featurePartials, 'protein_partial') > 0) {
              found = true;
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
      let matchedFull = false;

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
        if (matched) { matchedFull = true; break; }
      }

      // Partial fallback (DEC-FDP-02/09/10): truncated / split feature.
      // Full DNA uses a single start-seed; partial needs 3 seeds at
      // 25/50/75% so a piece that lost the feature start (split case) is
      // still anchored. Every seed hit drives its own extend; non-
      // overlapping pieces all survive.
      if (!matchedFull) {
        const seedLen = Math.min(12, Math.floor(flen / 4));
        const seedOffsets = [
          Math.floor(flen * 0.25),
          Math.floor(flen * 0.50),
          Math.floor(flen * 0.75),
        ].filter((o) => o + seedLen <= flen);
        const seeds = seedOffsets
          .map((o) => ({ off: o, str: fseq.slice(o, o + seedLen) }))
          .filter((s) => s.str.length === seedLen);
        if (seeds.length > 0) {
          const featurePartials = [];
          for (const [targetSeq, strand] of [[seq, 1], [rc, -1]]) {
            for (const s of seeds) {
              let pos = targetSeq.indexOf(s.str);
              while (pos >= 0) {
                const r = extendDnaPartial(fseq, targetSeq, pos, s.off, identityThreshold);
                if (r) {
                  const ntStart = strand === 1 ? r.targetStart : seq.length - r.targetEnd;
                  const ntEnd = strand === 1 ? r.targetEnd : seq.length - r.targetStart;
                  featurePartials.push({
                    start: Math.max(0, ntStart),
                    end: Math.min(seq.length, ntEnd),
                    strand,
                    identity: r.identity,
                    coverage: r.coverage,
                    featureStart: r.featStart,
                    featureEnd: r.featEnd,
                  });
                }
                pos = targetSeq.indexOf(s.str, pos + 1);
              }
            }
          }
          pushDedupedPartials(results, feat, featurePartials, 'dna_partial');
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
