/**
 * LibraryTreeHost — wraps production LibraryTreeRoot for the skeleton.
 *
 * Triggered by Игорь 12.05.2026: «Левое дерево должно быть как в
 * библиотеке — с тем же функционалом». Replaces the bespoke
 * SkeletonTree (3-section ⭐ Итоги / 📥 Материалы / 🔬 Праймеры) with
 * the real Library tree component, so the user gets every Library
 * feature out-of-the-box: search/filter, Loose zone, Project zones,
 * pinned, «Все проекты (N)» group, Trash zone, drag-and-drop, hover
 * quick-add, right-click context menus, inline rename.
 *
 * Skeleton wiring:
 *  - `query` / `setQuery` — local state.
 *  - `selectedId` / `setSelectedId` — local state; click in tree → set
 *    selection (visual highlight in TreeItemRow). Skeleton has no
 *    inspector switching driven by this id (editor opens via
 *    Canvas/Tree double-click on skeleton containers, not library
 *    entries). Drag-to-canvas wiring lives in a follow-up sprint.
 *  - `onAddClick` → opens AddModal (mounted here).
 *  - `onAddToLoose` / `onAddStarterSet` / `onLaunchPreImport` →
 *    same global-store flow Library uses (file picker / starter set
 *    / parseFile + buildLibraryEntry).
 *  - `onExportProject` → downloadProjectAsZip helper.
 *
 * Data binding: LibraryTreeRoot + zones read from global librarySlice
 * (libraryEntries / projects / pinnedProjectIds / looseFolders) — the
 * skeleton inherits Library state automatically. Skeleton containers
 * (state.containers in skeleton-state) are NOT shown in this tree —
 * they live in the Canvas. Drag from Library tree onto Canvas →
 * creates skeleton container with origin.sourceEntryId — that wiring
 * follows in canvas drop-target sprint (NOTES_CANVAS_V2_KICKOFF §2).
 */
import { useCallback, useState } from 'react';
import { useStore } from '../../store';
import LibraryTreeRoot from '../Library/tree/LibraryTreeRoot';
import AddModal from '../Library/AddModal/AddModal';
import RestrictionPanel from './RestrictionPanel';
import { parseFile, ACCEPT_STRING } from '../../file-import';
import { buildLibraryEntry } from '../Library/lib/build-library-entry';
import { buildStarterSet } from '../Library/lib/starter-set';
import { downloadProjectAsZip } from '../../lib/export-genbank';

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

export default function LibraryTreeHost() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const addLibraryEntry = useStore((s) => s.addLibraryEntry);
  const addLibraryEntriesBulk = useStore((s) => s.addLibraryEntriesBulk);
  const currentProjectId = useStore((s) => s.currentProjectId);
  const showToast = useStore((s) => s.showToast);

  // Common import path — used by both AddModal pre-import preset and
  // direct "add to Коллекция" file picker.
  const importFiles = useCallback(async (files, projectId) => {
    if (!Array.isArray(files) || files.length === 0) return;
    const added = [];
    for (const f of files) {
      try {
        const parsed = await parseFile(f);
        const entry = buildLibraryEntry({ parsed, fileName: f.name, projectId });
        await addLibraryEntry(entry);
        added.push(entry.name || f.name);
      } catch (e) {
        showToast?.(`Не удалось импортировать ${f.name}: ${e?.message || e}`, 'error');
      }
    }
    if (added.length > 0) {
      showToast?.(`Импортировано: ${added.length}`, 'success');
    }
  }, [addLibraryEntry, showToast]);

  const onAddClick = useCallback(() => setAddModalOpen(true), []);
  const closeAddModal = useCallback(() => setAddModalOpen(false), []);

  const onLaunchPreImport = useCallback(async (preset) => {
    if (preset?.source === 'file') {
      const files = await openFilePicker();
      const projId = preset?.target === 'current-project' ? currentProjectId : null;
      await importFiles(files, projId);
    } else if (preset?.source === 'paste') {
      const text = (preset?.text || '').trim();
      if (!text) {
        showToast?.('Вставьте последовательность', 'info');
        return;
      }
      const looksLikeGenBank = /^LOCUS\s/i.test(text);
      const filename = looksLikeGenBank ? 'pasted.gb' : 'pasted.fasta';
      const file = new File([text], filename, { type: 'text/plain' });
      const projId = preset?.target === 'current-project' ? currentProjectId : null;
      await importFiles([file], projId);
    } else if (preset?.source === 'catalog') {
      // 12.05.2026 — Игорь: «модалка дает выбрать но говорит что в
      // разработке». Tile + inline-banner + здесь toast.
      showToast?.('Каталог SnapGene — в разработке (M-X.9+)', 'info');
    } else {
      showToast?.(`${preset?.source} — в разработке`, 'info');
    }
  }, [importFiles, currentProjectId, showToast]);

  const onAddToLoose = useCallback(async () => {
    const files = await openFilePicker();
    await importFiles(files, null);
  }, [importFiles]);

  const onAddStarterSet = useCallback(async () => {
    try {
      const entries = buildStarterSet();
      await addLibraryEntriesBulk(entries);
      showToast?.(`Базовый набор добавлен: ${entries.length} вектора`, 'success');
    } catch (e) {
      showToast?.(e?.message || 'Ошибка', 'error');
    }
  }, [addLibraryEntriesBulk, showToast]);

  const onExportProject = useCallback((projectId) => {
    if (!projectId) return;
    const state = useStore.getState();
    const project = state.projects?.[projectId];
    if (!project) {
      showToast?.('Проект не найден', 'error');
      return;
    }
    const containerIds = new Set(project.containerIds || []);
    const entries = Object.values(state.libraryEntries || {})
      .filter((e) => e && (e.projectId === projectId || containerIds.has(e.id)));
    if (entries.length === 0) {
      showToast?.('В проекте нет записей для экспорта', 'info');
      return;
    }
    const ok = downloadProjectAsZip(project, entries);
    if (ok) showToast?.(`Экспортирован: ${project.name || projectId}`, 'success');
  }, [showToast]);

  const onSelectEntry = useCallback((entryId) => {
    setSelectedId(entryId);
    // Skeleton-side: nothing additional yet. Drag-to-canvas (which
    // becomes the primary action for tree entries in V2 paradigma) is
    // a separate sprint.
  }, []);

  return (
    <div
      data-testid="skeleton-library-tree-host"
      style={{
        width: 312,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
      </div>
      <RestrictionPanel />
      <AddModal
        open={addModalOpen}
        onClose={closeAddModal}
        onLaunchPreImport={onLaunchPreImport}
      />
    </div>
  );
}
