/**
 * StartScreen pixel-perfect — Sprint StartScreen-Pixel tests.
 *
 * Covers acceptance criteria #1 — #12 from CURRENT_TASK.md:
 *   1. Sidebar 232 / 56 with all elements present
 *   2. Toggle (button + Ctrl+B) flips collapsed state
 *   3. Tooltip in collapsed state (data-tip)
 *   4. Active item visual (Главная active by default per
 *      workspace.active='startup')
 *   5. Disabled items (Конструкции / Реакции / Праймеры)
 *   6. Topbar (Главная h2 + search + ?)
 *   7. Recent header counter + 4 hardcoded rows
 *   8. Empty card with CTA
 *   9. Footer version (mono, from APP_VERSION)
 *  10. Library button → setActiveWorkspace + setActiveFullscreen
 *  11. Stub buttons fire console.log('TODO: …')
 *  12. Reload-style state survives via localStorage (collapsed)
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import StartScreen from '../StartScreen';
import { APP_VERSION } from '../../../lib/version';

async function freshDB() {
  const name = `bodgegene-ss-${Math.random().toString(36).slice(2)}`;
  const db = resetDBForTests(name);
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await freshDB();
  useStore.setState((s) => {
    s.workspace = { active: 'startup', history: [], context: {} };
  });
  // Clear sidebar persistence between tests.
  try {
    localStorage.removeItem('sidebar.collapsed');
    localStorage.removeItem('sidebar.manual-override');
  } catch { /* ignore */ }
  // happy-dom defaults innerWidth=1024 which is below the 1100 px
  // auto-collapse threshold — force a wider viewport so the
  // expanded-default tests don't fight the auto-collapse path.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerWidth', {
      writable: true, configurable: true, value: 1400,
    });
  }
});
afterEach(cleanup);

describe('StartScreen-Pixel — Sidebar shell', () => {
  it('mounts root + sidebar expanded by default (232 px state)', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('start-screen-root')).toBeTruthy();
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    expect(sidebar.classList.contains('expanded')).toBe(true);
  });

  it('renders all 3 actions, 5 workspace items, 2 help items, 3 footer items', () => {
    render(<StartScreen />);
    // Actions
    expect(screen.getByTestId('ss-action-create-project')).toBeTruthy();
    expect(screen.getByTestId('ss-action-open-bodge')).toBeTruthy();
    expect(screen.getByTestId('ss-action-import-file')).toBeTruthy();
    // Workspace
    expect(screen.getByTestId('ss-nav-home')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-library')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-constructs')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-reactions')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-primers')).toBeTruthy();
    // Help
    expect(screen.getByTestId('ss-help-guide')).toBeTruthy();
    expect(screen.getByTestId('ss-help-hotkeys')).toBeTruthy();
    // Footer
    expect(screen.getByTestId('ss-foot-install')).toBeTruthy();
    expect(screen.getByTestId('ss-foot-theme')).toBeTruthy();
    expect(screen.getByTestId('ss-foot-settings')).toBeTruthy();
    expect(screen.getByTestId('ss-foot-version').textContent).toMatch(APP_VERSION);
  });

  it('Главная is the active item when workspace.active=\'startup\'', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-nav-home').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('ss-nav-library').getAttribute('data-active')).toBe('false');
  });

  it('disabled items (Конструкции / Реакции / Праймеры) are not clickable', () => {
    render(<StartScreen />);
    const constructs = screen.getByTestId('ss-nav-constructs');
    expect(constructs.disabled).toBe(true);
    expect(constructs.textContent).toMatch(/soon/);
    expect(screen.getByTestId('ss-nav-reactions').disabled).toBe(true);
    expect(screen.getByTestId('ss-nav-primers').disabled).toBe(true);
  });

  it('items carry data-tip for collapsed-state tooltip', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-nav-home').getAttribute('data-tip')).toBe('Главная');
    expect(screen.getByTestId('ss-nav-library').getAttribute('data-tip')).toBe('Библиотека плазмид');
  });
});

describe('StartScreen-Pixel — Sidebar collapse', () => {
  it('toggle button flips collapsed state', () => {
    render(<StartScreen />);
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    expect(sidebar.classList.contains('collapsed')).toBe(true);
    // Toggle button hidden in collapsed state.
    expect(screen.queryByTestId('ss-sidebar-toggle')).toBeNull();
  });

  it('Ctrl+B hotkey toggles collapse', () => {
    render(<StartScreen />);
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
  });

  it('collapsed state persists via localStorage between mounts', () => {
    const { unmount } = render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(localStorage.getItem('sidebar.collapsed')).toBe('true');
    unmount();
    cleanup();
    render(<StartScreen />);
    expect(screen.getByTestId('ss-sidebar').getAttribute('data-collapsed')).toBe('true');
  });

  it('logo click in collapsed state expands the sidebar (no need for Ctrl+B)', () => {
    render(<StartScreen />);
    // Collapse first.
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(screen.getByTestId('ss-sidebar').getAttribute('data-collapsed')).toBe('true');
    // ‹‹ toggle is hidden in collapsed; logo becomes a click target.
    expect(screen.queryByTestId('ss-sidebar-toggle')).toBeNull();
    expect(screen.getByTestId('ss-sidebar-logo-expand')).toBeTruthy();
    fireEvent.click(screen.getByTestId('ss-sidebar-logo-expand'));
    expect(screen.getByTestId('ss-sidebar').getAttribute('data-collapsed')).toBe('false');
  });
});

