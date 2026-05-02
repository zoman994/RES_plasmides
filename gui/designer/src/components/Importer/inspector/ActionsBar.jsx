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

      {!isMulti && (
        <button
          type="button"
          data-testid="importer-action-canvas"
          onClick={() => fire('canvas')}
          disabled={!hasParsedItem || busyConfirm}
          style={{
            fontSize: 12, padding: '6px 12px',
            background: 'var(--accent-500)',
            color: 'var(--surface-1)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: hasParsedItem && !busyConfirm ? 'pointer' : 'not-allowed',
            opacity: hasParsedItem && !busyConfirm ? 1 : 0.5,
            fontWeight: 500,
          }}
        >{busyConfirm ? S.confirmBusy : S.actionCanvas}</button>
      )}

      {!isMulti && libraryEnabled && (
        <button
          type="button"
          data-testid="importer-action-library"
          onClick={() => fire('library')}
          disabled={!hasParsedItem || busyConfirm}
          style={{
            fontSize: 12, padding: '6px 12px',
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            cursor: hasParsedItem && !busyConfirm ? 'pointer' : 'not-allowed',
            opacity: hasParsedItem && !busyConfirm ? 1 : 0.5,
          }}
        >{S.actionLibrary}</button>
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
