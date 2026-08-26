import {
  putPrimer,
  listPrimers,
  deletePrimer,
  findPrimerByResourceHash,
} from '../db/dexie-schema';
// PRIMER-10 (V177) — same canonical hash the Importer uses, so dedup works
// across paths (library-selection / assembly / import), not only on import.
import { computeResourceHash } from '../components/Library/lib/resource-hash';
// PRIMER-LIVE-1 — the freezer and the project are two registers, and a raw id
// may legitimately exist in both.
import {
  PRIMER_SCOPE_GLOBAL,
  makePrimerKey,
  normalizeModifications,
  normalizeScope,
  physicalIdentityKey,
  primerRawId,
  primerScopeOf,
} from '../lib/primer-identity';

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

/**
 * Which pool entry a caller means.
 *
 * Every existing call site passes a bare raw id, and most of them will never
 * know that a second register exists — so a bare id keeps resolving to the
 * project record, and only falls through to personal inventory when there is
 * no project record to mean. A caller that needs the other one passes the
 * qualified key, which matches directly.
 */
/** The pool key a stored row lives under. */
function primerKeyOf(row) {
  return makePrimerKey(primerScopeOf(row), primerRawId(row));
}

function resolvePrimerKey(primersById, idOrKey) {
  if (!primersById || idOrKey == null) return null;
  const raw = String(idOrKey);
  if (primersById[raw]) return raw;
  const qualified = makePrimerKey(PRIMER_SCOPE_GLOBAL, raw);
  return primersById[qualified] ? qualified : null;
}

