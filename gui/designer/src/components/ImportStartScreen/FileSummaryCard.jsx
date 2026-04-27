/**
 * FileSummaryCard — static "what's in this file" card under the filled
 * InputZone in single-file ImportStartScreen mode.
 *
 * Sub-sections (each hidden if data missing):
 *   1. Region-type counter strip — `5 CDS · 2 promoter · 4 misc · 1 origin`
 *      with featureColor() dot before each.
 *   2. Top-5 longest features — colored dot + name + bp.
 *   3. RE sites summary — `1× BsaI · 6× MCS (...)`. Uses scanAllSites
 *      with minSiteLen=6 and surfaces only enzymes that cut <=6 times to
 *      keep noise down. Falls back silently if no sites detected.
 *   4. Validation warnings (only if parsedItem.warnings has entries).
 */
import { useMemo } from 'react';
import { getRegions } from '../../annotation-model';
import { featureColor } from '../../feature-palette';
import { scanAllSites } from '../../restriction-db';

function summarizeRegionTypes(regions) {
  const counts = new Map();
  for (const r of regions) {
    const t = r.type || 'misc_feature';
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function topNLongest(regions, n = 5) {
  return regions
    .slice()
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, n);
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

export default function FileSummaryCard({ parsedItem }) {
  const regions = useMemo(() => getRegions(parsedItem?.annotations || []), [parsedItem]);
  const typeCounts = useMemo(() => summarizeRegionTypes(regions), [regions]);
  const topFeatures = useMemo(() => topNLongest(regions, 5), [regions]);
  const reSites = useMemo(
    () => summarizeRESites(parsedItem?.sequence, parsedItem?.topology),
    [parsedItem],
  );
  const warnings = parsedItem?.warnings || [];

  if (!parsedItem) return null;
  const hasAnything = typeCounts.length || topFeatures.length || reSites.length || warnings.length;
  if (!hasAnything) return null;

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

      {topFeatures.length > 0 && (
        <div className="space-y-0.5" data-testid="file-summary-top-features">
          <div className="text-[10px] uppercase text-gray-400">Самые длинные</div>
          {topFeatures.map((f) => {
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
        <div className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 space-y-0.5" data-testid="file-summary-warnings">
          {warnings.slice(0, 5).map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
