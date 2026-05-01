import Dexie from 'dexie';

export const DB_NAME = 'bodgegene-db';
export const DB_VERSION = 2;

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
  await db.transaction('rw', db.projects, db.containers, db.library, async () => {
    await db.projects.clear();
    await db.containers.clear();
    await db.library.clear();
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
