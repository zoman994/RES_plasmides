/**
 * StartScreen — Sprint Single-Sidebar (09.05.2026, restructure).
 *
 * Pre-restructure: this component rendered Sidebar + MainPanel
 * together as a fullscreen view. Post-restructure: Sidebar lives
 * in App.jsx as the single shell across all workspaces, so this
 * component is now a thin wrapper around MainPanel only.
 *
 * Mounted by App.jsx when activeFullscreen === 'start'. The
 * `start-screen-root` scope wrapper stays so MainPanel's CSS
 * (start-screen-root prefixed selectors) keeps applying.
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import MainPanel from './MainPanel';
import './StartScreen.css';
import { readBodge } from '../../lib/bodge-zip';

// MS-K4 (SPEC §3.3 + §4): supported sequence extensions for drag-drop
// into Library. .bodge / .bodgeassembly route through the existing
// open-project flow; unknown types trigger a toast warning.
const SEQ_EXT = /\.(dna|gb|gbk|fa|fasta|txt)$/i;
const BODGE_EXT = /\.(bodge|bodgeassembly)$/i;

export default function StartScreen({ onOpenHotkeys }) {
  const showToast = useStore((s) => s.showToast);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const setActiveFullscreen = useStore((s) => s.setActiveFullscreen);
  const openProjectFromFileData = useStore((s) => s.openProjectFromFileData);
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const [dragActive, setDragActive] = useState(false);

  const handleDragOver = useCallback((e) => {
    if (!e.dataTransfer?.types?.includes?.('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragActive) setDragActive(true);
  }, [dragActive]);

  const handleDragLeave = useCallback((e) => {
    if (e.currentTarget === e.target) setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    const sequenceFiles = files.filter((f) => SEQ_EXT.test(f.name));
    const bodgeFiles = files.filter((f) => BODGE_EXT.test(f.name));
    const unknown = files.filter((f) => !SEQ_EXT.test(f.name) && !BODGE_EXT.test(f.name));
    if (sequenceFiles.length > 0) {
      // Navigate to Library + import the dropped sequences as new entries.
      setActiveWorkspace?.('library');
      setActiveFullscreen?.('library');
      try {
        // Build entry payloads from the raw file text. Best-effort:
        // parsing is the Library's responsibility (existing import flow).
        const entries = await Promise.all(sequenceFiles.map(async (f) => {
          const text = await f.text();
          return {
            name: f.name.replace(SEQ_EXT, ''),
            kind: 'container',
            sourceFile: f.name,
            payload: {
              sequence: text,
              length: text.length,
              topology: 'linear',
              annotations: [],
            },
          };
        }));
        const projectId = currentProjectId || null;
        addLibraryEntriesBulk?.({ projectId, entries });
        showToast?.(`${sequenceFiles.length} файлов импортируется в Библиотеку`, 'success');
      } catch (err) {
        showToast?.(`Импорт не удался: ${err?.message || err}`, 'error');
      }
    }
    if (bodgeFiles.length > 0) {
      const file = bodgeFiles[0];
      try {
        const parsed = await readBodge(file);
        const project = parsed?.project || parsed?.state?.projectMeta;
        if (project && openProjectFromFileData) {
          await openProjectFromFileData({
            project, fileHandle: null, fileName: file.name, lastModified: file.lastModified,
          });
        }
      } catch (err) {
        showToast?.(`Не удалось открыть ${file.name}: ${err?.message || err}`, 'error');
      }
    }
    if (unknown.length > 0 && sequenceFiles.length === 0 && bodgeFiles.length === 0) {
      showToast?.('Поддерживаются: .dna / .gb / .fasta / .bodge / .bodgeassembly', 'warning');
    }
  }, [setActiveWorkspace, setActiveFullscreen, openProjectFromFileData, addLibraryEntriesBulk, currentProjectId, showToast]);

  return (
    <div
      className="start-screen-root"
      data-testid="start-screen-root"
      data-drag-active={dragActive ? 'true' : 'false'}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <MainPanel onOpenHotkeys={onOpenHotkeys} />
      {dragActive && (
        <div
          data-testid="ss-drag-overlay"
          style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(184,92,62,0.10)',
            border: '2px dashed var(--accent-500, #b85c3e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', fontSize: 14, color: 'var(--text-primary)',
            fontWeight: 600,
          }}
        >
          Отпустите, чтобы импортировать в Библиотеку
        </div>
      )}
    </div>
  );
}
