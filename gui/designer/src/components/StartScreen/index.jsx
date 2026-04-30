import { useStore } from '../../store';
import { formatHotkey, HOTKEYS } from '../../lib/hotkeys';
import RecentCard from './RecentCard';
import SidebarLink from './SidebarLink';

export default function StartScreen({ onOpenFile }) {
  const theme = useStore(s => s.theme);
  const projects = useStore(s => s.projects);
  const recentProjectIds = useStore(s => s.recentProjectIds);
  const lifecycles = useStore(s => s._projectLifecycle);
  const createProject = useStore(s => s.createProject);
  const openProjectFromIndexedDB = useStore(s => s.openProjectFromIndexedDB);
  const pushFullscreen = useStore(s => s.pushFullscreen);
  const openSettings = useStore(s => s.openSettings);
  const showToast = useStore(s => s.showToast);

  const recentProjects = recentProjectIds
    .map(id => projects[id])
    .filter(Boolean);

  return (
    <div
      id="ss-root"
      data-theme={theme}
      data-testid="start-screen"
      style={{
        background: 'var(--ss-bg-secondary)',
        borderRadius: 'var(--border-radius-lg)',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--ss-text-primary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: '0.5px solid var(--ss-border-tertiary)',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: 'var(--ss-accent-amber)' }}>
          BodgeGene
        </h1>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <a
            className="ss-header-link"
            href="https://bodgegene.dev/guide"
            target="_blank"
            rel="noreferrer noopener"
            data-testid="ss-guide-link"
          >Guide</a>
          <button
            type="button"
            className="ss-header-link"
            onClick={openSettings}
            data-testid="ss-settings-link"
          >Settings</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', flex: 1, minHeight: 0 }}>
        <aside
          style={{
            borderRight: '0.5px solid var(--ss-border-tertiary)',
            padding: '20px 14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            <button
              type="button"
              className="ss-action-btn-primary"
              onClick={() => createProject('Untitled')}
              title={`${HOTKEYS['new-project'].label} ⋅ ${formatHotkey('new-project')}`}
              data-testid="ss-new-project"
            >+ New project</button>
            <button
              type="button"
              className="ss-action-btn"
              onClick={onOpenFile}
              title={`${HOTKEYS['open-bodge'].label} ⋅ ${formatHotkey('open-bodge')}`}
              data-testid="ss-open-bodge"
            >↑ Open .bodge…</button>
            <button
              type="button"
              className="ss-action-btn"
              disabled
              title="Импорт sequence — будет в M-B"
              data-testid="ss-import-sequence"
            >↓ Import sequence</button>
          </div>

          <div style={{ borderTop: '0.5px solid var(--ss-border-tertiary)', paddingTop: 16 }}>
            <p
              style={{
                fontSize: 12, color: 'var(--ss-text-secondary)',
                margin: '0 0 6px', padding: '0 10px',
              }}
            >Browse</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <SidebarLink
                dataTestId="ss-browse-library"
                onClick={() => pushFullscreen({
                  fullscreen: 'underConstruction',
                  payload: { milestone: 'M-H', name: 'Library' },
                })}
              >Library</SidebarLink>
              <SidebarLink
                dataTestId="ss-browse-primer-pool"
                onClick={() => pushFullscreen({
                  fullscreen: 'underConstruction',
                  payload: { milestone: 'M-F', name: 'Primer pool' },
                })}
              >Primer pool</SidebarLink>
              <SidebarLink
                dataTestId="ss-browse-all-projects"
                onClick={() => pushFullscreen({
                  fullscreen: 'underConstruction',
                  payload: { milestone: 'TBD', name: 'All projects' },
                })}
              >All projects</SidebarLink>
              <SidebarLink
                disabled
                badge="soon"
                dataTestId="ss-browse-group-projects"
              >Group projects</SidebarLink>
            </div>
          </div>

          <div
            style={{
              marginTop: 'auto', paddingTop: 16,
              borderTop: '0.5px solid var(--ss-border-tertiary)',
            }}
          >
            <button
              type="button"
              className="ss-install-link"
              onClick={() => showToast('PWA install — будет в M-A.1', 'info')}
              data-testid="ss-install-link"
            >Install as desktop app</button>
          </div>
        </aside>

        <section
          style={{
            padding: '20px 20px 20px 18px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--ss-text-secondary)', margin: '0 0 12px' }}>
            Recent projects
          </p>
          {recentProjects.length === 0 ? (
            <p
              data-testid="ss-recent-empty"
              style={{ fontSize: 13, color: 'var(--ss-text-tertiary)', fontStyle: 'italic' }}
            >У вас пока нет проектов.</p>
          ) : (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                paddingRight: 4,
                maxHeight: 'calc(100vh - 180px)',
              }}
              data-testid="ss-recent-list"
            >
              {recentProjects.map((project) => (
                <RecentCard
                  key={project.id}
                  project={project}
                  lifecycle={lifecycles[project.id]}
                  onClick={() => openProjectFromIndexedDB(project.id)}
                />
              ))}
            </div>
          )}
          {recentProjects.length > 0 && (
            <button
              type="button"
              className="ss-view-all"
              onClick={() => pushFullscreen({
                fullscreen: 'underConstruction',
                payload: { milestone: 'TBD', name: 'All projects' },
              })}
              data-testid="ss-view-all"
            >View all {recentProjects.length} projects →</button>
          )}
        </section>
      </div>
    </div>
  );
}
