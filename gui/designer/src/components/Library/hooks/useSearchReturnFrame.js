/**
 * «Back to results» — the frame, the corpus policy, and the restore. Search-owned, but its OWN hook:
 * `useGlobalSearchController` runs the session, this decides what happens to a session the biologist
 * has walked away from.
 *
 * It is separated for a reason beyond file size. Every rule here is about a search that is NOT on
 * screen — captured, aged, restored — and those rules kept getting tangled with the rules for a
 * search that IS. The clearest symptom was a hidden pass: a library change while the biologist sat in
 * the inspector re-ran the whole sweep for a panel nobody could see, and then Back paid for a second
 * one. Two megabase sweeps for one look at a result. Stated as one policy, in one place, that
 * collapses to «a parked frame goes stale; Back buys exactly one pass».
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store';

export const getRowKey = (row) => row.entityKey;

/**
 * @param {Object} args
 * @param {string} args.trimmedQuery — the canonical runnable query ('' when there is nothing to run)
 * @param {string|null} args.selectedEntryId — the molecule on screen; scopes the Back control
 * @param {boolean} args.resultsOpen — is the dropdown actually showing?
 * @param {Function} args.onStage — put restored rows + verdict on screen
 * @param {Function} args.onReset — drop the current answer (a changed corpus invalidates it)
 * @param {Function} args.onRerun — request exactly ONE new pass
 * @param {Function} args.onOpenPanel — show the dropdown again
 * @param {Function} [args.seedQuery] / [args.restoreQueryState] / [args.focusInput]
 */
