/**
 * StartScreen — Sprint StartScreen-Pixel.
 *
 * Pixel-perfect implementation of `docs/design_assets/start_screen.html`.
 * Replaces the legacy M-A.x StartScreen (`StartScreen/index.jsx`
 * pre-rebuild) — the new file becomes the canonical entry point.
 *
 * Composition: Sidebar (collapsible 232/56) + MainPanel (topbar +
 * recent projects + empty card). Both share the `start-screen-root`
 * scope so the CSS file's variables and pseudo-elements stay
 * isolated from the rest of the app.
 *
 * Default landing per spec (CURRENT_TASK.md):
 *   • workspaceSlice default `active = 'startup'`
 *   • App.jsx renders <StartScreen /> when workspace.active ==='startup'
 *     (or the legacy activeFullscreen === 'start' route while the
 *     transition window is open).
 *
 * All buttons are stubs (console.log) except «Библиотека» which
 * dispatches setActiveWorkspace + setActiveFullscreen to enter
 * the LibraryWorkspace per spec acceptance #10.
 */
import { useCallback, useState } from 'react';
import Sidebar from './Sidebar';
import MainPanel from './MainPanel';
import { useSidebarCollapsed } from './hooks/useSidebarCollapsed';
import HotkeyCheatsheet from '../HotkeyCheatsheet';
import './StartScreen.css';

export default function StartScreen() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const openHotkeys = useCallback(() => setHotkeysOpen(true), []);
  const closeHotkeys = useCallback(() => setHotkeysOpen(false), []);
  return (
    <div
      className="start-screen-root"
      data-testid="start-screen-root"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <Sidebar collapsed={collapsed} onToggle={toggle} onOpenHotkeys={openHotkeys} />
      <MainPanel />
      <HotkeyCheatsheet open={hotkeysOpen} onClose={closeHotkeys} />
    </div>
  );
}
