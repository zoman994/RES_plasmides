import { useStore } from '../../../store';
import { openBodgeFilePicker } from '../../../lib/file-system';
import { readBodge } from '../../../lib/bodge-zip';
import { canonicalToSkeleton } from '../../CanvasSkeleton/lib/skeleton-bodge-bridge';
import { saveSnapshot, clearSnapshot } from '../../CanvasSkeleton/store/skeleton-persistence';
import { primersFromCanonical } from '../../../lib/project-bodge-state';
import { PRIMER_SCOPE_PROJECT } from '../../../lib/primer-identity';
import { tf } from '../../../i18n';

/**
 * The library rows a file asks us to commit must be addressable before we try:
 * `addLibraryEntriesBulk` silently drops a row with no `id`, and two rows with
 * the same id collapse into one. Either way the commit "succeeds" while the
 * project loses a molecule, so both are refused up front.
 *
 * @returns {string|null} why the request is unusable, or null when it is fine
 */
function rejectUnusableEntries(entries) {
  const seen = new Set();
  for (const e of entries) {
    const id = typeof e?.id === 'string' ? e.id.trim() : '';
    if (!id) return 'запись библиотеки без идентификатора';
    if (seen.has(id)) return `дублирующийся идентификатор записи: ${id}`;
    seen.add(id);
  }
  return null;
}

/**
 * The commit receipt is the evidence, never the request. `addLibraryEntriesBulk`
 * returns exactly the rows it persisted, so a filtered, short, empty or
 * otherwise mismatched receipt means part of the library never landed.
 */
function receiptCoversRequest(receipt, requestedIds) {
  if (!Array.isArray(receipt)) return false;
  const committed = receipt.map((r) => (typeof r?.id === 'string' ? r.id : null));
  if (committed.length !== requestedIds.length) return false;
  if (new Set(committed).size !== requestedIds.length) return false;
  return requestedIds.every((id) => committed.includes(id));
}

/**
 * openBodgeIntoLibrary — the ONE controller for opening a full project `.bodge`.
 *
 * BG-003 — there used to be three. This one returned only `project` +
 * `libraryEntries`, so the Sidebar and MainPanel opened a valid file as a
 * project with an empty assembly and an empty primer pool: the reader had
 * parsed the Canvas state and the primer rows, and the flow dropped them.
 * Ctrl+O carried its own inline copy (the only one that restored them, and it
 * swallowed a failed restore silently), and the start-screen drop carried a
 * third, thinner one. Same file, three different projects.
 *
 * The whole flow now lives here, in order:
 *   picker (only when the caller has no `pick`) → readBodge → resolve/validate
 *   project → prepare canonical skeleton + file primer rows → persist the
 *   skeleton BEFORE activation → durable linked library commit → persist
 *   project primers → openProjectFromFileData → optional navigation/toast.
 *
 * Reads store actions via getState so it stays a plain async function (no
 * hook), callable from any handler.
 *
 * @param {object}  [options]
 * @param {object|null} [options.pick]  an already-chosen `{file, fileName,
 *   lastModified, handle?}` (drop / programmatic open). When absent the OS
 *   picker runs; cancelling it is a neutral no-op.
 * @param {boolean} [options.navigateToLibrary=true]  route to the Library
 *   workspace after a successful open.
 * @param {boolean} [options.successToast=true]  report success.
 */
