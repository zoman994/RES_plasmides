/**
 * FileSummaryCard — static "what's in this file" card under the filled
 * InputZone in single-file ImportStartScreen mode.
 *
 * Sub-sections (each hidden if empty):
 *   1. Region-type counter strip — `5 CDS · 2 promoter · 4 misc · 1 origin`
 *      with featureColor() dot before each.
 *   2. Категории (Polish): 🛡 Селекция / 📣 Промоторы / ⚓ Origin / 🏷 Tags
 *      — each line lists matching region names (resistance markers, etc.).
 *      Replaces the old «Самые длинные» list which surfaced biologically
 *      irrelevant 3'UTRs / repeat regions on top.
 *   3. CDS (N) — remaining CDS regions (those not pulled into Селекция /
 *      Tags categories), top-5 by length, then `…ещё N CDS` overflow.
 *   4. RE sites summary — `1× BsaI · 6× MCS (...)`. Uses scanAllSites with
 *      minSiteLen=6 and surfaces only enzymes that cut <=6 times.
 *   5. Validation warnings (V8 closes here) — collapsible block, default
 *      collapsed. Expanded shows all warnings (max-height with internal
 *      scroll if more than 10).
 */
import { useMemo, useState } from 'react';
import { getRegions } from '../../annotation-model';
import { featureColor } from '../../feature-palette';
import { scanAllSites } from '../../restriction-db';

// Polish §4(a). Selection markers — antibiotic resistance + classic markers.
// Tight allow-list to avoid catching unrelated CDS like dCas9, mCherry, etc.
const RESISTANCE_PREFIX_RE = /^(Amp|Kan|Neo|Puro|Hyg|Zeo|Blast|Gent|Cm|Tet|Spc|Ble|Bsd|Sm|Erm)R(\b|\/)/i;
const RESISTANCE_KEYWORD_RE = /\bbla\b|β-?lactamase|aminoglycoside|chloramphenicol acetyltransferase/i;

export function isResistanceMarker(r) {
  if (!r) return false;
  const type = r.type || '';
  if (!['CDS', 'gene', 'marker', 'resistance'].includes(type)) return false;
  const name = r.name || '';
  return RESISTANCE_PREFIX_RE.test(name) || RESISTANCE_KEYWORD_RE.test(name);
}

const ORIGIN_NAME_RE = /^(ori|pUC ori|f1 ori|ColE1|p15A|2[μu]|ARS|CEN|pMB1|R6K|pBR322 ori)/i;
const TAG_NAME_RE = /^(His[6-9]?|FLAG|HA|c?-?Myc|GFP|EGFP|mCherry|mTagBFP|T7-?tag|Strep-?II?|S-?tag|V5|VP(16|64|160))/i;

export function categorizeAnnotations(regions) {
  const selection = [];
  const promoters = [];
  const origins = [];
  const tags = [];
  const usedIds = new Set();

  for (const r of regions) {
    if (isResistanceMarker(r)) {
      selection.push(r);
      usedIds.add(r.id);
      continue;
    }
    if (r.type === 'promoter') {
      promoters.push(r);
      usedIds.add(r.id);
      continue;
    }
    if (r.type === 'rep_origin' || ORIGIN_NAME_RE.test(r.name || '')) {
      origins.push(r);
      usedIds.add(r.id);
      continue;
    }
    if (r.type === 'tag' || TAG_NAME_RE.test(r.name || '')) {
      tags.push(r);
      usedIds.add(r.id);
      continue;
    }
  }

  return { selection, promoters, origins, tags, usedIds };
}

