/**
 * search-prefs — persisted advanced search settings (P2).
 *
 * The smart box works with zero configuration; everything here lives in the GLOBAL
 * «Настройки поиска» window (each item explained: what it does + why). Persistence
 * must be defensive — a corrupted, out-of-range, or stale-schema value can never
 * break search: `validateSearchPrefs` clamps numbers, coerces booleans, falls
 * invalid enums back to their default, drops unknown keys, and a schema bump resets
 * to defaults. Pure validate; load/save are thin, SSR-guarded localStorage wrappers.
 */

export const SEARCH_PREFS_SCHEMA_VERSION = 1;
export const SEARCH_PREFS_STORAGE_KEY = 'bodgegene.searchPrefs.v1';

export const DEFAULT_SEARCH_PREFS = Object.freeze({
  schemaVersion: SEARCH_PREFS_SCHEMA_VERSION,
  identityThreshold: 0.8, // «порог сходства» — hits below this % are hidden.
  bothStrands: true, //      «обе цепи» — also search the reverse-complement.
  iupac: 'auto', //          «неоднозначные коды» auto/on/off — treat N/R/Y… as compatibility.
  circular: 'auto', //       «кольцевой поиск» auto/on/off — let a motif span the origin.
  minQueryLen: 8, //         «мин. длина ДНК-запроса» — shorter is treated as a name, not a motif.
  maxMismatches: 0, //       «допуск несовпадений» for the exact-short path.
  headVersionsOnly: true, // «только последние версии» — skip historical lineage members.
  limit: 200, //             «макс. результатов».
});

// Per-field validators: [coerce/clamp fn]. Enums list allowed values.
const NUM = (min, max) => (v, def) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() && Number.isFinite(+v) ? +v : NaN);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
};
const BOOL = (v, def) => (typeof v === 'boolean' ? v : (v === 0 || v === 1 ? !!v : def));
const ENUM = (allowed) => (v, def) => (allowed.includes(v) ? v : def);

const FIELD = {
  identityThreshold: NUM(0.5, 1),
  bothStrands: BOOL,
  iupac: ENUM(['auto', 'on', 'off']),
  circular: ENUM(['auto', 'on', 'off']),
  minQueryLen: NUM(4, 30),
  maxMismatches: NUM(0, 5),
  headVersionsOnly: BOOL,
  limit: NUM(10, 1000),
};

/**
 * Coerce any raw object into a complete, in-range prefs object. A missing or stale
 * `schemaVersion` → defaults. Unknown keys are dropped.
 * @param {Object} raw
 * @returns {typeof DEFAULT_SEARCH_PREFS}
 */
export function validateSearchPrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SEARCH_PREFS };
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== SEARCH_PREFS_SCHEMA_VERSION) {
    return { ...DEFAULT_SEARCH_PREFS };
  }
  const out = { schemaVersion: SEARCH_PREFS_SCHEMA_VERSION };
  for (const key of Object.keys(FIELD)) {
    out[key] = FIELD[key](raw[key], DEFAULT_SEARCH_PREFS[key]);
  }
  return out;
}

/** Read + validate persisted prefs; defaults on absent / corrupt / SSR. */
export function loadSearchPrefs() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SEARCH_PREFS };
    const raw = localStorage.getItem(SEARCH_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SEARCH_PREFS };
    return validateSearchPrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SEARCH_PREFS };
  }
}

/** Validate then persist; returns the validated object actually stored. */
export function saveSearchPrefs(prefs) {
  const valid = validateSearchPrefs(prefs);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, JSON.stringify(valid));
    }
  } catch { /* quota / SSR — keep the in-memory value */ }
  return valid;
}

/** Restore + persist defaults («Сбросить к умолчаниям»). */
export function resetSearchPrefs() {
  return saveSearchPrefs({ ...DEFAULT_SEARCH_PREFS });
}
