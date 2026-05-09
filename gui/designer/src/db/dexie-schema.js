import Dexie from 'dexie';

export const DB_NAME = 'bodgegene-db';
export const DB_VERSION = 4;

/**
 * Schema v3 (M-B.1 K1, DEC-IMP-11 ⚓):
 *   Adds `primers` table — unified primer pool with metadata
 *   (status / projectId / origin) replacing the v2 pattern of storing primers
 *   as library entries with kind='primer'. Library kind='primer' rows are
 *   COPIED into the new table on upgrade (defaults applied); originals are
 *   left in place for back-compat with existing M-A.3 UI until M-H retires
 *   the dual storage. Empty pool migrations are trivial (BUGS.md note: v0.6
 *   wipe leaves no real primer entries pre-M-B.1).
 *
 * Schema v4 (M-X.7a v2 K1, DEC-MX7A-V2-03):
 *   Library entries gain new shape fields (zone / projectId /
 *   inLabStock / parentEntryId / parentEntryHash) for zone-aware
 *   tree placement + per-zone action-row + zone-aware editability.
 *   No data migration — dev environment, no live data → wipe
 *   library + primers + containers + projects on upgrade. Biolog
 *   re-imports through the new flow; the new entry shape is the
 *   sole post-K1 surface.
 */
export class BodgeDB extends Dexie {
  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
    });
    this.version(2).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags',
    }).upgrade(async () => {
      // v0.6 fresh start — `library` table just gets created. No data migration.
    });
    this.version(3).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
    }).upgrade(async (tx) => {
      const libTbl = tx.table('library');
      const primerTbl = tx.table('primers');
      const legacyPrimers = await libTbl.where('kind').equals('primer').toArray();
      for (const row of legacyPrimers) {
        if (!row || !row.id) continue;
        const payload = row.payload || {};
        await primerTbl.put({
          id: row.id,
          name: row.name || 'primer',
          sequence: payload.sequence || '',
          tm: typeof payload.tm === 'number' ? payload.tm : null,
          length: typeof payload.length === 'number'
            ? payload.length
            : (payload.sequence ? payload.sequence.length : 0),
          direction: payload.direction || null,
          projectId: null,
          status: 'imported',
          origin: { kind: 'paste' },
          resourceHash: payload.resourceHash || null,
          addedAt: row.addedAt || new Date().toISOString(),
        });
      }
    });
    this.version(4).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
    }).upgrade(async (tx) => {
      // DEC-MX7A-V2-03: full wipe on schema bump. No migration — dev
      // environment, biolog re-imports through the new flow.
      await tx.table('library').clear();
      await tx.table('primers').clear();
      await tx.table('containers').clear();
      await tx.table('projects').clear();
    });
  }
}

let _db = null;

export function getDB() {
  if (!_db) _db = new BodgeDB();
  return _db;
}

export function resetDBForTests(name) {
  if (_db) {
    try { _db.close(); } catch { /* ignore */ }
  }
  _db = name ? new BodgeDB(name) : null;
  return _db;
}

export async function putProject(record) {
  return getDB().projects.put(record);
}

export async function getProject(id) {
  return getDB().projects.get(id);
}

export async function listAllProjects() {
  return getDB().projects.toArray();
}

export async function listRecentProjects(limit = 10) {
  const all = await getDB().projects.orderBy('updatedAt').reverse().toArray();
  return all.slice(0, limit);
}

export async function deleteProject(id) {
  const db = getDB();
  await db.transaction('rw', db.projects, db.containers, async () => {
    await db.projects.delete(id);
    await db.containers.where('projectId').equals(id).delete();
  });
}

export async function clearAll() {
  const db = getDB();
  await db.transaction('rw', db.projects, db.containers, db.library, db.primers, async () => {
    await db.projects.clear();
    await db.containers.clear();
    await db.library.clear();
    await db.primers.clear();
  });
}

/**
 * Upsert a LibraryEntry record into the `library` table.
 * @param {object} entry — { id, kind, name, tags, addedAt, payload, _pendingDelete?, ext? }
 */
