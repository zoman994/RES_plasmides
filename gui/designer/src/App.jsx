import { useEffect, useCallback } from 'react';
import { useStore, bootstrapStore, applyThemeToDOM } from './store';
import AppShell from './components/AppShell';
import StartScreen from './components/StartScreen';
import DagWorkspace from './components/Dag/DagWorkspace';
import ContainerWindowPlaceholder from './components/Dag/ContainerWindowPlaceholder';
// M-X.7a v2 K5: Importer no longer imported here. The legacy
// fullscreen Importer (deprecated by DEC-IMP-06 ⚓) is now mounted
// via AppShell's WorkspaceRouter when workspace.active === 'importer'.
// LibraryWorkspace (M-X.7a v2) is the default workspace via
// workspace.active === 'library'.
import UnderConstruction from './components/UnderConstruction';
import MultiTabBlocked from './components/MultiTabBlocked';
import ReadOnlyForced from './components/ReadOnlyForced';
import SettingsModal from './components/SettingsModal';
import ProjectInfoModal from './components/ProjectInfoModal';
import { ToastStack } from './components/Toast';
import { openBodgeFilePicker, pickSaveAs, saveBlobToHandle } from './lib/file-system';
import { writeBodge, readBodge } from './lib/bodge-zip';
import { listenForceRelease } from './lib/multi-tab-lock';
import { runHotkeyResolver, useHotkey } from './lib/hotkeys';
import { installGlobalCtrlAGuard } from './lib/global-ctrl-a-guard';
import { setupBeforeInstallPromptListener } from './lib/pwa-install';
import { STRINGS } from './lib/strings';
import { queueImporterFiles } from './components/Library/lib/pending-files';

const DROPZONE_TYPES = ['.bodge', '.fasta', '.fa', '.gb', '.gbk', '.genbank', '.dna', '.fna'];
const IMPORTABLE_TYPES = ['.fasta', '.fa', '.fna', '.gb', '.gbk', '.genbank', '.dna'];

export default function App() {
  const theme = useStore(s => s.theme);
  const activeFullscreen = useStore(s => s.canvas.activeFullscreen);
  const settingsOpen = useStore(s => s.modals.settings);
  const projectInfoOpen = useStore(s => s.modals.projectInfo);
  const navStack = useStore(s => s.canvas.navStack);
  const currentProjectId = useStore(s => s.currentProjectId);
  const project = useStore(s => (currentProjectId ? s.projects[currentProjectId] : null));
  const openProjectFromFileData = useStore(s => s.openProjectFromFileData);
  const registerSavedFile = useStore(s => s.registerSavedFile);
  const showToast = useStore(s => s.showToast);
  const flushAutosave = useStore(s => s.flushAutosave);
  const hydrateProjectsFromDexie = useStore(s => s.hydrateProjectsFromDexie);
  const hydrateLibrary = useStore(s => s.hydrateLibrary);

  useEffect(() => {
    bootstrapStore();
    hydrateProjectsFromDexie().catch(() => { /* ignore */ });
    // Library entries live in the same Dexie schema but used to be lazy-
    // loaded; without this call, reload of the page wiped «Моя библиотека»
    // visually (the rows were still in IndexedDB but never read into store).
    hydrateLibrary().catch(() => { /* ignore */ });
    // Splash fade-in. body[data-app-ready] CSS rule animates opacity
    // 0→1 over 220 ms once initial bootstrap finishes, masking FOUC
    // and any slow Dexie hydration on cold start.
    if (typeof document !== 'undefined' && document.body) {
      requestAnimationFrame(() => {
        if (document.body) document.body.dataset.appReady = 'true';
      });
    }
  }, [hydrateProjectsFromDexie, hydrateLibrary]);

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

  // ─── Hotkey handlers (registered through registry, never via ad-hoc keydown) ───

  const handleNew = useCallback(() => {
    const s = useStore.getState();
    s.createProject('Untitled');
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
      const { project: parsed, warnings } = await readBodge(pick.file);
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
  }, [openProjectFromFileData, showToast]);

  const handleSave = useCallback(async () => {
    const id = useStore.getState().currentProjectId;
    if (!id) return;
    const proj = useStore.getState().projects[id];
    if (!proj) return;
    const blob = writeBodge(proj);
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

  // ─── Single global keydown listener via runHotkeyResolver ───
  useEffect(() => {
    function onKeyDown(e) {
      runHotkeyResolver(e);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
      const importable = files.filter(f => IMPORTABLE_TYPES.some(ext => f.name.toLowerCase().endsWith(ext)));
      const s = useStore.getState();
      const fs = s.canvas.activeFullscreen;
      if (importable.length > 0 && fs === 'dag') {
        queueImporterFiles(importable);
        s.pushFullscreen({
          fullscreen: 'library',
          payload: { target: 'project' },
        });
        return;
      }
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

  let inProjectChild = null;
  switch (activeFullscreen) {
    case 'dag':
      // M-C.1 K4 — DAG workspace replaces the v0.6 DagPlaceholder.
      // DagWorkspace mounts DagPalette (left) + PreviewDrawer (slide-
      // in) + DagCanvas (ReactFlow surface).
      inProjectChild = <DagWorkspace />;
      break;
    case 'containerWindow': {
      // M-C.1 K4 (DEC-MC1-05) — drill-in placeholder. Real Container
      // Window fullscreen lands in M-C.2.
      const top = navStack[navStack.length - 1];
      inProjectChild = <ContainerWindowPlaceholder containerId={top?.payload?.containerId} />;
      break;
    }
    case 'library':
      // M-X.7a v2 K5 — `'library'` no longer mounts the legacy
      // Importer fullscreen. AppShell's WorkspaceRouter handles
      // workspace switching internally via workspace.active
      // (defaults to 'library', see workspaceSlice / DEC-MX7A-V2-08).
      // Setting inProjectChild=null lets AppShell render its router
      // instead of the children-overlay path. Legacy Importer is
      // still accessible via NavRail ⤓ icon (workspace.active='importer').
      inProjectChild = null;
      break;
    case 'underConstruction': {
      const top = navStack[navStack.length - 1];
      inProjectChild = <UnderConstruction payload={top?.payload} />;
      break;
    }
    case 'multiTabBlocked':
      inProjectChild = <MultiTabBlocked />;
      break;
    case 'readOnlyForced':
      inProjectChild = <ReadOnlyForced />;
      break;
    default:
      inProjectChild = null;
  }

  void project;

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      {activeFullscreen === 'start'
        ? <StartScreen onOpenFile={handleOpen} />
        : <AppShell>{inProjectChild}</AppShell>}
      {projectInfoOpen && <ProjectInfoModal />}
      {settingsOpen && <SettingsModal />}
      <ToastStack />
    </div>
  );
}

