/**
 * library-search — the search orchestrator (P1). ONE `runSearch` produces a
 * SearchSession that feeds the dropdown, the tree (visibility + highlights) and
 * project-visibility, so those surfaces never disagree or re-run the search.
 *
 *  • Metadata dims (name / tag / feature / type / status) run synchronously here.
 *  • The sequence / protein dims are INJECTED via ctx.seqMatch / ctx.proteinMatch
 *    (P1.5 / P4 provide the real engine) — keeps this module pure + worker-portable.
 *  • Explicit prefix filters are hard AND; a free keyword is a UNION (matches by text
 *    OR by its inferred type/status) so «release» in a name is never silently hidden.
 *  • One result per entity; feature hits are grouped as occurrences owned by the entry.
 *
 * Pure; no store/React imports. See search-types.js for the shapes.
 */
import { classifyQuery } from './query-classify';
import { entryToDocument } from './search-document-adapters';
import { entityRefKey } from './search-entity-key';
import { toLocusEnvelope, capLocusEnvelope, isValidLimit } from './search-locus-envelope';
// The metadata dimensions (name / tag / feature / type / status) live in their own leaf — a pure
// move made when this file reached its hard size budget. This module keeps what decides what a
// RESULT is: providers, caps, sessions, visibility.
import {
  RELATION_RANK, matchTerm, passesExplicitFilters, passesSupportedFilter,
} from './library-search-metadata';

export const DEFAULT_SEARCH_OPTS = Object.freeze({
  dimensions: ['name', 'tag', 'type', 'status', 'feature', 'sequence', 'protein', 'enzyme'],
  bothStrands: true,
  circular: 'auto',
  headVersionsOnly: true,
  limit: 200,
  maxLocationsPerEntity: 50,
});

// Lower rank = higher priority in the relevance tuple. sequence/protein/enzyme are
// the biological dims — all rank 1 (a cut-site hit is as strong as a seq/aa hit).
const DIM_RANK = {
  name: 0, sequence: 1, protein: 1, enzyme: 1, tag: 2, feature: 3, type: 4, status: 4,
};
// The explicit-filter dims the metadata matcher can actually EVALUATE (consume). Keep in exact sync
// with `passesExplicitFilters`: any dim it does not handle (sequence/protein/enzyme today) must fail
// closed via planRequiresFullSearch — never be silently ignored and then counted as a match.
const SUPPORTED_METADATA_FILTER_DIMS = Object.freeze(new Set(['type', 'status', 'tag']));
// The structured field clauses the metadata matcher CAN evaluate (mirrored in explicitFilters).
// name / feature / withinProject are parse-only — the metadata matcher does NOT execute them, so
// they are unconsumable and escalate (K7-P1-3).
const CONSUMABLE_FIELD_CLAUSES = Object.freeze(new Set(['type', 'status', 'tag']));

/**
 * REV #2 Stage 2 K7-P1-3 — does this plan carry ANY clause the metadata-only matcher cannot
 * execute? The ledger must cover the WHOLE QueryPlan, not just legacy `explicitFilters`:
 *   • a provider dim in explicitFilters (sequence / protein / enzyme),
 *   • a structured field clause it does not run (name / feature / withinProject),
 *   • the enzyme CATALOG query (`enz:`) — which lives on its own field, not an explicitFilter.
 * Any of these makes the plan metadata-UNSATISFIABLE → never a match, always escalate.
 * @param {import('./search-types').QueryPlan} plan
 * @returns {boolean}
 */
function planHasUnconsumableClause(plan) {
  if (!plan) return false;
  if ((plan.explicitFilters || []).some((f) => !SUPPORTED_METADATA_FILTER_DIMS.has(f.dim))) return true;
  if ((plan.fieldClauses || []).some((c) => !CONSUMABLE_FIELD_CLAUSES.has(c.field))) return true;
  if (plan.enzymeCatalogQuery) return true;
  return false;
}

