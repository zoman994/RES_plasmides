/**
 * The global search SESSION — one owner for what was searched, what came back, and how to get back
 * to it (U5-B).
 *
 * `LibrarySmartSearchBar` used to hold all of this: the result object, the phase, the provider
 * verdicts, the run/retry/restore lifecycle and the ranking. That made the combobox the search
 * machine, and it put the only copy of the session inside a component whose job is to render a text
 * field. Everything that decides WHAT the search is now lives here; the bar renders the answer and
 * routes keys.
 *
 * The split follows the store's rule rather than fighting it: `searchSessionSlice` holds the
 * serialisable facts that must outlive the bar (the return frame, the corpus generation, the parked
 * nav request), and this controller holds the live machinery a store must never contain — the worker
 * channel, the debounce, the in-flight run, the refs. One session, in two layers, with no second copy
 * of the query anywhere: the query itself belongs to `search` (the smart-search state), and every
 * layer reads it from there.
 *
 * What is DELIBERATELY not here: everything about a search the biologist has walked away from —
 * capture, staleness, restore. That is `useSearchReturnFrame`, and the separation is what let the
 * hidden-pass defect be stated as a policy instead of hiding inside this effect's dependency list.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSequenceSearchRun } from './useSequenceSearchRun';
import { useSequenceSearchChannel } from '../../sequence-search-context';
import { SEARCH_OWNER } from '../../../lib/sequence-search-coordinator';
import { classifyQuery } from '../../../lib/query-classify';
import { planIsBlocked, planNeedsEnzymeCatalog } from '../../../lib/library-search';
import { entityRefKey } from '../../../lib/search-entity-key';
import { rankSearchRows } from '../../../lib/search-ranker';
import { rankedResultRowViewModel } from '../../../lib/search-result-vm';
import { resolveCircular } from '../../../lib/sequence-search-policy';
import { loadSearchPrefs } from '../../../lib/search-prefs';
import { useSearchReturnFrame, getRowKey } from './useSearchReturnFrame';

const IDLE = {
  query: '', rows: [], incomplete: false, incompleteDims: [], providerFailures: [],
  blocked: false, phase: 'idle', requiresAlignment: null, cancelled: false,
};

/**
 * @param {Object} args
 * @param {string} args.trimmedQuery — the canonical, runnable query; '' when there is nothing to run
 * @param {Function} args.collectDocuments — builds the corpus at the moment the search reads it
 * @param {Function} [args.onPickSearchResult] — the routing sink; returns whether a molecule OPENED
 * @param {string|null} [args.selectedEntryId] — the molecule on screen (scopes the Back control)
 * @param {Function} [args.seedQuery] — puts a restored query back into the input
 * @param {Function} [args.focusInput] — hands focus back to the combobox after a restore
 */
