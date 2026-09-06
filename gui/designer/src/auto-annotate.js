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
import { reverseComplement } from './sequence-utils';
import {
  getSegments, makeLocation, LOCATION_KINDS, locationSpan,
} from './lib/annotation-location';
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
    // Find last complete in-frame codon position. V126 fix: use the codon
    // COUNT, not (length-1) — the old `floor((L-1)/3)*3` pointed at the
    // incomplete trailing codon (and missed the real stop) when L%3 ∈ {1,2}.
    const lastCodonPos = (Math.floor(upper.length / 3) - 1) * 3;
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

// Pre-bucket common RE sites by first base. The single-pass scanner
// below does one O(N) walk through the sequence and only candidate-tests
// enzymes whose recognition site starts with the current base — instead
// of running 16 full-sequence indexOf scans (16×N → ~N+~3N work).
const RE_BUCKETS = (() => {
  const m = Object.create(null);
  for (const name of Object.keys(COMMON_RE_SITES)) {
    const site = COMMON_RE_SITES[name];
    const c = site.charCodeAt(0);
    if (!m[c]) m[c] = [];
    m[c].push({ name, site, len: site.length });
  }
  return m;
})();

/**
 * Detect common restriction enzyme sites in a sequence.
 * @param {string} seq — DNA sequence
 * @returns {Array} point-level annotations for each RE site found
 */
