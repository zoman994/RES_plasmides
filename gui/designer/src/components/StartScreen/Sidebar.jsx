/**
 * Sidebar — Sprint StartScreen-Pixel.
 *
 * Collapsible sidebar (232 / 56) per Library.html `.sb`. Mounts:
 *   • `.sb-head` — logo SVG + name + ‹‹ toggle
 *   • `.sb-body` — actions block + Workspace section + Help section
 *   • `.sb-foot` — Install / Theme / Settings stubs + version
 *
 * Все кнопки кроме «Библиотека» — stub (console.log). Library
 * click переключает workspace.active + canvas.activeFullscreen
 * to enter LibraryWorkspace per spec acceptance #10.
 */
import { useCallback } from 'react';
import { useStore } from '../../store';
import { APP_VERSION } from '../../lib/version';
import { openBodgeFilePicker } from '../../lib/file-system';
import { readBodge } from '../../lib/bodge-zip';
import { STRINGS } from '../../lib/strings';
import { promptInstall, isPwaInstalled } from '../../lib/pwa-install';
import SidebarItem from './SidebarItem';

function Logo() {
  return (
    <div className="sb-logo" aria-hidden>
      <svg width="26" height="26" viewBox="0 0 256 256">
        <circle cx="128" cy="128" r="92" fill="none" stroke="currentColor" strokeWidth="10" />
        <path
          d="M 192.95 64.95 A 92 92 0 0 1 220 128"
          fill="none" stroke="#f59e0b" strokeWidth="22" strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle, onOpenHotkeys }) {
  const activeWorkspace = useStore((s) => s.workspace?.active || 'startup');
  const activeFullscreen = useStore((s) => s.canvas?.activeFullscreen);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const setActiveFullscreen = useStore((s) => s.setActiveFullscreen);
  const createProject = useStore((s) => s.createProject);
  const openProjectInfo = useStore((s) => s.openProjectInfo);
  const openProjectFromFileData = useStore((s) => s.openProjectFromFileData);
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const showToast = useStore((s) => s.showToast);
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  // M-X.8 K3 — PINNED section + Command Palette opener.
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const activateProject = useStore((s) => s.activateProject);
  const openCommandPalette = useStore((s) => s.openCommandPalette);
  // PWA install — `canInstallPwa` flips to `true` when the browser
  // fires `beforeinstallprompt` (caught in App.jsx). Already-
  // installed mode (standalone display) reports through
  // `isPwaInstalled()` at render time. If the prompt isn't
  // available AND we're not installed (Safari/Firefox/already
  // dismissed), fall back to the manual-install hint toast.
  const canInstallPwa = useStore((s) => s.canInstallPwa);
  const installed = isPwaInstalled();
  const onInstallClick = useCallback(async () => {
    if (installed) {
      showToast?.(STRINGS.startScreen.appInstalled || 'Приложение уже установлено', 'info');
      return;
    }
    if (canInstallPwa) {
      const outcome = await promptInstall();
      if (outcome === 'accepted') {
        showToast?.(STRINGS.startScreen.appInstalled || 'Приложение установлено', 'success');
      } else if (outcome === 'dismissed') {
        showToast?.('Установка отменена', 'info');
      } else {
        showToast?.(STRINGS.startScreen.installManualHint
          || 'Установи через меню браузера: ⋮ → «Установить BodgeGene».', 'info');
      }
    } else {
      // Browser doesn't expose the install prompt API (Firefox /
      // Safari) — show the manual hint.
      showToast?.(STRINGS.startScreen.installManualHint
        || 'Установи через меню браузера: ⋮ → «Установить BodgeGene».', 'info');
    }
  }, [installed, canInstallPwa, showToast]);
  const ph = STRINGS.projectHub || {};
  const PIN_CAP = 15;
  const pinnedProjects = (pinnedProjectIds || [])
    .map((id) => projectsById?.[id])
    .filter(Boolean)
    .slice(0, PIN_CAP);

  // M-CANVAS-SKELETON (DEC-SKELETON-01) — entry для визуальной приёмки
  // скелета всей Canvas-модели. Replaces canvasPrototype (узкий PCR).
  // Кнопка всегда видна на время приёмки; после accept/FAIL — либо
  // снос всей папки скелета, либо обратный gate `import.meta.env.DEV`.
  const pushFullscreen = useStore((s) => s.pushFullscreen);
  const onSkeletonClick = useCallback(() => {
    pushFullscreen?.({ fullscreen: 'canvasSkeleton', payload: null });
  }, [pushFullscreen]);

  // Sprint Single-Sidebar — active state derives from activeFullscreen
  // (which the Sidebar handlers also drive). ⌂ Главная active when
  // viewing the StartScreen content; ▦ Библиотека active when on the
  // library workspace surface.
  const isHomeActive = activeFullscreen === 'start';
  const isLibraryActive = activeFullscreen === 'library' || activeWorkspace === 'library';

  const onLibraryClick = () => {
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
  };
  const onCreateProject = () => {
    // Создаёт пустой .bodge-контейнер (живёт в IndexedDB через
    // _scheduleAutosave; экспорт в файл — отдельная команда Ctrl+S).
    // ProjectZone «📦 Новый проект.bodge» появляется в Library tree
    // автоматически — LibraryTreeRoot перебирает projectsById.
    // Модалка ProjectInfo открывается сразу — биолог задаёт имя /
    // описание / теги (точно так же, как делал handleNew по Ctrl N).
    createProject?.('Новый проект');
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
    openProjectInfo?.();
  };

  const onOpenBodge = async () => {
    // Симметрия с onCreateProject: file picker открывает системную
    // модалку → readBodge парсит project.json + library/entries.json
    // → entries линкуются на загруженный project.id и попадают в
    // librarySlice через addLibraryEntriesBulk → openProjectFromFileData
    // регистрирует проект как текущий → переходим в Library workspace,
    // где ProjectZone «📦 <name>.bodge» появляется уже с плазмидами.
    let pick;
    try {
      pick = await openBodgeFilePicker();
    } catch (e) {
      showToast?.(`Не удалось открыть .bodge: ${e?.message || e}`, 'error');
      return;
    }
    if (!pick) return;
    let parsed;
    try {
      parsed = await readBodge(pick.file);
    } catch (e) {
      showToast?.(e?.message || String(e), 'error');
      return;
    }
    const { project, libraryEntries, warnings } = parsed;
    // Линкуем entries на загруженный проект, если в .bodge не были
    // явно прописаны projectId (типичный случай — самодостаточный
    // .bodge с пачкой плазмид). Уже привязанные — не трогаем.
    const linkedEntries = (libraryEntries || []).map((e) => ({
      ...e,
      projectId: e.projectId || project.id,
    }));
    if (linkedEntries.length > 0) {
      try {
        await addLibraryEntriesBulk?.(linkedEntries);
      } catch (e) {
        showToast?.(`Не все плазмиды загружены: ${e?.message || e}`, 'warning');
      }
    }
    try {
      await openProjectFromFileData?.({
        project,
        fileHandle: pick.handle,
        fileName: pick.fileName,
        lastModified: pick.lastModified,
      });
    } catch (e) {
      showToast?.(`Не удалось открыть проект: ${e?.message || e}`, 'error');
      return;
    }
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
    if (warnings && warnings.length) {
      showToast?.(warnings[0], 'warning');
    } else {
      showToast?.(`Загружено: ${project.name || 'проект'} (плазмид: ${linkedEntries.length})`, 'success');
    }
  };
  const onHomeClick = () => {
    setActiveWorkspace?.('startup');
    setActiveFullscreen?.('start');
  };
  const onSettingsClick = () => {
    openSettings?.();
  };
  const onThemeToggle = () => {
    // Live theme flip — uses existing uiSlice.setTheme which persists
    // to localStorage `bodgegene-theme` and applies `data-theme` to
    // <html> + #ss-root. 2-way cycle (light ↔ dark); 'system' option
    // (matchMedia) deferred to a follow-up.
    setTheme?.(theme === 'dark' ? 'light' : 'dark');
  };
  const themeLabel = theme === 'dark' ? 'Тема: тёмная' : 'Тема: светлая';

  return (
    <aside
      className={`sb ${collapsed ? 'collapsed' : 'expanded'}`}
      data-testid="ss-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className="sb-head">
        <Logo />
        {!collapsed && <div className="sb-name">BodgeGene</div>}
        <button
          type="button"
          className="sb-toggle"
          data-testid="ss-sidebar-toggle"
          title={collapsed ? 'Развернуть (Ctrl B)' : 'Свернуть (Ctrl B)'}
          aria-label={collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
          onClick={onToggle}
        >{collapsed ? '››' : '‹‹'}</button>
      </div>

      <div className="sb-body">
        <SidebarItem
          icon="+"
          label="Создать проект"
          right="⌃N"
          tip="Создать проект (Ctrl N)"
          primary
          onClick={onCreateProject}
          testId="ss-action-create-project"
        />
        <SidebarItem
          icon="↑"
          label={STRINGS.startScreen.loadBodge.replace(/^↑\s*/, '')}
          right="⌃O"
          tip="Загрузить .bodge (Ctrl O)"
          onClick={onOpenBodge}
          testId="ss-action-open-bodge"
        />
        <SidebarItem
          icon="⤓"
          label="Импорт .gb / .dna…"
          tip="Импорт .gb / .dna"
          // A23 (audit) — was a console.log stub. Route to the live import flow:
          // leave the start fullscreen → Library (same pattern as the other nav),
          // signalling it to pop the AddModal via workspace.context.openAdd.
          onClick={() => { setActiveWorkspace('library', { openAdd: true }); setActiveFullscreen('library'); }}
          testId="ss-action-import-file"
        />

        {/* MS-K1 (SPEC_MAIN_SCREEN_CLEANUP §3.1):
          * - Removed РАБОЧЕЕ МЕСТО section label (artificial grouping).
          * - Removed «📦 Праймеры soon» disabled stub.
          * - Removed «📂 Открыть проект» (was a misplaced action under
          *   the "workspace" label).
          * - Added «📂 Все проекты» as the projects entry-point in the
          *   main nav block (Ctrl+P still active via CommandPalette).
          */}
        <SidebarItem
          icon="⌂"
          label="Главная"
          tip="Главная"
          active={isHomeActive}
          onClick={onHomeClick}
          testId="ss-nav-home"
        />
        <SidebarItem
          icon="▦"
          label="Библиотека"
          right="142"
          tip="Библиотека плазмид"
          active={isLibraryActive}
          onClick={onLibraryClick}
          testId="ss-nav-library"
        />
        <SidebarItem
          icon="📂"
          label={ph.sidebarOpenAll || 'Все проекты'}
          tip={ph.sidebarOpenAllTooltip || 'Все проекты (⌘P)'}
          onClick={() => openCommandPalette?.()}
          testId="ss-nav-all-projects"
        />

        {/*
          * M-X.8 K3 — «PINNED» section. Pinned projects from
          * `state.pinnedProjectIds`; current project marked with
          * a green dot ●. Click activates + jumps to library.
          * Footer button opens the Command Palette (⌘P).
          */}
        <div
          className="sb-section"
          data-testid="sb-pinned-header"
          style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}
        >
          <span style={{ flex: 1 }}>{ph.sidebarPinnedHeader || 'В работе'}</span>
          <span
            data-testid="sb-pinned-counter"
            style={{ fontSize: 10, color: 'var(--text-tertiary)' }}
          >{(ph.sidebarPinnedCounter || ((n, c) => `${n}/${c}`))(pinnedProjects.length, PIN_CAP)}</span>
        </div>
        {pinnedProjects.map((p) => {
          const isCurrent = p.id === currentProjectId;
          return (
            <SidebarItem
              key={p.id}
              icon={isCurrent ? '●' : '📦'}
              label={p.name || p.id}
              tip={p.name || p.id}
              active={isCurrent}
              onClick={() => {
                // 12.05.2026 — Igor: «убери вообще эту адресацию,
                // мы должны забыть о старом канвасе». Pinned row
                // click больше НЕ навигирует в Library fullscreen
                // (это «старый canvas» по новой Canvas-model
                // paradigma). Только activate проект — biolog
                // остаётся там где был.
                activateProject?.(p.id);
              }}
              testId={`sb-pinned-${p.id}`}
            />
          );
        })}
        {/* MS-K1: «Все проекты» moved up into the main nav block above;
          * standalone Ctrl+P row + СПРАВКА section + Руководство + Хоткеи
          * items removed (Help moved to the main header «? Помощь» popover
          * — MS-K3). */}
      </div>

      <div className="sb-foot">
        {/* MS-K6: PWA «Установить» moved into SettingsModal. The
          * existing onInstallClick handler stays callable so the new
          * Settings section can wire to the same callback. */}
        <SidebarItem
          icon="◐"
          label={themeLabel}
          tip={`Тема: ${theme} (клик переключит)`}
          onClick={onThemeToggle}
          testId="ss-foot-theme"
        />
        <SidebarItem
          icon="⚙"
          label="Настройки"
          tip="Настройки (Ctrl ,)"
          onClick={onSettingsClick}
          testId="ss-foot-settings"
        />
        {!collapsed && (
          <div className="sb-version" data-testid="ss-foot-version">
            <span>v</span>
            <span className="mono">{APP_VERSION}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
