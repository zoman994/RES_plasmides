import Dexie from 'dexie';
import { makePrimerKey } from '../lib/primer-identity';

export const DB_NAME = 'bodgegene-db';
export const DB_VERSION = 8;

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
    // Schema v5 (M-CANVAS-WORKFLOW-UX K2, SPEC §6.5/§8): account-global
    // custom «обвес» snippets. Purely ADDITIVE — a new table only, no
    // data migration, existing tables untouched (no wipe).
    this.version(5).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
      snippets: 'id, name, category, createdAt',
    });
    // Schema v6 (SPEC_COMMON_FEATURES, DEC-CF-02): account-global overlay
    // for the common-features DB — net-new user features (kind='user') +
    // overrides of factory features (kind='override', keyed by baseId =
    // the shipped feature's id). Purely ADDITIVE — a new table only, no
    // data migration, existing tables untouched (no wipe). Like `snippets`,
    // deliberately excluded from clearAll/deleteProject so the biolog's
    // edits survive project churn. (NOTE: real schema version derived from
    // code is 5→6; SPEC §0 said «v10→v11» — that was a miscount, see report.)
    this.version(6).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
      snippets: 'id, name, category, createdAt',
      commonFeatures: 'id, kind, baseId',
    });
    // Schema v7 (RS-C1, «Сайты рестрикции»): account-global user-defined
    // restriction enzymes (Type II only) + named enzyme sets. Purely ADDITIVE
    // — two new tables, no data migration, existing tables untouched (no wipe).
    // Like `snippets`/`commonFeatures`, deliberately excluded from
    // clearAll/deleteProject so the biolog's enzyme catalog survives project
    // churn.
    this.version(7).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, [projectId+status]',
      snippets: 'id, name, category, createdAt',
      commonFeatures: 'id, kind, baseId',
      customEnzymes: 'id, name, createdAt',
      enzymeSets: 'id, name, createdAt',
    });
    // Schema v8 (PRIMER-LIVE-1): primers gain an explicit `scope`.
    //
    // Two registers were being kept in one: a `project` record is a design the
    // biolog is working on, a `global` record is their personal inventory — a
    // tube that physically exists. Both are addressed by a raw id, and until
    // now a global record and a project record sharing one silently overwrote
    // each other, destroying either the design or the record of a real tube.
    //
    // Purely ADDITIVE: two new indexes, and every legacy row is stamped with
    // the project scope it always implicitly had. NO WIPE — the v4 wipe was a
    // one-off dev-environment decision, not a precedent, and there is real
    // user data in these tables now.
    this.version(8).stores({
      projects: 'id, name, createdAt, updatedAt',
      containers: 'id, projectId, kind, name, [projectId+kind]',
      library: 'id, kind, addedAt, [kind+addedAt], *tags, zone, projectId',
      primers: 'id, name, projectId, status, addedAt, resourceHash, scope, rawId, [projectId+status], [scope+status]',
      snippets: 'id, name, category, createdAt',
      commonFeatures: 'id, kind, baseId',
      customEnzymes: 'id, name, createdAt',
      enzymeSets: 'id, name, createdAt',
    }).upgrade(async (tx) => {
      const tbl = tx.table('primers');
      const rows = await tbl.toArray();
      const rekeyed = [];
      const drop = [];
      for (const row of rows) {
        if (!row || !row.id || row.scope) continue;
        const rawId = row.rawId || row.id;
        // Every legacy row is a project record — that is what the single
        // register always meant. A raw id that happens to read like a
        // qualified key has to MOVE, or it keeps squatting the slot the
        // freezer will use and the first real tube would overwrite it.
        const key = makePrimerKey('project', rawId);
        const next = { ...row, scope: 'project', rawId };
        if (key !== row.id) {
          next.id = key;
          drop.push(row.id);
        }
        rekeyed.push(next);
      }
      if (rekeyed.length) await tbl.bulkPut(rekeyed);
      // Delete only AFTER the moved rows are safely written, so a failure
      // half-way leaves the original row rather than nothing at all.
      if (drop.length) await tbl.bulkDelete(drop);
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

// ── Custom snippets (M-CANVAS-WORKFLOW-UX K2, SPEC §6.5) ───────────────
// Account-global (NOT project-scoped) — deliberately excluded from
// clearAll/deleteProject so a biolog's custom «обвес» catalog survives
// project churn. Project-local sharing is a T-future .bodge extension.
//
// SnippetRow: { id, name, sequence, category, isCustom:true, createdAt }

export async function putSnippet(row) {
  return getDB().snippets.put(row);
}

export async function listSnippets() {
  const rows = await getDB().snippets.toArray();
  rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return rows;
}

export async function deleteSnippet(id) {
  return getDB().snippets.delete(id);
}

// ── Common-features overlay (SPEC_COMMON_FEATURES, DEC-CF-02) ──────────
// Account-global, NOT project-scoped — excluded from clearAll/deleteProject
// (mirror of `snippets`) so factory-feature overrides + net-new user
// features survive project churn.
//
// Row shapes:
//   user:     { id, kind:'user', name, type, sequence?, protein?, length, createdAt }
//   override: { id:<baseId>, kind:'override', baseId, ...patch, createdAt }

export async function putCommonFeature(row) {
  return getDB().commonFeatures.put(row);
}

export async function listCommonFeatures() {
  return getDB().commonFeatures.toArray();
}

export async function deleteCommonFeature(id) {
  return getDB().commonFeatures.delete(id);
}

// ── Custom restriction enzymes + sets (RS-C1, «Сайты рестрикции») ──────
// Account-global, NOT project-scoped — excluded from clearAll/deleteProject
// (mirror of `snippets`/`commonFeatures`) so a biolog's custom enzymes +
// named sets survive project churn. Type II only (bio-invariant Rule 1).
//
// Row shapes:
//   customEnzymes: { id, name, site, cut:[fwd,rev], end, overhang, temp,
//                    buffer, supplier, isCustom:true, createdAt, ... }
//   enzymeSets:    { id, name, enzymes:[name,...], createdAt }

export async function putCustomEnzyme(row) {
  return getDB().customEnzymes.put(row);
}

export async function listCustomEnzymes() {
  const rows = await getDB().customEnzymes.toArray();
  rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return rows;
}

export async function deleteCustomEnzyme(id) {
  return getDB().customEnzymes.delete(id);
}

export async function putEnzymeSet(row) {
  return getDB().enzymeSets.put(row);
}

export async function listEnzymeSets() {
  const rows = await getDB().enzymeSets.toArray();
  rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  return rows;
}

export async function deleteEnzymeSet(id) {
  return getDB().enzymeSets.delete(id);
}
