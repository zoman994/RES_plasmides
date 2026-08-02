/**
 * useSearchQueryState — REV#2 Stage 3 K4.1. The headless CONTROLLER that owns the canonical
 * `globalSearchState` (§9.4) and wires the pure K3 sync engine (`lib/search-query-sync`) to UI
 * events. It is the single source of truth the TopBar view renders from (K4.2): the view gets
 * `state` + the derived `canonicalQuery` / `runnable` / selector + chip models, and calls the
 * handlers back — never keeping its own copy of the mode / filters (searchUiContract §11).
 *
 * The one piece of glue that lives here (not in the pure engine) is the COMMIT-TAIL heuristic
 * that turns raw input EVENTS into a commit decision (§9.4-B):
 *   - onDraftChange(value): a trailing space commits the last unquoted token; otherwise it stays
 *     an in-progress tail (no premature chip / mode switch);
 *   - onCommitDraft(): Enter / blur / paste — commit the tail explicitly.
 *
 * No manual useMemo/useCallback (AGENTS.md §244 — React Compiler memoizes); no store import —
 * capabilities, the project-name resolver and the label resolvers are injected so the hook stays
 * pure and renderHook-testable.
 */
import { useState } from 'react';
import {
  DEFAULT_QUERY_STATE,
  syncTypedDraft,
  selectMode,
  addFilter,
  removeFilter,
  clearMode,
  clearAll,
  clearModeOnBackspace,
  resolveEntityFilters,
  buildCanonicalQuery,
  isRunnable,
  toModeSelectorModel,
  toFilterChipModel,
} from '../../../lib/search-query-sync';
import { isExecutablePrefix } from '../../../lib/search-prefix-registry';

