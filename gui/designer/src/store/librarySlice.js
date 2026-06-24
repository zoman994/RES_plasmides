import { v7 as uuidv7 } from 'uuid';
import {
  putLibraryEntry,
  putLibraryEntriesBulk,
  listLibraryEntries,
  deleteLibraryEntry,
} from '../db/dexie-schema';
import { computeSuggestedName } from '../components/Library/lib/compute-suggested-name';
import { computeResourceHash } from '../components/Library/lib/resource-hash';
import { applySequenceEditToEntry } from '../components/Library/lib/library-sequence-edit';
import { buildFolderTree } from '../components/Library/tree/library-folder-tree';
import { enrichEditDescriptor, mergeCorrection } from '../lib/alignment/describe-edit';

export const LIBRARY_TAGS_SOFT_LIMIT = 10;

/**
 * M-X.7a v2 K1 — entry shape defaults. Post-K1 wipe every new entry
 * carries these fields explicitly. The defaults here apply when an
 * entry comes through `addLibraryEntry` without them set, mostly for
 * test fixtures + defensive backfill against pre-v2 paths that may
 * not have been updated yet.
 */
function withZoneDefaults(entry) {
  return {
    zone: entry.zone || 'loose',
    projectId: entry.projectId ?? null,
    inLabStock: entry.inLabStock === true,
    parentEntryId: entry.parentEntryId ?? null,
    parentEntryHash: entry.parentEntryHash ?? null,
    ...entry,
    // Re-apply defaults AFTER spread so explicit values win but
    // `undefined` from spread doesn't blank the defaults.
    zone: entry.zone || 'loose',
    projectId: entry.projectId ?? null,
    inLabStock: entry.inLabStock === true,
    parentEntryId: entry.parentEntryId ?? null,
    parentEntryHash: entry.parentEntryHash ?? null,
  };
}

const DEFAULT_FILTER_KIND = 'container';
const DEFAULT_FILTER_TOPOLOGY = 'all';

/**
 * Lazy migration heuristic for entries created before M-X.5 (07.05.2026).
 *
 * Pre-M-X.5 entries lack `origin` / `version` / `parentEntry*` fields.
 * Per the M-X.5 plan we don't I/O during hydrate (would slow startup
 * for biologists with 100+ entries) — we infer the origin kind from
 * what's already on the entry:
 *
 *   • Tag prefix `demo:<slug>` → entry came in via the SnapGene
 *     catalog flow (M-A.3). Origin → `demo_category`.
 *   • Otherwise → `file_import` fallback. Lossy for paste/manual-edit
 *     entries from earlier versions, but not a blocker — biolog can
 *     re-import if provenance matters. Recorded in RELEASES.md v0.7.5.
 *
 * Idempotent: re-running on an already-migrated entry returns it
 * unchanged. Pure — no Dexie writes (lazy: each future
 * `putLibraryEntry` will persist whatever the in-memory copy holds).
 *
 * Q2 in the M-X.5 plan: heuristic chosen over full match against
 * `plasmids-index.json` because the index is 867 KB and reading it
 * during hydrate adds I/O cost without proportional value.
 */
function deriveOriginForExisting(entry) {
  if (!entry || entry.origin) return entry;
  const tags = Array.isArray(entry.tags) ? entry.tags : [];
  const demoTag = tags.find(t => typeof t === 'string' && t.startsWith('demo:'));
  const importedAt = entry.addedAt || new Date().toISOString();
  const origin = demoTag
    ? {
        kind: 'demo_category',
        categorySlug: demoTag.slice(5),
        sourcePlasmidName: entry.name,
        importedAt,
      }
    : {
        kind: 'file_import',
        sourceFileName: entry.name,
        sourceFormat: 'gb',
        importedAt,
      };
  return {
    ...entry,
    origin,
    version: entry.version || 1,
  };
}

/**
 * Library Zustand slice — flat personal collection of containers and primers
 * outside any project (DEC-LIB-01..09). Mirrors the projectSlice soft-delete
 * pattern but uses library-specific action names so it can co-exist on the
 * same root state without colliding with `markPendingDelete` / etc.
 */
