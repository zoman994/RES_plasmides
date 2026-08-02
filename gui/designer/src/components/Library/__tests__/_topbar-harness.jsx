/**
 * Test harness for LibraryTopBar (REV#2 Stage 3 K4.2b∪K5). The bar no longer takes a raw
 * `query` string — it takes the structured `globalSearch` controller (useSearchQueryState),
 * owned by LibraryWorkspace. These tests drive the bar through the REAL controller so the
 * controller→facade wiring (canonical query drives the search, `runnable` gates a blocked one)
 * is exercised end-to-end: `renderTopBar({ query })` seeds the controller from `query` exactly
 * as the tree's «Полный поиск» escalation does, and its `rerender` re-seeds.
 *
 * U4 — the worker factory belongs to the PROVIDER, never to the bar. Tests that hand one in are
 * therefore injecting it where production does, so what they exercise is the real ownership rather
 * than a test-only back door.
 */
import React, { useEffect } from 'react';
import { render } from '@testing-library/react';
import { useSearchQueryState } from '../hooks/useSearchQueryState';
import { SEARCH_PROFILES } from '../../../lib/search-profiles';
import { handleSearchMessage } from '../../../lib/search-worker-core';
import SequenceSearchProvider from '../../SequenceSearchProvider';
import LibraryTopBar from '../LibraryTopBar';

/**
 * The default stand-in thread: a fake worker that answers through the REAL engine core, one
 * microtask later. Deterministic, and — the point — it is reached through the WORKER path: the
 * client's inline fallback stays unused, so no test can quietly bless a main-thread sweep that
 * production forbids. Be precise about what it is not: this fake runs the core synchronously in a
 * microtask on the test's own main thread. It imitates the transport, not the threading.
 *
 * C2.2 — a `{type:'cancel', id}` is a CONTROL FRAME, not a job. It used to be handed to
 * `handleSearchMessage` like any other message, which is nonsense the engine cannot answer; the
 * cooperative protocol expects the acknowledgement `{id, cancelled:true}` and holds the next heavy
 * job until it arrives. Every test that supersedes a query relies on this, so the default fake has
 * to speak the real protocol rather than a plausible-looking one.
 */
function makeCoreWorkerFactory() {
  const workers = [];
  const factory = () => {
    const w = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      posted: [],
      cancels: [],
      terminated: false,
      postMessage(message) {
        w.posted.push(message);
        if (message && message.type === 'cancel') {
          w.cancels.push(message.id);
          queueMicrotask(() => {
            if (w.terminated) return;
            w.onmessage?.({ data: { id: message.id, cancelled: true } });
          });
          return;
        }
        queueMicrotask(() => {
          if (w.terminated) return; // a killed thread answers nobody
          try { w.onmessage?.({ data: handleSearchMessage(message) }); } catch { w.onerror?.({ message: 'core threw' }); }
        });
      },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  factory.workers = workers;
  return factory;
}

/**
 * The bar and its controller — WITHOUT an owner. A caller that supplies its own
 * `SequenceSearchProvider` (as the global-wiring contract does) must not have a second one nested
 * underneath, or the inner would shadow it and the test would silently measure the wrong owner.
 */
export function Harness({ query = '', resolveProjectName, ...rest }) {
  const search = useSearchQueryState({ capabilities: SEARCH_PROFILES.globalLibrary, resolveProjectName });
  // Seed (replace) the controller from the raw query whenever it changes — the same path the
  // tree escalation / enzyme card use. Not in the deps: `search` is recreated every render; we
  // deliberately re-seed only on a query change.
  useEffect(() => { search.seedGlobalQuery(query); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  return <LibraryTopBar search={search} {...rest} />;
}

/** The bar under its own owner — the shape most tests want. */
export function renderTopBar({ query = '', workerFactory, ...rest } = {}) {
  const factory = workerFactory || makeCoreWorkerFactory();
  const tree = (props) => (
    <SequenceSearchProvider workerFactory={factory}>
      <Harness {...props} />
    </SequenceSearchProvider>
  );
  const utils = render(tree({ query, ...rest }));
  return {
    ...utils,
    workerFactory: factory,
    rerender: ({ query: q2 = '', ...r2 } = {}) => utils.rerender(tree({ query: q2, ...r2 })),
  };
}
