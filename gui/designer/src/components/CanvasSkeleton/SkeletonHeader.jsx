/**
 * SkeletonHeader — top header с «← Назад» + Layout/Graph toggle.
 *
 * «← Назад» — popFullscreen() возвращает к предыдущему route (как и в
 * prototype). Layout/Graph toggle — переключает state.view, sub-views
 * pure derived от state.
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { Icon } from '../icons/Icon';
import { useSkeletonState, useSkeletonActions } from './store/skeleton-context';
import RestrictionPanel from './RestrictionPanel';

export default function SkeletonHeader() {
  const s = STRINGS.canvasSkeleton || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const popFullscreen = useStore((st) => st.popFullscreen);
  // Слим-шапка: когда есть хлебные крошки «📁 {проект} › Сборки», дубль «← Назад»
  // + имя проекта здесь избыточны (крошки показывают имя + проектная крошка
  // кликом делает popFullscreen; закрытие открытого редактора — собственный
  // «← Назад» в EditorWindowShell). Откат — флаг breadcrumb=false.
  const slim = FEATURE_FLAGS.breadcrumb;
  // PC-K4: header shows the active project's name (biolog-readable),
  // not the developer placeholder «Canvas-скелет». Fallback chain:
  // project.name → spec default → «Без названия».
  const projectName = useStore((st) => {
    const id = st.currentProjectId;
    return id ? st.projects?.[id]?.name : null;
  });
  const headerTitle = projectName || s.headerTitle || 'Без названия';

  const onBack = useCallback(() => {
    if (state.editorOpen) {
      actions.closeEditor();
      return;
    }
    if (typeof popFullscreen === 'function') popFullscreen();
  }, [state.editorOpen, actions, popFullscreen]);

  return (
    <header
      data-testid="skeleton-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
        flexShrink: 0,
      }}
    >
      {!slim && (
        <button
          type="button"
          data-testid="skeleton-back-btn"
          onClick={onBack}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
        >{s.backToCanvas || '← Назад'}</button>
      )}

      {!slim && (
        <span
          data-testid="skeleton-header-title"
          style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: 0.2 }}
        >
          {headerTitle}
        </span>
      )}

      <RestrictionHeaderToggle />
      {/* M-WORKSPACE — the Layout/Graph view toggle is retired: each assembly
          now owns its own DAG view tab in the two-level workspace. */}
    </header>
  );
}

/**
 * PC-K9 (SPEC §4.7): Restriction sites toggle relocated from the
 * removed LibraryTreeHost footer to the canvas header. Click opens a
 * small popover hosting the existing RestrictionPanel; pill colour
 * tracks the showReSites boolean so biologists see at a glance whether
 * sites are visible in the SequenceView.
 */
function RestrictionHeaderToggle() {
  const showReSites = useStore((st) => st.showReSites);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        type="button"
        data-testid="skeleton-restriction-header-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Рестриктазы — фильтр и видимость сайтов"
        style={{
          padding: '4px 10px',
          background: showReSites ? 'var(--accent-500, #b85c3e)' : 'var(--surface-1)',
          color: showReSites ? '#fff' : 'var(--text-secondary)',
          border: '1px solid '
            + (showReSites ? 'var(--accent-500, #b85c3e)' : 'var(--border-subtle)'),
          borderRadius: 6, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <Icon name="restriction" size={14} /> {showReSites ? 'Видны' : 'Скрыты'}
      </button>
      {open && (
        <div
          data-testid="skeleton-restriction-header-popover"
          onMouseLeave={() => setOpen(false)}
          style={{
            position: 'absolute', top: '100%', right: 0,
            marginTop: 4, zIndex: 50,
            minWidth: 240,
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(28,25,23,0.14)',
            padding: 0, overflow: 'hidden',
          }}
        >
          <RestrictionPanel />
        </div>
      )}
    </div>
  );
}

