/**
 * search-query-sync — REV#2 Stage 3 K3. The PURE typed-prefix <-> UI <-> canonical
 * sync engine behind §9.4 (§12 Stage 3 items 4–5). No React, no store, no i18n —
 * called on every keystroke, so it stays a pure function of its inputs.
 *
 * ACCEPTANCE invariant (the oracle): sync + build never change the MEANING of a query
 *   project(classify(raw)) ≡ project(classify(buildCanonicalQuery(syncTypedDraft(raw))))
 * (same provider / scope / biological queries / text terms / filters / blocking codes).
 * That forces token PROVENANCE: a flat draft + split(/\s+/) is lossy (it merges the
 * provider value with free text, breaks quoted phrases, drops multi-provider conflicts,
 * silently swaps scope). So the residual is kept as ordered SEGMENTS, each tagged with
 * its role, and build re-emits from the segments — never by re-splitting a string.
 *
 * State:
 *   { mode, filters, draft, segments, diagnostics }
 *   - mode     — the FIRST lifted mode canonical (selector), default 'lib'. Persists over
 *                an emptied draft (§9.7).
 *   - filters  — lifted FIELD filters as chips { id, canonical, value }. value:
 *                string (text/enum) | {projectId,label} (resolved) | {raw,unresolved} (typed in:).
 *   - draft    — the VISIBLE residual text, derived from `segments`.
 *   - segments — ordered provenance for a faithful build:
 *                {role:'modeValue', value, quoted}  — the value of the lifted mode
 *                {role:'text', value, quoted}        — a free text term
 *                {role:'rawPrefix', raw}             — an un-lifted / unknown prefix token (verbatim)
 *                {role:'incomplete', raw}            — empty value / unterminated quote (verbatim)
 *                {role:'pending', raw}               — a recognized token whose unquoted tail is not
 *                                                      yet committed (commitTail=false); verbatim
 *   - diagnostics — from classifyQuery(build), so multi-provider / unclosed-quote surface.
 */
import { tokenizeQuery } from './search-query-lexer';
import { canonicalPrefix } from './search-prefix-registry';
import { classifyQuery } from './query-classify';
import { SEARCH_MODE_GROUPS, SEARCH_FILTER_DEFS, visibleModeGroups } from './search-modes';

export const DEFAULT_QUERY_STATE = { mode: 'lib', filters: [], draft: '', segments: [], diagnostics: [] };

const MODE_IDS = new Set(SEARCH_MODE_GROUPS.flatMap((g) => g.modeIds));
const FILTER_BY_CANONICAL = new Map(SEARCH_FILTER_DEFS.map((d) => [d.canonical, d]));

const isModeCanonical = (canonical) => MODE_IDS.has(canonical);
const filterDefForCanonical = (canonical) => FILTER_BY_CANONICAL.get(canonical) || null;

function normalizeState(state) {
  const s = state && typeof state === 'object' ? state : {};
  return {
    mode: isModeCanonical(s.mode) ? s.mode : 'lib',
    filters: Array.isArray(s.filters) ? s.filters : [],
    draft: typeof s.draft === 'string' ? s.draft : '',
    segments: Array.isArray(s.segments) ? s.segments : [],
    diagnostics: Array.isArray(s.diagnostics) ? s.diagnostics : [],
  };
}

