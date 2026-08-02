/**
 * LibrarySmartSearchBar — the mounted global-search surface.
 *
 * It owns search-document projection, progressive results and the K1 combobox interaction
 * contract. It does NOT own a worker: the sequence pass runs on the app-wide coordinator's
 * `global` channel, so this surface and the in-molecule popover can never grind in parallel.
 * LibraryTopBar supplies only layout and routes the selected entity.
 */
import { useCallback, useEffect, useId, useRef } from 'react';
import { useStore } from '../../store';
import { t, tf } from '../../i18n';
import { Icon } from '../icons/Icon';
import {
  collectEntryDocuments,
  collectPrimerDocuments,
  collectProjectDocuments,
} from '../../lib/search-document-adapters';
import { collectEnzymeDocuments } from '../../lib/search-enzyme-adapters';
import { classifyQuery } from '../../lib/query-classify';
import { loadSearchPrefs } from '../../lib/search-prefs';
import { deriveSearchSessionPresentation } from '../../lib/search-session-presentation';
import { SEARCH_FILTER_DEFS } from '../../lib/search-modes';
import { isExecutablePrefix, prefixEntry } from '../../lib/search-prefix-registry';
import SearchField from '../Search/SearchField';
import SearchModeSelector from '../Search/SearchModeSelector';
import SearchFilterMenu from '../Search/SearchFilterMenu';
import SearchFilterChips from '../Search/SearchFilterChips';
import SearchResultsListbox from '../Search/SearchResultsListbox';
import { useSearchComboboxNavigation } from '../Search/useSearchComboboxNavigation';
import { optionDomId } from '../Search/searchUiContract';
import { useGlobalSearchController } from './hooks/useGlobalSearchController';
import { useSearchRestoreApply, getRowKey } from './hooks/useSearchReturnFrame';
import { SmartResultContent } from './SmartResultRow';
import SearchStatusContent from './SearchStatusContent';

const FILTER_MENU_DEFS = SEARCH_FILTER_DEFS.filter((d) => isExecutablePrefix(d.canonical));
const FILTER_ENUM_OPTIONS = {
  type: [
    { value: 'circular', labelKey: 'search.enum.type.circular' },
    { value: 'linear', labelKey: 'search.enum.type.linear' },
    { value: 'primer', labelKey: 'search.enum.type.primer' },
  ],
  status: [
    { value: 'release', labelKey: 'search.enum.status.release' },
    { value: 'wip', labelKey: 'search.enum.status.wip' },
    { value: 'deprecated', labelKey: 'search.enum.status.deprecated' },
    { value: 'imported', labelKey: 'search.enum.status.imported' },
    { value: 'designed', labelKey: 'search.enum.status.designed' },
    { value: 'ordered', labelKey: 'search.enum.status.ordered' },
    { value: 'received', labelKey: 'search.enum.status.received' },
    { value: 'archived', labelKey: 'search.enum.status.archived' },
  ],
};

const DIAG_KEY_BY_CODE = {
  'multiple-provider-intents': 'search.diag.multipleProviderIntents',
  'duplicate-provider': 'search.diag.duplicateProvider',
  'multiple-scope-presets': 'search.diag.multipleScopePresets',
  'incompatible-scope-provider': 'search.diag.incompatibleScopeProvider',
  'incompatible-scope-status': 'search.diag.incompatibleScopeStatus',
  'invalid-dna': 'search.diag.invalidDna',
  'unclosed-quote': 'search.diag.unclosedQuote',
  'ambiguous-project': 'search.error.ambiguousProject',
  'unknown-project': 'search.error.unknownProject',
  'filter-not-available': 'search.error.filterNotAvailable',
};

// S3-CLOSE K2.4 — a failed check names ITS OWN dimension. The session is the ONLY source of
// truth here: re-deriving «what was requested» from the current query would warn about a
// provider that never ran, and would keep warning after the query moved on.
const PROVIDER_LABEL_KEY = {
  sequence: 'search.provider.sequence',
  protein: 'search.provider.protein',
  enzyme: 'search.provider.enzyme',
};

