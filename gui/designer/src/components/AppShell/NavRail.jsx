/**
 * NavRail — Sprint M-X.7a v2 K5 (DEC-MX7A-V2-06).
 *
 * 56px left rail per Library.html `.nav`. Renders five workspace
 * icons + two footer placeholders:
 *   ⌂ Стартовый (stub — DEC-MX7A-V2-08 keeps Quick Start accessible
 *     via this icon; full routing in M-X.7c)
 *   📚 Библиотека (active in this sprint by default)
 *   🔀 DAG (project flow)
 *   ⤓ Importer (deprecated by DEC-IMP-06 ⚓; entry preserved for
 *     power users until K7 polish removes the last callsite)
 *   ⚗ Mix (stub — M-E Mix Workspace)
 *
 * Footer:
 *   ⚙ Настройки (stub — opens existing SettingsModal in K7 polish)
 *   ◐ Тема (stub — light/dark toggle in K7 polish)
 *
 * Active state: `.accent-50` background + `.accent-500` left ribbon
 * (2px) per Library.html `.nav-item.active` styling.
 */
import { memo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';

const A = STRINGS.appShell;

const ITEMS = [
  { id: 'startup', icon: '⌂', tooltip: A.navTooltipStartup, stub: true },
  { id: 'library', icon: '📚', tooltip: A.navTooltipLibrary },
  { id: 'flow', icon: '🔀', tooltip: A.navTooltipFlow },
  { id: 'importer', icon: '⤓', tooltip: A.navTooltipImporter },
  { id: 'mix', icon: '⚗', tooltip: A.navTooltipMix, stub: true },
];

const FOOTER_ITEMS = [
  { id: 'settings', icon: '⚙', tooltip: A.navTooltipSettings },
  { id: 'theme', icon: '◐', tooltip: A.navTooltipTheme },
];

export const NavRail = memo(function NavRail() {
  const { active, setActiveWorkspace } = useStore(useShallow((s) => ({
    active: s.workspace?.active,
    setActiveWorkspace: s.setActiveWorkspace,
  })));

  return (
    <nav
      data-testid="nav-rail"
      aria-label="Workspace navigation"
      style={{
        width: 56,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {ITEMS.map((it) => {
          const isActive = active === it.id;
          return (
            <button
              type="button"
              key={it.id}
              data-testid={`nav-rail-${it.id}`}
              data-active={isActive ? 'true' : 'false'}
              data-stub={it.stub ? 'true' : 'false'}
              onClick={() => setActiveWorkspace?.(it.id)}
              title={it.tooltip}
              style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                background: isActive ? 'var(--accent-50)' : 'transparent',
                color: isActive
                  ? 'var(--accent-text)'
                  : (it.stub ? 'var(--text-tertiary)' : 'var(--text-secondary)'),
                border: 'none',
                borderLeft: isActive
                  ? '2px solid var(--accent-500)'
                  : '2px solid transparent',
                cursor: 'pointer',
                transition: 'background 120ms, color 120ms',
              }}
            >{it.icon}</button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-subtle)' }}>
        {FOOTER_ITEMS.map((it) => (
          <button
            type="button"
            key={it.id}
            data-testid={`nav-rail-footer-${it.id}`}
            title={it.tooltip}
            disabled
            style={{
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              background: 'transparent',
              color: 'var(--text-tertiary)',
              border: 'none',
              borderLeft: '2px solid transparent',
              cursor: 'not-allowed',
              opacity: 0.65,
            }}
          >{it.icon}</button>
        ))}
      </div>
    </nav>
  );
});

export default NavRail;
