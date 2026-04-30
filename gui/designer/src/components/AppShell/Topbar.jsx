import { useStore, selectIsDirty } from '../../store';

export default function Topbar() {
  const navStack = useStore(s => s.canvas.navStack);
  const projectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (projectId ? s.projects[projectId] : null));
  const dirty = useStore(selectIsDirty);
  const lastSavedToFileAt = useStore(s => s.lastSavedToFileAt);
  const popFullscreen = useStore(s => s.popFullscreen);
  const closeProject = useStore(s => s.closeProject);
  const openSettings = useStore(s => s.openSettings);

  const canGoBack = navStack.length > 1;

  const projectName = project ? (project.name || 'Untitled') : '—';
  const fileName = useStore(s => s.fileName);

  let saveStatus;
  if (!project) saveStatus = '';
  else if (dirty) saveStatus = lastSavedToFileAt ? 'Несохранённые изменения' : 'Не сохранено';
  else if (lastSavedToFileAt) saveStatus = `Сохранено ${formatRelativeTime(lastSavedToFileAt)}`;
  else saveStatus = 'Автосохранение в браузере';

  return (
    <header
      data-testid="topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '0.5px solid var(--border-subtle, #e7e5e4)',
        background: 'var(--surface-1, #ffffff)',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {canGoBack && (
          <button
            type="button"
            data-testid="topbar-back"
            onClick={popFullscreen}
            style={{
              background: 'transparent', border: 'none',
              padding: '4px 8px', cursor: 'pointer',
              color: 'var(--text-primary, #1c1917)', fontSize: 14,
            }}
          >
            ← Назад
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary, #1c1917)' }}>
            {projectName}
          </span>
          {dirty && (
            <span
              data-testid="topbar-dirty-dot"
              aria-label="несохранённые изменения"
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-500, #f59e0b)',
                display: 'inline-block',
              }}
            />
          )}
          {fileName && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #78716c)', fontFamily: 'var(--font-mono)' }}>
              {fileName}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          data-testid="topbar-save-status"
          style={{ fontSize: 12, color: 'var(--text-tertiary, #78716c)' }}
        >
          {saveStatus}
        </span>
        <button
          type="button"
          onClick={openSettings}
          style={{
            background: 'transparent', border: 'none',
            padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text-secondary, #57534e)', fontSize: 13,
          }}
        >
          Settings
        </button>
        {project && (
          <button
            type="button"
            data-testid="topbar-close"
            onClick={closeProject}
            style={{
              background: 'transparent', border: 'none',
              padding: '4px 8px', cursor: 'pointer',
              color: 'var(--text-secondary, #57534e)', fontSize: 13,
            }}
          >
            Закрыть проект
          </button>
        )}
      </div>
    </header>
  );
}

function formatRelativeTime(isoTs) {
  if (!isoTs) return '';
  try {
    const then = new Date(isoTs).getTime();
    if (!Number.isFinite(then)) return '';
    const now = Date.now();
    const diff = Math.max(0, now - then);
    if (diff < 60_000) return 'только что';
    if (diff < 3_600_000) return `${Math.round(diff / 60_000)} мин назад`;
    if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} ч назад`;
    return new Date(isoTs).toLocaleDateString();
  } catch {
    return '';
  }
}
