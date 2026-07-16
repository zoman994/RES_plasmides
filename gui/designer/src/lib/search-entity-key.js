/**
 * search-entity-key — the globally-unique result identity (REV #2 §10.4).
 *
 * Once `project`, `primer` and `enzyme` results join the `entry` world, a bare `ref.id`
 * is no longer unique: a project, a molecule and a primer can each carry the same local
 * id, and an enzyme's id is its name. `entityRefKey(ref)` derives the composite
 * `<kind>:<id>` used for `SearchResult.entityKey`, the React row key, `docById` lookup,
 * dedup, caches and the selected row.
 *
 * `ref.id` itself stays the RAW entity id — the sequence-nav channel matches the bare
 * entry id, so composite keys are for identity/dedup ONLY, never for navigation.
 *
 * Pure. No store/React imports.
 */

/**
 * @param {import('./search-types').EntityRef} ref
 * @returns {string|null} `<kind>:<id>`, or null for a missing/kindless/idless ref.
 */
export function entityRefKey(ref) {
  if (!ref || typeof ref !== 'object') return null;
  const { kind, id } = ref;
  if (kind == null || id == null) return null;
  return `${kind}:${id}`;
}