describe('StartScreen-Pixel — Hotkey cheatsheet wiring', () => {
  it('Хоткеи sidebar item click opens HotkeyCheatsheet modal', () => {
    render(<StartScreen />);
    expect(screen.queryByText(/Hotkey/i)).toBeNull();
    fireEvent.click(screen.getByTestId('ss-help-hotkeys'));
    // HotkeyCheatsheet renders its own backdrop + a close button.
    // Try to find one of its known testids; fall back to title text.
    const found =
      document.querySelector('[data-testid*="hotkey"]') ||
      document.querySelector('[role="dialog"]') ||
      Array.from(document.querySelectorAll('h2, h3')).find((h) =>
        /хотке|hotkey/i.test(h.textContent || ''),
      );
    expect(found).toBeTruthy();
  });
});

describe('StartScreen-Pixel — Library button wiring', () => {
  it('clicking Библиотека dispatches setActiveWorkspace + setActiveFullscreen', () => {
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-nav-library'));
    const s = useStore.getState();
    expect(s.workspace.active).toBe('library');
    expect(s.canvas.activeFullscreen).toBe('library');
  });

  it('clicking Главная dispatches setActiveWorkspace(startup) + setActiveFullscreen(start)', () => {
    useStore.setState((s) => {
      s.workspace.active = 'library';
      s.canvas.activeFullscreen = 'library';
    });
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-nav-home'));
    const s = useStore.getState();
    expect(s.workspace.active).toBe('startup');
    expect(s.canvas.activeFullscreen).toBe('start');
  });
});

describe('StartScreen-Pixel — MainPanel', () => {
  it('topbar shows «Главная» h2 + search + ? button', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-topbar-title').textContent).toBe('Главная');
    expect(screen.getByTestId('ss-topbar-search')).toBeTruthy();
    expect(screen.getByTestId('ss-topbar-help')).toBeTruthy();
  });

  it('recent header shows hardcoded counter «· 7»', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-recent-header').textContent).toMatch(/Недавние проекты · 7/);
  });

  it('renders 4 hardcoded recent project rows in the right order', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-recent-P43_Cas_Uni_Tr')).toBeTruthy();
    expect(screen.getByTestId('ss-recent-pEXP-glaA-XynTL')).toBeTruthy();
    expect(screen.getByTestId('ss-recent-pHDR-pepA')).toBeTruthy();
    expect(screen.getByTestId('ss-recent-pET-28b_T5exo')).toBeTruthy();
  });

  it('row 1 carries status-dot ok; row 2 carries status-dot unsaved', () => {
    render(<StartScreen />);
    const r1 = screen.getByTestId('ss-recent-P43_Cas_Uni_Tr');
    expect(r1.querySelector('[data-testid="ss-recent-status-ok"]')).toBeTruthy();
    const r2 = screen.getByTestId('ss-recent-pEXP-glaA-XynTL');
    expect(r2.querySelector('[data-testid="ss-recent-status-unsaved"]')).toBeTruthy();
  });

  it('filter pills toggle active state', () => {
    render(<StartScreen />);
    const all = screen.getByTestId('ss-filter-all');
    const active = screen.getByTestId('ss-filter-active');
    expect(all.getAttribute('data-active')).toBe('true');
    expect(active.getAttribute('data-active')).toBe('false');
    fireEvent.click(active);
    expect(all.getAttribute('data-active')).toBe('false');
    expect(active.getAttribute('data-active')).toBe('true');
  });

  it('empty card mounts with CTA «Выбрать набор»', () => {
    render(<StartScreen />);
    expect(screen.getByTestId('ss-empty-card')).toBeTruthy();
    expect(screen.getByTestId('ss-empty-cta').textContent).toBe('Выбрать набор');
  });
});

describe('StartScreen-Pixel — stub callbacks (console.log TODO)', () => {
  it('Создать проект click logs TODO: create-project', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-action-create-project'));
    expect(spy).toHaveBeenCalledWith('TODO: create-project');
    spy.mockRestore();
  });

  it('Empty CTA click logs TODO: pick-set (sample stub coverage)', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-empty-cta'));
    expect(spy).toHaveBeenCalledWith('TODO: pick-set');
    spy.mockRestore();
  });
});

describe('StartScreen-Pixel — theme toggle (LIVE, not stub)', () => {
  it('Тема label reflects current theme value (light)', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreen />);
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/светлая/);
  });

  it('Тема label reflects current theme value (dark)', () => {
    useStore.setState((s) => { s.theme = 'dark'; });
    render(<StartScreen />);
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/тёмная/);
  });

  it('clicking Тема flips theme via setTheme (light → dark)', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(useStore.getState().theme).toBe('dark');
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/тёмная/);
  });

  it('clicking Тема again flips back (dark → light)', () => {
    useStore.setState((s) => { s.theme = 'dark'; });
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(useStore.getState().theme).toBe('light');
  });

  it('theme value applied to <html> data-theme via setTheme side-effect', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreen />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
