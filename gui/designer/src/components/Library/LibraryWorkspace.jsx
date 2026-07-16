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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../store';
import { STRINGS } from '../../lib/strings';
import { t } from '../../i18n';
import { SEARCH_PROFILES } from '../../lib/search-profiles';
import { useResizableSplit } from '../../hooks/useResizableSplit';
import ResizeHandle from '../common/ResizeHandle';
import LibraryTopBar from './LibraryTopBar';
import SearchSettingsModal from './SearchSettingsModal';
import EnzymeCard from './EnzymeCard';
import { entryRevision } from '../../lib/search-document-adapters';
import { makeOpenEntry } from '../../lib/open-entry-action';
import { useSearchPickRouter } from './hooks/useSearchPickRouter';
import { useSearchQueryState } from './hooks/useSearchQueryState';
import LibraryTreeRoot from './tree/LibraryTreeRoot';
import LibrarySingleInspector from './inspector/LibrarySingleInspector';
import VersionTimelineModal from './inspector/VersionTimelineModal';
import VersionHistoryList from './inspector/VersionHistoryList';
import { buildVersionTimeline } from './lib/version-lineage';
import LibraryActionRow from './inspector/LibraryActionRow';
import CommonFeaturesPanel from './CommonFeaturesPanel';
import OnboardingNudge from './onboarding/OnboardingNudge';
import AddModal from './AddModal/AddModal';
import SequenceSearchPopover from '../SequenceSearchPopover';
import { parseFile, extractItemName, ACCEPT_STRING, enrichAnnotations } from '../../file-import';
import { drainImporterFiles } from './lib/pending-files'; // A24 — drain DAG-dropped files
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

