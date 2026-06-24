import { useCallback, useEffect, useState } from 'react';
import { useStore, bootstrapStore, applyThemeToDOM } from './store';
import AppShell from './components/AppShell';
import StartScreen from './components/StartScreen';
import Sidebar from './components/StartScreen/Sidebar';
import HotkeyCheatsheet from './components/HotkeyCheatsheet';
import { useSidebarCollapsed } from './components/StartScreen/hooks/useSidebarCollapsed';
import './components/StartScreen/StartScreen.css';
import ContainerWindowPlaceholder from './components/Dag/ContainerWindowPlaceholder';
// M-CANVAS-SKELETON (DEC-SKELETON-01) — изолированный DEV-only route.
// Полная Canvas-модель скелета: Tree + Canvas (Layout/Graph) + Editor +
// 4 operations. Replaces M-CANVAS-PROTOTYPE-PCR (узкий PCR-only).
// Снос скелета = удаление этого импорта + case в switch ниже + папки
// `components/CanvasSkeleton/`.
import CanvasSkeleton from './components/CanvasSkeleton';
// Sprint Single-Sidebar (09.05.2026): Importer / DagWorkspace
// stay imported only for the activeFullscreen overlay paths
// (legacy `pushFullscreen('dag' | 'library')` callsites). The
// canonical workspace render goes through AppShell.WorkspaceRouter
// driven by `workspace.active`.
import UnderConstruction from './components/UnderConstruction';
import MultiTabBlocked from './components/MultiTabBlocked';
import ReadOnlyForced from './components/ReadOnlyForced';
import SettingsModal from './components/SettingsModal';
import ProjectInfoModal from './components/ProjectInfoModal';
import SequenceSearchPopover from './components/SequenceSearchPopover';
import { ToastStack } from './components/Toast';
import { openBodgeFilePicker, pickSaveAs, saveBlobToHandle } from './lib/file-system';
import { writeBodge, writeBodgeV2, readBodge } from './lib/bodge-zip';
// A1/A2 — bridge the CanvasSkeleton assembly snapshot ↔ the .bodge v2 state so
// save/open actually round-trip the assembly (not just projectSlice meta).
import { loadSnapshot, saveSnapshot } from './components/CanvasSkeleton/store/skeleton-persistence';
import { skeletonToCanonical, canonicalToSkeleton } from './components/CanvasSkeleton/lib/skeleton-bodge-bridge';
import { flushSkeletonSnapshot } from './components/CanvasSkeleton/store/skeleton-context';
import { listenForceRelease } from './lib/multi-tab-lock';
import { runHotkeyResolver, useHotkey } from './lib/hotkeys';
import { installGlobalCtrlAGuard } from './lib/global-ctrl-a-guard';
import { installGlobalCopyHandler } from './lib/global-copy';
import { setupBeforeInstallPromptListener } from './lib/pwa-install';
import { STRINGS } from './lib/strings';

const DROPZONE_TYPES = ['.bodge', '.fasta', '.fa', '.gb', '.gbk', '.genbank', '.dna', '.fna'];

