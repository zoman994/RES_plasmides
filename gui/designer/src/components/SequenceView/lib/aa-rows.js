/**
 * aa-rows.js — builds the per-(strand, frame) amino-acid row maps for the
 * SequenceView AA track's 'single' strategy. Extracted from AATrack.jsx in the
 * splice sprint (closes part of TD-SIZE-AATRACK) and made SPLICE-AWARE:
 *
 *   A translatable region that carries introns (detail introns linked by
 *   regionId/parentId, or region-level introns contained on the same strand)
 *   is translated from its MATURE spliced sequence — the reading frame is
 *   threaded across exons, intronic stops disappear, and amino acids are
 *   numbered by mature-mRNA index. A region with no introns is translated by
 *   the unchanged contiguous walk, so existing single-CDS plasmids render
 *   byte-identically.
 *
 * Returned shape (unchanged): ordered Array of
 *   { rowKey, strand, frame, label, map: Map<genomicMiddlePos, codonRecord> }
 * codonRecord: { aa, codon, isStart, isStop, regionId, strand, aaIndex?, spliced? }
 * `aaIndex`/`spliced` are present only for spliced rows; the renderer prefers
 * `aaIndex` for AA numbering when set.
 */

import {
  walkCodons,
  pickReadingFrame,
  walkSplicedRegion,
  pickSplicedFrame,
} from "./codon-walker.js";
import { getIntronsForRegion, spliceRegion } from "../../../intron-utils.js";
import { TRANSLATABLE_TYPES } from "../constants.js";

// Canonical row order: +1, +2, +3, -1, -2, -3 (top-down). Empty rows are
// dropped at the build layer so simple plasmids show a single tidy row.
const ROW_ORDER = [
  { rowKey: "1:0", strand: 1, frame: 0, label: "+1" },
  { rowKey: "1:1", strand: 1, frame: 1, label: "+2" },
  { rowKey: "1:2", strand: 1, frame: 2, label: "+3" },
  { rowKey: "-1:0", strand: -1, frame: 0, label: "-1" },
  { rowKey: "-1:1", strand: -1, frame: 1, label: "-2" },
  { rowKey: "-1:2", strand: -1, frame: 2, label: "-3" },
];

function getOrCreateRow(rows, isReverse, frame) {
  const rowKey = `${isReverse ? -1 : 1}:${frame}`;
  let rowMap = rows.get(rowKey);
  if (!rowMap) {
    rowMap = new Map();
    rows.set(rowKey, rowMap);
  }
  return rowMap;
}

// Contiguous (no-intron) walk — unchanged from the original AATrack body.
function walkRangeIntoRows(rows, fullSeq, start, end, isReverse, regionId) {
  if (end - start < 3) return;
  // V133 — frame chosen from the DNA (fewest stops), not start%3, so a partial
  // CDS whose boundary isn't on a codon reads as protein, not stops.
  const frame = pickReadingFrame(fullSeq, start, end, isReverse);
  const rowMap = getOrCreateRow(rows, isReverse, frame);
  const codons = walkCodons(fullSeq, frame, isReverse ? -1 : 1);
  let firstHit = true;
  for (const c of codons) {
    const codonStart = c.position - 1;
    const codonEnd = codonStart + 3;
    if (isReverse) {
      if (codonEnd > end) continue;
      if (codonStart < start) break;
    } else {
      if (codonStart < start) continue;
      if (codonEnd > end) break;
    }
    if (!rowMap.has(c.position)) {
      rowMap.set(c.position, {
        aa: c.aa,
        codon: c.codon,
        isStart: firstHit && c.aa === "M",
        isStop: c.aa === "*",
        regionId,
        strand: isReverse ? -1 : 1,
        frame,
        genomicPositions: isReverse
          ? [c.position + 1, c.position, c.position - 1]
          : [c.position - 1, c.position, c.position + 1],
      });
    }
    firstHit = false;
  }
}

