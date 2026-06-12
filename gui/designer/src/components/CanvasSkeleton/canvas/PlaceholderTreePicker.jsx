/**
 * PlaceholderTreePicker — модалка выбора фрагмента для заполнения
 * призрачного контейнера.
 *
 * V61 (14.05.2026) — UX переработка:
 *   1. Search bar (по name И по sequence).
 *   2. Section «Из проекта» — entries `entry.projectId === currentProjectId`.
 *   3. Section «Коллекция» — entries без projectId (loose).
 *   4. Section «Другие проекты» — entries в других проектах
 *      (свёрнуто по умолчанию, expand чтобы посмотреть).
 *   5. Section «Библиотека» — link/expand на полное дерево
 *      (открывает LibraryTreeRoot модальным embedded view'ом, скоуп
 *      такой же что в Sidebar но в pop-out режиме).
 *
 * Источник entries — global librarySlice. Click entry → onPick(entry) →
 * FILL_PLACEHOLDER в reducer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../../store';
import PlasmidMiniMap from '../../PlasmidMiniMap';
import {
  getRecent,
  getFavorites,
  recordRecent,
  toggleFavorite,
  isFavorite,
} from './picker-prefs';

function matchesQuery(entry, q) {
  if (!q) return true;
  const qLower = q.toLowerCase();
  if ((entry.name || '').toLowerCase().includes(qLower)) return true;
  const seq = (entry.payload?.sequence || '').toUpperCase();
  if (seq && seq.includes(q.toUpperCase())) return true;
  return false;
}

// B11 — type filter: 'all' | 'circular' | 'linear' | 'primer'.
function matchesType(entry, type) {
  if (!type || type === 'all') return true;
  const t = entry.payload?.topology;
  if (type === 'circular') return t === 'circular';
  if (type === 'linear') return t !== 'circular' && entry.kind !== 'oligonucleotide';
  if (type === 'primer') return entry.kind === 'oligonucleotide' || /primer/i.test(entry.name || '');
  return true;
}

// B11 — render text с highlight'ом matched substring.
function HighlightedText({ text, query }) {
  if (!query || !text) return <span>{text}</span>;
  const q = query.toLowerCase();
  const tLower = text.toLowerCase();
  const idx = tLower.indexOf(q);
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark
        data-testid="picker-match-highlight"
        style={{ background: '#fef08a', color: 'inherit', padding: '0 1px', borderRadius: 2 }}
      >{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  );
}

function PickerMiniThumb({ entry }) {
  // V85 — единый визуал с Library/TreeItemRow.MiniIcon: PlasmidMiniMap
  // 20×20 для circular/linear-with-features, тонкая линия для primers
  // и пустых linear (без аннотаций) — иначе ring SVG бесполезен.
  const top = entry?.payload?.topology;
  const annotations = entry?.payload?.annotations;
  if (entry?.kind === 'primer'
      || (top === 'linear' && (!annotations || annotations.length === 0))) {
    return (
      <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden focusable="false">
        <line x1="2" y1="10" x2="18" y2="10" stroke="var(--text-secondary)" strokeWidth="1.6" />
      </svg>
    );
  }
  return (
    <PlasmidMiniMap
      length={entry?.payload?.length || (entry?.payload?.sequence?.length || 0)}
      topology={top || 'circular'}
      annotations={annotations || []}
      size={20}
      disableHoverOverlay
    />
  );
}

function EntryRow({
  entry, onPick, onToggleFav, fav, query = '', extraBadge,
}) {
  const payload = entry.payload || {};
  const length = payload.length || (payload.sequence || '').length;
  const topology = payload.topology || 'linear';
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid={`skeleton-placeholder-picker-item-${entry.id}`}
        onClick={() => onPick(entry)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 14px 7px 32px',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--text-primary)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <span
          data-testid={`skeleton-placeholder-picker-thumb-${entry.id}`}
          style={{
            flexShrink: 0, width: 20, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // V85 follow-up — PlasmidMiniMap рисует feature labels с
            // leader-line'ом наружу (overflow:visible SVG). На 20×20
            // thumb'е labels вылазят на текст строки. Клипаем здесь —
            // labels не читаются на таком размере всё равно.
            overflow: 'hidden',
          }}
        >
          <PickerMiniThumb entry={entry} />
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <HighlightedText text={entry.name || entry.id} query={query} />
        </span>
        {/* V85 fix — projectBadge встаёт inline ПЕРЕД bp-счётчиком,
            больше не перекрывает «N bp · circular». */}
        {extraBadge && (
          <span
            data-testid={`skeleton-placeholder-picker-extra-badge-${entry.id}`}
            style={{
              fontSize: 9.5,
              color: 'var(--text-tertiary)',
              background: 'var(--surface-2)',
              padding: '1px 4px',
              borderRadius: 2,
              flexShrink: 0,
            }}
          >{extraBadge}</span>
        )}
        <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {length.toLocaleString('ru-RU')} bp · {topology}
        </span>
      </button>
      <button
        type="button"
        data-testid={`skeleton-placeholder-picker-fav-${entry.id}`}
        onClick={(e) => { e.stopPropagation(); onToggleFav(entry.id); }}
        title={fav ? 'Убрать из избранного' : 'Добавить в избранное'}
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          fontSize: 14,
          cursor: 'pointer',
          color: fav ? 'var(--accent-500, #d97706)' : 'var(--text-tertiary)',
          padding: 2,
          lineHeight: 1,
        }}
      >{fav ? '★' : '☆'}</button>
    </div>
  );
}

