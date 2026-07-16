/**
 * search-prefix-registry — the single source of truth for the query language (REV #2 §5).
 *
 * Every prefix, its EN/RU aliases, category and routing metadata live HERE. The lexer,
 * classifyQuery, the canonical serializer, the mode selector, chips, placeholders, help
 * and the alias tests all derive from this one registry — a separate UI array + a parser
 * regex would inevitably drift (§5).
 *
 * Categories (§4.1):
 *   scope    — lib/mol/primer/project: pick an entityScope; the value is a text clause
 *   provider — seq/aa: a biological compute intent (seqQuery/aaQuery)
 *   preset   — enz: the restriction catalog (enzymeCatalogQuery)
 *   provider — cut (canonical of legacy `re`): cut-site scan (cutQuery, mirrored reQuery)
 *   field    — name/tag/feature: a fieldClause
 *   filter   — type/status/in: a normalized filter clause
 *
 * Pure data + lookups. No React/store/engine imports.
 */

/** @typedef {{ canonical:string, aliases:string[], category:'scope'|'provider'|'preset'|'field'|'filter',
 *   uiPreset?:string, includeKinds?:string[], providerIntent?:string, field?:string,
 *   valueParser?:'text'|'dna'|'protein', labelKey?:string, icon?:string, placeholderKey?:string,
 *   examples?:string[], enabled:boolean, legacy:boolean, readiness?:'executable'|'parse-only' }} PrefixEntry */

/** @type {PrefixEntry[]} */
export const PREFIX_REGISTRY = [
  {
    canonical: 'lib', aliases: ['library', 'библиотека'], category: 'scope',
    uiPreset: 'library', includeKinds: ['entry', 'project', 'primer'], providerIntent: 'metadata',
    valueParser: 'text', labelKey: 'search.mode.library', icon: 'library',
    placeholderKey: 'search.placeholder.library', examples: ['lib:gla'], enabled: true, legacy: false,
  },
  {
    canonical: 'mol', aliases: ['molecule', 'entry', 'construct', 'молекула', 'конструкт'], category: 'scope',
    uiPreset: 'molecule', includeKinds: ['entry'], providerIntent: 'metadata',
    valueParser: 'text', labelKey: 'search.mode.molecule', icon: 'plasmid',
    placeholderKey: 'search.placeholder.molecule', examples: ['mol:pUC'], enabled: true, legacy: false,
  },
  {
    canonical: 'primer', aliases: ['oligo', 'праймер', 'олиго'], category: 'scope',
    uiPreset: 'primer', includeKinds: ['primer'], providerIntent: 'metadata',
    valueParser: 'text', labelKey: 'search.mode.primer', icon: 'primer',
    placeholderKey: 'search.placeholder.primer', examples: ['primer:T7'], enabled: true, legacy: false,
  },
  {
    canonical: 'project', aliases: ['proj', 'проект'], category: 'scope',
    uiPreset: 'project', includeKinds: ['project'], providerIntent: 'metadata',
    valueParser: 'text', labelKey: 'search.mode.project', icon: 'folder',
    placeholderKey: 'search.placeholder.project', examples: ['project:Alpha'], enabled: true, legacy: false,
  },
  {
    canonical: 'seq', aliases: ['dna', 'nt', 'днк', 'посл'], category: 'provider',
    uiPreset: 'sequence', includeKinds: ['entry', 'primer'], providerIntent: 'sequence',
    valueParser: 'dna', labelKey: 'search.mode.sequence', icon: 'dna',
    placeholderKey: 'search.placeholder.sequence', examples: ['seq:GAATTC'], enabled: true, legacy: false,
  },
  {
    canonical: 'aa', aliases: ['protein', 'prot', 'peptide', 'белок', 'пептид'], category: 'provider',
    uiPreset: 'protein', includeKinds: ['entry'], providerIntent: 'protein',
    valueParser: 'protein', labelKey: 'search.mode.protein', icon: 'protein',
    placeholderKey: 'search.placeholder.protein', examples: ['aa:HHHHHH'], enabled: true, legacy: false,
  },
  {
    canonical: 'enz', aliases: ['enzyme', 'restriction', 'фермент', 'рестриктаза'], category: 'preset',
    uiPreset: 'enzymeCatalog', includeKinds: ['enzyme'], providerIntent: 'enzymeCatalog',
    valueParser: 'text', labelKey: 'search.mode.enzymeCatalog', icon: 'scissors',
    placeholderKey: 'search.placeholder.enzymeCatalog', examples: ['enz:EcoRI', 'enz:Bsa'], enabled: true, legacy: false,
  },
  {
    // Canonical for cut-site search; `re` is folded in as a LEGACY alias (§4.1/§4.4) and
    // canonicalizes to `cut` before the search runs. Both set cutQuery (+ transitional reQuery).
    canonical: 'cut', aliases: ['site', 'digest', 'сайт', 'режет', 're'], category: 'provider',
    uiPreset: 'restrictionSites', includeKinds: ['entry'], providerIntent: 'restrictionSites',
    valueParser: 'text', labelKey: 'search.mode.restrictionSites', icon: 'scissors',
    placeholderKey: 'search.placeholder.restrictionSites', examples: ['cut:EcoRI'], enabled: true, legacy: false,
  },
  {
    canonical: 'name', aliases: ['имя', 'название'], category: 'field', field: 'name',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.field.name', examples: ['name:pUC'], enabled: true, legacy: false,
  },
  {
    canonical: 'tag', aliases: ['тег'], category: 'field', field: 'tag',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.field.tag', examples: ['tag:yeast'], enabled: true, legacy: false,
  },
  {
    canonical: 'feature', aliases: ['feat', 'annotation', 'фича', 'аннотация'], category: 'field', field: 'feature',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.field.feature', examples: ['feature:glaA'], enabled: true, legacy: false,
  },
  {
    canonical: 'type', aliases: ['тип'], category: 'filter', field: 'type',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.filter.type', examples: ['type:circular'], enabled: true, legacy: false,
  },
  {
    canonical: 'status', aliases: ['статус'], category: 'filter', field: 'status',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.filter.status', examples: ['status:release'], enabled: true, legacy: false,
  },
  {
    canonical: 'in', aliases: ['within', 'в'], category: 'filter', field: 'withinProject',
    uiPreset: 'library', providerIntent: 'metadata', valueParser: 'text',
    labelKey: 'search.filter.in', examples: ['in:"Gla project"'], enabled: true, legacy: false,
  },
];

