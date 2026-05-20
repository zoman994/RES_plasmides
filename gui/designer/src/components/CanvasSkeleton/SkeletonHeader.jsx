/**
 * SkeletonHeader — top header с «← Назад» + Layout/Graph toggle.
 *
 * «← Назад» — popFullscreen() возвращает к предыдущему route (как и в
 * prototype). Layout/Graph toggle — переключает state.view, sub-views
 * pure derived от state.
 */
import { useCallback } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { useSkeletonState, useSkeletonActions } from './store/skeleton-context';

export default function SkeletonHeader() {
  const s = STRINGS.canvasSkeleton || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const popFullscreen = useStore((st) => st.popFullscreen);
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

      <span
        data-testid="skeleton-header-title"
        style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: 0.2 }}
      >
        {headerTitle}
      </span>

      <div
        data-testid="skeleton-view-toggle"
        role="tablist"
        style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 0,
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <ToggleBtn
          testId="skeleton-view-toggle-layout"
          active={state.view === 'layout'}
          onClick={() => actions.setView('layout')}
        >{s.viewLayout || 'Layout'}</ToggleBtn>
        <ToggleBtn
          testId="skeleton-view-toggle-graph"
          active={state.view === 'graph'}
          onClick={() => actions.setView('graph')}
        >{s.viewGraph || 'Graph'}</ToggleBtn>
      </div>
    </header>
  );
}

function ToggleBtn({ testId, active, onClick, children }) {
  return (
    <button
      type="button"
      data-testid={testId}
      role="tab"
      aria-selected={active ? 'true' : 'false'}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: '5px 14px',
        background: active ? 'var(--accent-500)' : 'var(--surface-1)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: 'none',
        cursor: 'pointer',
        fontWeight: active ? 500 : 400,
      }}
    >{children}</button>
  );
}
