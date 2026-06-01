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

  /** Delete a net-new user feature. */
  deleteUserFeature: async (id) => {
    if (!id || !get().commonFeatures.userFeatures[id]) return;
    set((state) => { delete state.commonFeatures.userFeatures[id]; });
    await deleteCommonFeature(id);
    invalidateMergedCache();
  },
});
