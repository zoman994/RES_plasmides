/**
 * commonFeaturesSlice — account-global overlay for the common-features DB
 * (SPEC_COMMON_FEATURES). The shipped `common-features.json` stays a
 * read-only static asset; this slice holds net-new user features +
 * field-wise overrides of factory features (keyed by the factory id), so
 * a future shipped DB update never clobbers the biolog's edits, and a
 * reset-to-factory is always possible (DEC-CF-01/02).
 *
 * The matcher merges built-in + overlay via `getMergedFeatureDB` before
 * detection (DEC-CF-03); the merged result is cached separately from
 * loadFeatureDB's static cache and invalidated on ANY overlay mutation so
 * the next detection sees the edit. Dedup on promote reuses the SAME
 * match-core scoring as detection (DEC-CF-04, via lib/feature-dedup).
 */
import {
  putCommonFeature,
  listCommonFeatures,
  deleteCommonFeature,
} from '../db/dexie-schema';
import { makeId } from '../lib/ids';
import { loadFeatureDB } from '../feature-detection';
import { checkDuplicateAgainst } from '../lib/feature-dedup';
import { useStore } from './index';

// ── merged-DB cache (DEC-CF-03) ───────────────────────────────────────
// Invalidated on every overlay mutation; the built-in `_db` cache inside
// feature-detection.js is untouched (it's the immutable factory asset).
let _mergedCache = null;
let _mergedDirty = true;

export function invalidateMergedCache() {
  _mergedCache = null;
  _mergedDirty = true;
}

// ── Debounced Dexie persistence for live in-viewer editing (DEC-CF-12) ──
// Per-keystroke edits (sequence/name/type) update the store IMMEDIATELY but
// coalesce the Dexie write — a put on every character is heavy. Keyed by
// record id (user id or override baseId). reset/delete cancel any pending
// write so a late timer can't resurrect a removed record.
const EDIT_DEBOUNCE_MS = 400;
const _pendingWrites = new Map(); // id -> { timer, record }

function scheduleWrite(id, record) {
  const prev = _pendingWrites.get(id);
  if (prev?.timer) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    _pendingWrites.delete(id);
    putCommonFeature(record).catch(() => {});
  }, EDIT_DEBOUNCE_MS);
  _pendingWrites.set(id, { timer, record });
}

function cancelWrite(id) {
  const prev = _pendingWrites.get(id);
  if (prev?.timer) clearTimeout(prev.timer);
  _pendingWrites.delete(id);
}

/** Flush all pending debounced writes immediately (panel unmount + tests). */
export function flushCommonFeatureWrites() {
  const writes = [];
  for (const { timer, record } of _pendingWrites.values()) {
    if (timer) clearTimeout(timer);
    writes.push(putCommonFeature(record).catch(() => {}));
  }
  _pendingWrites.clear();
  return Promise.all(writes);
}

/**
 * Built-in common-features DB merged with the account overlay (DEC-CF-03):
 * a factory feature whose id has an override is replaced field-wise; net-new
 * user features are appended. Cached until an overlay mutation invalidates
 * it. Read by detectCommonFeaturesAsync — non-React caller, so the overlay
 * is read via `useStore.getState()`.
 * @returns {Promise<{features:Array}>}
 */
export async function getMergedFeatureDB() {
  if (_mergedCache && !_mergedDirty) return _mergedCache;
  const builtin = await loadFeatureDB();
  const overlay = useStore.getState().commonFeatures || {};
  const overrides = overlay.overrides || {};
  const userFeatures = overlay.userFeatures || {};
  const base = (builtin?.features || []).map((f) => {
    const ov = overrides[f.id];
    return ov ? { ...f, ...ov } : f;
  });
  const features = base.concat(Object.values(userFeatures));
  _mergedCache = { features };
  _mergedDirty = false;
  return _mergedCache;
}

/**
 * Panel view (DEC-CF-06): the merged list tagged with provenance.
 * `builtinFeatures` is supplied by the panel (loaded once via loadFeatureDB)
 * because selectors are sync while the factory DB is fetched.
 * @returns {Array<object>} each feature + `origin:'factory'|'user'|'overridden'`
 */
export function selectMergedCommonFeatures(state, builtinFeatures = []) {
  const overlay = state?.commonFeatures || {};
  const overrides = overlay.overrides || {};
  const userFeatures = overlay.userFeatures || {};
  const out = [];
  for (const f of builtinFeatures) {
    const ov = overrides[f.id];
    if (ov) out.push({ ...f, ...ov, origin: 'overridden', baseId: f.id });
    else out.push({ ...f, origin: 'factory', baseId: f.id });
  }
  for (const uf of Object.values(userFeatures)) {
    out.push({ ...uf, origin: 'user' });
  }
  return out;
}

function featureLength(payload) {
  if (payload.length != null) return payload.length;
  if (payload.sequence) return payload.sequence.length;
  if (payload.protein) return payload.protein.length * 3;
  return 0;
}

