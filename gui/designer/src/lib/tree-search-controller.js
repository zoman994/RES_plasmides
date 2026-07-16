/**
 * tree-search-controller — REV#2 Stage 3 K5 (ch2). Runs the library TREE's fast quick-filter as a
 * SINGLE `libraryQuick` session, distinct from the global structured search (§9.4). The existing
 * `libraryQuick` profile is the source of truth for max scope/providers — NOT duplicated here.
 *
 * `runSearch` does not read a `profile` (its 3rd arg is matchers/settings), so this thin controller
 * applies the profile itself (contract):
 *   1. take SEARCH_PROFILES.libraryQuick;
 *   2. classifyQuery(treeQuery) once;
 *   3. block severity:error plans before the engine;
 *   4. report parse-only name/feature/in as unsupported (the global search cannot execute them either);
 *   5. capabilityDiagnostics + planRequiresFullSearch escalate executable heavy providers;
 *   6. on REQUIRES_FULL_SEARCH → EMPTY matching-sets + an escalation flag, and do NOT run runSearch
 *      (a metadata filter must never quietly run a heavy DNA/protein search or show a false-empty lib);
 *   7. else intersect plan.entityScope.includeKinds with the profile's entityScope, then a
 *      METADATA-ONLY runSearch (no seqMatch/proteinMatch/reMatch in ctx);
 *   8. hand the one session's kind-aware identity sets and row explanations to zones.
 *
 * Pure — the surface memoizes it on (treeQuery, documents).
 */
import { SEARCH_PROFILES, capabilityDiagnostics } from './search-profiles';
import { classifyQuery } from './query-classify';
import {
  planBlockingErrors,
  planRequiresFullSearch,
  REQUIRES_FULL_SEARCH,
  runSearch,
} from './library-search';
import {
  collectEntryDocuments,
  collectPrimerDocuments,
  collectProjectDocuments,
} from './search-document-adapters';
import { entityRefKey } from './search-entity-key';

const EMPTY = () => ({
  active: false,
  requiresFullSearch: false,
  blocked: false,
  unsupported: false,
  diagnostics: [],
  matchingEntryIds: new Set(),
  matchingProjectIds: new Set(),
  matchingEntityKeys: new Set(),
  matchInfoByEntityKey: new Map(),
});

/** Build the tree's one kind-aware document inventory from the live entities it renders.
 * Legacy primer LibraryEntries must use ref.kind='primer'; otherwise type/status/primer scope
 * silently search them as molecules. Catalog rows and soft-deleted entities never enter the tree. */
export function collectTreeSearchDocuments(entries, projects) {
  const liveEntries = (Array.isArray(entries) ? entries : Object.values(entries || {}))
    .filter((e) => e && !e._pendingDelete && e.kind !== 'catalog');
  const primers = liveEntries.filter((e) => e.kind === 'primer');
  const molecules = liveEntries.filter((e) => e.kind !== 'primer');
  return [
    ...collectEntryDocuments(molecules),
    ...collectProjectDocuments(projects),
    ...collectPrimerDocuments({}, { legacyEntries: primers }),
  ];
}

/** Composite identity used to join a raw tree row to its SearchResult. */
export function treeEntryEntityKey(entry) {
  if (!entry?.id) return null;
  return entityRefKey({ kind: entry.kind === 'primer' ? 'primer' : 'entry', id: entry.id });
}

function treeMatchInfo(result) {
  const matches = result?.matches || [];
  const nameMatch = matches.find((m) => m.dimension === 'name');
  const nameHighlights = nameMatch
    ? (nameMatch.highlights || [])
      .filter((h) => h.field === 'name')
      .map((h) => ({ start: h.start, end: h.end }))
    : [];
  const primary = result?.primaryMatchId || null;
  return {
    nameHighlights,
    reason: primary && primary !== 'name' ? primary : null,
    primary,
    matches,
  };
}

/**
 * @param {string} treeQuery
 * @param {import('./search-types').SearchDocument[]} documents
 * @param {{ opts?: object }} [ctx]
 * @returns {{ active:boolean, requiresFullSearch:boolean, blocked:boolean, unsupported:boolean,
 *   diagnostics:Array, matchingEntryIds:Set<string>, matchingProjectIds:Set<string>,
 *   matchingEntityKeys:Set<string>, matchInfoByEntityKey:Map<string, object> }}
 */
export function runTreeSearch(treeQuery, documents, ctx = {}) {
  const q = typeof treeQuery === 'string' ? treeQuery.trim() : '';
  if (!q) return EMPTY(); // no filter — the tree shows everything

  const profile = SEARCH_PROFILES.libraryQuick;
  const plan = classifyQuery(q);
  const blocking = planBlockingErrors(plan);
  if (blocking.length > 0) return { ...EMPTY(), blocked: true, diagnostics: blocking };

  // name:/feature:/in: are deliberately recognised but not executable yet. The global search
  // cannot consume them either, so offering "open full search" would be a dead-end. Keep the
  // tree unfiltered and surface an honest unsupported diagnostic instead.
  const parseOnly = (plan.diagnostics || []).filter((d) => d?.code === 'prefix-parse-only');
  if (parseOnly.length > 0) {
    return { ...EMPTY(), blocked: true, unsupported: true, diagnostics: parseOnly };
  }

  const capability = capabilityDiagnostics(plan, profile.id);
  const escalates = capability.some((d) => d.code === REQUIRES_FULL_SEARCH)
    || planRequiresFullSearch(plan);
  if (escalates) return { ...EMPTY(), requiresFullSearch: true, diagnostics: capability };

  // Narrow to the kinds this profile owns (never search e.g. enzyme from the tree).
  const includeKinds = (plan.entityScope?.includeKinds || []).filter((k) => profile.entityScope.includes(k));
  const scopedPlan = { ...plan, entityScope: { includeKinds, excludeKinds: plan.entityScope?.excludeKinds || [] } };

  // Metadata-only: no seq/protein/re matchers are passed, so runSearch scores only metadata
  // dimensions. The tree session runs UNCAPPED (override the global 200-result limit): the tree
  // shows every matching entry (matchingEntryIds is computed pre-truncation), so its per-row
  // explanations (matchInfoByEntityKey, built from `results`) must cover every match too — a
  // metadata filter over the library is cheap, so there is no reason to clip it.
  // S3-CLOSE K1 (corrective): this metadata surface degrades EXPLICITLY — `providerPolicy:'deferred'`
  // (an explicit bio prefix escalated above; an auto-DNA motif still degrades to its name/tag match).
  // It must never rely on the strict engine seeing no matcher.
  const session = runSearch(scopedPlan, Array.isArray(documents) ? documents : [], {
    opts: { ...(ctx.opts || {}), limit: Number.MAX_SAFE_INTEGER },
    providerPolicy: 'deferred',
  });
  return {
    active: true,
    requiresFullSearch: false,
    blocked: false,
    unsupported: false,
    diagnostics: [],
    matchingEntryIds: session.matchingEntryIds,
    matchingProjectIds: session.matchingProjectIds,
    matchingEntityKeys: new Set(session.results.map((r) => r.entityKey)),
    matchInfoByEntityKey: new Map(session.results.map((r) => [r.entityKey, treeMatchInfo(r)])),
  };
}