// ── quoting ──────────────────────────────────────────────────────────────────
const escq = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const quoteRaw = (s) => `"${escq(s)}"`;
function quoteBare(s) {
  const v = String(s ?? '');
  if (v === '') return '""';
  return /[\s"\\:]/.test(v) ? quoteRaw(v) : v;
}
// A free term that itself looks like a recognized prefix must be quoted so classifyQuery
// does not re-lift it into a mode/filter.
function quoteFreeText(v) {
  const s = String(v ?? '');
  const m = s.match(/^(\p{L}+):/u);
  if (m && canonicalPrefix(m[1])) return quoteRaw(s);
  return /[\s"\\]/.test(s) ? quoteRaw(s) : s;
}
const emitModeVal = (seg) => (seg.quoted ? quoteRaw(seg.value) : quoteBare(seg.value));
const emitFreeVal = (seg) => (seg.quoted ? quoteRaw(seg.value) : quoteFreeText(seg.value));
const visibleVal = (seg) => (seg.quoted ? quoteRaw(seg.value) : String(seg.value ?? ''));

// ── chips ────────────────────────────────────────────────────────────────────
function chipValueKey(value) {
  if (value && typeof value === 'object') return String(value.projectId ?? value.raw ?? '');
  return String(value ?? '');
}
// Chip identity is PARSER-OWNED: each committed clause is a distinct OCCURRENCE, so `tag:a tag:a`
// keeps TWO chips (id `canonical:value#N`) instead of silently collapsing — which also broke the
// oracle for repeated clauses (build re-emits both). The occurrence index is the next free slot for
// that value, so a remove-then-re-add never collides with a surviving chip.
const occurrenceId = (canonical, valueKey, n) => `${canonical}:${valueKey}#${n}`;
function nextOccurrence(filters, canonical, valueKey) {
  const prefix = `${canonical}:${valueKey}#`;
  let max = -1;
  for (const f of filters) {
    if (typeof f.id === 'string' && f.id.startsWith(prefix)) {
      const n = Number.parseInt(f.id.slice(prefix.length), 10);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return max + 1;
}
function makeChip(canonical, value, occurrence = 0) {
  return { id: occurrenceId(canonical, chipValueKey(value), occurrence), canonical, value };
}
// Append a freshly-lifted PARSED clause — no dedup (that is the parser's occurrence identity).
function appendParsedChip(filters, canonical, value) {
  return [...filters, makeChip(canonical, value, nextOccurrence(filters, canonical, chipValueKey(value)))];
}
// Normalize a value against the REAL registry def (never trust the caller's inputType).
function normalizeFilterValue(def, value) {
  if (def.inputType === 'entity') {
    if (value && typeof value === 'object' && 'projectId' in value) {
      return { projectId: String(value.projectId ?? ''), label: String(value.label ?? value.projectId ?? '') };
    }
    return { raw: String(value ?? ''), unresolved: true }; // a typed name — stays unresolved until a resolver runs
  }
  return String(value ?? '');
}

// ── typed -> structured ───────────────────────────────────────────────────────
/**
 * @param {object} state
 * @param {string} rawDraft  the VISIBLE input text
 * @param {{ commitTail?: boolean }} [opts]  commitTail=true (default) treats the last unquoted
 *   token as complete (paste / Enter / blur); false leaves it as an in-progress `pending` tail.
 */
export function syncTypedDraft(state, rawDraft, opts = {}) {
  const base = normalizeState(state);
  const raw = typeof rawDraft === 'string' ? rawDraft : '';
  const commitTail = opts.commitTail !== false;
  const trailingSpace = /\s$/.test(raw);
  const { tokens, diagnostics: lexDiag } = tokenizeQuery(raw);
  const unclosed = new Set(lexDiag.filter((d) => d.code === 'unclosed-quote' && d.span).map((d) => d.span.start));

  let mode = base.mode;
  // A mode already lifted in a PRIOR call (base.mode !== 'lib') stays lifted: its value is
  // hidden from the visible draft, so a leftover provider/scope prefix on the next keystroke
  // must NOT become the "first" mode. Subsequent prefixes stay verbatim (a conflict) until the
  // user explicitly resolves it via the selector / clear (§9.4). Fixes the mode-drift where
  // `aa:HHHH seq:ATGC` + a keystroke silently switched aa→seq and dropped the conflict.
  let modeLifted = base.mode !== 'lib';
  let filters = base.filters;
  const segments = [];

  tokens.forEach((tok, i) => {
    const isLast = i === tokens.length - 1;
    const canon = canonicalPrefix(tok.prefix);

    if (tok.prefix && !canon) { segments.push({ role: 'rawPrefix', raw: tok.raw }); return; } // unknown prefix
    if (unclosed.has(tok.span.start) || (tok.prefix && tok.value === '')) {
      segments.push({ role: 'incomplete', raw: tok.raw }); return; // unterminated / empty value
    }
    if (!canon) { segments.push({ role: 'text', value: tok.value, quoted: tok.quoted }); return; } // free text

    // recognized prefix with a non-empty value: is the (unquoted) token committed?
    const committed = tok.quoted || !isLast || trailingSpace || commitTail;
    if (!committed) { segments.push({ role: 'pending', raw: tok.raw }); return; }

    if (isModeCanonical(canon)) {
      if (!modeLifted) { mode = canon; modeLifted = true; segments.push({ role: 'modeValue', value: tok.value, quoted: tok.quoted }); }
      else segments.push({ role: 'rawPrefix', raw: `${canon}:${tok.quoted ? quoteRaw(tok.value) : quoteBare(tok.value)}` }); // 2nd mode -> keep, preserve conflict
      return;
    }
    const def = filterDefForCanonical(canon);
    if (def) filters = appendParsedChip(filters, canon, normalizeFilterValue(def, tok.value));
    else segments.push({ role: 'rawPrefix', raw: tok.raw }); // recognized but not an offered filter
  });

  // Joining segments normalizes separators between tokens. Do not collapse segment
  // contents: repeated whitespace inside a quoted phrase is meaningful data.
  const draft = segments.map((s) => (s.role === 'modeValue' || s.role === 'text' ? visibleVal(s) : s.raw)).join(' ').trim();
  const partial = { mode, filters, draft, segments };
  const diagnostics = classifyQuery(buildCanonicalQuery(partial)).diagnostics;
  return { ...partial, diagnostics };
}

/** Selector click -> set the mode. Fail-closed: an unknown id or a filter canonical is refused. */
export function selectMode(state, modeId) {
  const base = normalizeState(state);
  return isModeCanonical(modeId) ? rederiveDiagnostics({ ...base, mode: modeId }) : base;
}

/**
 * `+ Filter` menu commit -> add a chip. Fail-closed (K3-corr-C): the canonical must be a real
 * FIELD filter (in FILTER_BY_CANONICAL); a mode / unknown canonical is refused. The REAL registry
 * def decides the value shape — the caller's `inputType` is ignored. A blank value is refused.
 */
export function addFilter(state, defOrCanonical, value) {
  const base = normalizeState(state);
  const canonical = typeof defOrCanonical === 'string' ? defOrCanonical : (defOrCanonical && defOrCanonical.canonical);
  const def = canonical ? filterDefForCanonical(canonical) : null;
  if (!def) return base; // not an offered filter -> reject
  const v = normalizeFilterValue(def, value);
  const key = chipValueKey(v);
  if (!key.trim()) return base;
  // The `+ Filter` menu is an idempotent ADD (clicking the same filter twice is a no-op) — distinct
  // from the parser's occurrence identity, which faithfully preserves a repeated TYPED clause.
  if (base.filters.some((f) => f.canonical === canonical && chipValueKey(f.value) === key)) return base;
  return rederiveDiagnostics({
    ...base,
    filters: [...base.filters, makeChip(canonical, v, nextOccurrence(base.filters, canonical, key))],
  });
}

const ENTITY_DIAG_CODES = new Set(['ambiguous-project', 'unknown-project']);

// Parser diagnostics are derived from the current structured query. Every UI
// transition that changes mode/filters must rebuild them; carrying the old array
// either leaves a removed conflict blocking forever or misses a new conflict.
// Resolver diagnostics need the injected entity index, so preserve them only while
// their exact unresolved chip occurrence exists. `token` is a compatibility fallback
// for states created before occurrence-owned `chipId`.
function liveEntityDiagnostics(state) {
  const unresolved = state.filters.filter(
    (f) => f.value && typeof f.value === 'object' && f.value.unresolved,
  );
  const unresolvedIds = new Set(unresolved.map((f) => f.id));
  const unresolvedTokens = new Set(unresolved.map((f) => String(f.value.raw)));
  return state.diagnostics.filter((d) => {
    if (!ENTITY_DIAG_CODES.has(d.code)) return false;
    return d.chipId ? unresolvedIds.has(d.chipId) : unresolvedTokens.has(String(d.token));
  });
}

function rederiveDiagnostics(state) {
  const base = normalizeState(state);
  const parserDiagnostics = classifyQuery(buildCanonicalQuery(base)).diagnostics;
  return { ...base, diagnostics: [...parserDiagnostics, ...liveEntityDiagnostics(base)] };
}
/**
 * Chip ✕ -> drop by id. Also prune any entity-resolution diagnostic that no longer has a matching
 * unresolved chip, so removing an ambiguous `in:` chip recomputes diagnostics and UNBLOCKS the
 * remaining valid query (PRE-1). Pure — no resolver needed: a diagnostic survives only while its
 * still-present chip is unresolved.
 */
export function removeFilter(state, chipId) {
  const base = normalizeState(state);
  const filters = base.filters.filter((f) => f.id !== chipId);
  return rederiveDiagnostics({ ...base, filters });
}

/** Mode-chip ✕ -> default library scope; filters and draft kept. */
export function clearMode(state) {
  return rederiveDiagnostics({ ...normalizeState(state), mode: 'lib' });
}

/** «Clear all» -> default state. */
export function clearAll() {
  return { mode: 'lib', filters: [], draft: '', segments: [], diagnostics: [] };
}

/** Backspace in an ALREADY-empty field clears the mode-chip; a no-op while typing. */
export function clearModeOnBackspace(state) {
  const base = normalizeState(state);
  return base.draft === '' ? clearMode(base) : base;
}

/**
 * Resolve typed entity filters (§617). `resolve(name) -> Array<{projectId,label}>`. A unique
 * match becomes {projectId,label}; an ambiguous or missing match stays unresolved and raises a
 * blocking diagnostic. Pure — the real project index is injected by the controller (K4).
 */
export function resolveEntityFilters(state, resolve) {
  const base = normalizeState(state);
  const diagnostics = [];
  const filters = base.filters.map((f) => {
    const v = f.value;
    if (!v || typeof v !== 'object' || !v.unresolved) return f;
    const matches = (typeof resolve === 'function' ? resolve(v.raw) : []) || [];
    // Keep the chip's parser-owned id STABLE across resolution — only its value flips to resolved —
    // so two identical typed `in:X` occurrences don't collapse to one id when both resolve.
    if (matches.length === 1) return { ...f, value: { projectId: matches[0].projectId, label: matches[0].label } };
    diagnostics.push({
      code: matches.length > 1 ? 'ambiguous-project' : 'unknown-project',
      severity: 'error', token: v.raw, chipId: f.id,
      messageKey: matches.length > 1 ? 'search.error.ambiguousProject' : 'search.error.unknownProject',
    });
    return f;
  });
  return rederiveDiagnostics({ ...base, filters, diagnostics });
}

// ── structured -> canonical query ─────────────────────────────────────────────
const FILTER_ORDER = ['name', 'tag', 'feature', 'type', 'status', 'in'];
const filterValueString = (f) => (f.value && typeof f.value === 'object' ? String(f.value.projectId ?? f.value.raw ?? '') : String(f.value ?? ''));

// When a state has no segments (hand-constructed), derive them from the draft: every token is
// free text (a prefixed one stays verbatim), so build falls back to attaching the mode to the
// first text token. sync-produced states carry real segments and are faithful.
function segmentsOf(base) {
  if (base.segments.length) return base.segments;
  const { tokens, diagnostics } = tokenizeQuery(base.draft);
  const unclosed = new Set(diagnostics.filter((d) => d.code === 'unclosed-quote' && d.span).map((d) => d.span.start));
  return tokens.map((t) => {
    if (unclosed.has(t.span.start) || (t.prefix && t.value === '')) return { role: 'incomplete', raw: t.raw };
    if (t.prefix) return { role: 'rawPrefix', raw: t.raw };
    return { role: 'text', value: t.value, quoted: t.quoted };
  });
}

function emitCanonical(base) {
  const parts = [];
  const sorted = [...base.filters].sort((a, b) => FILTER_ORDER.indexOf(a.canonical) - FILTER_ORDER.indexOf(b.canonical));
  for (const f of sorted) parts.push(`${f.canonical}:${quoteBare(filterValueString(f))}`);

  const segs = segmentsOf(base);
  const hasModeValue = segs.some((s) => s.role === 'modeValue');
  let attached = base.mode === 'lib';
  for (const seg of segs) {
    if (seg.role === 'modeValue') {
      if (base.mode === 'lib') parts.push(emitFreeVal(seg)); // mode was cleared -> bare text
      else { parts.push(`${base.mode}:${emitModeVal(seg)}`); attached = true; }
    } else if (seg.role === 'text') {
      if (base.mode !== 'lib' && !hasModeValue && !attached) { parts.push(`${base.mode}:${emitModeVal(seg)}`); attached = true; }
      else parts.push(emitFreeVal(seg));
    } else parts.push(seg.raw); // rawPrefix / incomplete / pending
  }
  return { query: parts.join(' '), attached };
}

/** Structured state -> the canonical query string the engine runs (verified by the oracle). */
export function buildCanonicalQuery(state) {
  return emitCanonical(normalizeState(state)).query;
}

/**
 * Is there something to run WITHOUT silently downgrading a chosen non-lib scope (K3-corr-D)?
 * lib: runnable when there is any draft or filter. A non-lib mode: runnable only if its scope
 * actually attaches to a value/term; otherwise non-runnable (never a default-library search).
 */
export function isRunnable(state) {
  const base = normalizeState(state);
  if (base.mode === 'lib') return base.draft.trim() !== '' || base.filters.length > 0;
  return segmentsOf(base).some((s) => s.role === 'modeValue' || s.role === 'text');
}

// ── structured -> K1/K2 primitive props ───────────────────────────────────────
export function toModeSelectorModel(state, capabilities, resolveLabel) {
  const base = normalizeState(state);
  const resolve = typeof resolveLabel === 'function' ? resolveLabel : (k) => k;
  const groups = visibleModeGroups(capabilities)
    .map((g) => ({ id: g.id, label: resolve(g.labelKey), modes: g.modes.map((m) => ({ id: m.id, label: resolve(m.labelKey) })) }))
    .filter((g) => g.modes.length > 0);
  return { groups, selectedModeId: base.mode };
}

function defaultFormatValue(f) {
  const v = f.value;
  if (v && typeof v === 'object') return String(v.label ?? v.raw ?? v.projectId ?? '');
  return String(v ?? '');
}

export function toFilterChipModel(state, opts = {}) {
  const base = normalizeState(state);
  const resolveLabel = typeof opts.resolveLabel === 'function' ? opts.resolveLabel : (k) => k;
  const resolveRemoveLabel = typeof opts.resolveRemoveLabel === 'function' ? opts.resolveRemoveLabel : () => '';
  const formatValue = typeof opts.formatValue === 'function' ? opts.formatValue : defaultFormatValue;
  return base.filters.map((f) => {
    const def = filterDefForCanonical(f.canonical);
    const fieldLabel = def ? resolveLabel(def.labelKey) : f.canonical;
    return { id: f.id, label: `${fieldLabel}: ${formatValue(f)}`, removeLabel: resolveRemoveLabel(f.canonical) || '' };
  });
}
