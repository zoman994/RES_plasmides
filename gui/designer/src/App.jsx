import { useEffect, useState, useCallback } from 'react';
import { useStore, bootstrapStore, applyThemeToDOM } from './store';
import AppShell from './components/AppShell';
import StartScreen from './components/StartScreen';
import DagPlaceholder from './components/DagPlaceholder';
import UnderConstruction from './components/UnderConstruction';
import MultiTabBlocked from './components/MultiTabBlocked';
import ReadOnlyForced from './components/ReadOnlyForced';
import SettingsModal from './components/SettingsModal';
import { openBodgeFilePicker, pickSaveAs, saveBlobToHandle } from './lib/file-system';
import { writeBodge, readBodge } from './lib/bodge-zip';

const DROPZONE_TYPES = ['.bodge', '.fasta', '.fa', '.gb', '.dna'];

export default function App() {
  const theme = useStore(s => s.theme);
  const activeFullscreen = useStore(s => s.canvas.activeFullscreen);
  const settingsOpen = useStore(s => s.modals.settings);
  const navStack = useStore(s => s.canvas.navStack);
  const currentProjectId = useStore(s => s.currentProjectId);
  const fileHandle = useStore(s => s.fileHandle);
  const fileName = useStore(s => s.fileName);
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
    applyThemeToDOM(theme);
  }, [theme]);

  // Cmd/Ctrl+S → save current project to file (no-op on start screen)
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
      showToast('Сохранено', 'success');
    } catch (e) {
      showToast(`Не удалось сохранить: ${e.message || e}`, 'error');
    }
  }, [registerSavedFile, showToast]);

  const handleOpen = useCallback(async () => {
    let pick;
    try {
      pick = await openBodgeFilePicker();
    } catch (e) {
      showToast(`Не удалось открыть файл: ${e.message || e}`, 'error');
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

  useEffect(() => {
    function onKeyDown(e) {
      const isSave = (e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey);
      if (isSave) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSave]);

  useEffect(() => {
    function onBeforeUnload(e) {
      try { flushAutosave(); } catch { /* ignore */ }
      // browser-native warning if dirty
      if (currentProjectId) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [flushAutosave, currentProjectId]);

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
        showToast(`Перетаскивание файлов появится в M-B (${detected.name})`, 'info');
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

  // Fragment for hidden, controlled by activeFullscreen
  void project;
  void fileHandle;
  void fileName;

  return (
    <div data-theme={theme} style={{ minHeight: '100vh' }}>
      {activeFullscreen === 'start'
        ? <StartScreen onOpenFile={handleOpen} />
        : <AppShell>{inProjectChild}</AppShell>}
      <DropOverlay active={dragActive} />
      {settingsOpen && <SettingsModal />}
      <ToastBar />
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
      Drop file here (M-B feature preview)
    </div>
  );
}

function ToastBar() {
  const toast = useStore(s => s.toast);
  const clearToast = useStore(s => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => clearToast(), 3500);
    return () => clearTimeout(t);
  }, [toast, clearToast]);
  if (!toast) return null;
  const accent = toast.kind === 'error' ? '#dc2626' : toast.kind === 'warning' ? '#d97706' : '#1f2937';
  return (
    <div
      data-testid="toast"
      role="status"
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--surface-1, #ffffff)',
        color: 'var(--text-primary, #1c1917)',
        border: `0.5px solid ${accent}`,
        padding: '10px 14px', borderRadius: 6,
        boxShadow: '0 8px 16px rgba(0,0,0,0.08)', zIndex: 1100, fontSize: 13,
        maxWidth: 480,
      }}
    >
      {toast.msg}
    </div>
  );
}
