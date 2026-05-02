import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { STRINGS } from '../../../lib/strings';
import { ACCEPT_STRING } from '../../../file-import';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import { useCatalogSources } from './use-catalog-sources';
import { applyCatalogFilter } from './length-pattern';

const S = STRINGS.importer;

/**
 * CatalogColumn — single sticky-search header + 4 sources (Этот проект /
 * Учебные / Моя библиотека / Каталог SnapGene) + drop zone footer with
 * paste textarea (M-B.2 K2; DEC-IMP-14).
 *
 * Two viewing modes:
 *   - tree mode (default): collapsible group headers with persistent state
 *     in localStorage (`pvcs-catalog-group-{key}`). Click an inner node →
 *     replace mode renders matching items as cards.
 *   - flat search mode (catalogQuery non-empty): text + length-pattern
 *     filter overlays the entire pool (this project + demo + mine + every
 *     loaded SnapGene plasmid).
 *
 * Item click: catalog item → onSelectItem(item) (single-mode auto replace,
 * multi-mode replace-batch confirm at parent index.jsx). Drop file →
 * onFiles(files). Paste textarea Ctrl+Enter → onPasteText(text).
 */
const GROUP_KEYS = ['canvas', 'demo', 'mine', 'snapgene'];

function readGroupState(key, fallback) {
  try {
    const v = localStorage.getItem(`pvcs-catalog-group-${key}`);
    if (v === 'open') return true;
    if (v === 'closed') return false;
  } catch { /* private mode / jsdom */ }
  return fallback;
}
function writeGroupState(key, open) {
  try { localStorage.setItem(`pvcs-catalog-group-${key}`, open ? 'open' : 'closed'); } catch { /* */ }
}

