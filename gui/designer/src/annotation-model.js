/**
 * Annotation model — shared constants and helpers for region-based annotations.
 *
 * Three levels:
 *   region  — what this DNA IS (CDS, promoter, terminator, …)
 *   detail  — sub-elements within a region (domains, tags, regulatory elements)
 *   point   — point markers (RE sites, stop codons, mutations)
 */

export const LEVELS = { REGION: 'region', DETAIL: 'detail', POINT: 'point' };

/**
 * Per-region-type rendering and detection rules.
 * Determines what to show and which detail types are relevant.
 */
export const REGION_RENDER_RULES = {
  CDS: {
    showTranslation: true,
    showDomains: true,
    showCodonUsage: true,
    detailTypes: [
      'signal_peptide', 'propeptide', 'catalytic', 'binding',
      'linker', 'tag', 'cleavage_site', 'active_site',
    ],
    colorScheme: 'protein',
  },
  promoter: {
    showTranslation: false,
    showDomains: false,
    showRegulatory: true,
    detailTypes: [
      'core_promoter', 'enhancer', 'regulatory', 'operator',
      'UAS', 'silencer',
    ],
    colorScheme: 'regulatory',
  },
  terminator: {
    showTranslation: false,
    showDomains: false,
    showHairpin: true,
    detailTypes: [
      'poly_a', 'stem_loop', 'rho_dependent',
    ],
    colorScheme: 'terminator',
  },
  marker: {
    showTranslation: true,
    showDomains: true,
    detailTypes: ['signal_peptide', 'catalytic', 'tag'],
    colorScheme: 'marker',
  },
  gene: {
    showTranslation: true,
    showDomains: true,
    detailTypes: [
      'signal_peptide', 'propeptide', 'catalytic', 'binding',
      'linker', 'tag', 'cleavage_site', 'active_site',
    ],
    colorScheme: 'protein',
  },
};

// ═══ Selectors ═══

/** All region-level annotations. Backfills a deterministic `id` when missing
 *  (legacy `.bodgegene` projects + whole-plasmid catalog imports arrive without
 *  id and every consumer — map, sequence pane, workspace — keys off it). */
export function getRegions(annotations) {
  return (annotations || [])
    .filter(a => a.level === 'region')
    .map(a => a.id ? a : { ...a, id: `region:${a.start}:${a.end}:${a.type || 'unknown'}:${a.name || ''}` });
}

/** Detail annotations belonging to a specific region. */
export function getDetails(annotations, regionId) {
  return (annotations || []).filter(a => a.level === 'detail' && a.regionId === regionId);
}

/** All detail-level annotations regardless of region. */
export function getAllDetails(annotations) {
  return (annotations || []).filter(a => a.level === 'detail');
}

/** All point-level annotations. */
export function getPoints(annotations) {
  return (annotations || []).filter(a => a.level === 'point');
}

/** Check whether annotation array contains any region-level entries. */
export function hasRegions(annotations) {
  return (annotations || []).some(a => a.level === 'region');
}
