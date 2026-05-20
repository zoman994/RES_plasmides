/**
 * StartScreen pixel-perfect — Sprint StartScreen-Pixel tests.
 *
 * Covers acceptance criteria #1 — #12 from CURRENT_TASK.md:
 *   1. Sidebar 232 / 56 with all elements present
 *   2. Toggle (button + Ctrl+B) flips collapsed state
 *   3. Tooltip in collapsed state (data-tip)
 *   4. Active item visual (Главная active by default per
 *      workspace.active='startup')
 *   5. Disabled items (Праймеры — заглушка до M-E)
 *   6. Topbar (Главная h2 + search + ?)
 *   7. Recent header counter + 4 hardcoded rows
 *   8. Empty card with CTA
 *   9. Footer version (mono, from APP_VERSION)
 *  10. Library button → setActiveWorkspace + setActiveFullscreen
 *  11. Stub buttons fire console.log('TODO: …')
 *  12. Reload-style state survives via localStorage (collapsed)
 */
import 'fake-indexeddb/auto';
import React, { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { useStore } from '../../../store';
import { resetDBForTests } from '../../../db/dexie-schema';
import StartScreen from '../StartScreen';
import Sidebar from '../Sidebar';
import HotkeyCheatsheet from '../../HotkeyCheatsheet';
import { useSidebarCollapsed } from '../hooks/useSidebarCollapsed';
import { APP_VERSION } from '../../../lib/version';
import { writeBodge } from '../../../lib/bodge-zip';

// Sprint Single-Sidebar (09.05.2026): Sidebar moved out of
// StartScreen into App.jsx so it can stay mounted across all
// workspaces. Tests still want to assert the integration
// (Sidebar + StartScreen content + HotkeyCheatsheet) — small
// wrapper reproduces what App.jsx now does.
function StartScreenIntegration() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const [hk, setHk] = useState(false);
  return (
    <div className="start-screen-root">
      <Sidebar collapsed={collapsed} onToggle={toggle} onOpenHotkeys={() => setHk(true)} />
      <StartScreen />
      <HotkeyCheatsheet open={hk} onClose={() => setHk(false)} />
    </div>
  );
}

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
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('start-screen-root')).toBeTruthy();
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    expect(sidebar.classList.contains('expanded')).toBe(true);
  });

  it('renders all 3 actions, 3 workspace items, 2 help items, 3 footer items', () => {
    render(<StartScreenIntegration />);
    // Actions
    expect(screen.getByTestId('ss-action-create-project')).toBeTruthy();
    expect(screen.getByTestId('ss-action-open-bodge')).toBeTruthy();
    expect(screen.getByTestId('ss-action-import-file')).toBeTruthy();
    // MS-K1 (SPEC_MAIN_SCREEN_CLEANUP §3.1):
    //   - РАБОЧЕЕ МЕСТО / СПРАВКА section labels removed.
    //   - «Праймеры soon» disabled stub removed (visual noise).
    //   - «📂 Открыть проект» dev-only sidebar item removed.
    //   - «📂 Все проекты» added to main nav block.
    //   - «📖 Руководство» / «⌨ Хоткеи» moved to MainPanel «?» popover.
    //   - «↓ Установить» PWA moved to SettingsModal.
    expect(screen.getByTestId('ss-nav-home')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-library')).toBeTruthy();
    expect(screen.getByTestId('ss-nav-all-projects')).toBeTruthy();
    expect(screen.queryByTestId('ss-nav-constructs')).toBeNull();
    expect(screen.queryByTestId('ss-nav-reactions')).toBeNull();
    expect(screen.queryByTestId('ss-nav-primers')).toBeNull();   // MS-K1 removed
    expect(screen.queryByTestId('ss-dev-canvas-skeleton')).toBeNull(); // MS-K1 removed
    expect(screen.queryByTestId('ss-help-guide')).toBeNull();    // MS-K1 moved
    expect(screen.queryByTestId('ss-help-hotkeys')).toBeNull();  // MS-K1 moved
    // Footer (PWA install moved to SettingsModal — MS-K6).
    expect(screen.queryByTestId('ss-foot-install')).toBeNull();
    expect(screen.getByTestId('ss-foot-theme')).toBeTruthy();
    expect(screen.getByTestId('ss-foot-settings')).toBeTruthy();
    expect(screen.getByTestId('ss-foot-version').textContent).toMatch(APP_VERSION);
  });

  it('Главная is the active item when workspace.active=\'startup\'', () => {
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-nav-home').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('ss-nav-library').getAttribute('data-active')).toBe('false');
  });

  // MS-K1: «Праймеры» disabled stub removed; no «disabled items»
  // assertion needed (everything in the sidebar is now actionable).

  // M-X.8 K3 — PINNED section + open-palette button.
  it('M-X.8 K3 — sidebar PINNED section renders header, counter, and the «Все проекты…» button', () => {
    useStore.setState((s) => {
      s.projects = {
        ...s.projects,
        'pin-A': { id: 'pin-A', name: 'PinA', containerIds: [] },
        'pin-B': { id: 'pin-B', name: 'PinB', containerIds: [] },
      };
      s.pinnedProjectIds = ['pin-A', 'pin-B'];
      s.currentProjectId = 'pin-A';
    });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('sb-pinned-header').textContent).toMatch(/В работе/);
    expect(screen.getByTestId('sb-pinned-counter').textContent).toMatch(/2\/15/);
    expect(screen.getByTestId('sb-pinned-pin-A')).toBeTruthy();
    expect(screen.getByTestId('sb-pinned-pin-B')).toBeTruthy();
    // Current pinned project gets the active marker.
    expect(screen.getByTestId('sb-pinned-pin-A').getAttribute('data-active')).toBe('true');
    // MS-K1: «Все проекты» moved into the main nav block; clicking
    // still opens the command palette.
    fireEvent.click(screen.getByTestId('ss-nav-all-projects'));
    expect(useStore.getState().modals.commandPalette).toBe(true);
  });

  it('M-X.8 K3 — sidebar pinned row click activates project + jumps to library', () => {
    useStore.setState((s) => {
      s.projects = { ...s.projects, 'pin-X': { id: 'pin-X', name: 'X', containerIds: [] } };
      s.pinnedProjectIds = ['pin-X'];
      s.currentProjectId = null;
    });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('sb-pinned-pin-X'));
    expect(useStore.getState().currentProjectId).toBe('pin-X');
  });

  // MS-K6: PWA «Установить» moved into SettingsModal — these flows
  // are now covered by SettingsModal-level tests, not sidebar ones.

  it('M-X.8 K7 — MainPanel RecentRow pin star toggles pinnedProjectIds without activating', async () => {
    useStore.setState((s) => {
      s.projects = { 'pX': {
        id: 'pX', name: 'Dashboard', containerIds: [],
        updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      } };
      s.pinnedProjectIds = [];
      s.currentProjectId = null;
    });
    render(<StartScreenIntegration />);
    const star = await screen.findByTestId('ss-recent-pX-pin');
    expect(star.getAttribute('data-pinned')).toBe('false');
    fireEvent.click(star);
    expect(useStore.getState().pinnedProjectIds).toContain('pX');
    expect(useStore.getState().currentProjectId).toBeNull(); // not activated
    // Re-click → unpin.
    fireEvent.click(screen.getByTestId('ss-recent-pX-pin'));
    expect(useStore.getState().pinnedProjectIds).not.toContain('pX');
  });

  it('items carry data-tip for collapsed-state tooltip', () => {
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-nav-home').getAttribute('data-tip')).toBe('Главная');
    expect(screen.getByTestId('ss-nav-library').getAttribute('data-tip')).toBe('Библиотека плазмид');
  });
});