export const createCommonFeaturesSlice = (set, get) => ({
  commonFeatures: {
    userFeatures: {}, // id -> net-new feature record
    overrides: {},    // baseId -> override record
    _hydrated: false,
  },

  hydrateCommonFeatures: async () => {
    if (get().commonFeatures._hydrated) return;
    const rows = await listCommonFeatures();
    set((state) => {
      state.commonFeatures.userFeatures = {};
      state.commonFeatures.overrides = {};
      for (const r of rows) {
        if (!r || !r.id) continue;
        if (r.kind === 'override') state.commonFeatures.overrides[r.baseId || r.id] = r;
        else state.commonFeatures.userFeatures[r.id] = r;
      }
      state.commonFeatures._hydrated = true;
    });
    invalidateMergedCache();
  },

  /**
   * Promote a feature into the user overlay. Dedup via the shared match-core
   * (DEC-CF-04): a true PSO duplicate is rejected with `dupBy`; a bare
   * name-collision is NOT blocked here (the modal warns pre-confirm).
   * @returns {Promise<{ok:boolean, id?:string, dupBy?:object|null}>}
   */
  promoteFeature: async (payload) => {
    if (!payload || (!payload.sequence && !payload.protein)) {
      return { ok: false, dupBy: null };
    }
    const merged = await getMergedFeatureDB();
    const verdict = checkDuplicateAgainst(payload, merged.features);
    if (verdict.duplicate) {
      return { ok: false, dupBy: { by: verdict.by, against: verdict.against } };
    }
    const id = makeId();
    const record = {
      id,
      kind: 'user',
      name: payload.name || '(unnamed)',
      type: payload.type || 'misc_feature',
      length: featureLength(payload),
      createdAt: new Date().toISOString(),
    };
    if (payload.sequence) record.sequence = payload.sequence;
    if (payload.protein) record.protein = payload.protein;
    set((state) => { state.commonFeatures.userFeatures[id] = record; });
    await putCommonFeature(record);
    invalidateMergedCache();
    return { ok: true, id };
  },

  /**
   * Write/update a field-wise override of a factory feature (DEC-CF-03).
   * `patch` carries only the edited fields (name/type/sequence/protein);
   * unset fields fall through to the factory record on merge.
   */
  overrideCommonFeature: async (baseId, patch) => {
    if (!baseId) return;
    const record = {
      ...(get().commonFeatures.overrides[baseId] || {}),
      ...patch,
      id: baseId,
      kind: 'override',
      baseId,
      createdAt: new Date().toISOString(),
    };
    set((state) => { state.commonFeatures.overrides[baseId] = record; });
    await putCommonFeature(record);
    invalidateMergedCache();
  },

  /** Drop an override → the factory feature is restored on next merge. */
  resetCommonFeature: async (baseId) => {
    if (!baseId || !get().commonFeatures.overrides[baseId]) return;
    cancelWrite(baseId); // drop any pending debounced edit-write
    set((state) => { delete state.commonFeatures.overrides[baseId]; });
    await deleteCommonFeature(baseId);
    invalidateMergedCache();
  },

  /**
   * Update a net-new user feature in place (panel inline edit). Counterpart
   * to deleteUserFeature; factory features are edited via overrideCommonFeature
   * instead. (Minor addition beyond SPEC §5's action list — the panel needs to
   * let a biolog fix a typo in their own feature; see sprint report.)
   */
  updateUserFeature: async (id, patch) => {
    const existing = get().commonFeatures.userFeatures[id];
    if (!existing) return;
    const record = { ...existing, ...patch, id, kind: 'user' };
    set((state) => { state.commonFeatures.userFeatures[id] = record; });
    await putCommonFeature(record);
    invalidateMergedCache();
  },

  /**
   * Live in-viewer edit (DEC-CF-12) — store update IMMEDIATE, Dexie write
   * debounced. `target` is the selected merged feature (carries origin/id/
   * baseId): a factory/overridden target writes an override (factory→override
   * on first edit, DEC-CF-03 path), a user target updates the net-new record.
   */
  editCommonFeature: (target, patch) => {
    if (!target || !patch) return;
    if (target.origin === 'user') {
      const id = target.id;
      const existing = get().commonFeatures.userFeatures[id];
      if (!existing) return;
      const record = { ...existing, ...patch, id, kind: 'user' };
      set((state) => { state.commonFeatures.userFeatures[id] = record; });
      invalidateMergedCache();
      scheduleWrite(id, record);
    } else {
      const baseId = target.baseId;
      if (!baseId) return;
      const existing = get().commonFeatures.overrides[baseId] || {};
      const record = {
        ...existing, ...patch, id: baseId, kind: 'override', baseId,
        createdAt: existing.createdAt || new Date().toISOString(),
      };
      set((state) => { state.commonFeatures.overrides[baseId] = record; });
      invalidateMergedCache();
      scheduleWrite(baseId, record);
    }
  },

  /** Delete a net-new user feature. */
  deleteUserFeature: async (id) => {
    if (!id || !get().commonFeatures.userFeatures[id]) return;
    cancelWrite(id); // drop any pending debounced edit-write
    set((state) => { delete state.commonFeatures.userFeatures[id]; });
    await deleteCommonFeature(id);
    invalidateMergedCache();
  },

  /**
   * FEAT-CF-SHARE — bulk import a parsed common-features set (from
   * common-features-io.parseCommonFeatures). User features go through
   * `promoteFeature` so the shared PSO-dedup applies (a feature already present
   * is skipped, not duplicated); overrides re-apply onto the matching factory
   * feature by baseId. Mints fresh ids on this install (no id-clobber).
   * @returns {Promise<{added:number, skipped:number}>}
   */
  importCommonFeatures: async ({ userFeatures = [], overrides = [] } = {}) => {
    let added = 0;
    let skipped = 0;
    for (const uf of userFeatures) {
      // eslint-disable-next-line no-await-in-loop
      const res = await get().promoteFeature({
        name: uf.name, type: uf.type, sequence: uf.sequence, protein: uf.protein,
      });
      if (res && res.ok) added += 1; else skipped += 1;
    }
    for (const ov of overrides) {
      const baseId = ov.baseId || ov.id;
      if (!baseId) { skipped += 1; continue; }
      // eslint-disable-next-line no-await-in-loop
      await get().overrideCommonFeature(baseId, {
        name: ov.name, type: ov.type, sequence: ov.sequence, protein: ov.protein,
      });
      added += 1;
    }
    return { added, skipped };
  },
});
