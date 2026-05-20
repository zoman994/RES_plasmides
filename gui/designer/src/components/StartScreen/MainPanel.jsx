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
import HelpPopover from './HelpPopover';

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

export default function MainPanel({ onOpenHotkeys }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [query, setQuery] = useState('');
  // MS-K3 — `?` Help popover open state.
  const [helpOpen, setHelpOpen] = useState(false);

  const projectsById = useStore((s) => s.projects);
  // MS-K5 — library banner conditional: hide once library has entries.
  const libraryEntries = useStore((s) => s.libraryEntries);
  const libraryEmpty = !libraryEntries || Object.keys(libraryEntries).length === 0;
  const openSettings = useStore((s) => s.openSettings);
  const createProject = useStore((s) => s.createProject);
  const openProjectInfo = useStore((s) => s.openProjectInfo);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const setActiveFullscreen = useStore((s) => s.setActiveFullscreen);
  const openCommandPalette = useStore((s) => s.openCommandPalette);

  const onCreate = useCallback(() => {
    createProject?.('Новый проект');
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
    openProjectInfo?.();
  }, [createProject, setActiveWorkspace, setActiveFullscreen, openProjectInfo]);
  const onOpenAllProjects = useCallback(() => openCommandPalette?.(), [openCommandPalette]);
  const onLoadBodge = useCallback(() => {
    // Re-uses the same flow as the sidebar handler. The dedicated
    // OS file picker stays in the sidebar; this card opens the
    // command palette which surfaces the same "open existing" path.
    setActiveFullscreen?.('start');
    openCommandPalette?.();
  }, [setActiveFullscreen, openCommandPalette]);
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
    // 20.05.2026 — Igor: «нажатие на проект должно открывать проект.
    // пока ничего не происходит». Прежняя политика «только активирует,
    // не навигирует» (12.05.2026 — отказ от старых canvas-сурфейсов)
    // оставляла биолога без обратной связи: клик визуально ничего не
    // делает. После M-CANVAS-SKELETON у нас есть единственный новый
    // canvas-surface — canvasSkeleton (four-tier). Активируем проект
    // + pushFullscreen на canvasSkeleton.
    useStore.setState((s) => {
      s.currentProjectId = projectId;
      const prev = s.recentProjectIds.filter((id) => id !== projectId);
      s.recentProjectIds = [projectId, ...prev].slice(0, RECENT_LIMIT);
    });
    // Navigate to the project canvas. Falls through gracefully on
    // missing helper (test envs without canvas slice).
    const push = useStore.getState().pushFullscreen;
    if (typeof push === 'function') {
      push({ fullscreen: 'canvasSkeleton', payload: { projectId } });
    }
  }, []);

  return (
    <main className="main" data-testid="ss-main">
      <div className="topbar">
        <h2 data-testid="ss-topbar-title">Главная</h2>
        {/* MS-K2: top search input removed (Ctrl+K palette covers the
            same surface). Header keeps title + ? Помощь + ⚙ Настройки. */}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="top-act"
          data-testid="ss-topbar-help"
          title="Помощь (Руководство / Хоткеи / Глоссарий)"
          onClick={() => setHelpOpen(true)}
        >? Помощь</button>
        <button
          type="button"
          className="top-act"
          data-testid="ss-topbar-settings"
          title="Настройки (Ctrl ,)"
          onClick={() => openSettings?.()}
          style={{ marginLeft: 8 }}
        >⚙</button>
      </div>

      {/* MS-K2 action area: primary CTA + 2-card row. */}
      <div data-testid="ss-action-area" style={actionAreaStyles.wrap}>
        <button
          type="button"
          data-testid="ss-action-create-primary"
          onClick={onCreate}
          style={actionAreaStyles.primaryCta}
        >
          + Создать проект
          <span style={actionAreaStyles.hint}>⌃N</span>
        </button>
        <div style={actionAreaStyles.separator}>Открыть существующее</div>
        <div style={actionAreaStyles.cardRow}>
          <button
            type="button"
            data-testid="ss-action-load-bodge-card"
            onClick={onLoadBodge}
            style={actionAreaStyles.card}
          >
            <div style={actionAreaStyles.cardIcon}>↑</div>
            <div style={actionAreaStyles.cardTitle}>Загрузить .bodge</div>
            <div style={actionAreaStyles.cardSub}>С диска (file)</div>
          </button>
          <button
            type="button"
            data-testid="ss-action-all-projects-card"
            onClick={onOpenAllProjects}
            style={actionAreaStyles.card}
          >
            <div style={actionAreaStyles.cardIcon}>📂</div>
            <div style={actionAreaStyles.cardTitle}>Все проекты</div>
            <div style={actionAreaStyles.cardSub}>Внутренний список ⌘P</div>
          </button>
        </div>
      </div>

      {/* MS-K3 popover. */}
      <HelpPopover
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenHotkeys={onOpenHotkeys}
      />

      <div className="content">
        {/* MS-K5: библиотечный onboarding banner — only when library is empty. */}
        {libraryEmpty && (
          <div data-testid="ss-library-onboarding" style={libraryBannerStyles.wrap}>
            <div style={libraryBannerStyles.text}>
              Сначала наполните библиотеку — добавьте плазмиды через импорт
              или из готового набора.
            </div>
            <button
              type="button"
              data-testid="ss-library-onboarding-cta"
              onClick={() => {
                setActiveWorkspace?.('library');
                setActiveFullscreen?.('library');
              }}
              style={libraryBannerStyles.cta}
            >
              Выбрать набор
            </button>
          </div>
        )}
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

const actionAreaStyles = {
  wrap: {
    padding: '14px 20px 0 20px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  primaryCta: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', padding: '12px 18px',
    background: 'var(--accent-500, #d97706)', color: '#fff',
    border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(217,119,6,0.20)',
  },
  hint: { fontSize: 11, opacity: 0.85, fontWeight: 500 },
  separator: {
    fontSize: 11, color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: 0.4,
    margin: '6px 0 2px 0',
  },
  cardRow: { display: 'flex', gap: 10 },
  card: {
    flex: 1,
    padding: '12px 14px',
    background: 'var(--surface-2)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    cursor: 'pointer', textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  cardIcon: { fontSize: 18, lineHeight: 1 },
  cardTitle: { fontSize: 13, fontWeight: 600 },
  cardSub: { fontSize: 11, color: 'var(--text-tertiary)' },
};

const libraryBannerStyles = {
  wrap: {
    margin: '12px 20px 0 20px',
    padding: '12px 14px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-subtle)', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  text: { fontSize: 12.5, color: 'var(--text-secondary)' },
  cta: {
    padding: '6px 12px', fontSize: 12, fontWeight: 600,
    background: 'var(--accent-500, #b85c3e)', color: '#fff',
    border: 'none', borderRadius: 4, cursor: 'pointer',
  },
};
