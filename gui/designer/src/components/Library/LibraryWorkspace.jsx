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
import LibraryTopBar from './LibraryTopBar';
import LibraryTreeRoot from './tree/LibraryTreeRoot';
import LibrarySingleInspector from './inspector/LibrarySingleInspector';
import LibraryActionRow from './inspector/LibraryActionRow';
import OnboardingNudge from './onboarding/OnboardingNudge';
import AddModal from './AddModal/AddModal';
import SequenceSearchPopover from '../SequenceSearchPopover';
import { parseFile, extractItemName, ACCEPT_STRING, enrichAnnotations } from '../../file-import';
import { buildLibraryEntry } from './lib/build-library-entry';
import { buildStarterSet } from './lib/starter-set';
import { downloadEntryAsGenbank, downloadProjectAsZip } from '../../lib/export-genbank';

function openFilePicker() {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT_STRING;
    input.multiple = true;
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      try { document.body.removeChild(input); } catch { /* ignore */ }
      resolve(files);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function emptyEntryState() {
  return { flags: {}, edits: {}, activeTab: 'overview' };
}

export default function LibraryWorkspace({ onAddClick: onAddClickExternal }) {
  const ws = STRINGS.libraryWorkspace || {};
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [perEntryState, setPerEntryState] = useState({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const showToast = useStore((s) => s.showToast);

  // K6: +Add button click opens the modal. External `onAddClick`
  // (passed by AppShell wrappers / future LayoutHost) gets a chance
  // to intercept first — when not provided, default to opening the
  // AddModal here.
  const addLibraryEntry = useStore((s) => s.addLibraryEntry);
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const currentProjectId = useStore((s) => s.currentProjectId);

  const onAddClick = useCallback(() => {
    if (onAddClickExternal) onAddClickExternal();
    else setAddModalOpen(true);
  }, [onAddClickExternal]);
  const closeAddModal = useCallback(() => setAddModalOpen(false), []);

  // Import files and add to store. `projectId` = null → LooseZone, id → project zone.
  const importFiles = useCallback(async (files, projectId, opts = {}) => {
    if (!files.length) return;
    let added = 0;
    const errors = [];
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        // «Авто-аннотация» (DEC-IMP-09): enrich with homology / common
        // features unless explicitly turned off. enrichAnnotations returns a
        // copy with an extended `annotations`; at autoAnnotate===false it is
        // skipped so a headerless paste stays feature-less. The flag rides in
        // via `opts` (AddModal checkbox → preset → onLaunchPreImport).
        const item = opts.autoAnnotate === false
          ? parsed
          : await enrichAnnotations(parsed, { autoAnnotate: true });
        // Name: an explicit paste-name override wins; else derive as before
        // (`>name` headers are already honoured by extractItemName).
        const overrideName = opts.nameOverride && opts.nameOverride.trim();
        const name = overrideName ? opts.nameOverride.trim() : extractItemName(item, file);
        const entry = buildLibraryEntry(item, name, null);
        // Topology: explicit override (paste linear/circular toggle) beats the
        // parsed topology (plain-ACGT parseFasta hardcodes 'linear').
        if (opts.topologyOverride && entry.payload) entry.payload.topology = opts.topologyOverride;
        entry.projectId = projectId || null;
        if (projectId) entry.origin = { kind: 'file_import', sourceFileName: file.name, importedAt: new Date().toISOString() };
        await addLibraryEntry(entry);
        added++;
      } catch (e) {
        errors.push(`${file.name}: ${e?.message || e}`);
      }
    }
    if (added > 0) showToast(`Добавлено: ${added} файл(ов)`, 'success');
    if (errors.length > 0) showToast(errors[0], 'error');
  }, [addLibraryEntry, showToast]);

  // Resolve the modal's `target` string to a projectId or null.
  // Accepts: 'loose' → null; 'project:<id>' → that id; legacy
  // 'active' → currentProjectId for back-compat with older UI.
  const resolveTargetProjectId = useCallback((target) => {
    if (typeof target !== 'string') return null;
    if (target === 'loose') return null;
    if (target === 'active') return currentProjectId || null;
    if (target.startsWith('project:')) {
      const id = target.slice('project:'.length);
      return id || null;
    }
    return null;
  }, [currentProjectId]);

  const onLaunchPreImport = useCallback(async (preset) => {
    if (preset?.source === 'file') {
      const files = await openFilePicker();
      const projId = resolveTargetProjectId(preset?.target);
      await importFiles(files, projId, { autoAnnotate: preset?.autoAnnotate !== false });
    } else if (preset?.source === 'paste') {
      // Paste sequence flow: wrap the textarea contents in a synthetic
      // File so the existing parseFile pipeline (GenBank / FASTA /
      // sniffed-on-content) handles it without a separate code path.
      const text = (preset?.text || '').trim();
      if (!text) {
        showToast?.('Вставьте последовательность', 'info');
        return;
      }
      // Pick a likely extension so isGenBankFormat / isFasta can
      // hint the parser; final detection still uses the content.
      const looksLikeGenBank = /^LOCUS\s/i.test(text);
      const filename = looksLikeGenBank ? 'pasted.gb' : 'pasted.fasta';
      const file = new File([text], filename, { type: 'text/plain' });
      const projId = resolveTargetProjectId(preset?.target);
      await importFiles([file], projId, {
        autoAnnotate: preset?.autoAnnotate !== false,
        nameOverride: (preset?.name || '').trim() || undefined,
        topologyOverride: preset?.topology,
      });
    } else {
      showToast?.(`${preset?.source} — в разработке`, 'info');
    }
  }, [importFiles, resolveTargetProjectId, showToast]);

  // Direct "add to Коллекция" — skips AddModal, opens file picker immediately.
  const onAddToLoose = useCallback(async () => {
    const files = await openFilePicker();
    await importFiles(files, null);
  }, [importFiles]);

  // Starter set — adds 4 synthetic reference vectors to Коллекция.
  const onAddStarterSet = useCallback(async () => {
    try {
      const entries = buildStarterSet();
      await addLibraryEntriesBulk(entries);
      showToast?.(`Базовый набор добавлен: ${entries.length} вектора`, 'success');
    } catch (e) {
      showToast?.(e?.message || 'Ошибка', 'error');
    }
  }, [addLibraryEntriesBulk, showToast]);

  // Soft-delete pushes the entry into the Trash zone. The undo toast
  // gives a one-click revert; the entry otherwise lives in Trash
  // until the user explicitly purges it via the TrashZone surface
  // (no auto-commit-on-dismiss — items must survive a tab close).
  const markPendingDelete = useStore((s) => s.markLibraryEntryPendingDelete);
  const unmarkPendingDelete = useStore((s) => s.unmarkLibraryEntryPendingDelete);
  const deleteEntry = useCallback(async (entryId) => {
    const e = useStore.getState().libraryEntries?.[entryId];
    if (!e) return;
    const name = e.name || entryId;
    await markPendingDelete?.(entryId);
    setSelectedId((prev) => (prev === entryId ? null : prev));
    const toastFn = STRINGS.libraryWorkspace?.treeRow?.quickDeleteDoneToast;
    const msg = typeof toastFn === 'function' ? toastFn(name) : `Удалено: ${name} (в Корзине)`;
    showToast?.(msg, 'info', {
      onUndo: () => unmarkPendingDelete?.(entryId),
    });
  }, [markPendingDelete, unmarkPendingDelete, showToast]);

  // Per-entry GenBank export. Reads the live entry from the store so
  // the action picks up the latest payload (no stale closure).
  const exportEntry = useCallback((entryId) => {
    const e = useStore.getState().libraryEntries?.[entryId];
    if (!e) {
      showToast?.('Запись не найдена', 'error');
      return;
    }
    const ok = downloadEntryAsGenbank(e);
    if (ok) showToast?.(`Экспортировано: ${e.name || e.id}.gb`, 'success');
  }, [showToast]);

  // Project-wide export: bundles every entry that belongs to the
  // project (by entry.projectId or project.containerIds) into a
  // single .zip of .gb files.
  const onExportProject = useCallback((projectId) => {
    if (!projectId) return;
    const state = useStore.getState();
    const project = state.projects?.[projectId];
    if (!project) {
      showToast?.('Проект не найден', 'error');
      return;
    }
    const containerIds = new Set(project.containerIds || []);
    const all = Object.values(state.libraryEntries || {});
    const entries = all.filter((e) => e && !e._pendingDelete
      && (e.projectId === projectId || containerIds.has(e.id)));
    if (!entries.length) {
      showToast?.('В проекте нет записей для экспорта', 'info');
      return;
    }
    const written = downloadProjectAsZip(project.name || projectId, entries);
    if (written > 0) showToast?.(`Экспортировано: ${written} файл(ов) в .zip`, 'success');
    else showToast?.('Нет файлов с последовательностью', 'info');
  }, [showToast]);

  const entriesById = useStore((s) => s.libraryEntries);
  const projectsById = useStore((s) => s.projects);
  const totalEntries = useMemo(
    () => Object.values(entriesById || {}).filter((e) => e && !e._pendingDelete).length,
    [entriesById],
  );
  const totalProjects = useMemo(
    () => Object.keys(projectsById || {}).length,
    [projectsById],
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

  const rawEntry = selectedId ? entriesById[selectedId] : null;
  // LibrarySingleInspector + Overview/Sequence/Annotations tabs +
  // PlasmidMiniMap all read FLAT fields off `item` (item.sequence,
  // item.length, item.topology, item.annotations) — that's the
  // legacy shape the existing Inspector body was built for. Library
  // entries store the same data nested under `entry.payload`. Hoist
  // payload onto the item before handing it to the Inspector so
  // every existing reader keeps working without per-component
  // refactor. New code can still read entry.payload via item.payload
  // (the spread preserves the original key).
  const item = rawEntry ? { ...rawEntry, ...(rawEntry.payload || {}) } : null;
  // Action-row variant derives from `entry.projectId` per the
  // 09.05.2026 minimum-pass refresh — `entry.zone` is intentionally
  // ignored (zone field stays in shape, see CURRENT_TASK.md). All
  // project entries are «active» (no readonly/lab variants until
  // those features arrive).
  const zone = item ? (item.projectId ? 'active_bodge' : 'loose') : null;
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
    exportEntry,
    deleteEntry,
    editPrimer: noop,
    editPrimerNotes: noop,
    showInDag: () => setActiveWorkspace('flow', { projectId: currentProjectId }),
    cloneEntry: noop,
    copyToLoose: noop,
    usePrimerInDag: noop,
  }), [
    currentProjectId, cloneEntryToActiveProject, extractEntryToLoose,
    toggleLabStock, moveEntryToFolder, setActiveWorkspace, noop,
    exportEntry, deleteEntry,
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
      <LibraryTopBar
        query={query}
        onQueryChange={setQuery}
        onPickGlobalHit={(entryId /* , hit */) => {
          // M-X.9 K3 — global DNA hit click: select the entry +
          // activate its project if it belongs to one. Hit `pos`
          // navigation lives in K2 popover until SequenceView
          // overlay rendering lands.
          const entry = useStore.getState().libraryEntries?.[entryId];
          if (!entry) return;
          if (entry.projectId) {
            useStore.getState().activateProject?.(entry.projectId);
          }
          setSelectedId(entryId);
        }}
      />

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
          onAddToLoose={onAddToLoose}
          onAddStarterSet={onAddStarterSet}
          onExportProject={onExportProject}
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
          ) : (totalEntries === 0 && totalProjects === 0) ? (
            <EmptyState onAddClick={onAddClick} onAddStarterSet={onAddStarterSet} />
          ) : (
            <NoSelection />
          )}
        </main>
      </div>
      <AddModal
        open={addModalOpen}
        onClose={closeAddModal}
        onLaunchPreImport={onLaunchPreImport}
      />
      {/* M-X.9 K2 — Ctrl+F sequence search popover, scoped to the
          currently selected library entry. SequenceView overlay-rect
          rendering is deferred to a follow-up iteration. */}
      <SearchHost item={item} />
    </div>
  );
}

// Sub-component so the popover can read the modal flag without
// re-rendering the full LibraryWorkspace on every key press.
function SearchHost({ item }) {
  const open = useStore((s) => s.modals?.sequenceSearch);
  const close = useStore((s) => s.closeSequenceSearch);
  return (
    <SequenceSearchPopover
      open={!!open}
      onClose={close}
      targetSequence={item?.sequence || ''}
      targetName={item?.name || item?.id || null}
      entryId={item?.id || null}
    />
  );
}

function EmptyState({ onAddClick, onAddStarterSet }) {
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
      {onAddStarterSet && (
        <button
          type="button"
          data-testid="library-workspace-empty-starter"
          onClick={onAddStarterSet}
          style={{
            fontSize: 13,
            padding: '8px 18px',
            background: 'var(--surface-2)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >+ Базовый набор</button>
      )}
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
