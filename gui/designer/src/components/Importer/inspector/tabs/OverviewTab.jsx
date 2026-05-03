import { useEffect, useMemo, useState } from 'react';
import PlasmidMiniMap from '../../../PlasmidMiniMap';
import { featureColor } from '../../../../feature-palette';
import { STRINGS } from '../../../../lib/strings';
import { buildFileSummary, summarizeRESitesCached } from '../lib/file-summary';

const S = STRINGS.importer;

/**
 * OverviewTab — lightweight default Inspector tab (M-B.2 K3).
 *
 * Renders inline (no nested card wrapper):
 *   - PlasmidMiniMap 160 px overlay
 *   - Region-type counter strip (Polish §4)
 *   - Categorised "Что в файле" sections (СЕЛЕКЦИЯ / ПРОМОТОРЫ / ORIGIN / TAGS)
 *   - Remaining CDS top-5 with overflow link
 *   - RE sites summary
 *   - Validation warnings (collapsible block)
 *
 * This is the only tab eagerly mounted on Inspector open. SequenceTab
 * and AnnotationsTab (K4) ship as React conditional render — they don't
 * exist in DOM until activeTab matches. That's the V49 50-sec hang fix.
 */
// Test-mode bypass for the lazy reSites scan. In production we defer the
// ~150–250 ms RE scan to the next idle frame so the overview paints
// immediately on click, but Vitest assertions on `importer-overview-re-sites`
// (none today, but safe-guarded for future) need the section synchronously.
const __PREWARM_DISABLED__ =
  typeof import.meta !== 'undefined'
  && typeof import.meta.env !== 'undefined'
  && import.meta.env.MODE === 'test';

