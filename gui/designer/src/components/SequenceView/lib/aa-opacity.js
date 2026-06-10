/**
 * lib/aa-opacity.js — per-position AA opacity for the Smart 6-frame
 * hybrid (Sprint M-B.3, K4 / DEC-SQV-02).
 *
 * The "auto" mode renders all 6 frames but DIMS positions outside any
 * detected ORF so the eye lands on the meaningful signal first. This
 * file is the only place that decides "should this AA char be 0.35 or
 * 1.0".
 *
 * Inputs:
 *   - position: top-strand absolute index of the codon middle base
 *   - frame, strand: identifier for the row we are colouring
 *   - strategy: 'single' or 'hybrid' (resolved upstream by frames-mode.js)
 *   - framesMode: original user choice — 'auto' | 'single' | 'all'
 *   - orfRanges: detector output (from orf-ranges.js)
 *   - dominantCDS: dominant annotated CDS (or detected ORF) — used in
 *     strategy='single' to gate the single forward row.
 *
 * Behaviour:
 *   - strategy === 'single':
 *       * Only the single forward row should call this; opacity is 1.0
 *         INSIDE dominantCDS, 0 OUTSIDE.
 *   - strategy === 'hybrid' && framesMode === 'all':
 *       * All 6 frames at 1.0 everywhere.
 *   - strategy === 'hybrid' && framesMode === 'auto':
 *       * 1.0 inside any ORF on this (frame, strand); 0.35 outside.
 *   - strategy === 'hybrid' && framesMode === 'single':
 *       * (caller should have produced strategy='single' instead, but if
 *          we hit this branch, default to single-row gating.)
 */

import { pickReadingFrame } from "./codon-walker.js";
import { TRANSLATABLE_TYPES } from "../constants.js";

const FADED_OPACITY = 0.35;

/**
 * Frame index for a region given the sequence length.
 *   forward (strand≠-1): `start % 3`
 *   reverse (strand===-1): `(seqLen - end) % 3`
 * Mirrors `walkRangeIntoRows` in AATrack.jsx so per-region frame matching
 * uses the same convention as the codon walker.
 */
export function regionFrame(region, fullSeq) {
  if (!region || typeof fullSeq !== "string") return null;
  // V133 — frame from the DNA (fewest stops), not start%3, so a partial CDS
  // whose boundary isn't on a codon matches the right (frame, strand) row.
  return pickReadingFrame(fullSeq, region.start | 0, region.end | 0, region.strand === -1);
}

/**
 * @param {object} ctx
 * @param {number} ctx.position
 * @param {0|1|2} ctx.frame
 * @param {1|-1} ctx.strand
 * @param {'single'|'hybrid'} ctx.strategy
 * @param {'auto'|'single'|'all'} ctx.framesMode
 * @param {Array<{ start, end, strand, frame, aaLen }>} [ctx.orfRanges]
 * @param {object|null} [ctx.dominantCDS]
 * @param {Array<object>} [ctx.regions] — annotated regions (CDS / gene / marker)
 * @param {number} [ctx.seqLen] — full sequence length, needed for reverse-CDS framing
 * @returns {number} 0 (hidden) | 0.35 (faded) | 1 (full)
 */
export function computeAAOpacity(ctx) {
  const {
    position,
    frame,
    strand,
    strategy,
    framesMode,
    orfRanges = [],
    dominantCDS,
    regions = [],
    seq = "",
  } = ctx;

  if (strategy === "single") {
    if (!dominantCDS) return 0;
    if (position < dominantCDS.start || position >= dominantCDS.end) return 0;
    return 1;
  }

  // strategy === 'hybrid'
  if (framesMode === "all") return 1;

  // 'auto' (or fallback): full inside any ORF on this (frame, strand) OR
  // inside an annotated CDS that lives in the same (frame, strand). The
  // annotated-CDS path was added 03.05.2026 evening — биолог: «в режиме
  // множественных рамок, та которая совпадает с размеченным CDS должна
  // тоже подсвечиваться». Without it, biolog-curated CDSes that ORF
  // detection happened to miss (short CDSes < the ORF length threshold,
  // CDSes spanning a stop-then-restart, etc.) read as faded text even
  // though they're the SIGNAL the user cares about.
  const inOrf = orfRanges.some(
    (o) =>
      o.strand === strand &&
      o.frame === frame &&
      position >= o.start &&
      position < o.end,
  );
  if (inOrf) return 1;

  const inCds = regions.some((r) => {
    if (!r || !TRANSLATABLE_TYPES.has(r.type)) return false;
    const rs = r.strand === -1 ? -1 : 1;
    if (rs !== strand) return false;
    if (regionFrame(r, seq) !== frame) return false;
    return position >= r.start && position < r.end;
  });
  // 03.05.2026 evening: «Авто по покрытию должно расставлять
  // автоматические рамки считывания но при этом СКРЫВАТЬ между ними
  // остальное, т.е должно быть как будто бы при аннотации. чистый
  // сиквенс валидных рамок. Призрачные не должны отражаться». Out-of-
  // signal positions return 0 (hidden) instead of FADED_OPACITY so
  // hybrid `auto` reads as a clean translation of detected/annotated
  // CDSes only — no faded ghost letters to compete with the signal.
  // `framesMode='all'` still renders every position at opacity 1 for
  // users who explicitly want to see all six frames.
  return inCds ? 1 : 0;
}

/**
 * Does the given (frame, strand) row carry ANY meaningful signal —
 * either a detected ORF or an annotated CDS / gene / marker — for the
 * supplied ranges? Used by AATrack hybrid `auto` to drop rows that
 * would render as nothing but faded grey letters (биолог: «когда
 * включена автодетекция КДС надо убирать рамки автоматически в
 * которых ничего нет»).
 */
export function frameHasSignal({ frame, strand, orfRanges = [], regions = [], seq = "" }) {
  const orfHit = orfRanges.some((o) => o.strand === strand && o.frame === frame);
  if (orfHit) return true;
  return regions.some((r) => {
    if (!r || !TRANSLATABLE_TYPES.has(r.type)) return false;
    const rs = r.strand === -1 ? -1 : 1;
    if (rs !== strand) return false;
    return regionFrame(r, seq) === frame;
  });
}

export const AA_FADED_OPACITY = FADED_OPACITY;
