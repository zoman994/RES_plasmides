/**
 * NotebookRefPickerModal — entity picker for @@ref insertion.
 *
 * Spec §K14. Tabbed picker across containers / zones / pieces /
 * operations / primers / clones / external. Biolog chooses entity →
 * onPick({kind, id}) → caller inserts @@ref:kind:id@@ at cursor.
 *
 * Esc / outside-click closes (ui-interactions).
 */
import { useEffect, useMemo, useState } from 'react';

const TABS = [
  { key: 'container', label: 'Containers', sourceKey: 'containers', refKind: 'container' },
  { key: 'zone',      label: 'Zones',      sourceKey: 'zones',      refKind: 'zone' },
  { key: 'piece',     label: 'Pieces',     sourceKey: 'pieces',     refKind: 'piece' },
  { key: 'operation', label: 'Operations', sourceKey: 'operations', refKind: 'operation' },
  { key: 'primer',    label: 'Primers',    sourceKey: 'primers',    refKind: 'primer' },
  { key: 'clone',     label: 'Clones',     sourceKey: 'clones',     refKind: 'clone' },
  { key: 'external',  label: 'External refs', sourceKey: 'externalRefs', refKind: 'external' },
];

export default function NotebookRefPickerModal({
  state,
  onPick,
  onCancel,
}) {
  const [activeTab, setActiveTab] = useState('container');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const tabSpec = TABS.find(t => t.key === activeTab) || TABS[0];
  const items = useMemo(() => collectItems(state, tabSpec), [state, tabSpec]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      (it.id || '').toLowerCase().includes(q)
      || (it.label || '').toLowerCase().includes(q));
  }, [items, query]);

  const handlePick = (item) => {
    onPick?.({ kind: tabSpec.refKind, id: item.id });
  };

  return (
    <div
      role="dialog"
      data-testid="notebook-ref-picker"
      onClick={onCancel}
      style={styles.backdrop}
    >
      <div onClick={(e) => e.stopPropagation()} style={styles.shell}>
        <div style={styles.header}>
          <strong style={{ fontSize: 12.5, flex: 1 }}>Вставить ссылку (@@ref)</strong>
          <button
            type="button"
            data-testid="notebook-ref-picker-cancel"
            onClick={onCancel}
            style={styles.ghost}
          >
            ✕
          </button>
        </div>
        <div style={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              data-testid={`ref-picker-tab-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              style={{
                ...styles.tab,
                background: t.key === activeTab
                  ? 'var(--accent-100, #eed2c1)'
                  : 'transparent',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          data-testid="ref-picker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Фильтр по id или имени…"
          style={styles.search}
        />
        <div style={styles.body}>
          {filtered.length === 0 && (
            <div data-testid="ref-picker-empty" style={styles.empty}>
              Нет элементов в этой категории.
            </div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              data-testid={`ref-picker-item-${item.id}`}
              onClick={() => handlePick(item)}
              style={styles.row}
            >
              <strong style={{ fontSize: 12 }}>{item.label || '(без имени)'}</strong>
              <span style={styles.idTag}>{item.id.slice(0, 12)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function collectItems(state, tabSpec) {
  if (!state) return [];
  const raw = state[tabSpec.sourceKey];
  // Special case: clones live nested inside operations[].materializedClones.
  if (tabSpec.key === 'clone') {
    const acc = [];
    for (const op of state.operations || []) {
      for (const c of op.materializedClones || []) {
        if (c?.cloneId) {
          acc.push({ id: c.cloneId, label: c.label || c.cloneId });
        }
      }
    }
    return acc;
  }
  if (tabSpec.key === 'external') {
    return (state.externalRefs || []).map(r => ({
      id: r.id,
      label: r.title || r.accession || r.doi || r.id,
    }));
  }
  if (!Array.isArray(raw)) return [];
  return raw.map(item => ({
    id: item.id,
    label: item.name || item.title || item.id,
  })).filter(item => item.id);
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(28,25,23,0.32)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  shell: {
    width: 520, maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
    background: 'var(--surface-1)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    boxShadow: '0 8px 28px rgba(28,25,23,0.24)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 12px',
    background: 'var(--surface-2)', borderBottom: '1px solid var(--border-subtle)',
  },
  ghost: {
    padding: '4px 10px', fontSize: 12,
    background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid transparent', borderRadius: 4, cursor: 'pointer',
  },
  tabs: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px',
    borderBottom: '1px solid var(--border-subtle)' },
  tab: { padding: '4px 10px', fontSize: 11.5,
    background: 'transparent', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' },
  search: { margin: 10, padding: '6px 8px', fontSize: 12,
    border: '1px solid var(--border-subtle)', borderRadius: 4,
    background: 'var(--surface-2)', color: 'var(--text-primary)', outline: 'none' },
  body: { flex: 1, overflowY: 'auto', padding: '0 10px 10px' },
  empty: { padding: 12, fontSize: 11.5, color: 'var(--text-tertiary)' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 8px', marginBottom: 4, width: '100%',
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer', textAlign: 'left' },
  idTag: { fontSize: 10.5, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-tertiary)' },
};
