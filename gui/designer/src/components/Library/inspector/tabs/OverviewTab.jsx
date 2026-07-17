import { useEffect, useMemo, useState } from 'react';
import PlasmidMiniMap from '../../../PlasmidMiniMap';
import PlasmidMapV2 from '../../../PlasmidMapV2';
import { FEATURE_FLAGS } from '../../../../lib/feature-flags';
import { featureColor } from '../../../../feature-palette';
import { STRINGS } from '../../../../lib/strings';
import { buildFileSummary, summarizeRESitesCached } from '../lib/file-summary';
import TagsEditor from '../TagsEditor';

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

export default function OverviewTab({
  item, onUpdateTags, onUpdateTopology, onNavigateToFeature, onApplyOrigin,
  // V181 / UX-2 — currently-selected feature id (shared with the Sequence tab);
  // the map highlights it so selection reads consistently across tabs.
  selectedRegionId = null,
}) {
  const summary = useMemo(() => buildFileSummary(item), [item]);
  // Lazy reSites: in production we paint the rest of the overview first
  // (mini-map, type counts, categories, CDS list — fast), then schedule
  // the RE scan via requestIdleCallback. The scan result is cached at
  // the file-summary module level so re-opening the same plasmid in
  // the same session is instant. In test mode we run synchronously.
  const sequence = item?.sequence;
  const topology = item?.topology || 'linear';
  // Origin («ноль-точка») picker state — restored 17.06.2026 (Игорь: было,
  // пропало при чистке). Resets to 1 on plasmid switch.
  const [originPos, setOriginPos] = useState(1);
  const originKey = item ? (item.id || item._libraryEntryId || item._fileName || item.name || '') : '';
  useEffect(() => { setOriginPos(1); }, [originKey]);
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
  // Rotate the map so the candidate base (originPos, 1-based) sits under the
  // fixed top zero-notch. Negative = rotate content back so that base comes to
  // 12 o'clock. originPos === 1 → 0° (current orientation).
  const originRotationDeg = (topology === 'circular' && length > 0)
    ? -(((originPos - 1) % length) / length) * 360
    : 0;
  // ◀ / ▶ nudge the origin one base, wrapping around the ring.
  const nudgeOrigin = (delta) => setOriginPos((p) => (((p - 1 + delta) % length) + length) % length + 1);
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
        // Responsive 2-col ↔ stacked. Was a rigid `320px 1fr`, which in a
        // narrow inspector squeezed the «Что в файле» summary to ~100px and
        // wrapped headers mid-word («RESTRICTI SITES», «1 promote» — AUD-101).
        // auto-fit + minmax lets the map + summary sit side-by-side when there
        // is room (≥ ~500px) and stack (each full-width) when the panel is
        // narrow, so the summary never collapses below a readable width.
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 14,
        alignItems: 'start',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div
          data-testid="importer-overview-mini-map"
          style={{
            background: 'var(--surface-2)',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}
        >
          {FEATURE_FLAGS.plasmidMapV2 && topology === 'circular' ? (
            /* Редизайн карты (DEC-DS-PLASMIDMAP-V2): feature-centric, внешние
               лидер-подписи в две колонки. Шире ячейки (520px) и overflow —
               подписи свисают за тёмную рамку влево/вправо, как и у legacy. */
            <div style={{ width: 520, maxWidth: '100%', flexShrink: 0, aspectRatio: '1 / 1', overflow: 'visible' }}>
              <PlasmidMapV2
                annotations={item.annotations || []}
                length={length}
                topology={topology}
                centerLabel={{ name: item.name || item._fileName || '', bp: length }}
                onFeatureClick={onNavigateToFeature}
                selectedRegionId={selectedRegionId}
                rotationDeg={typeof onApplyOrigin === 'function' ? originRotationDeg : 0}
              />
            </div>
          ) : (
            <PlasmidMiniMap
              length={length}
              topology={topology}
              annotations={item.annotations || []}
              size={200}
              mode="overlay"
              disableHoverOverlay
              onFeatureClick={onNavigateToFeature}
              /* SnapGene-style overview (Игорь): bp ruler + strand-direction
                 arrows + centre name/size. */
              showRuler
              showDirections
              centerLabel={{ name: item.name || item._fileName || '', bp: length }}
              /* «Ноль всегда сверху, вращается сама плазмида» (Игорь 17.06): the
                 origin is set by ROTATING the plasmid with the control below, not
                 by clicking the map (avoids misclicks). The fixed top notch marks
                 where the new zero lands. */
              rotationDeg={
                topology === 'circular' && typeof onApplyOrigin === 'function'
                  ? originRotationDeg
                  : 0
              }
            />
          )}

          {/* «Начало отсчёта» — directly UNDER the plasmid (Игорь — «перенести
              непосредственно под плазмиду»), compact. Circular + workspace host
              (onApplyOrigin). Rotate via ◀ / slider / ▶ → the base under the
              fixed top notch becomes position 1; «Применить» commits
              (rotateOriginToPosition → transient buffer → «Сохранить версию»). */}
          {topology === 'circular' && typeof onApplyOrigin === 'function' && (
            <div
              data-testid="overview-origin"
              style={{
                width: '100%',
                borderTop: '0.5px solid var(--border-subtle)',
                paddingTop: 8,
                display: 'flex', flexDirection: 'column', gap: 5,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
                  color: 'var(--text-tertiary)', fontWeight: 500,
                }}>Начало отсчёта</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>ноль сверху ▲</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button
                  type="button"
                  data-testid="overview-origin-prev"
                  onClick={() => nudgeOrigin(-1)}
                  title="Повернуть на 1 п.н. назад"
                  style={{
                    flex: '0 0 auto', width: 20, height: 20, padding: 0, fontSize: 10, lineHeight: 1,
                    border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-1)', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >◀</button>
                <input
                  type="range"
                  className="origin-rotate-slider"
                  min={1}
                  max={Math.max(1, length)}
                  value={originPos}
                  data-testid="overview-origin-rotate"
                  title="Поверните плазмиду — база сверху станет позицией 1"
                  onChange={(e) => setOriginPos(Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, length)))}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  data-testid="overview-origin-next"
                  onClick={() => nudgeOrigin(1)}
                  title="Повернуть на 1 п.н. вперёд"
                  style={{
                    flex: '0 0 auto', width: 20, height: 20, padding: 0, fontSize: 10, lineHeight: 1,
                    border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-1)', color: 'var(--text-secondary)', cursor: 'pointer',
                  }}
                >▶</button>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, length)}
                  value={originPos}
                  data-testid="overview-origin-input"
                  title="Координата нового начала кольцевой плазмиды (1 = первая база)"
                  onChange={(e) => setOriginPos(Math.max(1, Number(e.target.value) || 1))}
                  style={{
                    flex: '1 1 56px', minWidth: 0, padding: '3px 6px', fontSize: 11,
                    border: '0.5px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-1)', color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                  }}
                />
                <button
                  type="button"
                  data-testid="overview-origin-apply"
                  onClick={() => {
                    if (originPos > 1 && originPos <= length) {
                      onApplyOrigin(originPos);
                      // New origin committed → it becomes position 1 at the top.
                      // Reset rotation so the map shows the committed coordinate
                      // system (ruler renumbered), not an extra preview rotation.
                      setOriginPos(1);
                    }
                  }}
                  disabled={!(originPos > 1 && originPos <= length)}
                  title="Повернуть кольцо: выбранная база станет позицией 1. Аннотации пересчитаются."
                  style={{
                    flex: '0 0 auto', padding: '3px 9px', fontSize: 11,
                    background: 'var(--accent-500)', color: 'var(--surface-1)',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                    cursor: (originPos > 1 && originPos <= length) ? 'pointer' : 'not-allowed',
                    opacity: (originPos > 1 && originPos <= length) ? 1 : 0.4,
                    whiteSpace: 'nowrap',
                  }}
                >↻ Применить</button>
              </div>
            </div>
          )}
        </div>

        {/* Editable entry meta is shown when persistence callbacks are present. */}
        {typeof onUpdateTags === 'function' && (
          <div
            data-testid="overview-tags-editor"
            style={{
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
                color: 'var(--text-secondary)', fontWeight: 600,
              }}
            >{S.summaryTags || 'Метки'}</div>
            <TagsEditor tags={item.tags || []} onChange={onUpdateTags} />
          </div>
        )}

        {typeof onUpdateTopology === 'function' && (
          <div
            data-testid="overview-topology-toggle"
            style={{
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6,
                color: 'var(--text-secondary)', fontWeight: 600,
              }}
            >Топология</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {[['circular', 'Кольцевая'], ['linear', 'Линейная']].map(([t, label]) => {
                const active = topology === t;
                return (
                  <button
                    key={t}
                    type="button"
                    data-testid={`overview-topology-${t}`}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => { if (!active) onUpdateTopology(t); }}
                    style={{
                      flex: 1, padding: '4px 8px', fontSize: 11, cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: active ? '0.5px solid var(--accent-500)' : '0.5px solid var(--border-default)',
                      background: active ? 'var(--accent-50)' : 'var(--surface-1)',
                      color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                    }}
                  >{label}</button>
                );
              })}
            </div>

          </div>
        )}
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
            <CategorySection icon={S.summarySelectionIcon} label={S.summarySelection} regions={cats.selection} testId="importer-cat-selection" onNavigate={onNavigateToFeature} />
            <CategorySection icon={S.summaryPromotersIcon} label={S.summaryPromoters} regions={cats.promoters} testId="importer-cat-promoters" onNavigate={onNavigateToFeature} />
            <CategorySection icon={S.summaryOriginsIcon} label={S.summaryOrigins} regions={cats.origins} testId="importer-cat-origins" onNavigate={onNavigateToFeature} />
            <CategorySection icon={S.summaryTagsIcon} label={S.summaryTags} regions={cats.tags} testId="importer-cat-tags" onNavigate={onNavigateToFeature} />
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
            {cdsTop.map((r) => <ItemRow key={r.id || `${r.start}-${r.end}-${r.name}`} region={r} onNavigate={onNavigateToFeature} />)}
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

function CategorySection({ icon, label, regions, testId, onNavigate }) {
  if (!regions.length) return null;
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          color: 'var(--text-tertiary)', fontWeight: 500,
        }}
      >{icon} {label} ({regions.length})</div>
      {regions.map((r) => <ItemRow key={r.id || `${r.start}-${r.end}-${r.name}`} region={r} onNavigate={onNavigate} />)}
    </div>
  );
}

function ItemRow({ region, onNavigate }) {
  const len = Math.max(0, (region.end || 0) - (region.start || 0));
  // Clickable when a navigation callback is wired (workspace) → jump to the
  // feature in the Sequence tab. Read-only (plain row) otherwise.
  const clickable = typeof onNavigate === 'function' && Number.isFinite(region.start);
  const go = () => { if (clickable) onNavigate(region); };
  return (
    <div
      data-testid={clickable ? `overview-feature-${region.id || `${region.start}-${region.end}`}` : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? go : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-primary)',
        cursor: clickable ? 'pointer' : undefined,
        borderRadius: clickable ? 'var(--radius-sm)' : undefined,
      }}
    >
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
