/**
 * lib/translate-cds.js — reading-frame resolution + CDS translation honoring the
 * INSDC /codon_start and /transl_table provenance persisted on import (P4.0).
 *
 * The reading frame is resolved by priority:
 *   1. explicit /codon_start qualifier (1|2|3 → spliced-frame offset 0|1|2)
 *   2. a persisted saved frame (region.frame, if the model ever stores one)
 *   3. heuristic (fewest in-frame stops) — the pre-P4 behaviour (pickSplicedFrame)
 *
 * `spliced` throughout is the mature 5'→3' coding sequence produced by
 * spliceRegion (already reverse-complemented for a − strand CDS), so a frame
 * offset applies identically regardless of strand.
 *
 * Genetic code: the standard NCBI table 1 (codons.js CODON_TABLE) is the only
 * table implemented today — correct for fungal nuclear genes (BodgeGene's
 * primary domain). transl_table is READ and surfaced (usesNonStandardCode) so a
 * non-standard code is flagged rather than silently mistranslated; alternate
 * code tables are a deliberate follow-up.
 */
import { CODON_TABLE } from '../codons.js';
import { pickSplicedFrame } from '../components/SequenceView/lib/codon-walker.js';

export const STANDARD_TABLE_ID = 1;

/**
 * INSDC /codon_start (1|2|3, 1-based) → spliced-frame offset (0|1|2).
 * Absent/invalid → null. Values ride as strings on ann.qualifiers.
 */
export function codonStartToFrame(codonStart) {
  const n = typeof codonStart === 'string' ? parseInt(codonStart, 10) : codonStart;
  if (n === 1 || n === 2 || n === 3) return n - 1;
  return null;
}

/** Read a persisted /codon_start off a region's qualifiers bag → frame offset, or null. */
export function readCodonStart(region) {
  const cs = region && region.qualifiers ? region.qualifiers.codon_start : undefined;
  return codonStartToFrame(cs);
}

/** Read a persisted /transl_table → NCBI genetic-code id (number), or null if absent/invalid. */
export function readTranslTable(region) {
  const t = region && region.qualifiers ? region.qualifiers.transl_table : undefined;
  const n = typeof t === 'string' ? parseInt(t, 10) : t;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Resolve the reading frame (0|1|2) for a CDS on its mature spliced sequence,
 * honoring the codon_start → saved-frame → heuristic priority chain.
 * @param {object} region — {qualifiers?:{codon_start}, frame?}
 * @param {string} spliced — mature 5'→3' coding sequence
 * @returns {0|1|2}
 */
export function resolveSplicedFrame(region, spliced) {
  const cs = readCodonStart(region);
  if (cs != null) return cs;
  const saved = region && region.frame;
  if (saved === 0 || saved === 1 || saved === 2) return saved;
  return pickSplicedFrame(spliced || '');
}

/**
 * Whether the CDS declares a non-standard genetic code we do not yet honor
 * (any transl_table other than 1). Surfaced so callers can flag the result
 * rather than silently mistranslate stops.
 */
export function usesNonStandardCode(region) {
  const t = readTranslTable(region);
  return t != null && t !== STANDARD_TABLE_ID;
}

/**
 * Translate a mature spliced coding sequence from `frame` using the standard
 * genetic code (or an override table). Returns the raw protein string — internal
 * stops kept as '*', unknown codon → 'X', lowercase tolerated (matches
 * translateDNA / walkCodons, V151).
 * @param {string} spliced
 * @param {0|1|2} frame
 * @param {{codonTable?:object}} [opts]
 * @returns {string}
 */
export function translateSpliced(spliced, frame = 0, opts = {}) {
  const table = opts.codonTable || CODON_TABLE;
  if (typeof spliced !== 'string') return '';
  const s = spliced.toUpperCase();
  let p = '';
  for (let i = frame; i + 3 <= s.length; i += 3) p += table[s.slice(i, i + 3)] || 'X';
  return p;
}

/** Strip a trailing run of stop codons ('*') from a protein string. */
export function stripTrailingStops(protein) {
  return typeof protein === 'string' ? protein.replace(/\*+$/, '') : '';
}
