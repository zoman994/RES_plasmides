/**
 * customEnzymesSlice (RS-C1) — account-global overlay for user-defined
 * restriction enzymes + named enzyme sets («Сайты рестрикции»). Mirror of
 * commonFeaturesSlice: net-new user data persisted to a Dexie table (v7),
 * hydrated on cold start, surviving project churn.
 *
 * Custom enzymes are normalised into the SAME shape as restriction-db.js
 * RE_ENZYMES, so the scan/digest engine (RS-C2) consumes selectMergedREEnzymes
 * transparently. Bio-invariant (Rule 1): Type II ONLY — never Golden Gate.
 */
import {
  putCustomEnzyme,
  deleteCustomEnzyme as dbDeleteCustomEnzyme,
  listCustomEnzymes,
  putEnzymeSet,
  deleteEnzymeSet as dbDeleteEnzymeSet,
  listEnzymeSets,
} from '../db/dexie-schema';
import { makeId } from '../lib/ids';
import { setCustomEnzymeRegistry } from '../restriction-db';
import {
  validateCustomEnzyme,
  normalizeCustomEnzyme,
  mergeREEnzymes,
  BUILTIN_ENZYME_SETS,
} from '../lib/custom-enzymes';

// Push the current custom enzymes (keyed by NAME) into the restriction-db scan
// engine so scanAllSites/digest/searchRE see them (RS-C2). Decoupled: the engine
// never imports the store; the store pushes here on every change.
function syncRegistry(byId) {
  const byName = {};
  for (const rec of Object.values(byId || {})) {
    if (rec && rec.name) byName[rec.name] = rec;
  }
  setCustomEnzymeRegistry(byName);
}

// ── merged RE-dict cache ──────────────────────────────────────────────
// scanAllSites (RS-C2) reads selectMergedREEnzymes per render; cache the merge
// keyed by the `byId` object reference (Immer swaps it on every mutation) so we
// only re-spread when custom enzymes actually change.
let _mergeCache = { src: null, val: null };

/** Built-in RE_ENZYMES merged with the user's custom enzymes (by name). */
export function selectMergedREEnzymes(state) {
  const byId = (state && state.customEnzymes && state.customEnzymes.byId) || {};
  if (_mergeCache.src === byId) return _mergeCache.val;
  const val = mergeREEnzymes(byId);
  _mergeCache = { src: byId, val };
  return val;
}

/**
 * All enzyme sets: built-in presets (origin:'preset') + user sets (origin:'user').
 * A preset is EDITABLE (Игорь 22.06): an override record stored in `sets` under
 * the preset's id replaces its name/enzymes (origin stays 'preset', `edited:true`);
 * deleting that override restores the built-in default.
 */
export function selectAllEnzymeSets(state) {
  const sets = (state && state.customEnzymes && state.customEnzymes.sets) || {};
  const presetIds = new Set(BUILTIN_ENZYME_SETS.map((p) => p.id));
  const out = BUILTIN_ENZYME_SETS.map((p) => {
    const ov = sets[p.id];
    return ov
      ? { ...p, name: ov.name != null ? ov.name : p.name, enzymes: ov.enzymes != null ? ov.enzymes : p.enzymes, origin: 'preset', edited: true }
      : { ...p, origin: 'preset' };
  });
  for (const s of Object.values(sets)) {
    if (presetIds.has(s.id)) continue; // a preset override — already merged above
    out.push({ ...s, isPreset: false, origin: 'user' });
  }
  return out;
}

/** The user's custom enzyme records (excludes built-ins). */
export function selectCustomEnzymes(state) {
  return Object.values((state && state.customEnzymes && state.customEnzymes.byId) || {});
}

