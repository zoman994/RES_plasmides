/**
 * AppShell — Sprint Single-Sidebar (09.05.2026, supersedes K5).
 *
 * Stripped to a thin WorkspaceRouter. Topbar + NavRail were
 * retired this sprint — the StartScreen Sidebar is now the
 * single left panel for ALL workspaces. App.jsx renders Sidebar
 * outside, then mounts AppShell here for `workspace.active`
 * driven content (Library / DAG / Importer / placeholders).
 *
 * Old NavRail.jsx + Topbar.jsx files kept on disk with a
 * DEPRECATED comment; not imported anywhere. They get deleted
 * in a follow-up cleanup once the test suite confirms zero
 * references.
 *
 * Lazy-mount preserved — heavy workspace bundles still split
 * out so the shell paint stays cheap.
 */
import { lazy, Suspense } from 'react';
import { useStore } from '../../store';

const LibraryWorkspace = lazy(() => import('../Library/LibraryWorkspace'));
const DagWorkspace = lazy(() => import('../Dag/DagWorkspace'));
const Importer = lazy(() => import('../Library'));

function WorkspacePlaceholder({ name, message }) {
  return (
    <div
      data-testid={`workspace-placeholder-${name}`}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        color: 'var(--text-tertiary)',
        fontSize: 13,
        textAlign: 'center',
      }}
    >{message}</div>
  );
}

export function WorkspaceRouter() {
  const active = useStore((s) => s.workspace?.active || 'library');
  return (
    <Suspense fallback={<WorkspacePlaceholder name="loading" message="Загрузка…" />}>
      {active === 'library' && <LibraryWorkspace />}
      {active === 'flow' && <DagWorkspace />}
      {active === 'importer' && <Importer />}
      {active === 'startup' && (
        <WorkspacePlaceholder
          name="startup"
          message="Стартовый экран рендерится через ⌂ Главная в Sidebar."
        />
      )}
      {active === 'mix' && (
        <WorkspacePlaceholder
          name="mix"
          message="Mix Workspace — в разработке (M-E)."
        />
      )}
      {active === 'construct' && (
        <WorkspacePlaceholder
          name="construct"
          message="Construct workspace — открывается из конкретной записи Library."
        />
      )}
    </Suspense>
  );
}

/**
 * AppShell — content-area-only wrapper. App.jsx owns the Sidebar
 * outside; this component renders either explicit `children`
 * (overlay routes like containerWindow / multiTabBlocked) or the
 * WorkspaceRouter content.
 *
 * The `app-shell` testid is preserved for back-compat with one
 * legacy test (AppShell.test.jsx «activeFullscreen=library mounts
 * AppShell»). No more `app-shell-body` / `app-shell-content`
 * structural testids — those wrapped Topbar+NavRail+main, which
 * are gone.
 */
export default function AppShell({ children }) {
  return (
    <main
      data-testid="app-shell"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      {children ? children : <WorkspaceRouter />}
    </main>
  );
}
