import {
  putPrimer,
  listPrimers,
  deletePrimer,
  findPrimerByResourceHash,
} from '../db/dexie-schema';

/**
 * Unified primer pool slice (M-B.1 K1, DEC-IMP-11 ⚓).
 *
 * One Dexie `primers` table with metadata. Library Primers tab (M-H) and the
 * per-project Primer Pool (M-F) are both views of this single store via
 * `getPrimerPoolByFilter({projectId})`:
 *   - projectId: null → orphan / library-only primers
 *   - projectId: '<id>' → that project's pool
 *
 * Status lifecycle: imported → ordered → received → archived. Promotion UI
 * lives in M-F drawer; the action `promotePrimerStatus` is here so the
 * schema stabilises during M-B.1 even though no UI calls it yet.
 */

const VALID_STATUSES = new Set(['imported', 'designed', 'ordered', 'received', 'archived']);

function defaultOrigin() {
  return { kind: 'paste' };
}

function normalizePrimer(input, { projectId, status, origin } = {}) {
  if (!input || !input.id) return null;
  const seq = input.sequence || '';
  return {
    id: input.id,
    name: input.name || 'primer',
    sequence: seq,
    tm: typeof input.tm === 'number' ? input.tm : null,
    length: typeof input.length === 'number' ? input.length : seq.length,
    direction: input.direction || null,
    projectId: projectId === undefined ? (input.projectId ?? null) : (projectId ?? null),
    status: VALID_STATUSES.has(status) ? status : (input.status || 'imported'),
    origin: origin || input.origin || defaultOrigin(),
    resourceHash: input.resourceHash || null,
    addedAt: input.addedAt || new Date().toISOString(),
  };
}

export const createPrimerSlice = (set, get) => ({
  primersById: {},
  _primersHydrated: false,

  hydratePrimers: async () => {
    if (get()._primersHydrated) return;
    const rows = await listPrimers();
    set(state => {
      state.primersById = {};
      for (const r of rows) {
        if (r && r.id) state.primersById[r.id] = r;
      }
      state._primersHydrated = true;
    });
  },

  /**
   * Add a primer to the unified pool. The primer arg may already carry
   * projectId/status/origin, but explicit args win — mirrors the Importer
   * call site which passes context separately from the parsed primer.
   */
  addPrimerToPool: async ({ primer, projectId = null, status = 'imported', origin = null }) => {
    const safe = normalizePrimer(primer, { projectId, status, origin });
    if (!safe) return null;
    set(state => { state.primersById[safe.id] = safe; });
    await putPrimer(safe);
    return safe;
  },

  /**
   * In-memory filter on the hydrated pool. Pass `{projectId: null}` for
   * library view, `{projectId: '<id>'}` for project view, omit `projectId`
   * for all (or use `{}` for unfiltered).
   */
  getPrimerPoolByFilter: (filter = {}) => {
    let rows = Object.values(get().primersById || {});
    if ('projectId' in filter) {
      const target = filter.projectId ?? null;
      rows = rows.filter(r => (r.projectId ?? null) === target);
    }
    if (filter.status) rows = rows.filter(r => r.status === filter.status);
    rows.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    return rows;
  },

  /**
   * Async dedup check (hits Dexie). Returns the first existing primer with
   * the same resourceHash, or undefined. Importer K6 uses this for the
   * PrimerWizardStepModal warning row.
   */
  checkPrimerDedup: async (resourceHash) => {
    if (!resourceHash) return undefined;
    const inMem = Object.values(get().primersById || {})
      .find(r => r.resourceHash === resourceHash);
    if (inMem) return inMem;
    return findPrimerByResourceHash(resourceHash);
  },

  promotePrimerStatus: async (primerId, newStatus) => {
    if (!VALID_STATUSES.has(newStatus)) return null;
    const existing = get().primersById[primerId];
    if (!existing) return null;
    const next = { ...existing, status: newStatus };
    set(state => {
      const e = state.primersById[primerId];
      if (e) e.status = newStatus;
    });
    await putPrimer(next);
    return next;
  },

  removePrimerFromPool: async (primerId) => {
    if (!get().primersById[primerId]) return;
    set(state => { delete state.primersById[primerId]; });
    await deletePrimer(primerId);
  },
});

/**
 * Selector: pool view filtered by project. `projectId === null` ⇒ library
 * view (orphan primers); `'<id>'` ⇒ project pool.
 */
export function selectPrimerPool(state, filter = {}) {
  let rows = Object.values(state.primersById || {});
  if ('projectId' in filter) {
    const target = filter.projectId ?? null;
    rows = rows.filter(r => (r.projectId ?? null) === target);
  }
  if (filter.status) rows = rows.filter(r => r.status === filter.status);
  rows.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
  return rows;
}