export const createCustomEnzymesSlice = (set, get) => ({
  customEnzymes: {
    byId: {}, // id -> normalised enzyme record (isCustom:true)
    sets: {}, // id -> { id, name, enzymes:[name,...], createdAt }
    _hydrated: false,
  },

  hydrateCustomEnzymes: async () => {
    if (get().customEnzymes._hydrated) return;
    const [enzymes, sets] = await Promise.all([listCustomEnzymes(), listEnzymeSets()]);
    set((state) => {
      state.customEnzymes.byId = {};
      state.customEnzymes.sets = {};
      for (const e of enzymes) if (e && e.id) state.customEnzymes.byId[e.id] = e;
      for (const s of sets) if (s && s.id) state.customEnzymes.sets[s.id] = s;
      state.customEnzymes._hydrated = true;
    });
    syncRegistry(get().customEnzymes.byId);
  },

  /**
   * Add a custom enzyme. Validates first; on success normalises into the
   * RE_ENZYMES shape and persists.
   * @returns {Promise<{ok:boolean, id?:string, errors?:Array}>}
   */
  addCustomEnzyme: async (payload) => {
    const v = validateCustomEnzyme(payload);
    if (!v.ok) return { ok: false, errors: v.errors };
    const id = makeId();
    const rec = normalizeCustomEnzyme(payload, { id, createdAt: new Date().toISOString() });
    set((state) => { state.customEnzymes.byId[id] = rec; });
    syncRegistry(get().customEnzymes.byId);
    await putCustomEnzyme(rec);
    return { ok: true, id };
  },

  /** Update a custom enzyme; re-validates + re-derives end/overhang. */
  updateCustomEnzyme: async (id, patch) => {
    const existing = get().customEnzymes.byId[id];
    if (!existing) return { ok: false };
    const merged = { ...existing, ...patch };
    const v = validateCustomEnzyme(merged);
    if (!v.ok) return { ok: false, errors: v.errors };
    // A field-level patch (e.g. only cut) must NOT keep the stale end/overhang;
    // drop them unless the patch set them explicitly so they re-derive.
    const seed = { ...merged };
    if (!('end' in patch)) delete seed.end;
    if (!('overhang' in patch)) delete seed.overhang;
    const rec = normalizeCustomEnzyme(seed, { id, createdAt: existing.createdAt });
    set((state) => { state.customEnzymes.byId[id] = rec; });
    syncRegistry(get().customEnzymes.byId);
    await putCustomEnzyme(rec);
    return { ok: true, id };
  },

  /** Delete a custom enzyme. */
  removeCustomEnzyme: async (id) => {
    if (!get().customEnzymes.byId[id]) return;
    set((state) => { delete state.customEnzymes.byId[id]; });
    syncRegistry(get().customEnzymes.byId);
    await dbDeleteCustomEnzyme(id);
  },

  /** Create a named enzyme set. @returns {Promise<{ok:boolean, id:string}>} */
  addEnzymeSet: async (name, enzymes = []) => {
    const id = makeId();
    const rec = {
      id,
      name: (typeof name === 'string' ? name.trim() : '') || 'Набор',
      enzymes: Array.isArray(enzymes) ? enzymes.slice() : [],
      createdAt: new Date().toISOString(),
    };
    set((state) => { state.customEnzymes.sets[id] = rec; });
    await putEnzymeSet(rec);
    return { ok: true, id };
  },

  /**
   * Update a named enzyme set (rename / change membership). Works for user sets
   * AND built-in presets — editing a preset stores an OVERRIDE record under the
   * preset's id (seeded from the built-in), so the change survives + can be reset.
   */
  updateEnzymeSet: async (id, patch) => {
    const existing = get().customEnzymes.sets[id];
    const preset = BUILTIN_ENZYME_SETS.find((p) => p.id === id);
    if (!existing && !preset) return;
    const base = existing || { id, name: preset.name, enzymes: preset.enzymes.slice() };
    const rec = {
      ...base, ...patch, id,
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      ...(preset ? { overridesPreset: true } : {}),
    };
    set((state) => { state.customEnzymes.sets[id] = rec; });
    await putEnzymeSet(rec);
  },

  /**
   * Delete a user set; for a preset's override id this RESETS the preset to its
   * built-in default (selectAllEnzymeSets falls back when no override exists).
   */
  removeEnzymeSet: async (id) => {
    if (!get().customEnzymes.sets[id]) return;
    set((state) => { delete state.customEnzymes.sets[id]; });
    await dbDeleteEnzymeSet(id);
  },
});
