/**
 * LibraryTopBar — Sprint M-X.7a v2 K4.
 *
 * Top bar of the Library workspace per Library.html `.topbar`.
 * Renders:
 *   • Breadcrumb: «BodgeGene › Активный проект: <name> [✓ сохранён]»
 *     when an active project is set, else «Без активного проекта».
 *   • Search input (280px), centred-right; mirrors the tree-head
 *     filter input (DEC-MX7A-V2-11). Caller owns the query state.
 *   • 🔔 placeholder with tooltip «уведомления — в разработке» (OQ4).
 *   • User avatar `IS` placeholder.
 */
import { memo } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';

export const LibraryTopBar = memo(function LibraryTopBar({
  query = '',
  onQueryChange,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const currentProjectId = useStore((s) => s.currentProjectId);
  const projects = useStore((s) => s.projects);
  const activeProject = currentProjectId ? projects?.[currentProjectId] : null;
  const projectLabel = activeProject?.name || currentProjectId;

  return (
    <header
      data-testid="library-topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-1)',
        flexShrink: 0,
      }}
    >
      <nav
        data-testid="library-topbar-breadcrumb"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-secondary)',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>BodgeGene</span>
        <span style={{ color: 'var(--text-tertiary)' }}>›</span>
        {currentProjectId ? (
          <>
            <span style={{ color: 'var(--text-secondary)' }}>
              {ws.breadcrumbActive || 'Активный проект:'}
            </span>
            <span
              data-testid="library-topbar-project-name"
              style={{
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >{projectLabel}</span>
            <span
              data-testid="library-topbar-saved-pill"
              style={{
                fontSize: 10.5,
                padding: '1px 6px',
                borderRadius: 9,
                background: 'var(--success-50, var(--surface-2))',
                color: 'var(--success-fg, var(--text-secondary))',
                border: '1px solid var(--border-subtle)',
              }}
              title="Last save state"
            >✓ сохранён</span>
          </>
        ) : (
          <span
            data-testid="library-topbar-no-project"
            style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
          >{ws.breadcrumbNoProject || 'Без активного проекта'}</span>
        )}
      </nav>

      <div
        data-testid="library-topbar-search-wrap"
        style={{ position: 'relative', width: 280 }}
      >
        <span style={{
          position: 'absolute', left: 8, top: 7,
          color: 'var(--text-tertiary)', fontSize: 12,
        }}>⌕</span>
        <input
          type="text"
          data-testid="library-topbar-search"
          value={query}
          onChange={(e) => onQueryChange?.(e.target.value || '')}
          placeholder={ws.searchPlaceholder || 'Поиск по библиотеке…'}
          style={{
            width: '100%', height: 28, padding: '0 8px 0 26px',
            fontSize: 12, lineHeight: '28px',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            outline: 'none',
          }}
        />
      </div>

      <button
        type="button"
        data-testid="library-topbar-bell"
        title="Уведомления — в разработке"
        style={{
          fontSize: 14, padding: '0 8px',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: '1px solid transparent',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >🔔</button>

      <span
        data-testid="library-topbar-user"
        style={{
          width: 28, height: 28,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: 'var(--accent-50)',
          color: 'var(--accent-text)',
          fontSize: 11, fontWeight: 600,
          letterSpacing: '0.04em',
        }}
        title="Igor Sinelnikov"
      >IS</span>
    </header>
  );
});

export default LibraryTopBar;