function Section({ id, title, count, collapsible = false, defaultExpanded = true, badge, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const open = !collapsible || expanded;
  return (
    <div data-testid={`skeleton-picker-section-${id}`} data-expanded={open ? 'true' : 'false'}>
      <button
        type="button"
        data-testid={`skeleton-picker-section-header-${id}`}
        onClick={collapsible ? () => setExpanded((v) => !v) : undefined}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: 'var(--surface-2)',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'left',
          cursor: collapsible ? 'pointer' : 'default',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.3,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
        }}
      >
        {collapsible && (
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', minWidth: 10 }}>
            {open ? '▼' : '▶'}
          </span>
        )}
        <span style={{ flex: 1 }}>{title}</span>
        {typeof count === 'number' && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>
            {count}
          </span>
        )}
        {badge && <span style={{ fontSize: 10 }}>{badge}</span>}
      </button>
      {open && children}
    </div>
  );
}

export default function PlaceholderTreePicker({ onPick, onCancel }) {
  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // B11
  const [libraryOpen, setLibraryOpen] = useState(false);
  // B8 — recent + favorites из localStorage.
  const [recentIds, setRecentIds] = useState(() => getRecent());
  const [favIds, setFavIds] = useState(() => getFavorites());

  const onToggleFav = (entryId) => {
    toggleFavorite(entryId);
    setFavIds(getFavorites());
  };

  // Wrap onPick: track recent.
  const handlePick = (entry) => {
    recordRecent(entry.id);
    setRecentIds(getRecent());
    onPick?.(entry);
  };

  const panelRef = useRef(null);
  const inputRef = useRef(null);

  // Autofocus search on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC closes.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const sections = useMemo(() => {
    const all = Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete);
    const filtered = all.filter((e) => matchesQuery(e, query) && matchesType(e, typeFilter));
    const byName = (a, b) => (a.name || a.id).localeCompare(b.name || b.id);

    const projectEntries = filtered
      .filter((e) => currentProjectId && e.projectId === currentProjectId)
      .sort(byName);
    const looseEntries = filtered
      .filter((e) => !e.projectId)
      .sort(byName);
    const otherProjectEntries = filtered
      .filter((e) => e.projectId && e.projectId !== currentProjectId)
      .sort(byName);

    return { projectEntries, looseEntries, otherProjectEntries };
  }, [entriesById, currentProjectId, query, typeFilter]);

  const projectName = currentProjectId
    ? (projectsById?.[currentProjectId]?.name || currentProjectId)
    : null;

  const totalHits = sections.projectEntries.length + sections.looseEntries.length + sections.otherProjectEntries.length;

  return (
    <div
      data-testid="skeleton-placeholder-picker-backdrop"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.32)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        ref={panelRef}
        data-testid="skeleton-placeholder-picker"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxHeight: '78vh',
          background: 'var(--surface-1)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--surface-2)',
            flexShrink: 0,
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Выберите фрагмент</div>
            <div
              data-testid="skeleton-placeholder-picker-scope"
              style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}
            >
              {projectName ? `Проект «${projectName}»` : 'Без активного проекта'}
              {query && ` · ${totalHits} найдено`}
            </div>
          </div>
          <button
            type="button"
            data-testid="skeleton-placeholder-picker-close"
            onClick={onCancel}
            title="Отмена (Esc)"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '0 4px',
            }}
          >×</button>
        </header>

        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            data-testid="skeleton-placeholder-picker-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или последовательности (ATGC…)"
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid var(--border-default, #d6d3d1)',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'inherit',
              background: 'var(--surface-1)',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
          />
          {/* B11 — type filter pills. */}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {[
              { id: 'all', label: 'Все' },
              { id: 'circular', label: '◯ Circular' },
              { id: 'linear', label: '▭ Linear' },
              { id: 'primer', label: '🧬 Primer' },
            ].map((f) => {
              const active = typeFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`picker-type-filter-${f.id}`}
                  onClick={() => setTypeFilter(f.id)}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid ' + (active ? 'var(--accent-500, #d97706)' : 'var(--border-default)'),
                    background: active ? 'var(--accent-50, #fef3c7)' : 'var(--surface-1)',
                    color: active ? 'var(--accent-700, #b45309)' : 'var(--text-secondary)',
                    fontSize: 10.5,
                    cursor: 'pointer',
                    fontWeight: active ? 600 : 400,
                  }}
                >{f.label}</button>
              );
            })}
          </div>
        </div>

        <div
          data-testid="skeleton-placeholder-picker-list"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* B8 — Recent + Favorites (если есть). */}
          {favIds.length > 0 && (() => {
            const favEntries = favIds
              .map((id) => entriesById?.[id])
              .filter((e) => e && !e._pendingDelete && matchesQuery(e, query));
            if (favEntries.length === 0) return null;
            return (
              <Section id="favorites" title="Избранное ★" count={favEntries.length} collapsible={false}>
                {favEntries.map((e) => (
                  <EntryRow key={`fav-${e.id}`} entry={e} onPick={handlePick} onToggleFav={onToggleFav} fav />
                ))}
              </Section>
            );
          })()}
          {recentIds.length > 0 && (() => {
            const recentEntries = recentIds
              .map((id) => entriesById?.[id])
              .filter((e) => e && !e._pendingDelete && matchesQuery(e, query));
            if (recentEntries.length === 0) return null;
            return (
              <Section id="recent" title="Недавнo" count={recentEntries.length} collapsible={false}>
                {recentEntries.map((e) => (
                  <EntryRow key={`rec-${e.id}`} entry={e} onPick={handlePick} onToggleFav={onToggleFav} fav={favIds.includes(e.id)} query={query} />
                ))}
              </Section>
            );
          })()}
          <Section
            id="project"
            title={projectName ? `Из проекта · ${projectName}` : 'Из проекта'}
            count={sections.projectEntries.length}
            collapsible={false}
          >
            {sections.projectEntries.length === 0 ? (
              <div style={emptyHintStyle}>
                {currentProjectId
                  ? 'В проекте нет подходящих записей.'
                  : 'Не выбран активный проект.'}
              </div>
            ) : (
              sections.projectEntries.map((e) => (
                <EntryRow key={e.id} entry={e} onPick={handlePick} onToggleFav={onToggleFav} fav={favIds.includes(e.id)} query={query} />
              ))
            )}
          </Section>

          <Section
            id="loose"
            title="Коллекция"
            count={sections.looseEntries.length}
            collapsible={false}
          >
            {sections.looseEntries.length === 0 ? (
              <div style={emptyHintStyle}>В коллекции пусто.</div>
            ) : (
              sections.looseEntries.map((e) => (
                <EntryRow key={e.id} entry={e} onPick={handlePick} onToggleFav={onToggleFav} fav={favIds.includes(e.id)} query={query} />
              ))
            )}
          </Section>

          <Section
            id="other-projects"
            title="Другие проекты"
            count={sections.otherProjectEntries.length}
            collapsible
            defaultExpanded={false}
          >
            {sections.otherProjectEntries.length === 0 ? (
              <div style={emptyHintStyle}>Других проектов нет.</div>
            ) : (
              sections.otherProjectEntries.map((e) => {
                const projName = projectsById?.[e.projectId]?.name || e.projectId;
                return (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    onPick={handlePick}
                    onToggleFav={onToggleFav}
                    fav={favIds.includes(e.id)}
                    query={query}
                    extraBadge={projName}
                  />
                );
              })
            )}
          </Section>

          <Section
            id="library"
            title="Библиотека (полное дерево)"
            collapsible
            defaultExpanded={libraryOpen}
            badge="📁"
          >
            <div
              data-testid="skeleton-placeholder-picker-library-hint"
              style={{
                padding: '10px 14px',
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              Полное дерево доступно в левой панели «Библиотека».
              {' '}Закройте этот picker (Esc) → используйте search / projects там.
              <br />
              <button
                type="button"
                data-testid="skeleton-placeholder-picker-goto-library"
                onClick={() => {
                  setLibraryOpen(true);
                  onCancel?.();
                }}
                style={{
                  marginTop: 6,
                  padding: '4px 10px',
                  border: '1px solid var(--accent-500, #d97706)',
                  borderRadius: 4,
                  background: 'var(--accent-500, #d97706)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >Перейти в библиотеку</button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

const emptyHintStyle = {
  padding: '10px 14px',
  fontSize: 11,
  color: 'var(--text-tertiary)',
  fontStyle: 'italic',
};
