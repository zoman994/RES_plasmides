import { useStore, selectIsDirty } from '../../store';
import { formatHotkey, HOTKEYS } from '../../lib/hotkeys';
import { STRINGS } from '../../lib/strings';
import ThemeToggle from '../ThemeToggle';

export default function Topbar() {
  const navStack = useStore(s => s.canvas.navStack);
  const projectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (projectId ? s.projects[projectId] : null));
  const dirty = useStore(selectIsDirty);
  const lastSavedToFileAt = useStore(s => s.lastSavedToFileAt);
  const popFullscreen = useStore(s => s.popFullscreen);
  const closeProject = useStore(s => s.closeProject);
  const openSettings = useStore(s => s.openSettings);
  const openProjectInfo = useStore(s => s.openProjectInfo);

  const stackDepth = navStack.length;
  const canPop = stackDepth > 1;

  const projectName = project ? (project.name || STRINGS.topbar.untitled) : STRINGS.topbar.projectFallback;
  const fileName = useStore(s => s.fileName);

  let saveStatus;
  if (!project) saveStatus = '';
  else if (dirty) saveStatus = lastSavedToFileAt ? STRINGS.topbar.saveStatus.unsavedDirty : STRINGS.topbar.saveStatus.neverSaved;
  else if (lastSavedToFileAt) saveStatus = STRINGS.topbar.saveStatus.savedAt(formatRelativeTime(lastSavedToFileAt));
  else saveStatus = STRINGS.topbar.saveStatus.autosavedInBrowser;

  function handleBack() {
    if (canPop) popFullscreen();
    else closeProject();
  }

  const backTitle = canPop
    ? STRINGS.topbar.backTitle
    : `${HOTKEYS['close-project'].label} ⋅ ${formatHotkey('close-project')}`;

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          data-testid="topbar-back"
          onClick={handleBack}
          aria-label={canPop ? STRINGS.topbar.backAriaPop : STRINGS.topbar.backAriaClose}
          title={backTitle}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 10px',
            fontSize: 18,
            lineHeight: 1,
            color: 'var(--text-primary, #1c1917)',
            borderRadius: 'var(--radius-md, 6px)',
          }}
        >
          ‹
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary, #1c1917)' }}>
            {projectName}
          </span>
          {dirty && (
            <span
              data-testid="topbar-dirty-dot"
              aria-label={STRINGS.topbar.dirtyDotAria}
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-500, #f59e0b)',
                display: 'inline-block',
              }}
            />
          )}
          {project && (
            <button
              type="button"
              data-testid="topbar-edit-info"
              onClick={openProjectInfo}
              title={`${STRINGS.topbar.projectInfoTitle} ⋅ ${formatHotkey('project-info')}`}
              aria-label={STRINGS.topbar.projectInfoAria}
              style={{
                background: 'transparent', border: 'none',
                cursor: 'pointer',
                padding: '2px 6px', fontSize: 13, lineHeight: 1,
                color: 'var(--text-secondary, #57534e)',
                borderRadius: 'var(--radius-md, 6px)',
              }}
            >✏️</button>
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
          title={`${HOTKEYS['open-settings'].label} ⋅ ${formatHotkey('open-settings')}`}
          style={{
            background: 'transparent', border: 'none',
            padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text-secondary, #57534e)', fontSize: 13,
          }}
        >
          {STRINGS.topbar.settingsButton}
        </button>
        <ThemeToggle />
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
    if (diff < 60_000) return STRINGS.topbar.timeAgo.justNow;
    if (diff < 3_600_000) return STRINGS.topbar.timeAgo.minutes(Math.round(diff / 60_000));
    if (diff < 86_400_000) return STRINGS.topbar.timeAgo.hours(Math.round(diff / 3_600_000));
    return new Date(isoTs).toLocaleDateString();
  } catch {
    return '';
  }
}
