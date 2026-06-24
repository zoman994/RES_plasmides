/**
 * annotate-genes.js — glue between the frame-aware gene parser and the
 * annotator's apply channel. Runs parseGeneBothStrands on the selected gene
 * region and returns a translatable `gene` region + its introns as `detail`
 * children (3-level model; exons implicit = gene − introns) in the parent
 * sequence's coordinates. Pure — the Annotator's «🧬 Ген» path is thin glue.
 *
 * The parser is content-first (maximise the clean coding ORF via GT-AG introns)
 * and is meant to run on a SELECTED gene (ATG…stop), so this is fed the user's
 * fragment, not a whole plasmid. Organism selects the intron length-prior preset.
 */
import { parseGeneBothStrands, ORGANISM_PRESETS } from './gene-parser';
import { reverseComplement } from '../../sequence-utils';
import { makeId } from '../ids';

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * @param {string} sequence  the gene to parse (a selected fragment, ATG…stop).
 * @param {object} opts  { scorer (required), organism ('fungi'…), offset (0) } +
 *   any parser opt override.
 * @returns {{regions:Array, cryptic:Array, strand:1|-1, intronCount:number, mode:'gene'}}
 */
export function buildGeneAnnotations(sequence, opts = {}) {
  const seq = String(sequence || '');
  const offset = opts.offset || 0;
  const preset = ORGANISM_PRESETS[opts.organism] || ORGANISM_PRESETS.fungi;
  const res = parseGeneBothStrands(seq, opts.scorer, reverseComplement, { ...preset, ...opts });
  const strand = res.strand;
  const hasGene = res.cdsStart >= 0 && res.cdsEnd > res.cdsStart;
  const geneId = makeId();

  // The gene is a `region`; its introns are `detail` children linked by
  // `regionId` — fitting the 3-level model (region > detail > point), like a
  // domain inside a CDS. The AA track splices via these introns and the
  // annotation track renders the gene as exon BLOCKS + dashed intron connectors
  // («вариант A»). Exons are implicit (gene − introns), so no separate exon
  // regions are emitted.
  const introns = res.introns.map((it, k) => ({
    id: makeId(), type: 'intron', level: 'detail', strand,
    ...(hasGene ? { regionId: geneId } : {}),
    start: it.start + offset, end: it.end + offset,
    name: `интрон ${k + 1}`, score: r2(it.score),
  }));

  // A translatable `gene` region over the parsed CDS span (ATG…stop) — without
  // it there is nothing for the AA track to translate; with it (+ the contained
  // introns) the track renders the mature SPLICED protein. `gene` ∈
  // TRANSLATABLE_TYPES; getIntronsForRegion → spliceRegion derives its exons.
  const geneRegions = hasGene
    ? [{
        id: geneId, type: 'gene', level: 'region', strand,
        start: res.cdsStart + offset, end: res.cdsEnd + offset,
        name: 'ген',
      }]
    : [];

  return {
    regions: [...geneRegions, ...introns],
    cryptic: [],
    strand,
    intronCount: introns.length,
    mode: 'gene',
  };
}
