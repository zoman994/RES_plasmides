/**
 * query-classify — raw string → QueryPlan (P1 → REV #2 Stage 1).
 *
 * The single smart box dispatches WITHOUT the user picking a dimension. Stage 1 rebuilds
 * this on the shared lexer (`search-query-lexer`) + the one prefix registry
 * (`search-prefix-registry`) — no more hand-rolled `split(' ')` + `PREFIX_RE` that drift
 * from the UI. It emits the EXTENDED QueryPlan (uiPreset / entityScope / providerIntent /
 * intentSource / fieldClauses / prefixUsages / *Query / diagnostics, §7) while keeping
 * the transitional LEGACY fields (textTerms / explicitFilters / inferredFilters /
 * interpretations / seqQuery / aaQuery / reQuery) so the not-yet-migrated engine
 * (runSearch / matchesEntry) keeps working. The engine switches to the new fields in
 * Stages 2–3.
 *
 * Conflicts are DIAGNOSED, not silently last-wins: two providers, a duplicate provider,
 * two scope presets, or a scope/provider forbidden by the applicability matrix (§4.5)
 * each yield an error. Pure. Reuses isDnaQuery/hasIupacAmbiguity (sequence-search) — one
 * DNA/IUPAC alphabet. See search-types.js for the QueryPlan shape.
 */
import { isDnaQuery, hasIupacAmbiguity } from './sequence-search';
import { tokenizeQuery } from './search-query-lexer';
import { resolvePrefix, canonicalPrefix, isExecutablePrefix } from './search-prefix-registry';

const TYPE_SYNONYMS = [
  [/^(circular|кольц|plasmid|плазмид)/i, 'circular'],
  [/^(linear|линейн)/i, 'linear'],
  [/^(primer|праймер|oligo|олиг)/i, 'primer'],
];
const STATUS_SYNONYMS = [
  // ENTRY statuses (origin.status): release / wip / deprecated.
  [/^(release|релиз|verified|верифиц)/i, 'release'],
  [/^(wip|work|рабоч|draft|черновик)/i, 'wip'],
  [/^(deprecated|устар)/i, 'deprecated'],
  // PRIMER-lifecycle statuses — a DISTINCT enum (imported / designed / ordered / received /
  // archived). `archived` is a PRIMER status, NEVER a synonym of the entry status `deprecated`.
  [/^(archived|архив)/i, 'archived'],
  [/^(imported|импорт)/i, 'imported'],
  [/^(designed|спроект|дизайн)/i, 'designed'],
  [/^(ordered|заказ)/i, 'ordered'],
  [/^(received|получ)/i, 'received'],
];

function matchSynonym(table, term) {
  for (const [re, value] of table) if (re.test(term)) return value;
  return null;
}

