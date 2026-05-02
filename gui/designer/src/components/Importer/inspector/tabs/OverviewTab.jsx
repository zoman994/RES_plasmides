import { useMemo } from 'react';
import PlasmidMiniMap from '../../../PlasmidMiniMap';
import { featureColor } from '../../../../feature-palette';
import { STRINGS } from '../../../../lib/strings';
import { buildFileSummary } from '../lib/file-summary';

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
export default function OverviewTab({ item }) {
  const summary = useMemo(() => buildFileSummary(item), [item]);
  if (!summary || !item) return null;
  const length = item.length || item.sequence?.length || 0;
  const topology = item.topology || 'linear';
  const { typeCounts, cats, remainingCDS, reSites, warnings } = summary;
  const cdsTop = remainingCDS.slice(0, 5);
  const cdsOverflow = Math.max(0, remainingCDS.length - cdsTop.length);
  const hasCategoryLine =
    cats.selection.length || cats.promoters.length || cats.origins.length || cats.tags.length;

  return (
    <div
      data-testid="importer-tab-panel-overview"
      style={{
        display: 'grid',
        // 2-col layout: mini-map fixed 240px (enough for 160px svg +
        // overlay leader-labels overflow), summary fills remaining space.
        // Stops mini-map drowning in 982px of empty horizontal void.
        gridTemplateColumns: '240px 1fr',
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
            fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
            color: 'var(--text-tertiary)', fontWeight: 500,
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
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
                color: 'var(--text-tertiary)', fontWeight: 500,
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
                fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
                color: 'var(--text-tertiary)', fontWeight: 500, marginBottom: 4,
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
