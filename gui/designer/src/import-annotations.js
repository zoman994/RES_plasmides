/**
 * Import external features (SnapGene, GenBank, APE) into region/detail/point model.
 *
 * Input: array of { type, start, end, strand, qualifiers } from BioPython parsing.
 * Output: { annotations: Array, primers: Array }
 */

import { generateRegionId } from './domain-detection';
import { ingestAnnotations } from './lib/annotation-identity';
import {
  LOCATION_KINDS,
  makeLocation,
  normalizeLocation,
  locationLength,
  locationCovers,
} from './lib/annotation-location';

/**
 * Canonical location for an incoming feature. A parser that already speaks the
 * location contract (GenBank, `.bodge` container) supplies `feat.location`;
 * a scalar-only source (legacy SnapGene projection) is lifted to a single
 * segment here. This is the ingress point — downstream code reads segments.
 */
function locationForFeature(feat) {
  if (feat.location) return makeLocation(feat.location.kind, feat.location.segments);
  if (Array.isArray(feat.segments) && feat.segments.length) {
    // The backend already decided join vs order — do not coerce every
    // multi-segment answer to `join`. `order` means the parts' relative order
    // is known but their connection is not, which is biologically different.
    const declared = feat.location_kind;
    const kind = feat.segments.length === 1
      ? LOCATION_KINDS.SINGLE
      : (declared === LOCATION_KINDS.ORDER ? LOCATION_KINDS.ORDER : LOCATION_KINDS.JOIN);
    return makeLocation(kind, feat.segments);
  }
  return makeLocation(LOCATION_KINDS.SINGLE, [{ start: feat.start, end: feat.end }]);
}

/**
 * Attach the canonical location plus its coherent scalar projection.
 *
 * Runs through `normalizeLocation`, so ingress obeys the SAME gate as every
 * other write path: an origin crossing is accepted only on a circular document,
 * a malformed multi-descent list is rejected rather than sorted, and the
 * projection can never drift from the segments.
 */
function withLocation(ann, feat, doc) {
  const location = locationForFeature(feat);
  return normalizeLocation({ ...ann, location }, doc);
}

/**
 * Fail-closed at FEATURE granularity.
 *
 * A location the gate rejects (out of the sequence, reversed, an origin
 * crossing on a linear molecule, an unrepresentable multi-descent list) must
 * never enter the model — but it must also not abort the whole import. A real
 * `.gb` with one truncated or malformed feature still contains valid biology in
 * the rest of the file, and throwing here made the entire document unopenable.
 *
 * Returns `null` for a rejected feature; the caller skips it and counts it.
 */
function tryWithLocation(ann, feat, doc, rejected, rejectedFeatures) {
  try {
    return withLocation(ann, feat, doc);
  } catch (err) {
    rejected.push({ name: ann?.name ?? feat?.type ?? 'feature', reason: err.message });
    // Identity, not name: the caller excludes THIS feature, never every
    // feature that happens to share its label.
    if (rejectedFeatures && feat) rejectedFeatures.add(feat);
    return null;
  }
}

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
// ANN-0I — provenance is PRESERVED, not whitelisted. A fungal lab tracks
// arbitrary keys (`/inference`, `/experiment`, lab-local `/plasmid_id`), and a
// fixed allow-list silently discarded every one of them. Only fields whose
// information is already carried elsewhere on the annotation are dropped, plus
// keys that would poison the prototype chain.
const QUALIFIER_MAPPED_ELSEWHERE = new Set([
  'label',            // → ann.name
  'ApEinfo_fwdcolor', // → ann.color
  'ApEinfo_revcolor', // → ann.color
  'SnapGene:color',   // → ann.color
  'color',            // → ann.color
  'exons',            // → intron detail annotations
  'primer_seq',       // → the primer pool
]);
const UNSAFE_QUALIFIER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** JSON-safe = a string, finite number, boolean, or an array of those. */
function isJsonSafeQualifier(v) {
  if (typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => isJsonSafeQualifier(x) && !Array.isArray(x));
  return false;
}