export function useSearchReturnFrame({
  trimmedQuery, selectedEntryId, resultsOpen,
  onStage, onReset, onRerun, onOpenPanel,
  seedQuery, restoreQueryState, focusInput,
}) {
  const returnFrame = useStore((s) => s.searchReturnFrame);
  const captureSearchReturn = useStore((s) => s.captureSearchReturn);
  const clearSearchReturn = useStore((s) => s.clearSearchReturn);
  const corpusGeneration = useStore((s) => s.searchCorpusGeneration);

  const [restoreTick, setRestoreTick] = useState(0);
  const resultsScrollRef = useRef(null);
  const scrollTopRef = useRef(0);
  // A query whose search effect must NOT launch a pass: its rows were just restored verbatim.
  // Consumed exactly once, by the effect run the restore itself triggers.
  const restoredQueryRef = useRef(null);
  // Applied after the rows are on screen — the combobox resets its active option when the query (its
  // session key) changes, so restoring it in the same tick would be overwritten.
  const pendingRestoreRef = useRef(null);

  // ── THE CORPUS POLICY ─────────────────────────────────────────────────────────────────────────
  // A library change does not, by itself, deserve a sweep. It deserves one only when somebody is
  // LOOKING at the answer it would invalidate.
  //
  // The rule is «is the list on screen», and nothing else. An earlier version asked instead whether a
  // return FRAME existed for this query, which is not the same question and got two cases wrong:
  //   • the panel dismissed WITHOUT a pick (Escape, or a click on the tree) leaves no frame at all, so
  //     every subsequent save in the inspector fell through and ran a full corpus pass behind a closed
  //     dropdown — and `onStart` then FORCE-OPENED that dropdown over the molecule the biologist was
  //     reading, on their own autosave;
  //   • a frame captured for one query while the bar now holds another failed the equality and did
  //     the same.
  //
  // The generation is deliberately NOT consumed while suppressed. Back is not the only way back into
  // the list — ArrowDown or a click in the field reopens it too — and a swallowed transition would
  // leave those routes rendering rows that describe a library which no longer exists, as confirmed
  // results, with nothing left to trigger a refresh. Leaving `prevGenerationRef` behind means the very
  // effect run that sees `resultsOpen` turn true also sees the stale generation, and pays for exactly
  // one pass then — when there is finally somebody to pay it for.
  //
  // It is consumed in exactly three places and nowhere else: the visible-list rerun below, the stale
  // Back rerun, and `markCorpusCovered` immediately before an ordinary run. «No runnable query» is NOT
  // one of them — swallowing it mid-word would discard a real change the next run would have to
  // rediscover, and it also hid the very race `markCorpusCovered` exists to close.
  const prevGenerationRef = useRef(corpusGeneration);
  useEffect(() => {
    if (prevGenerationRef.current === corpusGeneration) return;
    if (!trimmedQuery) return;                // nothing to run: remember nothing, spend nothing
    if (!resultsOpen) return;                 // parked: same
    prevGenerationRef.current = corpusGeneration;
    onRerun();
  }, [corpusGeneration, trimmedQuery, resultsOpen, onRerun]);

  /**
   * «A pass is about to read the corpus as it stands» — called by the run effect immediately before it
   * starts one, and by nothing else.
   *
   * This closes a combination the two halves above could not see on their own. Parked with a stale
   * generation, the biologist asks a NEW question instead of pressing Back: the run effect fires for
   * the new query, and `onStart` opens the panel — at which point the policy effect wakes with
   * `resultsOpen` true and a generation still marked unhandled, and asks for another pass.
   *
   * Measured, so it is stated exactly: that request is REDUNDANT SCHEDULING, not a second sweep. The
   * extra run reaches `useSequenceSearchRun`, takes a debounce slot and is then superseded before its
   * timer fires — no cancel frame, no second worker job, on a fast thread and on a deliberately slow
   * one alike. What this removes is a knowingly-pointless run being scheduled at all; the earlier and
   * much larger defect (the run effect keyed directly on the corpus generation, which DID cost a full
   * second sweep behind a closed panel) is the one the policy above fixes.
   *
   * Marking it here rather than reading `corpusGeneration` back inside the run effect keeps the rule
   * where the rule lives: this hook decides what «covered» means, the run effect only reports that it
   * is about to cover it. The generation is read at call time, so what gets marked is exactly what the
   * pass is about to search — not a value captured a render earlier.
   */
  const markCorpusCovered = useCallback(() => {
    prevGenerationRef.current = useStore.getState().searchCorpusGeneration;
  }, []);

  /** Did a verbatim restore already answer this query? Consumed once, by the run it suppresses. */
  const shouldSuppressRun = useCallback((query) => {
    if (restoredQueryRef.current !== query) return false;
    restoredQueryRef.current = null;
    return true;
  }, []);

  // Staging runs BEFORE the search effect (the controller calls this hook first, and effects fire in
  // declaration order), so the suppression flag is in place by the time the run for this very query
  // looks at it. That ordering is the whole mechanism behind «Back starts zero new jobs».
  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending || pending.staged || !trimmedQuery) return;
    pendingRestoreRef.current = { ...pending, staged: true };
    if (!pending.verbatim) return; // changed corpus: the single re-run was requested on click
    // Suppress only a run that is actually coming: the query text moved, so the search effect is
    // about to fire for it. When it did not move, no effect re-runs and a flag left behind would
    // silently swallow the NEXT «search again» for the same query.
    if (trimmedQuery !== pending.queryBefore) restoredQueryRef.current = trimmedQuery;
    onStage({ query: trimmedQuery, rows: pending.rows, session: pending.session });
  }, [trimmedQuery, restoreTick]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Capture — only ever for a navigation that HAPPENED. The sink runs the dirty guard and answers
   * truthfully, so a cancelled «you have unsaved changes» leaves no promise of a return to a place
   * the biologist never left.
   */
  const captureFrame = useCallback((frame) => {
    captureSearchReturn({ ...frame, generation: corpusGeneration, scrollTop: scrollTopRef.current });
  }, [captureSearchReturn, corpusGeneration]);

  // Offered only for the molecule this frame was captured from: on any other entry the control would
  // promise a return to a search the biologist did not arrive from.
  const canGoBack = !!returnFrame && !!selectedEntryId && returnFrame.entryId === selectedEntryId;

  const goBackToResults = useCallback(() => {
    const frame = useStore.getState().searchReturnFrame;
    if (!frame) return;
    // The rows are staged, not stamped: the query the bar will actually compare against is the
    // CANONICAL form of what we restore, and only the render after knows it. Stamping the frame's raw
    // text here left the rows owned by a query that no longer existed — the panel came back empty,
    // which is how the browser found this.
    pendingRestoreRef.current = {
      verbatim: frame.generation === useStore.getState().searchCorpusGeneration,
      rows: frame.rows,
      session: frame.session,
      activeKey: frame.activeKey,
      scrollTop: frame.scrollTop,
      // What the bar was showing before the restore. If the canonical form does not move, no search
      // effect will re-run — and then there is nothing to suppress.
      queryBefore: trimmedQuery,
    };
    // Back OWNS this corpus transition. Marking it handled here is what stops the policy effect from
    // adding a second pass when `onOpenPanel` flips `resultsOpen` on the very next render: below, a
    // stale frame asks for exactly one, and that one is enough.
    prevGenerationRef.current = useStore.getState().searchCorpusGeneration;
    // The corpus moved → the old answer described a library that no longer exists. The query is the
    // user's input and survives; the ANSWER does not, and one honest search replaces it.
    onReset();
    onOpenPanel();
    setRestoreTick((n) => n + 1);
    // The control the user just pressed is about to disappear (the frame is spent), so focus would be
    // dropped on the body and the arrow keys would go nowhere. Hand it back to the combobox: the
    // restored list is a keyboard surface, and it must be usable the moment it appears.
    focusInput?.();
    // ONE pass, requested here in the click handler rather than from the staging effect — setState
    // inside an effect cascades renders. This is the only place a stale frame buys work.
    if (!pendingRestoreRef.current.verbatim) onRerun();
    // Verbatim when the structured state was captured; re-parsing the text is the fallback for a
    // frame written before that existed.
    if (!restoreQueryState?.(frame.queryState)) seedQuery?.(frame.query);
    clearSearchReturn();
  }, [seedQuery, restoreQueryState, focusInput, clearSearchReturn, trimmedQuery, onReset, onOpenPanel, onRerun]);

  return {
    canGoBack, goBackToResults, captureFrame, shouldSuppressRun, markCorpusCovered,
    resultsScrollRef, scrollTopRef,
    restore: { pendingRestoreRef, resultsScrollRef },
  };
}