/**
 * REV #2 S3-CLOSE K1 — the result dimensions each requested provider MUST match for a CONFIRMED
 * hit: seq→sequence, aa→protein, cut/re→enzyme. Reads modern providerIntent AND transitional
 * seqQuery/aaQuery/reQuery/cutQuery; a multi-provider plan requires EACH (fail-closed). enz: is NOT
 * here — it keeps its own catalog gate. @returns {Set<string>}
 */
function requiredProviderDimensions(plan) {
  const dims = new Set();
  if (!plan) return dims;
  const intent = plan.providerIntent;
  if (plan.seqQuery || intent === 'sequence') dims.add('sequence');
  if (plan.aaQuery || intent === 'protein') dims.add('protein');
  if (plan.reQuery || plan.cutQuery || intent === 'restrictionSites') dims.add('enzyme');
  return dims;
}

/**
 * Normalize a provider reply and stamp the OWNER on every occurrence.
 *
 * The spread runs owner-first so a provider-supplied `targetRef` cannot re-attribute a hit to
 * another molecule; the boundary validator refuses one outright, and this ordering is the second
 * lock. `locationCount` / `bestIndex` are carried through untouched — they were measured behind the
 * provider's own cap and are not re-derivable here.
 */
function providerEnvelope(reply, doc) {
  const env = toLocusEnvelope(reply);
  return {
    occurrences: env.occurrences.map((o) => ({ targetRef: doc.ref, ...o })),
    locationCount: env.locationCount,
    bestIndex: env.bestIndex,
  };
}

function matchDocument(doc, plan, ctx) {
  const bag = new Map();
  const termsMatched = new Set();
  for (const term of plan.textTerms) {
    if (matchTerm(doc, term, bag)) termsMatched.add(term);
  }
  // Injected sequence / protein dims (engine provided by caller). `doc` is passed
  // last so a worker-backed injector can look up precomputed occurrences by doc id.
  if (plan.seqQuery && ctx.seqMatch) {
    // A capped provider answers with a locus envelope; an uncapped one with a bare array.
    // `toLocusEnvelope` normalises both, and it never invents facts: an array's loci are counted,
    // and it declares NO canonical winner (−1) rather than pretending index 0 is one.
    const env = providerEnvelope(ctx.seqMatch(plan.seqQuery, doc.sequence, plan, ctx, doc), doc);
    if (env.occurrences.length) {
      bag.set('sequence', { relation: 'approximate', highlights: [], ...env });
      if (plan.textTerms.includes(plan.seqQuery)) termsMatched.add(plan.seqQuery);
    }
  }
  if (plan.aaQuery && ctx.proteinMatch) {
    const env = providerEnvelope(ctx.proteinMatch(plan.aaQuery, doc, plan, ctx), doc);
    if (env.occurrences.length) bag.set('protein', { relation: 'approximate', highlights: [], ...env });
  }
  // Injected enzyme dim (P5) — restriction-site cut positions in this molecule. S3-CLOSE K1 (P2):
  // single source `cutQuery || reQuery` (modern field first) so a modern-only plan runs too.
  // Exact recognition matches (IUPAC sites report compatibility) → relation 'exact'.
  const cutQuery = plan.cutQuery || plan.reQuery;
  if (cutQuery && ctx.reMatch) {
    const env = providerEnvelope(ctx.reMatch(cutQuery, doc, plan, ctx), doc);
    if (env.occurrences.length) bag.set('enzyme', { relation: 'exact', highlights: [], ...env });
  }
  // Enzyme CATALOG card search (enz:) — match an enzyme-kind doc by its name / recognition
  // site (a text-style match). DISTINCT from the cut-site scan above (reQuery, on
  // molecules): scope (§4.5) keeps only enzyme docs here, so the two routes never cross.
  if (plan.enzymeCatalogQuery && matchTerm(doc, plan.enzymeCatalogQuery, bag)) {
    termsMatched.add(plan.enzymeCatalogQuery);
  }
  return { bag, termsMatched };
}