// Readiness (§13.7): three separate concerns — a prefix is (a) known to the parser
// [every entry], (b) offered in a selector [`enabled`], and (c) actually executable by
// the engine TODAY. `parse-only` prefixes ARE recognised (so they get a clear
// diagnostic, not a silent no-op), but the engine does not yet consume their structured
// output — fieldClauses (name/feature), the enzyme catalog (enz), scope restriction
// (mol/primer/project), withinProject (in) land in Stages 2–4. `lib` is exactly the
// default scope, so it is executable; `cut`/`re` execute via the reQuery mirror.
// Stage 2 made these EXECUTE: enz (enzymeCatalog routing), mol/primer/project (entity-scope
// narrowing consumed by runSearch). name/feature/in stay parse-only — the engine does not
// consume their fieldClause / withinProject output until Stages 3–4.
const EXECUTABLE_PREFIXES = new Set(['seq', 'aa', 'cut', 'tag', 'type', 'status', 'lib', 'enz', 'mol', 'primer', 'project']);
for (const e of PREFIX_REGISTRY) {
  e.readiness = EXECUTABLE_PREFIXES.has(e.canonical) ? 'executable' : 'parse-only';
}

/** Does the engine consume this prefix's output today (vs parse-only until Stages 2–4)? */
export function isExecutablePrefix(canonical) {
  return EXECUTABLE_PREFIXES.has(canonical);
}

/** Selectable = enabled AND executable — the single gate the selector/help must use so a
 * parse-only prefix is recognised by the parser but not OFFERED to the user yet (§13.7).
 * Distinct from allCanonicalKeys() (everything the parser knows). */
export function selectablePrefixKeys() {
  return PREFIX_REGISTRY.filter((e) => e.enabled && e.readiness === 'executable').map((e) => e.canonical);
}

// canonical/alias (lowercased) → canonical key. Built once.
const LOOKUP = (() => {
  const m = new Map();
  for (const e of PREFIX_REGISTRY) {
    for (const key of [e.canonical, ...e.aliases]) m.set(String(key).toLowerCase(), e.canonical);
  }
  return m;
})();
const BY_CANONICAL = new Map(PREFIX_REGISTRY.map((e) => [e.canonical, e]));

/** The canonical key for a prefix name (canonical or any alias, case-insensitive), or null. */
export function canonicalPrefix(name) {
  if (typeof name !== 'string' || !name) return null;
  return LOOKUP.get(name.toLowerCase()) || null;
}

/** The registry entry for a prefix name (resolving aliases), or null. */
export function resolvePrefix(name) {
  const c = canonicalPrefix(name);
  return c ? BY_CANONICAL.get(c) : null;
}

/** The registry entry by canonical key (no alias resolution), or null. */
export function prefixEntry(canonical) {
  return BY_CANONICAL.get(canonical) || null;
}

/** All canonical prefix keys. */
export function allCanonicalKeys() {
  return PREFIX_REGISTRY.map((e) => e.canonical);
}
