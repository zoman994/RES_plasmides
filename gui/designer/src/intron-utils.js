/**
 * Intron detection and cDNA extraction utilities.
 *
 * Introns are detail annotations with type='intron' inside CDS regions.
 * Detection: scan GT...AG pairs that remove premature stop codons.
 * cDNA: splice out introns, join exons.
 */

import { translateDNA } from './codons';
import { generateRegionId } from './domain-detection';
import { reverseComplement } from './sequence-utils';

/**
 * Detect candidate introns in a genomic CDS sequence.
 * Scans GT...AG pairs (donor...acceptor) that:
 *   - Are 50-2000 nt long
 *   - Removing them eliminates a premature stop codon
 *   - Preserve reading frame (length divisible by 3 preferred)
 *
 * @param {string} genomicSequence — CDS sequence (may contain introns)
 * @returns {Array<{ start, end, length, donor, acceptor, score, removesStops }>}
 */
export function detectIntrons(genomicSequence) {
  const seq = genomicSequence.toUpperCase();

  // First find premature stop positions
  const protein = translateDNA(seq);
  const stopPositions = [];
  for (let i = 0; i < protein.length - 1; i++) {
    if (protein[i] === '*') stopPositions.push(i * 3);
  }
  if (stopPositions.length === 0) return []; // no premature stops, no introns needed

  const candidates = [];

  for (let i = 0; i < seq.length - 10; i++) {
    // Look for GT donor site
    if (seq[i] !== 'G' || seq[i + 1] !== 'T') continue;

    // Scan for AG acceptor in range 50-2000nt downstream
    for (let j = i + 50; j < Math.min(i + 2000, seq.length - 2); j++) {
      if (seq[j] !== 'A' || seq[j + 1] !== 'G') continue;

      const intronEnd = j + 2;
      const intronLen = intronEnd - i;

      // Check: does removing this intron eliminate at least one stop?
      const withoutIntron = seq.slice(0, i) + seq.slice(intronEnd);
      const newProtein = translateDNA(withoutIntron);
      const newStops = [];
      for (let k = 0; k < newProtein.length - 1; k++) {
        if (newProtein[k] === '*') newStops.push(k);
      }

      const removedStops = stopPositions.filter(sp => sp >= i && sp < intronEnd);
      if (removedStops.length === 0) continue; // doesn't help

      // Score: prefer frame-preserving, shorter, more stops removed
      let score = removedStops.length * 10;
      if (intronLen % 3 === 0) score += 5; // frame-preserving
      if (intronLen >= 60 && intronLen <= 500) score += 3; // typical intron size
      score -= newStops.length * 2; // penalize remaining stops

      candidates.push({
        start: i,
        end: intronEnd,
        length: intronLen,
        donor: 'GT',
        acceptor: 'AG',
        score,
        removesStops: removedStops.length,
        framePreserving: intronLen % 3 === 0,
      });
    }
  }

  // Sort by score descending, deduplicate overlapping
  candidates.sort((a, b) => b.score - a.score);

  // Greedy non-overlapping selection
  const selected = [];
  for (const c of candidates) {
    if (selected.some(s => c.start < s.end && c.end > s.start)) continue;
    selected.push(c);
  }

  return selected.sort((a, b) => a.start - b.start);
}

/**
 * Convert detected intron candidates to detail annotations.
 *
 * @param {Array} introns — from detectIntrons()
 * @param {string} regionId — parent CDS region ID
 * @param {number} regionStart — offset of the CDS region within the Part
 * @returns {Array} annotation objects with level='detail', type='intron'
 */
export function intronsToAnnotations(introns, regionId, regionStart = 0) {
  return introns.map((intr, i) => ({
    name: `intron ${i + 1}`,
    type: 'intron',
    start: intr.start + regionStart,
    end: intr.end + regionStart,
    level: 'detail',
    regionId,
    auto: false,
    source: 'intron_detection',
    color: '#9CA3AF',
    metadata: {
      donorSite: 'GT',
      acceptorSite: 'AG',
      length: intr.length,
      framePreserving: intr.framePreserving,
    },
  }));
}

/**
 * Extract cDNA by splicing out introns from a genomic sequence.
 *
 * @param {string} genomicSequence — full sequence
 * @param {Array} introns — annotation objects with start/end (absolute coords)
 * @returns {string} cDNA sequence (exons joined)
 */
export function getCDNA(genomicSequence, introns) {
  if (!introns?.length) return genomicSequence;

  // Sort introns by start position descending (remove from end to preserve coords)
  const sorted = [...introns].sort((a, b) => b.start - a.start);
  let cdna = genomicSequence;
  for (const intr of sorted) {
    cdna = cdna.slice(0, intr.start) + cdna.slice(intr.end);
  }
  return cdna;
}

/**
 * Build exon ranges from intron annotations within a CDS region.
 *
 * @param {number} regionStart — CDS region start
 * @param {number} regionEnd — CDS region end
 * @param {Array} introns — intron annotations within this region
 * @returns {Array<{ start, end, name }>} exon ranges
 */
