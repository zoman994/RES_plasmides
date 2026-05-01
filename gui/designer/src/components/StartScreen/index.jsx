import { useState } from 'react';
import { useStore } from '../../store';
import { formatHotkey, HOTKEYS } from '../../lib/hotkeys';
import { writeBodge } from '../../lib/bodge-zip';
import { downloadBlob } from '../../lib/file-system';
import { promptInstall } from '../../lib/pwa-install';
import RecentCard from './RecentCard';
import SidebarLink from './SidebarLink';
import ThemeToggle from '../ThemeToggle';

function fileNameFor(project) {
  const safe = (project.name || 'project')
    .trim()
    .replace(/[^a-z0-9_\- ]+/gi, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'project';
  return `${safe}.bodge`;
}

export default function StartScreen({ onOpenFile }) {
  const theme = useStore(s => s.theme);
  const projects = useStore(s => s.projects);
  const recentProjectIds = useStore(s => s.recentProjectIds);
  const lifecycles = useStore(s => s._projectLifecycle);
  const createProject = useStore(s => s.createProject);
  const openProjectFromIndexedDB = useStore(s => s.openProjectFromIndexedDB);
  const openProjectInfo = useStore(s => s.openProjectInfo);
  const pushFullscreen = useStore(s => s.pushFullscreen);
  const openSettings = useStore(s => s.openSettings);
  const showToast = useStore(s => s.showToast);
  const canInstallPwa = useStore(s => s.canInstallPwa);
  const setCanInstallPwa = useStore(s => s.setCanInstallPwa);

  const [exportMode, setExportMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  function handleNewProject() {
    createProject('Untitled');
    openProjectInfo();
  }

  function toggleExportMode() {
    if (exportMode) {
      setExportMode(false);
      setSelectedIds(new Set());
    } else {
      setExportMode(true);
    }
  }

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExportSelected() {
    if (selectedIds.size === 0) return;
    let exported = 0;
    for (const id of selectedIds) {
      const proj = projects[id];
      if (!proj) continue;
      try {
        const blob = writeBodge(proj);
        await downloadBlob(blob, fileNameFor(proj));
        exported += 1;
        // tiny pause helps browsers handle multiple sequential downloads
        await new Promise(r => setTimeout(r, 80));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[bodgegene] export failed for project', id, e);
      }
    }
    setExportMode(false);
    setSelectedIds(new Set());
    showToast(
      exported === 1 ? 'Экспортирован 1 проект' : `Экспортировано: ${exported} проект(ов)`,
      'success',
    );
  }

  const recentProjects = recentProjectIds
    .map(id => projects[id])
    .filter(p => p && !p._pendingDelete);

  const exportBtnDisabled = recentProjects.length === 0 && !exportMode;

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
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button
            type="button"
            className="ss-header-link"
            onClick={() => pushFullscreen({
              fullscreen: 'underConstruction',
              payload: { milestone: 'M-A.1', name: 'Guide' },
            })}
            data-testid="ss-guide-link"
          >Guide</button>
          <button
            type="button"
            className="ss-header-link"
            onClick={openSettings}
            data-testid="ss-settings-link"
          >Settings</button>
          <ThemeToggle />
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
              onClick={handleNewProject}
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
            <button
              type="button"
              className={exportMode ? 'ss-action-btn-primary' : 'ss-action-btn'}
              onClick={toggleExportMode}
              disabled={exportBtnDisabled}
              title={exportMode ? 'Выйти из режима экспорта' : 'Выгрузить .bodge файлы'}
              data-testid="ss-export-toggle"
            >{exportMode ? '✓ Выйти из выбора' : '⤓ Export .bodge…'}</button>
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

          {canInstallPwa && (
            <div
              style={{
                marginTop: 'auto', paddingTop: 16,
                borderTop: '0.5px solid var(--ss-border-tertiary)',
              }}
            >
              <button
                type="button"
                className="ss-install-link"
                onClick={async () => {
                  const outcome = await promptInstall();
                  if (outcome === 'accepted') {
                    showToast('Приложение установлено', 'success');
                    setCanInstallPwa(false);
                  }
                }}
                data-testid="ss-install-link"
              >Install as desktop app</button>
            </div>
          )}
        </aside>

        <section
          style={{
            padding: '20px 20px 20px 18px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              margin: '0 0 12px',
            }}
          >
            <p style={{ fontSize: 14, color: 'var(--ss-text-secondary)', margin: 0 }}>
              {exportMode
                ? `Выбор для экспорта · ${selectedIds.size} выбрано`
                : 'Recent projects'}
            </p>
            {exportMode && (
              <button
                type="button"
                onClick={handleExportSelected}
                disabled={selectedIds.size === 0}
                data-testid="ss-export-confirm"
                style={{
                  fontSize: 13,
                  padding: '6px 14px',
                  border: '0.5px solid var(--accent-500)',
                  borderRadius: 'var(--radius-md)',
                  background: selectedIds.size === 0 ? 'transparent' : 'var(--accent-50)',
                  color: selectedIds.size === 0 ? 'var(--ss-text-tertiary)' : 'var(--accent-text)',
                  fontWeight: 500,
                  cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >Скачать выбранные ({selectedIds.size})</button>
            )}
          </div>
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
                  exportMode={exportMode}
                  selected={selectedIds.has(project.id)}
                  onToggleSelect={() => toggleSelected(project.id)}
                  onClick={() => openProjectFromIndexedDB(project.id)}
                />
              ))}
            </div>
          )}
          {recentProjects.length > 0 && !exportMode && (
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
