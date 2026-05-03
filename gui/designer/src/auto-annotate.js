/**
 * Auto-annotation for Parts — region-aware model.
 *
 * Three annotation levels:
 *   region  — what this DNA is (CDS, promoter, terminator, …)
 *   detail  — sub-elements within a region (domains, tags, regulatory)
 *   point   — point markers (RE sites, stop codons)
 *
 * Primary export: autoAnnotate(part) — region-aware.
 * Compat export:  generateAutoAnnotations(part) — wrapper for old callers.
 */

import { translateDNA } from './codons';
import {
  detectHisTag,
  generateRegionId, detectDomainsAsAnnotations,
} from './domain-detection';
import { PEPTIDE_TAGS, FUSION_PARTNERS } from './tags-db';

// ═══ Known protein tags (searched in translated CDS) ═══
// Merge peptide tags (small, by protein sequence) + fusion partners (large, by N-terminal pattern)
const KNOWN_TAGS = [
  ...PEPTIDE_TAGS.map(t => ({ name: t.name, pattern: t.protein })),
  ...FUSION_PARTNERS.map(fp => ({ name: fp.name, pattern: fp.pattern })),
];

const STOP_CODONS = { TAA: 'TAA', TAG: 'TAG', TGA: 'TGA' };

// NOTE: linker / -10 / -35 / RBS / TATA / CAAT / poly-A / signal-peptide /
// pro-peptide consensus detectors were dropped from auto-annotate. Their 6–8 bp
// (or N-terminal hydrophobic-window heuristic) signatures had high false-
// positive rates and produced 25+ "Linker N" + a flock of "-10 element" /
// "RBS (Shine-Dalgarno)" / spurious "Signal peptide" entries on every plasmid,
// drowning the LinearFeatureBar in leader-labels. The types stay supported in
// TYPE_GROUPS / palette so users can add them manually; the auto-annotator
// just doesn't guess them anymore. A future per-CDS context action will let
// the user run SignalIP / Phobius on demand from the annotation editor.

// ═══════════════════════════════════════════════════════════
// Type-specific detectors
// All return annotations with coordinates RELATIVE to their input (0-based).
// Caller adds offset + regionId.
// ═══════════════════════════════════════════════════════════

/**
 * CDS details: start/stop codon, His-tag, named protein tags.
 * Coordinates are 0-based relative to the region sequence.
 */
function annotateCDS(seq) {
  const annotations = [];
  const upper = seq.toUpperCase();

  // Start codon
  if (upper.length >= 3 && upper.slice(0, 3) === 'ATG') {
    annotations.push({
      name: 'Start codon (ATG)',
      type: 'start_codon',
      start: 0,
      end: 3,
      level: 'point',
      auto: true,
      confidence: 1,
      detector: 'cds_scan',
    });
  }

  // Stop codon — check last in-frame codon
  if (upper.length >= 3) {
    // Find last complete in-frame codon position
    const lastCodonPos = Math.floor((upper.length - 1) / 3) * 3;
    const lastCodon = upper.slice(lastCodonPos, lastCodonPos + 3);
    if (lastCodon.length === 3 && STOP_CODONS[lastCodon]) {
      annotations.push({
        name: `Stop codon (${lastCodon})`,
        type: 'stop_codon',
        start: lastCodonPos,
        end: lastCodonPos + 3,
        level: 'point',
        auto: true,
        confidence: 1,
        detector: 'cds_scan',
      });
    }
  }

  // Protein analysis (need at least 20 aa)
  const protein = translateDNA(upper);
  if (protein.length < 20) return annotations;

  // His-tag
  const his = detectHisTag(protein);
  if (his) {
    annotations.push({
      name: `His${his.length}-tag`,
      type: 'tag',
      start: (his.startAA - 1) * 3,
      end: his.endAA * 3,
      level: 'detail',
      auto: true,
      confidence: 0.95,
      detector: 'tag_scan',
    });
  }

  // Other known tags
  for (const tag of KNOWN_TAGS) {
    if (tag.name === 'His6-tag') continue;
    const idx = protein.indexOf(tag.pattern);
    if (idx < 0) continue;
    if (tag.name === 'Enterokinase site' && protein.includes('DYKDDDDK')) continue;
    annotations.push({
      name: tag.name,
      type: 'tag',
      start: idx * 3,
      end: (idx + tag.pattern.length) * 3,
      level: 'detail',
      auto: true,
      confidence: 0.9,
      detector: 'tag_scan',
    });
  }

  return annotations;
}