export default function App() {
  const theme = useStore(s => s.theme);
  const activeFullscreen = useStore(s => s.canvas.activeFullscreen);
  const settingsOpen = useStore(s => s.modals.settings);
  const projectInfoOpen = useStore(s => s.modals.projectInfo);
  const navStack = useStore(s => s.canvas.navStack);
  const currentProjectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (currentProjectId ? s.projects[currentProjectId] : null));
  const openProjectFromFileData = useStore(s => s.openProjectFromFileData);
  const addLibraryEntriesBulk = useStore(s => s.addLibraryEntriesBulk);
  const registerSavedFile = useStore(s => s.registerSavedFile);
  const showToast = useStore(s => s.showToast);
  const flushAutosave = useStore(s => s.flushAutosave);
  const hydrateProjectsFromDexie = useStore(s => s.hydrateProjectsFromDexie);
  const hydrateLibrary = useStore(s => s.hydrateLibrary);
  const hydrateCommonFeatures = useStore(s => s.hydrateCommonFeatures);
  const hydrateCustomEnzymes = useStore(s => s.hydrateCustomEnzymes);

  useEffect(() => {
    bootstrapStore();
    hydrateProjectsFromDexie().catch(() => { /* ignore */ });
    // Library entries live in the same Dexie schema but used to be lazy-
    // loaded; without this call, reload of the page wiped «Моя библиотека»
    // visually (the rows were still in IndexedDB but never read into store).
    hydrateLibrary().catch(() => { /* ignore */ });
    // Common-features overlay (SPEC_COMMON_FEATURES) — load user features +
    // factory overrides so detection merges them and the Library panel
    // shows them on cold start.
    hydrateCommonFeatures().catch(() => { /* ignore */ });
    // RS-C1 — account-global custom restriction enzymes + named sets, loaded
    // so «Сайты рестрикции» + the picker dropdowns see them on cold start.
    hydrateCustomEnzymes().catch(() => { /* ignore */ });
    // Splash fade-in. body[data-app-ready] CSS rule animates opacity
    // 0→1 over 220 ms once initial bootstrap finishes, masking FOUC
    // and any slow Dexie hydration on cold start.
    if (typeof document !== 'undefined' && document.body) {
      requestAnimationFrame(() => {
        if (document.body) document.body.dataset.appReady = 'true';
      });
    }
  }, [hydrateProjectsFromDexie, hydrateLibrary, hydrateCommonFeatures, hydrateCustomEnzymes]);

  useEffect(() => {
    const setCanInstallPwa = useStore.getState().setCanInstallPwa;
    return setupBeforeInstallPromptListener(setCanInstallPwa);
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  // Sprint M-X.3 follow-up — biolog «можно запретить Ctrl+A везде
  // кроме окна вивера? иногда бывает что выделяю всё вокруг».
  // Browser-native Ctrl+A on canvas / catalog / project shell
  // selects whatever's focused → confusing «everything around»
  // selection. Capture-phase guard kills the default everywhere
  // EXCEPT inside the SequenceView root and inside text inputs.
  useEffect(() => installGlobalCtrlAGuard(), []);

  // Игорь «контрол С должно глобально работать везде где можно
  // выделить». The SequenceView copy used to require the view to hold
  // focus; this window capture-phase handler copies the active
  // selection from any pane, while deferring to native copy for text
  // inputs / plain HTML selections / focus already inside a viewer.
  useEffect(() => installGlobalCopyHandler(), []);

  // ─── Hotkey handlers (registered through registry, never via ad-hoc keydown) ───

  const handleNew = useCallback(() => {
    const s = useStore.getState();
    // Единый знаменатель: same base as every other create button; the store
    // auto-suffixes («Новый проект 2», …) so Ctrl+N can't spawn dup names.
    s.createProject('Новый проект');
    s.openProjectInfo();
  }, []);

  const handleOpen = useCallback(async () => {
    let pick;
    try {
      pick = await openBodgeFilePicker();
    } catch (e) {
      showToast(STRINGS.toast.openFileFailed(e.message || e), 'error');
      return;
    }
    if (!pick) return;
    try {
      const { project: parsed, state: canonicalState, libraryEntries, warnings } = await readBodge(pick.file);
      // Симметрия с Sidebar onOpenBodge — Ctrl+O тоже сидит библиотеку
      // встроенными entries. Отсутствующий projectId привязываем к
      // загружаемому проекту (типично для self-contained .bodge).
      const linkedEntries = (libraryEntries || []).map((e) => ({
        ...e,
        projectId: e.projectId || parsed.id,
      }));
      if (linkedEntries.length > 0) {
        try { await addLibraryEntriesBulk(linkedEntries); }
        catch (e) { showToast(`Не все плазмиды загружены: ${e?.message || e}`, 'warning'); }
      }
      // A2 — seed the CanvasSkeleton snapshot for this project BEFORE switching to
      // it, so the assembly editor rehydrates the saved assembly on mount (was:
      // only project meta restored → empty assembly editor on every open).
      if (canonicalState) {
        try {
          const skel = canonicalToSkeleton(canonicalState);
          if (skel) await saveSnapshot(skel, parsed.id);
        } catch { /* non-fatal — degrade to an empty assembly */ }
      }
      await openProjectFromFileData({
        project: parsed,
        fileHandle: pick.handle,
        fileName: pick.fileName,
        lastModified: pick.lastModified,
      });
      if (warnings && warnings.length) {
        showToast(warnings[0], 'warning');
      }
    } catch (e) {
      showToast(e.message || String(e), 'error');
    }
  }, [openProjectFromFileData, addLibraryEntriesBulk, showToast]);

  const handleSave = useCallback(async () => {
    const id = useStore.getState().currentProjectId;
    if (!id) return;
    const proj = useStore.getState().projects[id];
    if (!proj) return;
    // A1 — the assembly lives in the per-project CanvasSkeleton snapshot, not in
    // projectSlice. Bridge it into a canonical v2 state so writeBodgeV2 persists
    // topology/method/junctions/pieces/primers. writeBodge(proj) alone fell to the
    // v1 writer (no .containers) and silently dropped the whole assembly.
    let blob;
    try {
      // H1 (audit) — flush the debounced skeleton write so we serialize the LATEST
      // edit, not a ≤500ms-stale snapshot (Ctrl+S right after an edit lost it).
      try { await flushSkeletonSnapshot(); } catch { /* best-effort */ }
      const snap = await loadSnapshot(id);
      if (snap) {
        const canonical = skeletonToCanonical(snap, {
          id: proj.id,
          name: proj.name,
          description: proj.description,
          tags: proj.tags,
          author: proj.agent,
          createdAt: proj.createdAt,
          updatedAt: proj.updatedAt,
        });
        blob = await writeBodgeV2(canonical);
      } else {
        blob = writeBodge(proj); // no assembly yet → v1 meta-only is correct
      }
    } catch (e) {
      showToast(STRINGS.toast.saveFailed(e.message || e), 'error');
      return;
    }
    let handle = useStore.getState().fileHandle;
    let name = useStore.getState().fileName;
    if (!handle) {
      const suggested = (proj.name || 'project').replace(/[^a-z0-9_-]+/gi, '_') + '.bodge';
      const picked = await pickSaveAs(suggested);
      if (!picked) return;
      handle = picked.handle;
      name = picked.fileName;
    }
    try {
      const { lastModified } = await saveBlobToHandle(handle, blob);
      registerSavedFile({ fileHandle: handle, fileName: name, lastModified });
      showToast(STRINGS.toast.saved, 'success');
    } catch (e) {
      showToast(STRINGS.toast.saveFailed(e.message || e), 'error');
    }
  }, [registerSavedFile, showToast]);

  const handleClose = useCallback(() => {
    useStore.getState().closeProject();
  }, []);

  const handleSettings = useCallback(() => {
    useStore.getState().openSettings();
  }, []);

  const handleProjectInfo = useCallback(() => {
    useStore.getState().openProjectInfo();
  }, []);

  const handleEscape = useCallback(() => {
    const s = useStore.getState();
    if (s.modals?.projectInfo) {
      s.closeProjectInfo();
      return;
    }
    if (s.modals?.settings) {
      s.closeSettings();
      return;
    }
    if (s.canvas.navStack.length > 1) {
      s.popFullscreen();
    }
    // else no-op (root view)
  }, []);

  useHotkey('new-project', handleNew);
  useHotkey('open-bodge', handleOpen);
  useHotkey('save-bodge', handleSave);
  useHotkey('close-project', handleClose);
  useHotkey('open-settings', handleSettings);
  useHotkey('project-info', handleProjectInfo);
  useHotkey('escape', handleEscape);
  // M-X.8 K6 — ⌘P / Ctrl+P opens the Command Palette.
  // ⌘P / Ctrl+P — quick-find projects now lives in the Library (its search),
  // not a floating palette. Route into the Library with search focused.
  const handleCommandPalette = useCallback(() => {
    const s = useStore.getState();
    s.setActiveWorkspace?.('library', { focusSearch: true });
    s.setActiveFullscreen?.('library');
  }, []);
  useHotkey('command-palette', handleCommandPalette);
  // M-X.9 K2 — Ctrl+F / ⌘F opens local sequence search.
  const handleSequenceSearch = useCallback(() => {
    useStore.getState().openSequenceSearch?.();
  }, []);
  useHotkey('sequence-search', handleSequenceSearch);

  // PWA `manifest.shortcuts` launch handler. The OS opens us with
  // `?action=…` when the user clicks an app-icon shortcut.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (!action) return;
    // Drop the param so a refresh doesn't replay the action.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.toString());
    } catch { /* */ }
    // Defer one tick so the rest of App.jsx hooks finish wiring
    // (handleNew + handleOpen depend on store + filesystem helpers).
    setTimeout(() => {
      switch (action) {
        case 'new-project': handleNew(); break;
        case 'open-bodge': handleOpen(); break;
        case 'command-palette': handleCommandPalette(); break;
        default: /* unknown action — ignore */ break;
      }
    }, 0);
  }, [handleNew, handleOpen, handleCommandPalette]);

  // ─── Single global keydown listener via runHotkeyResolver ───
  // Capture phase is critical: in PWA standalone Chrome will let
  // Ctrl+P / Ctrl+S / Ctrl+F / Ctrl+O / Ctrl+, through to the page
  // ONLY if we beat the browser default. With a bubble listener,
  // some browsers (Vivaldi specifically) fire the default action
  // before the event bubbles to window. Capture also lets us
  // suppress browser shortcuts when we're focused inside a text
  // input that wants to keep the key (handled inside the resolver
  // via `allowInInput`).
  useEffect(() => {
    function onKeyDown(e) {
      runHotkeyResolver(e);
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    function onBeforeUnload(e) {
      try { flushAutosave(); } catch { /* ignore */ }
      if (currentProjectId) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushAutosave, currentProjectId]);

  useEffect(() => {
    if (!currentProjectId) return;
    const off = listenForceRelease(currentProjectId, () => {
      const fn = useStore.getState().releaseProjectLockForcedToReadOnly;
      if (fn) fn();
    });
    return off;
  }, [currentProjectId]);

  useEffect(() => {
    // Window-level drag handlers exist solely to ROUTE drops on the DAG
    // screen into the Importer (push it onto navStack with the dropped
    // files queued). The earlier full-screen «Drop file here (M-B feature
    // preview)» overlay was removed — it intercepted the visual feedback
    // for per-folder drop targets in CatalogColumn and biolog asked to
    // strip the placeholder. dragenter/over still need preventDefault so
    // the drop event fires; dragleave handler is no longer necessary.
    function onDragOver(e) {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
        e.preventDefault();
      }
    }
    function onDrop(e) {
      if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
      // Inner targets (CatalogColumn folder rows, footer dropzone, etc.)
      // call e.stopPropagation() in their own handlers — so this listener
      // only fires when no inner consumer caught the drop.
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      const s = useStore.getState();
      const fs = s.canvas.activeFullscreen;
      const detected = files.find(f => DROPZONE_TYPES.some(ext => f.name.toLowerCase().endsWith(ext)));
      if (detected && fs !== 'library') {
        showToast(STRINGS.toast.dropFileComingSoon(detected.name), 'info');
      }
    }
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [showToast]);

  // Sprint Single-Sidebar — overlay routes (containerWindow,
  // multiTabBlocked, readOnlyForced, underConstruction) take over
  // the content area but the Sidebar stays. The legacy `dag` overlay
  // (DagWorkspace) was removed 17.06.2026 — the only entries (Library
  // tree «→ в DAG» + inspector «Показать в DAG») are gone, so the
  // route was dead. DagWorkspace + Dag palette files are orphaned
  // dead code (see TECH_DEBT).
  let overlayContent = null;
  switch (activeFullscreen) {
    case 'containerWindow': {
      const top = navStack[navStack.length - 1];
      overlayContent = <ContainerWindowPlaceholder containerId={top?.payload?.containerId} />;
      break;
    }
    case 'underConstruction': {
      const top = navStack[navStack.length - 1];
      overlayContent = <UnderConstruction payload={top?.payload} />;
      break;
    }
    case 'multiTabBlocked':
      overlayContent = <MultiTabBlocked />;
      break;
    case 'readOnlyForced':
      overlayContent = <ReadOnlyForced />;
      break;
    // M-CANVAS-SKELETON (DEC-SKELETON-01) — DEV-only route. Снос =
    // удалить эту строку + импорт + папку components/CanvasSkeleton.
    case 'canvasSkeleton':
      overlayContent = <CanvasSkeleton />;
      break;
    default:
      overlayContent = null;
  }

  void project;

  // Sprint Single-Sidebar — Sidebar always rendered outside; content
  // area picks one of three sources:
  //   1) activeFullscreen === 'start' → StartScreen MainPanel
  //   2) overlayContent set by the switch above → that overlay
  //   3) otherwise → AppShell.WorkspaceRouter (Library / DAG / etc.
  //      via workspace.active)
  // `start-screen-root` className on the root flex-row container is
  // legacy-named (was StartScreen-only); now scopes the Sidebar +
  // content CSS for the entire app shell. Renaming deferred —
  // function is correct.
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useSidebarCollapsed();
  const [hotkeysOpen, setHotkeysOpen] = useState(false);
  const openHotkeys = useCallback(() => setHotkeysOpen(true), []);
  const closeHotkeys = useCallback(() => setHotkeysOpen(false), []);

  let mainContent;
  if (activeFullscreen === 'start') {
    // C13 (audit) — StartScreen was mounted with no props, so HelpPopover's
    // «Показать хоткеи» button reached an undefined onOpenHotkeys (silent no-op).
    mainContent = <StartScreen onOpenHotkeys={openHotkeys} />;
  } else if (overlayContent) {
    mainContent = <AppShell>{overlayContent}</AppShell>;
  } else {
    // 'library' (canonical) and any other non-overlay → workspace router.
    mainContent = <AppShell />;
  }

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      <div className="start-screen-root" data-testid="app-root">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} onOpenHotkeys={openHotkeys} />
        {mainContent}
      </div>
      <HotkeyCheatsheet open={hotkeysOpen} onClose={closeHotkeys} />
      {projectInfoOpen && <ProjectInfoModal />}
      {settingsOpen && <SettingsModal />}
      <ToastStack />
    </div>
  );
}