// Splice-aware walk — translate the region's mature spliced sequence and slot
// each codon onto its genomic middle base. Intronic stops are gone; amino acids
// carry their mature-mRNA index so the renderer numbers them correctly.
function walkSplicedIntoRows(rows, fullSeq, region, introns) {
  const isReverse = region.strand === -1;
  const { spliced, exonMap } = spliceRegion(fullSeq, region, introns);
  if (!spliced || spliced.length < 3) return;
  const frame = pickSplicedFrame(spliced);
  const codons = walkSplicedRegion(spliced, exonMap, frame, isReverse ? -1 : 1);
  const rowMap = getOrCreateRow(rows, isReverse, frame);
  const regionId = region.id || `cds:${region.start}:${region.end}`;
  let firstHit = true;
  for (const c of codons) {
    if (c.position < 0) continue; // middle base landed outside the exons (guard)
    if (!rowMap.has(c.position)) {
      rowMap.set(c.position, {
        aa: c.aa,
        codon: c.codon,
        isStart: firstHit && c.aa === "M",
        isStop: c.aa === "*",
        regionId,
        strand: isReverse ? -1 : 1,
        aaIndex: c.splicedIndex,
        spliced: true,
        frame: c.frame,
        genomicPositions: c.g,
      });
    }
    firstHit = false;
  }
}

/**
 * Build the AA rows for every annotated translatable region. Splice-aware:
 * regions with introns go through walkSplicedIntoRows, the rest through the
 * contiguous walkRangeIntoRows.
 *
 * @param {string} fullSeq
 * @param {Array<object>} regions — the full feature list (CDS/gene + introns)
 * @param {Array<object>} orfRanges — unused (auto ORFs removed 03.05.2026)
 * @returns {Array<{ rowKey, strand, frame, label, map }>}
 */
export function buildCdsAARows(fullSeq, regions, orfRanges, opts = {}) {
  const rows = new Map();
  if (!fullSeq) return [];
  const seqLen = fullSeq.length;

  // «Ген разрезан — тянуть AA до реза» (Игорь 22.06): when a terminal sticky-end
  // CUT sits at a fragment end, the (forward) gene that reaches that end was cut
  // there, so translate its frame up to the cut (last full codon) instead of
  // stopping at the clipped feature end. Only the terminal-most translatable
  // feature within ~10 codons of the terminus is extended — «если рамка там была».
  const rid = (r) => r.id || `cds:${r.start}:${r.end}`;
  const cut = opts.terminalCut || {};
  const NEAR = 30;
  let extendEndId = null; let extendStartId = null;
  // The terminal gene (max-end for a right cut, min-start for a left cut) gets its
  // translation extended to the cut — works for BOTH strands (a reverse gene cut
  // at the terminus has its frame there too; walkRangeIntoRows reads it backward).
  const translatable = (Array.isArray(regions) ? regions : [])
    .filter((r) => r && TRANSLATABLE_TYPES.has(r.type)
      && !getIntronsForRegion(regions, r).length);
  if (cut.right && translatable.length) {
    const term = translatable.reduce((a, b) => ((b.end | 0) > (a.end | 0) ? b : a));
    if ((term.end | 0) >= seqLen - NEAR && (term.end | 0) < seqLen) extendEndId = rid(term);
  }
  if (cut.left && translatable.length) {
    const term = translatable.reduce((a, b) => ((b.start | 0) < (a.start | 0) ? b : a));
    if ((term.start | 0) <= NEAR && (term.start | 0) > 0) extendStartId = rid(term);
  }

  if (Array.isArray(regions)) {
    for (const region of regions) {
      if (!region || !TRANSLATABLE_TYPES.has(region.type)) continue;
      const introns = getIntronsForRegion(regions, region);
      if (introns.length) {
        walkSplicedIntoRows(rows, fullSeq, region, introns);
      } else {
        const id = rid(region);
        walkRangeIntoRows(
          rows,
          fullSeq,
          extendStartId === id ? 0 : Math.max(0, Math.min(seqLen, region.start | 0)),
          extendEndId === id ? seqLen : Math.max(0, Math.min(seqLen, region.end | 0)),
          region.strand === -1,
          id,
        );
      }
    }
  }

  // Auto-detected ORFs were removed 03.05.2026 (dense plasmids cluttered the
  // AA row); annotation-only translation reads cleaner.
  void orfRanges;

  // Materialize in canonical row order, drop empty rows.
  return ROW_ORDER
    .map((r) => ({ ...r, map: rows.get(r.rowKey) || new Map() }))
    .filter((r) => r.map.size > 0);
}