export default function CatalogColumn({
  query = '',
  onQueryChange,
  activeSource,
  onActiveSourceChange,
  onSelectItem,
  onFiles,
  onPasteText,
  busy = false,
}) {
  const projectName = useStore((s) => {
    const p = s.currentProjectId ? s.projects[s.currentProjectId] : null;
    return p?.name || '';
  });
  const sources = useCatalogSources();

  const fileInputRef = useRef(null);
  const [pasteDraft, setPasteDraft] = useState('');
  const [hover, setHover] = useState(false);
  const [openCanvas, setOpenCanvas] = useState(() => readGroupState('canvas', true));
  const [openDemo, setOpenDemo] = useState(() => readGroupState('demo', true));
  const [openMine, setOpenMine] = useState(() => readGroupState('mine', true));
  const [openSnap, setOpenSnap] = useState(() => readGroupState('snapgene', false));

  const flatActive = !!query.trim();

  // Touch SnapGene flat cache lazily on first non-empty query.
  if (flatActive) sources.ensureSnapgeneFlat();

  // Touch SnapGene categories on expand.
  const onToggleSnap = useCallback(() => {
    setOpenSnap((v) => {
      const next = !v;
      writeGroupState('snapgene', next);
      return next;
    });
  }, []);

  const onPick = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
    e.target.value = '';
  }, [onFiles]);

  const onDrop = useCallback((e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
    e.preventDefault();
    setHover(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0 && onFiles) onFiles(files);
  }, [onFiles]);

  const submitPaste = useCallback(() => {
    const text = pasteDraft.trim();
    if (!text || !onPasteText) return;
    onPasteText(text);
    setPasteDraft('');
  }, [pasteDraft, onPasteText]);

  // Flat search pool — every loaded item across all sources.
  const flatPool = useMemo(() => {
    if (!flatActive) return [];
    const snapgene = sources.snapgeneFlat || Object.values(sources.snapgeneCategoryItems).flat();
    return [
      ...sources.thisProject,
      ...sources.demo,
      ...sources.mine,
      ...snapgene,
    ];
  }, [flatActive, sources.thisProject, sources.demo, sources.mine, sources.snapgeneFlat, sources.snapgeneCategoryItems]);
  const flatResults = useMemo(
    () => flatActive ? applyCatalogFilter(flatPool, query) : [],
    [flatActive, flatPool, query],
  );

  // Replace-mode (drill-down): single source's items take over the scroll area.
  const drilldownItems = useMemo(() => {
    if (flatActive || !activeSource) return null;
    if (activeSource.kind === 'project') return sources.thisProject;
    if (activeSource.kind === 'demo') return sources.demo;
    if (activeSource.kind === 'mine') {
      if (activeSource.value === '__all__') return sources.mine;
      const grp = sources.mineGroups.find((g) => g.tag === activeSource.value);
      return grp ? grp.items : [];
    }
    if (activeSource.kind === 'snapgene') {
      if (sources.snapgeneCategoryItems[activeSource.value] === undefined) {
        sources.loadSnapgeneCategory(activeSource.value);
        return null; // loading
      }
      return sources.snapgeneCategoryItems[activeSource.value] || [];
    }
    return null;
  }, [flatActive, activeSource, sources]);

  const drilldownLabel = useMemo(() => {
    if (!activeSource) return '';
    if (activeSource.kind === 'project') return S.catalogGroupCanvas(projectName);
    if (activeSource.kind === 'demo') return S.catalogGroupDemo;
    if (activeSource.kind === 'mine') {
      if (activeSource.value === '__all__') return S.catalogGroupMine;
      return activeSource.value === '__untagged__' ? S.catalogUntaggedTag : activeSource.value;
    }
    if (activeSource.kind === 'snapgene') {
      const cat = sources.snapgeneCategories.find((c) => c.slug === activeSource.value);
      return cat?.name || activeSource.value;
    }
    return '';
  }, [activeSource, projectName, sources.snapgeneCategories]);

  return (
    <aside
      data-testid="importer-catalog-column"
      style={{
        width: 320, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
          position: 'sticky', top: 0, zIndex: 1,
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value)}
          placeholder={S.catalogSearchPlaceholder}
          data-testid="importer-catalog-search"
          style={{
            width: '100%', fontSize: 12,
            padding: '6px 10px',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            outline: 'none',
          }}
        />
      </div>

      <div
        data-testid="importer-catalog-tree"
        style={{ flex: 1, overflowY: 'auto' }}
      >
        {flatActive && (
          <div
            data-testid="importer-catalog-flat-banner"
            style={{
              padding: '6px 12px', fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'var(--accent-50)',
              borderBottom: '0.5px solid var(--border-subtle)',
            }}
          >{S.catalogFlatFound(flatResults.length)}</div>
        )}

        {!flatActive && activeSource && (
          <button
            type="button"
            data-testid="importer-catalog-back"
            onClick={() => onActiveSourceChange?.(null)}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px',
              fontSize: 11,
              color: 'var(--accent-text)',
              background: 'var(--accent-50)',
              border: 'none',
              borderBottom: '0.5px solid var(--border-subtle)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span aria-hidden>←</span>
            <span style={{ flex: 1 }}>{S.catalogBack} · {drilldownLabel}</span>
            {drilldownItems && (
              <span style={{ fontSize: 10, color: 'var(--accent-text)', fontFamily: 'var(--font-mono)' }}>
                ({drilldownItems.length})
              </span>
            )}
          </button>
        )}

        {!flatActive && !activeSource && (
          <div data-testid="importer-catalog-tree-groups">
            <GroupHeader
              groupKey="canvas"
              label={S.catalogGroupCanvas(projectName)}
              count={sources.thisProject.length}
              open={openCanvas}
              onToggle={() => {
                setOpenCanvas((v) => { writeGroupState('canvas', !v); return !v; });
              }}
              onSelect={() => onActiveSourceChange?.({ kind: 'project', value: '__pinned__' })}
            />
            {openCanvas && sources.thisProject.length === 0 && (
              <EmptyHint label={S.catalogEmptyProject} testId="catalog-canvas-empty" />
            )}
            {openCanvas && sources.thisProject.length > 0 && sources.thisProject.slice(0, 8).map((it) => (
              <ItemRow key={it.id} item={it} onClick={() => onSelectItem?.(it)} />
            ))}
            {openCanvas && sources.thisProject.length > 8 && (
              <button
                type="button"
                data-testid="importer-catalog-canvas-more"
                onClick={() => onActiveSourceChange?.({ kind: 'project', value: '__pinned__' })}
                style={moreLinkStyle}
              >…ещё {sources.thisProject.length - 8}</button>
            )}

            <GroupHeader
              groupKey="demo"
              label={S.catalogGroupDemo}
              count={sources.demo.length}
              open={openDemo}
              onToggle={() => {
                setOpenDemo((v) => { writeGroupState('demo', !v); return !v; });
              }}
              onSelect={() => onActiveSourceChange?.({ kind: 'demo', value: 'demo' })}
            />
            {openDemo && sources.demoLoading && (
              <EmptyHint label={S.catalogLoading} testId="catalog-demo-loading" />
            )}

            <GroupHeader
              groupKey="mine"
              label={S.catalogGroupMine}
              count={sources.mine.length}
              open={openMine}
              onToggle={() => {
                setOpenMine((v) => { writeGroupState('mine', !v); return !v; });
              }}
              onSelect={() => onActiveSourceChange?.({ kind: 'mine', value: '__all__' })}
            />
            {openMine && sources.mine.length === 0 && (
              <EmptyHint label={S.catalogEmptyGroup} testId="catalog-mine-empty" />
            )}
            {openMine && sources.mineGroups.length > 0 && sources.mineGroups.map((g) => (
              <button
                key={g.tag}
                type="button"
                data-testid={`importer-catalog-mine-group-${g.tag}`}
                onClick={() => onActiveSourceChange?.({ kind: 'mine', value: g.tag })}
                style={tagLinkStyle}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {g.tag === '__untagged__' ? S.catalogUntaggedTag : g.tag}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{g.items.length}</span>
              </button>
            ))}
            {openMine && sources.mineGroups.length === 0 && sources.mine.length > 0 && (
              <button
                type="button"
                data-testid="importer-catalog-mine-flat"
                onClick={() => onActiveSourceChange?.({ kind: 'mine', value: '__all__' })}
                style={tagLinkStyle}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{S.catalogMineFlatLabel}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{sources.mine.length}</span>
              </button>
            )}

            <GroupHeader
              groupKey="snapgene"
              label={S.catalogGroupSnapgene}
              count={sources.snapgeneCategories.reduce((s, c) => s + (c.count || 0), 0)}
              open={openSnap}
              onToggle={onToggleSnap}
            />
            {openSnap && !sources.indexReady && (
              <EmptyHint label={S.catalogLoading} testId="catalog-snapgene-loading" />
            )}
            {openSnap && sources.snapgeneCategories.map((c) => (
              <button
                key={c.slug}
                type="button"
                data-testid={`importer-catalog-snapgene-${c.slug}`}
                onClick={() => onActiveSourceChange?.({ kind: 'snapgene', value: c.slug })}
                style={tagLinkStyle}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{c.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{c.count}</span>
              </button>
            ))}
          </div>
        )}

        {flatActive && flatResults.length === 0 && (
          <EmptyHint label={S.catalogFlatEmpty} testId="catalog-flat-empty" />
        )}
        {flatActive && flatResults.length > 0 && (
          <div data-testid="importer-catalog-flat-results" style={{ padding: '6px 8px' }}>
            {flatResults.slice(0, 60).map((it) => (
              <CatalogCard key={it.id || `${it._slug || it._source}:${it.name}`} item={it} onClick={() => onSelectItem?.(it)} />
            ))}
            {flatResults.length > 60 && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', padding: '4px 0' }}>
                {S.catalogFlatTruncated(flatResults.length)}
              </div>
            )}
          </div>
        )}

        {!flatActive && drilldownItems && (
          <div data-testid="importer-catalog-drilldown-items" style={{ padding: '6px 8px' }}>
            {drilldownItems.length === 0 && (
              <EmptyHint label={S.catalogEmptyGroup} testId="catalog-drilldown-empty" />
            )}
            {drilldownItems.map((it) => (
              <CatalogCard key={it.id || `${it._slug || it._source}:${it.name}`} item={it} onClick={() => onSelectItem?.(it)} />
            ))}
          </div>
        )}
      </div>

      <div
        data-testid="importer-catalog-dropzone"
        data-hover={hover ? 'true' : 'false'}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          setHover(true);
        }}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={() => setHover(false)}
        onDrop={onDrop}
        style={{
          flexShrink: 0,
          borderTop: '2px dashed var(--border-default)',
          background: hover ? 'var(--accent-50)' : 'var(--surface-2)',
          padding: '10px',
        }}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          data-testid="importer-catalog-pick-files"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {hover ? S.dropzoneHover : S.catalogDropzoneIdle}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'center', marginBottom: 4 }}>
          {S.catalogDropzoneAccepts}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          onChange={onPick}
          hidden
          data-testid="importer-catalog-file-input"
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <textarea
            value={pasteDraft}
            onChange={(e) => setPasteDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitPaste();
              }
            }}
            placeholder={S.catalogPastePlaceholder}
            rows={2}
            data-testid="importer-catalog-paste"
            style={{
              flex: 1, fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              padding: '4px 6px',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              resize: 'none', outline: 'none',
            }}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submitPaste}
            disabled={!pasteDraft.trim()}
            data-testid="importer-catalog-paste-submit"
            style={{
              fontSize: 11,
              padding: '0 10px',
              background: 'var(--accent-500)',
              color: 'var(--surface-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: pasteDraft.trim() ? 'pointer' : 'not-allowed',
              opacity: pasteDraft.trim() ? 1 : 0.4,
            }}
          >{S.catalogPasteSubmit}</button>
        </div>
        {busy && (
          <div
            data-testid="importer-catalog-busy"
            style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}
          >{S.busyParsing}</div>
        )}
      </div>
    </aside>
  );
}

