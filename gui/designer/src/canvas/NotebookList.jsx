/**
 * NotebookList — compact list view of notebook entries.
 *
 * Spec §K13. Each row: title + date + first-line preview text-only +
 * tags. Click → onSelect(entry).
 */

const KIND_ICONS = {
  'free-text': '📝',
  sanger: '🧬',
};

export default function NotebookList({ entries, activeEntryId, onSelect, onCreate }) {
  const list = Array.isArray(entries) ? entries : [];
  return (
    <div data-testid="notebook-list" style={styles.wrap}>
      <div style={styles.header}>
        <strong style={{ fontSize: 12.5 }}>Журнал ({list.length})</strong>
        <button
          type="button"
          data-testid="notebook-list-new"
          onClick={onCreate}
          style={styles.newBtn}
        >
          + Запись
        </button>
      </div>
      <div style={styles.scroll}>
        {list.length === 0 && (
          <div data-testid="notebook-list-empty" style={styles.empty}>
            Пока нет записей. Нажмите «+ Запись», чтобы создать первую.
          </div>
        )}
        {list.map(entry => (
          <button
            key={entry.id}
            type="button"
            data-testid={`notebook-list-item-${entry.id}`}
            onClick={() => onSelect?.(entry)}
            style={{
              ...styles.row,
              background: entry.id === activeEntryId
                ? 'var(--accent-100, #eed2c1)'
                : 'transparent',
            }}
          >
            <div style={styles.rowTitle}>
              <span aria-hidden style={{ marginRight: 6 }}>
                {KIND_ICONS[entry.kind] || '📝'}
              </span>
              <span style={styles.titleText}>{entry.title || '(без названия)'}</span>
            </div>
            <div style={styles.rowMeta}>
              <span>{formatDate(entry.updatedAt || entry.createdAt)}</span>
              {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                <span style={styles.tags}>· {entry.tags.slice(0, 3).join(', ')}</span>
              )}
            </div>
            <div style={styles.preview}>{firstLineText(entry.text)}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function firstLineText(text) {
  if (!text) return '';
  const stripped = text
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_~`#>!]/g, '')
    .trim();
  const firstLine = stripped.split('\n').find(l => l.trim().length > 0) || '';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%',
    background: 'var(--surface-1)', borderRight: '1px solid var(--border-subtle)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)',
    background: 'var(--surface-2)' },
  newBtn: { padding: '4px 10px', fontSize: 11.5,
    background: 'var(--accent-500, #b85c3e)', color: '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer' },
  scroll: { flex: 1, overflowY: 'auto' },
  empty: { padding: 12, fontSize: 11.5, color: 'var(--text-tertiary)' },
  row: { display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
    border: 'none', borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer', color: 'var(--text-primary)' },
  rowTitle: { display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 500 },
  titleText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 },
  rowMeta: { display: 'flex', gap: 4, fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 },
  tags: { color: 'var(--text-tertiary)' },
  preview: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
