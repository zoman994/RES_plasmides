/**
 * Import external features (SnapGene, GenBank, APE) into region/detail/point model.
 *
 * Input: array of { type, start, end, strand, qualifiers } from BioPython parsing.
 * Output: { annotations: Array, primers: Array }
 */

import { generateRegionId } from './domain-detection';

// ═══ Type classification sets ═══

const REGION_TYPES = new Set([
  'CDS', 'promoter', 'terminator', 'rep_origin',
  'marker', 'misc_feature', 'regulatory',
]);

const DETAIL_TYPES = new Set([
  'sig_peptide', 'signal_peptide', 'mat_peptide',
  'transit_peptide', 'propeptide',
  'domain', 'region', 'motif', 'binding_site',
  'active_site', 'metal_binding', 'disulfide_bond',
  'TATA_signal', '-35_signal', '-10_signal',
  'polyA_signal', 'RBS', 'GC_signal',
  'intron',
]);

const POINT_TYPES = new Set([
  'primer_bind', 'restriction_site',
  'variation', 'modified_base',
]);

// ═══ Type normalization ═══

const TYPE_MAP = {
  CDS: 'CDS', gene: 'CDS', mRNA: 'CDS',
  promoter: 'promoter', terminator: 'terminator',
  rep_origin: 'rep_origin', oriT: 'rep_origin',
  misc_feature: 'misc_feature', misc_binding: 'misc_feature',
  regulatory: 'regulatory', marker: 'marker',
};

const DETAIL_TYPE_MAP = {
  sig_peptide: 'signal_peptide',
  signal_peptide: 'signal_peptide',
  transit_peptide: 'signal_peptide',
  mat_peptide: 'catalytic',
  domain: 'catalytic',
  region: 'catalytic',
  motif: 'binding',
  binding_site: 'binding',
  metal_binding: 'binding',
  active_site: 'active_site',
  TATA_signal: 'core_promoter',
  '-35_signal': 'core_promoter',
  '-10_signal': 'core_promoter',
  polyA_signal: 'poly_a',
  RBS: 'regulatory',
  primer_bind: 'primer_bind',
  intron: 'intron',
};

/** Normalize a region-level feature type to our model. */
export function normalizeType(type) {
  return TYPE_MAP[type] || 'misc_feature';
}

/** Normalize a detail/point-level feature type to our model. */
export function normalizeDetailType(type) {
  return DETAIL_TYPE_MAP[type] || type;
}

// ═══ Name extraction from qualifiers ═══

function extractName(feat) {
  const q = feat.qualifiers || {};
  return feat.name
    || q.label
    || q.product
    || q.gene
    || (Array.isArray(q.note) ? q.note[0] : q.note)
    || feat.type;
}

/** Extract color from SnapGene/APE qualifiers. */
function extractColor(feat) {
  const q = feat.qualifiers || {};
  return q.ApEinfo_fwdcolor
    || q['SnapGene:color']
    || q.color
    || null;
}

// ═══ Main import function ═══

/**
 * Import BioPython-parsed features into region/detail/point annotations.
 *
 * @param {Array} features — [{ type, start, end, strand, qualifiers }]
 * @param {number} seqLength — total sequence length (for heuristics)
 * @param {string} [format] — 'snapgene' | 'genbank' | 'ape' (optional, for color handling)
 * @returns {{ annotations: Array, primers: Array }}
 */
export function importFeatures(features, seqLength, format) {
  if (!features?.length) return { annotations: [], primers: [] };

  const annotations = [];
  const regions = [];

  // ── Step 1: Filter ──
  // Skip source features entirely
  // Skip gene features if a CDS exists inside them
  const cdsFeatures = features.filter(f => f.type === 'CDS');
  const filtered = features.filter(f => {
    if (f.type === 'source') return false;
    if (f.type === 'gene') {
      // Skip gene if any CDS is contained within it
      return !cdsFeatures.some(cds => cds.start >= f.start && cds.end <= f.end);
    }
    return true;
  });

  // Sort largest-first for region pass
  const sorted = [...filtered].sort((a, b) => (b.end - b.start) - (a.end - a.start));

  // ── Step 2 + 3: First pass — create regions ──
  for (const feat of sorted) {
    if (!REGION_TYPES.has(feat.type)) continue;

    const regionId = generateRegionId();
    const ann = {
      id: regionId,
      name: extractName(feat),
      type: normalizeType(feat.type),
      start: feat.start,
      end: feat.end,
      strand: feat.strand || 1,
      level: 'region',
      auto: false,
      source: 'import',
      color: extractColor(feat),
    };

    regions.push(ann);
    annotations.push(ann);

    // If CDS has exon parts (from GenBank join()), create intron annotations for gaps
    if ((feat.type === 'CDS' || feat.type === 'gene') && feat.qualifiers?.exons) {
      const exons = feat.qualifiers.exons; // [{ start, end }, ...]
      for (let ei = 0; ei < exons.length - 1; ei++) {
        const intronStart = exons[ei].end;
        const intronEnd = exons[ei + 1].start;
        if (intronEnd > intronStart) {
          annotations.push({
            name: `intron ${ei + 1}`,
            type: 'intron',
            start: intronStart,
            end: intronEnd,
            level: 'detail',
            regionId,
            auto: false,
            source: 'import',
            color: '#9CA3AF',
          });
        }
      }
    }
  }

  // ── Step 4: Second pass — details, points, unknowns ──
  for (const feat of sorted) {
    if (feat.type === 'source') continue;
    if (REGION_TYPES.has(feat.type)) continue; // already processed

    if (DETAIL_TYPES.has(feat.type)) {
      const parentRegion = regions.find(r =>
        feat.start >= r.start && feat.end <= r.end
      );
      annotations.push({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        start: feat.start,
        end: feat.end,
        level: 'detail',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'import',
        color: extractColor(feat),
      });
      continue;
    }

    if (POINT_TYPES.has(feat.type)) {
      annotations.push({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        start: feat.start,
        end: feat.end,
        level: 'point',
        auto: false,
        source: 'import',
      });
      continue;
    }

    // Unknown type — heuristic
    const span = feat.end - feat.start;
    const isInsideRegion = regions.some(r =>
      feat.start >= r.start && feat.end <= r.end
    );

    if (span > seqLength * 0.1 && !isInsideRegion) {
      // Large + not inside a region → region
      const regionId = generateRegionId();
      const ann = {
        id: regionId,
        name: extractName(feat),
        type: 'misc_feature',
        start: feat.start,
        end: feat.end,
        level: 'region',
        auto: false,
        source: 'import',
        color: extractColor(feat),
      };
      regions.push(ann);
      annotations.push(ann);
    } else {
      // Small or inside a region → detail
      const parentRegion = regions.find(r =>
        feat.start >= r.start && feat.end <= r.end
      );
      annotations.push({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        start: feat.start,
        end: feat.end,
        level: 'detail',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'import',
        color: extractColor(feat),
      });
    }
  }

  // ── Step 5: Extract primers ──
  const primers = features
    .filter(f => f.type === 'primer_bind')
    .map(f => ({
      name: extractName(f),
      sequence: f.qualifiers?.primer_seq || '',
      start: f.start,
      end: f.end,
      strand: f.strand || 1,
      source: 'import',
    }));

  return { annotations, primers };
}