function GroupHeader({ groupKey, label, count, open, onToggle, onSelect }) {
  return (
    <div
      data-testid={`importer-catalog-group-${groupKey}`}
      style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '0.5px solid var(--border-subtle)',
        background: 'var(--surface-2, #f5f5f4)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        data-testid={`importer-catalog-group-${groupKey}-toggle`}
        aria-expanded={open}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
          color: 'var(--text-secondary)',
          background: 'transparent', border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontWeight: 500,
        }}
      >
        <span style={{ width: 10, color: 'var(--text-tertiary)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {typeof count === 'number' && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{count}</span>
        )}
      </button>
      {onSelect && typeof count === 'number' && count > 0 && (
        <button
          type="button"
          onClick={onSelect}
          data-testid={`importer-catalog-group-${groupKey}-open`}
          aria-label="Открыть группу"
          style={{
            background: 'transparent', border: 'none',
            color: 'var(--text-tertiary)',
            padding: '4px 10px', cursor: 'pointer',
            fontSize: 12,
          }}
        >→</button>
      )}
    </div>
  );
}

function ItemRow({ item, onClick }) {
  return (
    <button
      type="button"
      data-testid={`importer-catalog-item-${item.id || item.name}`}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        background: 'transparent', border: 'none',
        borderBottom: '0.5px solid var(--border-subtle)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
        {(item.length || 0).toLocaleString()}
      </span>
    </button>
  );
}

