/**
 * Biological category grouping for parts palette.
 * Maps raw part types → display categories for organized palette rendering.
 */

/** Maps every known part type to a category key. */
export const TYPE_CATEGORIES = {
  CDS: 'coding', gene: 'coding', reporter: 'coding',
  marker: 'markers',
  promoter: 'regulatory', terminator: 'regulatory', enhancer: 'regulatory',
  '5UTR': 'regulatory', '3UTR': 'regulatory', RBS: 'regulatory',
  Kozak: 'regulatory', IRES: 'regulatory', insulator: 'regulatory',
  regulatory: 'regulatory',
  rep_origin: 'origins', ARS_CEN: 'origins',
  signal_peptide: 'structural', NLS: 'structural', T2A: 'structural',
  linker: 'structural', tag: 'structural', MCS: 'structural',
  intron: 'structural', propeptide: 'structural',
  loxP: 'recombination', FRT: 'recombination', homology_arm: 'recombination',
  gRNA: 'rna', ncRNA: 'rna', aptamer: 'rna', misc_RNA: 'rna',
  spacer: 'other', misc_feature: 'other', fusion: 'other',
  primer_bind: 'other', mutation: 'other',
};

/** Display order of categories in the palette. */
export const CATEGORY_ORDER = [
  'coding', 'regulatory', 'markers', 'origins',
  'structural', 'recombination', 'rna', 'other',
];

/** Russian labels for each category. */
export const CATEGORY_LABELS = {
  coding: 'Кодирующие',
  regulatory: 'Регуляторные',
  markers: 'Маркеры',
  origins: 'Ориджины',
  structural: 'Структурные',
  recombination: 'Рекомбинация',
  rna: 'РНК',
  other: 'Прочее',
};

/** Unicode icons for category headers (not emoji — consistent across OS). */
export const CATEGORY_ICONS = {
  coding: '▷',
  regulatory: '→',
  markers: '■',
  origins: '○',
  structural: '△',
  recombination: '⊕',
  rna: '〰',
  other: '⊡',
};

/** Student mode: only these categories are visible. */
export const STUDENT_CATEGORIES = new Set([
  'coding', 'regulatory', 'markers', 'origins', 'other',
]);

/** Get category for a part type, with fallback to 'other'. */
export function getCategoryForType(type) {
  return TYPE_CATEGORIES[type] || 'other';
}

/** Group an array of parts by biological category. */
export function groupByCategory(parts) {
  const groups = {};
  for (const p of parts) {
    const cat = getCategoryForType(p.type);
    (groups[cat] = groups[cat] || []).push(p);
  }
  return groups;
}