describe('StartScreen-Pixel — Sidebar collapse', () => {
  it('toggle button flips collapsed state (works in both directions)', () => {
    render(<StartScreenIntegration />);
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    // Expanded: shows ‹‹ icon.
    expect(screen.getByTestId('ss-sidebar-toggle').textContent).toBe('‹‹');
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    // Collapsed: same button stays visible, icon flips to ››.
    expect(screen.getByTestId('ss-sidebar-toggle').textContent).toBe('››');
    // Click again to expand.
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('ss-sidebar-toggle').textContent).toBe('‹‹');
  });

  it('Ctrl+B hotkey toggles collapse', () => {
    render(<StartScreenIntegration />);
    const sidebar = screen.getByTestId('ss-sidebar');
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(sidebar.getAttribute('data-collapsed')).toBe('true');
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB', ctrlKey: true });
    expect(sidebar.getAttribute('data-collapsed')).toBe('false');
  });

  it('collapsed state persists via localStorage between mounts', () => {
    const { unmount } = render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(localStorage.getItem('sidebar.collapsed')).toBe('true');
    unmount();
    cleanup();
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-sidebar').getAttribute('data-collapsed')).toBe('true');
  });

  it('toggle button stays visible in collapsed state with ›› icon', () => {
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-sidebar-toggle'));
    expect(screen.getByTestId('ss-sidebar').getAttribute('data-collapsed')).toBe('true');
    const toggle = screen.getByTestId('ss-sidebar-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe('››');
    expect(toggle.getAttribute('title')).toMatch(/Развернуть/);
  });
});

