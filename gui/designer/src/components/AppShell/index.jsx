import Topbar from './Topbar';

export default function AppShell({ children }) {
  return (
    <div
      data-testid="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        // height (not min-height) + overflow:hidden anchors viewport so
        // children that declare flex:1 + overflow:hidden actually constrain
        // to the visible area. Without this, content like Importer's body
        // grows past the viewport and the footer with primary actions
        // (Canvas / Library) ends up below the fold.
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--surface-base, #fafaf9)',
        color: 'var(--text-primary, #1c1917)',
      }}
    >
      <Topbar />
      <main
        data-testid="app-shell-content"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        {children}
      </main>
    </div>
  );
}
