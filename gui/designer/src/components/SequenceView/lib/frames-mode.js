/**
 * lib/frames-mode.js — resolve user-facing AA-frames mode into the
 * concrete render strategy (Sprint M-B.3, K4 / DEC-SQV-02).
 *
 * Three user-facing settings:
 *   - 'auto'   — Smart trinity. If detected dominant CDS coverage exceeds
 *                `autoThreshold` (default 0.8) → render single forward
 *                frame under the CDS. Otherwise render hybrid (single +
 *                all 6 with low opacity outside ORFs).
 *   - 'single' — Always render only the single forward frame under CDS.
 *   - 'all'    — Always render all 6 frames at full opacity.
 *
 * Returned strategy:
 *   - 'single' → AATrack renders ONE forward AA row per CDS.
 *   - 'hybrid' → AATrack renders the single forward row AND all 6 frame
 *                rows; opacity is decided per-position by aa-opacity.js.
 *
 * Caller responsibility: feed the regions list (so we know if any CDS
 * exists), the sequence length, and an ORF list when no annotated CDS
 * is present. We treat ANY annotated CDS as the dominant signal first;
 * fall back to detected ORFs only when no CDS is annotated.
 */

import { TRANSLATABLE_TYPES } from "../constants.js";

const VALID_MODES = new Set(["auto", "single", "all"]);

/** Find the broadest annotated coding region (CDS/gene/marker/reporter), or null. */
function findDominantAnnotatedCDS(regions) {
  if (!Array.isArray(regions) || regions.length === 0) return null;
  const cdses = regions.filter((r) => TRANSLATABLE_TYPES.has(r.type));
  if (cdses.length === 0) return null;
  let best = cdses[0];
  for (const r of cdses) {
    if (r.end - r.start > best.end - best.start) best = r;
  }
  return best;
}

/**
 * @param {'auto'|'single'|'all'} framesMode
 * @param {number} autoThreshold — 0..1 (only consulted in 'auto')
 * @param {Array<{ start, end, type, ... }>} regions
 * @param {number} seqLen
 * @param {Array<{ start, end, strand, frame, aaLen }>} [orfRanges=[]]
 * @returns {{ strategy: 'single'|'hybrid', dominant: object|null, coverage: number }}
 */
export function resolveFramesMode(framesMode, autoThreshold, regions, seqLen, orfRanges = []) {
  const mode = VALID_MODES.has(framesMode) ? framesMode : "auto";

  if (mode === "single") {
    const dom = findDominantAnnotatedCDS(regions) || pickDominantORF(orfRanges);
    return { strategy: "single", dominant: dom, coverage: coverageOf(dom, seqLen) };
  }
  if (mode === "all") {
    const dom = findDominantAnnotatedCDS(regions) || pickDominantORF(orfRanges);
    return { strategy: "hybrid", dominant: dom, coverage: coverageOf(dom, seqLen) };
  }

  // 'auto'
  const dom = findDominantAnnotatedCDS(regions) || pickDominantORF(orfRanges);
  const cov = coverageOf(dom, seqLen);
  const t = Number.isFinite(autoThreshold) ? autoThreshold : 0.8;
  return { strategy: cov > t ? "single" : "hybrid", dominant: dom, coverage: cov };
}

function pickDominantORF(orfRanges) {
  if (!Array.isArray(orfRanges) || orfRanges.length === 0) return null;
  const fwd = orfRanges.filter((o) => o.strand === 1);
  if (fwd.length === 0) return null;
  let best = fwd[0];
  for (const o of fwd) {
    if (o.end - o.start > best.end - best.start) best = o;
  }
  return best;
}

function coverageOf(dom, seqLen) {
  if (!dom || !seqLen) return 0;
  return (dom.end - dom.start) / seqLen;
}
