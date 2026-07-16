/**
 * lib/derived-protein.js — DerivedProtein, the single source of truth for
 * "what protein does this CDS make" (P4.0). It is a PURE builder over the
 * existing splice + codon-walk primitives, so protein search, the AA track and
 * export can all agree instead of re-translating three different ways.
 *
 * Pipeline (identical to the AA track's spliced path so results converge):
 *   getIntronsForRegion → spliceRegion → resolveSplicedFrame → walkSplicedRegion
 *
 * The `g:[g0,g1,g2]` triple on each walked codon is the per-residue genomic
 * anchor the plan calls aaToGenomicMap — for a residue whose codon straddles an
 * intron the three positions are non-contiguous (jump between exons), which is
 * exactly what protein search needs to highlight the right exons.
 *
 * proteinSequence is the mature ORF: translation from the resolved frame up to
 * (not including) the first stop, so a His-tag search matches within the real
 * coding sequence rather than downstream out-of-frame junk. proteinSequence and
 * aaToGenomicMap stay index-aligned (both truncated at the same residue).
 */
import { getIntronsForRegion, spliceRegion } from '../intron-utils.js';
import { walkSplicedRegion } from '../components/SequenceView/lib/codon-walker.js';
import {
  resolveSplicedFrame, readCodonStart, readTranslTable, usesNonStandardCode, STANDARD_TABLE_ID,
} from './translate-cds.js';

/**
 * @param {string} fullSeq — top-strand genomic DNA
 * @param {object} region — translatable region {id?, name?, type?, start, end, strand, qualifiers?, frame?}
 * @param {Array} annotations — full annotation list (intron association reuses getIntronsForRegion)
 * @returns {null | {
 *   sourceCdsRef, cdsName, proteinSequence, strand, codonStart, frameSource,
 *   translationTable, nonStandardCode, exonSegments, aaToGenomicMap, intronCount,
 *   hasStop, diagnostics
 * }}
 */
export function deriveProtein(fullSeq, region, annotations) {
  if (typeof fullSeq !== 'string' || !region || region.start == null || region.end == null) return null;
  const strand = region.strand === -1 ? -1 : 1;
  const introns = getIntronsForRegion(annotations || [], region);
  const { spliced, exonMap, exons } = spliceRegion(fullSeq, region, introns);
  if (!spliced || spliced.length < 3) return null;

  const frame = resolveSplicedFrame(region, spliced);
  const frameSource = readCodonStart(region) != null
    ? 'codon_start'
    : (region.frame === 0 || region.frame === 1 || region.frame === 2)
      ? 'saved'
      : 'heuristic';

  const records = walkSplicedRegion(spliced, exonMap, frame, strand);
  const stopIdx = records.findIndex((r) => r.isStop);
  const mature = stopIdx >= 0 ? records.slice(0, stopIdx) : records;
  const proteinSequence = mature.map((r) => r.aa).join('');
  const aaToGenomicMap = mature.map((r, i) => ({ aa: r.aa, index: i + 1, g: r.g }));

  const translationTable = readTranslTable(region) || STANDARD_TABLE_ID;
  const nonStandardCode = usesNonStandardCode(region);

  return {
    sourceCdsRef: region.id != null ? region.id : null,
    cdsName: region.name || null,
    proteinSequence,
    strand,
    codonStart: frame,
    frameSource,
    translationTable,
    nonStandardCode,
    exonSegments: exons,
    aaToGenomicMap,
    intronCount: introns.length,
    hasStop: stopIdx >= 0,
    diagnostics: {
      frameSource, translationTable, nonStandardCode,
      intronCount: introns.length, length: proteinSequence.length,
    },
  };
}

// ── Optional memo (plan: "computed + cached, invalidated by sequenceRevision") ──
// The caller supplies a cacheKey that encodes the entry revision + region id, so
// an edit (new revision) naturally misses. No key → no caching (pure call).
const _cache = new Map();
const CACHE_MAX = 128;

export function clearDerivedProteinCache() { _cache.clear(); }

export function deriveProteinCached(fullSeq, region, annotations, cacheKey) {
  if (!cacheKey) return deriveProtein(fullSeq, region, annotations);
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);
  const dp = deriveProtein(fullSeq, region, annotations);
  _cache.set(cacheKey, dp);
  while (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
  return dp;
}