function summarizeRegionTypes(regions) {
  const counts = new Map();
  for (const r of regions) {
    const t = r.type || 'misc_feature';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function summarizeRESites(sequence, topology) {
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

function CategoryLine({ icon, label, regions, testId }) {
  if (!regions.length) return null;
  return (
    <div className="flex items-baseline gap-1.5 text-xs text-gray-700" data-testid={testId}>
      <span className="shrink-0">{icon}</span>
      <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0">{label}:</span>
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {regions.map((r, i) => (
          <span key={r.id} className="inline-flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">·</span>}
            <span
              className="inline-block w-2 h-2 rounded-sm"
              style={{ background: featureColor(r.type, r.name) }}
            />
            <span className="font-medium">{r.name || r.type}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

export default function FileSummaryCard({ parsedItem }) {
  const regions = useMemo(() => getRegions(parsedItem?.annotations || []), [parsedItem]);
  const typeCounts = useMemo(() => summarizeRegionTypes(regions), [regions]);
  const cats = useMemo(() => categorizeAnnotations(regions), [regions]);
  const remainingCDS = useMemo(
    () => regions
      .filter((r) => r.type === 'CDS' && !cats.usedIds.has(r.id))
      .sort((a, b) => (b.end - b.start) - (a.end - a.start)),
    [regions, cats.usedIds],
  );
  const reSites = useMemo(
    () => summarizeRESites(parsedItem?.sequence, parsedItem?.topology),
    [parsedItem],
  );
  const warnings = parsedItem?.warnings || [];
  const [warningsOpen, setWarningsOpen] = useState(false);

  if (!parsedItem) return null;
  const hasCategoryLine = cats.selection.length || cats.promoters.length || cats.origins.length || cats.tags.length;
  const hasAnything =
    typeCounts.length || hasCategoryLine || remainingCDS.length || reSites.length || warnings.length;
  if (!hasAnything) return null;

  const cdsTop = remainingCDS.slice(0, 5);
  const cdsOverflow = Math.max(0, remainingCDS.length - cdsTop.length);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2" data-testid="file-summary-card">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">
        Что в файле
      </div>

      {typeCounts.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-700" data-testid="file-summary-types">
          {typeCounts.map(([type, count]) => (
            <span key={type} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: featureColor(type) }}
              />
              {count} {type}
            </span>
          ))}
        </div>
      )}

      {hasCategoryLine > 0 && (
        <div className="flex flex-col gap-1" data-testid="file-summary-categories">
          <CategoryLine icon="🛡" label="Селекция" regions={cats.selection} testId="cat-selection" />
          <CategoryLine icon="📣" label="Промоторы" regions={cats.promoters} testId="cat-promoters" />
          <CategoryLine icon="⚓" label="Origin" regions={cats.origins} testId="cat-origins" />
          <CategoryLine icon="🏷" label="Tags" regions={cats.tags} testId="cat-tags" />
        </div>
      )}

      {remainingCDS.length > 0 && (
        <div className="space-y-0.5" data-testid="file-summary-cds-list">
          <div className="text-[10px] uppercase text-gray-400">CDS ({remainingCDS.length})</div>
          {cdsTop.map((f) => {
            const len = Math.max(0, f.end - f.start);
            return (
              <div key={f.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                <span
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ background: featureColor(f.type, f.name) }}
                />
                <span className="flex-1 truncate" title={f.name}>{f.name || f.type}</span>
                <span className="text-[10px] text-gray-500">{len.toLocaleString()} bp</span>
              </div>
            );
          })}
          {cdsOverflow > 0 && (
            <div className="text-[10px] text-gray-500 pl-3.5" data-testid="cds-overflow">
              …ещё {cdsOverflow} CDS
            </div>
          )}
        </div>
      )}

      {reSites.length > 0 && (
        <div className="text-xs text-gray-700" data-testid="file-summary-re-sites">
          <div className="text-[10px] uppercase text-gray-400 mb-0.5">Уникальные/редкие сайты</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {reSites.map((s) => (
              <span key={s.name} className="inline-block">
                {s.count}× <span className="font-medium">{s.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div data-testid="file-summary-warnings">
          <button
            type="button"
            onClick={() => setWarningsOpen((v) => !v)}
            className="text-[11px] text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
            data-testid="warnings-toggle"
          >
            <span>{warningsOpen ? '▼' : '▶'}</span>
            <span>{warnings.length} замечаний валидации</span>
          </button>
          {warningsOpen && (
            <div
              className="mt-1 text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 space-y-0.5 overflow-y-auto"
              style={{ maxHeight: warnings.length > 10 ? 200 : undefined }}
              data-testid="warnings-list"
            >
              {warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
