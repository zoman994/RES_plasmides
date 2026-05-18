/**
 * CommandPalette — Sprint M-X.8 K6 (DEC-UIRREV-COMMAND-PALETTE-PROJECTS).
 *
 * Centred overlay opened by ⌘P (Ctrl+P on win/linux) or by the
 * sidebar «+ Все проекты…» button. Two groups:
 *   • ЗАКРЕПЛЕНО · N — pinned projects (filled ★).
 *   • ОСТАЛЬНЫЕ · M — everything else (hollow ☆).
 *
 * Interaction:
 *   • Click on a row → `activateProject(id)` + close.
 *   • Click on the star → toggles pin WITHOUT activation. Pin add
 *     above the cap surfaces a toast and is dropped silently.
 *   • Footer «+ Создать проект» creates a new project + activates.
 *   • Esc / outside-click / re-trigger → close.
 *   • Filter input on top — case-insensitive substring against project name.
 *
 * Wired to `state.modals.commandPalette` (uiSlice). Hotkey
 * registration is handled by the parent (App.jsx mounts the
 * keydown listener).
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { STRINGS } from '../lib/strings';
import { PIN_LIMIT } from '../store/projectSlice';

function ProjectRow({ project, pinned, isCurrent, onPin, onUnpin, onActivate }) {
  return (
    <div
      data-testid={`palette-row-${project.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onActivate(project.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate(project.id); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        background: isCurrent ? 'var(--accent-50)' : 'transparent',
      }}
      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
    >
      <button
        type="button"
        data-testid={`palette-pin-toggle-${project.id}`}
        title={pinned
          ? (STRINGS.projectHub?.unpinTooltip || 'Открепить')
          : (STRINGS.projectHub?.pinTooltip || 'Закрепить')}
        onClick={(e) => {
          e.stopPropagation();
          if (pinned) onUnpin(project.id);
          else onPin(project.id);
        }}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 2,
          cursor: 'pointer',
          fontSize: 14,
          color: pinned ? 'var(--accent-700)' : 'var(--text-tertiary)',
          lineHeight: 1,
        }}
      >{pinned ? '★' : '☆'}</button>
      <span style={{ fontSize: 13 }}>📦</span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{project.name || project.id}</span>
      {isCurrent && (
        <span
          style={{
            fontSize: 9.5, padding: '0 6px', borderRadius: 9,
            background: 'var(--accent-100, var(--accent-50))',
            color: 'var(--accent-text)',
            border: '1px solid var(--accent-300)',
            fontWeight: 500,
          }}
        >active</span>
      )}
    </div>
  );
}

export const CommandPalette = memo(function CommandPalette() {
  const open = useStore((s) => s.modals?.commandPalette);
  const close = useStore((s) => s.closeCommandPalette);
  const projectsById = useStore((s) => s.projects);
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const activateProject = useStore((s) => s.activateProject);
  const pinProject = useStore((s) => s.pinProject);
  const unpinProject = useStore((s) => s.unpinProject);
  const createProject = useStore((s) => s.createProject);
  const openProjectInfo = useStore((s) => s.openProjectInfo);
  const showToast = useStore((s) => s.showToast);
  const ph = STRINGS.projectHub || {};

  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    // Auto-focus the filter input when palette opens.
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const groups = useMemo(() => {
    const pinSet = new Set(pinnedProjectIds || []);
    const all = Object.values(projectsById || {}).filter(Boolean);
    const filter = (p) => !query.trim()
      || (p.name || '').toLowerCase().includes(query.trim().toLowerCase());
    const pinned = (pinnedProjectIds || [])
      .map((id) => projectsById?.[id])
      .filter(Boolean)
      .filter(filter);
    const others = all
      .filter((p) => !pinSet.has(p.id))
      .filter(filter)
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    return { pinned, others };
  }, [projectsById, pinnedProjectIds, query]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const onActivate = (id) => {
    activateProject?.(id);
    close?.();
  };
  const onPin = (id) => {
    const r = pinProject?.(id);
    if (r === 'cap') {
      const fn = ph.pinCapExceeded;
      const msg = typeof fn === 'function' ? fn(PIN_LIMIT) : `Закрепить можно не больше ${PIN_LIMIT} проектов`;
      showToast?.(msg, 'warning');
    } else if (r === true) {
      const proj = projectsById?.[id];
      const fn = ph.pinDoneToast;
      const msg = typeof fn === 'function' ? fn(proj?.name || id) : `${proj?.name || id} закреплён`;
      showToast?.(msg, 'success');
    }
  };
  const onUnpin = (id) => {
    unpinProject?.(id);
    const proj = projectsById?.[id];
    const fn = ph.unpinDoneToast;
    const msg = typeof fn === 'function' ? fn(proj?.name || id) : `${proj?.name || id} откреплён`;
    showToast?.(msg, 'info');
  };
  const onCreate = () => {
    if (!createProject) return;
    createProject('Новый проект');
    openProjectInfo?.();
    close?.();
  };
  const onOverlayClick = (e) => {
    if (e.target === overlayRef.current) close?.();
  };

  const total = groups.pinned.length + groups.others.length;

  return createPortal(
    <div
      ref={overlayRef}
      data-testid="command-palette-overlay"
      onClick={onOverlayClick}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(28, 25, 23, 0.42)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
      }}
    >
      <div
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={ph.paletteTitle || 'Все проекты'}
        style={{
          width: 480, maxWidth: '90vw',
          maxHeight: '70vh',
          background: 'var(--surface-1)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,0.32)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          <input
            ref={inputRef}
            type="text"
            data-testid="command-palette-input"
            value={query}
            onChange={(e) => setQuery(e.target.value || '')}
            placeholder={ph.paletteSearchPlaceholder || 'Найти проект…'}
            style={{
              width: '100%', height: 32, padding: '0 10px',
              fontSize: 13,
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 4 }}>
          {total === 0 && (
            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {ph.paletteEmpty || 'Проектов пока нет'}
            </div>
          )}
          {groups.pinned.length > 0 && (
            <>
              <div
                data-testid="command-palette-group-pinned"
                style={{
                  fontSize: 10.5, textTransform: 'uppercase',
                  letterSpacing: 0.6, fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  padding: '6px 10px 4px',
                }}
              >{(ph.paletteGroupPinned || ((n) => `ЗАКРЕПЛЕНО · ${n}`))(groups.pinned.length)}</div>
              {groups.pinned.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  pinned
                  isCurrent={p.id === currentProjectId}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onActivate={onActivate}
                />
              ))}
            </>
          )}
          {groups.others.length > 0 && (
            <>
              <div
                data-testid="command-palette-group-others"
                style={{
                  fontSize: 10.5, textTransform: 'uppercase',
                  letterSpacing: 0.6, fontWeight: 600,
                  color: 'var(--text-tertiary)',
                  padding: '8px 10px 4px',
                }}
              >{(ph.paletteGroupOthers || ((n) => `ОСТАЛЬНЫЕ · ${n}`))(groups.others.length)}</div>
              {groups.others.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  pinned={false}
                  isCurrent={p.id === currentProjectId}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  onActivate={onActivate}
                />
              ))}
            </>
          )}
        </div>
        <div style={{
          padding: 4, borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            type="button"
            data-testid="command-palette-create"
            onClick={onCreate}
            style={{
              width: '100%', textAlign: 'left',
              padding: '6px 10px',
              fontSize: 12,
              background: 'transparent',
              color: 'var(--accent-700)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >{ph.paletteCreateNew || '+ Создать проект'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
});

export default CommandPalette;
