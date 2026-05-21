/**
 * AssemblySidebar — flat draggable list of the project's containers
 * (G2 DEC-CANVAS-ASM-21). Drag an item onto the viewer to insert a
 * full-length segment (K4). Filter input matches by name. Not the
 * LibraryTree (Q3 default — simple flat list).
 *
 * V95 (21.05.2026) — назначение панели сделано явным (explicit header
 * «Контейнеры проекта · drag → strip»), filter input + список сжаты
 * в compact-режим (по-умолчанию body свернут до счётчика, разворот
 * по chevron'у). Close × из V92 сохранён.
 */
import { useMemo, useState } from 'react';

export default function AssemblySidebar({ containers, onClose }) {
  const [filter, setFilter] = useState('');
  // V95 — body сворачивается; default open false (compact).
  const [bodyOpen, setBodyOpen] = useState(false);

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
      data-collapsed={bodyOpen ? 'false' : 'true'}
      style={{
        width: '100%',
        flex: bodyOpen ? 1 : '0 0 auto',
        minHeight: 0,
        borderLeft: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* V95 — explicit header explains purpose; chevron toggles body. */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: bodyOpen ? '1px solid var(--border-subtle)' : 'none',
          display: 'flex', gap: 6, alignItems: 'center',
          background: 'var(--surface-1)',
        }}
      >
        <button
          type="button"
          data-testid="assembly-sidebar-toggle"
          onClick={() => setBodyOpen((v) => !v)}
          title={bodyOpen ? 'Свернуть' : 'Раскрыть список'}
          style={{
            fontSize: 10, padding: '0 4px',
            background: 'transparent', color: 'var(--text-tertiary)',
            border: 'none', cursor: 'pointer', borderRadius: 3,
          }}
        >{bodyOpen ? '▾' : '▸'}</button>
        <strong
          style={{
            fontSize: 10.5, fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 0.3, textTransform: 'uppercase',
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
          title="Контейнеры проекта — источник плазмид для drag в strip сборки"
        >
          Контейнеры · {list.length}
        </strong>
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
      {bodyOpen && (
        <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            data-testid="assembly-sidebar-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Поиск…"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              padding: '4px 6px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
      )}
      {bodyOpen && (
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
      )}
    </aside>
  );
}
