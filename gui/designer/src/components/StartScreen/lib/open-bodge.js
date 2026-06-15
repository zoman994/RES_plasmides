import { useStore } from '../../../store';
import { openBodgeFilePicker } from '../../../lib/file-system';
import { readBodge } from '../../../lib/bodge-zip';

/**
 * openBodgeIntoLibrary — shared «Загрузить .bodge» flow.
 *
 * Used by both the Sidebar action and the start-screen card (the card used to
 * open a disconnected CommandPalette overlay — оторвано от жизни). OS picker →
 * readBodge → link entries to the loaded project → register project as current
 * → switch to the Library workspace, where the project's ProjectZone appears
 * with its plasmids. Reads store actions via getState so it stays a plain async
 * function (no hook), callable from any handler.
 */
export async function openBodgeIntoLibrary() {
  const s = useStore.getState();
  const {
    showToast, addLibraryEntriesBulk, openProjectFromFileData,
    setActiveWorkspace, setActiveFullscreen,
  } = s;

  let pick;
  try {
    pick = await openBodgeFilePicker();
  } catch (e) {
    showToast?.(`Не удалось открыть .bodge: ${e?.message || e}`, 'error');
    return;
  }
  if (!pick) return;

  let parsed;
  try {
    parsed = await readBodge(pick.file);
  } catch (e) {
    showToast?.(e?.message || String(e), 'error');
    return;
  }

  const { project, libraryEntries, warnings } = parsed;
  // Link entries to the loaded project when the .bodge didn't carry explicit
  // projectIds (typical self-contained .bodge). Already-linked stay as-is.
  const linkedEntries = (libraryEntries || []).map((e) => ({
    ...e,
    projectId: e.projectId || project.id,
  }));
  if (linkedEntries.length > 0) {
    try {
      await addLibraryEntriesBulk?.(linkedEntries);
    } catch (e) {
      showToast?.(`Не все плазмиды загружены: ${e?.message || e}`, 'warning');
    }
  }

  try {
    await openProjectFromFileData?.({
      project,
      fileHandle: pick.handle,
      fileName: pick.fileName,
      lastModified: pick.lastModified,
    });
  } catch (e) {
    showToast?.(`Не удалось открыть проект: ${e?.message || e}`, 'error');
    return;
  }

  setActiveWorkspace?.('library');
  setActiveFullscreen?.('library');
  if (warnings && warnings.length) {
    showToast?.(warnings[0], 'warning');
  } else {
    showToast?.(`Загружено: ${project.name || 'проект'} (плазмид: ${linkedEntries.length})`, 'success');
  }
}