// MS-K1: Hotkey cheatsheet now lives in MainPanel «? Помощь» popover
// (MS-K3 builds the popover). Sidebar entry-point removed.

describe('StartScreen-Pixel — Library button wiring', () => {
  it('clicking Библиотека dispatches setActiveWorkspace + setActiveFullscreen', () => {
    render(<StartScreenIntegration />);
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
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-nav-home'));
    const s = useStore.getState();
    expect(s.workspace.active).toBe('startup');
    expect(s.canvas.activeFullscreen).toBe('start');
  });
});

describe('StartScreen-Pixel — MainPanel', () => {
  it('topbar shows «Главная» h2 + search + ? button', () => {
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-topbar-title').textContent).toBe('Главная');
    expect(screen.getByTestId('ss-topbar-search')).toBeTruthy();
    expect(screen.getByTestId('ss-topbar-help')).toBeTruthy();
  });

  it('shows «нет проектов» empty state when store has no projects', () => {
    useStore.setState((s) => { s.projects = {}; s.currentProjectId = null; });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-no-projects')).toBeTruthy();
    expect(screen.queryByTestId('ss-recent-header')).toBeNull();
  });

  it('recent header shows real project count from store', () => {
    useStore.setState((s) => {
      s.projects = {
        'p1': { id: 'p1', name: 'Alpha', tags: [], containerIds: [], updatedAt: '2026-05-09T10:00:00Z' },
        'p2': { id: 'p2', name: 'Beta',  tags: [], containerIds: [], updatedAt: '2026-05-09T09:00:00Z' },
      };
      s.currentProjectId = null;
    });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-recent-header').textContent).toMatch(/Недавние проекты · 2/);
    expect(screen.getByTestId('ss-recent-p1')).toBeTruthy();
    expect(screen.getByTestId('ss-recent-p2')).toBeTruthy();
  });

  it('active project row shows a status indicator', () => {
    useStore.setState((s) => {
      s.projects = {
        'px': { id: 'px', name: 'ActiveProj', tags: [], containerIds: [], updatedAt: '2026-05-09T12:00:00Z' },
      };
      s.currentProjectId = 'px';
    });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-recent-px-active')).toBeTruthy();
  });

  it('filter pills include «Все» + «Активные» and derived tag pills', () => {
    useStore.setState((s) => {
      s.projects = {
        'p1': { id: 'p1', name: 'A', tags: ['CRISPR'], containerIds: [], updatedAt: '2026-05-09T10:00:00Z' },
      };
      s.currentProjectId = null;
    });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-filter-all')).toBeTruthy();
    expect(screen.getByTestId('ss-filter-active')).toBeTruthy();
    expect(screen.getByTestId('ss-filter-tag-CRISPR')).toBeTruthy();
  });

  it('filter pills toggle active state', () => {
    useStore.setState((s) => {
      s.projects = {
        'p1': { id: 'p1', name: 'X', tags: [], containerIds: [], updatedAt: '2026-05-09T10:00:00Z' },
      };
      s.currentProjectId = null;
    });
    render(<StartScreenIntegration />);
    const all = screen.getByTestId('ss-filter-all');
    const active = screen.getByTestId('ss-filter-active');
    expect(all.getAttribute('data-active')).toBe('true');
    expect(active.getAttribute('data-active')).toBe('false');
    fireEvent.click(active);
    expect(all.getAttribute('data-active')).toBe('false');
    expect(active.getAttribute('data-active')).toBe('true');
  });

  it('clicking a project row activates the project WITHOUT navigating (12.05.2026 Игорь: «убери адресацию на старый canvas»)', () => {
    useStore.setState((s) => {
      s.projects = {
        'pclick': { id: 'pclick', name: 'ClickMe', tags: [], containerIds: [], updatedAt: '2026-05-09T10:00:00Z' },
      };
      s.currentProjectId = null;
      s.canvas.activeFullscreen = 'start';
    });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-recent-pclick'));
    const s = useStore.getState();
    expect(s.currentProjectId).toBe('pclick');
    // No navigation — fullscreen stays where biolog was (StartScreen).
    expect(s.canvas.activeFullscreen).toBe('start');
  });

  it('empty card mounts with CTA «Выбрать набор»', () => {
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-empty-card')).toBeTruthy();
    expect(screen.getByTestId('ss-empty-cta').textContent).toBe('Выбрать набор');
  });
});