export function useSearchQueryState({
  capabilities = null,
  resolveProjectName,
  resolveLabel,
  resolveRemoveLabel,
  formatChipValue,
} = {}) {
  const [state, setState] = useState(DEFAULT_QUERY_STATE);
  // While an IME composition is in flight the visible input shows a raw BUFFER that is NOT parsed
  // (a half-typed Cyrillic string must not become a mode/filter). The structured state only moves
  // when composition ends (isComposing:false change) or on a normal keystroke/paste.
  const [composing, setComposing] = useState(false);
  const [buffer, setBuffer] = useState('');

  // Every commit that could introduce a typed `in:` chip runs it through the project-name resolver
  // in the SAME update (§617): a unique name -> {projectId,label}, ambiguous/missing -> a blocking
  // diagnostic — so a fabricated projectId never reaches the engine and the run stays blocked until
  // the name is unambiguous. Pure composition (both are pure); a no-op without a resolver.
  const withResolve = (next) => (typeof resolveProjectName === 'function' ? resolveEntityFilters(next, resolveProjectName) : next);

  /**
   * The single input entry point. `meta.isComposing` → update only the visible buffer (no parse,
   * no mode/chip/canonical/search change). `meta.inputType === 'insertFromPaste'` → commit the
   * inserted value in THIS change (browser paste fires before change, so committing from onPaste
   * would commit the OLD value). Otherwise a trailing space commits the last unquoted token.
   */
  const onDraftChange = (value, meta = {}) => {
    if (meta.isComposing) { setComposing(true); setBuffer(value); return; }
    if (composing) setComposing(false);
    const commitTail = meta.inputType === 'insertFromPaste' || /\s$/.test(value);
    setState((s) => withResolve(syncTypedDraft(s, value, { commitTail })));
  };
  // Enter / blur — commit whatever is in the tail right now (ignored mid-composition).
  const onCommitDraft = () => { if (!composing) setState((s) => withResolve(syncTypedDraft(s, s.draft, { commitTail: true }))); };
  const onSelectMode = (id) => setState((s) => selectMode(s, id));
  const onClearMode = () => setState((s) => clearMode(s));
  const onAddFilter = (def, value) => setState((s) => withResolve(addFilter(s, def, value)));
  const onRemoveFilter = (id) => setState((s) => removeFilter(s, id));
  const onBackspaceEmpty = () => setState((s) => clearModeOnBackspace(s));
  const onClearAll = () => {
    setComposing(false);
    setBuffer('');
    setState(clearAll());
  };
  // Resolve typed `in:` names against the injected project index (§617): unique -> {projectId,label},
  // ambiguous / missing -> a blocking diagnostic. A no-op without a resolver.
  const resolveEntities = () => {
    if (typeof resolveProjectName !== 'function') return;
    setState((s) => resolveEntityFilters(s, resolveProjectName));
  };
  /**
   * Escalation from the tree's "open full search" — a REPLACE, never a merge (K5). It builds a
   * fresh state from DEFAULT_QUERY_STATE and parses `raw` with commitTail:true, so a stale mode /
   * chip from a previous global search cannot leak in (a prior `aa:` must NOT turn a tree `pUC`
   * into a protein query). Also used by any external "search this" action (e.g. enzyme card).
   */
  const seedGlobalQuery = (raw) => { setComposing(false); setState(withResolve(syncTypedDraft(DEFAULT_QUERY_STATE, raw, { commitTail: true }))); };

  /**
   * Put a PREVIOUSLY CAPTURED query state back, verbatim (U5-B «Back to results»).
   *
   * Distinct from `seedGlobalQuery`, which rebuilds a state by re-parsing text. Re-parsing is fine
   * for an escalation from the tree, where there is only text to begin with, but it is lossy as a
   * restore: a resolved `in:<project>` filter carries `{projectId,label}` that the canonical string
   * cannot express, so round-tripping it through text turns a working filter back into an unresolved
   * — and possibly ambiguous, i.e. blocking — one. The mode and the chips come back because they ARE
   * the state, not because a parser guessed them from a string.
   */
  const restoreQueryState = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.filters)) return false;
    setComposing(false);
    setBuffer('');
    setState(snapshot);
    return true;
  };

  const canonicalQuery = buildCanonicalQuery(state);
  // A filter whose prefix the engine cannot yet execute (name / feature / in are parse-only) must
  // NOT run as if it filtered — that would show a misleading result set. Fail-closed: surface a
  // blocking `filter-not-available` diagnostic (K4.2 shows a notice; the run is blocked below), and
  // the `+ Filter` menu simply never offers these until they execute end-to-end.
  const unexecutableFilters = state.filters.filter((f) => !isExecutablePrefix(f.canonical));
  const diagnostics = unexecutableFilters.length
    ? [...state.diagnostics, {
      code: 'filter-not-available', severity: 'error', messageKey: 'search.error.filterNotAvailable',
      token: unexecutableFilters.map((f) => f.canonical).join(', '),
    }]
    : state.diagnostics;
  // Runnable ONLY when there is something to run AND the query is not blocked: no severity:error
  // diagnostic (provider/scope conflict, ambiguous project, not-yet-executable filter) and no
  // still-unresolved entity filter. K4.2 gates the actual search on this — a blocked query must
  // never run (least of all in the wrong scope / against an ambiguous project).
  const hasBlockingError = diagnostics.some((d) => d.severity === 'error');
  const hasUnresolvedEntity = state.filters.some((f) => f.value && typeof f.value === 'object' && f.value.unresolved);
  const runnable = isRunnable(state) && !hasBlockingError && !hasUnresolvedEntity;
  const modeSelectorModel = toModeSelectorModel(state, capabilities, resolveLabel);
  const chips = toFilterChipModel(state, { resolveLabel, resolveRemoveLabel, formatValue: formatChipValue });
  // What the input renders: the raw buffer mid-composition, else the parsed residual.
  const draftValue = composing ? buffer : state.draft;

  return {
    state,
    draftValue,
    // While an IME composition is in flight the committed state is frozen and the buffer is unparsed.
    // The mounted combobox MUST gate its results popup AND selection (mouse + keyboard) on `!composing`
    // so a stale result cannot be run or picked mid-composition (PRE-2; UI verified in the browser).
    composing,
    canonicalQuery,
    runnable,
    diagnostics,
    modeSelectorModel,
    chips,
    onDraftChange,
    onCommitDraft,
    onSelectMode,
    onClearMode,
    onAddFilter,
    onRemoveFilter,
    onBackspaceEmpty,
    onClearAll,
    resolveEntities,
    seedGlobalQuery,
    restoreQueryState,
  };
}