export function getExonRanges(regionStart, regionEnd, introns) {
  if (!introns?.length) return [{ start: regionStart, end: regionEnd, name: 'exon 1' }];

  const sorted = [...introns].sort((a, b) => a.start - b.start);
  const exons = [];
  let pos = regionStart;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].start > pos) {
      exons.push({ start: pos, end: sorted[i].start, name: `exon ${exons.length + 1}` });
    }
    pos = sorted[i].end;
  }
  if (pos < regionEnd) {
    exons.push({ start: pos, end: regionEnd, name: `exon ${exons.length + 1}` });
  }

  return exons;
}

/**
 * Collect the introns that belong to a translatable region, normalising the
 * two intron shapes the codebase produces:
 *   - detail introns linked by `regionId` (manual / intronsToAnnotations)
 *   - region-level introns with no parent (the frame-aware gene parser)
 *
 * A detail intron is authoritative iff its regionId matches the region; a
 * region-level intron is adopted by geometric containment on the SAME strand
 * (so an intron sitting inside an overlapping opposite-strand CDS is not
 * wrongly captured).
 *
 * @param {Array} annotations — the full annotation list
 * @param {object} region — a translatable region {id, start, end, strand}
 * @returns {Array} intron annotations that splice this region
 */
export function getIntronsForRegion(annotations, region) {
  if (!Array.isArray(annotations) || !region) return [];
  const rStrand = region.strand === -1 ? -1 : 1;
  return annotations.filter((a) => {
    if (!a || a.type !== 'intron') return false;
    // The annotation links to its parent CDS via `regionId` (raw annotation
    // shape) or `parentId` (feature-map shape passed to the SequenceView).
    const link = a.regionId != null ? a.regionId : a.parentId;
    if (link != null) return region.id != null && link === region.id;
    // region-level intron with no parent: adopt by containment + matching strand
    const inside = a.start >= region.start && a.end <= region.end && a.end > a.start;
    if (!inside) return false;
    const aStrand = a.strand === -1 ? -1 : (a.strand === 1 ? 1 : rStrand);
    return aStrand === rStrand;
  });
}

/**
 * Splice a translatable region: remove its introns and return the mature
 * coding sequence (5′→3′ on the strand the CDS is read) plus a bidirectional
 * spliced↔genomic coordinate map.
 *
 * exonMap is an ordered array of segments in SPLICED order, each
 *   { sStart, sEnd, gStart, step }
 * where genomic position of spliced index s ∈ [sStart, sEnd) is
 *   gStart + (s − sStart) * step      (step = +1 forward, −1 reverse).
 *
 * @param {string} fullSeq — top-strand genomic DNA
 * @param {object} region — {start, end, strand}
 * @param {Array} introns — intron annotations (genomic coords); only those
 *   overlapping the region are used (clamped to it)
 * @returns {{ spliced:string, exonMap:Array, exons:Array, strand:1|-1 }}
 */
export function spliceRegion(fullSeq, region, introns) {
  const seq = fullSeq || '';
  const start = Math.max(0, region.start | 0);
  const end = Math.min(seq.length, region.end | 0);
  const within = (introns || [])
    .filter((it) => it && it.start < end && it.end > start)
    .map((it) => ({ start: Math.max(start, it.start | 0), end: Math.min(end, it.end | 0) }))
    .filter((it) => it.end > it.start)
    .sort((a, b) => a.start - b.start);

  const exons = getExonRanges(start, end, within);
  const topSpliced = exons.map((e) => seq.slice(e.start, e.end)).join('');
  const reverse = region.strand === -1;
  const spliced = reverse ? reverseComplement(topSpliced) : topSpliced;

  const exonMap = [];
  let s = 0;
  if (!reverse) {
    for (const e of exons) {
      const len = e.end - e.start;
      exonMap.push({ sStart: s, sEnd: s + len, gStart: e.start, step: 1 });
      s += len;
    }
  } else {
    // mature mRNA reads from the highest genomic exon base downward
    for (let i = exons.length - 1; i >= 0; i--) {
      const e = exons[i];
      const len = e.end - e.start;
      exonMap.push({ sStart: s, sEnd: s + len, gStart: e.end - 1, step: -1 });
      s += len;
    }
  }
  return { spliced, exonMap, exons, strand: reverse ? -1 : 1 };
}

/** Map a spliced (mature) position to its genomic position, or −1. */
export function splicedToGenomic(exonMap, sPos) {
  for (const seg of exonMap) {
    if (sPos >= seg.sStart && sPos < seg.sEnd) {
      return seg.gStart + (sPos - seg.sStart) * seg.step;
    }
  }
  return -1;
}

/** Map a genomic position to its spliced position, or −1 if it lands in an intron. */
export function genomicToSpliced(exonMap, gPos) {
  for (const seg of exonMap) {
    const off = (gPos - seg.gStart) * seg.step; // step is ±1 → inverts cleanly
    if (off >= 0 && off < seg.sEnd - seg.sStart) return seg.sStart + off;
  }
  return -1;
}