describe('StartScreen-Pixel — sidebar callbacks', () => {
  it('«+ Создать проект» click → создаёт .bodge-проект, уводит в Library + открывает ProjectInfo modal', () => {
    // Reset projects + currentProjectId + modal flags for isolation
    // (other tests may have hydrated state via createProject elsewhere).
    useStore.setState((s) => {
      s.projects = {};
      s.currentProjectId = null;
      s.modals = { ...(s.modals || {}), projectInfo: false };
    });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-action-create-project'));

    const s = useStore.getState();
    // 1. Проект создан и помечен текущим (.bodge контейнер живёт в IndexedDB).
    expect(s.currentProjectId).toBeTruthy();
    const proj = s.projects[s.currentProjectId];
    expect(proj).toBeTruthy();
    expect(proj.name).toBe('Новый проект');
    // 2. Навигация ушла на Library workspace (биолог видит ProjectZone сразу).
    expect(s.canvas.activeFullscreen).toBe('library');
    expect(s.workspace?.active).toBe('library');
    // 3. ProjectInfo модалка открыта — биолог сразу задаёт имя /
    //    описание / теги (как было в App.jsx handleNew до рефакторинга).
    expect(s.modals?.projectInfo).toBe(true);
  });

  it('Empty CTA «Выбрать набор» click adds starter set entries to the store', async () => {
    useStore.setState((s) => { s.libraryEntries = {}; });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-empty-cta'));
    // addLibraryEntriesBulk is async — wait a tick for state to settle.
    await new Promise((r) => setTimeout(r, 50));
    const entries = Object.values(useStore.getState().libraryEntries);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('«Открыть .bodge» click → парсит файл, сидит библиотеку, уходит в Library workspace', async () => {
    // Полностью изолируем state — иначе предыдущие тесты могли
    // оставить projects/libraryEntries.
    useStore.setState((s) => {
      s.projects = {};
      s.currentProjectId = null;
      s.libraryEntries = {};
    });

    // Тестовый проект + 2 entry — собираем реальный .bodge через
    // writeBodge, чтобы интегрально проверить весь путь
    // (zip → readBodge → addLibraryEntriesBulk → openProjectFromFileData).
    const testProject = {
      id: '01900000-7000-7000-8000-aaaaaaaaaaaa',
      schemaVer: 1,
      name: 'Тестовый проект',
      description: 'demo',
      tags: [],
      createdAt: '2026-05-09T00:00:00Z',
      updatedAt: '2026-05-09T00:00:00Z',
      agent: { name: '', email: '' },
      containerIds: [],
      projectCommitIds: [],
      primerIds: [],
      settings: {},
      ext: {},
    };
    const testEntries = [
      {
        id: 'lib-test-1', kind: 'container', name: 'pUC19-demo', tags: ['bacterial'],
        addedAt: '2026-05-09T00:00:00Z', version: 1,
        payload: { sequence: 'ATGC'.repeat(50), length: 200, topology: 'circular', annotations: [] },
      },
      {
        id: 'lib-test-2', kind: 'container', name: 'GFP-demo', tags: [],
        addedAt: '2026-05-09T00:01:00Z', version: 1,
        payload: { sequence: 'ATG' + 'GCT'.repeat(20), length: 63, topology: 'linear', annotations: [] },
      },
    ];
    const blob = writeBodge(testProject, { libraryEntries: testEntries });
    const fakeFile = new File([blob], 'test.bodge', { type: 'application/zip' });
    fakeFile.lastModified = 1234567890;

    // Мокаем системный picker. hasFileSystemAccess() проверяет ОБА —
    // showOpenFilePicker И showSaveFilePicker — иначе сваливается на
    // _legacyOpenViaInput с DOM input.click(), который в happy-dom
    // не дёргает change. Стабим оба.
    const originalOpen = globalThis.showOpenFilePicker;
    const originalSave = globalThis.showSaveFilePicker;
    globalThis.showOpenFilePicker = vi.fn().mockResolvedValue([{
      getFile: async () => fakeFile,
    }]);
    globalThis.showSaveFilePicker = vi.fn();

    try {
      render(<StartScreenIntegration />);
      fireEvent.click(screen.getByTestId('ss-action-open-bodge'));

      await waitFor(() => {
        const s = useStore.getState();
        // 1. Проект загружен и стал текущим.
        expect(s.currentProjectId).toBe(testProject.id);
        expect(s.projects[testProject.id]?.name).toBe('Тестовый проект');
        // 2. Library entries попали в store + привязаны к проекту.
        expect(s.libraryEntries['lib-test-1']?.projectId).toBe(testProject.id);
        expect(s.libraryEntries['lib-test-2']?.projectId).toBe(testProject.id);
        // 3. Навигация ушла в Library workspace.
        expect(s.canvas.activeFullscreen).toBe('library');
        expect(s.workspace?.active).toBe('library');
      });
    } finally {
      if (originalOpen) globalThis.showOpenFilePicker = originalOpen;
      else delete globalThis.showOpenFilePicker;
      if (originalSave) globalThis.showSaveFilePicker = originalSave;
      else delete globalThis.showSaveFilePicker;
    }
  });
});

describe('StartScreen-Pixel — theme toggle (LIVE, not stub)', () => {
  it('Тема label reflects current theme value (light)', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/светлая/);
  });

  it('Тема label reflects current theme value (dark)', () => {
    useStore.setState((s) => { s.theme = 'dark'; });
    render(<StartScreenIntegration />);
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/тёмная/);
  });

  it('clicking Тема flips theme via setTheme (light → dark)', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(useStore.getState().theme).toBe('dark');
    expect(screen.getByTestId('ss-foot-theme').textContent).toMatch(/тёмная/);
  });

  it('clicking Тема again flips back (dark → light)', () => {
    useStore.setState((s) => { s.theme = 'dark'; });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(useStore.getState().theme).toBe('light');
  });

  it('theme value applied to <html> data-theme via setTheme side-effect', () => {
    useStore.setState((s) => { s.theme = 'light'; });
    render(<StartScreenIntegration />);
    fireEvent.click(screen.getByTestId('ss-foot-theme'));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
