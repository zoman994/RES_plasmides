/**
 * LibraryWorkspace — Sprint M-X.7a v2 K4 (replaces deprecated
 * Library/index.jsx Importer fullscreen surface per DEC-IMP-06 ⚓).
 *
 * Layout per Library.html:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ LibraryTopBar (breadcrumb · search · 🔔 · user avatar)       │
 *   ├────────────────┬────────────────────────────────────────┬────┤
 *   │ LibraryTreeRoot│ LibrarySingleInspector                 │... │
 *   │ (312px)        │   (existing; body NOT touched)         │    │
 *   │                │ ─────────────────────────────────────  │    │
 *   │                │ LibraryActionRow (per-zone variants)   │    │
 *   └────────────────┴────────────────────────────────────────┴────┘
 *
 * Selection state owned here — `selectedId` is the current entry,
 * `query` is the global search filter (DEC-MX7A-V2-11: shared
 * source of truth between topbar input and tree-head input).
 *
 * Inspector state shape (`flags`/`edits`/`activeTab`) is per-entry
 * scratch space — stored in a Map keyed by entry id so switching
 * between entries preserves the open tab + draft edits.
 *
 * Empty state (no library entries) renders a big `+ Добавить` CTA
 * + the existing OnboardingNudge (M-X.5 K5; rendered conditionally
 * on its own dismissed flag).
 */
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { classifyEntryZone } from '../../lib/library-zones';
import LibraryTopBar from './LibraryTopBar';
import LibraryTreeRoot from './tree/LibraryTreeRoot';
import LibrarySingleInspector from './inspector/LibrarySingleInspector';
import LibraryActionRow from './inspector/LibraryActionRow';
import OnboardingNudge from './onboarding/OnboardingNudge';

function emptyEntryState() {
  return { flags: {}, edits: {}, activeTab: 'overview' };
}

export default function LibraryWorkspace({ onAddClick }) {
  const ws = STRINGS.libraryWorkspace || {};
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [perEntryState, setPerEntryState] = useState({});

  const entriesById = useStore((s) => s.libraryEntries);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const totalEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete).length,
    [entriesById],
  );

  // Wire concrete handlers for the action-row context. Each is a
  // thin adapter over the librarySlice action; missing callbacks
  // (showInDag, openContainerWindow, etc.) become no-ops in K4 and
  // wire to the canvas/dag slices in follow-up sprints.
  const cloneEntryToActiveProject = useStore((s) => s.cloneEntryToActiveProject);
  const extractEntryToLoose = useStore((s) => s.extractEntryToLoose);
  const toggleLabStock = useStore((s) => s.toggleLabStock);
  const moveEntryToFolder = useStore((s) => s.moveEntryToFolder);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

  const item = selectedId ? entriesById[selectedId] : null;
  const zone = item ? classifyEntryZone(item, { activeProjectId: currentProjectId }) : null;
  const entryState = perEntryState[selectedId] || emptyEntryState();

  const onSelectEntry = useCallback((entry) => {
    if (!entry?.id) return;
    setSelectedId(entry.id);
    setPerEntryState((prev) => prev[entry.id] ? prev : { ...prev, [entry.id]: emptyEntryState() });
  }, []);
  const onActiveTabChange = useCallback((tab) => {
    if (!selectedId) return;
    setPerEntryState((prev) => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] || emptyEntryState()), activeTab: tab },
    }));
  }, [selectedId]);
  const onUpdateEdits = useCallback((patch) => {
    if (!selectedId || !patch) return;
    setPerEntryState((prev) => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] || emptyEntryState()),
        edits: { ...(prev[selectedId]?.edits || {}), ...patch },
      },
    }));
  }, [selectedId]);
  const onUpdateFlags = useCallback((patch) => {
    if (!selectedId || !patch) return;
    setPerEntryState((prev) => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] || emptyEntryState()),
        flags: { ...(prev[selectedId]?.flags || {}), ...patch },
      },
    }));
  }, [selectedId]);
  const noop = useCallback(() => {}, []);

  const actionCtx = useMemo(() => ({
    hasActiveProject: !!currentProjectId,
    cloneEntryToActiveProject,
    extractEntryToLoose,
    toggleLabStock,
    openContainerWindow: noop,
    createManualEditBranch: noop,
    openFolderPicker: (id) => moveEntryToFolder(id, ''),
    exportEntry: noop,
    deleteEntry: noop,
    editPrimer: noop,
    editPrimerNotes: noop,
    showInDag: () => setActiveWorkspace('flow', { projectId: currentProjectId }),
    cloneEntry: noop,
    copyToLoose: noop,
    usePrimerInDag: noop,
  }), [
    currentProjectId, cloneEntryToActiveProject, extractEntryToLoose,
    toggleLabStock, moveEntryToFolder, setActiveWorkspace, noop,
  ]);

  return (
    <div
      data-testid="library-workspace"
      style={{
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: '1fr',
        height: '100%',
        minHeight: 0,
        background: 'var(--surface-1)',
      }}
    >
      <LibraryTopBar query={query} onQueryChange={setQuery} />

      <div
        data-testid="library-workspace-body"
        style={{
          display: 'grid',
          gridTemplateColumns: '312px 1fr',
          minHeight: 0,
          height: '100%',
        }}
      >
        <LibraryTreeRoot
          query={query}
          onQueryChange={setQuery}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
          onAddClick={onAddClick}
        />
        <main
          data-testid="library-workspace-inspector"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            minWidth: 0,
            background: 'var(--surface-1)',
          }}
        >
          {item ? (
            <>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <LibrarySingleInspector
                  item={item}
                  flags={entryState.flags}
                  edits={entryState.edits}
                  activeTab={entryState.activeTab}
                  onActiveTabChange={onActiveTabChange}
                  onUpdateFlags={onUpdateFlags}
                  onUpdateEdits={onUpdateEdits}
                  onAppendAdded={noop}
                  onRenameItem={noop}
                  onRunAutoAnnotate={noop}
                />
              </div>
              <LibraryActionRow entry={item} zone={zone} ctx={actionCtx} />
            </>
          ) : totalEntries === 0 ? (
            <EmptyState onAddClick={onAddClick} />
          ) : (
            <NoSelection />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyState({ onAddClick }) {
  const ws = STRINGS.libraryWorkspace || {};
  return (
    <div
      data-testid="library-workspace-empty"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 16,
        color: 'var(--text-secondary)',
      }}
    >
      <button
        type="button"
        data-testid="library-workspace-empty-add"
        onClick={() => onAddClick?.()}
        style={{
          fontSize: 14,
          padding: '12px 24px',
          background: 'var(--accent-500)',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >{ws.addBtn || '+ Добавить'}</button>
      <OnboardingNudge />
    </div>
  );
}

function NoSelection() {
  return (
    <div
      data-testid="library-workspace-no-selection"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        color: 'var(--text-tertiary)',
        fontSize: 13,
      }}
    >Выберите запись в дереве слева</div>
  );
}
