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
import { memo, useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import {
  isDnaQuery, hasIupacAmbiguity, searchLibrary, identityBucket,
} from '../../lib/sequence-search';

export const LibraryTopBar = memo(function LibraryTopBar({
  query = '',
  onQueryChange,
  // M-X.9 K3 — global DNA search hit picker. Caller wires this
  // to its selection state + project activation.
  onPickGlobalHit,
}) {
  const ws = STRINGS.libraryWorkspace || {};
  const tb = STRINGS.topbar || {};
  const currentProjectId = useStore((s) => s.currentProjectId);
  const projects = useStore((s) => s.projects);
  const pushFullscreen = useStore((s) => s.pushFullscreen);
  const activeProject = currentProjectId ? projects?.[currentProjectId] : null;
  const projectLabel = activeProject?.name || currentProjectId;
  const cs = STRINGS.canvasSkeleton || {};

  // M-X.9 K3 — global DNA search across container entries.
  // Per DEC-SEARCH-SNAPGENE-EXCLUDED-01: only entries with
  // `kind === 'container'` from the user library; SnapGene catalog
  // is excluded (it lives elsewhere).
  const entriesById = useStore((s) => s.libraryEntries);
  const containerEntries = useMemo(() => {
    return Object.values(entriesById || {}).filter((e) =>
      e && !e._pendingDelete
      && (e.kind === 'container' || !e.kind)
      && (e.payload?.sequence || e.sequence),
    );
  }, [entriesById]);

  const trimmed = (query || '').trim().toUpperCase();
  const isDna = isDnaQuery(trimmed);
  const ambiguous = hasIupacAmbiguity(trimmed);
  const [resultsOpen, setResultsOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setResultsOpen(isDna);
  }, [isDna]);
  useEffect(() => {
    if (!resultsOpen) return undefined;
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setResultsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [resultsOpen]);

  const globalHits = useMemo(() => {
    if (!isDna || ambiguous) return [];
    const q = trimmed;
    const list = [];
    for (const e of containerEntries) {
      const seq = (e.payload?.sequence || e.sequence || '');
      if (!seq) continue;
      const hits = searchLibrary(q, [{ id: e.id, sequence: seq }], { identityThreshold: 0.8 });
      for (const h of hits) {
        list.push({ ...h, entryName: e.name || e.id });
      }
    }
    // Sort by identity desc, then by length desc, cap at 50.
    list.sort((a, b) => (b.identity - a.identity) || (b.length - a.length));
    return list.slice(0, 50);
  }, [isDna, ambiguous, trimmed, containerEntries]);

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
            <span aria-hidden>📦</span>
            <span>{projectLabel}</span>
          </span>
        ) : (
          <span
            data-testid="library-topbar-no-project"
            style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
          >{tb.noActiveProject || 'Без активного проекта'}</span>
        )}
      </nav>

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
        <span aria-hidden>📂</span>
        <span>{cs.openProjectLabel || 'Открыть проект'}</span>
      </button>

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

      <div
        ref={wrapRef}
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
          onFocus={() => { if (isDna) setResultsOpen(true); }}
          placeholder={ws.searchPlaceholder || 'Поиск по библиотеке…'}
          style={{
            width: '100%', height: 28, padding: '0 8px 0 26px',
            fontSize: 12, lineHeight: '28px',
            background: 'var(--surface-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            outline: 'none',
            fontFamily: isDna ? 'var(--font-mono, monospace)' : undefined,
            textTransform: isDna ? 'uppercase' : undefined,
          }}
        />
        {isDna && resultsOpen && (
          <div
            data-testid="library-topbar-dna-results"
            style={{
              position: 'absolute', top: 32, left: 0, right: 0,
              background: 'var(--surface-1)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
              maxHeight: 320, overflowY: 'auto',
              zIndex: 90,
              minWidth: 480,
            }}
          >
            <div
              data-testid="library-topbar-dna-results-header"
              style={{
                padding: '6px 10px', fontSize: 10.5,
                color: 'var(--text-tertiary)',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border-subtle)',
                textTransform: 'uppercase', letterSpacing: 0.5,
                fontWeight: 600,
              }}
            >Поиск ПСО · {ambiguous ? 'IUPAC не поддерживается' : `${globalHits.length} hit(s)`}</div>
            {ambiguous && (
              <div style={{ padding: 10, fontSize: 11, color: '#92400e' }}>
                IUPAC degenerate codes пока не поддерживаются — используй plain ACGT.
              </div>
            )}
            {!ambiguous && globalHits.length === 0 && (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
                Ничего не найдено при identity ≥ 80%.
              </div>
            )}
            {globalHits.map((h) => {
              // FAIL-fix-pass 6 — bucket on per-query identity,
              // mandatory coverage column `query[X..Y) · M/N nt`,
              // tooltip surfaces secondary hit-identity.
              const bucket = identityBucket(h.queryIdentity);
              const color = bucket === 'high' ? 'var(--success-fg, #16a34a)'
                : bucket === 'mid' ? '#d97706'
                : bucket === 'orange' ? '#ea580c'
                : 'var(--text-tertiary)';
              const queryPct = (h.queryIdentity * 100).toFixed(1);
              // Фикс 7 — coverage prefix only when partial overhang.
              const isPartial = h.queryStart > 0
                || h.queryEnd < (h.matches + h.mismatches + (h.gapsInQuery || 0));
              const coverageText = isPartial
                ? `query[${h.queryStart}..${h.queryEnd}) · ${h.matches}/${h.length} nt`
                : `${h.matches}/${h.length} nt`;
              const tip = (h.gapsInQuery || h.gapsInTarget)
                ? `${(h.gapsInQuery || 0) + (h.gapsInTarget || 0)} indel(s) · ${h.length} nt window`
                : `${h.length} nt window`;
              return (
                <button
                  key={`${h.entryId}-${h.strand}-${h.targetStart}`}
                  type="button"
                  data-testid={`library-topbar-dna-hit-${h.entryId}-${h.targetStart}`}
                  title={tip}
                  onClick={() => {
                    onPickGlobalHit?.(h.entryId, h);
                    setResultsOpen(false);
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: 'transparent', border: 'none',
                    padding: '6px 10px',
                    fontSize: 11.5,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    flex: '0 0 140px', color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{h.entryName}</span>
                  <span style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: 10, color: 'var(--text-secondary)', minWidth: 80,
                  }}>{h.targetStart + 1}–{h.targetEnd} {h.strand === -1 ? '(−)' : ''}</span>
                  <span style={{ color, fontWeight: 500, minWidth: 50 }}>
                    {queryPct}%
                  </span>
                  <span
                    data-testid={`library-topbar-dna-hit-${h.entryId}-${h.targetStart}-coverage`}
                    style={{ color: 'var(--text-tertiary)', fontSize: 10, minWidth: 150 }}
                  >{coverageText}</span>
                  {h.threePrimeOk === false && (
                    <span title="3'-end mismatch" style={{
                      fontSize: 10, padding: '0 5px', borderRadius: 9,
                      background: '#fef3c7', color: '#92400e',
                      border: '1px solid var(--border-subtle)',
                    }}>⚠ 3′</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
          }}
          title="Last save state"
        >✓ сохранён</span>
      )}

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
