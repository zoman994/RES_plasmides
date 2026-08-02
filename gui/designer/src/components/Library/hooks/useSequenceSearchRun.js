/**
 * useSequenceSearchRun — the LIFECYCLE of a search run, and nothing else.
 *
 * Extracted from `LibrarySmartSearchBar`, where it had grown into one state machine smeared across
 * a component body: a facade ref, a debounce timer, a liveness flag, a re-run counter and a cancel
 * callback, each individually small and collectively impossible to reason about. Every defect this
 * area produced came from that smearing — a dismissal that stopped the worker but not the timer, a
 * liveness flag derived from a rendered value one commit behind the work it described.
 *
 * IT OWNS exactly four things:
 *   • the debounce before work starts;
 *   • the generation of the active request;
 *   • start / cancel / settle / dispose;
 *   • the guarantee that an OLD run settling cannot extinguish a NEWER one.
 *
 * IT OWNS NOTHING ELSE. Classification, documents, prefs, results, ranking and UI stay with the
 * caller: this hook never looks inside a request or an answer, it only decides when work starts,
 * whether it is still wanted, and when it is over.
 *
 * WHY A GENERATION, not a boolean. Two runs overlap whenever a query changes mid-flight. With a
 * single flag the older run's callback clears liveness that now belongs to the newer one, and the
 * next Escape finds «nothing running» while a sweep is still grinding. The generation makes every
 * settle name the run it belongs to, so a late one is ignored instead of trusted.
 *
 * WHY LIVENESS IS STAMPED HERE, synchronously, at the moment work starts: any flag derived from
 * rendered state lags the launch by a commit, and that gap is exactly where a fast dismissal used
 * to sail through and leave a pass alive with nobody waiting for it.
 */
import { useCallback, useEffect, useRef } from 'react';
import { createSearchFacade } from '../../../lib/search-facade';
import { isSupersededFailure } from '../../../lib/search-provider-failures';

/** Long enough that typing does not launch a pass per keystroke, short enough to feel immediate. */
export const SEARCH_DEBOUNCE_MS = 180;

/**
 * @param {{ sequenceChannel?: object, delayMs?: number }} opts — `sequenceChannel` is the
 *   coordinator's `global` channel; this hook never creates a worker of its own.
 * @returns {{ run: Function, cancel: () => boolean }}
 *   `run({ query, documents, ctx, onStart, onResult, onError })` schedules a pass after the
 *   debounce. `onError` fires for a run that broke; `onCancelled` for one that was superseded by
 *   another owner. The caller decides what to SAY about either — this hook never words a verdict.
 *   `cancel()` stops whatever is in flight — a pending timer, a running pass, or both — and
 *   returns whether there WAS something to stop, so the caller can decide whether the user is
 *   owed a «stopped» verdict. It never invents one itself.
 */
export function useSequenceSearchRun({
  sequenceChannel, delayMs = SEARCH_DEBOUNCE_MS,
} = {}) {
  // FAIL-CLOSED. Without a channel the facade would fall back to building its own client — a second
  // heavy worker, silently, which is exactly what the coordinator exists to prevent. A missing
  // channel is a wiring mistake and must read as one.
  if (!sequenceChannel) throw new Error('useSequenceSearchRun requires a sequenceChannel');
  const facadeRef = useRef(null);
  const timerRef = useRef(null);   // scheduled, not yet started — cancellable before any worker exists
  const genRef = useRef(0);        // the newest run ever scheduled
  const liveRef = useRef(0);       // the generation actually in flight; 0 means nothing is

  useEffect(() => {
    // The hook owns the RUN, never the thread. The worker belongs to the app-wide coordinator, and
    // this facade merely borrows it through the `global` channel — so unmounting a search bar
    // cancels its own pass and leaves the shared owner (and the popover's search) untouched.
    const facade = createSearchFacade({ sequenceChannel });
    facadeRef.current = facade;
    // Unmount stops THIS owner's work — a scheduled pass must not outlive the component — but the
    // worker itself belongs to the coordinator and keeps serving whoever else is searching.
    return () => {
      if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
      liveRef.current = 0;
      // Retire the generation BEFORE tearing the facade down. `terminate()` cancels the pass, and
      // that cancellation comes back as a rejection: if the generation were still current when it
      // landed, `fail()` would call the caller's `onCancelled` — a state update on an unmounted
      // component, announcing a verdict nobody can see.
      genRef.current += 1;
      facade.terminate?.();
      facadeRef.current = null;
    };
  }, [sequenceChannel]);

  const cancel = useCallback(() => {
    const hadTimer = timerRef.current != null;
    if (hadTimer) { clearTimeout(timerRef.current); timerRef.current = null; }
    const wasLive = liveRef.current !== 0;
    if (!hadTimer && !wasLive) return false; // nothing was in flight: say so, promise nothing
    liveRef.current = 0;
    // Supersede the generation as well, so a reply already in the queue from the run we just
    // stopped cannot arrive and be mistaken for a live answer.
    genRef.current += 1;
    facadeRef.current?.cancel();
    return true;
  }, []);

  const run = useCallback(({
    query, documents, ctx, onStart, onResult, onError, onCancelled,
  }) => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    genRef.current += 1;
    const generation = genRef.current;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (!facadeRef.current || generation !== genRef.current) return; // superseded while waiting
      liveRef.current = generation;
      // The run has begun — announced BEFORE the first answer, because the wait itself is what the
      // user must see. Tying this to a result would keep the panel shut through the whole check.
      onStart?.();
      // A run can also end WITHOUT a final callback — the facade returns a promise, and it can
      // reject (or the call can throw outright). Left unhandled that is the worst of the three
      // endings: the generation stays live for ever, so the panel keeps announcing a check nobody
      // is performing and no dismissal can stop it, while the rejection surfaces as an unhandled
      // one. Both endings are therefore treated exactly like a final — and gated on the same
      // generation, so an abandoned run cannot report a failure that is no longer anybody's.
      const fail = (err) => {
        // Stale: a run nobody is waiting for may not speak — neither to complain nor to report a
        // cancellation over the search that replaced it.
        if (generation !== genRef.current) return;
        liveRef.current = 0;
        // Superseded ≠ broken. Another owner took the worker, so this pass simply stopped; calling
        // it a failure would blame the engine for a normal hand-over, and calling it a result would
        // be worse still.
        if (isSupersededFailure(err)) { onCancelled?.(); return; }
        onError?.(err);
      };
      let settled;
      try {
        settled = facadeRef.current.search(query, documents, ctx, (session, meta) => {
          if (generation !== genRef.current) return; // a stale run may not speak for the current one
          const phase = meta?.phase || (session.status === 'partial' ? 'partial' : 'final');
          // A partial is an interim report, not an ending: the pass is still live until the final.
          if (phase !== 'partial') liveRef.current = 0;
          onResult?.(session, phase);
        });
      } catch (err) {
        fail(err);
        return;
      }
      if (settled && typeof settled.catch === 'function') settled.catch(fail);
    }, delayMs);
  }, [delayMs]);

  return { run, cancel };
}