export async function openBodgeIntoLibrary(options = {}) {
  const {
    pick: providedPick = null,
    navigateToLibrary = true,
    successToast = true,
  } = options || {};

  const s = useStore.getState();
  const {
    showToast, addLibraryEntriesBulk, openProjectFromFileData,
    setActiveWorkspace, setActiveFullscreen,
  } = s;

  let pick = providedPick;
  if (!pick) {
    try {
      pick = await openBodgeFilePicker();
    } catch (e) {
      showToast?.(`Не удалось открыть .bodge: ${e?.message || e}`, 'error');
      return;
    }
    if (!pick) return; // cancel — neutral no-op, no toast, no state change
  }

  let parsed;
  try {
    parsed = await readBodge(pick.file);
  } catch (e) {
    showToast?.(e?.message || String(e), 'error');
    return;
  }

  // v2 carries the project as `state.projectMeta` (`project` is the reader's
  // back-compat alias); v1 only has `project`.
  const project = parsed?.project || parsed?.state?.projectMeta || null;
  if (!project || !project.id) {
    showToast?.('Не удалось открыть .bodge: файл не содержит проекта', 'error');
    return;
  }

  const canonicalState = parsed.state || null;
  const { warnings } = parsed;
  // Link entries to the loaded project when the .bodge didn't carry explicit
  // projectIds (typical self-contained .bodge). Already-linked stay as-is.
  const linkedEntries = (parsed.libraryEntries || []).map((e) => ({
    ...e,
    projectId: e.projectId || project.id,
  }));

  // ── Prepare the full canonical state before anything is activated ──────────
  let skeleton = null;
  let filePrimers = [];
  if (canonicalState) {
    try {
      skeleton = canonicalToSkeleton(canonicalState);
      filePrimers = primersFromCanonical(canonicalState);
    } catch (e) {
      showToast?.(`Не удалось восстановить сборку: ${e?.message || e}`, 'error');
      return;
    }
  }

  // The assembly editor rehydrates from the per-project snapshot on mount, so
  // it must be on disk BEFORE the project becomes current.
  //
  // `saveSnapshot` swallows its own IndexedDB error and reports `false`; it
  // never throws. Ctrl+O's inline copy both ignored that return value and wrapped
  // the call in a silent catch, so a valid assembly degraded to an empty one and
  // the open still looked like a success. A failed restore is now visible and
  // stops the open — no project is activated with biology it could not load.
  if (skeleton) {
    let persisted = false;
    try {
      persisted = await saveSnapshot(skeleton, project.id);
    } catch {
      persisted = false;
    }
    if (!persisted) {
      showToast?.('Не удалось восстановить сборку проекта — проект не открыт', 'error');
      return;
    }
  } else {
    // This file says the project has no assembly. A snapshot left over from an
    // earlier project with the same id is NOT this file's biology — inheriting
    // it would show the user an assembly their file never contained.
    let cleared = false;
    try {
      cleared = await clearSnapshot(project.id);
    } catch {
      cleared = false;
    }
    if (!cleared) {
      showToast?.('Не удалось восстановить сборку проекта — проект не открыт', 'error');
      return;
    }
  }

  // Every remaining write happens BEFORE activation and fails closed. Atomic
  // cross-store rollback is out of scope, so rows that already landed stay
  // behind as orphans — but a project whose state only partly restored is never
  // activated and never reported as opened.
  if (linkedEntries.length > 0) {
    const unusable = rejectUnusableEntries(linkedEntries);
    if (unusable) {
      showToast?.(`Не удалось открыть .bodge: ${unusable}`, 'error');
      return;
    }
    let receipt;
    try {
      receipt = await addLibraryEntriesBulk?.(linkedEntries);
    } catch (e) {
      showToast?.(`Не все плазмиды загружены: ${e?.message || e} — проект не открыт`, 'error');
      return;
    }
    if (!receiptCoversRequest(receipt, linkedEntries.map((e) => e.id))) {
      showToast?.('Не все плазмиды загружены — проект не открыт', 'error');
      return;
    }
  }

  if (filePrimers.length > 0) {
    // Merge by record id so multiplicity, sites and the null/'' distinction all
    // come back exactly as they were saved.
    try {
      const addPrimer = useStore.getState().addPrimerToPool;
      for (const rec of filePrimers) {
        // `status` defaults to 'imported' in the slice and an explicit valid
        // status WINS over the record's own, so omitting it demoted an ordered
        // or received oligo to «imported» on every reopen. The lifecycle is a
        // fact about the physical primer; the file owns it, not this call.
        const landed = await addPrimer?.({
          primer: rec,
          projectId: project.id,
          status: rec.status,
          origin: rec.origin ?? null,
          // PRIMER-LIVE-1 — a file describes a project, never THIS lab's
          // freezer. An incoming record is landed as a project record whatever
          // scope it claims, so opening somebody else's `.bodge` cannot assert
          // that a tube physically exists here.
          scope: PRIMER_SCOPE_PROJECT,
        });
        if (!landed) throw new Error(`праймер ${rec.id ?? '?'} отклонён`);
      }
    } catch (e) {
      showToast?.(tf('primer.restoreFailed', { error: e?.message || e }), 'error');
      return;
    }
  }

  try {
    await openProjectFromFileData?.({
      project,
      fileHandle: pick.handle ?? null,
      fileName: pick.fileName ?? null,
      lastModified: pick.lastModified ?? null,
    });
  } catch (e) {
    showToast?.(`Не удалось открыть проект: ${e?.message || e}`, 'error');
    return;
  }

  if (navigateToLibrary) {
    setActiveWorkspace?.('library');
    setActiveFullscreen?.('library');
  }

  if (warnings && warnings.length) {
    showToast?.(warnings[0], 'warning');
  } else if (successToast) {
    showToast?.(`Загружено: ${project.name || 'проект'} (плазмид: ${linkedEntries.length})`, 'success');
  }
}