function collectUserSearchDocuments(entriesById, projects, primersById, entryGenerations) {
  const all = Object.values(entriesById || {});
  return [
    // The per-entry ages travel with the documents: every result is stamped with the identity of the
    // exact revision the search read, and the jump is verified against that — not against whatever
    // the molecule happens to be when the row is clicked.
    ...collectEntryDocuments(
      all.filter((entry) => entry && entry.kind !== 'catalog' && entry.kind !== 'primer'),
      { generations: entryGenerations },
    ),
    ...collectProjectDocuments(projects),
    ...collectPrimerDocuments(primersById, { legacyEntries: all.filter((entry) => entry && entry.kind === 'primer') }),
  ];
}

function SearchPrefsSummary() {
  const prefs = loadSearchPrefs();
  const pct = Math.round(prefs.identityThreshold * 100);
  const openSettings = () => {
    try { window.dispatchEvent(new CustomEvent('bodgegene:open-search-settings')); } catch { /* no-op */ }
  };
  return (
    <span
      data-testid="search-prefs-summary"
      style={{ textTransform: 'none', fontWeight: 400, display: 'inline-flex', gap: 6, alignItems: 'center' }}
    >
      <span>{t('search.prefs.threshold')} {pct}% · {t(prefs.bothStrands ? 'search.prefs.bothStrands' : 'search.prefs.oneStrand')}</span>
      <button
        type="button"
        data-testid="search-prefs-open"
        onClick={openSettings}
        style={{
          background: 'none', border: 'none', padding: 0, fontSize: 10, cursor: 'pointer',
          color: 'var(--accent-text)', textDecoration: 'underline',
        }}
      >{t('search.prefs.change')}</button>
    </span>
  );
}

