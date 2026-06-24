/**
 * annotate-introns.js — glue between the intron detector and the annotator's
 * apply channel. Runs detectIntrons on a (sub)sequence and returns
 * annotation-ready regions shifted into the parent sequence's coordinates, plus
 * the cryptic-site warnings. Pure — the Annotator button is thin glue over this.
 */
import { detectIntrons } from './intron-detect';

/**
 * @param {string} sequence  the sequence to analyse (e.g. a selected fragment).
 * @param {object} [opts]  detectIntrons opts + `offset` (start of `sequence`
 *   within the parent, default 0) so regions land in parent coordinates.
 * @returns {{regions:Array, cryptic:Array, strand:1|-1, orf:number, intronCount:number}}
 */
export function buildIntronAnnotations(sequence, opts = {}) {
  const offset = opts.offset || 0;
  const res = detectIntrons(sequence, opts);
  const shift = (r) => ({ ...r, start: r.start + offset, end: r.end + offset });
  return {
    regions: [...res.introns.map(shift), ...res.exons.map(shift)],
    cryptic: res.cryptic.map((c) => ({ ...c, pos: c.pos + offset })),
    strand: res.strand,
    orf: res.orf,
    intronCount: res.introns.length,
  };
}
