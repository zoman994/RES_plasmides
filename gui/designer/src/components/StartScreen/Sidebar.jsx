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
import { useCallback, useEffect } from 'react';
import { useStore } from '../../store';
import { APP_VERSION } from '../../lib/version';
import { STRINGS } from '../../lib/strings';
import { openBodgeIntoLibrary } from './lib/open-bodge';
import { promptInstall, isPwaInstalled } from '../../lib/pwa-install';
import SidebarItem from './SidebarItem';
import { Icon } from '../icons/Icon';
import ProjectContextBar from './ProjectContextBar';
import { FEATURE_FLAGS } from '../../lib/feature-flags';

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
  const showToast = useStore((s) => s.showToast);
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  // M-X.8 K3 — PINNED section + Command Palette opener.
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const projectsById = useStore((s) => s.projects);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const activateProject = useStore((s) => s.activateProject);
  // UX_DIRECTION фаза 2 — список сборок активного проекта (раскрываются под
  // проектом в рельсе). + мост открытия конкретной сборки.
  const activeProjectAssemblies = useStore((s) => s.activeProjectAssemblies);
  const refreshActiveProjectAssemblies = useStore((s) => s.refreshActiveProjectAssemblies);
  const setPendingAssemblyId = useStore((s) => s.setPendingAssemblyId);
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
  // 16.06.2026 — «Выравнивание» as a standalone tool. The fullscreen axis
  // (start/library) is stale while a true workspace like align is active, so
  // guard the Home/Library highlights off so only one nav item lights up.
  const onAlign = activeWorkspace === 'align';
  // RS-C3 — «Сайты рестрикции» standalone tool (same axis-staleness guard as align).
  const onRestrictionSites = activeWorkspace === 'restriction-sites';
  const isHomeActive = activeFullscreen === 'start' && !onAlign && !onRestrictionSites;
  const isLibraryActive = (activeFullscreen === 'library' || activeWorkspace === 'library') && !onAlign && !onRestrictionSites;
  const isAlignActive = onAlign;
  const isRestrictionSitesActive = onRestrictionSites;

  const onLibraryClick = () => {
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
  };
  const onAlignClick = () => {
    // Opens the align workspace as a tool — pick a reference, then a read /
    // second fragment (or use «Найти похожие»). Existing inputs are preserved.
    // App.jsx shows the StartScreen whenever activeFullscreen === 'start', so we
    // must also leave that surface (→ 'library', the AppShell/WorkspaceRouter
    // surface) for the align workspace to actually render. The isLibraryActive
    // guard (&& !onAlign) keeps only «Выравнивание» highlighted.
    setActiveWorkspace?.('align');
    setActiveFullscreen?.('library');
  };
  const onRestrictionSitesClick = () => {
    // Same pattern as align: leave the start fullscreen → 'library' (the
    // WorkspaceRouter surface) so the «Сайты рестрикции» workspace renders.
    setActiveWorkspace?.('restriction-sites');
    setActiveFullscreen?.('library');
  };
  const onCreateProject = () => {
    // Создаёт пустой .bodge-контейнер (живёт в IndexedDB через
    // _scheduleAutosave; экспорт в файл — отдельная команда Ctrl+S).
    // ProjectZone «📦 Новый проект.bodge» появляется в Library tree
    // автоматически — LibraryTreeRoot перебирает projectsById.
    // Модалка ProjectInfo открывается сразу — биолог задаёт имя /
    // описание / теги (точно так же, как делал handleNew по Ctrl N).
    // Единый знаменатель: store.createProject auto-suffixes the name, so every
    // create button just passes the base «Новый проект» (no per-caller dedup).
    createProject?.('Новый проект');
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
    openProjectInfo?.();
  };

  // Shared with the start-screen «Загрузить .bodge» card (lib/open-bodge.js):
  // OS picker → readBodge → link entries → register project → Library.
  const onOpenBodge = () => openBodgeIntoLibrary();
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

  // UX_DIRECTION фаза 2 — двухуровневый рельс: окна активного проекта.
  const currentProjectName = projectsById?.[currentProjectId]?.name || 'проект';
  const isAssemblyActive = activeFullscreen === 'canvasSkeleton';
  const assemblies = Array.isArray(activeProjectAssemblies) ? activeProjectAssemblies : [];

  // Грузим список сборок проекта из снапшота при СМЕНЕ проекта (стартовое
  // состояние до открытия канваса). Пока канвас открыт, его SkeletonProvider
  // LIVE-зеркалит зоны в `activeProjectAssemblies` — поэтому НЕ рефрешим на
  // выходе из канваса (иначе дебаунс-снапшот мог бы затереть свежий список).
  useEffect(() => {
    refreshActiveProjectAssemblies?.();
  }, [currentProjectId, refreshActiveProjectAssemblies]);

  const openProjectCanvas = (assemblyId) => {
    // Тот же проверенный путь, что MainPanel.handleProjectClick. Если задан
    // assemblyId — ставим мост, SkeletonProvider сфокусирует эту сборку.
    if (assemblyId) setPendingAssemblyId?.(assemblyId);
    pushFullscreen?.({ fullscreen: 'canvasSkeleton', payload: { projectId: currentProjectId } });
  };
  const onOpenAssemblies = () => openProjectCanvas(null);

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
          icon={<Icon name="plus" size={16} />}
          label="Создать проект"
          right="⌃N"
          tip="Создать проект (Ctrl N)"
          primary
          onClick={onCreateProject}
          testId="ss-action-create-project"
        />
        <SidebarItem
          icon={<Icon name="import" size={16} />}
          label={STRINGS.startScreen.loadBodge.replace(/^↑\s*/, '')}
          right="⌃O"
          tip="Загрузить .bodge (Ctrl O)"
          onClick={onOpenBodge}
          testId="ss-action-open-bodge"
        />
        <SidebarItem
          icon={<Icon name="import" size={16} />}
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
          * - Removed «📂 Все проекты» (15.06.2026) — redundant with
          *   ▦ Библиотека (both open the Library, the project hub). ⌘P
          *   still jumps to the Library + focuses its search.
          */}
        {/* UX_DIRECTION фаза 2 — заголовок группы кросс-проектных инструментов.
            Gated → flag off убирает заголовок (рельс как раньше). */}
        {FEATURE_FLAGS.twoLevelRail && (
          <div className="sb-section" data-testid="sb-tools-header">Инструменты</div>
        )}
        <SidebarItem
          icon={<Icon name="home" size={16} />}
          label="Главная"
          tip="Главная"
          active={isHomeActive}
          onClick={onHomeClick}
          testId="ss-nav-home"
        />
        <SidebarItem
          icon={<Icon name="library" size={16} />}
          label="Библиотека"
          right="142"
          tip="Библиотека плазмид"
          active={isLibraryActive}
          onClick={onLibraryClick}
          testId="ss-nav-library"
        />
        <SidebarItem
          icon={<Icon name="sequence" size={16} />}
          label="Выравнивание"
          tip="Выравнивание (референс ↔ чтение)"
          active={isAlignActive}
          onClick={onAlignClick}
          testId="ss-nav-align"
        />
        <SidebarItem
          icon={<Icon name="restriction" size={16} />}
          label="Сайты рестрикции"
          tip="Сайты рестрикции — свои ферменты + наборы"
          active={isRestrictionSitesActive}
          onClick={onRestrictionSitesClick}
          testId="ss-nav-restriction-sites"
        />

        {/* UX_DIRECTION фаза 1 — активный проект виден ВСЕГДА (корень
            «не понимаю, какой проект выбран»). Стоит между инструментами
            (Главная/Библиотека/Выравнивание) и проектным блоком (В работе).
            Gated флагом → откат мгновенный (FEATURE_FLAGS.projectContextBar=false). */}
        {FEATURE_FLAGS.projectContextBar && (
          <ProjectContextBar collapsed={collapsed} />
        )}

        {/* UX_DIRECTION фаза 2 — группа «ПРОЕКТ · {имя}»: окна активного `.bodge`.
            Сборки РАСКРЫВАЮТСЯ из проекта (их может быть много, Игорь 19.06):
            список сборок проекта + «+ Новая сборка». Клик по сборке открывает
            канвас на ней (мост pendingAssemblyId). Показывается только когда
            проект активен. Gated → flag off убирает блок. */}
        {FEATURE_FLAGS.twoLevelRail && currentProjectId && (
          <>
            <div
              className="sb-section"
              data-testid="sb-project-header"
              title={`Проект: ${currentProjectName}`}
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >Проект · {currentProjectName}</div>
            {assemblies.length === 0 ? (
              <SidebarItem
                icon={<Icon name="dna" size={16} />}
                label="Создать сборку"
                tip={`Сборки проекта «${currentProjectName}»`}
                active={isAssemblyActive}
                onClick={onOpenAssemblies}
                testId="ss-nav-project-assemblies"
              />
            ) : (
              <>
                {assemblies.map((a) => (
                  <SidebarItem
                    key={a.id}
                    icon={<Icon name="dna" size={16} />}
                    label={a.name || 'Сборка'}
                    tip={`Сборка «${a.name || 'Сборка'}»`}
                    active={false}
                    onClick={() => openProjectCanvas(a.id)}
                    testId={`ss-nav-assembly-${a.id}`}
                  />
                ))}
                <SidebarItem
                  icon={<Icon name="plus" size={16} />}
                  label="Новая сборка"
                  tip="Создать новую сборку в проекте"
                  active={false}
                  onClick={onOpenAssemblies}
                  testId="ss-nav-assembly-new"
                />
              </>
            )}
          </>
        )}

        {/* «📂 Все проекты» removed — it just opened the Library (same as the
            ▦ Библиотека item above). Projects live in the Library; quick-find
            is its search (⌘P still jumps there). */}

        {/* «В работе» (закреплённые проекты) убраны при twoLevelRail (Игорь
            19.06): быстрый переключатель проектов теперь в дропдауне карточки
            активного проекта, а под проектом раскрываются его сборки. Gated →
            flag off возвращает секцию (откат). */}
        {!FEATURE_FLAGS.twoLevelRail && (
        <>
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
        </>
        )}
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
          icon={<Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />}
          label={themeLabel}
          tip={`Тема: ${theme} (клик переключит)`}
          onClick={onThemeToggle}
          testId="ss-foot-theme"
        />
        <SidebarItem
          icon={<Icon name="settings" size={16} />}
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
