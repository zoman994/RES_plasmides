/**
 * search-prefs — persisted advanced search settings (P2).
 *
 * The smart box works with zero configuration; everything here lives in the GLOBAL
 * «Настройки поиска» window (each item explained: what it does + why). Persistence
 * must be defensive — a corrupted or out-of-range value can never break search:
 * `validateSearchPrefs` clamps numbers, coerces booleans, falls invalid enums back
 * to their default and drops unknown keys. Pure validate; load/save are thin,
 * SSR-guarded localStorage wrappers.
 *
 * SCHEMA v2 (K3.0) dropped two controls that had stopped meaning anything: `iupac`
 * («неоднозначные коды») and `maxMismatches` («допуск несовпадений») — DNA search is
 * ACGT-only and the threshold is its sole acceptance rule. A known older version is
 * MIGRATED, not reset: someone who deliberately chose 92%, one strand and 500 results
 * keeps all three. A version we do not recognise falls back to defaults IN MEMORY only —
 * see `loadSearchPrefs` for why it must never be written over.
 */

export const SEARCH_PREFS_SCHEMA_VERSION = 2;
/** The storage slot is deliberately NOT renamed on a schema bump — a new key would strand the
 * user's real settings under the old one, which is a reset wearing a migration's clothes. */
export const SEARCH_PREFS_STORAGE_KEY = 'bodgegene.searchPrefs.v1';
const KNOWN_SCHEMA_VERSIONS = [1, 2];
/** Versions we know how to read AND rewrite. Strictly narrower than «not the current one»:
 * an unknown version is precisely the case where rewriting would destroy data we cannot read. */
const MIGRATABLE_SCHEMA_VERSIONS = [1];

export const DEFAULT_SEARCH_PREFS = Object.freeze({
  schemaVersion: SEARCH_PREFS_SCHEMA_VERSION,
  identityThreshold: 0.8, // «порог сходства» — hits below this % are hidden.
  bothStrands: true, //      «обе цепи» — also search the reverse-complement.
  circular: 'auto', //       «кольцевой поиск» auto/on/off — let a motif span the origin.
  minQueryLen: 8, //         «мин. длина ДНК-запроса» — shorter is treated as a name, not a motif.
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
  circular: ENUM(['auto', 'on', 'off']),
  minQueryLen: NUM(4, 30),
  headVersionsOnly: BOOL,
  limit: NUM(10, 1000),
};

/**
 * Coerce any raw object into a complete, in-range prefs object. Unknown keys — including the
 * retired `iupac` / `maxMismatches` — are dropped; every surviving field is carried across a
 * known schema version. Only an UNRECOGNISED `schemaVersion` falls back to defaults, because
 * that is the one case where we genuinely cannot say what the stored values meant.
 * @param {Object} raw
 * @returns {typeof DEFAULT_SEARCH_PREFS}
 */
export function validateSearchPrefs(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SEARCH_PREFS };
  if (raw.schemaVersion !== undefined && !KNOWN_SCHEMA_VERSIONS.includes(raw.schemaVersion)) {
    return { ...DEFAULT_SEARCH_PREFS };
  }
  const out = { schemaVersion: SEARCH_PREFS_SCHEMA_VERSION };
  for (const key of Object.keys(FIELD)) {
    out[key] = FIELD[key](raw[key], DEFAULT_SEARCH_PREFS[key]);
  }
  return out;
}

/**
 * Read + validate persisted prefs; defaults on absent / corrupt / SSR.
 *
 * Exactly three cases, and the difference between them is what protects the user's settings:
 *   • a MIGRATABLE older version (v1) — validated and written back once, so the retired keys
 *     stop living on disk and a later reader is not told `schemaVersion: 1` about v2 data;
 *   • the CURRENT version — read only. A read path that writes on every call would churn
 *     storage on each prefs lookup;
 *   • anything else (a future version, or a payload with no version at all) — defaults for
 *     this session, and the stored bytes are LEFT ALONE. This is the case that matters: an
 *     older build opening settings written by a newer one must not overwrite them, or the
 *     user loses their real configuration the moment they go back. Code that cannot read a
 *     format has no business rewriting it.
 *
 * The write-back is best-effort: if storage refuses (quota, private mode, a locked profile)
 * the user still gets the settings we just read correctly — a failed write is no reason to
 * hand them defaults.
 */
export function loadSearchPrefs() {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_SEARCH_PREFS };
    const raw = localStorage.getItem(SEARCH_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SEARCH_PREFS };
    const parsed = JSON.parse(raw);
    const version = parsed && typeof parsed === 'object' ? parsed.schemaVersion : undefined;
    if (!KNOWN_SCHEMA_VERSIONS.includes(version)) return { ...DEFAULT_SEARCH_PREFS };
    const valid = validateSearchPrefs(parsed);
    if (MIGRATABLE_SCHEMA_VERSIONS.includes(version)) {
      try {
        localStorage.setItem(SEARCH_PREFS_STORAGE_KEY, JSON.stringify(valid));
      } catch { /* best effort — the validated value above is still correct */ }
    }
    return valid;
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
