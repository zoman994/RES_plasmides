/**
 * search-profiles — declarative per-surface search profiles (REV #2 §1A.3).
 *
 * One shell, many profiles. Each live search surface names a profile; the profile — NOT
 * conditional branches inside React components — decides which prefixes are allowed,
 * which providers may run, the entity scope, and the UI affordances. The single
 * PREFIX_REGISTRY stays the query language; a profile only narrows `allowedPrefixKeys`.
 *
 * Capability is enforced, not ignored: a prefix / provider intent a profile does not
 * allow yields a REQUIRES_FULL_SEARCH diagnostic (escalation), never a match-all.
 *
 * Pure data + helpers. Controllers wire these in Stage 3; Stage 1 only defines them.
 *
 * @typedef {{ id:string, uiKind:'full'|'scoped'|'fixed'|'local', allowedPrefixKeys:string[],
 *   entityScope:string[], providers:string[], fixedIntent?:string, showModeSelector:boolean,
 *   showFilterChips:boolean, emptyBehavior:'empty'|'recent'|'contextual', selectionMode:'single'|'multi' }} SearchProfile
 */
import { allCanonicalKeys } from './search-prefix-registry';

const METADATA_PREFIXES = ['lib', 'mol', 'primer', 'project', 'name', 'tag', 'feature', 'type', 'status', 'in'];

/** @type {Record<string, SearchProfile>} */
export const SEARCH_PROFILES = {
  globalLibrary: {
    id: 'globalLibrary', uiKind: 'full',
    allowedPrefixKeys: allCanonicalKeys(),
    entityScope: ['entry', 'project', 'primer'],
    providers: ['metadata', 'sequence', 'protein', 'enzymeCatalog', 'restrictionSites'],
    showModeSelector: true, showFilterChips: true, emptyBehavior: 'empty', selectionMode: 'single',
  },
  libraryQuick: {
    id: 'libraryQuick', uiKind: 'scoped',
    allowedPrefixKeys: [...METADATA_PREFIXES],
    entityScope: ['entry', 'project', 'primer'],
    providers: ['metadata'],
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
  libraryPicker: {
    // Picks MOLECULES: molecule-relevant metadata + a configured DNA path. NOT project /
    // primer / in (those entities aren't picked here).
    id: 'libraryPicker', uiKind: 'scoped',
    allowedPrefixKeys: ['mol', 'name', 'tag', 'feature', 'type', 'status', 'seq'],
    entityScope: ['entry'],
    providers: ['metadata', 'sequence'],
    showModeSelector: false, showFilterChips: true, emptyBehavior: 'recent', selectionMode: 'single',
  },
  primerPool: {
    // Primers have no features/topology (§4.5) — only name/tag/status/sequence.
    id: 'primerPool', uiKind: 'fixed',
    allowedPrefixKeys: ['primer', 'name', 'tag', 'status', 'seq'],
    entityScope: ['primer'],
    providers: ['metadata', 'sequence'],
    showModeSelector: false, showFilterChips: true, emptyBehavior: 'recent', selectionMode: 'single',
  },
  sequenceWithinEntry: {
    id: 'sequenceWithinEntry', uiKind: 'fixed',
    allowedPrefixKeys: [], entityScope: [], providers: ['sequence'], fixedIntent: 'sequence',
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
  enzymeCatalog: {
    id: 'enzymeCatalog', uiKind: 'fixed',
    allowedPrefixKeys: [], entityScope: ['enzyme'], providers: ['enzymeCatalog'], fixedIntent: 'enzymeCatalog',
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'recent', selectionMode: 'single',
  },
  featureCatalog: {
    id: 'featureCatalog', uiKind: 'local',
    allowedPrefixKeys: [], entityScope: ['feature'], providers: ['metadata'],
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
  simpleNameFilter: {
    id: 'simpleNameFilter', uiKind: 'local',
    allowedPrefixKeys: [], entityScope: [], providers: ['metadata'],
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
  notebook: {
    id: 'notebook', uiKind: 'local',
    allowedPrefixKeys: [], entityScope: ['notebook'], providers: ['metadata'],
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
  homology: {
    id: 'homology', uiKind: 'fixed',
    allowedPrefixKeys: [], entityScope: ['entry'], providers: ['homology'], fixedIntent: 'homology',
    showModeSelector: false, showFilterChips: false, emptyBehavior: 'empty', selectionMode: 'single',
  },
};

/** @returns {SearchProfile|null} */
export function getProfile(id) {
  return SEARCH_PROFILES[id] || null;
}

/** Is a canonical prefix key usable in this profile's selector / parser? */
export function isPrefixAllowed(profileId, canonicalKey) {
  const p = getProfile(profileId);
  return !!p && p.allowedPrefixKeys.includes(canonicalKey);
}

/** May this profile run the given computational provider intent? */
export function profileAllowsProviderIntent(profileId, providerIntent) {
  const p = getProfile(profileId);
  return !!p && p.providers.includes(providerIntent);
}

/**
 * Capability diagnostics for running `plan` under `profileId` (REV #2 §1A.3). Three
 * checks, FAIL-CLOSED:
 *   • an unknown profile is an ERROR (never silently "no diagnostics");
 *   • any EXPLICITLY-typed prefix outside the profile's allowedPrefixKeys → escalation
 *     (a picker must not run `project:`/`feature:` it does not own);
 *   • a provider intent the profile cannot run → escalation. An INFERRED intent (a bare
 *     DNA token) does NOT escalate — a metadata profile may run just its metadata part;
 *     only an EXPLICIT provider prefix forces the "open full search" escalation.
 * Fixed profiles carry a `fixedIntent` and do not parse prefixes, so they never mismatch.
 * @returns {Array<{code:string,severity:string,messageKey:string,[k:string]:any}>}
 */
export function capabilityDiagnostics(plan, profileId) {
  const p = getProfile(profileId);
  if (!p) {
    return [{ code: 'unknown-profile', severity: 'error', messageKey: 'search.diag.unknownProfile', profileId }];
  }
  if (!plan || p.fixedIntent) return []; // fixed-domain: the raw text is the value

  const out = [];
  for (const u of plan.prefixUsages || []) {
    if (u.explicit && !p.allowedPrefixKeys.includes(u.canonical)) {
      out.push({
        code: 'REQUIRES_FULL_SEARCH', severity: 'info',
        messageKey: 'search.diag.requiresFullSearch', reason: 'prefix-not-allowed', canonical: u.canonical,
      });
    }
  }
  const intent = plan.providerIntent || 'metadata';
  // An inferred (auto-DNA) intent degrades to the profile's metadata part; only an
  // explicit provider intent that the profile cannot run escalates.
  if (!p.providers.includes(intent) && plan.intentSource === 'explicit') {
    out.push({
      code: 'REQUIRES_FULL_SEARCH', severity: 'info',
      messageKey: 'search.diag.requiresFullSearch', reason: 'provider-not-allowed', providerIntent: intent,
    });
  }
  return out;
}