// EXACT (whole-value) normalization for an EXPLICIT `type:`/`status:` filter (K7-P1-2). The
// prefix regexes above are for FREE TEXT only (inferType/inferStatus) — a bare «linear» in a name
// should still hint the topology. But an explicit filter value must match a known vocabulary
// EXACTLY: `type:primerjunk` / `type:linearity` must NOT normalize to primer/linear (they would
// otherwise leak the wrong scope + silently match). An unknown value is kept as-is → it matches no
// document (fail-closed) and does not narrow scope.
const TYPE_EXACT = new Map([
  ['circular', 'circular'], ['кольцевая', 'circular'], ['кольцевой', 'circular'], ['plasmid', 'circular'], ['плазмида', 'circular'],
  ['linear', 'linear'], ['линейная', 'linear'], ['линейный', 'linear'],
  ['primer', 'primer'], ['праймер', 'primer'], ['oligo', 'primer'], ['олигонуклеотид', 'primer'], ['олиго', 'primer'],
]);
const STATUS_EXACT = new Map([
  // ENTRY statuses
  ['release', 'release'], ['релиз', 'release'], ['verified', 'release'], ['верифицированная', 'release'], ['верифицирован', 'release'],
  ['wip', 'wip'], ['work', 'wip'], ['рабочая', 'wip'], ['рабочий', 'wip'], ['draft', 'wip'], ['черновик', 'wip'],
  ['deprecated', 'deprecated'], ['устаревшая', 'deprecated'], ['устаревший', 'deprecated'], ['устарел', 'deprecated'],
  // PRIMER-lifecycle statuses (DISTINCT enum) — `archived` maps to archived, NOT deprecated.
  ['imported', 'imported'], ['импортирован', 'imported'], ['импортированный', 'imported'], ['импорт', 'imported'],
  ['designed', 'designed'], ['спроектирован', 'designed'], ['дизайн', 'designed'],
  ['ordered', 'ordered'], ['заказан', 'ordered'], ['заказ', 'ordered'],
  ['received', 'received'], ['получен', 'received'],
  ['archived', 'archived'], ['архив', 'archived'], ['архивная', 'archived'], ['архивный', 'archived'], ['архивирован', 'archived'],
]);
// Which ENTITY KIND each status enum belongs to — the entry model (release/wip/deprecated) and the
// primer model (imported/designed/ordered/received/archived) are disjoint, so a `status:` clause
// narrows the scope to its owning kind (K7 round-3).
const STATUS_KIND = {
  release: 'entry', wip: 'entry', deprecated: 'entry',
  imported: 'primer', designed: 'primer', ordered: 'primer', received: 'primer', archived: 'primer',
};
/** Normalize an EXPLICIT filter value to its enum by EXACT match, or null if unrecognised. */
function normalizeExactEnum(map, value) { return map.get(String(value).toLowerCase()) || null; }

/** The type enum a free term implies (circular|linear|primer), or null. */
export function inferType(term) { return matchSynonym(TYPE_SYNONYMS, term); }
/** The status enum a free term implies (release|wip|deprecated), or null. */
export function inferStatus(term) { return matchSynonym(STATUS_SYNONYMS, term); }

const DEFAULT_INCLUDE = ['entry', 'project', 'primer'];
const DEFAULT_EXCLUDE = ['enzyme', 'reSite'];

// Which computational provider intents a scope KIND supports (§4.5). metadata is always
// allowed. Used to diagnose an incompatible scope/provider combination.
const KIND_PROVIDERS = {
  entry: ['sequence', 'protein', 'restrictionSites'],
  primer: ['sequence'],
  project: [],
  enzyme: ['enzymeCatalog'],
};

const FIELD_ORDER = { name: 0, tag: 1, feature: 2, type: 3, status: 4, withinProject: 5 };
const providerIntentOf = (canonical) => (
  canonical === 'seq' ? 'sequence'
    : canonical === 'aa' ? 'protein'
      : canonical === 'cut' ? 'restrictionSites'
        : canonical === 'enz' ? 'enzymeCatalog' : 'metadata');

/**
 * @param {string} rawQuery
 * @param {{ minDnaLen?: number }} [opts]
 * @returns {import('./search-types').QueryPlan}
 */
