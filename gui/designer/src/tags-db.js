/**
 * tags-db.js — Unified protein tag & fusion partner database.
 *
 * Single source of truth for:
 *   - PEPTIDE_TAGS  (small, 6-30 aa, inserted inside CDS)
 *   - FUSION_PARTNERS (large, separate parts in library)
 *
 * Consumers: TagFusionPicker, auto-annotate, local-primer-design.
 */

// ═══ Small peptide tags & linkers ═══
export const PEPTIDE_TAGS = [
  // Purification tags
  { name: 'His6-tag',        protein: 'HHHHHH',        dna: 'CACCACCACCACCACCAC',           position: 'both',   category: 'purification', lowComplexity: true },
  { name: 'Strep-tag II',    protein: 'WSHPQFEK',      dna: 'TGGAGCCACCCGCAGTTCGAGAAG',     position: 'both',   category: 'purification', lowComplexity: false },

  // Detection tags
  { name: 'FLAG-tag',        protein: 'DYKDDDDK',      dna: 'GACTACAAGGACGACGATGACAAG',     position: 'both',   category: 'detection', lowComplexity: false },
  { name: 'V5-tag',          protein: 'GKPIPNPLLGLD',  dna: 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG', position: 'C-term', category: 'detection', lowComplexity: false },
  { name: 'Myc-tag',         protein: 'EQKLISEEDL',    dna: 'GAACAAAAACTCATCTCAGAAGAGGATCTG', position: 'both',   category: 'detection', lowComplexity: false },
  { name: 'HA-tag',          protein: 'YPYDVPDYA',     dna: 'TACCCATACGATGTTCCAGATTACGCT',   position: 'both',   category: 'detection', lowComplexity: false },

  // Cleavage sites
  { name: 'TEV site',        protein: 'ENLYFQS',       dna: 'GAAAACCTGTATTTTCAGAGC',         position: 'linker', category: 'cleavage', lowComplexity: false },
  { name: 'Thrombin site',   protein: 'LVPRGS',        dna: 'CTGGTGCCGCGCGGCAGC',           position: 'linker', category: 'cleavage', lowComplexity: false },
  { name: 'PreScission site', protein: 'LEVLFQGP',     dna: 'CTGGAAGTTCTGTTTCAGGGGCCC',     position: 'linker', category: 'cleavage', lowComplexity: false },
  { name: 'Enterokinase site', protein: 'DDDDK',       dna: 'GACGACGACGACAAG',               position: 'linker', category: 'cleavage', lowComplexity: false },
  { name: 'Factor Xa site',  protein: 'IEGR',          dna: 'ATCGAGGGAAGG',                   position: 'linker', category: 'cleavage', lowComplexity: false },

  // Flexible linkers
  { name: '(G4S)x1 linker',  protein: 'GGGGS',         dna: 'GGTGGCGGTGGCTCG',               position: 'linker', category: 'linker', lowComplexity: true },
  { name: '(G4S)x3 linker',  protein: 'GGGGSGGGGSGGGGS', dna: 'GGTGGCGGTGGCTCGGGCGGTGGTGGGTCGGGTGGCGGCGGATCG', position: 'linker', category: 'linker', lowComplexity: true },
];

// ═══ Large fusion partners (separate library parts) ═══
export const FUSION_PARTNERS = [
  { name: 'GST',  type: 'tag',      accession: 'M14654',  sizeAA: 211, pattern: 'MSPILGYWKIKGLVQP',    description: 'Glutathione S-transferase (26 kDa, purification + solubility)' },
  { name: 'MBP',  type: 'tag',      accession: 'M13577',  sizeAA: 396, pattern: 'MKIEEGKLVI',          description: 'Maltose-binding protein (42 kDa, solubility)' },
  { name: 'TrxA', type: 'tag',      accession: 'X04398',  sizeAA: 109, pattern: 'MSDKIIHLTDDSFDTDVL', description: 'Thioredoxin A (12 kDa, solubility)' },
  { name: 'SUMO', type: 'tag',      accession: 'AF400258', sizeAA: 98, pattern: 'MSDQEAKPSTEDLGDKKEG', description: 'SUMO tag (enhanced solubility, native N-term after cleavage)' },
  { name: 'GFP',  type: 'reporter', accession: 'U55762',  sizeAA: 238, pattern: 'MSKGEELFTGVVPILVELDG', description: 'Green fluorescent protein (localization/reporter)' },
];

// ═══ Helpers ═══

/** Look up a tag or fusion partner by name. */
export function getTagByName(name) {
  return PEPTIDE_TAGS.find(t => t.name === name) || FUSION_PARTNERS.find(fp => fp.name === name);
}
