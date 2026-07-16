/**
 * LibrarySmartSearchBar — the mounted global-search surface.
 *
 * It owns search-document projection, worker/facade lifecycle, progressive
 * results and the K1 combobox interaction contract. LibraryTopBar supplies only
 * layout and routes the selected entity; it does not know how search executes.
 */
import { useEffect, useId, useRef, useState } from 'react';
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
import { deriveSearchSessionPresentation } from '../../lib/search-session-presentation';
import { planIsBlocked, planNeedsEnzymeCatalog } from '../../lib/library-search';
import { entityRefKey } from '../../lib/search-entity-key';
import { createSearchFacade } from '../../lib/search-facade';
import { resultRowViewModel } from '../../lib/search-result-vm';
import { loadSearchPrefs } from '../../lib/search-prefs';
import { SEARCH_FILTER_DEFS } from '../../lib/search-modes';
import { isExecutablePrefix, prefixEntry } from '../../lib/search-prefix-registry';
import SearchField from '../Search/SearchField';
import SearchModeSelector from '../Search/SearchModeSelector';
import SearchFilterMenu from '../Search/SearchFilterMenu';
import SearchFilterChips from '../Search/SearchFilterChips';
import SearchResultsListbox from '../Search/SearchResultsListbox';
import { useSearchComboboxNavigation } from '../Search/useSearchComboboxNavigation';
import { optionDomId } from '../Search/searchUiContract';
import { SmartResultContent } from './SmartResultRow';
import SearchWorker from '../../lib/search.worker.js?worker';

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

const getRowKey = (row) => row.entityKey;

function collectUserSearchDocuments(entriesById, projects, primersById) {
  const all = Object.values(entriesById || {});
  return [
    ...collectEntryDocuments(all.filter((entry) => entry && entry.kind !== 'catalog' && entry.kind !== 'primer')),
    ...collectProjectDocuments(projects),
    ...collectPrimerDocuments(primersById, { legacyEntries: all.filter((entry) => entry && entry.kind === 'primer') }),
  ];
}

function makeSearchWorker() {
  try {
    if (import.meta?.env?.VITEST || import.meta?.env?.MODE === 'test') return null;
  } catch { /* import.meta.env is unavailable outside Vite */ }
  try { return new SearchWorker(); } catch { return null; }
}

function allowInlineInTests() {
  try { return !!import.meta?.env?.VITEST || import.meta?.env?.MODE === 'test'; } catch { return false; }
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

function SearchNotice({ testId, children }) {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 6,
        padding: '6px 10px', fontSize: 11, lineHeight: 1.35,
        color: 'var(--warning-fg)', background: 'var(--warning-bg)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <Icon name="warning" size={12} />
      <span>{children}</span>
    </div>
  );
}

