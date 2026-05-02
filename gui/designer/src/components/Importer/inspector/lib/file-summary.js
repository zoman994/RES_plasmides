import { getRegions } from '../../../../annotation-model';
import { scanAllSites } from '../../../../restriction-db';

/**
 * FileSummary primitives (M-B.2 K3). Extracted from v0.5 FileSummaryCard.jsx
 * so OverviewTab can render the categorised "Что в файле" block as inline
 * sections (no compact-card wrapper) while keeping the regex set + RE
 * scan logic in one tested module.
 */
export const RESISTANCE_PREFIX_RE = /^(Amp|Kan|Neo|Puro|Hyg|Zeo|Blast|Gent|Cm|Tet|Spc|Ble|Bsd|Sm|Erm)R(\b|\/)/i;
export const RESISTANCE_KEYWORD_RE = /\bbla\b|β-?lactamase|aminoglycoside|chloramphenicol acetyltransferase/i;
export const ORIGIN_NAME_RE = /^(ori|pUC ori|f1 ori|ColE1|p15A|2[μu]|ARS|CEN|pMB1|R6K|pBR322 ori)/i;
export const TAG_NAME_RE = /^(His[6-9]?|FLAG|HA|c?-?Myc|GFP|EGFP|mCherry|mTagBFP|T7-?tag|Strep-?II?|S-?tag|V5|VP(16|64|160))/i;

export function isResistanceMarker(r) {
  if (!r) return false;
  const type = r.type || '';
  if (!['CDS', 'gene', 'marker', 'resistance'].includes(type)) return false;
  const name = r.name || '';
  return RESISTANCE_PREFIX_RE.test(name) || RESISTANCE_KEYWORD_RE.test(name);
}

/**
 * Bucket regions into 4 named categories + remainingCDS (CDS not pulled
 * into selection / tags).
 */
export function categorizeAnnotations(regions) {
  const selection = [];
  const promoters = [];
  const origins = [];
  const tags = [];
  const usedIds = new Set();

  for (const r of regions) {
    if (isResistanceMarker(r)) {
      selection.push(r);
      if (r.id) usedIds.add(r.id);
      continue;
    }
    if (r.type === 'promoter') {
      promoters.push(r);
      if (r.id) usedIds.add(r.id);
      continue;
    }
    if (r.type === 'rep_origin' || ORIGIN_NAME_RE.test(r.name || '')) {
      origins.push(r);
      if (r.id) usedIds.add(r.id);
      continue;
    }
    if (r.type === 'tag' || TAG_NAME_RE.test(r.name || '')) {
      tags.push(r);
      if (r.id) usedIds.add(r.id);
      continue;
    }
  }

  return { selection, promoters, origins, tags, usedIds };
}

export function summarizeRegionTypes(regions) {
  const counts = new Map();
  for (const r of regions) {
    const t = r.type || 'misc_feature';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export function summarizeRESites(sequence, topology) {
  if (!sequence || sequence.length < 10) return [];
  try {
    const sites = scanAllSites(sequence, { circular: topology === 'circular', minSiteLen: 6 });
    return sites
      .filter((s) => s.cutCount > 0 && s.cutCount <= 6)
      .slice(0, 8)
      .map((s) => ({ name: s.enzyme, count: s.cutCount }));
  } catch {
    return [];
  }
}

/**
 * Compose a complete summary from a parsedItem. Returns the raw bucket
 * data plus computed remainingCDS / re-sites / type counts; consumers
 * format presentation themselves.
 */
export function buildFileSummary(parsedItem) {
  if (!parsedItem) return null;
  const regions = getRegions(parsedItem.annotations || []);
  const cats = categorizeAnnotations(regions);
  const remainingCDS = regions
    .filter((r) => r.type === 'CDS' && !cats.usedIds.has(r.id))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));
  return {
    regions,
    typeCounts: summarizeRegionTypes(regions),
    cats,
    remainingCDS,
    reSites: summarizeRESites(parsedItem.sequence, parsedItem.topology),
    warnings: parsedItem.warnings || [],
  };
}
