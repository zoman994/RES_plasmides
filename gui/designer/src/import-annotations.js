/**
 * Import external features (SnapGene, GenBank, APE) into region/detail/point model.
 *
 * Input: array of { type, start, end, strand, qualifiers } from BioPython parsing.
 * Output: { annotations: Array, primers: Array }
 */

import { generateRegionId } from './domain-detection';

// ═══ Type classification sets ═══

const REGION_TYPES = new Set([
  'CDS', 'gene', 'mRNA', 'tRNA', 'rRNA', 'ncRNA', 'misc_RNA',
  'promoter', 'terminator',
  'rep_origin', 'oriT',
  'marker', 'misc_feature', 'misc_binding', 'regulatory',
  'repeat_region', 'mobile_element', 'D-loop',
]);

const DETAIL_TYPES = new Set([
  'sig_peptide', 'signal_peptide', 'transit_peptide',
  'mat_peptide', 'propeptide',
  'domain', 'region', 'motif',
  'binding_site', 'active_site', 'metal_binding', 'disulfide_bond',
  'TATA_signal', '-35_signal', '-10_signal',
  'CAAT_signal', 'GC_signal',
  'polyA_signal', 'polyA_site',
  'RBS', 'intron', 'stem_loop',
  'unsure',
]);

const POINT_TYPES = new Set([
  'primer_bind', 'restriction_site',
  'variation', 'modified_base',
]);

// Types that bear exons (for intron-from-gaps extraction in first pass).
const EXON_BEARING_TYPES = new Set(['CDS', 'gene', 'mRNA']);

// Types whose presence inside a gene makes the gene redundant (avoid duplicate regions).
const GENE_CHILD_TYPES = new Set(['CDS', 'mRNA', 'tRNA', 'rRNA', 'ncRNA', 'misc_RNA']);

// ═══ Type normalization ═══

const TYPE_MAP = {
  CDS: 'CDS',
  mRNA: 'mRNA',
  tRNA: 'tRNA',
  rRNA: 'rRNA',
  ncRNA: 'ncRNA',
  misc_RNA: 'misc_RNA',
  promoter: 'promoter',
  terminator: 'terminator',
  rep_origin: 'rep_origin',
  oriT: 'oriT',
  misc_feature: 'misc_feature',
  misc_binding: 'misc_feature',
  regulatory: 'regulatory',
  marker: 'marker',
  repeat_region: 'repeat_region',
  mobile_element: 'mobile_element',
  'D-loop': 'D-loop',
  // 'gene' intentionally omitted — handled by normalizeGeneType(feat) for qualifier-based classification.
};

const DETAIL_TYPE_MAP = {
  sig_peptide: 'signal_peptide',
  signal_peptide: 'signal_peptide',
  transit_peptide: 'transit_peptide',
  mat_peptide: 'mat_peptide',
  propeptide: 'propeptide',
  domain: 'domain',
  region: 'region',
  motif: 'motif',
  binding_site: 'binding',
  metal_binding: 'binding',
  active_site: 'active_site',
  disulfide_bond: 'disulfide_bond',
  TATA_signal: 'core_promoter',
  '-35_signal': 'core_promoter',
  '-10_signal': 'core_promoter',
  CAAT_signal: 'core_promoter',
  GC_signal: 'core_promoter',
  polyA_signal: 'poly_a',
  polyA_site: 'poly_a',
  RBS: 'regulatory',
  primer_bind: 'primer_bind',
  intron: 'intron',
  stem_loop: 'stem_loop',
  unsure: 'unsure',
};

/**
 * Specialized gene classification based on qualifiers.
 * Called only for gene-features that survived the RNA-child filter.
 */
function normalizeGeneType(feat) {
  const q = feat.qualifiers || {};
  if (q.ncRNA_class) return 'ncRNA';
  const product = String(q.product || '').toLowerCase();
  if (/\btrna\b/.test(product)) return 'tRNA';
  if (/\b(rrna|ribosomal\s+rna|16s|23s|5s|18s|28s)\b/.test(product)) return 'rRNA';
  return 'gene';
}

/**
 * Normalize a region-level feature type to our model.
 * @param {string} type — INSDC feature type
 * @param {Object} [feat] — full feature object (required for 'gene' classification)
 */
