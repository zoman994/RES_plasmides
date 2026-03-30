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
  detectSignalPeptide, detectHisTag, detectPropeptide, detectLinkers,
  generateRegionId, detectDomainsAsAnnotations,
} from './domain-detection';

// ═══ Known protein tags (searched in translated CDS) ═══
const KNOWN_TAGS = [
  { name: 'His6-tag',        pattern: 'HHHHHH' },
  { name: 'FLAG-tag',        pattern: 'DYKDDDDK' },
  { name: 'Strep-tag II',    pattern: 'WSHPQFEK' },
  { name: 'V5-tag',          pattern: 'GKPIPNPLLGLD' },
  { name: 'Myc-tag',         pattern: 'EQKLISEEDL' },
  { name: 'HA-tag',          pattern: 'YPYDVPDYA' },
  { name: 'TEV site',        pattern: 'ENLYFQS' },
  { name: 'Thrombin site',   pattern: 'LVPRGS' },
  { name: 'PreScission site', pattern: 'LEVLFQGP' },
  { name: 'Enterokinase site', pattern: 'DDDDK' },
  { name: 'Factor Xa site',  pattern: 'IEGR' },
  { name: 'GST',             pattern: 'MSPILGYWKIKGLVQP' },
  { name: 'MBP',             pattern: 'MKIEEGKLVI' },
  { name: 'SUMO',            pattern: 'MSDQEAKPSTEDLGDKKEG' },
];

const STOP_CODONS = { TAA: 'TAA', TAG: 'TAG', TGA: 'TGA' };

// Prokaryotic organism keywords
const PROKARYOTE_KEYWORDS = ['ecoli', 'e. coli', 'e.coli', 'bacillus', 'streptomyces', 'pseudomonas', 'salmonella', 'lactobacillus'];

function isProkaryote(organism) {
  if (!organism) return false;
  const low = organism.toLowerCase();
  return PROKARYOTE_KEYWORDS.some(k => low.includes(k));
}

// ═══ Consensus finder with mismatches ═══
function findConsensus(seq, pattern, { maxMismatches = 0, regionStart = 0, regionEnd = null } = {}) {
  const end = regionEnd ?? seq.length;
  const pLen = pattern.length;
  let bestPos = -1;
  let bestMismatches = pLen;

  for (let i = regionStart; i <= end - pLen; i++) {
    let mm = 0;
    for (let j = 0; j < pLen; j++) {
      if (seq[i + j] !== pattern[j]) mm++;
      if (mm > maxMismatches) break;
    }
    if (mm <= maxMismatches && mm < bestMismatches) {
      bestMismatches = mm;
      bestPos = i;
    }
  }

  if (bestPos < 0) return null;
  return { start: bestPos, end: bestPos + pLen, mismatches: bestMismatches };
}

// ═══════════════════════════════════════════════════════════
// Type-specific detectors
// All return annotations with coordinates RELATIVE to their input (0-based).
// Caller adds offset + regionId.
// ═══════════════════════════════════════════════════════════

/**
 * CDS details: stop codon, signal peptide, propeptide, tags, linkers, Kozak.
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

  // Signal peptide
  const sp = detectSignalPeptide(protein);
  if (sp.found) {
    annotations.push({
      name: 'Signal peptide',
      type: 'signal_peptide',
      start: 0,
      end: sp.cleavageSite * 3,
      level: 'detail',
      auto: true,
      confidence: sp.confidence,
      detector: 'vonHeijne',
    });

    // Propeptide (Kex2 cleavage)
    const pro = detectPropeptide(protein, sp.cleavageSite);
    if (pro) {
      annotations.push({
        name: 'Pro-peptide',
        type: 'propeptide',
        start: sp.cleavageSite * 3,
        end: pro.endAA * 3,
        level: 'detail',
        auto: true,
        confidence: 0.7,
        detector: 'kex2_scan',
      });
    }
  }

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

  // Linkers
  const linkers = detectLinkers(protein);
  linkers.forEach((lnk, i) => {
    annotations.push({
      name: `Linker${linkers.length > 1 ? ` ${i + 1}` : ''}`,
      type: 'linker',
      start: (lnk.startAA - 1) * 3,
      end: lnk.endAA * 3,
      level: 'detail',
      auto: true,
      confidence: 0.7,
      detector: 'linker_scan',
    });
  });

  return annotations;
}

/**
 * Promoter details: -10, -35, RBS, TATA, CAAT.
 * Coordinates 0-based relative to region sequence.
 */
