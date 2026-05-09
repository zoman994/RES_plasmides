/**
 * AppShell — Sprint M-X.7a v2 K5 (DEC-MX7A-V2-01 + 06).
 *
 * Layout per Library.html `.app-shell`:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Topbar (M-A.x baseline)                                 │
 *   ├──────┬──────────────────────────────────────────────────┤
 *   │ Nav  │  WorkspaceContent — switches on workspace.active │
 *   │ Rail │   • 'library'  → LibraryWorkspace (M-X.7a v2)    │
 *   │ 56px │   • 'flow'     → DagWorkspace (M-C.1 baseline)   │
 *   │      │   • 'importer' → legacy Importer (deprecated)    │
 *   │      │   • 'startup'  → Quick Start placeholder         │
 *   │      │   • 'mix'      → M-E placeholder                 │
 *   │      │   • children   → overlay-mode (App.jsx supplies  │
 *   │      │                  ContainerWindowPlaceholder /    │
 *   │      │                  MultiTabBlocked / etc.)         │
 *   └──────┴──────────────────────────────────────────────────┘
 *
 * children-overlay convention: when App.jsx passes a node as
 * children, it REPLACES the workspace content (used by routes
 * like 'containerWindow' that take over the viewport). When
 * children is null/undefined, the workspace router shows the
 * `workspace.active`-driven content.
 */
import { lazy, Suspense } from 'react';
import { useStore } from '../../store';
import Topbar from './Topbar';
import NavRail from './NavRail';

// Lazy-mount the heavy workspace components so the AppShell
// itself stays import-cheap. LibraryWorkspace pulls in the
// inspector + tree + tons of helpers; loading it conditionally
// keeps Topbar/NavRail fast.
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

function WorkspaceRouter() {
  const active = useStore((s) => s.workspace?.active || 'library');
  return (
    <Suspense fallback={<WorkspacePlaceholder name="loading" message="Загрузка…" />}>
      {active === 'library' && <LibraryWorkspace />}
      {active === 'flow' && <DagWorkspace />}
      {active === 'importer' && <Importer />}
      {active === 'startup' && (
        <WorkspacePlaceholder
          name="startup"
          message="Стартовый экран — в разработке. Используйте 📚 Библиотека для работы."
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

export default function AppShell({ children }) {
  return (
    <div
      data-testid="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // height (not min-height) + overflow:hidden anchors viewport so
        // children that declare flex:1 + overflow:hidden actually constrain
        // to the visible area.
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <Topbar />
      <div
        data-testid="app-shell-body"
        style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}
      >
        <NavRail />
        <main
          data-testid="app-shell-content"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}
        >
          {children ? children : <WorkspaceRouter />}
        </main>
      </div>
    </div>
  );
}
