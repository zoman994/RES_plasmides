import { useMemo } from 'react';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import { STRINGS } from '../../../lib/strings';
import { getRegions } from '../../../annotation-model';

const S = STRINGS.importer;

/**
 * MultiFileList — Step 2 sidebar (M-B.1 K5).
 *
 * 280 px column on the left of Combined view. Each row is a clickable card
 * with a 36 px PlasmidMiniMap thumb + name + meta (length / regions / status)
 * + per-file `autoAnnotate` checkbox. The active card is highlighted; click
 * elsewhere → setCurrentIdx + MoleculeWorkspace re-renders for that file
 * (per-file edits stay in the importer-state hook by fileName key).
 *
 * Master "Apply to all" checkbox at the top is tristate: ALL on → checked,
 * ALL off → unchecked, mixed → indeterminate. Clicking it sets every file's
 * flag to !majority — biolog can batch-disable enrichment for all files.
 */
export default function MultiFileList({
  items,
  currentIdx,
  perFileFlags,
  onSelect,
  onToggleAutoAnnotate,
  onApplyAllAutoAnnotate,
}) {
  const tristate = useMemo(() => computeTristate(items, perFileFlags), [items, perFileFlags]);

  return (
    <aside
      data-testid="importer-multi-file-list"
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #fff)',
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          padding: '10px 12px',
          borderBottom: '0.5px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)' }}>
          {S.multiFilesHeader(items.length)}
        </div>
        <MasterAutoAnnotate
          state={tristate}
          onClick={() => onApplyAllAutoAnnotate(tristate !== 'on')}
        />
      </header>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it, i) => (
          <FileCard
            key={it._fileName || i}
            item={it}
            isActive={i === currentIdx}
            autoAnnotate={!!(perFileFlags[it._fileName]?.autoAnnotate)}
            onClick={() => onSelect(i)}
            onToggle={(v) => onToggleAutoAnnotate(it._fileName, v)}
          />
        ))}
      </ol>
    </aside>
  );
}

function MasterAutoAnnotate({ state, onClick }) {
  return (
    <label
      data-testid="importer-multi-master-toggle"
      data-state={state}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        ref={(el) => { if (el) el.indeterminate = state === 'mixed'; }}
        checked={state === 'on'}
        onChange={onClick}
        data-testid="importer-multi-master-input"
      />
      <span>{S.multiApplyAllAutoAnnotate}</span>
    </label>
  );
}

function FileCard({ item, isActive, autoAnnotate, onClick, onToggle }) {
  const fileName = item._fileName || 'unknown';
  const regionCount = useMemo(() => getRegions(item.annotations).length, [item.annotations]);
  const isError = !!item._error;
  const status = isError ? S.multiStatusError : autoAnnotate ? S.multiStatusEnriched : S.multiStatusFileOnly;

  return (
    <li
      data-testid={`importer-multi-file-card-${fileName}`}
      data-active={isActive ? 'true' : 'false'}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 12px',
        borderBottom: '0.5px solid var(--border-subtle)',
        cursor: 'pointer',
        background: isActive ? 'var(--accent-50, #fef3c7)' : 'transparent',
      }}
    >
      <div style={{ width: 36, height: 36, flexShrink: 0 }}>
        {!isError && item.length > 0 ? (
          <PlasmidMiniMap
            length={item.length || item.sequence?.length || 0}
            topology={item.topology || 'linear'}
            annotations={item.annotations || []}
            size={36}
            disableHoverOverlay
          />
        ) : (
          <div style={{
            width: 36, height: 36,
            border: '0.5px dashed var(--border-default)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', fontSize: 11,
          }}>?</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12, fontWeight: isActive ? 500 : 400,
            color: isError ? 'var(--danger-text, #b91c1c)' : 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {item.name || fileName}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
          {isError ? item._error : S.multiFileMeta(item.length || 0, regionCount, status)}
        </div>
      </div>
      <input
        type="checkbox"
        checked={autoAnnotate}
        onChange={(e) => onToggle(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        disabled={isError}
        data-testid={`importer-multi-file-autoannotate-${fileName}`}
        title={S.autoAnnotateLabel}
      />
    </li>
  );
}

function computeTristate(items, perFileFlags) {
  if (!items || items.length === 0) return 'off';
  let on = 0, off = 0;
  for (const it of items) {
    const fn = it._fileName;
    if (!fn) continue;
    if (perFileFlags[fn]?.autoAnnotate) on += 1;
    else off += 1;
  }
  if (on === 0) return 'off';
  if (off === 0) return 'on';
  return 'mixed';
}