export function useGlobalSearchController({
  trimmedQuery, collectDocuments, onPickSearchResult, selectedEntryId, seedQuery, focusInput,
  queryState = null, restoreQueryState,
}) {
  const [resultsOpen, setResultsOpen] = useState(false);
  const [closedForQuery, setClosedForQuery] = useState(null);
  const [searchResult, setSearchResult] = useState(IDLE);
  // Bumped to run the SAME query again after a stop. The query text is unchanged, so nothing else in
  // the effect's dep list moves — without this the search could only be restarted by retyping.
  const [runTick, setRunTick] = useState(0);
  const queryRef = useRef('');

  // The app-wide owner's `global` channel. This borrows the worker; it never owns one, so it cannot
  // become a second heavy pass beside the in-molecule search.
  const sequenceChannel = useSequenceSearchChannel(SEARCH_OWNER.GLOBAL);
  const { run, cancel } = useSequenceSearchRun({ sequenceChannel });

  const requestRerun = useCallback(() => setRunTick((n) => n + 1), []);
  const resetSession = useCallback(() => setSearchResult(IDLE), []);
  const openPanel = useCallback(() => { setClosedForQuery(null); setResultsOpen(true); }, []);
  /**
   * Restored rows arrive with the verdict they were captured under. Hardcoding «final, nothing wrong»
   * would quietly upgrade a session that ended incomplete — the biologist would come back to a list
   * that no longer says the check never ran.
   */
  const stageRestore = useCallback(({ query, rows: restored, session }) => {
    setSearchResult({
      ...IDLE, ...(session || {}), query, rows: restored, phase: session?.phase || 'final',
    });
  }, []);

  // Everything about a search that is NOT on screen: the frame, the staleness policy, the restore.
  const back = useSearchReturnFrame({
    trimmedQuery, selectedEntryId, resultsOpen,
    onStage: stageRestore, onReset: resetSession, onRerun: requestRerun, onOpenPanel: openPanel,
    seedQuery, restoreQueryState, focusInput,
  });
  // Destructured, not used through `back`: the hook returns a fresh object every render, so an effect
  // keyed on it would re-run — and therefore CANCEL the in-flight pass — on every single render.
  const { shouldSuppressRun, captureFrame, markCorpusCovered } = back;

  // ONE terminal «stopped» verdict, reached two ways: the user pressed stop, or another owner took
  // the worker. From where the biologist sits those are the same event — the check they were waiting
  // on is not coming — so they must read the same, with «Искать снова» right there. Stamping the
  // query is what makes the notice belong to it: a run stopped before any session existed would
  // otherwise leave the panel owning nothing, i.e. blank with no way to resume.
  const stampCancelled = useCallback(() => {
    setSearchResult((prev) => (prev.cancelled && prev.query === queryRef.current
      ? prev
      : { ...prev, query: queryRef.current, cancelled: true }));
  }, []);

  useEffect(() => { queryRef.current = trimmedQuery; }, [trimmedQuery]);

  useEffect(() => {
    if (!trimmedQuery) { cancel(); return undefined; }
    // A verbatim restore already put the confirmed rows on screen. Running the pass anyway would
    // spend a worker job to recompute an answer we are holding — the «0 new jobs» half of the Back
    // contract is this early return, and nothing else.
    if (shouldSuppressRun(trimmedQuery)) return undefined;
    const prefs = loadSearchPrefs();
    const ctx = {
      bothStrands: prefs.bothStrands,
      identityThreshold: prefs.identityThreshold,
      circular: prefs.circular,
      minQueryLen: prefs.minQueryLen,
      opts: { limit: prefs.limit },
    };
    const effectPlan = classifyQuery(trimmedQuery);
    const documents = collectDocuments(!planIsBlocked(effectPlan) && planNeedsEnzymeCatalog(effectPlan));
    const docById = new Map(documents.map((d) => [entityRefKey(d.ref), d]));
    // What the ranker needs to judge a CIRCULAR endpoint: each molecule's length and its EFFECTIVE
    // topology — the same `resolveCircular(ctx.circular, topology)` the engine itself applied. Reading
    // `d.sequence.topology` alone would ignore the user's circular-search override and could order a
    // hit on the origin by a rule the search never used.
    const docMeta = new Map(documents
      .filter((d) => d.sequence && typeof d.sequence.seq === 'string')
      .map((d) => [entityRefKey(d.ref), {
        length: d.sequence.seq.length,
        circular: resolveCircular(ctx.circular, d.sequence.topology),
      }]));
    // This pass reads the corpus as it stands, so the corpus as it stands is covered. Without it, a run
    // started for a NEWLY seeded query while a stale generation was still parked leaves the policy to
    // schedule one more run the moment `onStart` opens the panel — redundant SCHEDULING, superseded
    // before it becomes a worker job (measured on a fast and on a slow thread), not a second sweep.
    markCorpusCovered();
    run({
      query: trimmedQuery,
      documents,
      ctx,
      onStart: () => setResultsOpen(true),
      // Another owner (the in-molecule search) took the worker. This pass stopped — it did not fail,
      // and it certainly did not find nothing. Falling through to a confirmed final here is the
      // defect this callback exists to remove.
      onCancelled: stampCancelled,
      // A run that ended without an answer. The wording is deliberately the GENERIC incomplete —
      // «the check did not run», naming no provider — because we genuinely do not know which one
      // died: there is no session to ask. What matters biologically is the one thing we DO know: an
      // absence was never established, so «nothing found» would be a lie. The error object itself
      // never reaches the screen; it is not localized and may carry internals.
      onError: () => setSearchResult((prev) => ({
        ...IDLE,
        query: trimmedQuery,
        // Metadata rows that already landed in a partial stay — as CANDIDATES, since `incomplete`
        // disables them. Dropping them would discard true name matches on top of the failure.
        rows: prev.query === trimmedQuery ? prev.rows : [],
        incomplete: true,
        phase: 'final',
      })),
      onResult: (session, phase) => {
        setSearchResult({
          query: trimmedQuery,
          // ORDERED BY IDENTITY, not by name (U5.2). The session's own `relevanceKey` is
          // [dimension, relation, title.toLowerCase()], so two molecules matching the same way fell
          // through to their names — and a 100 % hit sat below an 85 % one for no reason a biologist
          // could defend. `rankSearchRows` applies §5.3.1: confirmed before pending, then
          // `identityBps`, then the §3.2 comparator, then a stable key.
          // The ranked row is AUTHORITATIVE (U5.2b): its `best` was chosen with the molecule's
          // effective topology, so the row is displayed, clicked and opened at that same locus.
          // Letting the view model pick again would re-decide it without the topology — on a circle a
          // hit ending exactly at the origin ends at 0 for the ranker and at `n` for a meta-less
          // picker, and the row would then be sorted by one locus and open another.
          rows: rankSearchRows(session.results, { docMeta })
            .map((row) => rankedResultRowViewModel(row, docById.get(entityRefKey(row.entityRef)))),
          incomplete: !!session.incomplete,
          // Kept alongside query/rows/phase so the warning can name the failed check and can never
          // outlive its query. A blocked session carries neither → both default to [].
          incompleteDims: Array.isArray(session.incompleteDims) ? session.incompleteDims : [],
          providerFailures: Array.isArray(session.providerFailures) ? session.providerFailures : [],
          blocked: !!session.blocked,
          requiresAlignment: session.requiresAlignment || null,
          cancelled: false, // a fresh answer for this query supersedes any earlier stop
          phase,
        });
      },
    });
    return cancel;
    // NOT keyed on the corpus. A library change decides for itself whether it is worth a pass — see
    // the policy in `useSearchReturnFrame` — and when it is, it says so by bumping `runTick`. Keying
    // this effect on the generation directly is what used to run a full sweep behind a closed
    // dropdown for a result nobody was looking at.
  }, [trimmedQuery, collectDocuments, runTick, run, cancel, stampCancelled, shouldSuppressRun, markCorpusCovered]);

  // The USER's stop. The lifecycle hook decides what there was to stop; this decides what the user is
  // then owed. Both halves matter: a pass killed silently would leave the panel claiming a check
  // nobody is performing, and a verdict invented when nothing ran would be a lie.
  const cancelSearch = useCallback(() => {
    if (!cancel()) return; // nothing was in flight — do not restate a verdict
    stampCancelled();
  }, [cancel, stampCancelled]);

  const resumeSearch = useCallback(() => {
    setSearchResult((prev) => ({ ...prev, cancelled: false }));
    setRunTick((n) => n + 1);
  }, []);

  // EVERY field is gated through this: results are owned by their query, so a stale warning/row can
  // never render under a newer one (it disappears on the very render the query changes, not 180 ms
  // later when the new search resolves).
  const showForQuery = searchResult.query === trimmedQuery;
  const rows = showForQuery ? searchResult.rows : [];

  /**
   * The frame belongs to a navigation that HAPPENED. The sink runs the dirty guard and answers
   * truthfully, so a cancelled «you have unsaved changes» leaves no promise of a return to a place
   * the biologist never left. Same tick as the navigation, so the two cannot separate.
   */
  const pickRow = useCallback((vm) => {
    const opened = onPickSearchResult?.(vm?.entityRef ?? null, vm?.occurrence || null);
    if (!opened) return;
    captureFrame({
      query: trimmedQuery,
      // The STRUCTURED query — mode, filters and their resolved values — not just the text it
      // renders as. And the session's verdict, so a restored «not verified» is still not verified.
      queryState,
      session: {
        phase: searchResult.phase,
        incomplete: searchResult.incomplete,
        incompleteDims: searchResult.incompleteDims,
        providerFailures: searchResult.providerFailures,
        blocked: searchResult.blocked,
        requiresAlignment: searchResult.requiresAlignment,
      },
      rows,
      // The row they opened IS the row to come back to — no need to read the combobox mid-click.
      activeKey: getRowKey(vm),
      entryId: vm?.id ?? null,
    });
  }, [onPickSearchResult, captureFrame, trimmedQuery, queryState, searchResult, rows]);

  return {
    // what the session IS
    rows,
    showForQuery,
    phase: showForQuery ? searchResult.phase : 'final',
    // Provider-neutral: sequence, protein and enzyme all report through these.
    providerIncomplete: showForQuery ? searchResult.incomplete : false,
    incompleteDims: showForQuery ? searchResult.incompleteDims : [],
    searchBlocked: showForQuery ? searchResult.blocked : false,
    // §4.2.0 route — gated like every other field, so it cannot outlive its query.
    requiresAlignment: showForQuery ? searchResult.requiresAlignment : null,
    cancelled: showForQuery ? !!searchResult.cancelled : false,
    // the panel
    resultsOpen, setResultsOpen, closedForQuery, setClosedForQuery,
    resultsScrollRef: back.resultsScrollRef, scrollTopRef: back.scrollTopRef,
    // lifecycle
    cancelSearch, resumeSearch, pickRow,
    // Back — owned by `useSearchReturnFrame`, surfaced here so the bar has one consumer
    canGoBack: back.canGoBack, goBackToResults: back.goBackToResults,
    // Consumed by `useSearchRestoreApply`. `session` is the RAW result, never the query-gated view:
    // the gated `phase` reads 'final' precisely while the restored query is not yet owned, and the
    // apply effect would then treat «no rows yet» as «the search ended empty» and discard the offer.
    restore: { ...back.restore, session: searchResult },
  };
}
