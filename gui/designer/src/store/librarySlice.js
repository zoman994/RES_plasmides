import {
  putLibraryEntry,
  putLibraryEntriesBulk,
  listLibraryEntries,
  deleteLibraryEntry,
} from '../db/dexie-schema';
import { computeSuggestedName } from '../components/Importer/lib/compute-suggested-name';

export const LIBRARY_TAGS_SOFT_LIMIT = 10;

const DEFAULT_FILTER_KIND = 'container';
const DEFAULT_FILTER_TOPOLOGY = 'all';

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
        if (r && r.id) state.libraryEntries[r.id] = r;
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
 * Performance: results memoised on the (libraryEntries, kind, topology) tuple.
 * Without this, every consumer using `useStore(selectVisibleLibraryEntries)`
 * gets a fresh array reference per store tick, defeating shallow-equality
 * memoisation downstream and forcing PartsLibrary etc. to re-render.
 */
let _visEntriesCache = null;
export function selectVisibleLibraryEntries(state) {
  const lib = state.libraryEntries || {};
  const kind = state.filterKind;
  const topology = state.filterTopology;
  if (_visEntriesCache
      && _visEntriesCache.lib === lib
      && _visEntriesCache.kind === kind
      && _visEntriesCache.topology === topology) {
    return _visEntriesCache.result;
  }
  const list = Object.values(lib)
    .filter(e => e && e._pendingDelete !== true && e.kind === kind);
  const filtered = (kind === 'container' && topology !== 'all')
    ? list.filter(e => e.payload && e.payload.topology === topology)
    : list;
  filtered.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  _visEntriesCache = { lib, kind, topology, result: filtered };
  return filtered;
}

/**
 * Distinct tags across all visible (non-deleted) entries, sorted by frequency
 * desc then alphabetical (DEC-MA-04 pattern from ProjectInfoModal).
 *
 * Performance: results memoised on `libraryEntries` reference (Immer/Zustand
 * swaps the whole map only when something inside actually changed).
 */
let _allTagsCache = null;
export function selectAllLibraryTags(state) {
  const lib = state.libraryEntries || {};
  if (_allTagsCache && _allTagsCache.lib === lib) return _allTagsCache.result;
  const counts = new Map();
  for (const id in lib) {
    const e = lib[id];
    if (!e || e._pendingDelete === true) continue;
    if (!Array.isArray(e.tags)) continue;
    for (let j = 0; j < e.tags.length; j++) {
      const t = e.tags[j];
      if (typeof t !== 'string' || t.length === 0) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const result = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
  _allTagsCache = { lib, result };
  return result;
}
