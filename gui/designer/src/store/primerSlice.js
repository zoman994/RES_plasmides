import {
  putPrimer,
  listPrimers,
  deletePrimer,
  findPrimerByResourceHash,
} from '../db/dexie-schema';
// PRIMER-10 (V177) — same canonical hash the Importer uses, so dedup works
// across paths (library-selection / assembly / import), not only on import.
import { computeResourceHash } from '../components/Library/lib/resource-hash';

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
    // PRIMER-7 (V173) — binding (anneals to template) + 5'-tail (overhang) kept
    // separate so PrimerTrack matches the binding, not tail+binding, and draws
    // the tail as an overhang. bindingSequence null ⇒ consumers fall back to seq.
    bindingSequence: input.bindingSequence || null,
    // PRIMER-AUDIT (V174) — accept both ecosystem field names (assembly `tail`,
    // PCR-mode/local-primer-design `tailSequence`); canonicalize to `tail`.
    tail: typeof input.tail === 'string' ? input.tail
      : (typeof input.tailSequence === 'string' ? input.tailSequence : ''),
    tm: typeof input.tm === 'number' ? input.tm : null,
    length: typeof input.length === 'number' ? input.length : seq.length,
    direction: input.direction || null,
    // Free-form description — a searchable dimension (primerToDocument.textFields.description).
    // Kept so a legacy kind='primer' LibraryEntry's description survives migration into the pool.
    description: input.description || null,
    projectId: projectId === undefined ? (input.projectId ?? null) : (projectId ?? null),
    status: VALID_STATUSES.has(status) ? status : (input.status || 'imported'),
    origin: origin || input.origin || defaultOrigin(),
    resourceHash: input.resourceHash || null,
    // PRIMER-3 — free-form user tags (колония / seq / fwd…). UI filter + chips.
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string' && t) : [],
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
    // Synchronous state-set FIRST — callers rely on the primer being in the pool
    // immediately (V177 must NOT delay this behind the optional async hash; some
    // envs' crypto.subtle.digest is slow/stubbed). NOTE: immer auto-freezes `safe`
    // once it lands in state, so we must NOT mutate it afterwards — patch via set()
    // and persist a fresh copy.
    set(state => { state.primersById[safe.id] = safe; });
    // PRIMER-10 (V177) — then stamp a resourceHash so checkPrimerDedup works across
    // ALL paths (library-selection / assembly / import), not only the Importer.
    // Same canonical hash (full oligo + 5'/3' linear ends) → identical primers dedup.
    // Best-effort: crypto missing/slow → row keeps null, callers degrade to name-only.
    let toPersist = safe;
    if (!safe.resourceHash) {
      try {
        const h = await computeResourceHash({
          sequence: safe.sequence, topology: 'linear', ends: { left: '5', right: '3' },
        });
        if (h) {
          set(state => { const e = state.primersById[safe.id]; if (e) e.resourceHash = h; });
          toPersist = { ...safe, resourceHash: h };
        }
      } catch { /* crypto unavailable */ }
    }
    await putPrimer(toPersist);
    return toPersist;
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
    * the same resourceHash, or undefined.
   */
  checkPrimerDedup: async (resourceHash) => {
    if (!resourceHash) return undefined;
    const inMem = Object.values(get().primersById || {})
      .find(r => r.resourceHash === resourceHash);
    if (inMem) return inMem;
    return findPrimerByResourceHash(resourceHash);
  },

  /**
   * PRIMER-3 — patch editable fields (name, tags) of a pool primer. Ignores
   * blank names (trim → no-op) and non-array tags. Persists to Dexie.
   */
  updatePrimerFields: async (primerId, patch) => {
    const existing = get().primersById[primerId];
    if (!existing || !patch || typeof patch !== 'object') return null;
    const name = typeof patch.name === 'string' ? patch.name.trim() : null;
    const tags = Array.isArray(patch.tags)
      ? patch.tags.filter((t) => typeof t === 'string' && t)
      : null;
    const next = { ...existing };
    if (name) next.name = name;
    if (tags) next.tags = tags;
    set((state) => {
      const e = state.primersById[primerId];
      if (!e) return;
      if (name) e.name = name;
      if (tags) e.tags = tags;
    });
    await putPrimer(next);
    return next;
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