function CatalogCard({ item, onClick }) {
  const length = item.length || item.sequence?.length || 0;
  return (
    <button
      type="button"
      data-testid={`importer-catalog-card-${item.id || item.name}`}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '6px 8px', marginBottom: 4,
        background: 'var(--surface-1)',
        border: '0.5px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <PlasmidMiniMap
        length={length}
        topology={item.topology || 'circular'}
        annotations={item.annotations || []}
        size={40}
        mode="inline"
        name={item.name}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(item.description || '').replace(/<[^>]*>/g, '').trim() || item._badge}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', gap: 8, marginTop: 2 }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{length.toLocaleString()} bp</span>
          {item._badge && (
            <span style={{ padding: '0 6px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>{item._badge}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyHint({ label, testId }) {
  return (
    <div
      data-testid={testId}
      style={{ padding: '6px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}
    >{label}</div>
  );
}

const tagLinkStyle = {
  width: '100%',
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 22px',
  fontSize: 12,
  background: 'transparent', border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  textAlign: 'left',
};

const moreLinkStyle = {
  width: '100%',
  padding: '4px 22px',
  fontSize: 11, fontStyle: 'italic',
  color: 'var(--accent-text)',
  background: 'transparent', border: 'none',
  cursor: 'pointer', textAlign: 'left',
};

export const __test__ = { GROUP_KEYS };
