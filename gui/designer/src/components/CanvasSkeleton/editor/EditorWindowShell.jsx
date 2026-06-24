/**
 * EditorWindowShell — multi-tab window chrome for the container editor.
 *
 * F1 M-CANVAS-WINDOW (DEC-CANVAS-WIN-01..09). Replaces the old
 * `EditorOverlay → <ContainerEditorSkeleton/>` thin wrapper. Owns the
 * window-level header (back + tab strip + active-container title +
 * Apply/Discard/SaveAsFork) and mounts ONE ContainerEditorSkeleton for
 * the active tab (`key={activeTabId}` — other tabs unmount, their edits
 * persist in `pendingEditsByContainer`).
 *
 * Header trim (DEC-WIN-09): the per-tab body keeps the frozen banner +
 * the size/topology subtitle; the redundant per-editor back button +
 * rename + apply/discard/fork live here, at the window level, so there
 * are not two competing headers once a tab strip exists.
 *
 * MiniProjectCanvas + TAB hotkey are wired in K4 / K5.
 */
import { useCallback } from 'react';
import { STRINGS } from '../../../lib/strings';
import {
  useSkeletonState,
  useSkeletonActions,
  useSkeletonHistory,
  useContainerById,
  usePendingEdits,
} from '../store/skeleton-context';
import { deriveActiveContainerId, deriveActiveTab } from '../store/skeleton-state-editor';
import { hasPendingEdits } from './adapt-container-to-item';
import InlineEditableTitle from '../../Library/inspector/InlineEditableTitle';
import EditorTabStrip from './EditorTabStrip';
import ContainerEditorSkeleton from './ContainerEditorSkeleton';
import PcrModeShell from './operation-modes/PcrModeShell';
import AssemblyModeShell from './assembly-mode/AssemblyModeShell';
import MiniProjectCanvas from '../canvas/MiniProjectCanvas';
import useTabHotkey from './useTabHotkey';
import useUndoHotkey from './useUndoHotkey';

