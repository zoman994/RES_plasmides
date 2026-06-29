/**
 * feature-extract — FEAT-EXTRACT (gap-research): pull a feature out of its genomic
 * context as a standalone sequence. The daily molbiolog move (Geneious «Extract» /
 * «Translate»): clone a CDS out of a multi-intron genomic locus → mature cDNA +
 * protein, ready to drop into a new construct.
 *
 * Pure (headless-testable): reuses the existing splice engine (spliceRegion) and
 * translation (translateDNA). Introns are removed strand-aware; the protein is
 * translated from the spliced cDNA (frame 0 at the region start; trailing stop
 * stripped) only for coding types.
 *
 * @param {string} fullSeq — top-strand genomic DNA the region lives in
 * @param {object} region — {id?, name?, type?, start, end, strand}
 * @param {Array} annotations — full annotation list (to find the region's introns)
 * @param {{translate?:boolean}} [opts] — force/suppress protein (default: by type)
 * @returns {{cdna, cdnaName, intronsRemoved, strand, protein?, proteinName?}|null}
 */
import { spliceRegion, getIntronsForRegion } from '../intron-utils';
import { translateDNA } from '../codons';

const CODING_TYPE = /^(CDS|gene|mRNA|marker|reporter|orf)$/i;

export function extractFeatureSequences(fullSeq, region, annotations, opts = {}) {
  if (!fullSeq || !region || !Number.isFinite(region.start) || !Number.isFinite(region.end)) {
    return null;
  }
  const introns = getIntronsForRegion(annotations || [], region);
  const { spliced } = spliceRegion(fullSeq, region, introns);
  const cdna = spliced || '';
  const baseName = region.name || region.type || 'feature';
  const out = {
    cdna,
    cdnaName: `${baseName} cDNA`,
    intronsRemoved: introns.length,
    strand: region.strand === -1 ? -1 : 1,
  };

  const translatable = typeof opts.translate === 'boolean'
    ? opts.translate
    : CODING_TYPE.test(region.type || '');
  if (translatable && cdna.length >= 3) {
    out.protein = translateDNA(cdna).replace(/\*+$/, '');
    out.proteinName = `${baseName} protein`;
  }
  return out;
}