function relevanceKey(bag, plan, title) {
  let bestDim = null; let bestRelation = 'compatible';
  const seqIntent = plan.explicitFilters.some((f) => f.dim === 'sequence' || f.dim === 'protein' || f.dim === 'enzyme');
  const rankOf = (dim) => (seqIntent && (dim === 'sequence' || dim === 'protein' || dim === 'enzyme') ? -1 : DIM_RANK[dim]);
  for (const [dim, m] of bag) {
    if (bestDim === null || rankOf(dim) < rankOf(bestDim)
      || (rankOf(dim) === rankOf(bestDim) && RELATION_RANK[m.relation] < RELATION_RANK[bestRelation])) {
      bestDim = dim; bestRelation = m.relation;
    }
  }
  return { key: [rankOf(bestDim), RELATION_RANK[bestRelation], String(title).toLowerCase()], primary: bestDim };
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Apply the entity scope (REV #2 §3.3/§4/§10.3) BEFORE ranking: keep only documents whose
 * ref.kind is in includeKinds and not in excludeKinds. The default scope excludes
 * enzyme/reSite (and any future reference/catalog kind), so a plain query never surfaces
 * enzyme cards; `enz:` narrows includeKinds to ['enzyme']. Pure — the SAME filtered array
 * must feed the metadata partial AND the async final so the two phases never disagree.
 * @param {Array} documents
 * @param {{ includeKinds?:string[], excludeKinds?:string[] }} [entityScope]
 * @returns {Array}
 */
export function filterDocumentsByScope(documents, entityScope) {
  const list = documents || [];
  if (!entityScope || !Array.isArray(entityScope.includeKinds)) return list.slice();
  const include = new Set(entityScope.includeKinds);
  const exclude = new Set(entityScope.excludeKinds || []);
  return list.filter((doc) => {
    const kind = doc?.ref?.kind || 'entry';
    return !exclude.has(kind) && include.has(kind);
  });
}

/** Does this plan need the restriction CATALOG collected (REV #2 §10.2)? A controller
 * uses this to gate collectEnzymeDocuments — it must NOT run for a plain query (§8). */
export function planNeedsEnzymeCatalog(plan) {
  return !!(plan && (plan.enzymeCatalogQuery || plan.providerIntent === 'enzymeCatalog'));
}

/** REV #2 Stage 2 K7 — the severity:error diagnostics that BLOCK a plan (multiple providers,
 * an empty bio prefix, invalid DNA, an incompatible scope/provider …). */
export function planBlockingErrors(plan) {
  const ds = plan && Array.isArray(plan.diagnostics) ? plan.diagnostics : [];
  return ds.filter((d) => d && d.severity === 'error');
}

/** Is this plan blocked? A blocked plan must NOT collect documents or run providers/worker
 * (§16) — the controller short-circuits to a blocked session before either. */
export function planIsBlocked(plan) {
  return planBlockingErrors(plan).length > 0;
}

let _rid = 0;
/**
 * @param {import('./search-types').QueryPlan} plan
 * @param {Array} documents — SearchDocuments (from search-document-adapters)
 * @param {{ seqMatch?:Function, proteinMatch?:Function, reMatch?:Function, opts?:Object, requestId?:string }} [ctx]
 * @returns {import('./search-types').SearchSession & { matchingEntryIds:Set, matchingProjectIds:Set }}
 */
export function runSearch(plan, documents, ctx = {}) {
  const requestId = ctx.requestId || `s${(_rid += 1)}`;
  const merged = { ...DEFAULT_SEARCH_OPTS, ...ctx.opts };
  // A cap must be a positive safe integer. `0` / `NaN` / `'50'` used to mean two contradictory
  // things at once — `slice(0, NaN)` empties, a `length <= limit` guard passes everything — so an
  // invalid value resolves to the documented default rather than silently disabling the cap.
  const opts = {
    ...merged,
    maxLocationsPerEntity: isValidLimit(merged.maxLocationsPerEntity)
      ? merged.maxLocationsPerEntity : DEFAULT_SEARCH_OPTS.maxLocationsPerEntity,
  };
  // REV #2 S3-CLOSE K1 (corrective) — provider policy is a SYSTEM INVARIANT: absent/unknown/'required'
  // → strict AND (any requested biological dimension missing removes the doc, whether or not a matcher
  // was injected — a missing matcher is never a free pass). ONLY the exact 'deferred' keeps a metadata
  // candidate (providerPending). Metadata-only surfaces (facade partial, tree, describeEntryMatch) must
  // pass 'deferred' EXPLICITLY to degrade — they no longer lean on an implicit absent matcher.
  const providerPolicy = ctx.providerPolicy === 'deferred' ? 'deferred' : 'required';
  const requiredDims = requiredProviderDimensions(plan);
  const empty = plan.textTerms.length === 0 && !plan.seqQuery && !plan.aaQuery
    && !(plan.cutQuery || plan.reQuery) && !plan.enzymeCatalogQuery && plan.explicitFilters.length === 0;
  const results = [];
  const matchingEntryIds = new Set();
  const matchingProjectIds = new Set();

  if (!empty) {
    // §10.3: scope BEFORE ranking — the same filtered array is what the caller must feed
    // to both search phases (§7). Default scope drops enzyme/reSite docs.
    for (const doc of filterDocumentsByScope(documents, plan.entityScope)) {
      if (!passesExplicitFilters(doc, plan.explicitFilters)) continue;
      const { bag, termsMatched } = matchDocument(doc, plan, ctx);
      // every free term must have matched somewhere
      if (plan.textTerms.length && termsMatched.size < plan.textTerms.length) continue;
      // enz: — the catalog term must actually match (never list the whole catalog)
      if (plan.enzymeCatalogQuery && !termsMatched.has(plan.enzymeCatalogQuery)) continue;
      // REV #2 S3-CLOSE K1 (corrective) — STRICT final AND: a metadata match (e.g. a name hit) no
      // longer masks a missing biological check. `bag.has(dim)` ⇒ a real, non-empty occurrence.
      // Under 'required' ANY missing required dim drops the doc; only 'deferred' keeps it (flagged).
      let providerPending = false;
      for (const d of requiredDims) { if (!bag.has(d)) { providerPending = true; break; } }
      if (providerPending && providerPolicy !== 'deferred') continue;
      // no reason to include a doc that matched nothing (unless it's a pure filter listing)
      const pureFilter = plan.textTerms.length === 0 && !plan.seqQuery && !plan.aaQuery
        && !(plan.cutQuery || plan.reQuery) && !plan.enzymeCatalogQuery;
      if (bag.size === 0 && !pureFilter) continue;

      const { key, primary } = relevanceKey(bag, plan, doc.title);
      // THE SECOND CAP (P1-2 / P1-3). It uses the SAME rule as the engine's, from the same module,
      // because a positional re-slice here undoes everything the first cap protected: the canonical
      // winner on a circle has the largest start, so it is the first casualty twice over. What the
      // provider measured is carried, never recomputed — a dimension that declared nothing has its
      // PHYSICAL loci counted here, before its own truncation, and declares no winner.
      const matches = [...bag.entries()].map(([dimension, m]) => {
        const capped = capLocusEnvelope(toLocusEnvelope(m), opts.maxLocationsPerEntity);
        return {
          dimension, relation: m.relation, highlights: m.highlights,
          occurrences: capped.occurrences,
          locationCount: capped.locationCount,
          bestIndex: capped.bestIndex,
        };
      });
      results.push({
        // Composite `<kind>:<id>` (§10.4) so project/primer/enzyme ids never collide with
        // entry ids in dedup / React keys / docById. `entityRef.id` stays RAW for nav.
        entityKey: entityRefKey(doc.ref) || doc.ref.id, entityRef: doc.ref, matches,
        primaryMatchId: primary || (matches[0] && matches[0].dimension) || 'name',
        relevanceKey: key,
        // true = a metadata candidate still awaiting a biological confirmation (partial phase); a
        // confirmed final hit is false. Lets the UI show a candidate as "verifiable", not confirmed.
        providerPending,
      });
      // Kind-aware visibility (§10.4): an entry id feeds entry visibility; a project doc
      // makes ITS OWN project visible; a doc inside a project bubbles its parent up.
      const kind = doc.ref.kind || 'entry';
      if (kind === 'entry') matchingEntryIds.add(doc.ref.id);
      if (kind === 'project') matchingProjectIds.add(doc.ref.id);
      if (doc.projectId) matchingProjectIds.add(doc.projectId);
    }
  }

  results.sort((a, b) => compareKeys(a.relevanceKey, b.relevanceKey));
  const truncated = results.length > opts.limit;
  return {
    requestId, plan, status: 'done',
    results: truncated ? results.slice(0, opts.limit) : results,
    truncated, diagnostics: { total: results.length },
    matchingEntryIds, matchingProjectIds,
  };
}

/** Sentinel returned by treeQueryCapability when a metadata-only surface (tree quick
 * filter / canvas picker) cannot execute the query and must escalate. */
export const REQUIRES_FULL_SEARCH = 'REQUIRES_FULL_SEARCH';

/**
 * REV #2 Stage 0 (§12/§16). GENERAL fail-closed invariant: does this plan carry ANY
 * explicit clause the metadata-only matcher cannot consume (dim ∉
 * SUPPORTED_METADATA_FILTER_DIMS)? Such a query must FAIL CLOSED (never match-all): an
 * un-consumed clause is not a match, and the surface offers «Открыть полный поиск».
 * This is not limited to seq/aa/re — a future `name:` / `feature:` (or any unknown)
 * explicit clause the matcher does not yet evaluate escalates the same way, instead of
 * being silently ignored. An AUTO-detected DNA motif (a bare token that is ALSO a free
 * text term, with no explicit `sequence` filter) is NOT flagged — the metadata matcher
 * still matches it by name/tag/feature.
 * @param {import('./search-types').QueryPlan} plan
 * @returns {boolean}
 */
export function planRequiresFullSearch(plan) {
  return planHasUnconsumableClause(plan);
}

/**
 * Classify a raw tree/picker query: REQUIRES_FULL_SEARCH when it needs the full search
 * engine (explicit seq/aa/re), else null. Surfaces call this to show the escalation.
 * @param {string} query
 * @returns {typeof REQUIRES_FULL_SEARCH | null}
 */
export function treeQueryCapability(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return null;
  return planRequiresFullSearch(classifyQuery(q)) ? REQUIRES_FULL_SEARCH : null;
}

/**
 * REV #2 Stage 2 K7 — the consumed-clause ledger for the metadata-only matcher (§1A.6). Every
 * MANDATORY clause (each explicit filter, each free term) must be consumed for a match, and its
 * PARSER-OWNED id (assigned before the fieldClause sort, so repeated `tag:` stay distinct) is
 * recorded. A clause the matcher cannot consume — a provider dim (sequence/protein/enzyme) — makes
 * the plan metadata-UNSATISFIABLE: `unconsumable: true`, never a match, the surface escalates
 * (treeQueryCapability). This makes the fail-closed invariant structural: no clause is silently
 * ignored AND counted as satisfied.
 * @param {Object} doc — a SearchDocument
 * @param {import('./search-types').QueryPlan} plan
 * @returns {{ matched:boolean, consumedClauseIds:Set<string>, unconsumable:boolean }}
 */
export function evaluateEntryClauses(doc, plan) {
  const consumedClauseIds = new Set();
  if (!doc || !plan) return { matched: false, consumedClauseIds, unconsumable: false };
  // Any clause the metadata matcher cannot execute — a provider dim, a structured name/feature/in
  // clause, or the enz: catalog — makes the plan metadata-unsatisfiable (K7-P1-3): whole-plan
  // ledger, never a match, always escalate. Below this guard every explicitFilter is supported.
  if (planHasUnconsumableClause(plan)) return { matched: false, consumedClauseIds, unconsumable: true };
  const filters = plan.explicitFilters || [];
  // Each supported filter must be satisfied by THIS doc; record its parser-owned clause id.
  for (const f of filters) {
    if (!passesSupportedFilter(doc, f)) return { matched: false, consumedClauseIds, unconsumable: false };
    consumedClauseIds.add(f.id || `${f.dim}:${f.value}`);
  }
  // Each free text term is a mandatory clause — it must match somewhere.
  const terms = plan.textTerms || [];
  const bag = new Map();
  for (let i = 0; i < terms.length; i += 1) {
    if (!matchTerm(doc, terms[i], bag)) return { matched: false, consumedClauseIds, unconsumable: false };
    consumedClauseIds.add(`t${i}`);
  }
  const mandatory = filters.length + terms.length;
  return { matched: mandatory > 0, consumedClauseIds, unconsumable: false };
}

/**
 * Cheap boolean for the tree filter — literal metadata dims only (no sequence engine).
 * Delegates to the consumed-clause ledger (K7): a match requires every mandatory clause
 * consumed, and a provider clause it cannot consume fails closed (never match-all).
 * @returns {boolean}
 */
export function matchesEntry(doc, plan) {
  if (!doc) return false;
  return evaluateEntryClauses(doc, plan).matched;
}

/**
 * A predicate `(entry) => boolean` for filtering a list of raw LibraryEntries with
 * the shared metadata engine — the ONE matcher the tree zones + project-visibility
 * use, replacing four hand-copied name-only `matchesQuery` functions. Metadata dims
 * only (name/tag/type/status/feature/qualifiers); the sequence engine is not run
 * here (a DNA query degrades to a name substring, same as the old behaviour).
 * Empty query → matches everything (the tree's «show all»).
 * @param {string} query
 * @returns {(entry:Object) => boolean}
 */
export function makeEntryMatcher(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (!q) return () => true;
  const plan = classifyQuery(q);
  return (entry) => matchesEntry(entryToDocument(entry), plan);
}

/**
 * Per-entry match detail for tree/list enrichment: the name-highlight spans and the
 * primary NON-name reason (so a row that surfaced by tag/feature/type can explain
 * itself). Runs the metadata engine over a single doc. Returns null when the query
 * is empty or the entry does not match.
 * @param {Object} entry — raw LibraryEntry
 * @param {import('./search-types').QueryPlan} plan
 * @returns {{ nameHighlights:{start,end}[], reason:string|null, primary:string, matches:Array }|null}
 */
export function describeEntryMatch(entry, plan) {
  if (!entry || !plan) return null;
  const hasQuery = plan.textTerms.length || plan.explicitFilters.length || plan.seqQuery || plan.aaQuery;
  if (!hasQuery) return null;
  const doc = entryToDocument(entry);
  // Metadata-only enrichment (no provider engines): 'deferred' so a bio query degrades to its
  // name/tag/feature highlight instead of fail-closing to null (S3-CLOSE K1 corrective).
  const session = runSearch(plan, [doc], { providerPolicy: 'deferred' });
  const r = session.results[0];
  if (!r) return null;
  const nameM = r.matches.find((m) => m.dimension === 'name');
  const nameHighlights = nameM
    ? nameM.highlights.filter((h) => h.field === 'name').map((h) => ({ start: h.start, end: h.end }))
    : [];
  const primary = r.primaryMatchId;
  const reason = primary && primary !== 'name' ? primary : null;
  return { nameHighlights, reason, primary, matches: r.matches };
}
