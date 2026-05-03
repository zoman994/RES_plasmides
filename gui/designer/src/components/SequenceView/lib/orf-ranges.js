/**
 * lib/orf-ranges.js — display-side ORF detector for the Smart 6-frame
 * trinity (Sprint M-B.3, K4 / DEC-SQV-02).
 *
 * Why a SECOND ORF detector instead of reusing src/orf-detection.js?
 *   - auto-annotate.js uses minAA=100 + a 50% overlap filter to avoid
 *     duplicating annotated CDSes. That's correct for ANNOTATION but
 *     wrong for DISPLAY: small ORFs the biologist actually wants to see
 *     (signal peptides ≥ 20 aa, IRES sub-frames) get hidden.
 *   - Display logic also needs the FRAME (0/1/2) and STRAND (+1/-1)
 *     of every ORF so the AA opacity hybrid can dim chars outside ORFs
 *     of the displayed frame. auto-annotate.js drops both.
 *
 * Returns {start, end, strand, frame, aaLen} per ORF, no overlap filter,
 * no name backfill — keep it cheap. Memoize per fragment in the caller.
 */

const STOPS = new Set(["TAA", "TAG", "TGA"]);
const RC_MAP = { A: "T", T: "A", G: "C", C: "G", N: "N" };

function reverseComplement(seq) {
  let out = "";
  for (let i = seq.length - 1; i >= 0; i--) {
    out += RC_MAP[seq[i]] || "N";
  }
  return out;
}

/**
 * Walk codons for one (strand, frame) pair and emit ATG-to-STOP windows
 * whose translated length is at least `minAA` amino acids.
 *
 * Coordinates returned are ABSOLUTE on the original (top-strand) sequence,
 * so reverse-strand windows are translated from antisense space back.
 *
 * @param {string} sequence — raw uppercase DNA (any IUPAC stripped at parse)
 * @param {number} [minAA=20]
 * @returns {Array<{ start: number, end: number, strand: 1|-1, frame: 0|1|2, aaLen: number }>}
 */
export function detectORFRanges(sequence, minAA = 20) {
  if (!sequence || typeof sequence !== "string") return [];
  const seq = sequence.toUpperCase();
  const seqLen = seq.length;
  const rcSeq = reverseComplement(seq);
  const out = [];

  for (const [strand, s] of [[1, seq], [-1, rcSeq]]) {
    for (let frame = 0; frame < 3; frame++) {
      let i = frame;
      while (i + 3 <= s.length) {
        if (s.slice(i, i + 3) === "ATG") {
          const start = i;
          let j = i + 3;
          let foundStop = false;
          while (j + 3 <= s.length) {
            if (STOPS.has(s.slice(j, j + 3))) {
              foundStop = true;
              break;
            }
            j += 3;
          }
          if (foundStop) {
            const aaLen = (j - start) / 3;
            if (aaLen >= minAA) {
              const localStart = start;
              const localEnd = j + 3;
              const realStart = strand === 1 ? localStart : seqLen - localEnd;
              const realEnd = strand === 1 ? localEnd : seqLen - localStart;
              out.push({
                start: Math.min(realStart, realEnd),
                end: Math.max(realStart, realEnd),
                strand,
                frame,
                aaLen,
              });
            }
            i = j + 3;
            continue;
          }
          // No stop → advance one codon and keep scanning.
          i += 3;
          continue;
        }
        i += 3;
      }
    }
  }

  return out;
}

/**
 * Pick the dominant ORF — broadest (start..end span) on the forward strand.
 * Returns null if there are no forward-strand ORFs.
 */
export function findDominantCDS(orfRanges) {
  if (!Array.isArray(orfRanges) || orfRanges.length === 0) return null;
  const forward = orfRanges.filter((o) => o.strand === 1);
  if (forward.length === 0) return null;
  let best = forward[0];
  for (const o of forward) {
    if (o.end - o.start > best.end - best.start) best = o;
  }
  return best;
}

/** Coverage = dominantORF length / sequence length (or 0 if none). */
export function dominantCoverage(orfRanges, seqLen) {
  const dom = findDominantCDS(orfRanges);
  if (!dom || !seqLen) return 0;
  return (dom.end - dom.start) / seqLen;
}