export default function LibrarySmartSearchBar({
  search,
  onPickSearchResult,
  autoFocusSearchTick = 0,
  workerFactory = makeSearchWorker,
}) {
  const entriesById = useStore((s) => s.libraryEntries);
  const projects = useStore((s) => s.projects);
  const primersById = useStore((s) => s.primersById);
  const reactId = useId();
  const listboxId = `library-topbar-search-listbox-${reactId}`;

  const canonicalQuery = (search?.canonicalQuery || '').trim();
  const runnable = !!search?.runnable;
  const composing = !!search?.composing;
  const trimmedQuery = runnable ? canonicalQuery : '';
  const plan = classifyQuery(trimmedQuery);

  const facadeRef = useRef(null);
  useEffect(() => {
    const facade = createSearchFacade({ workerFactory, allowInlineFallback: allowInlineInTests() });
    facadeRef.current = facade;
    return () => { facade.terminate?.(); facadeRef.current = null; };
  }, [workerFactory]);

  const [resultsOpen, setResultsOpen] = useState(false);
  const [searchResult, setSearchResult] = useState({
    query: '', rows: [], incomplete: false, incompleteDims: [], providerFailures: [],
    blocked: false, phase: 'idle',
  });
  const [closedForQuery, setClosedForQuery] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // EVERY field is gated through showForQuery: results are owned by their query, so a stale
  // warning/row can never render under a newer one (it disappears on the very render the query
  // changes, not 180 ms later when the new search resolves).
  const showForQuery = searchResult.query === trimmedQuery;
  const rows = showForQuery ? searchResult.rows : [];
  // Provider-neutral: sequence, protein and enzyme all report through these two fields.
  const providerIncomplete = showForQuery ? searchResult.incomplete : false;
  const incompleteDims = showForQuery ? searchResult.incompleteDims : [];
  const searchBlocked = showForQuery ? searchResult.blocked : false;

  useEffect(() => {
    if (!autoFocusSearchTick) return;
    const el = inputRef.current;
    if (el) { el.focus(); el.select?.(); }
  }, [autoFocusSearchTick]);

  useEffect(() => {
    if (!trimmedQuery) {
      facadeRef.current?.cancel();
      return undefined;
    }
    const prefs = loadSearchPrefs();
    const ctx = {
      bothStrands: prefs.bothStrands,
      identityThreshold: prefs.identityThreshold,
      maxMismatches: prefs.maxMismatches,
      iupac: prefs.iupac,
      circular: prefs.circular,
      minQueryLen: prefs.minQueryLen,
      opts: { limit: prefs.limit },
    };
    const effectPlan = classifyQuery(trimmedQuery);
    const userDocuments = collectUserSearchDocuments(entriesById, projects, primersById);
    const documents = !planIsBlocked(effectPlan) && planNeedsEnzymeCatalog(effectPlan)
      ? [...userDocuments, ...collectEnzymeDocuments()]
      : userDocuments;
    const docById = new Map(documents.map((d) => [entityRefKey(d.ref), d]));
    const handle = setTimeout(() => {
      if (!facadeRef.current) return;
      setResultsOpen(true);
      facadeRef.current.search(trimmedQuery, documents, ctx, (session, meta) => {
        const phase = meta?.phase || (session.status === 'partial' ? 'partial' : 'final');
        setSearchResult({
          query: trimmedQuery,
          rows: session.results.map((r) => resultRowViewModel(r, docById.get(entityRefKey(r.entityRef)))),
          incomplete: !!session.incomplete,
          // Kept alongside query/rows/phase so the warning can name the failed check and can
          // never outlive its query. A blocked session carries neither → both default to [].
          incompleteDims: Array.isArray(session.incompleteDims) ? session.incompleteDims : [],
          providerFailures: Array.isArray(session.providerFailures) ? session.providerFailures : [],
          blocked: !!session.blocked,
          phase,
        });
      });
    }, 180);
    return () => {
      clearTimeout(handle);
      facadeRef.current?.cancel();
    };
  }, [trimmedQuery, entriesById, projects, primersById]);

  useEffect(() => {
    if (!resultsOpen) return undefined;
    const onDoc = (event) => {
      if (!wrapRef.current || wrapRef.current.contains(event.target)) return;
      if (event.target?.closest?.('[data-testid="tree-full-search"]')) return;
      setResultsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [resultsOpen]);

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
    phase: showForQuery ? searchResult.phase : 'final',
    rowCount: rows.length,
    providerExpected,
    providerPending: rows.some((row) => row.providerPending),
    incomplete: providerIncomplete,
    blocked: hasBlockingNotice || searchBlocked,
    interactionDisabled: composing,
  });

  const showResults = !composing && (
    (resultsOpen && !!trimmedQuery && closedForQuery !== trimmedQuery)
    || hasBlockingNotice
    || searchBlocked
  );

  const handleResultsOpenChange = (nextOpen) => {
    if (nextOpen) setClosedForQuery(null);
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
    onPickSearchResult?.(vm?.entityRef ?? null, vm?.occurrence || null);
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
    },
  });
  const activeDescendantId = navigation.activeKey
    ? optionDomId(listboxId, navigation.activeKey)
    : undefined;
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
  // «not verified» and «nothing found» can no longer be rendered by two owners at once.
  const STATUS_CONTENT = {
    loading: () => (
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-tertiary)' }}>
        {t('search.results.loadingBio')}
      </div>
    ),
    blocked: () => (
      <SearchNotice testId="search-blocked-notice">
        {hasBlockingNotice ? blockingText : t('search.results.blocked')}
      </SearchNotice>
    ),
    incomplete: () => (
      <SearchNotice testId="search-provider-incomplete-warning">{incompleteText}</SearchNotice>
    ),
    empty: () => (
      <div style={{ padding: 10, fontSize: 11, color: 'var(--text-tertiary)' }}>
        {t('search.results.empty')}
      </div>
    ),
  };
  const statusContent = (STATUS_CONTENT[presentation.statusKind] || (() => null))();

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

      {showResults && (
        <div
          data-testid="library-topbar-search-results"
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
