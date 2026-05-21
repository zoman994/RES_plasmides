/**
 * AssemblySidebar — flat draggable list of the project's containers
 * (G2 DEC-CANVAS-ASM-21). Drag an item onto the viewer to insert a
 * full-length segment (K4). Filter input matches by name. Not the
 * LibraryTree (Q3 default — simple flat list).
 */
import { useMemo, useState } from 'react';

export default function AssemblySidebar({ containers, onClose }) {
  const [filter, setFilter] = useState('');

  const list = useMemo(() => {
    const real = (containers || []).filter(
      (c) => c && c.id && typeof c.sequence === 'string' && c.sequence.length > 0,
    );
    const q = filter.trim().toLowerCase();
    if (!q) return real;
    return real.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [containers, filter]);

  return (
    <aside
      data-testid="assembly-sidebar"
      style={{
        width: '100%',
        flex: 1,
        minHeight: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          data-testid="assembly-sidebar-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Фильтр по контейнерам проекта…"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11.5,
            padding: '5px 8px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        {typeof onClose === 'function' && (
          <button
            type="button"
            data-testid="assembly-sidebar-close"
            onClick={onClose}
            title="Скрыть панель (вернуть — кнопка «Палитра»)"
            style={{
              fontSize: 13, lineHeight: 1, padding: '0 6px',
              background: 'transparent', color: 'var(--text-tertiary)',
              border: 'none', cursor: 'pointer', borderRadius: 3,
              flexShrink: 0,
            }}
          >×</button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', padding: 8 }}>
            Нет контейнеров в проекте. Добавьте через Library.
          </div>
        ) : (
          list.map((c) => (
            <div
              key={c.id}
              data-testid="assembly-sidebar-item"
              data-container-id={c.id}
              draggable
              onDragStart={(e) => {
                try {
                  e.dataTransfer.setData('application/x-bodge-container-id', c.id);
                  e.dataTransfer.setData('text/plain', c.id);
                  e.dataTransfer.effectAllowed = 'copy';
                } catch { /* jsdom dataTransfer */ }
              }}
              title={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 8px',
                marginBottom: 4,
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                cursor: 'grab',
                fontSize: 11.5,
              }}
            >
              <span aria-hidden>{c.topology?.circular ? '⭕' : '—'}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>{(c.sequence || '').length} bp</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
