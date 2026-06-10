/**
 * Annotation model — shared constants and helpers for region-based annotations.
 *
 * Three levels:
 *   region  — what this DNA IS (CDS, promoter, terminator, …)
 *   detail  — sub-elements within a region (domains, tags, regulatory elements)
 *   point   — point markers (RE sites, stop codons, mutations)
 *
 * Annotation shape (region-level, current canonical):
 *   {
 *     id: string,                  // backfilled via getRegions if missing
 *     name: string,
 *     type: string,                // 'CDS' | 'promoter' | 'terminator' | ...
 *     start: number,               // 0-based inclusive (⚓ DEC-ANN-10; UI shows 1-based via toUiCoords)
 *     end: number,                 // 0-based exclusive (numerically == 1-based inclusive end)
 *     strand: 1 | -1,
 *     level: 'region',
 *
 *     // Optional — confident vs predicted (Sprint M-X.1 K1)
 *     predicted?: true,            // truthy iff produced by an algorithm
 *     source?: string,             // PREDICTOR_SOURCES value, e.g. 'orf_scan'
 *     confidence?: number,         // 0..1, source-specific scale
 *     signals?: Array<{type, ...}> // internal evidence (DEC-PRED-01):
 *                                  //   { type: '-35', start, end, score, sequence }
 *                                  //   { type: '-10', start, end, score, sequence }
 *                                  //   { type: 'spacer', start, end, length }
 *                                  //   { type: 'hairpin', stemStart, stemEnd, ... }
 *                                  //   { type: 'scaffold', identity, variant }
 *                                  //   { type: 'orf', aaLen }
 *
 *     // Legacy (still propagated for back-compat)
 *     auto?: boolean,
 *     detector?: string,           // older tag, kept alongside `source`
 *     color?: string,
 *   }
 */

export const LEVELS = { REGION: 'region', DETAIL: 'detail', POINT: 'point' };

/**
 * Identifiers for each predicted-region detector (Sprint M-X.1 K1).
 *
 * - `orf_scan`        — ATG→stop ≥100 aa scanner (orf-detection.js).
 * - `sigma70_pwm`     — σ70 promoter PWM (predicted-detection.js K2).
 * - `stem_loop`       — terminator stem-loop heuristic (K2).
 * - `sgrna_scaffold`  — Cas9 scaffold DNA-identity match (K2).
 *
 * Consumers compare `region.source === PREDICTOR_SOURCES.X`. Frozen so
 * accidental writes throw in dev (catches typos in detector source ids
 * faster than silent string mismatch).
 */
export const PREDICTOR_SOURCES = Object.freeze({
  ORF_SCAN: 'orf_scan',
  SIGMA70_PWM: 'sigma70_pwm',
  STEM_LOOP: 'stem_loop',
  SGRNA_SCAFFOLD: 'sgrna_scaffold',
});

/**
 * `true` iff the annotation came from a predictor (transient detection
 * layer, not the confident-regions baseline). Canonical idiom for
 * consumers — AnnotationTrack uses this to switch render mode (filled
 * solid vs unfilled+dashed), Settings popover threshold filter applies
 * only to predicted, M-X.2 Modal "Принять как confident" opens only on
 * predicted regions.
 *
 * Identity check (`=== true`) — accepts only the explicit boolean to
 * avoid surprises with legacy fields named `predicted` carrying counts
 * or strings from defunct migrations.
 */
export function isPredicted(annotation) {
  return !!annotation && annotation.predicted === true;
}

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