// Russian plural picker (1 ген / 2 гена / 5 генов). Local to this file —
// lib/strings.js has no shared plural helper (Звено 25.05.2026).
function pluralRu(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export default function LibraryWorkspace({ onAddClick: onAddClickExternal }) {
  const ws = STRINGS.libraryWorkspace || {};
  // Drag-to-resize the tree | inspector split (Игорь — разделители панелей двигаются).
  const splitRef = useRef(null);
  const { size: treeW, separatorProps: splitProps, dragging: splitDragging } = useResizableSplit({
    axis: 'x', side: 'start', initial: 312, min: 220, keepOther: 420,
    storageKey: 'library-tree-w', containerRef: splitRef,
  });
  const [selectedId, setSelectedId] = useState(null);
  // «История версий» modal (entry point from the Library).
  const [historyOpen, setHistoryOpen] = useState(false);
  // REV#2 Stage 3 K5 — the SEARCH-UNIFY shared string is split: the TREE keeps its own
  // fast quick-filter (`treeQuery`, tree-local, unchanged), while the top-bar owns a
  // separate structured `globalSearch` controller (below). They are independent (§9.4);
  // the only bridge is the tree's «Полный поиск» escalation, which SEEDS (replaces) the
  // global state from `treeQuery` — never a live two-way sync.
  const [treeQuery, setTreeQuery] = useState('');
  const [perEntryState, setPerEntryState] = useState({});
  // SPEC_COMMON_FEATURES DEC-CF-06 — right-panel view: 'entry' inspector vs
  // the 'common' features section. Orthogonal to selectedId/perEntryState
  // (Risk #5) so toggling back lands on the same entry + tab.
  const [view, setView] = useState('entry');
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

  // A23 (audit) — the StartScreen «Импорт .gb/.dna» action routes here via
  // setActiveWorkspace('library', { openAdd: true }); pop the AddModal once when
  // that flag arrives (a ref guard prevents re-opening on every render).
  const wsContext = useStore((s) => s.workspace?.context);
  const consumedAddRef = useRef(false);
  useEffect(() => {
    if (wsContext && wsContext.openAdd) {
      if (!consumedAddRef.current) { consumedAddRef.current = true; setAddModalOpen(true); }
    } else {
      consumedAddRef.current = false;
    }
  }, [wsContext]);

  // «Все проекты» / ⌘P now route here with { focusSearch: true } instead of a
  // floating palette — focus the tree search so quick-find a project/container
  // is the first thing the cursor is on. Ref-guard mirrors openAdd; tick lets
  // LibraryTreeRoot re-focus on each fresh arrival.
  const [focusSearchTick, setFocusSearchTick] = useState(0);
  const consumedFocusRef = useRef(false);
  useEffect(() => {
    if (wsContext && wsContext.focusSearch) {
      if (!consumedFocusRef.current) { consumedFocusRef.current = true; setFocusSearchTick((t) => t + 1); }
    } else {
      consumedFocusRef.current = false;
    }
  }, [wsContext]);

  // «Полный поиск» — the tree quick-filter escalates to the wide top-bar
  // SmartSearchBar (results dropdown, honest metrics, jump-to-hit). Bumping
  // this tick focuses that bar; `query` is already shared so the same text
  // is there and the dropdown populates immediately.
  const [fullSearchTick, setFullSearchTick] = useState(0);

  // Import files and add to store. `projectId` = null → LooseZone, id → project zone.
  const importFiles = useCallback(async (files, projectId, opts = {}) => {
    if (!files.length) return;
    // «Авто-аннотация» (DEC-IMP-09): enrich with homology / common features
    // unless explicitly turned off. The flag rides in via `opts` (AddModal
    // checkbox → preset → onLaunchPreImport). The same flag gates the
    // post-import «что нашлось» toast counter (Звено 25.05.2026).
    const autoAnnotated = opts.autoAnnotate !== false;
    let added = 0;
    let genesFound = 0;
    let reSitesFound = 0;
    let lastEntryId = null;
    const errors = [];
    for (const file of files) {
      try {
        const parsed = await parseFile(file);
        // enrichAnnotations returns a copy with an extended `annotations`; at
        // autoAnnotate===false it is skipped so a headerless paste stays
        // feature-less.
        const item = autoAnnotated
          ? await enrichAnnotations(parsed, { autoAnnotate: true })
          : parsed;
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
        lastEntryId = entry.id;
        // Count what auto-annotation attached, by the same array handed to the
        // entry: gene-by-homology = source 'common_db'; RE-site = detector
        // 're_scan'. Only when it actually ran (else counters stay 0).
        if (autoAnnotated && Array.isArray(item.annotations)) {
          genesFound += item.annotations.filter((a) => a.source === 'common_db').length;
          reSitesFound += item.annotations.filter((a) => a.detector === 're_scan').length;
        }
        added++;
      } catch (e) {
        errors.push(`${file.name}: ${e?.message || e}`);
      }
    }
    if (added > 0) {
      const base = `Добавлено: ${added} файл(ов)`;
      if (autoAnnotated && genesFound > 0) {
        const genes = `${genesFound} ${pluralRu(genesFound, 'ген', 'гена', 'генов')}`;
        const sites = `${reSitesFound} ${pluralRu(reSitesFound, 'сайт рестрикции', 'сайта рестрикции', 'сайтов рестрикции')}`;
        // Clickable «Продолжить аннотацию» → open the last imported entry's
        // embedded Annotator (inspector Annotations tab). Reuses the toast
        // action-button mechanism (onUndo) with a custom label (Звено 2).
        const toastOpts = { autoDismissMs: 9000 };
        if (lastEntryId) {
          const entryId = lastEntryId;
          toastOpts.actionLabel = 'Продолжить аннотацию';
          toastOpts.onUndo = () => {
            setSelectedId(entryId);
            setPerEntryState((prev) => ({
              ...prev,
              [entryId]: { ...(prev[entryId] || emptyEntryState()), activeTab: 'annotations' },
            }));
          };
        }
        showToast(`${base}. Авто-аннотация: ${genes}, ${sites}`, 'success', toastOpts);
      } else if (autoAnnotated) {
        // Auto-annotation ran but found no homologous genes — surface that
        // explicitly (RE-sites may still exist; Игорь wants the zero-gene
        // message). Keep the base import toast too so the import isn't lost.
        showToast(base, 'success');
        showToast('Гомологичных элементов не найдено', 'info', { autoDismissMs: 9000 });
      } else {
        showToast(base, 'success');
      }
    }
    if (errors.length > 0) showToast(errors[0], 'error');
  }, [addLibraryEntry, showToast, setSelectedId, setPerEntryState]);

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

  // A24 (audit) — files dropped on the DAG screen are queued to pending-files, then
  // the app pushes Library; nothing drained them (the legacy Importer never mounts),
  // so the drop was silently lost. Drain + import on mount (target = active project).
  const drainedRef = useRef(false);
  useEffect(() => {
    if (drainedRef.current) return;
    drainedRef.current = true;
    const pending = drainImporterFiles();
    if (pending && pending.length) importFiles(pending, currentProjectId || null);
  }, [importFiles, currentProjectId]);

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

  // REV#2 Stage 3 K4.2b∪K5 — the TOP-BAR's structured global search (§9.4). Owns the
  // canonical `globalSearchState`; the tree keeps its own `treeQuery`. `in:` names resolve
  // to a stable projectId (§617): a unique name → {projectId,label}, ambiguous/missing →
  // a blocking diagnostic (fabricated ids never reach the engine). Two projects can share a
  // name, so resolve by identity, not text.
  const resolveProjectName = (name) => Object.entries(projectsById || {})
    .filter(([, p]) => p && !p._pendingDelete && p.name === name)
    .map(([id, p]) => ({ projectId: id, label: p.name }));
  const globalSearch = useSearchQueryState({
    capabilities: SEARCH_PROFILES.globalLibrary,
    resolveProjectName,
    resolveLabel: t,
    resolveRemoveLabel: () => t('search.removeFilter.aria'),
  });

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
  const openAlignmentWith = useStore((s) => s.openAlignmentWith);
  const moveEntryToFolder = useStore((s) => s.moveEntryToFolder);
  const renameLibraryEntry = useStore((s) => s.renameLibraryEntry); // A4 (audit)
  // Projects are created from the Library left panel now (project hub).
  const createProject = useStore((s) => s.createProject);
  const openProjectInfo = useStore((s) => s.openProjectInfo);
  // Silent write-through for annotation edits (mirror the Importer host's
  // useLibraryState.updateEdits hot-fix, 07.05.2026). Without it, an ORF
  // created in the embedded Annotator lived only in transient perEntryState
  // and vanished on entry switch / reload.
  const writeLibraryEntryAnnotations = useStore((s) => s.writeLibraryEntryAnnotations);
  // Workspace-only Overview meta editors persist directly to the entry.
  const updateLibraryEntryTags = useStore((s) => s.updateLibraryEntryTags);
  const updateLibraryEntryTopology = useStore((s) => s.updateLibraryEntryTopology);

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
  // `_libraryEntryId: selectedId` (entry id === selectedId) mirrors the
  // Importer host (useLibraryState). Without it every inspector feature
  // gated on item._libraryEntryId silently no-op'd here — most importantly
  // character-level SEQUENCE edits (onSequenceEditFromView early-returns)
  // and manual-edit branching, so a sequence edit vanished with no error
  // (audit 14.06.2026). Setting it routes edits to
  // applySequenceEditOnLibraryEntry / createManualEditBranch (both durable).
  const item = rawEntry ? { ...rawEntry, ...(rawEntry.payload || {}), _libraryEntryId: selectedId } : null;
  // Version-history lineage for the «История версий» entry point. Built from the
  // parentEntryId chain + origin provenance; the button shows once there is more
  // than one node (a real history exists).
  const historyModel = useMemo(
    () => (selectedId ? buildVersionTimeline(entriesById, selectedId) : { root: null, nodes: [], edges: [] }),
    [entriesById, selectedId],
  );
  const hasHistory = historyModel.nodes.length > 1;
  // Action-row variant derives from `entry.projectId` per the
  // 09.05.2026 minimum-pass refresh — `entry.zone` is intentionally
  // ignored (zone field stays in shape, see CURRENT_TASK.md). All
  // project entries are «active» (no readonly/lab variants until
  // those features arrive).
  const zone = item ? (item.projectId ? 'active_bodge' : 'loose') : null;
  const entryState = perEntryState[selectedId] || emptyEntryState();

  // Unsaved (transient) SEQUENCE edits for an entry — used to warn before
  // switching away (Игорь 17.06.2026: «предупреждать перед потерей»).
  // Annotation-only edits autosave to the entry, so they're not «lost».
  const hasUnsavedSeqEdits = useCallback((id) => {
    const e = id ? perEntryState[id]?.edits : null;
    if (!e) return false;
    return e.editedSequence != null || (Array.isArray(e.editLog) && e.editLog.length > 0);
  }, [perEntryState]);

  // Guarded entry switch: if the entry we're leaving has unsaved sequence
  // edits, warn; on confirm, discard them (transient model) and proceed.
  const guardedSelect = useCallback((nextId) => {
    if (nextId === selectedId) return true;
    if (hasUnsavedSeqEdits(selectedId)) {
      const ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm('Есть несохранённые правки последовательности. Перейти и отбросить их? Чтобы не потерять — сначала «Сохранить версию».')
        : true;
      if (!ok) return false;
      const leaving = selectedId;
      setPerEntryState((prev) => (prev[leaving] ? {
        ...prev,
        [leaving]: {
          ...prev[leaving],
          edits: { ...prev[leaving].edits, editedSequence: undefined, editLog: undefined, editedAnnotations: undefined },
        },
      } : prev));
    }
    return true;
  }, [selectedId, hasUnsavedSeqEdits]);

  const onSelectEntry = useCallback((entry) => {
    if (!entry?.id) return;
    if (!guardedSelect(entry.id)) return;
    setView('entry');
    setSelectedId(entry.id);
    setPerEntryState((prev) => prev[entry.id] ? prev : { ...prev, [entry.id]: emptyEntryState() });
  }, [guardedSelect]);

  // The molecule-open behaviour behind a global-search entry pick (§10.4) — the STANDARD
  // guarded selection (dirty guard → activate project → common→entry → perEntryState → nav
  // parked after a confirmed select). Extracted + unit-tested in lib/open-entry-action.
  const openEntry = useMemo(() => makeOpenEntry({
    getEntry: (id) => useStore.getState().libraryEntries?.[id],
    guardedSelect,
    activateProject: (pid) => useStore.getState().activateProject?.(pid),
    setView,
    setSelectedId,
    initPerEntryState: (id) => setPerEntryState((prev) => (prev[id] ? prev : { ...prev, [id]: emptyEntryState() })),
    requestSequenceNav: (id, target) => useStore.getState().requestSequenceNav?.(id, target),
  }), [guardedSelect]);

  const {
    handlePickSearchResult, enzymeCardId, scanEnzymeSites, closeEnzymeCard,
  } = useSearchPickRouter({
    openEntry,
    // Enzyme-card «Найти сайты» runs a `cut:` scan in the GLOBAL bar (§10.5) — seed
    // (replace) the global state so it lands there, not in the tree quick-filter.
    setQuery: (q) => globalSearch.seedGlobalQuery(q),
  });

  // «+ Проект» → create a NEW project with a UNIQUE default name and open its
  // info to name it. «Нормальная логика» (Igor 15.06.2026): each click makes a
  // distinct project (no same-name collisions — «Новый проект», «Новый проект
  // 2», …); createProject sets it current → the flat tree list highlights it
  // in place and it lands at the bottom (newest createdAt).
  const onCreateProject = useCallback(() => {
    if (typeof createProject !== 'function') return;
    // Единый знаменатель: uniqueness lives in store.createProject now; every
    // create button just passes the base «Новый проект».
    createProject('Новый проект');
    openProjectInfo?.();
  }, [createProject, openProjectInfo]);
  const onSelectCommonSection = useCallback(() => setView('common'), []);
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
    // Persist annotation-ONLY edits straight to the library entry payload
    // (Annotator ORF etc. — biolog 14.06.2026 «создал ORF … после выхода
    // пропадает», DEC-LIB-11). SEQUENCE edits (patch carries editedSequence)
    // are TRANSIENT now (Игорь 17.06.2026) — they must NOT write through,
    // else a nucleotide edit's indel-shifted annotations would silently
    // mutate the SOURCE. Those commit only via «Сохранить версию».
    const isSequenceEdit = Object.prototype.hasOwnProperty.call(patch, 'editedSequence');
    if (!isSequenceEdit
        && Object.prototype.hasOwnProperty.call(patch, 'editedAnnotations')
        && Array.isArray(patch.editedAnnotations)
        && typeof writeLibraryEntryAnnotations === 'function') {
      try {
        writeLibraryEntryAnnotations(selectedId, patch.editedAnnotations);
      } catch { /* best-effort safety-net */ }
    }
  }, [selectedId, writeLibraryEntryAnnotations]);
  // Direct-persist entry tags from the Overview editor (entry.tags is the
  // source of truth; updateLibraryEntryTags writes store + IndexedDB).
  const onUpdateTags = useCallback((nextTags) => {
    if (!selectedId || typeof updateLibraryEntryTags !== 'function') return;
    updateLibraryEntryTags(selectedId, Array.isArray(nextTags) ? nextTags : []);
  }, [selectedId, updateLibraryEntryTags]);
  const onUpdateTopology = useCallback((topology) => {
    if (!selectedId || typeof updateLibraryEntryTopology !== 'function') return;
    updateLibraryEntryTopology(selectedId, topology);
  }, [selectedId, updateLibraryEntryTopology]);
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
    openFolderPicker: (id) => moveEntryToFolder(id, ''),
    exportEntry,
    deleteEntry,
    // «Выровнять» — preload the entry as input A in the align workspace; the
    // user adds the second sequence / .ab1 there.
    alignEntry: (id) => {
      const e = useStore.getState().libraryEntries?.[id];
      if (e) openAlignmentWith([e]);
    },
    // 17.06.2026 cleanup: the dead DAG action (showInDag → orphaned
    // DagWorkspace) and the unwired placeholder handlers (Container
    // Window / clone / primer-edit / copyToLoose) were removed from
    // getActionsFor, so they're no longer threaded here either.
  }), [
    currentProjectId, cloneEntryToActiveProject, extractEntryToLoose,
    toggleLabStock, moveEntryToFolder,
    exportEntry, deleteEntry, openAlignmentWith,
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
        position: 'relative', // containing block for the absolutely-positioned EnzymeCard
      }}
    >
      <LibraryTopBar
        search={globalSearch}
        autoFocusSearchTick={fullSearchTick}
        onPickSearchResult={handlePickSearchResult}
      />

      {/* Enzyme card (§10.5) — picking an enzyme opens it; «Найти сайты» is a SEPARATE
          action that runs a `cut:` scan (never an implicit re: query rewrite). */}
      <EnzymeCard
        enzymeId={enzymeCardId}
        onScanSites={() => scanEnzymeSites(enzymeCardId)}
        onClose={closeEnzymeCard}
      />

      {/* Global «Настройки поиска» — opens on the bar's «изменить» link (P2). */}
      <SearchSettingsModal />

      <div
        ref={splitRef}
        data-testid="library-workspace-body"
        style={{
          display: 'grid',
          gridTemplateColumns: `${treeW}px 7px minmax(0, 1fr)`,
          minHeight: 0,
          height: '100%',
        }}
      >
        <LibraryTreeRoot
          query={treeQuery}
          onQueryChange={setTreeQuery}
          autoFocusSearchTick={focusSearchTick}
          onRequestFullSearch={() => {
            // Escalation is a REPLACE, not a merge (§9.4 / K5): seed the global bar from the
            // tree's current text, then focus + open it. A prior global mode/chip cannot leak in.
            globalSearch.seedGlobalQuery(treeQuery);
            setFullSearchTick((t) => t + 1);
          }}
          onCreateProject={onCreateProject}
          selectedId={selectedId}
          onSelectEntry={onSelectEntry}
          onAddClick={onAddClick}
          onAddToLoose={onAddToLoose}
          onAddStarterSet={onAddStarterSet}
          onExportProject={onExportProject}
          onSelectCommonSection={onSelectCommonSection}
          commonSectionActive={view === 'common'}
        />
        <ResizeHandle axis="x" dragging={splitDragging} testid="library-split-handle" {...splitProps} />
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
          {view === 'common' ? (
            <CommonFeaturesPanel />
          ) : item ? (
            <>
              {/* Inline, list-first version history (redesign): compact list with
                  per-version diff / rename / status / delete; «Граф» opens the
                  full timeline. Replaces the old modal-first button. */}
              {hasHistory && (
                <VersionHistoryList
                  focusId={selectedId}
                  onSelect={(id) => { const e = entriesById[id]; if (e) onSelectEntry(e); }}
                  onOpenGraph={() => setHistoryOpen(true)}
                />
              )}
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
                  onRenameItem={(name) => { if (selectedId) renameLibraryEntry(selectedId, name); }}
                  onRunAutoAnnotate={noop}
                  // Edits still autosave (Q1, durability), but the explicit
                  // «Перезаписать» / «Сохранить как версию» panel + «что
                  // изменено» summary are now surfaced here too (Игорь 16.06 —
                  // «любые правки как в выравнивателе»). `hasChanges`/the log
                  // clear on save so the buttons don't falsely flag «несохранено».
                  showSaveActions={true}
                  onUpdateTags={onUpdateTags}
                  onUpdateTopology={onUpdateTopology}
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
      {historyOpen && (
        <VersionTimelineModal
          model={historyModel}
          onSelect={(id) => { setSelectedId(id); setHistoryOpen(false); }}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}

// Sub-component so the popover can read the modal flag without
// re-rendering the full LibraryWorkspace on every key press.
function SearchHost({ item }) {
  const open = useStore((s) => s.modals?.sequenceSearch);
  const close = useStore((s) => s.closeSequenceSearch);
  // P3 — revive the dead per-hit jump: route it through the shared nav channel
  // (SearchHost is a SIBLING of the inspector, so it can't reach the caret
  // directly). The inspector consumes navRequest and sets caret + scroll.
  const requestSequenceNav = useStore((s) => s.requestSequenceNav);
  const onJumpTo = useCallback((hit) => {
    if (!item?.id || !hit || !Number.isFinite(hit.targetStart)) return;
    requestSequenceNav(item.id, {
      segments: [{ start: hit.targetStart, end: hit.targetEnd }],
      caret: { start: hit.targetStart, end: hit.targetEnd },
      strand: hit.strand === -1 ? -1 : 1,
      revision: entryRevision(item),
      metricPct: hit.queryIdentity ?? hit.identity ?? 1,
    });
  }, [item, requestSequenceNav]);
  return (
    <SequenceSearchPopover
      open={!!open}
      onClose={close}
      targetSequence={item?.sequence || ''}
      targetName={item?.name || item?.id || null}
      entryId={item?.id || null}
      onJumpTo={onJumpTo}
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
