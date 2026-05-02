import { useEffect, useMemo, useRef } from 'react';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import { STRINGS } from '../../../lib/strings';
import { getRegions } from '../../../annotation-model';

const S = STRINGS.importer;

/**
 * MultiInspector — full table layout for parsedItems.length > 1 (M-B.2 K5).
 *
 * Adapted from v0.5 ImportStartScreen/MultiInspector. Layout:
 *   header   : «Загружено N файлов» + ↻ заменить все
 *   table    : [thumb 36 | name (inline-edit) | length | regions |
 *              annotate-checkbox | × remove], with tristate master in
 *              the «Аннот.» column header
 *   footer   : [На канвас (disabled)] [В библиотеку (N)] [⋯]
 *
 * Edits per row stay in state.perFileEdits via onUpdateEdits keyed by
 * fileName. annotate-checkbox is the per-file autoAnnotate flag; the
 * Confirm flow uses it to enrich at commit time.
 *
 * On row click → onSelect(idx) so single-mode preview becomes available
 * if the biolog removes everything except one file.
 */
export default function MultiInspector({
  items,
  currentIdx,
  perFileFlags,
  perFileEdits = {},
  onSelect,
  onUpdateFlags,
  onUpdateEdits,
  onRemove,
  onAction,
}) {
  const tristate = useMemo(() => computeTristate(items, perFileFlags), [items, perFileFlags]);

  return (
    <div
      data-testid="importer-multi-inspector"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div
        data-testid="importer-multi-header"
        style={{
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-1)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
          {S.multiHeader(items.length)}
        </div>
        <button
          type="button"
          onClick={() => onAction?.('replace-all')}
          data-testid="importer-multi-replace-all-link"
          style={{
            background: 'transparent', border: 'none',
            fontSize: 11, color: 'var(--text-tertiary)',
            textDecoration: 'underline', textDecorationStyle: 'dotted',
            cursor: 'pointer',
          }}
        >{S.multiReplaceAll}</button>
      </div>

      <div
        data-testid="importer-multi-table"
        style={{ flex: 1, overflowY: 'auto', padding: 12 }}
      >
        <div
          style={{
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-1)',
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="importer-multi-row-header"
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 80px 80px 70px 32px',
              gap: 8, alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '0.5px solid var(--border-subtle)',
              background: 'var(--surface-2)',
              fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
              color: 'var(--text-tertiary)', fontWeight: 500,
            }}
          >
            <span></span>
            <span>{S.multiColName}</span>
            <span style={{ textAlign: 'right' }}>{S.multiColLength}</span>
            <span style={{ textAlign: 'right' }}>{S.multiColRegions}</span>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <MasterCheckbox state={tristate} onChange={(next) => {
                for (const it of items) {
                  if (it._fileName) onUpdateFlags?.(it._fileName, { autoAnnotate: next });
                }
              }} />
              <span>{S.multiColAnnotate}</span>
            </span>
            <span></span>
          </div>
          {items.map((it, i) => (
            <RowMulti
              key={it._fileName || i}
              item={it}
              isActive={i === currentIdx}
              autoAnnotate={!!(perFileFlags?.[it._fileName]?.autoAnnotate)}
              edits={perFileEdits[it._fileName] || {}}
              onClick={() => onSelect?.(i)}
              onToggle={(v) => onUpdateFlags?.(it._fileName, { autoAnnotate: v })}
              onRename={(name) => onUpdateEdits?.(it._fileName, { editedName: name })}
              onRemove={() => onRemove?.(it._fileName)}
            />
          ))}
        </div>
      </div>

      <div
        data-testid="importer-multi-footer"
        style={{
          padding: '8px 14px',
          borderTop: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
        }}
      >
        <button
          type="button"
          disabled
          title={S.multiCanvasDisabledTitle}
          data-testid="importer-multi-canvas-disabled"
          style={{
            fontSize: 12, padding: '6px 12px',
            background: 'var(--surface-2)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-tertiary)',
            cursor: 'not-allowed',
          }}
        >{S.actionCanvas}</button>
        <button
          type="button"
          data-testid="importer-multi-batch-library"
          onClick={() => onAction?.('library-batch')}
          style={{
            fontSize: 12, padding: '6px 12px',
            background: 'var(--accent-500)',
            color: 'var(--surface-1)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer', fontWeight: 500,
          }}
        >{S.multiBatchLibrary(items.length)}</button>
        <button
          type="button"
          data-testid="importer-multi-delete-all"
          onClick={() => onAction?.('delete-all')}
          style={{
            fontSize: 12, padding: '6px 12px',
            background: 'transparent',
            color: 'var(--danger-text)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >{S.multiActionDeleteAll}</button>
      </div>
    </div>
  );
}

function RowMulti({ item, isActive, autoAnnotate, edits, onClick, onToggle, onRename, onRemove }) {
  const fileName = item._fileName || 'unknown';
  const length = item.length || item.sequence?.length || 0;
  const regionCount = useMemo(() => getRegions(item.annotations || []).length, [item.annotations]);
  const isError = !!item._error;
  const displayName = edits.editedName ?? item.name ?? fileName;

  const handleNameBlur = (e) => {
    const next = e.currentTarget.textContent.trim();
    if (next && next !== displayName) onRename?.(next);
    else if (!next) e.currentTarget.textContent = displayName;
  };
  const handleNameKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.textContent = displayName;
      e.currentTarget.blur();
    }
  };

  return (
    <div
      data-testid={`importer-multi-row-${fileName}`}
      data-active={isActive ? 'true' : 'false'}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 80px 80px 70px 32px',
        gap: 8, alignItems: 'center',
        padding: '6px 12px',
        borderBottom: '0.5px solid var(--border-subtle)',
        background: isActive ? 'var(--accent-50)' : 'transparent',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ width: 36, height: 36 }}>
        {!isError && length > 0 ? (
          <PlasmidMiniMap
            length={length}
            topology={item.topology || 'linear'}
            annotations={item.annotations || []}
            size={36}
            mode="inline"
            disableHoverOverlay
          />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: 4,
            border: '0.5px dashed var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-tertiary)', fontSize: 11,
          }}>?</div>
        )}
      </div>
      <div
        data-testid={`importer-multi-name-${fileName}`}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onClick={(e) => e.stopPropagation()}
        onBlur={handleNameBlur}
        onKeyDown={handleNameKey}
        style={{
          fontWeight: isActive ? 500 : 400,
          color: isError ? 'var(--danger-text)' : 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          padding: '2px 4px', borderRadius: 'var(--radius-sm)',
          outline: 'none',
        }}
      >{displayName}</div>
      <div style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {length.toLocaleString()}
      </div>
      <div style={{ textAlign: 'right', color: 'var(--text-tertiary)', fontSize: 11 }}>
        {isError ? '—' : regionCount}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <input
          type="checkbox"
          checked={autoAnnotate}
          disabled={isError}
          onChange={(e) => onToggle?.(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          data-testid={`importer-multi-annot-${fileName}`}
          title={S.multiColAnnotate}
        />
      </div>
      <button
        type="button"
        data-testid={`importer-multi-remove-${fileName}`}
        onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 4,
        }}
        aria-label={S.multiRemoveAria}
        title={S.multiRemoveAria}
      >×</button>
    </div>
  );
}

function MasterCheckbox({ state, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === 'on'}
      data-testid="importer-multi-master"
      data-state={state}
      onChange={() => onChange?.(state !== 'on')}
      title={S.multiColAnnotate}
    />
  );
}

function computeTristate(items, perFileFlags) {
  if (!items || items.length === 0) return 'off';
  let on = 0, off = 0;
  for (const it of items) {
    const fn = it._fileName;
    if (!fn) continue;
    if (perFileFlags?.[fn]?.autoAnnotate) on += 1;
    else off += 1;
  }
  if (on === 0) return 'off';
  if (off === 0) return 'on';
  return 'mixed';
}
