import { useEffect, useRef, useState } from 'react';
import { useStore, selectIsDirty } from '../../store';
import { formatHotkey, HOTKEYS } from '../../lib/hotkeys';
import { STRINGS } from '../../lib/strings';
import ThemeToggle from '../ThemeToggle';
import HotkeyCheatsheet from '../HotkeyCheatsheet';

export default function Topbar() {
  // UX-037 — local state for the keyboard-shortcut cheatsheet overlay.
  // Toggled from the `?` button in the topbar; mounting is gated so
  // there's no DOM cost when closed.
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);
  const navStack = useStore(s => s.canvas.navStack);
  const activeFullscreen = useStore(s => s.canvas.activeFullscreen);
  const projectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (projectId ? s.projects[projectId] : null));
  const dirty = useStore(selectIsDirty);
  const lastSavedToFileAt = useStore(s => s.lastSavedToFileAt);
  const popFullscreen = useStore(s => s.popFullscreen);
  const pushFullscreen = useStore(s => s.pushFullscreen);
  const closeProject = useStore(s => s.closeProject);
  const openSettings = useStore(s => s.openSettings);
  const openProjectInfo = useStore(s => s.openProjectInfo);

  const stackDepth = navStack.length;
  const canPop = stackDepth > 1;
  const isDag = activeFullscreen === 'dag';
  const isLibrary = activeFullscreen === 'library';
  const showImportButton = isDag && !isLibrary;

  // Contextual title: in Importer with target=library the user is browsing /
  // adding to their library and there's no project loaded — showing «—»
  // (the projectFallback) confused biologs into thinking the screen was
  // broken. Surface «Библиотека» so the topbar tells you where you are.
  const activeNavEntry = navStack[navStack.length - 1];
  const importerTarget = (isLibrary && activeNavEntry?.payload?.target) || null;
  let projectName;
  if (isLibrary && importerTarget === 'library') {
    projectName = STRINGS.topbar.libraryTitle;
  } else if (project) {
    projectName = project.name || STRINGS.topbar.untitled;
  } else {
    projectName = STRINGS.topbar.projectFallback;
  }
  const fileName = useStore(s => s.fileName);

  let saveStatus;
  if (!project) saveStatus = '';
  else if (dirty) saveStatus = lastSavedToFileAt ? STRINGS.topbar.saveStatus.unsavedDirty : STRINGS.topbar.saveStatus.neverSaved;
  else if (lastSavedToFileAt) saveStatus = STRINGS.topbar.saveStatus.savedAt(formatRelativeTime(lastSavedToFileAt));
  else saveStatus = STRINGS.topbar.saveStatus.autosavedInBrowser;

  // UX-022 — flash a green ✓ for ~1.5s after a successful flush so
  // biolog has a glance-readable confirmation. The bare grey
  // «Saved at …» text was easy to miss on long sessions. Watches
  // `lastSavedToFileAt` flips and times the flag out automatically.
  const [justSaved, setJustSaved] = useState(false);
  const lastSavedRef = useRef(lastSavedToFileAt);
  useEffect(() => {
    if (lastSavedToFileAt && lastSavedToFileAt !== lastSavedRef.current && !dirty) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1500);
      lastSavedRef.current = lastSavedToFileAt;
      return () => clearTimeout(t);
    }
    lastSavedRef.current = lastSavedToFileAt;
    return undefined;
  }, [lastSavedToFileAt, dirty]);
  // Stale-unsaved warning — if biolog has had unsaved changes for over
  // ~30 s, the status text bolds + recolors amber so it stops being
  // perceived as ambient grey chrome.
  const staleUnsaved = dirty && lastSavedToFileAt
    && (Date.now() - new Date(lastSavedToFileAt).getTime() > 30_000);

  function handleBack() {
    if (canPop) {
      popFullscreen();
    } else {
      closeProject();
    }
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
        // Padding tightened 10/16 → 4/16 (биолог 03.05.2026: «у нас
        // сверху и снизу много места отжирается»). Buttons keep
        // their own size; only the strip's vertical breathing room
        // shrinks.
        padding: '4px 16px',
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
        {showImportButton && (
          <button
            type="button"
            data-testid="topbar-import-button"
            onClick={() => pushFullscreen({
              fullscreen: 'library',
              payload: { target: 'project' },
            })}
            title={STRINGS.importer.topbarButton}
            style={{
              padding: '4px 10px', fontSize: 12,
              border: '0.5px solid var(--border-default, #d6d3d1)',
              borderRadius: 'var(--radius-md, 6px)',
              background: 'var(--surface-2, #f5f5f4)',
              color: 'var(--text-primary, #1c1917)',
              cursor: 'pointer',
            }}
          >{STRINGS.importer.topbarButton}</button>
        )}
        {/* UX-037 — `?` cheatsheet trigger. Single source of truth for
            every shortcut the app registers. */}
        <button
          type="button"
          data-testid="topbar-hotkey-help"
          onClick={() => setHotkeyHelpOpen(true)}
          title={STRINGS.topbar.hotkeyHelpTitle}
          aria-label={STRINGS.topbar.hotkeyHelpAria}
          style={{
            background: 'transparent', border: 'none',
            padding: '4px 8px', cursor: 'pointer',
            color: 'var(--text-secondary, #57534e)', fontSize: 13,
            fontWeight: 500,
          }}
        >?</button>
        <span
          data-testid="topbar-save-status"
          style={{
            fontSize: 12,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            // UX-022 — bold amber while sit-and-stew unsaved, default
            // grey while clean, default grey + green ✓ on the flash.
            color: staleUnsaved
              ? 'var(--accent-500, #f59e0b)'
              : 'var(--text-tertiary, #78716c)',
            fontWeight: staleUnsaved ? 600 : 400,
          }}
        >
          {justSaved && (
            <span
              data-testid="topbar-save-flash"
              aria-hidden="true"
              className="save-flash-bounce"
              style={{ color: '#16a34a', fontWeight: 600 }}
            >✓</span>
          )}
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
      <HotkeyCheatsheet
        open={hotkeyHelpOpen}
        onClose={() => setHotkeyHelpOpen(false)}
      />
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
