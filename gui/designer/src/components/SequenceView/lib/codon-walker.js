/**
 * lib/codon-walker.js — translate a sequence into per-codon AA records
 * for the AATrack (Sprint M-B.3, K4).
 *
 * Returns one record per codon position with the absolute middle-base
 * index so the AATrack can render the AA char inside the middle column
 * of the codon's 3-char span (matches SnapGene placement).
 *
 * Coordinate convention:
 *   - position = absolute index of the middle base (codon start + 1)
 *   - strand = +1 → codon read from the top strand 5'→3'
 *   - strand = -1 → codon read from the antisense strand 3'→5' (we
 *     pre-translate via reverse-complement so the caller still slots
 *     chars onto the rendered LINE; the position remains absolute on
 *     top-strand coordinates).
 */

import { CODON_TABLE } from "../../../codons.js";

const RC_MAP = { A: "T", T: "A", G: "C", C: "G", N: "N" };

function complementChar(c) {
  return RC_MAP[c] || "N";
}

// Bounded LRU-ish cache for codon walks, keyed by the actual sequence
// string. AATrack renders one instance per SequenceLine — typically
// 60+ for an 8 kb plasmid — and each instance previously called
// walkCodons(fullSeq, frame, strand) for every (frame, strand) row,
// burning ~360 full-plasmid translations per render. With this cache
// each (sequence, frame, strand) tuple translates exactly once across
// every line that shares the sequence reference.
//
// Implementation note: WeakMap can't be keyed on strings, so we use a
// plain Map and trim from the oldest when it grows past a small bound.
// The bound is sized to comfortably hold a handful of distinct plasmid
// strings; collisions would only force a re-translate, never corrupt.
const STRING_CACHE_MAX = 32;
const _stringCache = new Map();
function _trimStringCache() {
  while (_stringCache.size > STRING_CACHE_MAX) {
    const oldest = _stringCache.keys().next().value;
    _stringCache.delete(oldest);
  }
}

/**
 * Cached variant of walkCodons. Returns the codons array AND a
 * `byPosition` Map from middle-base position → codon record so the
 * caller can do O(1) lookups instead of per-cell `Array.find`. Both
 * references are stable for the same (sequence, frame, strand) tuple.
 */
export function walkCodonsCached(sequence, frame, strand) {
  if (typeof sequence !== 'string') return { codons: [], byPosition: new Map() };
  const cacheKey = `${frame}:${strand}`;
  let perSeq = _stringCache.get(sequence);
  if (perSeq) {
    const hit = perSeq.get(cacheKey);
    if (hit) return hit;
  }
  const codons = walkCodons(sequence, frame, strand);
  const byPosition = new Map();
  for (let i = 0; i < codons.length; i++) byPosition.set(codons[i].position, codons[i]);
  const entry = { codons, byPosition };
  if (!perSeq) {
    perSeq = new Map();
    _stringCache.set(sequence, perSeq);
    _trimStringCache();
  }
  perSeq.set(cacheKey, entry);
  return entry;
}

// V133 — frame-pick cache. Per-sequence Map (content-safe, like _stringCache),
// sub-keyed by `${start}:${end}:${strand}`. pickReadingFrame is called per AA
// cell in hybrid auto, so without this it would re-count stops on every cell.
const _framePickCache = new Map();
function _trimFramePickCache() {
  while (_framePickCache.size > STRING_CACHE_MAX) {
    const oldest = _framePickCache.keys().next().value;
    _framePickCache.delete(oldest);
  }
}

/**
 * Pick the reading frame (0|1|2) for a CDS region [start, end) on the given
 * strand by translating the DNA in all three frames and counting the in-window
 * stop codons — choose the frame with the fewest. A partial CDS whose boundary
 * isn't on a codon (start%3 ≠ its real phase) then still reads as protein
 * instead of stops.
 *
 * Robust tie-break: prefer the naive coord-derived frame
 * (`isReverse ? (seqLen-end)%3 : start%3`) UNLESS another frame has more than 1
 * fewer stops. The +1 absorbs a CDS's expected terminal stop, so a clean naive
 * frame is never displaced by a coincidentally stop-free off-frame; a real
 * frameshift (many scattered stops) is still overridden. Memoized per
 * (sequence, start, end, strand).
 *
 * @param {string} fullSeq — top-strand uppercase DNA
 * @returns {0|1|2}
 */
export function pickReadingFrame(fullSeq, start, end, isReverse) {
  const seqLen = typeof fullSeq === "string" ? fullSeq.length : 0;
  const naive = isReverse
    ? (((seqLen - end) % 3) + 3) % 3
    : (((start % 3) + 3) % 3);
  if (!fullSeq || end - start < 3) return naive;
  const strand = isReverse ? -1 : 1;
  const subKey = `${start}:${end}:${strand}`;
  let perSeq = _framePickCache.get(fullSeq);
  if (perSeq) {
    const hit = perSeq.get(subKey);
    if (hit !== undefined) return hit;
  }
  const stops = [0, 0, 0];
  for (let f = 0; f < 3; f++) {
    const { codons } = walkCodonsCached(fullSeq, f, strand);
    let n = 0;
    for (const c of codons) {
      const codonStart = c.position - 1; // same window as walkRangeIntoRows
      if (codonStart >= start && codonStart + 3 <= end && c.aa === "*") n += 1;
    }
    stops[f] = n;
  }
  const minStops = Math.min(stops[0], stops[1], stops[2]);
  const picked = stops[naive] <= minStops + 1 ? naive : stops.indexOf(minStops);
  if (!perSeq) { perSeq = new Map(); _framePickCache.set(fullSeq, perSeq); _trimFramePickCache(); }
  perSeq.set(subKey, picked);
  return picked;
}

/**
 * Walk codons for a given frame and strand.
 *
 * @param {string} sequence — top-strand uppercase DNA
 * @param {0|1|2} frame
 * @param {1|-1} strand
 * @returns {Array<{ aa: string, position: number, codon: string, isStart: boolean, isStop: boolean, frame: 0|1|2, strand: 1|-1 }>}
 */
export function walkCodons(sequence, frame, strand) {
  if (!sequence || typeof sequence !== "string") return [];
  const seqLen = sequence.length;
  const out = [];

  if (strand === 1) {
    for (let i = frame; i + 3 <= seqLen; i += 3) {
      const codon = sequence.slice(i, i + 3);
      const aa = CODON_TABLE[codon] || "X";
      out.push({
        aa,
        position: i + 1, // middle base (0-based)
        codon,
        isStart: aa === "M" && (out.length === 0 || out[out.length - 1].isStop),
        isStop: aa === "*",
        frame,
        strand,
      });
    }
    return out;
  }

  // Reverse strand — read codons on antisense from 3'→5' end of top strand.
  // For a top-strand position p, the antisense base is complementary.
  // Walk along top strand from end backward, complementing each base.
  for (let i = seqLen - 1 - frame; i - 2 >= 0; i -= 3) {
    const codon =
      complementChar(sequence[i]) +
      complementChar(sequence[i - 1]) +
      complementChar(sequence[i - 2]);
    const aa = CODON_TABLE[codon] || "X";
    // Middle base on top-strand coordinates.
    const middlePos = i - 1;
    out.push({
      aa,
      position: middlePos,
      codon,
      isStart: aa === "M" && (out.length === 0 || out[out.length - 1].isStop),
      isStop: aa === "*",
      frame,
      strand,
    });
  }
  return out;
}