/**
 * Restore the active option and the scroll offset AFTER the rows are on screen.
 *
 * Separate from the frame hook because it needs the combobox's `setActiveKey`, and the combobox needs
 * the controller's rows — the cycle is broken by ordering the calls, not by handing a ref across.
 * Both values are clamped to what actually exists: a row that is gone leaves activeKey null (no
 * dangling `aria-activedescendant`, and the next ArrowDown starts from the first row), and a list
 * that is now shorter cannot be scrolled past its end.
 */
export function useSearchRestoreApply({ restore, rows, setActiveKey }) {
  const { pendingRestoreRef, resultsScrollRef, session } = restore;
  const { phase, cancelled, blocked } = session;
  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (!pending || !pending.staged) return;
    if (rows.length === 0) {
      // The restored search settled with nothing to show — an honest empty, an error or a stop. The
      // pending scroll/active offer belongs to THAT answer; leaving it armed would hand it to the
      // next unrelated query that happens to produce rows.
      if (phase === 'final' || cancelled || blocked) pendingRestoreRef.current = null;
      return;
    }
    pendingRestoreRef.current = null;
    if (pending.activeKey != null && rows.some((r) => getRowKey(r) === pending.activeKey)) {
      setActiveKey(pending.activeKey);
    }
    const el = resultsScrollRef.current;
    if (el && pending.scrollTop > 0) {
      el.scrollTop = Math.max(0, Math.min(pending.scrollTop, el.scrollHeight - el.clientHeight));
    }
  }, [rows, setActiveKey, phase, cancelled, blocked, pendingRestoreRef, resultsScrollRef]);
}
