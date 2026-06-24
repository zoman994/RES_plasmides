/**
 * aa-effect — protein consequence of a single-base mismatch inside a CDS, for
 * the alignment read track (silent / missense / nonsense). Reuses the SAME
 * reading-frame + codon walk as AATrack (`codon-walker`) so the badge's AA
 * always matches the AA row the user sees, and handles both strands.
 *
 * Biology is a hard invariant here: when the strand/frame can't be resolved we
 * return null (no badge) rather than guess — a wrong silent/missense label is a
 * scientific error.
 */
import { pickReadingFrame, walkCodons, pickSplicedFrame } from '../SequenceView/lib/codon-walker';
import { translateCodon } from '../../codons';
import { complement } from '../../sequence-utils';
import { TRANSLATABLE_TYPES } from '../SequenceView/constants';
import { getIntronsForRegion, spliceRegion, genomicToSpliced } from '../../intron-utils';

/**
 * @param {string} fullSeq — reference (top-strand) sequence, uppercase.
 * @param {{start:number,end:number,strand?:number}} region — CDS-like region (0-based end-exclusive).
 * @param {number} pos — absolute (top-strand) mismatch position.
 * @param {string} altBase — the READ base at that position (top strand).
 * @returns {{refAA:string,altAA:string,effect:'silent'|'missense'|'nonsense',codonFrom:string,codonTo:string}|null}
 */
export function aaEffectAt(fullSeq, region, pos, altBase) {
  if (!fullSeq || !region) return null;
  if (pos < region.start || pos >= region.end) return null;
  const isRev = region.strand === -1;
  const frame = pickReadingFrame(fullSeq, region.start, region.end, isRev);
  const codons = walkCodons(fullSeq, frame, isRev ? -1 : 1);
  const c = codons.find((k) => Math.abs(k.position - pos) <= 1);
  if (!c) return null;

  // Index of `pos` within the (coding-order) codon string + the coding base the
  // read substitutes there. Forward: codon[0..2] = top[m-1, m, m+1], base as-is.
  // Reverse: codon[0..2] = complement(top[m+1, m, m-1]), base complemented.
  let idx; let altInCodon;
  if (!isRev) {
    idx = pos - (c.position - 1);
    altInCodon = String(altBase || '').toUpperCase();
  } else {
    idx = (c.position + 1) - pos;
    altInCodon = complement(String(altBase || '').toUpperCase());
  }
  if (idx < 0 || idx > 2) return null;

  const refAA = c.aa;
  const altCodon = c.codon.slice(0, idx) + altInCodon + c.codon.slice(idx + 1);
  const altAA = translateCodon(altCodon);
  const effect = refAA === altAA ? 'silent' : (altAA === '*' ? 'nonsense' : 'missense');
  return { refAA, altAA, effect, codonFrom: c.codon, codonTo: altCodon };
}

/**
 * Splice-aware variant of aaEffectAt: the mismatch effect is computed on the
 * MATURE spliced CDS. A mismatch landing inside an intron has no protein
 * consequence (it's removed by splicing) → null, no badge.
 *
 * @param {string} spliced — mature coding sequence (already 5′→3′ on its strand)
 * @param {Array} exonMap — spliced↔genomic map from spliceRegion
 * @param {number} strand — CDS strand
 * @param {0|1|2} frame — reading frame on the spliced sequence
 * @param {number} pos — absolute (top-strand) genomic mismatch position
 * @param {string} altBase — the READ base at that position (top strand)
 */
export function aaEffectAtSpliced(spliced, exonMap, strand, frame, pos, altBase) {
  const sPos = genomicToSpliced(exonMap, pos);
  if (sPos < 0) return null; // intronic → spliced out, no protein effect
  const isRev = strand === -1;
  // `spliced` is already coding 5′→3′; the read's coding base is the top-strand
  // base for a forward CDS, its complement for a reverse one.
  const altInCodon = isRev
    ? complement(String(altBase || '').toUpperCase())
    : String(altBase || '').toUpperCase();
  const rel = sPos - frame;
  if (rel < 0) return null;
  const idx = rel % 3;
  const codonStart = sPos - idx;
  if (codonStart + 3 > spliced.length) return null;
  const refCodon = spliced.slice(codonStart, codonStart + 3);
  const refAA = translateCodon(refCodon);
  const altCodon = refCodon.slice(0, idx) + altInCodon + refCodon.slice(idx + 1);
  const altAA = translateCodon(altCodon);
  const effect = refAA === altAA ? 'silent' : (altAA === '*' ? 'nonsense' : 'missense');
  return { refAA, altAA, effect, codonFrom: refCodon, codonTo: altCodon };
}

/**
 * Map every CDS-internal mismatch to its protein effect. Splice-aware: a CDS
 * carrying introns is evaluated on its mature spliced sequence (the same
 * splice the AA track renders), and intronic mismatches produce no badge.
 * @returns {Object<number, {refAA,altAA,effect}>} keyed by reference position.
 */
export function buildAAEffects(fullSeq, annotations, mismatchRefPositions, readByRefPos) {
  const out = {};
  if (!fullSeq || !Array.isArray(mismatchRefPositions)) return out;
  const seq = fullSeq.toUpperCase();
  const anns = annotations || [];
  const regions = anns.filter(
    (a) => a && TRANSLATABLE_TYPES.has(a.type) && Number.isFinite(a.start) && Number.isFinite(a.end),
  );
  if (regions.length === 0) return out;
  // Precompute a splice context for each region that carries introns, so each
  // mismatch is judged against the mature spliced CDS (same frame the AA track
  // picks via pickSplicedFrame). Regions without introns keep the raw path.
  const spliceCtx = new Map();
  for (const region of regions) {
    const introns = getIntronsForRegion(anns, region);
    if (introns.length) {
      const { spliced, exonMap } = spliceRegion(seq, region, introns);
      spliceCtx.set(region, { spliced, exonMap, frame: pickSplicedFrame(spliced) });
    }
  }
  for (const pos of mismatchRefPositions) {
    const r = readByRefPos ? readByRefPos[pos] : null;
    if (!r || r.base === '-' || r.status !== 'mismatch') continue;
    const region = regions.find((rg) => pos >= rg.start && pos < rg.end);
    if (!region) continue;
    const ctx = spliceCtx.get(region);
    const eff = ctx
      ? aaEffectAtSpliced(ctx.spliced, ctx.exonMap, region.strand, ctx.frame, pos, r.base)
      : aaEffectAt(seq, region, pos, r.base);
    if (eff) out[pos] = { effect: eff.effect, refAA: eff.refAA, altAA: eff.altAA };
  }
  return out;
}
