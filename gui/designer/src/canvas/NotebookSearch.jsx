/**
 * NotebookSearch — substring + tag filter input over notebook entries.
 *
 * Spec §9. Local state for query, useEffect pushes filtered results
 * to parent via onFiltered.
 */
import { useEffect, useMemo, useState } from 'react';

export default function NotebookSearch({ entries, onFiltered }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);
  useEffect(() => {
    if (typeof onFiltered === 'function') onFiltered(filtered);
  }, [filtered, onFiltered]);
  return (
    <div data-testid="notebook-search" style={styles.bar}>
      <input
        data-testid="notebook-search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск по записям…"
        style={styles.input}
      />
      <span style={styles.count} data-testid="notebook-search-count">
        {filtered.length} / {entries?.length || 0}
      </span>
    </div>
  );
}

export function filterEntries(entries, query) {
  const list = Array.isArray(entries) ? entries : [];
  const q = (query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter(e => {
    const fields = [
      e.title || '',
      e.text || '',
      ...(Array.isArray(e.tags) ? e.tags : []),
    ];
    return fields.some(f => String(f).toLowerCase().includes(q));
  });
}

const styles = {
  bar: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)' },
  input: { flex: 1, padding: '5px 8px', fontSize: 12,
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    background: 'var(--surface-1)', color: 'var(--text-primary)', outline: 'none' },
  count: { fontSize: 11, color: 'var(--text-tertiary)' },
};