// ═══ Common restriction enzyme sites ═══
const COMMON_RE_SITES = {
  EcoRI:   'GAATTC',
  BamHI:   'GGATCC',
  HindIII: 'AAGCTT',
  XhoI:    'CTCGAG',
  NdeI:    'CATATG',
  XbaI:    'TCTAGA',
  SpeI:    'ACTAGT',
  PstI:    'CTGCAG',
  SalI:    'GTCGAC',
  KpnI:    'GGTACC',
  SacI:    'GAGCTC',
  NotI:    'GCGGCCGC',
  BglII:   'AGATCT',
  NcoI:    'CCATGG',
  AscI:    'GGCGCGCC',
  FseI:    'GGCCGGCC',
};

/**
 * Detect common restriction enzyme sites in a sequence.
 * @param {string} seq — DNA sequence
 * @returns {Array} point-level annotations for each RE site found
 */
function annotateRESites(seq) {
  const annotations = [];
  const upper = seq.toUpperCase();
  for (const [name, site] of Object.entries(COMMON_RE_SITES)) {
    let idx = upper.indexOf(site);
    while (idx >= 0) {
      annotations.push({
        name,
        type: 'restriction_site',
        start: idx,
        end: idx + site.length,
        level: 'point',
        auto: true,
        detector: 're_scan',
      });
      idx = upper.indexOf(site, idx + 1);
    }
  }
  return annotations;
}

// ═══ Annotation type colors (for UI rendering) ═══
export const ANNOTATION_COLORS = {
  // Region types
  CDS: '#3B82F6',            // blue
  promoter: '#22C55E',       // green
  terminator: '#F97316',     // orange
  marker: '#FBBF24',         // yellow
  rep_origin: '#A855F7',     // purple
  fusion: '#6B7280',         // gray
  // Detail types
  start_codon: '#22C55E',    // green
  stop_codon: '#EF4444',     // red
  tag: '#F59E0B',            // amber
  core_promoter: '#16A34A',  // dark green
  signal_peptide: '#EC4899', // pink
  propeptide: '#14B8A6',     // teal
  regulatory: '#8B5CF6',     // violet
  polyA_signal: '#EA580C',   // dark orange
  linker: '#6B7280',         // gray
  catalytic: '#2563EB',      // dark blue
  binding: '#059669',        // emerald
  domain: '#60A5FA',         // light blue
  intron: '#9CA3AF',         // gray-400 — muted for non-coding
  mutation: '#D946EF',       // fuchsia — stands out
  misc: '#94A3B8',           // slate
  // Extended types
  reporter: '#10B981',       // emerald — fluorescence
  gene: '#3B82F6',           // blue (same as CDS)
  enhancer: '#8B5CF6',       // violet
  '5UTR': '#6366F1',         // indigo
  '3UTR': '#6366F1',         // indigo
  RBS: '#8B5CF6',            // violet
  Kozak: '#8B5CF6',          // violet
  IRES: '#7C3AED',           // violet-700
  insulator: '#64748B',      // slate
  NLS: '#0EA5E9',            // sky
  T2A: '#F97316',            // orange
  MCS: '#78716C',            // stone
  ARS_CEN: '#A855F7',        // purple (like rep_origin)
  loxP: '#D946EF',           // fuchsia
  FRT: '#D946EF',            // fuchsia
  gRNA: '#14B8A6',           // teal
  ncRNA: '#14B8A6',          // teal
  aptamer: '#14B8A6',        // teal
  homology_arm: '#78716C',   // stone
  spacer: '#94A3B8',         // slate-400
  restriction_site: '#EF4444', // red — RE sites stand out
  // Stage 1.2 — new region types
  mRNA: '#6366F1',           // indigo
  tRNA: '#14B8A6',           // teal (same family as ncRNA)
  rRNA: '#0D9488',           // teal-600
  misc_RNA: '#14B8A6',       // teal
  oriT: '#7C3AED',           // violet-700 (biologically ≠ rep_origin)
  repeat_region: '#6B7280',  // gray
  mobile_element: '#64748B', // slate-500
  'D-loop': '#E0E7FF',       // indigo-100
  // Stage 1.2 — new / re-scoped detail types
  mat_peptide: '#84CC16',    // lime — mature peptide
  transit_peptide: '#C084FC',// purple-300 — organelle targeting
  motif: '#A78BFA',          // violet-300
  region: '#94A3B8',         // slate — generic INSDC region
  unsure: '#FCA5A5',         // red-300 — ambiguous
  stem_loop: '#FB923C',      // orange-400
};

// CDS-like region types that trigger protein detectors
const CDS_TYPES = new Set(['CDS', 'gene', 'marker']);

// ═══════════════════════════════════════════════════════════
// Main exports
// ═══════════════════════════════════════════════════════════

/**
 * Region-aware auto-annotation.
 *
 * 1. Reads existing region annotations (level === 'region')
 * 2. If none, creates one primary region from part.type
 * 3. Runs per-region detectors with correct offset
 * 4. Merges with existing manual annotations
 *
 * @param {Object} part — { name, type, sequence, organism?, annotations? }
 * @returns {Array} full annotations array (regions + details + points)
 */
