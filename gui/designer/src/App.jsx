import { useEffect, useState, useCallback } from 'react';
import { useStore, bootstrapStore, applyThemeToDOM } from './store';
import AppShell from './components/AppShell';
import StartScreen from './components/StartScreen';
import DagPlaceholder from './components/DagPlaceholder';
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
import { setupBeforeInstallPromptListener } from './lib/pwa-install';
import { STRINGS } from './lib/strings';

const DROPZONE_TYPES = ['.bodge', '.fasta', '.fa', '.gb', '.dna'];

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

  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    bootstrapStore();
    hydrateProjectsFromDexie().catch(() => { /* ignore */ });
  }, [hydrateProjectsFromDexie]);

  useEffect(() => {
    const setCanInstallPwa = useStore.getState().setCanInstallPwa;
    return setupBeforeInstallPromptListener(setCanInstallPwa);
  }, []);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

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
    function onDragEnter(e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
        setDragActive(true);
      }
    }
    function onDragOver(e) {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
        e.preventDefault();
      }
    }
    function onDragLeave(e) {
      if (e.relatedTarget == null) setDragActive(false);
    }
    function onDrop(e) {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
        e.preventDefault();
      }
      setDragActive(false);
      const files = Array.from(e.dataTransfer?.files || []);
      const detected = files.find(f => DROPZONE_TYPES.some(ext => f.name.toLowerCase().endsWith(ext)));
      if (detected) {
        showToast(STRINGS.toast.dropFileComingSoon(detected.name), 'info');
      }
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [showToast]);

  let inProjectChild = null;
  switch (activeFullscreen) {
    case 'dag':
      inProjectChild = <DagPlaceholder />;
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
      <DropOverlay active={dragActive} />
      {projectInfoOpen && <ProjectInfoModal />}
      {settingsOpen && <SettingsModal />}
      <ToastStack />
    </div>
  );
}

function DropOverlay({ active }) {
  if (!active) return null;
  return (
    <div
      data-testid="drop-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(245, 158, 11, 0.12)',
        border: '2px dashed var(--accent-500, #f59e0b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        color: 'var(--text-primary, #1c1917)', fontSize: 16,
      }}
    >
      {STRINGS.app.dropOverlay}
    </div>
  );
}

