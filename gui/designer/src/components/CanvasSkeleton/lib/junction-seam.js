/**
 * junction-seam.js — RC-B2 (Игорь 24.06). Pure helper that, given the assembled
 * PRODUCT sequence and the index where one fragment ends / the next begins,
 * returns the nucleotide context AT the seam plus (optionally) the reading-frame
 * codon that straddles it and whether translation hits a STOP across the join.
 *
 * Why: «визуализировать на стыке нуклеотидный сиквенс … указать рамку считывания».
 * The seam badge (SegmentZonesOverlay) shows a verdict + the sticky-end overhang;
 * this adds the actual bases of the join and, when a frame is pinned (RC-B1), the
 * amino acid that spans the junction — so the biolog sees at a glance whether the
 * join keeps the reading frame or introduces a premature stop.
 *
 * Coordinates: 0-based, `boundaryPos` is the cut BETWEEN base boundaryPos-1 (last
 * of the left fragment) and base boundaryPos (first of the right fragment).
 */

const CODON_TABLE = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L', CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M', GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S', CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T', GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*', CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K', GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W', CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R', GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

function translateCodon(dna) {
  return CODON_TABLE[(dna || '').toUpperCase()] || (dna && dna.length === 3 ? 'X' : null);
}

/**
 * @param {{ seq:string, boundaryPos:number, window?:number, frame?:number|null }} args
 *   frame: null → no translation; 0|1|2 → forward reading frame offset.
 * @returns {{
 *   left:string, right:string, boundaryPos:number,
 *   onCodonBoundary: boolean|null,
 *   codonAtSeam: { dna:string, aa:string, isStop:boolean, start:number } | null,
 *   stopAtSeam: boolean,
 * } | null}
 */
export function junctionSeamView({ seq, boundaryPos, window = 6, frame = null } = {}) {
  if (typeof seq !== 'string' || !seq.length) return null;
  const p = Math.max(0, Math.min(seq.length, Math.round(Number(boundaryPos))));
  const w = Math.max(1, Math.round(Number(window) || 6));
  const left = seq.slice(Math.max(0, p - w), p).toUpperCase();
  const right = seq.slice(p, Math.min(seq.length, p + w)).toUpperCase();

  const out = {
    left,
    right,
    boundaryPos: p,
    onCodonBoundary: null,
    codonAtSeam: null,
    stopAtSeam: false,
  };

  const f = (frame === 0 || frame === 1 || frame === 2) ? frame : null;
  if (f === null) return out;

  // Is the seam ON a codon edge for this frame? Codons start at f, f+3, f+6 …
  // A boundary at position p sits on a codon edge iff (p - f) % 3 === 0.
  const rel = p - f;
  out.onCodonBoundary = rel >= 0 ? (((rel % 3) + 3) % 3 === 0) : null;

  // The codon that STRADDLES the seam: its start s = f + 3k with s < p < s+3.
  // That means the boundary falls strictly inside the triplet (offset 1 or 2).
  if (!out.onCodonBoundary && rel > 0) {
    const k = Math.floor(rel / 3);
    const start = f + 3 * k;
    if (start >= 0 && start + 3 <= seq.length && start < p && p < start + 3) {
      const dna = seq.slice(start, start + 3).toUpperCase();
      const aa = translateCodon(dna);
      const isStop = aa === '*';
      out.codonAtSeam = { dna, aa, isStop, start };
      out.stopAtSeam = isStop;
    }
  }
  return out;
}

/**
 * RC-BIO-2 — the biologically meaningful reading frame at a seam is the frame of
 * the CDS/gene that spans it (codons anchored at the CDS start), NOT a global
 * product-0-relative frame. A premature stop «across a junction» is only meaningful
 * relative to that CDS's own frame. Returns the forward-strand frame offset
 * (start % 3) of the first translatable annotation that contains `boundaryPos`, or
 * `fallback` (e.g. the user's manual override, or null) when no CDS spans the seam.
 * Minus-strand CDSs are skipped (their AA reads on the complement) → fallback.
 *
 * @param {Array} annotations product-coordinate annotations
 * @param {number} boundaryPos product index of the seam
 * @param {Set<string>} translatableTypes types that translate (CDS/gene/…)
 * @param {number|null} [fallback]
 * @returns {number|null}
 */
export function seamFrameForBoundary(annotations, boundaryPos, translatableTypes, fallback = null) {
  if (Array.isArray(annotations) && translatableTypes) {
    for (const a of annotations) {
      if (!a || !translatableTypes.has(a.type)) continue;
      if ((a.strand === -1 ? -1 : 1) !== 1) continue; // minus-strand AA on complement → skip
      if (Number.isFinite(a.start) && Number.isFinite(a.end) && a.start <= boundaryPos && boundaryPos < a.end) {
        return (((Math.round(a.start) % 3) + 3) % 3);
      }
    }
  }
  return fallback;
}

export const __test = { translateCodon };