function annotatePromoter(seq, organism, organismType) {
  const annotations = [];
  const upper = seq.toUpperCase();
  const len = upper.length;

  const prokaryote = organismType === 'prokaryote' || (!organismType && isProkaryote(organism));
  const eukaryote = organismType === 'eukaryote' || (!organismType && !isProkaryote(organism));
  const searchAll = !organismType;

  if (prokaryote || searchAll) {
    const m10 = findConsensus(upper, 'TATAAT', {
      maxMismatches: 2, regionStart: Math.max(0, len - 50), regionEnd: Math.max(0, len - 5),
    });
    if (m10) {
      annotations.push({
        name: '-10 element', type: 'core_promoter',
        start: m10.start, end: m10.end, level: 'detail',
        auto: true, confidence: +(1 - m10.mismatches / 6).toFixed(2),
        detector: 'prokaryotic_promoter',
      });
    }

    const m35 = findConsensus(upper, 'TTGACA', {
      maxMismatches: 2, regionStart: Math.max(0, len - 60), regionEnd: Math.max(0, len - 25),
    });
    if (m35) {
      annotations.push({
        name: '-35 element', type: 'core_promoter',
        start: m35.start, end: m35.end, level: 'detail',
        auto: true, confidence: +(1 - m35.mismatches / 6).toFixed(2),
        detector: 'prokaryotic_promoter',
      });
    }

    const rbs = findConsensus(upper, 'AGGAGG', {
      maxMismatches: 2, regionStart: Math.max(0, len - 25),
    });
    if (rbs) {
      annotations.push({
        name: 'RBS (Shine-Dalgarno)', type: 'regulatory',
        start: rbs.start, end: rbs.end, level: 'detail',
        auto: true, confidence: +(1 - rbs.mismatches / 6).toFixed(2),
        detector: 'rbs_scan',
      });
    }
  }
  if (eukaryote || searchAll) {
    const tataRegion = upper.slice(Math.max(0, len - 50), Math.max(0, len - 15));
    const tataOffset = Math.max(0, len - 50);
    const tataMatch = tataRegion.match(/TATAA[AT][AG]/);
    if (tataMatch) {
      const pos = tataOffset + tataMatch.index;
      annotations.push({
        name: 'TATA box', type: 'core_promoter',
        start: pos, end: pos + 7, level: 'detail',
        auto: true, confidence: 0.8, detector: 'eukaryotic_promoter',
      });
    }

    const caatRegion = upper.slice(Math.max(0, len - 120), Math.max(0, len - 50));
    const caatOffset = Math.max(0, len - 120);
    const caatIdx = caatRegion.indexOf('CCAAT');
    if (caatIdx >= 0) {
      const pos = caatOffset + caatIdx;
      annotations.push({
        name: 'CAAT box', type: 'core_promoter',
        start: pos, end: pos + 5, level: 'detail',
        auto: true, confidence: 0.7, detector: 'eukaryotic_promoter',
      });
    }
  }

  return annotations;
}

/**
 * Terminator details: Poly-A signal.
 * Coordinates 0-based relative to region sequence.
 */
function annotateTerminator(seq) {
  const annotations = [];
  const upper = seq.toUpperCase();

  const idx = upper.indexOf('AATAAA');
  if (idx >= 0) {
    annotations.push({
      name: 'Poly-A signal', type: 'polyA_signal',
      start: idx, end: idx + 6, level: 'detail',
      auto: true, confidence: 0.85, detector: 'polyA_scan',
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
    } else if (region.type === 'promoter') {
      details = annotatePromoter(regionSeq, part.organism, part.organismType);
    } else if (region.type === 'terminator') {
      details = annotateTerminator(regionSeq);
    }

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
    if (!detected?.length) return annotations;

    const enriched = [...annotations];

    for (const hit of detected) {
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

    return enriched;
  } catch {
    // DB not available — return original annotations
    return annotations;
  }
}