export async function putLibraryEntry(entry) {
  return getDB().library.put(entry);
}

/**
 * Atomic bulk import — write a batch of library entries in a single
 * `rw` transaction. Used by the Importer commit so that either all
 * library rows land or none do. Combined with awaiting this from the
 * caller before issuing `addContainerToCurrentProject`, it closes
 * SAFE-01: an autosave timer can no longer snapshot a project that
 * references a library entry whose Dexie write is still in flight.
 */
export async function putLibraryEntriesBulk(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  const db = getDB();
  await db.transaction('rw', db.library, async () => {
    await db.library.bulkPut(entries);
  });
}

/**
 * Fetch a single LibraryEntry by id.
 */
export async function getLibraryEntry(id) {
  return getDB().library.get(id);
}

/**
 * List entries from the `library` table.
 * By default excludes entries flagged `_pendingDelete: true`.
 * @param {object} [opts]
 * @param {'container'|'primer'} [opts.kind] — filter by kind.
 * @param {boolean} [opts.includeDeleted] — include `_pendingDelete: true` entries.
 * @returns {Promise<Array>} Sorted by `addedAt` desc.
 */
export async function listLibraryEntries({ kind, includeDeleted = false } = {}) {
  const tbl = getDB().library;
  let rows;
  if (kind) {
    rows = await tbl.where('kind').equals(kind).toArray();
  } else {
    rows = await tbl.toArray();
  }
  if (!includeDeleted) {
    rows = rows.filter(r => r && r._pendingDelete !== true);
  }
  rows.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return rows;
}

/**
 * Hard-delete a LibraryEntry row (called after soft-delete commit).
 */
export async function deleteLibraryEntry(id) {
  return getDB().library.delete(id);
}

// ── Primers (M-B.1 K1, DEC-IMP-11 ⚓ unified pool) ─────────────────────────

/**
 * PrimerRow shape:
 *   { id, name, sequence, tm, length, direction,
 *     projectId: string|null,           // null = orphan / Library-only view
 *     status: 'imported'|'designed'|'ordered'|'received'|'archived',
 *     origin: { kind: 'file_import'|'designed'|'paste', sourceFile?, designedInMix? },
 *     resourceHash: string|null,
 *     addedAt: string }
 */

export async function putPrimer(row) {
  return getDB().primers.put(row);
}

export async function getPrimer(id) {
  return getDB().primers.get(id);
}

export async function deletePrimer(id) {
  return getDB().primers.delete(id);
}

/**
 * List primers matching an optional filter. Sorted by `addedAt` desc.
 * @param {{ projectId?: string|null, status?: string }} [filter]
 *   `projectId: null` matches orphan primers (library-only view).
 *   `projectId: '<id>'` matches that project's pool.
 *   Omitted projectId matches any.
 */
export async function listPrimers(filter = {}) {
  const tbl = getDB().primers;
  let rows = await tbl.toArray();
  if ('projectId' in filter) {
    const target = filter.projectId ?? null;
    rows = rows.filter(r => (r.projectId ?? null) === target);
  }
  if (filter.status) {
    rows = rows.filter(r => r.status === filter.status);
  }
  rows.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return rows;
}

/**
 * Find a primer in the pool by resourceHash (used for dedup detection on
 * import). Returns the first match (resourceHash uniqueness is not enforced
 * at the schema level — caller decides what to do with collisions).
 */
export async function findPrimerByResourceHash(resourceHash) {
  if (!resourceHash) return undefined;
  return getDB().primers.where('resourceHash').equals(resourceHash).first();
}

/**
 * Distinct list of all tag strings used across non-deleted LibraryEntries.
 * Used to power tag-suggestion autocomplete.
 */
export async function listAllLibraryTags() {
  const rows = await getDB().library.toArray();
  const set = new Set();
  for (const r of rows) {
    if (!r || r._pendingDelete === true) continue;
    if (!Array.isArray(r.tags)) continue;
    for (const t of r.tags) {
      if (typeof t === 'string' && t.length > 0) set.add(t);
    }
  }
  return Array.from(set);
}
