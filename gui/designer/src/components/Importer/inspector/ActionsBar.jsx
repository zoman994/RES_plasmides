import { useEffect, useRef, useState } from 'react';
import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * ActionsBar — single-mode footer (M-B.2 K3).
 *
 * Layout: [hint] [На канвас] [В библиотеку]? [⋯] (overflow → Аннотировать /
 * Скачать .gb / Удалить из сессии).
 *
 * libraryEnabled hides «В библиотеку» for catalog items the biolog hasn't
 * derived in-session (no annotate, no edit, no rotate). Multi-mode footer
 * lives in MultiInspector — this component handles single only.
 */
export default function ActionsBar({
  mode = 'single',
  onAction,
  hasParsedItem = true,
  libraryEnabled = true,
  busyConfirm = false,
  target = 'project',
  isCatalogSource = false,
  hasCurrentProject = true,
  autoAnnotate = true,
  onToggleAutoAnnotate,
}) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef(null);
  const isMulti = mode === 'multi';

  useEffect(() => {
    if (!overflowOpen) return undefined;
    const onDocClick = (e) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [overflowOpen]);

  const fire = (id) => {
    setOverflowOpen(false);
    onAction?.(id);
  };

  return (
    <div
      data-testid="importer-actions-bar"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderTop: '0.5px solid var(--border-subtle)',
      }}
    >
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {target === 'library' ? S.confirmHintLibrary : S.confirmHintProject}
      </div>

      {/*
        Action ordering depends on target: when biolog opened Library
        (target=library), the primary action is to land the item in
        their Library — «На канвас» becomes secondary and gated by
        currentProject. When opened from a project (target=project),
        canvas is primary and library is secondary.

        Catalog items (isCatalogSource) get «Скопировать в библиотеку»
        instead of «В библиотеку» — explicit that we're creating a copy,
        not modifying the catalog source.
      */}
      {!isMulti && target === 'library' && (
        <button
          type="button"
          data-testid="importer-action-library"
          onClick={() => fire('library')}
          disabled={!hasParsedItem || busyConfirm}
          style={primaryButtonStyle(hasParsedItem && !busyConfirm)}
        >{busyConfirm ? S.confirmBusy : (isCatalogSource ? S.actionLibraryCopy : S.actionLibrary)}</button>
      )}

      {!isMulti && (
        <button
          type="button"
          data-testid="importer-action-canvas"
          onClick={() => fire('canvas')}
          disabled={!hasParsedItem || busyConfirm || !hasCurrentProject}
          title={!hasCurrentProject ? S.actionCanvasNoProjectTitle : undefined}
          style={target === 'project'
            ? primaryButtonStyle(hasParsedItem && !busyConfirm && hasCurrentProject)
            : secondaryButtonStyle(hasParsedItem && !busyConfirm && hasCurrentProject)}
        >{(target === 'project' && busyConfirm) ? S.confirmBusy : S.actionCanvas}</button>
      )}

      {!isMulti && target === 'project' && libraryEnabled && (
        <button
          type="button"
          data-testid="importer-action-library"
          onClick={() => fire('library')}
          disabled={!hasParsedItem || busyConfirm}
          style={secondaryButtonStyle(hasParsedItem && !busyConfirm)}
        >{isCatalogSource ? S.actionLibraryCopy : S.actionLibrary}</button>
      )}

      <div ref={overflowRef} style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="importer-action-overflow-toggle"
          onClick={() => setOverflowOpen(v => !v)}
          aria-label={S.actionOverflowAria}
          aria-expanded={overflowOpen}
          style={{
            fontSize: 14, padding: '4px 10px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer', lineHeight: 1,
          }}
        >⋯</button>
        {overflowOpen && (
          <div
            data-testid="importer-action-overflow-menu"
            role="menu"
            style={{
              position: 'absolute', right: 0, bottom: '100%', marginBottom: 4,
              minWidth: 200,
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              padding: '4px 0', zIndex: 10,
            }}
          >
            {!isMulti && (
              <button
                type="button"
                role="menuitem"
                data-testid="importer-action-auto-annotate-toggle"
                onClick={() => { setOverflowOpen(false); onToggleAutoAnnotate?.(!autoAnnotate); }}
                style={overflowItemStyle(false)}
              >{autoAnnotate ? S.actionAutoAnnotateOn : S.actionAutoAnnotateOff}</button>
            )}
            {!isMulti && (
              <button
                type="button"
                role="menuitem"
                data-testid="importer-action-annotate"
                onClick={() => fire('annotate')}
                disabled={!hasParsedItem}
                style={overflowItemStyle(!hasParsedItem)}
              >{S.actionAnnotate}</button>
            )}
            {!isMulti && (
              <button
                type="button"
                role="menuitem"
                data-testid="importer-action-download-gb"
                onClick={() => fire('download-gb')}
                disabled={!hasParsedItem}
                style={overflowItemStyle(!hasParsedItem)}
              >{S.actionDownloadGB}</button>
            )}
            <button
              type="button"
              role="menuitem"
              data-testid="importer-action-delete"
              onClick={() => fire('delete')}
              disabled={!hasParsedItem}
              style={{ ...overflowItemStyle(!hasParsedItem), color: 'var(--danger-text)' }}
            >{S.actionDeleteSession}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function overflowItemStyle(disabled) {
  return {
    display: 'block', width: '100%',
    textAlign: 'left',
    background: 'transparent', border: 'none',
    fontSize: 12, padding: '6px 12px',
    color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

function primaryButtonStyle(enabled) {
  return {
    fontSize: 12, padding: '6px 12px',
    background: 'var(--accent-500)',
    color: 'var(--surface-1)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
    fontWeight: 500,
  };
}

function secondaryButtonStyle(enabled) {
  return {
    fontSize: 12, padding: '6px 12px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '0.5px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
  };
}
