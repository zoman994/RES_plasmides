import { v7 as uuidv7 } from 'uuid';
import {
  putLibraryEntry,
  putLibraryEntriesBulk,
  listLibraryEntries,
  deleteLibraryEntry,
} from '../db/dexie-schema';
import { computeSuggestedName } from '../components/Library/lib/compute-suggested-name';
import { computeResourceHash } from '../components/Library/lib/resource-hash';

export const LIBRARY_TAGS_SOFT_LIMIT = 10;

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

  addLibraryEntry: async (entry) => {
    if (!entry || !entry.id) return;
    const safe = {
      ...entry,
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
  overwriteLibraryEntryAnnotations: async (id, annotations) => {
    if (!id || !Array.isArray(annotations)) return { ok: false, reason: 'invalid-args' };
    const existing = get().libraryEntries[id];
    if (!existing) return { ok: false, reason: 'not-found' };
    if (existing._pendingDelete) {
      return { ok: false, reason: 'pending-delete', name: existing.name };
    }
    const nextVersion = (existing.version || 1) + 1;
    const nextPayload = { ...(existing.payload || {}), annotations };
    const updated = { ...existing, version: nextVersion, payload: nextPayload };
    set(state => {
      const e = state.libraryEntries[id];
      if (e) {
        e.payload = nextPayload;
        e.version = nextVersion;
      }
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

  saveLibraryEntryAsVersion: async (parentId, annotations, requestedName) => {
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
    set(state => { state.libraryEntries[newId] = newEntry; });
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
