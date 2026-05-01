import {
  putLibraryEntry,
  listLibraryEntries,
  deleteLibraryEntry,
} from '../db/dexie-schema';

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

  markLibraryEntryPendingDelete: (id) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e._pendingDelete = true;
    });
    // Persist soft-delete flag so it survives reload before commit.
    putLibraryEntry({ ...existing, _pendingDelete: true }).catch(err => {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] persist soft-delete failed', err);
    });
  },

  unmarkLibraryEntryPendingDelete: (id) => {
    const existing = get().libraryEntries[id];
    if (!existing) return;
    set(state => {
      const e = state.libraryEntries[id];
      if (e) e._pendingDelete = false;
    });
    putLibraryEntry({ ...existing, _pendingDelete: false }).catch(err => {
      // eslint-disable-next-line no-console
      console.warn('[bodgegene] unmark soft-delete failed', err);
    });
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
});

/**
 * Filter visible library entries by current `filterKind` (and `filterTopology`
 * when `filterKind === 'container'`), excluding soft-deleted rows.
 * Sorted by `addedAt` desc.
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