function annotateRESites(seq) {
  const annotations = [];
  const upper = seq.toUpperCase();
  const len = upper.length;
  for (let i = 0; i < len; i++) {
    const candidates = RE_BUCKETS[upper.charCodeAt(i)];
    if (!candidates) continue;
    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      if (i + cand.len > len) continue;
      // startsWith with a position arg compiles to a fast inlined check
      // in V8; faster than upper.slice(i, i + cand.len) === cand.site.
      if (upper.startsWith(cand.site, i)) {
        annotations.push({
          name: cand.name,
          type: 'restriction_site',
          start: i,
          end: i + cand.len,
          level: 'point',
          auto: true,
          detector: 're_scan',
        });
      }
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

// ═══ ANN-INTEGRITY correction — canonical-segment region extraction ═══

/** Concatenate a region's canonical segments (traversal order) into one sequence. */
function extractRegionSequence(seq, segs) {
  let out = '';
  for (const s of segs) out += seq.slice(s.start, s.end);
  return out;
}

/**
 * Map a [cs, ce) range in the concatenated (traversal-order) region sequence to
 * the list of ABSOLUTE segments it covers. A range confined to one segment
 * yields one segment; a range straddling a splice / origin boundary yields
 * several (a compound detail location).
 */
function concatRangeToSegments(segs, cs, ce) {
  const out = [];
  let offset = 0;
  for (const s of segs) {
    const segLen = s.end - s.start;
    const lo = Math.max(cs, offset);
    const hi = Math.min(ce, offset + segLen);
    if (hi > lo) out.push({ start: s.start + (lo - offset), end: s.start + (hi - offset) });
    offset += segLen;
  }
  return out;
}

/**
 * Write mapped absolute segments back onto a detail: a scalar range when the hit
 * is contiguous, a canonical compound location when it straddles a boundary.
 */
function applyMappedLocation(d, mappedSegs, strand, regionId) {
  d.strand = strand;
  d.regionId = regionId;
  if (mappedSegs.length === 0) { d.start = 0; d.end = 0; return; }
  if (mappedSegs.length === 1) {
    d.start = mappedSegs[0].start;
    d.end = mappedSegs[0].end;
    return;
  }
  d.location = makeLocation(LOCATION_KINDS.JOIN, mappedSegs);
  const span = locationSpan({ location: d.location });
  d.start = span.start;
  d.end = span.end;
}

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
    // ANN-INTEGRITY correction — assemble the region sequence from its CANONICAL
    // segments in traversal order. A spliced (join) or origin-crossing region has
    // start > end in its scalar projection, so a plain `seq.slice(start,end)` was
    // empty; concatenating segments handles non-zero offsets, linear splices and
    // circular origin crossings alike.
    const segs = getSegments(region);
    const forwardSeq = extractRegionSequence(seq, segs);
    if (forwardSeq.length === 0) continue;

    let details = [];

    if (CDS_TYPES.has(region.type)) {
      // A reverse-strand CDS codes on the reverse complement of the ASSEMBLED
      // region sequence; detect there, then map every hit back to ABSOLUTE
      // forward coordinates through the same segments with strand −1. A forward
      // CDS maps directly through the segments with strand +1.
      const reverse = region.strand === -1;
      const concatLen = forwardSeq.length;
      const analysisSeq = reverse ? reverseComplement(forwardSeq) : forwardSeq;
      details = annotateCDS(analysisSeq);
      for (const d of details) {
        // analysis-relative [d.start, d.end) → concatenated-forward range.
        const [cs, ce] = reverse
          ? [concatLen - d.end, concatLen - d.start]
          : [d.start, d.end];
        applyMappedLocation(d, concatRangeToSegments(segs, cs, ce), reverse ? -1 : 1, region.id);
      }
    }
    // promoter / terminator detail-detection removed — see note at top of file.

    annotations.push(...details);
  }

  // 3. RE site detection (across the entire sequence, for all part types)
  const reSites = annotateRESites(seq);
  annotations.push(...reSites);

  // 4. Merge manual annotations (keep user-created ones)
  annotations.push(...manual);

  // Write-path id (⚓ DEC-ANN-10 / TD-IMPORTER-NO-ID): stamp every annotation
  // lacking one (CDS details, RE points) — the primary region already carries it.
  for (const a of annotations) {
    if (!a.id) a.id = generateRegionId();
  }

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
  // Coverage at/above which a common-feature hit promotes the merged region
  // stub to the named feature (vs only tagging knownFeature). Звено 25.05.2026.
  const REGION_PROMOTE_COVERAGE = 0.80;
  try {
    const { detectCommonFeaturesAsync, featureRegionName } = await import('./feature-detection');
    const detected = await detectCommonFeaturesAsync(sequence);

    // Clone each annotation — enrich must NOT mutate the caller's objects
    // in place (they may be store/Immer-held); patch the copies (audit 29.05).
    const enriched = annotations.map((a) => ({ ...a }));

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
        // ANN-0I — enrichment may ADD detector data, but it must not rewrite
        // provenance. A feature that came from the user's file stays
        // `source: 'import'`; overwriting it made every imported annotation
        // indistinguishable from a database guess, so the biologist could no
        // longer tell what their own file actually contained. Only a NEW
        // detection (no prior source) becomes common_db.
        if (existing.source !== 'import') existing.source = 'common_db';
        existing.detector = existing.detector || 'common_db';
        existing.identity = hit.identity;
        // Carry the detected strand onto the region (Звено 25.05.2026): a gene
        // on the −strand must drive a −strand AA frame in AATrack. Guard on
        // 1|-1 so a strand-less hit can't wipe the region's existing strand.
        if (hit.strand === 1 || hit.strand === -1) existing.strand = hit.strand;
        // «Bare gene» promote: when the hit covers ≥80% of the matched region,
        // the region IS the gene — autoAnnotate seeds an 'imported'/misc_feature
        // stub over a headerless paste. Promote the stub to the named feature so
        // it renders as a visible feature instead of a hidden knownFeature tag.
        // <80% = the gene is only part of a larger annotated region → leave it
        // (the else-branch names it on its own coords).
        const regionLen = existing.end - existing.start;
        const coverage = regionLen > 0 ? (hit.end - hit.start) / regionLen : 0;
        if (coverage >= REGION_PROMOTE_COVERAGE) {
          existing.originalName = existing.name; // keep prior name (consistency w/ file-import enrichAnnotations)
          // V136 — partial hit names the promoted region «KanR_part_X-Y»;
          // knownFeature (set above) stays flat as the canonical identity.
          existing.name = featureRegionName({
            name: hit.feature.name,
            method: hit.method,
            featureStart: hit.featureStart,
            featureEnd: hit.featureEnd,
          });
          existing.type = hit.feature.type;
          if (hit.method === 'protein_partial' || hit.method === 'dna_partial') {
            existing.featureRange = [hit.featureStart, hit.featureEnd];
            existing.coverage = hit.coverage;
            existing.detector = hit.method;
          }
        }
      } else {
        // Add as new region annotation
        const isPartial = hit.method === 'protein_partial' || hit.method === 'dna_partial';
        const newRegion = {
          id: generateRegionId(),
          // V136 — partial hit → «KanR_part_X-Y»; knownFeature stays flat below.
          name: featureRegionName({
            name: hit.feature.name,
            method: hit.method,
            featureStart: hit.featureStart,
            featureEnd: hit.featureEnd,
          }),
          type: hit.feature.type,
          start: hit.start,
          end: hit.end,
          strand: hit.strand, // carry strand so AATrack frames a −strand gene correctly (Звено 25.05.2026)
          level: 'region',
          auto: true,
          source: 'common_db',
          identity: hit.identity,
          description: hit.feature.description,
          detector: hit.method,
          knownFeature: hit.feature.name,
        };
        if (isPartial) {
          newRegion.featureRange = [hit.featureStart, hit.featureEnd];
          newRegion.coverage = hit.coverage;
        }
        enriched.push(newRegion);
      }
    }

    // ORF detection moved out of enrichWithCommonFeatures in Sprint
    // M-X.1 K3 (DEC-PRED-06). ORFs are now transient: produced by
    // `runPredictors()` inside the SequenceView consumer (useMemo),
    // not persisted into baseSnapshot.regions[]. This function stays
    // responsible only for confident hits from common-features.json.
    // To re-enable ORF rendering on the SequenceView, toggle
    // `settings.predictions.cds` (default ON).

    // If real regions were found from the DB, remove generic
    // misc_feature that covers >80% of the sequence (artifact from
    // autoAnnotate fallback). The orf-scan check is dropped together
    // with the in-line ORF call above.
    const hasRealRegions = enriched.some(a =>
      a.level === 'region' && a.type !== 'misc_feature' &&
      a.source === 'common_db'
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