function normalizePrimer(input, { projectId, status, origin, scope } = {}) {
  if (!input || !input.id) return null;
  // `null` means the source never stated the full oligo; `''` would claim we
  // know it is empty. A record with an unknown oligo is still a real record.
  const seq = typeof input.sequence === 'string' ? input.sequence : null;
  // PRIMER-LIVE-1 — the register this record belongs to. `project` is the
  // default for everything that came before, so the pool key of an ordinary
  // record stays the bare raw id and every existing consumer is unaffected.
  // Only a personal-inventory record carries the qualifier — which is exactly
  // what stops it from overwriting a project record with the same raw id.
  // Scope comes from the CALLER or from the record's own explicit field — never
  // inferred from the shape of the id. A donor `.bodge` names its own ids, so
  // reading `global:` off an incoming id and believing it is precisely how a
  // file talks its way into the freezer. Anything unstated is a project record.
  const scp = normalizeScope(scope ?? input.scope);
  // Strip the qualifier that belongs to the RESOLVED scope, not to whatever
  // the incoming id happens to look like: a donor's `global:x` is a project
  // raw id in full, not `x` in the freezer's namespace.
  const rawId = primerRawId({ ...input, scope: scp });
  const isGlobal = scp === PRIMER_SCOPE_GLOBAL;
  return {
    id: makePrimerKey(scp, rawId),
    rawId,
    scope: scp,
    name: input.name || 'primer',
    sequence: seq,
    // PRIMER-7 (V173) — binding (anneals to template) + 5'-tail (overhang) kept
    // separate so PrimerTrack matches the binding, not tail+binding, and draws
    // the tail as an overhang. bindingSequence null ⇒ consumers fall back to seq.
    bindingSequence: input.bindingSequence || null,
    // Optional opt-in for deterministic M/X/I/D annealing. `null` keeps the
    // legacy suffix-split resolver path; only the named model changes meaning.
    bindingModel: input.bindingModel === 'aligned-v1' ? 'aligned-v1' : null,
    // PRIMER-AUDIT (V174) — accept both ecosystem field names (assembly `tail`,
    // PCR-mode/local-primer-design `tailSequence`); canonicalize to `tail`.
    // ANN-0L C1 — `null` means the source never stated an overhang; `''` means
    // it proved there is none. Collapsing the first into the second invented a
    // fact about the oligo that no file ever claimed.
    tail: typeof input.tail === 'string' ? input.tail
      : (typeof input.tailSequence === 'string' ? input.tailSequence
        : (input.tail === null ? null : '')),
    tm: typeof input.tm === 'number' ? input.tm : null,
    length: typeof input.length === 'number' ? input.length : (seq ? seq.length : 0),
    direction: input.direction || null,
    // Free-form description — a searchable dimension (primerToDocument.textFields.description).
    // Kept so a legacy kind='primer' LibraryEntry's description survives migration into the pool.
    description: input.description || null,
    // Personal inventory is not inside any project: a tube in the freezer does
    // not belong to the assembly that happened to be open when it was logged,
    // and letting one in would export it with the next `.bodge`.
    projectId: isGlobal
      ? null
      : (projectId === undefined ? (input.projectId ?? null) : (projectId ?? null)),
    status: VALID_STATUSES.has(status) ? status : (input.status || 'imported'),
    // ANN-0L C1 — the caller's store context SUPPLEMENTS the record's own
    // provenance. Replacing it wholesale erased `format`, `sourceRecordIndex`
    // and `sourceId`, so two records from one file became indistinguishable.
    origin: (origin || input.origin)
      ? { ...(origin || {}), ...(input.origin || {}) }
      : defaultOrigin(),
    resourceHash: input.resourceHash || null,
    // ANN-0L record v2 — a primer may declare `0..N` binding sites, and the
    // full oligo / annealed part / tail are three separate facts. Dropping
    // these here erased the source sites the maps and SequenceView need, and
    // turned "unknown oligo" into an empty string.
    schemaVersion: input.schemaVersion || null,
    sites: Array.isArray(input.sites) ? input.sites.map((x) => ({ ...x })) : [],
    sequenceSource: input.sequenceSource || null,
    // PRIMER-3 — free-form user tags (колония / seq / fwd…). UI filter + chips.
    tags: Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string' && t) : [],
    // PRIMER-LIVE-1 — chemical modifications are part of WHICH TUBE this is:
    // the same bases carrying a 5' phosphate is a different thing you would
    // have to order separately. Dropping them here would silently merge two
    // real reagents into one.
    modifications: normalizeModifications(input.modifications),
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
  addPrimerToPool: async ({
    primer, projectId = null, status = 'imported', origin = null, scope,
  }) => {
    const safe = normalizePrimer(primer, {
      projectId, status, origin, scope,
    });
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
   * for all (or use `{}` for unfiltered). `{scope: 'global'}` is the personal
   * inventory view.
   */
  getPrimerPoolByFilter: (filter = {}) => {
    let rows = Object.values(get().primersById || {});
    if ('projectId' in filter) {
      const target = filter.projectId ?? null;
      rows = rows.filter(r => (r.projectId ?? null) === target);
    }
    if (filter.scope) {
      const scp = normalizeScope(filter.scope);
      rows = rows.filter((r) => primerScopeOf(r) === scp);
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
    const key = resolvePrimerKey(get().primersById, primerId);
    const existing = key ? get().primersById[key] : null;
    if (!existing || !patch || typeof patch !== 'object') return null;
    const name = typeof patch.name === 'string' ? patch.name.trim() : null;
    const tags = Array.isArray(patch.tags)
      ? patch.tags.filter((t) => typeof t === 'string' && t)
      : null;
    const next = { ...existing };
    if (name) next.name = name;
    if (tags) next.tags = tags;
    set((state) => {
      const e = state.primersById[key];
      if (!e) return;
      if (name) e.name = name;
      if (tags) e.tags = tags;
    });
    await putPrimer(next);
    return next;
  },

  promotePrimerStatus: async (primerId, newStatus) => {
    if (!VALID_STATUSES.has(newStatus)) return null;
    const key = resolvePrimerKey(get().primersById, primerId);
    const existing = key ? get().primersById[key] : null;
    if (!existing) return null;
    const next = { ...existing, status: newStatus };
    set(state => {
      const e = state.primersById[key];
      if (e) e.status = newStatus;
    });
    await putPrimer(next);
    return next;
  },

  /**
   * PRIMER-LIVE-1 — edit the primer the biolog is looking at.
   *
   * «Edit» has to mean edit. Re-creating the record under a fresh id left the
   * original behind as a duplicate, and the new copy lost everything the
   * dialog does not ask about: the binding sites it was anchored to, its
   * modifications, and the reference to the freezer tube it reuses. So this
   * patches IN PLACE and preserves every field the caller did not name.
   */
  editPrimerInPlace: async (primerIdOrKey, patch = {}) => {
    const key = resolvePrimerKey(get().primersById, primerIdOrKey);
    const existing = key ? get().primersById[key] : null;
    if (!existing) return null;

    const physicalChanged = ['sequence', 'bindingSequence', 'tail', 'modifications']
      .some((field) => Object.prototype.hasOwnProperty.call(patch, field)
        && JSON.stringify(patch[field]) !== JSON.stringify(existing[field]));
    const next = { ...existing };
    if (typeof patch.name === 'string' && patch.name.trim()) next.name = patch.name.trim();
    if (typeof patch.sequence === 'string' && patch.sequence) next.sequence = patch.sequence;
    if (typeof patch.bindingSequence === 'string') next.bindingSequence = patch.bindingSequence;
    if (patch.bindingModel === 'aligned-v1') next.bindingModel = 'aligned-v1';
    if (typeof patch.tail === 'string') next.tail = patch.tail;
    if (patch.direction === 'forward' || patch.direction === 'reverse') {
      next.direction = patch.direction;
    }
    if (Array.isArray(patch.modifications)) {
      next.modifications = normalizeModifications(patch.modifications);
    }
    // Sites are the record's ANCHOR. They are replaced only when the caller
    // deliberately supplies new ones — an edit dialog that never mentions them
    // must not silently strip the evidence of where the oligo binds.
    if (Array.isArray(patch.sites)) next.sites = patch.sites.map((x) => ({ ...x }));
    if (patch.tm === null) next.tm = null;
    else if (typeof patch.tm === 'number') next.tm = patch.tm;
    // resourceHash identifies the physical oligo. It cannot survive any edit
    // to the full/split sequence or its modifications; async persistence may
    // compute a fresh identity later, but the old one is never truthful.
    if (physicalChanged) next.resourceHash = null;
    next.length = typeof next.sequence === 'string' ? next.sequence.length : next.length;

    set((state) => { state.primersById[key] = next; });
    await putPrimer(next);
    return next;
  },

  /**
   * PRIMER-LIVE-1 — «I have this one now.»
   *
   * Receiving an oligo is a statement about a PHYSICAL TUBE, and a tube does
   * not belong to a project. So this does not move or relabel the project
   * record: the design stays where it is, and a separate global record is
   * ensured for the physical reagent.
   *
   * Idempotent on physical identity — full oligo plus modifications — so
   * marking two project records that happen to be the same oligo received does
   * not invent two tubes, while a different modification correctly does.
   */
  ensureLabStockPrimer: async (primerIdOrKey) => {
    const key = resolvePrimerKey(get().primersById, primerIdOrKey);
    const source = key ? get().primersById[key] : null;
    if (!source) return null;
    const identity = physicalIdentityKey(source);
    // An oligo whose sequence nobody stated cannot be claimed to be in a
    // freezer: there would be no way to know what is in the tube.
    if (!identity) return null;

    const existing = Object.values(get().primersById).find(
      (r) => r && primerScopeOf(r) === PRIMER_SCOPE_GLOBAL
        && physicalIdentityKey(r) === identity,
    );
    if (existing) {
      if (existing.status === 'received') return existing;
      return get().promotePrimerStatus(primerKeyOf(existing), 'received');
    }

    return get().addPrimerToPool({
      primer: {
        id: `stock-${primerRawId(source)}`,
        name: source.name,
        sequence: source.sequence,
        bindingSequence: source.bindingSequence,
        bindingModel: source.bindingModel,
        tail: source.tail,
        tm: source.tm,
        length: source.length,
        direction: source.direction,
        modifications: source.modifications,
        // Where the physical oligo came from — the design it was ordered for.
        origin: { kind: 'lab-stock', fromPrimerId: primerRawId(source) },
      },
      scope: PRIMER_SCOPE_GLOBAL,
      status: 'received',
    });
  },

  removePrimerFromPool: async (primerId) => {
    const key = resolvePrimerKey(get().primersById, primerId);
    if (!key || !get().primersById[key]) return;
    set(state => { delete state.primersById[key]; });
    await deletePrimer(key);
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
