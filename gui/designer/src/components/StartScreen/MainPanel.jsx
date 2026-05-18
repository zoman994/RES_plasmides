/**
 * MainPanel — Dashboard «Главная».
 *
 * Reads real projects from the Zustand store (not stub data).
 * Sorted by updatedAt desc. Filter pills: «Все» + «Активный»
 * (current project only) + top-3 unique tags derived from live
 * projects. Search input filters by name in real time.
 *
 * Row click: sets currentProjectId + navigates to Library.
 */
import { useState, useMemo, useCallback } from 'react';
import { useStore } from '../../store';
import RecentRow from './RecentRow';
import EmptyCard from './EmptyCard';

const RECENT_LIMIT = 20;

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.round(diff / 60)} мин назад`;
  if (diff < 7200) return '1 час назад';
  if (diff < 86400) return `${Math.round(diff / 3600)} ч назад`;
  if (diff < 172800) return 'вчера';
  if (diff < 604800) return `${Math.round(diff / 86400)} д назад`;
  if (diff < 2592000) return `${Math.round(diff / 604800)} нед назад`;
  return `${Math.round(diff / 2592000)} мес назад`;
}

function deriveFilterPills(projects) {
  const counts = {};
  for (const p of projects) {
    for (const t of (p.tags || [])) {
      if (typeof t === 'string') counts[t] = (counts[t] || 0) + 1;
    }
  }
  const topTags = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => ({ id: `tag-${tag}`, label: tag }));
  return [
    { id: 'all', label: 'Все' },
    { id: 'active', label: 'Активные' },
    ...topTags,
  ];
}

export default function MainPanel() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');

  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  // M-X.8 K7 — pin stars on dashboard cards. Pin set lives in
  // projectSlice; toggling is decoupled from activation per
  // DEC-UIRREV-ACTIVATE-WITHOUT-PIN.
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const pinProject = useStore((s) => s.pinProject);
  const unpinProject = useStore((s) => s.unpinProject);
  const showToast = useStore((s) => s.showToast);
  const pinSet = useMemo(() => new Set(pinnedProjectIds || []), [pinnedProjectIds]);
  const onTogglePin = useCallback((id, shouldPin) => {
    if (shouldPin) {
      const r = pinProject?.(id);
      if (r === 'cap') showToast?.('Закрепить можно не больше 15 проектов', 'warning');
    } else {
      unpinProject?.(id);
    }
  }, [pinProject, unpinProject, showToast]);

  const sortedProjects = useMemo(() => (
    Object.values(projectsById || {})
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
      .slice(0, RECENT_LIMIT)
  ), [projectsById]);

  const filterPills = useMemo(() => deriveFilterPills(sortedProjects), [sortedProjects]);

  const visibleProjects = useMemo(() => {
    let list = sortedProjects;
    if (activeFilter === 'active') {
      list = list.filter((p) => p.id === currentProjectId);
    } else if (activeFilter.startsWith('tag-')) {
      const tag = activeFilter.slice(4);
      list = list.filter((p) => (p.tags || []).includes(tag));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q));
    }
    return list;
  }, [sortedProjects, activeFilter, currentProjectId, query]);

  const handleProjectClick = useCallback((projectId) => {
    // 12.05.2026 — Igor: «недавние проекты адресуют на старые
    // канвасы. убери вообще эту адресацию. мы должны забыть о
    // старом канвасе». Старая логика навигировала на
    // fullscreen='dag' (Project Flow / DagWorkspace). Это «старый
    // canvas» в новой Canvas-model paradigma (v0.6+
    // canvas-skeleton). Recent-row click теперь только активирует
    // проект; навигация — отдельные surfaces (sidebar Library
    // button, canvas-skeleton dev entry, command palette).
    useStore.setState((s) => {
      s.currentProjectId = projectId;
      const prev = s.recentProjectIds.filter((id) => id !== projectId);
      s.recentProjectIds = [projectId, ...prev].slice(0, RECENT_LIMIT);
    });
  }, []);

  return (
    <main className="main" data-testid="ss-main">
      <div className="topbar">
        <h2 data-testid="ss-topbar-title">Главная</h2>
        <div className="top-search">
          <input
            type="text"
            data-testid="ss-topbar-search"
            placeholder="Поиск проекта, плазмиды или фичи…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="ico">⌕</span>
          <span className="kbd kbd-r">Ctrl K</span>
        </div>
        <button
          type="button"
          className="top-act"
          data-testid="ss-topbar-help"
          title="Руководство"
          onClick={() => { /* TODO: open-guide */ }}
        >?</button>
      </div>

      <div className="content">
        {sortedProjects.length > 0 ? (
          <>
            <div className="recent-head">
              <h3 data-testid="ss-recent-header">
                Недавние проекты · {sortedProjects.length}
              </h3>
              <div className="filter-row" data-testid="ss-filter-row">
                {filterPills.map((pill) => (
                  <button
                    type="button"
                    key={pill.id}
                    data-testid={`ss-filter-${pill.id}`}
                    data-active={activeFilter === pill.id ? 'true' : 'false'}
                    className={`filter-pill ${activeFilter === pill.id ? 'on' : ''}`}
                    onClick={() => setActiveFilter(pill.id)}
                  >{pill.label}</button>
                ))}
              </div>
            </div>
            {visibleProjects.map((p) => (
              <RecentRow
                key={p.id}
                project={p}
                isActive={p.id === currentProjectId}
                timeAgoStr={timeAgo(p.updatedAt || p.createdAt)}
                onClick={() => handleProjectClick(p.id)}
                pinned={pinSet.has(p.id)}
                onTogglePin={onTogglePin}
              />
            ))}
            {visibleProjects.length === 0 && (
              <div
                data-testid="ss-no-results"
                style={{
                  padding: '32px 0',
                  textAlign: 'center',
                  color: 'var(--text-tertiary)',
                  fontSize: 13,
                }}
              >
                Нет проектов по выбранному фильтру.
              </div>
            )}
          </>
        ) : (
          <div
            data-testid="ss-no-projects"
            style={{
              padding: '48px 0 24px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 13,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🧬</div>
            <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>
              Нет проектов
            </div>
            <div>Создайте новый проект или откройте .bodge файл.</div>
          </div>
        )}

        <EmptyCard />
      </div>
    </main>
  );
}
