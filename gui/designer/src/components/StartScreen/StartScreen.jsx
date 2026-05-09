/**
 * StartScreen — Sprint Single-Sidebar (09.05.2026, restructure).
 *
 * Pre-restructure: this component rendered Sidebar + MainPanel
 * together as a fullscreen view. Post-restructure: Sidebar lives
 * in App.jsx as the single shell across all workspaces, so this
 * component is now a thin wrapper around MainPanel only.
 *
 * Mounted by App.jsx when activeFullscreen === 'start'. The
 * `start-screen-root` scope wrapper stays so MainPanel's CSS
 * (start-screen-root prefixed selectors) keeps applying.
 */
import MainPanel from './MainPanel';
import './StartScreen.css';

export default function StartScreen() {
  return (
    <div
      className="start-screen-root"
      data-testid="start-screen-root"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <MainPanel />
    </div>
  );
}