export function classifyQuery(rawQuery, opts = {}) {
  const minDnaLen = typeof opts.minDnaLen === 'number' ? opts.minDnaLen : 8;
  const raw = typeof rawQuery === 'string' ? rawQuery : String(rawQuery ?? '');
  const normalizedText = raw.trim().replace(/\s+/g, ' ');

  const { tokens, diagnostics: lexDiag } = tokenizeQuery(raw);
  const diagnostics = [...lexDiag];

  // Legacy (transitional) fields.
  const explicitFilters = [];
  const inferredFilters = [];
  const textTerms = [];
  let seqQuery = null;
  let aaQuery = null;
  let reQuery = null;

  // New (§7) fields.
  const fieldClauses = [];
  const prefixUsages = [];
  let enzymeCatalogQuery = null;
  let cutQuery = null;
  let providerIntent = 'metadata';
  let intentSource = 'explicit';
  let explicitScope = null; // includeKinds set by ANY scope preset (lib/mol/primer/project)
  let providerScope = null; // includeKinds a bio provider defaults to
  let scopePreset = null;   // canonical scope prefix used (lib/mol/primer/project); lib = explicit default scope

  // Conflict tracking.
  const providerTokens = []; // { intent, canonical, span } — EXPLICIT providers only
  const scopeTokens = [];     // { canonical, span } — EVERY scope prefix incl. lib

  // Parser-owned clause IDs (K7) — assigned in PARSE order, BEFORE the fieldClause sort, so
  // the consumed-clause ledger (library-search) can tell repeated `tag:` clauses apart. A
  // type/status/tag clause shares ONE id across its fieldClause + explicitFilter (one logical
  // clause, two transitional representations).
  let clauseSeq = 0;
  const nextClauseId = () => `c${clauseSeq++}`;

  const pushText = (term) => {
    if (!term) return;
    textTerms.push(term);
    const ty = matchSynonym(TYPE_SYNONYMS, term);
    if (ty) inferredFilters.push({ dim: 'type', value: ty, removable: true });
    const st = matchSynonym(STATUS_SYNONYMS, term);
    if (st) inferredFilters.push({ dim: 'status', value: st, removable: true });
  };

  for (const tok of tokens) {
    const canonical = tok.prefix ? canonicalPrefix(tok.prefix) : null;
    if (!canonical) { pushText(tok.prefix ? tok.raw : tok.value); continue; }

    const entry = resolvePrefix(tok.prefix);
    const value = tok.value;
    prefixUsages.push({ canonical, span: tok.span, explicit: true });
    // A recognised but not-yet-executable prefix gets a clear info diagnostic (never a
    // silent no-op); the engine consumes its structured output in Stages 2–4.
    if (!isExecutablePrefix(canonical)) {
      diagnostics.push({ code: 'prefix-parse-only', severity: 'info', token: tok.raw, messageKey: 'search.diag.parseOnly', canonical });
    }

    const isBio = entry.category === 'provider' || entry.category === 'preset';
    if (!value) {
      // An empty EXPLICIT bio prefix is an ERROR (not a silent metadata query); its
      // intent is still recorded so the controller can block + keep the mode.
      diagnostics.push({
        code: isBio ? 'empty-provider-value' : 'empty-prefix-value',
        severity: isBio ? 'error' : 'warning', token: tok.raw, messageKey: 'search.diag.emptyValue', canonical,
      });
      if (isBio) {
        providerIntent = providerIntentOf(canonical);
        intentSource = 'explicit';
        providerScope = entry.includeKinds || providerScope;
        providerTokens.push({ intent: providerIntent, canonical, span: tok.span });
      }
      continue;
    }

    switch (entry.category) {
      case 'scope':
        // EVERY scope prefix (incl. lib) is tracked for the multiple-scope-presets check
        // AND records an explicitScope + scopePreset. `lib` is the EXPLICIT default scope
        // (the user library — enzymes/RE-sites excluded), so `lib enz:` is an incompatible
        // scope/provider and `lib:` must survive serialization; mol/primer/project NARROW
        // the entity scope, whereas `lib` keeps the default include+exclude (see entityScope
        // below). The applicability check (§4.5) reads explicitScope for all of them.
        scopeTokens.push({ canonical, span: tok.span });
        explicitScope = entry.includeKinds;
        scopePreset = canonical;
        pushText(value);
        break;
      case 'provider': {
        providerIntent = providerIntentOf(canonical);
        intentSource = 'explicit';
        providerScope = entry.includeKinds;
        providerTokens.push({ intent: providerIntent, canonical, span: tok.span });
        const pid = nextClauseId();
        if (canonical === 'seq') {
          seqQuery = value;
          explicitFilters.push({ id: pid, dim: 'sequence', value });
          if (!isDnaQuery(value, 1)) diagnostics.push({ code: 'invalid-dna', severity: 'error', token: tok.raw, messageKey: 'search.error.invalidDna' });
        } else if (canonical === 'aa') {
          aaQuery = value;
          explicitFilters.push({ id: pid, dim: 'protein', value });
        } else if (canonical === 'cut') {
          cutQuery = value;
          reQuery = value; // transitional mirror (§4.4)
          explicitFilters.push({ id: pid, dim: 'enzyme', value });
        }
        break;
      }
      case 'preset': // enz: → the restriction catalog
        enzymeCatalogQuery = value;
        providerIntent = 'enzymeCatalog';
        intentSource = 'explicit';
        providerScope = entry.includeKinds;
        providerTokens.push({ intent: 'enzymeCatalog', canonical, span: tok.span });
        break;
      case 'field': {
        const fid = nextClauseId();
        fieldClauses.push({ id: fid, field: entry.field, value, operator: 'contains' });
        if (entry.field === 'tag') explicitFilters.push({ id: fid, dim: 'tag', value });
        break;
      }
      case 'filter': {
        const flid = nextClauseId();
        if (entry.field === 'type') {
          // EXACT enum match for an explicit filter (K7-P1-2) — never prefix (type:primerjunk↛primer).
          const norm = normalizeExactEnum(TYPE_EXACT, value) || value.toLowerCase();
          fieldClauses.push({ id: flid, field: 'type', value: norm, operator: 'equals' });
          explicitFilters.push({ id: flid, dim: 'type', value: norm });
        } else if (entry.field === 'status') {
          const norm = normalizeExactEnum(STATUS_EXACT, value) || value.toLowerCase();
          fieldClauses.push({ id: flid, field: 'status', value: norm, operator: 'equals' });
          explicitFilters.push({ id: flid, dim: 'status', value: norm });
        } else {
          fieldClauses.push({ id: flid, field: 'withinProject', value, operator: 'equals' });
        }
        break;
      }
      default:
        break;
    }
  }

  // Auto-detect a DNA motif from a single free token — ONLY when NO explicit provider
  // was typed (an explicit aa:/seq:/enz:/cut: must never be overwritten by a bare DNA
  // token). Runs BEFORE the compatibility check so the inferred intent is validated too.
  const singleFree = textTerms.length === 1 ? textTerms[0] : null;
  const autoDna = providerTokens.length === 0 && singleFree && isDnaQuery(singleFree, minDnaLen) ? singleFree : null;
  if (autoDna) {
    seqQuery = autoDna;
    providerIntent = 'sequence';   // §7: an inferred DNA intent, so Stage 2 runs sequence
    intentSource = 'inferred';     // …but a metadata surface may run just its metadata part
  }

  // ── Conflict diagnostics (§6.2) — after the FINAL intent is known; never last-wins ──
  if (providerTokens.length > 1) {
    const intents = new Set(providerTokens.map((t) => t.intent));
    if (intents.size > 1) {
      diagnostics.push({ code: 'multiple-provider-intents', severity: 'error', messageKey: 'search.diag.multipleProviders', intents: [...intents] });
    } else {
      diagnostics.push({ code: 'duplicate-provider', severity: 'error', messageKey: 'search.diag.duplicateProvider', canonical: providerTokens[0].canonical });
    }
  }
  if (scopeTokens.length > 1) {
    diagnostics.push({ code: 'multiple-scope-presets', severity: 'error', messageKey: 'search.diag.multipleScopes' });
  }
  // Uses the FINAL providerIntent (explicit OR inferred auto-DNA) — so project:GAATTCGG
  // is diagnosed, not silently given a DNA intent the scope cannot run.
  let scopeProviderIncompatible = false;
  if (explicitScope && providerIntent !== 'metadata') {
    const ok = explicitScope.some((kind) => (KIND_PROVIDERS[kind] || []).includes(providerIntent));
    if (!ok) {
      scopeProviderIncompatible = true;
      diagnostics.push({ code: 'incompatible-scope-provider', severity: 'error', messageKey: 'search.diag.incompatibleScopeProvider', scope: explicitScope, providerIntent });
    }
  }

  const interpretations = [];
  if (textTerms.length > 0) interpretations.push({ kind: 'text', confidence: 1 });
  if (aaQuery) interpretations.push({ kind: 'protein', confidence: 1 });
  if (reQuery) interpretations.push({ kind: 'enzyme', confidence: 1 });
  if (seqQuery) interpretations.push({ kind: 'dna', confidence: autoDna ? 0.9 : 1 });

  // mol/primer/project NARROW the entity scope; `lib` is the EXPLICIT default scope, so it
  // keeps the default include+exclude (enzyme/reSite excluded) — identical to a bare query,
  // it only adds scope provenance + the applicability check. A COMPATIBLE bio provider (no
  // narrowing scope) contributes its own includeKinds; an INCOMPATIBLE (rejected) provider
  // must NOT hijack the scope — its scope is dropped so the explicit scope's own kinds win
  // (lib → default include+exclude; mol/primer/project → their narrowed include). This keeps
  // `lib:X enz:Y` in the library (not the enzyme catalog) and symmetric with `mol:X enz:Y`.
  const narrowingScope = (scopePreset && scopePreset !== 'lib') ? explicitScope : null;
  const providerNarrow = scopeProviderIncompatible ? null : providerScope;
  const scopeInclude = narrowingScope || providerNarrow;
  // `type:`→scope narrowing (§4.5): type:primer restricts to [primer]; type:circular/linear to
  // [entry] (topology is an ENTRY-only concept). It INTERSECTS whatever base scope is in effect
  // — so `type:primer seq:…` stays [primer] (not the seq provider's [entry, primer]), and a
  // contradictory `primer: type:circular` collapses to an empty include (fail-closed → no
  // results), never the wrong kinds. An unknown type value does not narrow.
  // Intersect the scope of EVERY recognised `type:` AND `status:` clause (K7-P1-1 / round-3) — not
  // just the first, so contradictions collapse to [] order-independently (`type:primer type:circular`
  // and either status-order alike). type: circular/linear→entry, primer→primer. status: an entry
  // status (release/wip/deprecated)→entry, a primer status (imported/…/archived)→primer. An
  // unrecognised value contributes no scope constraint (its filter still fails closed on the doc).
  const kindsForType = (v) => (v === 'primer' ? ['primer'] : (v === 'circular' || v === 'linear') ? ['entry'] : null);
  const kindsForStatus = (v) => (STATUS_KIND[v] ? [STATUS_KIND[v]] : null);
  let includeKinds = scopeInclude ? [...scopeInclude] : [...DEFAULT_INCLUDE];
  let excludeKinds = scopeInclude ? [] : [...DEFAULT_EXCLUDE];
  let narrowedByClause = false;
  for (const c of fieldClauses) {
    const cs = c.field === 'type' ? kindsForType(c.value) : c.field === 'status' ? kindsForStatus(c.value) : null;
    if (!cs) continue;
    includeKinds = includeKinds.filter((k) => cs.includes(k));
    narrowedByClause = true;
  }
  if (narrowedByClause) excludeKinds = [];
  const entityScope = { includeKinds, excludeKinds };

  // An EXPLICIT scope preset incompatible with a status clause's owning kind is a user error
  // (K7 round-3): `primer: status:release` (entry status under a primer scope) or `mol: status:archived`
  // (primer status under an entry scope). The scope already collapsed to [] above; the error blocks
  // the search (K7 gate) with a clear diagnostic rather than a silent empty result.
  if (scopePreset && scopePreset !== 'lib' && Array.isArray(explicitScope)) {
    const scopeKinds = new Set(explicitScope);
    for (const c of fieldClauses) {
      if (c.field !== 'status') continue;
      const sk = STATUS_KIND[c.value];
      if (sk && !scopeKinds.has(sk)) {
        diagnostics.push({ code: 'incompatible-scope-status', severity: 'error', messageKey: 'search.diag.incompatibleScopeStatus', scope: explicitScope, status: c.value });
      }
    }
  }

  const sortedClauses = [...fieldClauses].sort((a, b) => (FIELD_ORDER[a.field] - FIELD_ORDER[b.field]));

  // uiPreset is display-only and DETERMINISTIC (not last-wins): an explicit provider is
  // the primary mode; else the scope preset; else library. Never used to reconstruct the
  // executable scope (that is entityScope / scopePreset).
  const PROVIDER_PRESET = { sequence: 'sequence', protein: 'protein', enzymeCatalog: 'enzymeCatalog', restrictionSites: 'restrictionSites' };
  const SCOPE_PRESET_UI = { lib: 'library', mol: 'molecule', primer: 'primer', project: 'project' };
  const uiPreset = (providerIntent !== 'metadata' && intentSource === 'explicit')
    ? PROVIDER_PRESET[providerIntent]
    : (scopePreset ? SCOPE_PRESET_UI[scopePreset] : 'library');

  return {
    raw,
    normalizedText,
    uiPreset,
    entityScope,
    scopePreset,
    providerIntent,
    intentSource,
    textTerms,
    fieldClauses: sortedClauses,
    prefixUsages,
    seqQuery,
    aaQuery,
    enzymeCatalogQuery,
    cutQuery,
    reQuery,
    diagnostics,
    explicitFilters,
    inferredFilters,
    interpretations,
    hasIupac: seqQuery ? hasIupacAmbiguity(seqQuery) : false,
  };
}