export function autoAnnotate(part) {
  if (!part.sequence) return [];

  const seq = part.sequence.toUpperCase();
  if (seq.length === 0) return [];

  // Preserve manual annotations (those without auto: true, excluding regions
  // which are handled separately)
  const manual = (part.annotations || []).filter(a => !a.auto && a.level !== 'region');
  const annotations = [];

  // 1. Determine regions
  const existingRegions = (part.annotations || []).filter(a => a.level === 'region');
  const regions = [];

  if (existingRegions.length > 0) {
    // Use existing regions as-is
    regions.push(...existingRegions);
    annotations.push(...existingRegions);
  } else {
    // Create one primary region covering the entire Part
    const primary = {
      id: generateRegionId(),
      name: part.name || part.type || 'Unknown',
      type: part.type || 'misc',
      start: 0,
      end: seq.length,
      level: 'region',
      auto: true,
      detector: 'base',
    };
    regions.push(primary);
    annotations.push(primary);
  }

  // 2. Per-region detection
  for (const region of regions) {
    const regionSeq = seq.slice(region.start, region.end);
    if (regionSeq.length === 0) continue;

    let details = [];

    if (CDS_TYPES.has(region.type)) {
      details = annotateCDS(regionSeq);
    }
    // promoter / terminator detail-detection removed — see note at top of file.

    // Offset all detail coordinates by region start + assign regionId
    for (const d of details) {
      d.start += region.start;
      d.end += region.start;
      d.regionId = region.id;
    }

    annotations.push(...details);
  }

  // 3. RE site detection (across the entire sequence, for all part types)
  const reSites = annotateRESites(seq);
  annotations.push(...reSites);

  // 4. Merge manual annotations (keep user-created ones)
  annotations.push(...manual);

  return annotations;
}

/**
 * Compat wrapper — matches the old API.
 * Returns existing annotations if present (never overwrites user data).
 * New code should use autoAnnotate() directly.
 */
export function generateAutoAnnotations(part) {
  // Don't overwrite existing annotations (preserves backward compat)
  if (part.annotations?.length) return part.annotations;
  return autoAnnotate(part);
}

/**
 * Async enrichment: detect common features from reference database.
 * Non-blocking — call after instant autoAnnotate().
 * Returns enriched annotations array or original if DB unavailable.
 *
 * @param {string} sequence — DNA sequence
 * @param {Array} annotations — existing annotations from autoAnnotate()
 * @returns {Promise<Array>} enriched annotations
 */
export async function enrichWithCommonFeatures(sequence, annotations) {
  try {
    const { detectCommonFeaturesAsync } = await import('./feature-detection');
    const detected = await detectCommonFeaturesAsync(sequence);

    const enriched = [...annotations];

    for (const hit of (detected || [])) {
      // Check if there's already an annotation covering this region
      const existing = enriched.find(a =>
        a.level === 'region' &&
        Math.abs(a.start - hit.start) < 10 &&
        Math.abs(a.end - hit.end) < 10
      );

      if (existing) {
        // Enrich existing annotation with known feature data
        if (!existing.description && hit.feature.description) {
          existing.description = hit.feature.description;
        }
        if (hit.feature.aliases?.length) {
          existing.aliases = hit.feature.aliases;
        }
        existing.knownFeature = hit.feature.name;
        existing.source = 'common_db';
        existing.identity = hit.identity;
      } else {
        // Add as new region annotation
        enriched.push({
          name: hit.feature.name,
          type: hit.feature.type,
          start: hit.start,
          end: hit.end,
          level: 'region',
          auto: true,
          source: 'common_db',
          identity: hit.identity,
          description: hit.feature.description,
          detector: hit.method,
          knownFeature: hit.feature.name,
        });
      }
    }

    // ORF detection: find unknown genes not in common-features.json
    // Dynamic import — if orf-detection.js fails, enrichment continues without ORF scan
    try {
      const { detectORFs } = await import('./orf-detection');
      const orfAnnotations = detectORFs(sequence, enriched);
      enriched.push(...orfAnnotations);
    } catch (e) {
      console.warn('ORF detection skipped:', e.message);
    }

    // If real regions were found (from DB or ORF scan), remove generic misc_feature
    // that covers >80% of the sequence (artifact from autoAnnotate fallback)
    const hasRealRegions = enriched.some(a =>
      a.level === 'region' && a.type !== 'misc_feature' &&
      (a.source === 'common_db' || a.detector === 'orf_scan')
    );
    if (hasRealRegions) {
      const seqLen = sequence.length;
      return enriched.filter(a => {
        if (a.level !== 'region' || a.type !== 'misc_feature') return true;
        if (a.source === 'import') return true; // keep user-imported misc_features
        const coverage = (a.end - a.start) / seqLen;
        return coverage < 0.8;
      });
    }

    return enriched;
  } catch {
    // DB not available — return original annotations
    return annotations;
  }
}