export default function OverviewTab({ item }) {
  const summary = useMemo(() => buildFileSummary(item), [item]);
  // Lazy reSites: in production we paint the rest of the overview first
  // (mini-map, type counts, categories, CDS list — fast), then schedule
  // the RE scan via requestIdleCallback. The scan result is cached at
  // the file-summary module level so re-opening the same plasmid in
  // the same session is instant. In test mode we run synchronously.
  const sequence = item?.sequence;
  const topology = item?.topology || 'linear';
  const [reSites, setReSites] = useState(() =>
    __PREWARM_DISABLED__ ? summarizeRESitesCached(sequence, topology) : []
  );
  useEffect(() => {
    if (__PREWARM_DISABLED__) return undefined;
    if (!sequence || sequence.length < 10) {
      setReSites([]);
      return undefined;
    }
    // Reset on sequence change so we don't briefly show STALE sites
    // from a previously selected plasmid.
    setReSites([]);
    let cancelled = false;
    const flush = () => {
      if (cancelled) return;
      setReSites(summarizeRESitesCached(sequence, topology));
    };
    const useRIC = typeof requestIdleCallback !== 'undefined';
    const handle = useRIC
      ? requestIdleCallback(flush, { timeout: 1200 })
      : setTimeout(flush, 50);
    return () => {
      cancelled = true;
      if (useRIC) cancelIdleCallback(handle); else clearTimeout(handle);
    };
  }, [sequence, topology]);

  if (!summary || !item) return null;
  const length = item.length || item.sequence?.length || 0;
  const { typeCounts, cats, remainingCDS, warnings } = summary;
  const cdsTop = remainingCDS.slice(0, 5);
  const cdsOverflow = Math.max(0, remainingCDS.length - cdsTop.length);
  const hasCategoryLine =
    cats.selection.length || cats.promoters.length || cats.origins.length || cats.tags.length;

  return (
    <div
      data-testid="importer-tab-panel-overview"
      style={{
        display: 'grid',
        // 2-col layout: mini-map cell 320px (180px svg + ~70px label text
        // each side after LABEL_MAX_CHARS=14 truncate). 240px was too tight
        // and let leader-labels overflow past the dark cell border on the
        // left. Summary takes remaining width and still has ~600 px.
        gridTemplateColumns: '320px 1fr',
        gap: 14,
        alignItems: 'start',
      }}
    >
      <div
        data-testid="importer-overview-mini-map"
        style={{
          background: 'var(--surface-2)',
          border: '0.5px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex', justifyContent: 'center',
        }}
      >
        <PlasmidMiniMap
          length={length}
          topology={topology}
          annotations={item.annotations || []}
          size={180}
          mode="overlay"
          disableHoverOverlay
        />
      </div>

      <div
        style={{
          background: 'var(--surface-1)',
          border: '0.5px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex', flexDirection: 'column', gap: 10,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
            color: 'var(--text-secondary)', fontWeight: 600,
          }}
        >{S.summaryWhatInFile}</div>

        {typeCounts.length > 0 && (
          <div
            data-testid="importer-overview-types"
            style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, color: 'var(--text-primary)' }}
          >
            {typeCounts.map(([type, count]) => (
              <span key={type} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: featureColor(type),
                  }}
                />
                {count} {type}
              </span>
            ))}
          </div>
        )}

        {hasCategoryLine ? (
          <div data-testid="importer-overview-categories" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <CategorySection icon={S.summarySelectionIcon} label={S.summarySelection} regions={cats.selection} testId="importer-cat-selection" />
            <CategorySection icon={S.summaryPromotersIcon} label={S.summaryPromoters} regions={cats.promoters} testId="importer-cat-promoters" />
            <CategorySection icon={S.summaryOriginsIcon} label={S.summaryOrigins} regions={cats.origins} testId="importer-cat-origins" />
            <CategorySection icon={S.summaryTagsIcon} label={S.summaryTags} regions={cats.tags} testId="importer-cat-tags" />
          </div>
        ) : null}

        {remainingCDS.length > 0 && (
          <div data-testid="importer-overview-cds" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
                color: 'var(--text-secondary)', fontWeight: 600,
              }}
            >{S.summaryCdsList(remainingCDS.length)}</div>
            {cdsTop.map((r) => <ItemRow key={r.id || `${r.start}-${r.end}-${r.name}`} region={r} />)}
            {cdsOverflow > 0 && (
              <div
                style={{ fontSize: 10, color: 'var(--text-tertiary)', paddingLeft: 14 }}
                data-testid="importer-overview-cds-overflow"
              >…ещё {cdsOverflow} CDS</div>
            )}
          </div>
        )}

        {reSites.length > 0 && (
          <div data-testid="importer-overview-re-sites">
            <div
              style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
                color: 'var(--text-secondary)', fontWeight: 600,
                marginBottom: 4,
              }}
            >{S.summaryReSites}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12 }}>
              {reSites.map((s) => (
                <span key={s.name}>
                  {s.count}× <span style={{ fontWeight: 500 }}>{s.name}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <details data-testid="importer-overview-warnings">
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 11, color: 'var(--warning-text, #92400e)', fontWeight: 500,
              }}
            >{S.summaryWarnings(warnings.length)}</summary>
            <div
              style={{
                marginTop: 4,
                fontSize: 11, color: 'var(--warning-text)',
                background: 'var(--warning-chip, #fef3c7)',
                borderRadius: 'var(--radius-md)',
                padding: '6px 10px',
                maxHeight: warnings.length > 10 ? 200 : undefined,
                overflowY: 'auto',
              }}
            >
              {warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function CategorySection({ icon, label, regions, testId }) {
  if (!regions.length) return null;
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          color: 'var(--text-tertiary)', fontWeight: 500,
        }}
      >{icon} {label} ({regions.length})</div>
      {regions.map((r) => <ItemRow key={r.id || `${r.start}-${r.end}-${r.name}`} region={r} />)}
    </div>
  );
}

function ItemRow({ region }) {
  const len = Math.max(0, (region.end || 0) - (region.start || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-primary)' }}>
      <span
        style={{
          width: 8, height: 8, borderRadius: 2, flexShrink: 0,
          background: featureColor(region.type, region.name),
        }}
      />
      <span
        style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={region.name}
      >{region.name || region.type}</span>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
        {len.toLocaleString()} bp
      </span>
    </div>
  );
}
