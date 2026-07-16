/**
 * LibraryTopBar — Sprint M-X.8 K5 (DEC-UIRREV-BREADCRUMB-STATIC).
 *
 * Static breadcrumb «BodgeGene › 📦 <name>» (or «Без активного
 * проекта» when none). The K7 click-dropdown from M-X.7c is sunset
 * — project switching now lives in the sidebar PINNED section + the
 * Command Palette (⌘P).
 *
 * `✓ сохранён` pill is moved out of the breadcrumb into the
 * right-side system tray (right of the search field, left of the
 * bell). Cleaner separation of crumb (identity) vs status.
 */
import { memo } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { FEATURE_FLAGS } from '../../lib/feature-flags';
import { Icon } from '../icons/Icon';
import LibrarySmartSearchBar from './LibrarySmartSearchBar';

export const LibraryTopBar = memo(function LibraryTopBar({
  // REV#2 Stage 3 K4.2b∪K5 — the structured `globalSearch` controller (useSearchQueryState),
  // owned by LibraryWorkspace. The bar renders its selector / chips / draft and runs the facade
  // on its canonical query; it never keeps a copy of the mode / filters.
  search,
  // Kind-aware pick (REV #2 §10.4/§10.5): the caller receives (entityRef, occurrence) and
  // routes by entityRef.kind — molecule / project / primer / enzyme card. The dropdown
  // stays dumb: it never assumes an entry nor rewrites the query.
  onPickSearchResult,
  // «Полный поиск» escalation from the tree quick-filter — bumping this tick focuses this
  // wide bar and opens its dropdown (LibraryWorkspace already SEEDED the global state).
  autoFocusSearchTick = 0,
  // Sequence-worker factory (`() => Worker|null`). Default spawns the real off-thread
  // worker; tests inject a controllable factory to drive cancel / crash / lifecycle.
  workerFactory,
}) {
  const tb = STRINGS.topbar || {};
  const currentProjectId = useStore((s) => s.currentProjectId);
  const projects = useStore((s) => s.projects);
  const pushFullscreen = useStore((s) => s.pushFullscreen);
  const activeProject = currentProjectId ? projects?.[currentProjectId] : null;
  const projectLabel = activeProject?.name || currentProjectId;
  const cs = STRINGS.canvasSkeleton || {};

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
          <span
            data-testid="library-topbar-project-name"
            style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 4,
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            <Icon name="folder" size={13} style={{ alignSelf: 'center' }} />
            <span>{projectLabel}</span>
          </span>
        ) : (
          <span
            data-testid="library-topbar-no-project"
            style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
          >{tb.noActiveProject || 'Без активного проекта'}</span>
        )}
      </nav>

      {/* «Открыть проект» — дубль: при двухуровневом рельсе (FEATURE_FLAGS.twoLevelRail)
          активный проект + его сборки всегда в сайдбаре, клик по сборке/«Создать
          сборку» открывает тот же канвас. Показываем только при выключенном рельсе
          (нет проектной секции в сайдбаре). Откат: twoLevelRail=false. */}
      {!FEATURE_FLAGS.twoLevelRail && (
        <button
          type="button"
          data-testid="library-topbar-open-project"
          onClick={() => pushFullscreen?.({ fullscreen: 'canvasSkeleton', payload: null })}
          title={cs.openProjectTip || 'Открыть канвас активного проекта'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: 'var(--accent-500, #b85c3e)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <Icon name="folder" size={14} />
          <span>{cs.openProjectLabel || 'Открыть проект'}</span>
        </button>
      )}

      {/*
        * Undo / Redo — synthetic keyboard events that mimic a real
        * Ctrl+Z / Ctrl+Y press. Two delivery paths:
        *   1. If focus is inside a text input / textarea / contentEditable,
        *      try `document.execCommand('undo'|'redo')` first — that's
        *      the only way to drive the BROWSER'S native input undo.
        *   2. Always dispatch a synthetic keydown afterwards so any
        *      JS-level handler that listens for Ctrl+Z (e.g. annotation
        *      editor's `useAnnotationUndoRedo`) also runs.
        * Browser security blocks JS-synthesized keydown from triggering
        * native input undo; that's why path #1 must run first.
        */}
      <UndoRedoButtons />

      <LibrarySmartSearchBar
        search={search}
        onPickSearchResult={onPickSearchResult}
        autoFocusSearchTick={autoFocusSearchTick}
        workerFactory={workerFactory}
      />

      {/* M-X.8 K5: «✓ сохранён» pill moved out of breadcrumb into
          the right-side tray (separation of identity vs status). */}
      {currentProjectId && (
        <span
          data-testid="library-topbar-saved-pill"
          style={{
            fontSize: 10.5,
            padding: '1px 6px',
            borderRadius: 9,
            background: 'var(--success-50, var(--surface-2))',
            color: 'var(--success-fg, var(--text-secondary))',
            border: '1px solid var(--border-subtle)',
            flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
          title="Last save state"
        ><Icon name="check" size={11} />сохранён</span>
      )}

      <button
        type="button"
        data-testid="library-topbar-bell"
        title="Уведомления — в разработке"
        aria-disabled="true"
        disabled
        style={{
          fontSize: 14, padding: '0 8px',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          border: '1px solid transparent',
          borderRadius: 4,
          cursor: 'default',
          opacity: 0.6,
          display: 'inline-flex', alignItems: 'center',
        }}
      ><Icon name="bell" size={14} /></button>

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

/**
 * UndoRedoButtons — two arrow buttons that mimic real Ctrl+Z /
 * Ctrl+Y. See parent for the two-path delivery rationale.
 *
 * Hosted inside LibraryTopBar so undo/redo are always reachable
 * regardless of where focus is. Keyboard hotkeys themselves are
 * NOT registered here — biolog can still hit Ctrl+Z directly and
 * we don't want to fight the browser default.
 */
function UndoRedoButtons() {
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      <UndoButton kind="undo" />
      <UndoButton kind="redo" />
    </div>
  );
}

function dispatchHistoryKey(kind) {
  const target = (typeof document !== 'undefined' && document.activeElement) || null;
  const isTextInput = !!target && (
    target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.isContentEditable === true
  );
  // Path 1: native input undo / redo via execCommand. Deprecated
  // but still implemented in Chrome / Edge / Firefox for text
  // fields — it's the only programmatic way to drive the browser
  // built-in undo stack of a focused input.
  if (isTextInput && typeof document !== 'undefined' && document.execCommand) {
    try {
      const ok = document.execCommand(kind === 'undo' ? 'undo' : 'redo');
      if (ok) return true;
    } catch { /* */ }
  }
  // Path 2: synthetic keydown for JS-level handlers (annotation
  // editor's useAnnotationUndoRedo, any future custom undo stacks).
  if (typeof window === 'undefined' || typeof KeyboardEvent === 'undefined') return false;
  const key = kind === 'undo' ? 'z' : 'y';
  const evt = new KeyboardEvent('keydown', {
    key,
    code: kind === 'undo' ? 'KeyZ' : 'KeyY',
    ctrlKey: true,
    metaKey: false,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  (target || document.body).dispatchEvent(evt);
  return true;
}

function UndoButton({ kind }) {
  const isUndo = kind === 'undo';
  return (
    <button
      type="button"
      data-testid={`library-topbar-${kind}`}
      title={isUndo ? 'Отменить (Ctrl+Z)' : 'Вернуть (Ctrl+Y)'}
      onClick={() => dispatchHistoryKey(kind)}
      style={{
        fontSize: 14, padding: '0 8px',
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >{isUndo ? '↶' : '↷'}</button>
  );
}