export default function LibrarySmartSearchBar({
  search,
  onPickSearchResult,
  onOpenAlignment,
  autoFocusSearchTick = 0,
  // The molecule currently open. The «Back to results» control is scoped to it: a frame captured
  // from another entry must not offer a return the user did not come from.
  selectedEntryId = null,
}) {
  const reactId = useId();
  const listboxId = `library-topbar-search-listbox-${reactId}`;

  const canonicalQuery = (search?.canonicalQuery || '').trim();
  const runnable = !!search?.runnable;
  const composing = !!search?.composing;
  const trimmedQuery = runnable ? canonicalQuery : '';
  const plan = classifyQuery(trimmedQuery);

  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  // The corpus, built at the moment the search READS it — not subscribed to. The library map moves on
  // every write, and a dependency on it would re-run a pass for changes that cannot affect the query.
  // The per-entry ages are read the same way, so whatever they are when the search runs is what the
  // results carry into their document identity.
  const collectDocuments = useCallback((withEnzymes) => {
    const st = useStore.getState();
    const user = collectUserSearchDocuments(st.libraryEntries, st.projects, st.primersById, st.entryGenerations);
    return withEnzymes ? [...user, ...collectEnzymeDocuments()] : user;
  }, []);

  // ── THE SESSION ───────────────────────────────────────────────────────────────────────────────
  // Owned by the controller, not by this component: the result, the phase, the provider verdicts, the
  // run/retry/restore lifecycle and the Back frame. What is left here is a combobox.
  const controller = useGlobalSearchController({
    trimmedQuery,
    collectDocuments,
    onPickSearchResult,
    selectedEntryId,
    seedQuery: search?.seedGlobalQuery,
    queryState: search?.state ?? null,
    restoreQueryState: search?.restoreQueryState,
    focusInput,
  });
  const {
    rows, showForQuery, providerIncomplete, incompleteDims, searchBlocked, requiresAlignment,
    cancelled, resultsOpen, setResultsOpen, closedForQuery, setClosedForQuery, resultsScrollRef,
    scrollTopRef, cancelSearch, resumeSearch, canGoBack, goBackToResults,
  } = controller;

  useEffect(() => {
    if (!autoFocusSearchTick) return;
    const el = inputRef.current;
    if (el) { el.focus(); el.select?.(); }
  }, [autoFocusSearchTick]);

  const modeModel = search?.modeSelectorModel || { groups: [], selectedModeId: 'lib' };
  const selectedModeLabel = modeModel.groups.flatMap((group) => group.modes)
    .find((mode) => mode.id === modeModel.selectedModeId)?.label || t('search.mode.library');
  const filterMenuDefs = FILTER_MENU_DEFS.map((def) => ({ ...def, label: t(def.labelKey) }));
  const filterEnumOptions = {
    type: FILTER_ENUM_OPTIONS.type.map((option) => ({ value: option.value, label: t(option.labelKey) })),
    status: FILTER_ENUM_OPTIONS.status.map((option) => ({ value: option.value, label: t(option.labelKey) })),
  };
  const modePlaceholder = t(prefixEntry(search?.state?.mode || 'lib')?.placeholderKey || 'search.placeholder.library');
  const blockingDiag = !composing && canonicalQuery !== '' && !runnable
    ? ((search?.diagnostics || []).find((diagnostic) => diagnostic.severity === 'error') || null)
    : null;
  const blockingText = blockingDiag
    ? t(DIAG_KEY_BY_CODE[blockingDiag.code] || blockingDiag.messageKey || 'search.diag.requiresFullSearch')
    : '';
  const hasBlockingNotice = !!blockingDiag;

  // K3.1 — ONE projection decides what this search may claim; everything below reads it and
  // nothing re-ranks it. Ownership is normalized FIRST: a parser error is about the text on
  // screen right now, so it shows immediately — but a blocked/failed/empty verdict from the
  // PREVIOUS query must not survive the keystroke that replaced it.
  const providerExpected = !!(plan.seqQuery || plan.aaQuery || plan.cutQuery || plan.reQuery);
  const presentation = deriveSearchSessionPresentation({
    ownsQuery: hasBlockingNotice || (showForQuery && !!trimmedQuery),
    phase: controller.phase,
    rowCount: rows.length,
    providerExpected,
    providerPending: rows.some((row) => row.providerPending),
    incomplete: providerIncomplete,
    requiresAlignment: !!requiresAlignment,
    cancelled,
    blocked: hasBlockingNotice || searchBlocked,
    interactionDisabled: composing,
  });
  // Note there is no `searchIsRunning` derived from `presentation.ariaBusy` any more: liveness is
  // stamped where the work actually starts (see the debounce below), because the rendered flag
  // lags the launch by a commit. Refs are written in an effect, never during render.

  useEffect(() => {
    if (!resultsOpen) return undefined;
    const onDoc = (event) => {
      if (!wrapRef.current || wrapRef.current.contains(event.target)) return;
      if (event.target?.closest?.('[data-testid="tree-full-search"]')) return;
      // Clicking away abandons the answer — so stop paying for it. On a megabase molecule this is
      // a full sweep burned for a result that now has nowhere to land. Unconditional: `cancelSearch`
      // itself decides whether anything was in flight, and it also covers the pre-worker window.
      cancelSearch();
      setResultsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [resultsOpen, cancelSearch, setResultsOpen]);

  const showResults = !composing && (
    (resultsOpen && !!trimmedQuery && closedForQuery !== trimmedQuery)
    || hasBlockingNotice
    || searchBlocked
  );

  const handleResultsOpenChange = (nextOpen) => {
    if (nextOpen) setClosedForQuery(null);
    // Escape / Tab / close = «I am no longer waiting for this». Leaving the sweep running would
    // spend a full pass on an answer that has nowhere to land.
    else cancelSearch();
    setResultsOpen(nextOpen);
  };

  // A name hit must never open a molecule before its motif/protein/site is confirmed on THAT
  // molecule. `presentation.rowsDisabled` is the single verdict (K3.2); the per-row guard below
  // stays as defence-in-depth, but it FOLLOWS that verdict rather than deciding on its own.
  const pickRow = (vm) => {
    if (presentation.rowsDisabled || vm?.providerPending) return;
    // Close before the navigation sink updates the workspace. A real browser
    // may deliver a delayed focus event while the inspector rerenders. Keep a
    // query-owned closed marker so no timing of that focus can resurrect the
    // popup; only a new user interaction clears the marker.
    setClosedForQuery(trimmedQuery);
    setResultsOpen(false);
    controller.pickRow(vm);
  };
  const navigation = useSearchComboboxNavigation({
    items: rows,
    getOptionKey: getRowKey,
    open: showResults,
    onOpenChange: handleResultsOpenChange,
    onSelect: pickRow,
    disabled: presentation.rowsDisabled || !presentation.showRows,
    sessionKey: canonicalQuery,
    onUnhandledKeyDown: (event) => {
      if (event.key === 'Enter') search?.onCommitDraft?.();
      else if (event.key === 'Backspace' && (search?.draftValue ?? '') === '') search?.onBackspaceEmpty?.();
      // Escape with the panel not (yet) open still means «drop this»: during the debounce there is
      // work scheduled but nothing on screen to close, so the hook routes the key here.
      else if (event.key === 'Escape') cancelSearch();
    },
  });
  const { setActiveKey } = navigation;
  const activeDescendantId = navigation.activeKey
    ? optionDomId(listboxId, navigation.activeKey)
    : undefined;

  useSearchRestoreApply({ restore: controller.restore, rows, setActiveKey });
  const isDna = !!plan.seqQuery;

  // Verification state per row: "checking" while the check runs, "unverified" once it failed,
  // nothing at all once confirmed. A biologist must never mistake either for a result.
  const rowStatusLabel = (vm) => {
    if (!vm?.providerPending) return null;
    return t(providerIncomplete ? 'search.results.unverified' : 'search.results.checking');
  };
  const providerNames = incompleteDims
    .map((dim) => t(PROVIDER_LABEL_KEY[dim] || 'search.provider.unknown'))
    .join(', ') || t('search.provider.unknown');
  const incompleteText = tf(
    rows.length > 0
      ? 'search.results.incompleteWithCandidates'   // "…preliminary matches shown; cannot be opened"
      : 'search.results.incompleteNoCandidates',    // "…the absence of matches is NOT confirmed"
    { providers: providerNames },
  );
  // Wording only — WHICH of these may be shown was already decided by the projection.
  const { countKind } = presentation;
  const countLabel = countKind === 'none' ? null
    : `${t(countKind === 'results' ? 'search.results.count' : 'search.results.candidatesCount')}: ${rows.length}`;
  const headerLabel = countKind === 'candidates'
    ? t('search.results.candidates')
    : t(isDna ? 'search.results.dna' : 'search.results.generic');

  // EXACTLY ONE status message reaches the result area — the projection already ranked them, so
  // «not verified» and «nothing found» can no longer be rendered by two owners at once. WHICH
  // claim is allowed was decided above; SearchStatusContent only words it.
  const statusContent = (
    <SearchStatusContent
      statusKind={presentation.statusKind}
      blockingText={hasBlockingNotice ? blockingText : ''}
      incompleteText={incompleteText}
      maxApproxLength={requiresAlignment?.maxApproxLength}
      // The SEQUENCE, never the query text. `seq:ACGT…` — and worse, a compound `pUC19 seq:ACGT…`
      // — would arrive in the alignment workspace as if the prefix and the text term were bases.
      // `plan.seqQuery` is the canonical ACGT the engine itself searched with (§2.5).
      query={plan.seqQuery}
      onOpenAlignment={onOpenAlignment}
      onCancel={cancelSearch}
      onResume={resumeSearch}
    />
  );

  return (
    <div
      ref={wrapRef}
      data-testid="library-topbar-search-wrap"
      style={{ position: 'relative', flex: '0 1 560px', minWidth: 340 }}
    >
      <SearchField
        value={search?.draftValue ?? ''}
        onValueChange={(value, meta) => {
          if (!meta?.isComposing) {
            setClosedForQuery(null);
            setResultsOpen(String(value ?? '').trim() !== '');
          }
          search?.onDraftChange?.(value, meta);
        }}
        inputRef={inputRef}
        testId="library-topbar-search"
        placeholder={modePlaceholder}
        ariaLabel={t('search.field.aria')}
        role="combobox"
        ariaAutoComplete="list"
        ariaExpanded={showResults}
        controlsId={listboxId}
        activeDescendantId={activeDescendantId}
        busy={presentation.ariaBusy}
        resultCount={showResults && countKind !== 'none' ? rows.length : null}
        resultCountLabel={showResults && countLabel ? countLabel : undefined}
        invalid={!runnable && canonicalQuery !== '' && !composing}
        leadingSlot={<span style={{ color: 'var(--text-tertiary)', display: 'inline-flex' }}><Icon name="search" size={13} /></span>}
        modeSlot={(
          <SearchModeSelector
            groups={modeModel.groups}
            selectedModeId={modeModel.selectedModeId}
            onSelectMode={(id) => search?.onSelectMode?.(id)}
            triggerLabel={selectedModeLabel}
            ariaLabel={t('search.modeSelector.aria')}
            disabled={composing}
          />
        )}
        filterChips={(
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <SearchFilterChips chips={search?.chips || []} onRemove={(id) => search?.onRemoveFilter?.(id)} />
            <SearchFilterMenu
              filterDefs={filterMenuDefs}
              enumOptions={filterEnumOptions}
              onAddFilter={(def, value) => search?.onAddFilter?.(def, value)}
              triggerLabel={t('search.addFilter.label')}
              ariaLabel={t('search.addFilter.aria')}
              disabled={composing}
            />
          </span>
        )}
        onClear={() => {
          setClosedForQuery(null);
          setResultsOpen(false);
          search?.onClearAll?.();
        }}
        clearAriaLabel={t('search.clear.aria')}
        onFocus={() => {
          if (closedForQuery !== trimmedQuery && trimmedQuery) setResultsOpen(true);
        }}
        onBlur={() => search?.onCommitDraft?.()}
        onKeyDown={navigation.onKeyDown}
        onCompositionStart={navigation.compositionHandlers.onCompositionStart}
        onCompositionEnd={navigation.compositionHandlers.onCompositionEnd}
      />

      {canGoBack && (
        <button
          type="button"
          data-testid="library-search-back"
          onClick={goBackToResults}
          title={t('search.back.title')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginLeft: 6, padding: '3px 8px', fontSize: 11,
            background: 'var(--surface-2)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer',
          }}
        >
          <Icon name="chevron-left" size={12} />
          {t('search.back.label')}
        </button>
      )}

      {showResults && (
        <div
          data-testid="library-topbar-search-results"
          ref={resultsScrollRef}
          onScroll={(e) => { scrollTopRef.current = e.currentTarget.scrollTop; }}
          style={{
            position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0,
            background: 'var(--surface-1)', border: '1px solid var(--border-default)',
            borderRadius: 4, boxShadow: 'var(--shadow-md)', maxHeight: 360,
            overflowY: 'auto', zIndex: 90, minWidth: 520,
          }}
        >
          <div
            data-testid="library-topbar-search-header"
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
              fontSize: 10.5, color: 'var(--text-tertiary)', background: 'var(--surface-2)',
              borderBottom: '1px solid var(--border-subtle)', letterSpacing: 0.3, fontWeight: 600,
            }}
          >
            <span style={{ textTransform: 'uppercase' }}>
              {headerLabel}{countKind !== 'none' ? ` · ${rows.length}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <SearchPrefsSummary />
          </div>
          <SearchResultsListbox
            id={listboxId}
            testId="library-topbar-search-listbox"
            items={presentation.showRows ? rows : []}
            activeIndex={navigation.activeIndex}
            onActiveIndexChange={navigation.activateIndex}
            getOptionKey={getRowKey}
            onSelect={pickRow}
            disabled={presentation.rowsDisabled}
            loading={presentation.ariaBusy}
            statusContent={statusContent}
            renderOption={(vm, { active }) => (
              <SmartResultContent vm={vm} active={active} statusLabel={rowStatusLabel(vm)} />
            )}
          />
        </div>
      )}
    </div>
  );
}
