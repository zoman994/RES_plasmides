/**
 * Four contracts found by review after the first cut of the cancel/route work. Each one is a real
 * defect the earlier tests could not see:
 *
 *  1. WHAT is handed to alignment. The bar passed the canonical query text, so `seq:ACGT…` — and
 *     for a compound query `pUC19 seq:ACGT…` — travelled verbatim into the alignment workspace as
 *     if it were a sequence. The first test masked it by using a BARE ACGT string, where the query
 *     text and the DNA happen to be identical. Only `plan.seqQuery` is DNA.
 *
 *  2. Dismissing DURING the debounce. Cancelling only reached a live worker, but before 180 ms
 *     there is no worker yet — only a pending timer, which then fired anyway: it spawned the pass
 *     the user had just dismissed AND re-opened the panel over them.
 *
 *  3. `Tab` had the same hole `Escape` did: it never reached the dismissal branch while the
 *     listbox was disabled, which is exactly the state a slow check puts it in.
 *
 *  4. A `requires-alignment` row is a CANDIDATE. Its DNA leg was never compared, so opening it
 *     would present an unchecked molecule as an answer.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { renderTopBar } from './_topbar-harness';
import { recordingFactory } from '../../../lib/__tests__/helpers/search-worker-fakes';

const TARGET = 'AAAGAATTGCCC';
const LONG = 'ACGT'.repeat(103); // 412 nt — over MAX_APPROX_QUERY_LEN, so the route must fire

const makeFactory = recordingFactory;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const last = (f) => f.workers[f.workers.length - 1];
const input = () => screen.getByTestId('library-topbar-search-input');

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no-op */ }
  useStore.setState((s) => {
    s.libraryEntries = {
      a: { id: 'a', name: 'plasmid-A', projectId: null, kind: 'container', tags: [],
        payload: { sequence: TARGET, length: TARGET.length, topology: 'circular', annotations: [] } },
    };
    s.projects = {};
    s.currentProjectId = null;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Drive a long DNA query all the way to the §4.2.0 route notice. */
async function routeOut(query, extra = {}) {
  vi.useFakeTimers();
  const factory = makeFactory();
  const utils = renderTopBar({ query, workerFactory: factory, ...extra });
  act(() => { vi.advanceTimersByTime(200); });
  act(() => { last(factory).flushLast(); }); // the engine throws REQUIRES_ALIGNMENT
  await flush();
  return { factory, ...utils };
}

describe('1 — only DNA reaches the alignment workspace', () => {
  it('a `seq:` query hands over the SEQUENCE, not the query text', async () => {
    const onOpenAlignment = vi.fn();
    await routeOut(`seq:${LONG}`, { onOpenAlignment });

    expect(screen.getByTestId('search-requires-alignment-notice')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByTestId('search-requires-alignment-action')); });
    expect(onOpenAlignment).toHaveBeenCalledWith(LONG); // no `seq:` prefix
  });

  it('a COMPOUND query hands over only its DNA term', async () => {
    const onOpenAlignment = vi.fn();
    await routeOut(`plasmid seq:${LONG}`, { onOpenAlignment });

    act(() => { fireEvent.click(screen.getByTestId('search-requires-alignment-action')); });
    const [handed] = onOpenAlignment.mock.calls[0];
    expect(handed).toBe(LONG);
    expect(handed).not.toMatch(/plasmid|seq:/); // the text term must not travel as if it were DNA
  });
});

describe('2 — dismissing before the debounce fires starts nothing', () => {
  it('closing inside the 180 ms window never creates a worker', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(100); }); // still inside the debounce
    expect(factory.workers).toHaveLength(0);

    act(() => { fireEvent.keyDown(input(), { key: 'Escape' }); });
    act(() => { vi.advanceTimersByTime(500); }); // the timer must NOT fire behind the dismissal

    expect(factory.workers).toHaveLength(0);
  });

  it('and it does not re-open the panel over the user', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { fireEvent.keyDown(input(), { key: 'Escape' }); });
    act(() => { vi.advanceTimersByTime(500); });

    expect(screen.queryByTestId('library-topbar-search-listbox-results')).toBeNull();
  });
});

describe('4 — the launch instant is not a blind spot', () => {
  it('Escape immediately after the timer fires still stops the pass it just started', () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    // The timer has fired, so a worker EXISTS — but React has not committed the render that would
    // publish `ariaBusy`. Deriving «is a pass running» from what is on screen leaves this window
    // uncovered, and a fast Escape sails straight through it.
    act(() => { vi.advanceTimersByTime(200); });
    expect(factory.workers).toHaveLength(1);

    // C2.2: dismissing ASKS the live worker to stop (cooperative cancel) instead of killing the
    // thread. What this test guards is unchanged — the pass the user just dismissed must be stopped,
    // and the launch instant must not be a blind spot.
    act(() => { fireEvent.keyDown(input(), { key: 'Escape' }); });
    expect(last(factory).cancels.length).toBe(1);
    expect(last(factory).terminated).toBe(false);
  });
});

describe('3 — Tab dismisses a busy panel too', () => {
  it('Tab during the check closes the panel AND stops the pass', async () => {
    vi.useFakeTimers();
    const factory = makeFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush(); // checking: rows are disabled, which is what used to swallow the key
    const worker = last(factory);

    act(() => { fireEvent.keyDown(input(), { key: 'Tab' }); });
    expect(worker.cancels.length, 'Tab must reach the dismissal branch even while rows are disabled').toBe(1);
    expect(worker.terminated).toBe(false);
    expect(screen.queryByTestId('library-topbar-search-listbox-results')).toBeNull();
  });
});
