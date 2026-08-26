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
import { openBodgeIntoLibrary } from './lib/open-bodge';
import { readBodge } from '../../lib/bodge-zip';
import { importFilesToLibrary } from '../Library/lib/canonical-file-ingress';
import { t, tf } from '../../i18n';

// MS-K4 (SPEC §3.3 + §4): supported sequence extensions for drag-drop
// into Library. .bodge / .bodgeassembly route through the existing
// open-project flow; unknown types trigger a toast warning.
// ANN-0I — `.genbank` and `.fna` are accepted here too; the file picker's
// ACCEPT_STRING already listed them, so a dropped `.genbank` was rejected as an
// unknown format while the same file imported fine through the picker.
const SEQ_EXT = /\.(dna|gb|gbk|genbank|fa|fna|fasta|txt)$/i;
// BG-003 — `.bodge` (a whole project) and `.bodgeassembly` (a portable assembly
// merged into the CURRENT project) are two different contracts. One regex made
// the full-project Open controller swallow both; only `.bodge` belongs to it.
const BODGE_EXT = /\.bodge$/i;
const BODGE_ASSEMBLY_EXT = /\.bodgeassembly$/i;

export default function StartScreen({ onOpenHotkeys }) {
  const showToast = useStore((s) => s.showToast);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const setActiveFullscreen = useStore((s) => s.setActiveFullscreen);
  const openProjectFromFileData = useStore((s) => s.openProjectFromFileData);
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const addPrimerToPool = useStore((s) => s.addPrimerToPool);
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
    // App's window listener is the fallback for an UNCAUGHT drop and says so:
    // inner targets stop propagation and do the import themselves. Without this
    // a `.bodge` that opened correctly ALSO told the user the feature was «coming
    // soon» — one drop, one success and one contradiction.
    e.stopPropagation();
    const sequenceFiles = files.filter((f) => SEQ_EXT.test(f.name));
    const bodgeFiles = files.filter((f) => BODGE_EXT.test(f.name));
    const assemblyFiles = files.filter((f) => BODGE_ASSEMBLY_EXT.test(f.name));
    const unknown = files.filter((f) => !SEQ_EXT.test(f.name)
      && !BODGE_EXT.test(f.name) && !BODGE_ASSEMBLY_EXT.test(f.name));
    if (sequenceFiles.length > 0) {
      // Navigate to Library + import the dropped sequences as new entries.
      setActiveWorkspace?.('library');
      setActiveFullscreen?.('library');
      // ANN-0I — one canonical ingress owns parse → shape → awaited commit →
      // primers. StartScreen must not build entry payloads itself: reading a
      // binary `.dna` with `file.text()` and storing the result as the
      // sequence produced a library row that was not a molecule.
      const result = await importFilesToLibrary(sequenceFiles, {
        store: { addLibraryEntriesBulk, addPrimerToPool },
        projectId: currentProjectId || null,
      });
      // A partial import is reported before the outcome, so a lost feature is
      // never hidden behind a success toast.
      for (const warning of result.warnings) showToast?.(warning, 'warning');
      for (const err of result.errors) showToast?.(err, 'error');
      if (result.ok) {
        showToast?.(tf('ingress.success', { count: result.committed.length }), 'success');
      } else if (result.errors.length === 0) {
        showToast?.(t('ingress.nothing'), 'error');
      }
    }
    if (bodgeFiles.length > 0) {
      const file = bodgeFiles[0];
      // BG-003 — hand the already-chosen File to the one Open controller rather
      // than re-implementing a thinner copy of it. This branch used to restore
      // project meta only: no library entries, no Canvas snapshot, no primers.
      // `pick` is what tells the controller the user has already chosen the
      // file, so no second picker opens. The drop keeps its own route (the
      // opened project's own view) and stays silent on success.
      try {
        await openBodgeIntoLibrary({
          pick: { file, fileName: file.name, lastModified: file.lastModified },
          navigateToLibrary: false,
          successToast: false,
        });
      } catch (err) {
        showToast?.(`Не удалось открыть ${file.name}: ${err?.message || err}`, 'error');
      }
    }
    if (assemblyFiles.length > 0) {
      // Portable assembly — a DIFFERENT contract (merge into the current
      // project), deliberately not routed through the full-project controller.
      // This is the pre-BG-003 behaviour, unchanged and not extended here.
      const file = assemblyFiles[0];
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
    if (unknown.length > 0 && sequenceFiles.length === 0
        && bodgeFiles.length === 0 && assemblyFiles.length === 0) {
      showToast?.('Поддерживаются: .dna / .gb / .fasta / .bodge / .bodgeassembly', 'warning');
    }
  }, [setActiveWorkspace, setActiveFullscreen, openProjectFromFileData, addLibraryEntriesBulk, addPrimerToPool, currentProjectId, showToast]);

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