function pickQualifiers(q) {
  if (!q || typeof q !== 'object') return null;
  const out = Object.create(null);
  for (const k of Object.keys(q)) {
    if (UNSAFE_QUALIFIER_KEYS.has(k)) continue;
    if (QUALIFIER_MAPPED_ELSEWHERE.has(k)) continue;
    const v = q[k];
    if (v == null || v === '') continue;
    if (!isJsonSafeQualifier(v)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? { ...out } : null;
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
export function importFeatures(features, seqLength, format, docOrTopology) {
  const doc = (docOrTopology && typeof docOrTopology === 'object')
    ? { length: Number.isFinite(docOrTopology.length) ? docOrTopology.length : seqLength,
        topology: docOrTopology.topology }
    : { length: seqLength, topology: docOrTopology };
  if (!features?.length) return { annotations: [], primers: [] };

  const annotations = [];
  const regions = [];
  // Locations the coherence gate refused — skipped, never silently repaired.
  const rejected = [];
  const rejectedFeatures = new Set();

  // ── Step 1: Filter ──
  // Skip source features entirely.
  // Skip gene features that contain any CDS/RNA child (avoid duplicate regions).
  const geneChildren = features.filter(f => GENE_CHILD_TYPES.has(f.type));
  const filtered = features.filter(f => {
    if (f.type === 'source') return false;
    if (f.type === 'gene') {
      return !geneChildren.some(child => locationCovers(f, child));
    }
    return true;
  });

  // Sort largest-first for region pass. Size is the summed segment length, so a
  // spliced or origin-crossing feature is ranked by its real extent rather than
  // by a bounding span that may be negative after an origin crossing.
  const sorted = [...filtered].sort((a, b) => locationLength(b) - locationLength(a));

  // ── Step 2 + 3: First pass — create regions ──
  for (const feat of sorted) {
    if (!REGION_TYPES.has(feat.type)) continue;

    const regionId = generateRegionId();
    const q = pickQualifiers(feat.qualifiers);
    const ann = tryWithLocation({
      id: regionId,
      name: extractName(feat),
      type: normalizeType(feat.type, feat),
      strand: feat.strand || 1,
      level: 'region',
      auto: false,
      source: 'import',
      color: extractColor(feat),
      ...(q ? { qualifiers: q } : {}),
    }, feat, doc, rejected, rejectedFeatures);
    if (!ann) continue;

    regions.push(ann);
    annotations.push(ann);

    // If feature has exon parts (from GenBank join()), create intron annotations for gaps.
    if (EXON_BEARING_TYPES.has(feat.type) && feat.qualifiers?.exons) {
      const exons = feat.qualifiers.exons; // [{ start, end }, ...]
      for (let ei = 0; ei < exons.length - 1; ei++) {
        const intronStart = exons[ei].end;
        const intronEnd = exons[ei + 1].start;
        if (intronEnd > intronStart) {
          // A synthesized intron is a write path like any other — it gets a
          // canonical location, not just a scalar pair.
          const intronAnn = tryWithLocation({
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
          }, { start: intronStart, end: intronEnd }, doc, rejected, null);
          if (intronAnn) annotations.push(intronAnn);
        }
      }
    }
  }

  // ── Step 4: Second pass — details, points, unknowns ──
  for (const feat of sorted) {
    if (feat.type === 'source') continue;
    if (REGION_TYPES.has(feat.type)) continue; // already processed

    if (DETAIL_TYPES.has(feat.type)) {
      const parentRegion = regions.find(r => locationCovers(r, feat));
      const qd = pickQualifiers(feat.qualifiers);
      const detailAnn = tryWithLocation({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        strand: feat.strand || 1,
        level: 'detail',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'import',
        color: extractColor(feat),
        ...(qd ? { qualifiers: qd } : {}),
      }, feat, doc, rejected, rejectedFeatures);
      if (detailAnn) annotations.push(detailAnn);
      continue;
    }

    if (POINT_TYPES.has(feat.type)) {
      const qp = pickQualifiers(feat.qualifiers);
      const pointAnn = tryWithLocation({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        strand: feat.strand || 1,
        level: 'point',
        auto: false,
        source: 'import',
        ...(qp ? { qualifiers: qp } : {}),
      }, feat, doc, rejected, rejectedFeatures);
      if (pointAnn) annotations.push(pointAnn);
      continue;
    }

    // Unknown type — heuristic.
    // Note: 'exon' features fall through here → typically become details.
    // Explicit handling not needed — GenBank join() in CDS already extracts introns via EXON_BEARING_TYPES.
    const span = locationLength(feat);
    const isInsideRegion = regions.some(r => locationCovers(r, feat));

    if (span > seqLength * 0.1 && !isInsideRegion) {
      // Large + not inside a region → region
      const regionId = generateRegionId();
      const qu = pickQualifiers(feat.qualifiers);
      const ann = tryWithLocation({
        id: regionId,
        name: extractName(feat),
        type: 'misc_feature',
        strand: feat.strand || 1,
        level: 'region',
        auto: false,
        source: 'import',
        color: extractColor(feat),
        ...(qu ? { qualifiers: qu } : {}),
      }, feat, doc, rejected, rejectedFeatures);
      if (!ann) continue;
      regions.push(ann);
      annotations.push(ann);
    } else {
      // Small or inside a region → detail
      const parentRegion = regions.find(r => locationCovers(r, feat));
      const qf = pickQualifiers(feat.qualifiers);
      const fallbackAnn = tryWithLocation({
        name: extractName(feat),
        type: normalizeDetailType(feat.type),
        strand: feat.strand || 1,
        level: 'detail',
        regionId: parentRegion?.id || null,
        auto: false,
        source: 'import',
        color: extractColor(feat),
        ...(qf ? { qualifiers: qf } : {}),
      }, feat, doc, rejected, rejectedFeatures);
      if (fallbackAnn) annotations.push(fallbackAnn);
    }
  }

  // ── Step 5: Extract primers ──
  // A `primer_bind` whose location the gate refused is NOT a primer — letting
  // it through would put an oligo with invented coordinates into the pool.
  //
  // ANN-0J root 4 — the exclusion keys on the FEATURE OBJECT, not its name.
  // Matching by name meant a rejected `P` also deleted an unrelated, perfectly
  // valid `P` elsewhere in the file: two different oligos, one shared label.
  const primers = features
    .filter(f => f.type === 'primer_bind')
    // ANN-0L C1 — a refused location is refused as an ANNOTATION; the primer
    // stays. The gate judges coordinates, and bad coordinates say nothing
    // about the oligo or where it came from. Dropping the record here threw
    // away facts the location never touched. The row keeps no usable site, so
    // no glyph is drawn — which is the honest outcome, not deletion.
    .map(f => ({
      locationRejected: rejectedFeatures.has(f),
      name: extractName(f),
      sequence: f.qualifiers?.primer_seq || '',
      // ANN-0J root 3 — the supported `/note="sequence: …"` form lives in the
      // qualifiers. Dropping them here is why that note never reached the
      // primer and the oligo silently degraded to a derived binding sequence.
      note: f.qualifiers?.note,
      qualifiers: f.qualifiers || null,
      // ANN-0L — forward the canonical location, not just its scalar
      // projection. An origin-crossing primer_bind projects to end <= start,
      // so start/end alone cannot describe where it binds.
      // A refused location must not travel on as if it were usable.
      location: rejectedFeatures.has(f) ? null : (f.location || null),
      start: rejectedFeatures.has(f) ? null : f.start,
      end: rejectedFeatures.has(f) ? null : f.end,
      strand: f.strand || 1,
      source: 'import',
    }));

  // ANN-INTEGRITY — one canonical identity ingress gate for ALL levels
  // (region / detail / point): adopt a legacy parentId as the canonical
  // regionId, repair duplicate ids collision-safely, stamp an opaque id on
  // anything id-less, and drop any stale bare `segments` display-shape. Replaces
  // the ad-hoc per-annotation id stamping (⚓ DEC-ANN-10 / TD-IMPORTER-NO-ID).
  const gated = ingestAnnotations(annotations);

  return { annotations: gated, primers, rejected };
}
