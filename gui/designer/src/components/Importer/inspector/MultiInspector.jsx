import { STRINGS } from '../../../lib/strings';

const S = STRINGS.importer;

/**
 * MultiInspector — table layout for parsedItems.length > 1 (M-B.2 K1
 * placeholder; full table + tristate master + per-row edits land in K5).
 *
 * K1 ships a minimal list with file names + remove buttons + bulk actions
 * footer. This keeps the orchestrator end-to-end testable; biolog-facing
 * polish comes in K5.
 */
export default function MultiInspector({
  items,
  currentIdx,
  perFileFlags, // eslint-disable-line no-unused-vars
  perFileEdits, // eslint-disable-line no-unused-vars
  onSelect,
  onUpdateFlags, // eslint-disable-line no-unused-vars
  onUpdateEdits, // eslint-disable-line no-unused-vars
  onRemove,
  onAction,
}) {
  return (
    <div
      data-testid="importer-multi-inspector"
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '0.5px solid var(--border-subtle)',
          fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
        }}
      >{S.multiHeader(items.length)}</div>

      <ol
        data-testid="importer-multi-list"
        style={{ flex: 1, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}
      >
        {items.map((it, i) => (
          <li
            key={it._fileName || i}
            data-testid={`importer-multi-row-${it._fileName}`}
            data-active={i === currentIdx ? 'true' : 'false'}
            onClick={() => onSelect?.(i)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px',
              borderBottom: '0.5px solid var(--border-subtle)',
              background: i === currentIdx ? 'var(--accent-50)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <span style={{ flex: 1, fontSize: 12 }}>
              {it.name || it._fileName}
              {it._error && (
                <span style={{ marginLeft: 6, color: 'var(--danger-text)' }}>· {it._error}</span>
              )}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {(it.length || 0).toLocaleString()} bp
            </span>
            <button
              type="button"
              data-testid={`importer-multi-remove-${it._fileName}`}
              onClick={(e) => { e.stopPropagation(); onRemove?.(it._fileName); }}
              style={{
                background: 'transparent', border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer', fontSize: 14, lineHeight: 1,
                padding: 4,
              }}
              aria-label={S.multiRemoveAria}
            >×</button>
          </li>
        ))}
      </ol>

      <div
        style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '8px 14px',
          borderTop: '0.5px solid var(--border-subtle)',
          background: 'var(--surface-1)',
        }}
      >
        <button
          type="button"
          data-testid="importer-multi-action-replace-all"
          onClick={() => onAction?.('replace-all')}
          style={{
            fontSize: 12, padding: '4px 10px',
            background: 'transparent',
            border: '0.5px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >{S.multiReplaceAll}</button>
        <button
          type="button"
          data-testid="importer-multi-action-library-batch"
          onClick={() => onAction?.('library-batch')}
          style={{
            fontSize: 12, padding: '4px 10px',
            background: 'var(--accent-500)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--surface-1)',
            cursor: 'pointer',
          }}
        >{S.multiBatchLibrary(items.length)}</button>
      </div>
    </div>
  );
}
