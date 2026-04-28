/**
 * Parts annotation migration — F3 (Sprint Catalog Polish FIX 28.04.2026).
 *
 * Some `mine` parts persisted before the region/detail/point hierarchy stuck
 * as the canonical shape carry annotations without `level`. `getRegions` is
 * level === 'region' filtered, so empty annotations array → `paths.length === 0`
 * → PlasmidMiniMap renders the empty linker bar. The biolog sees «у линейных
 * нет подписей» — that's the symptom.
 *
 * Migration policy (Игорь 28.04.2026: «Данные не стоят ничего, обновим»):
 *   - For each annotation without `.level`, set `.level = 'region'`.
 *   - Existing `.level` (region | detail | point) is left untouched.
 *   - Marker `partsSchemaVersion: 2` is set on the slice once. Subsequent
 *     rehydrates with marker ≥ 2 are no-ops (idempotent).
 *
 * Pure function — no store coupling. Called from `onRehydrateStorage` in
 * `store/index.js`. Exported separately so unit tests can hit it directly.
 */

export const PARTS_SCHEMA_VERSION = 2;

/**
 * @param {Array} parts — persisted parts list (or undefined / null).
 * @param {number} schemaVersion — current state.partsSchemaVersion.
 * @returns {{ parts: Array, schemaVersion: number, changed: boolean }}
 *   `changed=true` only when at least one annotation got `.level='region'`.
 *   `schemaVersion` is bumped to PARTS_SCHEMA_VERSION regardless of changed,
 *   so the next rehydrate skips this work.
 */
export function migratePartsAnnotationLevel(parts, schemaVersion) {
  if ((schemaVersion || 0) >= PARTS_SCHEMA_VERSION) {
    return { parts: parts || [], schemaVersion: schemaVersion || PARTS_SCHEMA_VERSION, changed: false };
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    return { parts: parts || [], schemaVersion: PARTS_SCHEMA_VERSION, changed: false };
  }
  let anyChanged = false;
  const migrated = parts.map((p) => {
    if (!Array.isArray(p?.annotations) || p.annotations.length === 0) return p;
    let partChanged = false;
    const next = p.annotations.map((a) => {
      if (a && !a.level) {
        partChanged = true;
        return { ...a, level: 'region' };
      }
      return a;
    });
    if (partChanged) {
      anyChanged = true;
      return { ...p, annotations: next };
    }
    return p;
  });
  return { parts: migrated, schemaVersion: PARTS_SCHEMA_VERSION, changed: anyChanged };
}
