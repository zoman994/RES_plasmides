/**
 * SequenceSearchProvider — the single owner of the sequence-search coordinator, mounted above every
 * surface that searches DNA (the global bar and the in-molecule popover).
 *
 * A Provider rather than a module-level singleton: a singleton leaks between parallel Vitest files
 * and across HMR, accepts a new worker factory badly, and has no unambiguous moment of destruction.
 * Here the lifetime is exactly the subtree's, and unmount is the one place `dispose()` happens —
 * closing a popover or changing a query cancels WORK, never the owner.
 *
 * THE COORDINATOR IS BUILT IN AN EFFECT, not in `useMemo`/`useState`. This project has already paid
 * for that lesson once (V199): StrictMode double-invokes, so anything constructed during render is
 * torn down by the first simulated unmount while the component keeps the dead instance — the
 * symptom was a search that silently never returned. Creating it in the effect means the cleanup
 * and the construction are the same pair, and a remount simply builds a fresh one.
 *
 * The context value is therefore a STABLE façade that forwards to whatever coordinator is current.
 * That keeps the first render usable (consumers need a channel before effects have run) without
 * handing anyone a reference that can go stale.
 *
 * Thin by design: it owns a lifetime and nothing else. Search semantics live in the coordinator and
 * payload validation at the client boundary — putting either here would make a React component
 * responsible for biology.
 */
import { useEffect, useMemo, useRef } from 'react';
import { createSequenceSearchCoordinator } from '../lib/sequence-search-coordinator';
import SearchWorker from '../lib/search.worker.js?worker';
import { SequenceSearchContext } from './sequence-search-context';

/**
 * The ONE place that constructs a real thread. It is a factory rather than an instance because the
 * client may still have to terminate and respawn — not on an ordinary cancel (U4-CANCEL made that
 * cooperative: the thread is asked, acknowledges and stays) but on a FAULT: a crash, a malformed
 * reply or a missed deadline. Those need a fresh worker to run the next search on.
 *
 * Called lazily, on the first search — importing this module must not cost a thread.
 */
function productionWorkerFactory() {
  try { return new SearchWorker(); } catch { return null; }
}

export default function SequenceSearchProvider({ workerFactory = productionWorkerFactory, children }) {
  const ref = useRef(null);

  // Stable identity: consumers memoize on it, so the façade must not be rebuilt per render.
  const api = useMemo(() => ({
    channel(owner) {
      return {
        owner,
        search(query, documents, ctx) {
          const coordinator = ref.current;
          // Not a silent no-op: searching with no live owner means the subtree is unmounted or the
          // provider is missing, and a search that quietly returns nothing is indistinguishable
          // from a molecule that genuinely holds no match.
          if (!coordinator) return Promise.reject(new Error('sequence search is not available'));
          return coordinator.channel(owner).search(query, documents, ctx);
        },
        cancel() { return ref.current ? ref.current.channel(owner).cancel() : false; },
      };
    },
  }), []);

  useEffect(() => {
    const coordinator = createSequenceSearchCoordinator({ workerFactory });
    ref.current = coordinator;
    // Idempotent by construction: `dispose()` guards itself, and nulling the ref means a StrictMode
    // remount cannot keep using the instance that was just torn down.
    return () => {
      coordinator.dispose();
      if (ref.current === coordinator) ref.current = null;
    };
  }, [workerFactory]);

  return (
    <SequenceSearchContext.Provider value={api}>
      {children}
    </SequenceSearchContext.Provider>
  );
}