export default function EditorWindowShell() {
  const s = STRINGS.canvasSkeleton || {};
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const history = useSkeletonHistory();

  const { tabs, activeTabId } = state.editorContext;
  const activeTab = deriveActiveTab(state.editorContext);
  const isOpTab = activeTab?.kind === 'operation';
  const isAssemblyTab = activeTab?.kind === 'assembly';
  const activeOp = isOpTab
    ? state.operations.find((o) => o.id === activeTab.operationId) || null
    : null;
  const activeContainerId = deriveActiveContainerId(state.editorContext);
  const activeContainer = useContainerById(activeContainerId);
  const pending = usePendingEdits(activeContainerId);
  const hasPending = hasPendingEdits(pending);

  const isPlaceholder = !!activeContainer
    && (activeContainer.sequence == null || activeContainer.sequence === '');
  const frozen = !!(activeContainer && activeContainer.frozen);

  const onBack = useCallback(() => {
    actions.closeEditor();
  }, [actions]);

  const onSwitch = useCallback((tabId) => {
    actions.switchEditorTab(tabId);
  }, [actions]);

  const onCloseTab = useCallback((tabId) => {
    actions.closeEditorTab(tabId);
  }, [actions]);

  const onRename = useCallback((newName) => {
    if (!activeContainerId) return;
    actions.setContainerName(activeContainerId, newName);
  }, [activeContainerId, actions]);

  const onApply = useCallback(() => {
    if (!activeContainerId || !hasPending) return;
    actions.commitPendingEdits(activeContainerId);
  }, [activeContainerId, hasPending, actions]);

  const onDiscard = useCallback(() => {
    if (!activeContainerId || !hasPending) return;
    actions.discardPendingEdits(activeContainerId);
  }, [activeContainerId, hasPending, actions]);

  const onSaveAsFork = useCallback(() => {
    if (!activeContainerId || !activeContainer) return;
    const suggested = `${activeContainer.name || 'fork'} (fork)`;
    let newName = suggested;
    try {
      const entered = typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('Имя нового контейнера (форк):', suggested)
        : suggested;
      if (entered === null) return; // cancelled
      if (typeof entered === 'string' && entered.trim().length > 0) {
        newName = entered.trim();
      }
    } catch { /* prompt unavailable */ }
    actions.opForkContainer(activeContainerId, newName, { applyPendingEdits: true });
    // Close the frozen container's tab (last-tab-close → editor closes).
    if (activeTabId) actions.closeEditorTab(activeTabId);
  }, [activeContainerId, activeContainer, activeTabId, actions]);

  // DEC-WIN-07 — TAB / Shift+TAB switches tabs (gated; editor-only by
  // virtue of the shell mounting only while the editor is open).
  useTabHotkey({ onNext: actions.switchNextTab, onPrev: actions.switchPrevTab });

  // Ctrl+Z / Ctrl+Y → the canvas history engine (previously toolbar-only).
  useUndoHotkey({ onUndo: actions.undo, onRedo: actions.redo, canUndo: history.canUndo, canRedo: history.canRedo });

  // Transient state guard (DEC-WIN — EditorWindowShell §5).
  if (!Array.isArray(tabs) || tabs.length === 0) return null;

  return (
    <div
      data-testid="editor-window-shell"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
      }}
    >
      <header
        data-testid="skeleton-editor-header"
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 0,
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
          flexShrink: 0,
          minHeight: 36,
        }}
      >
        <button
          type="button"
          data-testid="skeleton-editor-back"
          onClick={onBack}
          title={s.backToCanvas || '← Назад'}
          style={{
            fontSize: 12,
            padding: '4px 12px',
            background: 'transparent',
            border: 'none',
            borderRight: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            flexShrink: 0,
          }}
        >{s.backToCanvas || '← Назад'}</button>

        <EditorTabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          containers={state.containers}
          operations={state.operations}
          assemblyDrafts={state.assemblyDrafts}
          /* V90 — pass zones+pieces so an assembly tab opened on a
             zone id resolves to the zone's name (was «(пустой)»). */
          zones={state.zones}
          pieces={state.pieces}
          onSwitch={onSwitch}
          onClose={onCloseTab}
        />

        {activeContainer && (
          <div
            data-testid="skeleton-editor-title-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 12px',
              flexShrink: 0,
              maxWidth: 320,
              minWidth: 0,
            }}
          >
            <InlineEditableTitle
              value={activeContainer.name}
              onCommit={onRename}
              placeholder={s.editorTitle || 'Контейнер'}
            />
          </div>
        )}

        {activeContainer && !isPlaceholder && !frozen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 }}>
            <button
              type="button"
              data-testid="skeleton-editor-apply"
              onClick={onApply}
              disabled={!hasPending}
              title="Применить изменения (Ctrl+S)"
              style={{
                fontSize: 11.5,
                padding: '5px 12px',
                background: hasPending ? 'var(--accent-500, #d97706)' : 'transparent',
                color: hasPending ? '#fff' : 'var(--text-tertiary)',
                border: '1px solid ' + (hasPending ? 'var(--accent-500, #d97706)' : 'var(--border-subtle)'),
                borderRadius: 4,
                cursor: hasPending ? 'pointer' : 'not-allowed',
                fontWeight: 500,
              }}
            >✓ Применить</button>
            <button
              type="button"
              data-testid="skeleton-editor-discard"
              onClick={onDiscard}
              disabled={!hasPending}
              title="Отменить незаписанные изменения"
              style={{
                fontSize: 11.5,
                padding: '5px 12px',
                background: 'transparent',
                color: hasPending ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 4,
                cursor: hasPending ? 'pointer' : 'not-allowed',
              }}
            >↶ Отменить</button>
          </div>
        )}
        {activeContainer && !isPlaceholder && frozen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 }}>
            <button
              type="button"
              data-testid="skeleton-editor-save-as-fork"
              onClick={onSaveAsFork}
              title="Создать форк контейнера (новый id, без блокировки)"
              style={{
                fontSize: 11.5,
                padding: '5px 12px',
                background: 'var(--accent-500, #d97706)',
                color: '#fff',
                border: '1px solid var(--accent-500, #d97706)',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >⑂ Save As fork</button>
          </div>
        )}
      </header>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {isAssemblyTab ? (
          <AssemblyModeShell key={activeTabId} draftId={activeTab.assemblyDraftId} />
        ) : isOpTab ? (
          activeOp && activeOp.kind === 'pcr' ? (
            <PcrModeShell key={activeTabId} op={activeOp} />
          ) : (
            <div
              data-testid="unsupported-op-mode"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
            >
              {activeOp ? `Режим операции «${activeOp.kind}» — следующий sprint` : 'Операция не найдена'}
            </div>
          )
        ) : (
          <ContainerEditorSkeleton key={activeTabId} />
        )}
        <MiniProjectCanvas />
      </div>
    </div>
  );
}