const FIELD_TO_PREFIX = { name: 'name', tag: 'tag', feature: 'feature', type: 'type', status: 'status', withinProject: 'in' };

// Quote a VALUE (provider / field) when it holds whitespace or a quote.
function quoteValue(v) {
  const s = String(v);
  if (!/[\s"]/.test(s)) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Canonical `cut:<name>` query for an enzyme, with quoting/escaping so a name with spaces
 * (e.g. `My Enzyme`) becomes `cut:"My Enzyme"` and round-trips through the lexer instead of
 * splitting into two tokens. Use this instead of string-concatenating `cut:${name}`. */
export function cutQueryFor(enzymeName) {
  return `cut:${quoteValue(enzymeName ?? '')}`;
}
// Quote FREE text when it holds whitespace/quote OR looks like `prefix:value` (so a
// plasmid literally named "seq:foo" round-trips as text, not a DNA prefix). The
// prefix-like case must FORCE quotes even without whitespace, so quote inline here
// rather than delegate to quoteValue (which only quotes on whitespace/quote).
function quoteFreeText(v) {
  const s = String(v);
  if (/[\s"]/.test(s) || /^\p{L}+:/u.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Serialize a QueryPlan to its CANONICAL query string (§6.3). LOSSLESS up to raw/spacing:
 * `classifyQuery(serialize(classifyQuery(q)))` is structurally equal to `classifyQuery(q)`
 * for a well-formed query. Aliases collapse to canonical; explicit `lib:` is PRESERVED (it
 * is the explicit default scope, distinct from a bare query for the applicability check);
 * provider and prefix-like values are quoted; clause order is stable.
 * @param {import('./search-types').QueryPlan} plan
 * @returns {string}
 */
export function serializeQueryPlan(plan) {
  if (!plan) return '';
  const parts = [];

  // Exactly one EXPLICIT computational provider value (an inferred DNA intent stays a
  // bare text term below, so it round-trips as auto-DNA, not an explicit seq:).
  if (plan.intentSource === 'explicit') {
    if (plan.providerIntent === 'sequence' && plan.seqQuery) parts.push(`seq:${quoteValue(plan.seqQuery)}`);
    else if (plan.providerIntent === 'protein' && plan.aaQuery) parts.push(`aa:${quoteValue(plan.aaQuery)}`);
    else if (plan.providerIntent === 'enzymeCatalog' && plan.enzymeCatalogQuery) parts.push(`enz:${quoteValue(plan.enzymeCatalogQuery)}`);
    else if (plan.providerIntent === 'restrictionSites' && plan.cutQuery) parts.push(`cut:${quoteValue(plan.cutQuery)}`);
  }

  const order = ['name', 'tag', 'feature', 'type', 'status', 'withinProject'];
  const clauses = [...(plan.fieldClauses || [])].sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
  for (const fc of clauses) {
    const key = FIELD_TO_PREFIX[fc.field];
    if (key) parts.push(`${key}:${quoteValue(fc.value)}`);
  }

  // Scope provenance comes from `scopePreset` (canonical prefix), NOT the display-only
  // `uiPreset` — so `mol:pUC seq:GAATTC` keeps its molecule scope through a round-trip.
  const scopePrefix = plan.scopePreset || null; // 'lib' | 'mol' | 'primer' | 'project' | null
  (plan.textTerms || []).forEach((t, i) => {
    parts.push(i === 0 && scopePrefix ? `${scopePrefix}:${quoteValue(t)}` : quoteFreeText(t));
  });

  return parts.join(' ');
}
