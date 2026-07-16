/**
 * search-modes — declarative user-facing search MODES (§9.2) and the "+ Filter"
 * definitions (§9.3) for the Stage-3 visual selector.
 *
 * DERIVED from the single PREFIX_REGISTRY — this module owns only the grouping
 * and ordering; every mode's canonical / labelKey / providerIntent / includeKinds
 * comes from the registry, so a UI array can never drift from the parser (§5).
 * This is the option list a molecular biologist sees in the mode dropdown — a
 * different concern from SEARCH_PROFILES (per-surface capability), whose
 * `{ providers, entityScope }` shape is exactly the capability contract below.
 *
 * Pure structural data + a pure gate. No React/store/engine imports.
 *
 * @typedef {{ id:string, canonical:string, group:'userData'|'bio'|'reference',
 *   labelKey:string, providerIntent:string, includeKinds:string[],
 *   category:string }} SearchMode
 */
import { prefixEntry } from './search-prefix-registry';

/**
 * Group order + membership (§9.2). The ONLY hand-authored structure; each mode
 * object is derived from the registry entry for that canonical key.
 * @type {Array<{ id:string, labelKey:string, modeIds:string[] }>}
 */
export const SEARCH_MODE_GROUPS = [
  { id: 'userData', labelKey: 'search.modeGroup.userData', modeIds: ['lib', 'mol', 'primer', 'project'] },
  { id: 'bio', labelKey: 'search.modeGroup.bio', modeIds: ['seq', 'aa', 'cut'] },
  { id: 'reference', labelKey: 'search.modeGroup.reference', modeIds: ['enz'] },
];

const GROUP_OF = {};
for (const g of SEARCH_MODE_GROUPS) for (const id of g.modeIds) GROUP_OF[id] = g.id;

/** Build a mode object from its registry entry (single source of truth). */
function deriveMode(canonical) {
  const e = prefixEntry(canonical);
  if (!e) return null;
  return {
    id: e.canonical,
    canonical: e.canonical,
    group: GROUP_OF[e.canonical],
    labelKey: e.labelKey,
    providerIntent: e.providerIntent,
    includeKinds: e.includeKinds || [],
    category: e.category,
  };
}

/** @type {Record<string, SearchMode>} — derived, not duplicated. */
export const SEARCH_MODES = (() => {
  const out = {};
  for (const g of SEARCH_MODE_GROUPS) for (const id of g.modeIds) {
    const m = deriveMode(id);
    if (m) out[id] = m;
  }
  return out;
})();

/**
 * "+ Filter" items (§9.3). name/annotation/tag take free text; type/status are
 * chosen from an enum; project is an ENTITY picker (§617) — it resolves a stable
 * `projectId`, never a typed name (two projects can share a name). The selector
 * receives enum/entity options as props.
 *
 * @typedef {{ id:string, canonical:string, labelKey:string,
 *   inputType:'text'|'enum'|'entity', enumKey?:string, entityKind?:string }} SearchFilterDef
 * @type {SearchFilterDef[]}
 */
export const SEARCH_FILTER_DEFS = [
  { id: 'name', canonical: 'name', labelKey: 'search.filter.name', inputType: 'text' },
  { id: 'feature', canonical: 'feature', labelKey: 'search.filter.annotation', inputType: 'text' },
  { id: 'tag', canonical: 'tag', labelKey: 'search.filter.tag', inputType: 'text' },
  { id: 'type', canonical: 'type', labelKey: 'search.filter.type', inputType: 'enum', enumKey: 'type' },
  { id: 'status', canonical: 'status', labelKey: 'search.filter.status', inputType: 'enum', enumKey: 'status' },
  { id: 'project', canonical: 'in', labelKey: 'search.filter.project', inputType: 'entity', entityKind: 'project' },
];

// lib (the default scope) and mol are ALWAYS offered: they are the guaranteed
// user-data reach of any selector-bearing surface.
const GUARANTEED = new Set(['lib', 'mol']);

function toSet(x) {
  if (x instanceof Set) return x;
  if (Array.isArray(x)) return new Set(x);
  return null; // absent → no capability on this axis
}

// A capability axis is well-formed only if absent (undefined) or an array/Set.
// A PRESENT-but-malformed axis (e.g. a string) invalidates the whole object.
function validAxis(x) {
  return x === undefined || Array.isArray(x) || x instanceof Set;
}

/**
 * Is `mode` available under `{ providers, entityScope }`? FAIL-CLOSED:
 *   • lib/mol are always available;
 *   • a scope mode (primer/project) needs its entity kind in `entityScope`;
 *   • a provider/preset mode (seq/aa/cut/enz) needs its providerIntent in
 *     `providers`;
 *   • when the required capability set is missing/malformed → false.
 */
function modeAvailable(mode, providers, kinds) {
  if (GUARANTEED.has(mode.id)) return true;
  if (mode.category === 'scope') {
    if (!kinds) return false;
    return (mode.includeKinds || []).every((k) => kinds.has(k));
  }
  if (!providers) return false;
  return providers.has(mode.providerIntent);
}

/**
 * The grouped, capability-gated mode list for the selector. `capabilities` is a
 * `{ providers, entityScope }` object (a SearchProfile has exactly this shape).
 * FAIL-CLOSED: null / malformed → only the guaranteed lib + mol; a group left
 * with no visible modes is dropped.
 *
 * @param {{ providers?:string[]|Set<string>, entityScope?:string[]|Set<string> }|null} [capabilities]
 * @returns {Array<{ id:string, labelKey:string, modes:SearchMode[] }>}
 */
export function visibleModeGroups(capabilities = null) {
  // Validate BOTH axes up front: the frozen contract is that a malformed
  // capability object as a whole → only lib/mol. So if either present axis is
  // the wrong shape, discard BOTH (a valid half must not leak modes through).
  const wellFormed = capabilities != null && typeof capabilities === 'object'
    && validAxis(capabilities.providers) && validAxis(capabilities.entityScope);
  const providers = wellFormed ? toSet(capabilities.providers) : null;
  const kinds = wellFormed ? toSet(capabilities.entityScope) : null;
  return SEARCH_MODE_GROUPS
    .map((g) => ({
      id: g.id,
      labelKey: g.labelKey,
      modes: g.modeIds
        .map((id) => SEARCH_MODES[id])
        .filter((m) => m && modeAvailable(m, providers, kinds)),
    }))
    .filter((g) => g.modes.length > 0);
}
