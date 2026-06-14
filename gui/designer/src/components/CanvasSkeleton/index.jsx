/**
 * CanvasSkeleton — оркестратор всей UI-парадигмы Canvas-модели.
 *
 * DEC-SKELETON-01: изолированный DEV route /canvas-skeleton (overlay
 * через App.jsx canvas-skeleton case). Local state через
 * SkeletonProvider (useReducer + Context). Никакого касания global
 * Zustand кроме popFullscreen для «← Назад».
 *
 * Composition:
 *   SkeletonHeader (← Назад + Layout/Graph toggle)
 *   ┌──────────────┬─────────────────────────────────┐
 *   │ LibraryTree  │ CanvasLayoutView / CanvasGraph  │
 *   │ Host         │                                 │
 *   │ (производная │                                 │
 *   │  Library     │                                 │
 *   │  tree)       │                                 │
 *   └──────────────┴─────────────────────────────────┘
 *   + ContainerEditorSkeleton (overlay при state.editorOpen) —
 *     Canvas V2 Editor Full: TabBar + LinearFeatureBar +
 *     OverviewTab / SequenceTab / AnnotationsTab + FeatureEditorModal
 *     + InlineEditableTitle + apply/discard для pendingEditsByContainer.
 *     Operations toolbar / pills / draft tabs выпилены (operations
 *     переезжают на canvas, отдельный sprint).
 *   + Toast (success после commit-pending / mock-commit / etc.)
 *
 * Left tree (12.05.2026 — Игорь): bespoke SkeletonTree (3 sections)
 * выпилен в пользу production LibraryTreeRoot через LibraryTreeHost.
 * Все feature функционала Library — search, Loose zone, pinned,
 * Trash, drag-and-drop, AddModal, etc. — теперь работают в skeleton
 * без дублирования кода.
 *
 * Снос скелета = удаление этой папки + строки import в App.jsx + case
 * 'canvasSkeleton' + entry в FULLSCREENS + кнопка в Sidebar +
 * namespace canvasSkeleton в strings.js.
 */
import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { SkeletonProvider, useSkeletonState, useSkeletonActions } from './store/skeleton-context';
import SkeletonHeader from './SkeletonHeader';
import ProjectAssemblyWorkspace from './workspace/ProjectAssemblyWorkspace';
import EditorWindowShell from './editor/EditorWindowShell';
import LineagePanel from './LineagePanel';
import CodonStatsPanel from './CodonStatsPanel';
// B2 (audit) — re-mounted: the documented «Протокол» + «Заказ олигов» exports
// were built + tested but had no entry point (PC-K5 removed the mounts).
import ProtocolPanel from './ProtocolPanel';
import PrimerOrderPanel from './PrimerOrderPanel';
// Wave-4 orphan cleanup (audit C4/C6/C7): the dead OpKindPicker + OpSuggestions
// mounts and the never-rendered CanvasGraphView import were removed. CanvasLayoutView
// + AssemblyDraftsPanel + OpKindPicker files stay (still test-only harnesses) but
// no longer leak into the production index.
// PC-K1: LibraryTreeHost mount removed (top search bar will replace
// it — PC-K2). PC-K5: ProtocolPanel + PrimerOrderPanel mounts removed
// (non-functional UI noise per spec §4.4). The source files remain in
// the repo as orphans for possible future re-use.

export default function CanvasSkeleton() {
  return (
    <SkeletonProvider>
      <SkeletonInner />
    </SkeletonProvider>
  );
}

function SkeletonInner() {
  return (
    <div
      data-testid="canvas-skeleton"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--surface-1)',
        color: 'var(--text-primary)',
      }}
    >
      <SkeletonHeader />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        <CanvasArea />
      </div>

      <EditorOverlay />
      <ToastBridge />
      <DeleteKeyHandler />
    </div>
  );
}

/**
 * DeleteKeyHandler — global Del/Backspace + Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z.
 *
 * S1 (14.05.2026): добавлен Undo/Redo listener (Ctrl+Z = undo;
 * Ctrl+Y или Ctrl+Shift+Z = redo). Гарды по input target те же что у Del.
 */
