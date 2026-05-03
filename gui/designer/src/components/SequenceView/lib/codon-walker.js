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