export const createLibrarySlice = (set, get) => ({
  libraryEntries: {},
  // Transient «что изменено» log per entry (id → corrections[]), built by the
  // shared aligner provenance engine (describe-edit). Records edits since the
  // last explicit commit («Перезаписать» / «Сохранить как версию») so the save
  // panel + version timeline can show «было → стало». Not persisted.
  libraryEditLog: {},
  // Per-entry sequence undo/redo (Ctrl+Z этап 2). id → { past:[], future:[] };
  // each snapshot = { sequence, annotations, log }. Pushed before every
  // character-level sequence edit. Not persisted.
  libraryUndo: {},
  filterKind: DEFAULT_FILTER_KIND,
  filterTopology: DEFAULT_FILTER_TOPOLOGY,
  editingTagsEntryId: null,
  _libraryHydrated: false,

  hydrateLibrary: async () => {
    if (get()._libraryHydrated) return;
    const rows = await listLibraryEntries({ includeDeleted: true });
    set(state => {
      state.libraryEntries = {};
      for (const r of rows) {
        if (r && r.id) state.libraryEntries[r.id] = deriveOriginForExisting(r);
      }
      state._libraryHydrated = true;
    });
  },

  // M-X.7a v2 K1 — workspaceSlice + librarySlice extensions track a
  // separate `looseFolders` list so empty folders survive between
  // sessions (even when no entry is tagged yet). Tag-derived folders
  // continue to surface via selectLooseTreeStructure — the explicit
  // list is a UNION over the two sources.
  looseFolders: [],

  addLibraryEntry: async (entry) => {
    if (!entry || !entry.id) return;
    const withDefaults = withZoneDefaults(entry);
    const safe = {
      ...withDefaults,
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, LIBRARY_TAGS_SOFT_LIMIT) : [],
      addedAt: entry.addedAt || new Date().toISOString(),
    };
    set(state => { state.libraryEntries[safe.id] = safe; });
    await putLibraryEntry(safe);
  },

  /**
   * Atomic bulk import — write N library entries in a single Dexie
   * `rw` transaction and apply all in-memory updates in one immer
   * mutation. Used by the Importer commit so:
   *
   *   • either every library row lands or none do (no half-imports
   *     after a quota / I/O failure mid-batch);
   *   • the caller's `await` resolves only after every row is durable,
   *     so `addContainerToCurrentProject(...)` calls that follow can
   *     never reference a not-yet-flushed entry (SAFE-01).
   *
   * Skips invalid rows defensively. Returns the array of entries that
   * actually committed.
   */
  addLibraryEntriesBulk: async (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const safe = entries
      .filter(e => e && e.id)
      .map(e => ({
        ...e,
        tags: Array.isArray(e.tags) ? e.tags.slice(0, LIBRARY_TAGS_SOFT_LIMIT) : [],
        addedAt: e.addedAt || new Date().toISOString(),
      }));
    if (safe.length === 0) return [];
    set(state => {
      for (const e of safe) state.libraryEntries[e.id] = e;
    });
    await putLibraryEntriesBulk(safe);
    return safe;
  },

  /**
   * Library Save Flow (M-X.5 K7, DEC-LIB-13 ⚓): Annotations mutable
   * through explicit two-button save. Replaces the v0.7.5 hot-fix
   * `writeLibraryEntryAnnotations` (which silently overwrote on every
   * keystroke) — that was a stop-gap until biolog had explicit control.
   *
   * `overwriteLibraryEntryAnnotations` — destructive replace. Bumps
   * `entry.version` so consumers can tell «something changed» without
   * diffing payloads. Q5 plan decision: hard-fail on soft-deleted
   * entry (parent.pendingDelete) — biolog must un-delete first.
   *
   * `saveLibraryEntryAsVersion` — non-destructive copy-on-write.
   * Creates a new entry with `origin: { kind: 'version', parentEntryId,
   * parentEntryHash, createdAt }`, recomputes resourceHash, returns
   * the new id (caller can switch the inspector to it). Same Q5 guard.
   *
   * Both actions return a `{ ok, id?, reason? }` tuple so the UI can
   * surface specific toast messages (success vs. soft-deleted parent
   * vs. unknown id).
   */
  // Clear the transient «что изменено» log for an entry (after an explicit
  // save / version, or when the biolog discards pending edits).
  clearLibraryEditLog: (id) => set(state => {
    if (state.libraryEditLog && state.libraryEditLog[id]) delete state.libraryEditLog[id];
  }),

  // Ctrl+Z этап 2 — undo/redo a character-level sequence edit on a library
  // entry. Re-persists the snapshotted {sequence, annotations} and restores the
  // matching «что изменено» log so the save summary stays accurate. Shared
  // helper persists; the two actions just move the snapshot between past/future.
  _restoreLibrarySnapshot: async (id, from, to) => {
    const lib = get().libraryUndo?.[id];
    const stack = lib && Array.isArray(lib[from]) ? lib[from] : [];
    if (!stack.length) return { ok: false, reason: 'empty' };
    const entry = get().libraryEntries[id];
    if (!entry) return { ok: false, reason: 'not-found' };
    const target = stack[stack.length - 1];
    const counterSnap = {
      sequence: entry.payload?.sequence || '',
      annotations: Array.isArray(entry.payload?.annotations) ? entry.payload.annotations : [],
      log: [...(get().libraryEditLog?.[id] || [])],
    };
    let resourceHash = entry.payload?.resourceHash || null;
    try {
      resourceHash = await computeResourceHash({
        sequence: target.sequence, topology: entry.payload?.topology, ends: entry.payload?.ends,
      });
    } catch { /* keep previous hash */ }
    const nextPayload = {
      ...(entry.payload || {}),
      sequence: target.sequence,
      length: (target.sequence || '').length,
      annotations: target.annotations,
      resourceHash,
    };
    const updated = { ...entry, payload: nextPayload };
    set((state) => {
      const e = state.libraryEntries[id];
      if (e) e.payload = nextPayload;
      const u = state.libraryUndo[id];
      u[from] = u[from].slice(0, -1);
      u[to] = [...u[to], counterSnap];
      if (!state.libraryEditLog) state.libraryEditLog = {};
      state.libraryEditLog[id] = Array.isArray(target.log) ? target.log : [];
    });
    try {
      await putLibraryEntry(updated);
      return { ok: true, sequence: target.sequence };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] _restoreLibrarySnapshot persist failed', err);
      return { ok: false, reason: 'persist-error' };
    }
  },
  undoLibrarySequenceEdit: (id) => get()._restoreLibrarySnapshot(id, 'past', 'future'),
  redoLibrarySequenceEdit: (id) => get()._restoreLibrarySnapshot(id, 'future', 'past'),

  // `meta` (optional, back-compat with 2-arg callers): provenance stamped on the
  // entry's origin — `changes` («что изменено», built from the edit log) +
  // `reason`. The commit also clears the edit log + bumps `version`.
  overwriteLibraryEntryAnnotations: async (id, annotations, meta = {}) => {
    if (!id || !Array.isArray(annotations)) return { ok: false, reason: 'invalid-args' };
    const existing = get().libraryEntries[id];
    if (!existing) return { ok: false, reason: 'not-found' };
    if (existing._pendingDelete) {
      return { ok: false, reason: 'pending-delete', name: existing.name };
    }
    const nextVersion = (existing.version || 1) + 1;
    const nextPayload = { ...(existing.payload || {}), annotations };
    const hasProvenance = !!(meta && (meta.changes || meta.reason));
    const nextOrigin = hasProvenance
      ? {
        ...(existing.origin || {}),
        editedAt: meta.editedAt || new Date().toISOString(),
        ...(meta.changes ? { changes: meta.changes } : {}),
        ...(meta.reason ? { reason: meta.reason } : {}),
      }
      : existing.origin;
    const updated = { ...existing, version: nextVersion, origin: nextOrigin, payload: nextPayload };
    set(state => {
      const e = state.libraryEntries[id];
      if (e) {
        e.payload = nextPayload;
        e.version = nextVersion;
        if (hasProvenance) e.origin = nextOrigin;
      }
      if (state.libraryEditLog && state.libraryEditLog[id]) delete state.libraryEditLog[id];
      // A version-bumping commit is a save-point: undo must NOT cross it, else
      // Ctrl+Z reverts content below the saved version while `version` stays
      // bumped (state drift) and can dangle a child version's parentEntryHash.
      if (state.libraryUndo && state.libraryUndo[id]) delete state.libraryUndo[id];
    });
    try {
      await putLibraryEntry(updated);
      return { ok: true, id, version: nextVersion };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] overwriteLibraryEntryAnnotations failed', err);
      return { ok: false, reason: 'persist-error' };
    }
  },

  /**
   * M-X.5 K4 — multi-file import commit (DEC-LIB-MULTI-01..03). Used
   * by MultiImportView when biolog has dropped N>1 files and reviewed
   * the per-file table. Atomic-ish: builds all entries in memory
   * first, then bulk-persists via `addLibraryEntriesBulk` (single
   * Dexie tx). Per-file annotation choice is stored on
   * `entry.ext.annotationChoice` so a future open of the entry can
   * decide whether to auto-run L1 (auto) / leave empty (manual) /
   * suppress prompts (none) — the wiring of that decision into
   * AnnotationsTab is M-X.6 polish; today the metadata is recorded
   * but not yet acted on.
   *
   * `entries` shape:
   *   [{ name, sequence, topology, length, ends?, annotations[]?,
   *      organism?, description?, _fileName, _annotationChoice,
   *      _folderPath }]
   *
   * Returns `{ ok, ids[], failed[] }`. Failed entries (validation
   * miss, duplicate hash collision in the same batch) come back
   * without ids; the rest persist successfully.
   */
  commitMultiImport: async (entries, defaults = {}) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return { ok: false, ids: [], failed: [] };
    }
    const folderPath = (defaults.folderPath || '').trim();
    const built = [];
    const failed = [];
    for (const item of entries) {
      if (!item || !item.sequence) {
        failed.push({ name: item?.name || '<no-name>', reason: 'no-sequence' });
        continue;
      }
      const id = uuidv7();
      const importedAt = new Date().toISOString();
      let resourceHash = null;
      try {
        resourceHash = await computeResourceHash({
          sequence: item.sequence,
          topology: item.topology || 'linear',
          ends: item.ends || null,
        });
      } catch { /* fallback null */ }
      const annotations = (item._annotationChoice === 'discard' || item._annotationChoice === 'none')
        ? []
        : (Array.isArray(item.annotations) ? item.annotations : []);
      built.push({
        id,
        kind: 'container',
        name: get().getSuggestedLibraryName(item.name || item._fileName || 'untitled'),
        tags: [],
        folderPath: typeof item._folderPath === 'string' ? item._folderPath : folderPath,
        addedAt: importedAt,
        origin: {
          kind: item._fileName?.startsWith('paste-') ? 'paste_import' : 'file_import',
          sourceFileName: item._fileName || item.name || '',
          sourceFormat: (item._fileName || '').toLowerCase().endsWith('.dna') ? 'dna'
            : (item._fileName || '').toLowerCase().endsWith('.fasta') ? 'fasta'
              : 'gb',
          importedAt,
        },
        version: 1,
        payload: {
          sequence: item.sequence,
          length: item.length || item.sequence.length,
          topology: item.topology || 'linear',
          ends: item.ends || null,
          annotations,
          organism: item.organism || '',
          description: item.description || '',
          resourceHash,
        },
        ext: {
          annotationChoice: item._annotationChoice || defaults.annotationChoice || 'auto',
        },
      });
    }
    if (built.length === 0) {
      return { ok: false, ids: [], failed };
    }
    set(state => {
      for (const e of built) state.libraryEntries[e.id] = e;
    });
    try {
      await putLibraryEntriesBulk(built);
      return { ok: true, ids: built.map(e => e.id), failed };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] commitMultiImport bulk persist failed', err);
      // Rollback in-memory if persist failed
      set(state => { for (const e of built) delete state.libraryEntries[e.id]; });
      return { ok: false, ids: [], failed: [...failed, ...built.map(e => ({ name: e.name, reason: 'persist-error' }))] };
    }
  },

  /**
   * M-X.5 K5 — onboarding bulk loader. Pulls the demo plasmids from
   * `/plasmids-data/${slug}.json` for each requested category, builds
   * a LibraryEntry per plasmid with:
   *
   *   tags:        ['demo', `demo:${slug}`, categoryLabel] — three
   *                tag levels for filtering: «demo» (all demo),
   *                «demo:<slug>» (specific category), categoryLabel
   *                (human-readable filter chip).
   *   folderPath:  `Demo / ${categoryLabel}` — structural placement
   *                inside the Mine tree.
   *   origin:      { kind: 'demo_category', categorySlug,
   *                  sourcePlasmidName, importedAt }.
   *
   * Returns `{ ok: true, count, byCategory: { [slug]: count } }`.
   * On any I/O failure for a category, that category's count is 0
   * and the others are still loaded — partial success is acceptable
   * onboarding UX.
   *
   * Q1 plan decision: hybrid catalog. The 19-category plasmids-index
   * stays public/static; only the categories biolog selects via the
   * onboarding picker materialise into IndexedDB. The other ~12
   * categories remain accessible through a future «Browse all demo»
   * mode (out of M-X.5 scope).
   */
  loadOnboardingPlasmids: async (categoryEntries) => {
    if (!Array.isArray(categoryEntries) || categoryEntries.length === 0) {
      return { ok: false, count: 0, byCategory: {} };
    }
    const byCategory = {};
    let totalCount = 0;
    const newEntries = [];
    for (const cat of categoryEntries) {
      if (!cat || !cat.slug) continue;
      try {
        const url = `/plasmids-data/${cat.slug}.json`;
        const response = await fetch(url);
        if (!response.ok) {
          // eslint-disable-next-line no-console
          console.warn(`[bodgegene] loadOnboardingPlasmids: ${cat.slug} fetch ${response.status}`);
          byCategory[cat.slug] = 0;
          continue;
        }
        const json = await response.json();
        const plasmids = Array.isArray(json?.plasmids) ? json.plasmids : [];
        const importedAt = new Date().toISOString();
        const folderLabel = cat.label || cat.slug;
        for (const p of plasmids) {
          if (!p || !p.sequence) continue;
          const id = uuidv7();
          let resourceHash = null;
          try {
            resourceHash = await computeResourceHash({
              sequence: p.sequence,
              topology: p.topology || 'circular',
              ends: p.ends || null,
            });
          } catch { /* fallback to null */ }
          newEntries.push({
            id,
            kind: 'container',
            name: p.name || 'unnamed',
            tags: ['demo', `demo:${cat.slug}`, folderLabel],
            folderPath: `Demo / ${folderLabel}`,
            addedAt: importedAt,
            origin: {
              kind: 'demo_category',
              categorySlug: cat.slug,
              sourcePlasmidName: p.name || 'unnamed',
              importedAt,
            },
            version: 1,
            payload: {
              sequence: p.sequence,
              length: p.length || p.sequence.length,
              topology: p.topology || 'circular',
              ends: p.ends || null,
              annotations: Array.isArray(p.annotations) ? p.annotations : [],
              organism: p.organism || '',
              description: p.description || '',
              resourceHash,
            },
            ext: {},
          });
        }
        byCategory[cat.slug] = plasmids.length;
        totalCount += plasmids.length;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[bodgegene] loadOnboardingPlasmids: ${cat.slug} error`, err);
        byCategory[cat.slug] = 0;
      }
    }
    if (newEntries.length === 0) {
      return { ok: false, count: 0, byCategory };
    }
    set(state => {
      for (const e of newEntries) state.libraryEntries[e.id] = e;
    });
    try {
      await putLibraryEntriesBulk(newEntries);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] loadOnboardingPlasmids bulk persist failed', err);
    }
    return { ok: true, count: totalCount, byCategory };
  },

  /**
   * M-X.6 K12.4 (TD-LIB-K4-AUTO-TRIGGER) — mark a library entry's
   * auto-annotation as «already run» so the next open of the same
   * entry doesn't re-trigger. Sets `entry.ext.autoRun = { done: true,
   * runAt: ISO }`. Idempotent — safe to call multiple times.
   */
  markLibraryEntryAutoRunDone: async (id) => {
    if (!id) return;
    const entry = get().libraryEntries[id];
    if (!entry) return;
    const nextExt = {
      ...(entry.ext || {}),
      autoRun: { done: true, runAt: new Date().toISOString() },
    };
    set((state) => {
      const e = state.libraryEntries[id];
      if (e) e.ext = nextExt;
    });
    try {
      await putLibraryEntry({ ...entry, ext: nextExt });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] markLibraryEntryAutoRunDone persist failed', err);
    }
  },

  /**
   * M-X.6 K2 — character-level sequence edit on a library entry
   * (DEC-MX6-02). Thin wrapper: call the pure helper
   * `applySequenceEditToEntry`, recompute resourceHash, persist.
   * No version bump (silent safety-net path per
   * DEC-LIB-WRITE-THROUGH-HYBRID-01); explicit «Перезаписать» /
   * «Сохранить как версию» buttons remain the user-visible commit
   * point.
   *
   * Returns `{ ok, sequence, caretAfter, reason? }`. Caller (composite
   * handler in LibrarySingleInspector) uses `caretAfter` to advance
   * the caret one position past the edit.
   */
  applySequenceEditOnLibraryEntry: async (id, op) => {
    if (!id || !op) return { ok: false, reason: 'invalid-args' };
    const entry = get().libraryEntries[id];
    if (!entry) return { ok: false, reason: 'not-found' };
    if (entry._pendingDelete) return { ok: false, reason: 'pending-delete', name: entry.name };
    // «Что изменено» — capture the original bases from the PRE-edit sequence
    // (reuses the aligner provenance engine, with run coalescing).
    const fromSeq = entry.payload?.sequence || '';
    // Undo snapshot of the PRE-edit state (sequence + annotations + log).
    const undoSnap = {
      sequence: fromSeq,
      annotations: Array.isArray(entry.payload?.annotations) ? entry.payload.annotations : [],
      log: [...(get().libraryEditLog?.[id] || [])],
    };
    const result = applySequenceEditToEntry(entry, op);
    if (!result?.ok) return result || { ok: false, reason: 'invalid-args' };
    let resourceHash = entry.payload?.resourceHash || null;
    try {
      resourceHash = await computeResourceHash({
        sequence: result.sequence,
        topology: entry.payload?.topology,
        ends: entry.payload?.ends,
      });
    } catch { /* keep previous hash on hash failure */ }
    const nextPayload = {
      ...(entry.payload || {}),
      sequence: result.sequence,
      length: result.length,
      annotations: result.annotations,
      resourceHash,
    };
    const updated = { ...entry, payload: nextPayload };
    set((state) => {
      const e = state.libraryEntries[id];
      if (e) e.payload = nextPayload;
      if (!state.libraryEditLog) state.libraryEditLog = {};
      state.libraryEditLog[id] = mergeCorrection(state.libraryEditLog[id] || [], enrichEditDescriptor(op, fromSeq));
      if (!state.libraryUndo) state.libraryUndo = {};
      const u = state.libraryUndo[id] || { past: [], future: [] };
      state.libraryUndo[id] = { past: [...u.past.slice(-49), undoSnap], future: [] };
    });
    try {
      await putLibraryEntry(updated);
      return { ok: true, sequence: result.sequence, caretAfter: result.caretAfter };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] applySequenceEditOnLibraryEntry persist failed', err);
      return { ok: false, reason: 'persist-error' };
    }
  },

  /**
   * M-X.5 K10 — manual-edit branching (DEC-LIB-12 ⚓). Sequence in
   * library entries is mutable through branching: any character-level
   * edit creates a new entry with `origin.kind = 'manual_edit'` and a
   * parent reference. The parent stays unchanged.
   *
   * Q5 plan guard: parent.pendingDelete (soft-deleted) → hard-fail
   * with `pending-delete` reason. Biolog must un-delete the parent
   * first.
   *
   * Returns `{ ok, id?, name?, reason? }`. The caller switches the
   * inspector to the new branch on success so subsequent character
   * keystrokes write into the copy, not back into the parent.
   */
  // `meta` (optional, back-compat with 3-arg callers) records provenance for a
  // git-like manual edit (Игорь, align view): origin.reason (why) + origin.changes
  // (what) + origin.editedAt (when). A `name` override is honoured too.
  createManualEditBranch: async (parentId, sequence, annotations, meta = {}) => {
    if (!parentId || typeof sequence !== 'string') return { ok: false, reason: 'invalid-args' };
    const parent = get().libraryEntries[parentId];
    if (!parent) return { ok: false, reason: 'not-found' };
    if (parent._pendingDelete) {
      return { ok: false, reason: 'pending-delete', name: parent.name };
    }
    const newId = uuidv7();
    const baseName = (meta && meta.name) || `${parent.name || 'plasmid'} (manual edit)`;
    const safeName = get().getSuggestedLibraryName(baseName);
    const parentPayload = parent.payload || {};
    let resourceHash = parentPayload.resourceHash;
    try {
      resourceHash = await computeResourceHash({
        sequence,
        topology: parentPayload.topology,
        ends: parentPayload.ends,
      });
    } catch { /* fallback */ }
    const editedAt = (meta && meta.editedAt) || new Date().toISOString();
    const newEntry = {
      id: newId,
      kind: parent.kind,
      name: safeName,
      tags: Array.isArray(parent.tags) ? [...parent.tags] : [],
      folderPath: parent.folderPath || '',
      addedAt: editedAt,
      origin: {
        kind: 'manual_edit',
        parentEntryId: parentId,
        parentEntryHash: parentPayload.resourceHash || resourceHash,
        editedAt,
        ...(meta && meta.reason ? { reason: meta.reason } : {}),
        ...(meta && meta.changes ? { changes: meta.changes } : {}),
      },
      version: 1,
      parentEntryId: parentId,
      parentEntryHash: parentPayload.resourceHash || resourceHash,
      manualEditFlag: true,
      payload: {
        ...parentPayload,
        sequence,
        length: sequence.length,
        annotations: Array.isArray(annotations) ? annotations : (parentPayload.annotations || []),
        resourceHash,
      },
      ext: parent.ext || {},
    };
    set(state => { state.libraryEntries[newId] = newEntry; });
    try {
      await putLibraryEntry(newEntry);
      return { ok: true, id: newId, name: safeName };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] createManualEditBranch failed', err);
      set(state => { delete state.libraryEntries[newId]; });
      return { ok: false, reason: 'persist-error' };
    }
  },

  saveLibraryEntryAsVersion: async (parentId, annotations, requestedName, meta = {}) => {
    if (!parentId || !Array.isArray(annotations)) return { ok: false, reason: 'invalid-args' };
    const parent = get().libraryEntries[parentId];
    if (!parent) return { ok: false, reason: 'not-found' };
    if (parent._pendingDelete) {
      return { ok: false, reason: 'pending-delete', name: parent.name };
    }
    const newId = uuidv7();
    const baseName = (requestedName && requestedName.trim()) || `${parent.name} (v2)`;
    const safeName = get().getSuggestedLibraryName(baseName);
    const parentPayload = parent.payload || {};
    let resourceHash = parentPayload.resourceHash;
    try {
      resourceHash = await computeResourceHash({
        sequence: parentPayload.sequence,
        topology: parentPayload.topology,
        ends: parentPayload.ends,
      });
    } catch { /* fallback to parent hash */ }
    const newEntry = {
      id: newId,
      kind: parent.kind,
      name: safeName,
      tags: Array.isArray(parent.tags) ? [...parent.tags] : [],
      folderPath: parent.folderPath || '',
      addedAt: new Date().toISOString(),
      origin: {
        kind: 'version',
        parentEntryId: parentId,
        parentEntryHash: parentPayload.resourceHash || resourceHash,
        createdAt: new Date().toISOString(),
        ...(meta && meta.changes ? { changes: meta.changes } : {}),
        ...(meta && meta.reason ? { reason: meta.reason } : {}),
      },
      version: 1,
      parentEntryId: parentId,
      parentEntryHash: parentPayload.resourceHash || resourceHash,
      payload: {
        ...parentPayload,
        annotations,
        resourceHash,
      },
      ext: parent.ext || {},
    };
    set(state => {
      state.libraryEntries[newId] = newEntry;
      if (state.libraryEditLog && state.libraryEditLog[parentId]) delete state.libraryEditLog[parentId];
      // Save-point — drop the parent undo stack so Ctrl+Z can't revert the
      // parent below the state this version was forked from (would dangle the
      // new child's parentEntryHash).
      if (state.libraryUndo && state.libraryUndo[parentId]) delete state.libraryUndo[parentId];
    });
    try {
      await putLibraryEntry(newEntry);
      return { ok: true, id: newId, name: safeName };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] saveLibraryEntryAsVersion failed', err);
      // Roll back in-memory if persist failed.
      set(state => { delete state.libraryEntries[newId]; });
      return { ok: false, reason: 'persist-error' };
    }
  },

  /**
   * Silent safety-net write-through (07.05.2026 hot-fix, kept active
   * in M-X.5 K7 hybrid model). Persists annotations to the library
   * entry without bumping `version` — every keystroke flushes through
   * `useLibraryState.updateEdits` so a browser refresh never wipes
   * uncommitted edits.
   *
   * Coexists with `overwriteLibraryEntryAnnotations` (explicit «Save»
   * click that bumps version + emits toast). The K7 hybrid: silent
   * persistence keeps biolog data safe, explicit Save is a visible
   * commit point + clears the local `perFileEdits` flag so the Save
   * buttons disable. If a stricter «edits transient until Save»
   * model becomes desired (DEC-LIB-13 ⚓ pure form), drop the call
   * site in `useLibraryState.updateEdits` and this function becomes
   * a thin wrapper around `overwriteLibraryEntryAnnotations` minus
   * the version bump.
   */
  writeLibraryEntryAnnotations: async (id, annotations) => {
    if (!id || !Array.isArray(annotations)) return false;
    const existing = get().libraryEntries[id];
    if (!existing || existing._pendingDelete) return false;
    const nextPayload = { ...(existing.payload || {}), annotations };
    const updated = { ...existing, payload: nextPayload };
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e.payload = nextPayload;
    });
    try {
      await putLibraryEntry(updated);
      return true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] writeLibraryEntryAnnotations safety-net failed', err);
      return false;
    }
  },

  updateLibraryEntryTags: async (id, tags) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    const safeTags = Array.isArray(tags) ? tags.slice(0, LIBRARY_TAGS_SOFT_LIMIT) : [];
    set(state => {
      const e = state.libraryEntries[id];
      if (!e) return;
      e.tags = safeTags;
    });
    await putLibraryEntry({ ...existing, tags: safeTags });
  },

  /**
   * Set a library entry's topology (linear ↔ circular). Direct persist to
   * entry.payload.topology + IndexedDB — no version bump (DEC-LIB-11 hybrid),
   * mirrors updateLibraryEntryTags. Needed for the workspace Overview toggle
   * (fixing an import that guessed topology wrong). Safe in the library
   * domain: junctions live on canvas zones, never on the entry, so changing
   * an entry's topology cannot corrupt any assembly's junction config.
   */
  updateLibraryEntryTopology: async (id, topology) => {
    if (topology !== 'circular' && topology !== 'linear') return;
    const existing = get().libraryEntries[id];
    if (!existing || existing._pendingDelete) return;
    const nextPayload = { ...(existing.payload || {}), topology };
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e.payload = nextPayload;
    });
    await putLibraryEntry({ ...existing, payload: nextPayload });
  },

  /**
   * A4 (audit) — rename a library entry. Mirrors updateLibraryEntryTags: patch
   * the in-memory name + persist to Dexie. The inspector's inline title commits
   * here (was a no-op → the typed name reverted). No-op on empty / unchanged.
   */
  renameLibraryEntry: async (id, name) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    const safe = typeof name === 'string' ? name.trim().slice(0, 200) : '';
    if (!safe || safe === existing.name) return;
    set(state => {
      const e = state.libraryEntries[id];
      if (!e) return;
      e.name = safe;
    });
    await putLibraryEntry({ ...existing, name: safe });
  },

  /**
   * Move a library entry to a folder path (slash-separated). '' means
   * the top of «Mine». Tags stay untouched — folder placement is a
   * separate dimension (biolog: «такги просто атрибут который мы
   * можем использовать потом для поиска но папки с названиями тагов
   * не создавать»).
   */
  updateLibraryEntryFolderPath: async (id, folderPath) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    const safe = typeof folderPath === 'string' ? folderPath : '';
    set(state => {
      const e = state.libraryEntries[id];
      if (!e) return;
      e.folderPath = safe;
    });
    await putLibraryEntry({ ...existing, folderPath: safe });
  },


  /**
   * Soft-delete the entry — flips _pendingDelete and writes the flag to
   * Dexie. Awaited (was fire-and-forget; SAFE-08): a follow-up
   * commit/unmark/mark cycle would otherwise interleave with the
   * unfinished put and could resurrect or lose state.
   */
  markLibraryEntryPendingDelete: async (id) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e._pendingDelete = true;
    });
    try {
      await putLibraryEntry({ ...existing, _pendingDelete: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] persist soft-delete failed', err);
    }
  },

  unmarkLibraryEntryPendingDelete: async (id) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e._pendingDelete = false;
    });
    try {
      await putLibraryEntry({ ...existing, _pendingDelete: false });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] unmark soft-delete failed', err);
    }
  },

  commitLibraryEntryPendingDelete: async (id) => {
    const entry = get().libraryEntries[id];
    if (!entry || entry._pendingDelete !== true) return;
    set(state => { delete state.libraryEntries[id]; });
    await deleteLibraryEntry(id);
  },

  setLibraryFilterKind: (kind) => {
    if (kind !== 'container' && kind !== 'primer') return;
    set(state => { state.filterKind = kind; });
  },

  setLibraryFilterTopology: (topology) => {
    if (topology !== 'all' && topology !== 'circular' && topology !== 'linear') return;
    set(state => { state.filterTopology = topology; });
  },

  setEditingTagsEntry: (id) => {
    set(state => { state.editingTagsEntryId = id || null; });
  },

  /**
   * Find an existing container entry whose canonical resource hash matches
   * (M-B.1 K3, DEC-IMP-10). Searches the in-memory pool first; falls back to
   * Dexie if the slice hasn't hydrated yet (Importer can run before the
   * Library fullscreen is ever opened). Soft-deleted entries don't count as
   * collisions — they're going away on next commit.
   */
  checkLibraryDedup: async (resourceHash) => {
    if (!resourceHash) return undefined;
    const inMem = Object.values(get().libraryEntries || {})
      .find(e => e && !e._pendingDelete && e.payload?.resourceHash === resourceHash);
    if (inMem) return inMem;
    if (get()._libraryHydrated) return undefined;
    const rows = await listLibraryEntries({ kind: 'container' });
    return rows.find(r => r.payload?.resourceHash === resourceHash);
  },

  // ─────────────────────────────────────────────────────────────────
  // M-X.7a v2 K1 — zone-aware actions (DEC-MX7A-V2-04 → §5.3 of spec)
  //
  // Folder semantics: tags WITHOUT a colon are treated as folder
  // paths (slash-separated). Tags WITH a colon are meta tags
  // (`demo:slug`, future `cat:plasmid`, etc.) and never get touched
  // by folder operations.
  // ─────────────────────────────────────────────────────────────────

  moveEntryToFolder: (entryId, slashPath) => {
    set((state) => {
      const e = state.libraryEntries[entryId];
      if (!e) return;
      const meta = (Array.isArray(e.tags) ? e.tags : []).filter(
        (t) => typeof t === 'string' && t.includes(':'),
      );
      if (typeof slashPath === 'string' && slashPath.length > 0) {
        e.tags = [...meta, slashPath];
      } else {
        e.tags = meta;
      }
    });
    const updated = get().libraryEntries[entryId];
    if (updated) {
      // Persist async; UI doesn't block on this. Tag-only update —
      // no version bump.
      putLibraryEntry(updated).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[bodgegene] moveEntryToFolder persist failed', err?.message);
      });
    }
  },

  cloneEntryToActiveProject: async (entryId, opts = {}) => {
    const projectId = get().currentProjectId;
    if (!projectId) return { ok: false, reason: 'no-active-project' };
    const src = get().libraryEntries[entryId];
    if (!src) return { ok: false, reason: 'not-found' };
    // V52 — dedup guard. Fingerprint = name + content (resourceHash,
    // fallback sequence). If the active project already holds a copy,
    // do NOT silently add another — return reason='duplicate' so the
    // caller can confirm. `opts.force` bypasses (explicit "Да").
    // Invariant lives here so every entry path (quick-add, AddModal R4)
    // shares it (BUGS.md V52).
    if (!opts.force) {
      const srcHash = src.payload?.resourceHash || null;
      const srcSeq = src.payload?.sequence || null;
      const dup = Object.values(get().libraryEntries).find((e) => (
        e && e.id !== src.id
        && e.projectId === projectId
        && e.name === src.name
        && (srcHash
          ? e.payload?.resourceHash === srcHash
          : (srcSeq != null && e.payload?.sequence === srcSeq))
      ));
      if (dup) {
        return {
          ok: false, reason: 'duplicate', existingId: dup.id, name: src.name,
        };
      }
    }
    const newId = uuidv7();
    const child = {
      ...src,
      id: newId,
      zone: 'active_bodge',
      projectId,
      parentEntryId: src.id,
      parentEntryHash: src.payload?.resourceHash || null,
      addedAt: new Date().toISOString(),
      version: 1,
      // Copy payload by value so future mutations on child don't
      // bleed into parent (Immer would CoW, but we're inserting via
      // putLibraryEntry which serialises to Dexie anyway).
      payload: { ...(src.payload || {}) },
      tags: Array.isArray(src.tags) ? [...src.tags] : [],
    };
    set((state) => { state.libraryEntries[newId] = child; });
    try {
      await putLibraryEntry(child);
      return { ok: true, id: newId };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] cloneEntryToActiveProject persist failed', err?.message);
      return { ok: false, reason: 'persist-error' };
    }
  },

  extractEntryToLoose: async (entryId) => {
    const src = get().libraryEntries[entryId];
    if (!src) return { ok: false, reason: 'not-found' };
    set((state) => {
      const e = state.libraryEntries[entryId];
      if (!e) return;
      e.zone = 'loose';
      e.projectId = null;
    });
    const updated = get().libraryEntries[entryId];
    try {
      await putLibraryEntry(updated);
      return { ok: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] extractEntryToLoose persist failed', err?.message);
      return { ok: false, reason: 'persist-error' };
    }
  },

  toggleLabStock: async (entryId) => {
    const src = get().libraryEntries[entryId];
    if (!src) return { ok: false, reason: 'not-found' };
    const nextInLab = !src.inLabStock;
    set((state) => {
      const e = state.libraryEntries[entryId];
      if (!e) return;
      e.inLabStock = nextInLab;
      e.zone = nextInLab ? 'lab_pool' : 'loose';
      // Cross-project provenance preserved when leaving the freezer
      // — biolog can still see «used in projects A/B/C» list.
    });
    const updated = get().libraryEntries[entryId];
    try {
      await putLibraryEntry(updated);
      return { ok: true, inLabStock: nextInLab };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] toggleLabStock persist failed', err?.message);
      return { ok: false, reason: 'persist-error' };
    }
  },

  createLooseFolder: (slashPath) => {
    if (typeof slashPath !== 'string' || slashPath.length === 0) return;
    set((state) => {
      if (!Array.isArray(state.looseFolders)) state.looseFolders = [];
      if (!state.looseFolders.includes(slashPath)) {
        state.looseFolders.push(slashPath);
      }
    });
  },

  renameLooseFolder: (oldPath, newPath) => {
    if (!oldPath || !newPath || oldPath === newPath) return;
    set((state) => {
      if (!Array.isArray(state.looseFolders)) state.looseFolders = [];
      state.looseFolders = state.looseFolders.map(
        (p) => (p === oldPath || p.startsWith(`${oldPath}/`))
          ? `${newPath}${p.slice(oldPath.length)}`
          : p,
      );
      for (const id of Object.keys(state.libraryEntries)) {
        const e = state.libraryEntries[id];
        if (!Array.isArray(e?.tags)) continue;
        e.tags = e.tags.map(
          (t) => (typeof t === 'string' && (t === oldPath || t.startsWith(`${oldPath}/`)))
            ? `${newPath}${t.slice(oldPath.length)}`
            : t,
        );
      }
    });
    // Persist all touched entries — small-N typical (folder rename
    // rarely affects 100+ entries; if it does, batch via Dexie tx
    // is a follow-up).
    const all = Object.values(get().libraryEntries);
    Promise.all(
      all
        .filter((e) => e && e.tags && e.tags.some((t) => typeof t === 'string' && t.startsWith(newPath)))
        .map((e) => putLibraryEntry(e)),
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] renameLooseFolder persist failed', err?.message);
    });
  },

  deleteLooseFolder: (slashPath) => {
    if (typeof slashPath !== 'string' || slashPath.length === 0) return;
    set((state) => {
      if (!Array.isArray(state.looseFolders)) state.looseFolders = [];
      state.looseFolders = state.looseFolders.filter(
        (p) => p !== slashPath && !p.startsWith(`${slashPath}/`),
      );
      for (const id of Object.keys(state.libraryEntries)) {
        const e = state.libraryEntries[id];
        if (!Array.isArray(e?.tags)) continue;
        e.tags = e.tags.filter(
          (t) => !(typeof t === 'string' && (t === slashPath || t.startsWith(`${slashPath}/`))),
        );
      }
    });
  },

  /**
   * Suggest a name that doesn't collide with existing library entries
   * (M-B.1 K3, SnapGene-style autoname per DEC-IMP-10). Returns `baseName`
   * unchanged if it's free; otherwise `baseName (N)` with the smallest
   * available N. Soft-deleted entries are excluded.
   */
  getSuggestedLibraryName: (baseName) => {
    const existing = new Set(
      Object.values(get().libraryEntries || {})
        .filter(e => e && !e._pendingDelete && typeof e.name === 'string')
        .map(e => e.name)
    );
    return computeSuggestedName(baseName, existing);
  },
});

/**
 * Filter visible library entries by current `filterKind` (and `filterTopology`
 * when `filterKind === 'container'`), excluding soft-deleted rows.
 * Sorted by `addedAt` desc.
 *
 * Reverted 2026-05-06 — a memo keyed on `libraryEntries` reference was
 * intended to keep array identity stable for downstream consumers, but
 * biolog reported that the «Моя библиотека» catalog panel stopped
 * surfacing freshly imported entries. The likely cause is that some
 * code path mutates `libraryEntries` without flipping its outer
 * reference (or our cache holds a freed Immer draft). Returning a
 * fresh array per call restores correctness; downstream consumers
 * that need stable identity should `useShallow` the slice instead.
 */
export function selectVisibleLibraryEntries(state) {
  const kind = state.filterKind;
  const topology = state.filterTopology;
  const list = Object.values(state.libraryEntries || {})
    .filter(e => e && e._pendingDelete !== true && e.kind === kind);
  const filtered = (kind === 'container' && topology !== 'all')
    ? list.filter(e => e.payload && e.payload.topology === topology)
    : list;
  filtered.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return filtered;
}

// ─────────────────────────────────────────────────────────────────
// M-X.7a v2 K1 — zone-aware selectors (spec §5.3)
// ─────────────────────────────────────────────────────────────────

/**
 * All entries belonging to the requested zone, soft-delete excluded.
 * Order: addedAt desc (matches selectVisibleLibraryEntries).
 */
export function selectEntriesByZone(state, zone) {
  return Object.values(state.libraryEntries || {})
    .filter((e) => e && e._pendingDelete !== true && e.zone === zone)
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
}

/**
 * Containers attached to a specific project (ProjectZone tree row
 * source). Soft-delete excluded.
 */
export function selectContainersByProject(state, projectId) {
  if (!projectId) return [];
  return Object.values(state.libraryEntries || {})
    .filter((e) => e && e._pendingDelete !== true
      && e.kind === 'container' && e.projectId === projectId)
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
}

/** Mirror of selectContainersByProject for primers. */
export function selectPrimersByProject(state, projectId) {
  if (!projectId) return [];
  return Object.values(state.libraryEntries || {})
    .filter((e) => e && e._pendingDelete !== true
      && e.kind === 'primer' && e.projectId === projectId)
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
}

/**
 * Folder forest for the LooseZone tree. Union of (a) explicit
 * `looseFolders` (empty folders survive between sessions per
 * createLooseFolder) + (b) folder paths derived from loose entry
 * tags (the slash-path-as-tag pattern, DEC-CAT-04).
 *
 * Pre-processing: every path emits all its prefixes too, so that
 * `Backbones/CRISPR` implicitly creates the `Backbones` parent node
 * even when no entry is tagged with the bare parent path. Without
 * this `buildFolderTree` would orphan the leaf as a top-level row.
 */
export function selectLooseTreeStructure(state) {
  const explicit = Array.isArray(state.looseFolders) ? state.looseFolders : [];
  const fromTags = new Set();
  for (const e of Object.values(state.libraryEntries || {})) {
    if (!e || e._pendingDelete === true || e.zone !== 'loose') continue;
    if (!Array.isArray(e.tags)) continue;
    for (const t of e.tags) {
      if (typeof t === 'string' && !t.includes(':')) fromTags.add(t);
    }
  }
  for (const p of explicit) fromTags.add(p);
  const withParents = new Set();
  for (const p of fromTags) {
    const parts = p.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      withParents.add(parts.slice(0, i).join('/'));
    }
  }
  return buildFolderTree(Array.from(withParents));
}

/**
 * Lab pool split: `inLab` = primers physically in the freezer
 * (`inLabStock=true`), `crossProject` = primers from foreign
 * projects available for reuse (zone='lab_pool' and inLabStock=false).
 */
export function selectLabPoolStructure(state) {
  const all = Object.values(state.libraryEntries || {})
    .filter((e) => e && e._pendingDelete !== true
      && e.kind === 'primer' && e.zone === 'lab_pool');
  return {
    inLab: all
      .filter((e) => e.inLabStock === true)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
    crossProject: all
      .filter((e) => e.inLabStock !== true)
      .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
  };
}

/**
 * Count of distinct projects that have a clone (parentEntryId chain)
 * of the given primer. Used by ProjectZone primer rows to surface
 * usage badges + warn on delete.
 */
export function selectPrimerUsageCount(state, primerId) {
  if (!primerId) return 0;
  const projects = new Set();
  for (const e of Object.values(state.libraryEntries || {})) {
    if (!e || e._pendingDelete === true) continue;
    if (e.kind !== 'primer') continue;
    if (e.parentEntryId !== primerId) continue;
    if (e.projectId) projects.add(e.projectId);
  }
  return projects.size;
}

/**
 * Distinct tags across all visible (non-deleted) entries, sorted by frequency
 * desc then alphabetical (DEC-MA-04 pattern from ProjectInfoModal).
 *
 * Reverted to non-memoised form for the same reason as
 * `selectVisibleLibraryEntries` above.
 */
export function selectAllLibraryTags(state) {
  const counts = new Map();
  for (const e of Object.values(state.libraryEntries || {})) {
    if (!e || e._pendingDelete === true) continue;
    if (!Array.isArray(e.tags)) continue;
    for (const t of e.tags) {
      if (typeof t !== 'string' || t.length === 0) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}