export function normalizeType(type, feat) {
  if (type === 'gene' && feat) return normalizeGeneType(feat);
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

/** Extract color from SnapGene/APE qualifiers, honoring strand for APE revcolor. */
function extractColor(feat) {
  const q = feat.qualifiers || {};
  if (feat.strand === -1 && q.ApEinfo_revcolor) return q.ApEinfo_revcolor;
  return q.ApEinfo_fwdcolor
    || q['SnapGene:color']
    || q.color
    || null;
}

// ═══ Qualifier preservation (FEAT-QUALIFIERS) ═══
// GenBank/SnapGene carry rich INSDC qualifiers (/gene //product //note …) that a
// fungal lab tracks (gene names, EC numbers, function notes). They were dropped on
// import → provenance loss on round-trip. Preserve a whitelist on `ann.qualifiers`
// (excludes ones already mapped elsewhere: label→name, ApEinfo→color, exons→introns,
// primer_seq→primer). The feature tooltip (annotation-title) already reads
// qualifiers.note/product, so preserved notes surface immediately.
const QUALIFIER_WHITELIST = [
  'note', 'product', 'gene', 'gene_synonym', 'locus_tag', 'old_locus_tag',
  'EC_number', 'db_xref', 'function', 'standard_name', 'protein_id', 'pseudo',
  // P4.0 — reading-frame + genetic-code provenance for protein search (aa:).
  // INSDC /codon_start (1|2|3, 1-based frame offset) and /transl_table (NCBI id).
  // Ride as raw strings on ann.qualifiers; the translate-cds consumer parses +
  // converts codon_start→frame offset at its own boundary (never store shifted).
  'codon_start', 'transl_table',
];
function pickQualifiers(q) {
  if (!q || typeof q !== 'object') return null;
  const out = {};
  for (const k of QUALIFIER_WHITELIST) {
    const v = q[k];
    if (v != null && v !== '') out[k] = v;
  }
  return Object.keys(out).length ? out : null;
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
  // Skip source features entirely.
  // Skip gene features that contain any CDS/RNA child (avoid duplicate regions).
  const geneChildren = features.filter(f => GENE_CHILD_TYPES.has(f.type));
  const filtered = features.filter(f => {
    if (f.type === 'source') return false;
    if (f.type === 'gene') {
      return !geneChildren.some(child =>
        child.start >= f.start && child.end <= f.end
      );
    }
    return true;
  });

  // Sort largest-first for region pass
  const sorted = [...filtered].sort((a, b) => (b.end - b.start) - (a.end - a.start));

  // ── Step 2 + 3: First pass — create regions ──
  for (const feat of sorted) {
    if (!REGION_TYPES.has(feat.type)) continue;

    const regionId = generateRegionId();
    const q = pickQualifiers(feat.qualifiers);
    const ann = {
      id: regionId,
      name: extractName(feat),
      type: normalizeType(feat.type, feat),
      start: feat.start,
      end: feat.end,
      strand: feat.strand || 1,
      level: 'region',
      auto: false,
      source: 'import',
      color: extractColor(feat),
      ...(q ? { qualifiers: q } : {}),
    };

    regions.push(ann);
    annotations.push(ann);

    // If feature has exon parts (from GenBank join()), create intron annotations for gaps.
    if (EXON_BEARING_TYPES.has(feat.type) && feat.qualifiers?.exons) {
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
            strand: feat.strand || 1,
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
      const qd = pickQualifiers(feat.qualifiers);
      annotations.push({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        start: feat.start,
        end: feat.end,
        strand: feat.strand || 1,
        level: 'detail',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'import',
        color: extractColor(feat),
        ...(qd ? { qualifiers: qd } : {}),
      });
      continue;
    }

    if (POINT_TYPES.has(feat.type)) {
      annotations.push({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        start: feat.start,
        end: feat.end,
        strand: feat.strand || 1,
        level: 'point',
        auto: false,
        source: 'import',
      });
      continue;
    }

    // Unknown type — heuristic.
    // Note: 'exon' features fall through here → typically become details.
    // Explicit handling not needed — GenBank join() in CDS already extracts introns via EXON_BEARING_TYPES.
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
        strand: feat.strand || 1,
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
        strand: feat.strand || 1,
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

  // Write-path id (⚓ DEC-ANN-10 / TD-IMPORTER-NO-ID): every annotation —
  // region, detail, point — gets a stable id here, not deferred to read-path.
  for (const a of annotations) {
    if (!a.id) a.id = generateRegionId();
  }

  return { annotations, primers };
}
