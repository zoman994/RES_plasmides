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
import { useStore } from '../../store';
import { APP_VERSION } from '../../lib/version';
import SidebarItem from './SidebarItem';

function todo(label) {
  return () => {
    // eslint-disable-next-line no-console
    console.log(`TODO: ${label}`);
  };
}

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
  const openSettings = useStore((s) => s.openSettings);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

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
          onClick={todo('create-project')}
          testId="ss-action-create-project"
        />
        <SidebarItem
          icon="↑"
          label="Открыть .bodge…"
          right="⌃O"
          tip="Открыть .bodge (Ctrl O)"
          onClick={todo('open-bodge')}
          testId="ss-action-open-bodge"
        />
        <SidebarItem
          icon="⤓"
          label="Импорт .gb / .dna…"
          tip="Импорт .gb / .dna"
          onClick={todo('import-file')}
          testId="ss-action-import-file"
        />

        <div className="sb-section">Рабочее место</div>
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
          icon="⏣"
          label="Конструкции"
          tip="Конструкции (скоро)"
          disabled
          badgeSoon
          testId="ss-nav-constructs"
        />
        <SidebarItem
          icon="⌬"
          label="Реакции"
          tip="Реакции / DAG (скоро)"
          disabled
          badgeSoon
          testId="ss-nav-reactions"
        />
        <SidebarItem
          icon="⊟"
          label="Праймеры"
          tip="Праймеры (скоро)"
          disabled
          badgeSoon
          testId="ss-nav-primers"
        />

        <div className="sb-section">Справка</div>
        <SidebarItem
          icon="📖"
          label="Руководство"
          tip="Руководство"
          onClick={todo('open-guide')}
          testId="ss-help-guide"
        />
        <SidebarItem
          icon="⌨"
          label="Хоткеи"
          right="?"
          tip="Хоткеи"
          onClick={onOpenHotkeys || todo('open-hotkeys')}
          testId="ss-help-hotkeys"
        />
      </div>

      <div className="sb-foot">
        <SidebarItem
          icon="⤓"
          label="Установить"
          tip="Установить как приложение"
          onClick={todo('pwa-install')}
          testId="ss-foot-install"
          style={{ color: 'var(--accent-700)' }}
        />
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