function DeleteKeyHandler() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  useEffect(() => {
    function isEditableTarget(t) {
      if (!t || !t.tagName) return false;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e) {
      // Audit FIX-3: skip skeleton undo when editor is open — editor
      // has its own annotation undo (useAnnotationUndoRedo). Two
      // Ctrl+Z listeners would double-fire.
      if ((e.ctrlKey || e.metaKey) && !isEditableTarget(e.target) && !state.editorOpen) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          actions.undo();
          return;
        }
        if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault();
          actions.redo();
          return;
        }
      }
      // Del / Backspace.
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (state.editorOpen) return;
      if (!state.highlightedContainerId) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      actions.removeContainer(state.highlightedContainerId);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.editorOpen, state.highlightedContainerId, actions]);
  return null;
}

function CanvasArea() {
  const actions = useSkeletonActions();
  const areaRef = useRef(null);

  return (
    <div
      ref={areaRef}
      data-testid="skeleton-canvas-area"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      {/* M-WORKSPACE — two-level assembly-tab workspace replaces the floating
          ZoneFrame canvas (CanvasLayoutView/CanvasGraphView retired from the
          project view; container/op editing stays as the EditorOverlay below). */}
      <ProjectAssemblyWorkspace />
      {/* AE-K9 (SPEC_ASSEMBLY_EDITOR_CLEANUP §7.1): standalone «+
          Операция» button удалён. Operations create only inside the
          assembly editor via 🔗 Сшить → OpGroupPicker. Mental model:
          op принадлежит zone (T-series four-tier), не существует
          stand-alone на canvas. The OpKindPicker code path remains for
          legacy ops migration paths but is no longer reachable from
          the floating toolbar. */}
      {/* «+ Сборка» (Игорь 18-19.05.2026 — унификация «Только зона» +
          regression-fix): создаёт ЗОНУ (four-tier, DEC-CANVAS-4T-07)
          И СРАЗУ открывает её редактор сборки (AssemblyShellBody —
          цветные сегменты + drag-insert фрагментов). Без open-шага
          окно сборки было недостижимо. Тот же путь — «+ Новая сборка»
          в AssemblyDraftsPanel. */}
      {/* Очистить канвас — destructive, gated confirm (Игорь
          17.05.2026). RESET → пустой buildInitialState. Ghost-стиль,
          ниже по визуальному весу чем +действия; bottom:152 — следующий
          слот стека (Операция 20 / Сборка 64 / Сборки 108). */}
      <button
        type="button"
        data-testid="skeleton-clear-canvas"
        onClick={() => {
          const ok = typeof window !== 'undefined' && window.confirm
            ? window.confirm('Очистить канвас? Все контейнеры, сборки, операции, зоны и позиции будут удалены безвозвратно.')
            : false;
          if (ok) actions.reset();
        }}
        title="Очистить канвас от всего"
        style={{
          position: 'absolute',
          bottom: 152,
          right: 24,
          zIndex: 30,
          padding: '7px 14px',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: '1px solid var(--border-default, #d6d3d1)',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent-500, #b85c3e)';
          e.currentTarget.style.borderColor = 'var(--accent-500, #b85c3e)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-tertiary)';
          e.currentTarget.style.borderColor = 'var(--border-default, #d6d3d1)';
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>🗑</span>
        <span>Очистить</span>
      </button>
      <LineagePanel />
      <CodonStatsPanel />
      {/* B2 — protocol + oligo-order exports (bottom-right action stack). */}
      <ProtocolPanel />
      <PrimerOrderPanel />
    </div>
  );
}

function EditorOverlay() {
  const state = useSkeletonState();
  if (!state.editorOpen) return null;
  return <EditorWindowShell />;
}

// ToastBridge — bridges skeleton-state toast queue to global Toast
// stack via showToast. R12-2 (15.05.2026): теперь iterates через
// `state.toasts` array — multiple back-to-back ops emit отдельные
// toasts, biolog видит все.
function ToastBridge() {
  const state = useSkeletonState();
  const actions = useSkeletonActions();
  const showToast = useStore((st) => st.showToast);

  useEffect(() => {
    const queue = state.toasts || [];
    if (queue.length === 0) return;
    for (const t of queue) {
      try {
        showToast?.(t.message, t.kind || 'info');
      } catch { /* swallow — toast is best-effort */ }
    }
    actions.clearToast(); // drains queue + nulls toast
  }, [state.toasts, showToast, actions]);

  return null;
}
