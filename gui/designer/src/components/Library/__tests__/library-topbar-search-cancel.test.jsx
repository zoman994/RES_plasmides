/**
 * LibraryTopBar — stopping a running search (SEARCH-GAPPED-DNA, reviewer directive «allow cancel;
 * do not pretend it is instant»).
 *
 * REWRITTEN BY C2.2. This file used to assert that stopping TERMINATES the worker thread, because
 * that was once the only mechanism available: a synchronous sweep cannot receive a message. U4-CANCEL
 * removed that constraint — the engine is resumable, so «stop» is now a `{type:'cancel', id}` control
 * frame, the thread reaches an interior safe point, unwinds and acknowledges. The user-visible
 * promises are unchanged and still pinned here; what changed is what happens to the thread:
 *
 *   • the user can say «stop», and the wait is not mandatory;
 *   • dismissing the dropdown stops the pass instead of leaving it burning a full sweep;
 *   • the worker STAYS ALIVE (terminating it would cost ~2 s of forced-termination delay per
 *     keystroke — the U4 measurement), and no new heavy job is posted until the old one has
 *     acknowledged;
 *   • a stopped search is never dressed up as an answer: «nothing found» after a stop would assert
 *     an absence the engine never established.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { screen, cleanup, act, fireEvent } from '@testing-library/react';
import { useStore } from '../../../store';
import { t } from '../../../i18n';
import { renderTopBar } from './_topbar-harness';
import { recordingFactory } from '../../../lib/__tests__/helpers/search-worker-fakes';

const TARGET = 'AAAGAATTGCCC'; // contains GAATTG for doc 'a'

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const last = (factory) => factory.workers[factory.workers.length - 1];
const results = () => screen.getByTestId('library-topbar-search-listbox-results');
const status = () => screen.getByTestId('library-topbar-search-listbox-status');

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

describe('LibraryTopBar — the user can stop a running search', () => {
  it('offers a stop control WHILE checking, and stopping asks the LIVE worker to stop', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush(); // metadata partial landed; the DNA pass is in flight

    const worker = last(factory);
    expect(worker.jobs.length).toBe(1);
    expect(worker.cancels.length).toBe(0);
    const stop = screen.getByTestId('search-cancel-action');
    act(() => { fireEvent.click(stop); });

    // DELIBERATELY INVERTED (C2.2): the thread is asked, not killed.
    expect(worker.cancels).toEqual([worker.jobs[0].id]);
    expect(worker.terminated).toBe(false);
    expect(worker.jobs.length, 'nothing new is posted before the ack').toBe(1);
  });

  it('after stopping, the UI stops claiming it is checking — and does NOT claim emptiness', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('search-cancel-action')); });
    await flush();

    expect(results().getAttribute('aria-busy')).toBeNull();
    expect(status().textContent).not.toContain(t('search.results.loadingBio'));
    expect(screen.queryByText(t('search.results.empty'))).toBeNull(); // a stop is not an answer
    expect(screen.getByTestId('search-cancelled-notice')).toBeTruthy();
    expect(screen.queryByTestId('search-cancel-action')).toBeNull(); // nothing left to stop
  });

  it('a late terminal for the STOPPED job never renders (the reply is aimed at that job)', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    const worker = last(factory);
    const stoppedJob = worker.lastJobId(); // remember WHICH job, so the late reply names it
    act(() => { fireEvent.click(screen.getByTestId('search-cancel-action')); });

    // The thread had already finished when the cancel frame landed, so it answers that job
    // normally. At the transport this counts as the acknowledgement (C2.1 P1-2); on screen it must
    // still change nothing — the session that asked for it is gone.
    act(() => { expect(worker.flushJob(stoppedJob)).toBe(true); });
    await flush();

    expect(screen.queryByTestId('smart-result-a')).toBeNull();
    expect(screen.getByTestId('search-cancelled-notice')).toBeTruthy();
    expect(worker.terminated, 'answering is not a fault').toBe(false);
  });

  it('the stopped search can be resumed, and then it really answers — on the SAME worker', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    const worker = last(factory);
    act(() => { fireEvent.click(screen.getByTestId('search-cancel-action')); });
    await flush();

    act(() => { fireEvent.click(screen.getByTestId('search-cancelled-resume')); });
    act(() => { vi.advanceTimersByTime(200); }); // the debounce runs again
    await flush();
    expect(screen.queryByTestId('search-cancelled-notice')).toBeNull();
    // The resumed pass is HELD until the stopped one has unwound — that is the «one heavy job»
    // invariant. Without the ack it would hang, which is exactly how this test used to fail.
    expect(worker.jobs.length).toBe(1);

    act(() => { worker.ackCancel(); });
    await flush();
    expect(factory.workers.length, 'a healthy worker is reused, never respawned').toBe(1);
    expect(worker.jobs.length).toBe(2);

    act(() => { worker.flushLast(); });
    await flush();
    expect(screen.getByTestId('smart-result-a')).toBeTruthy();
  });

  it('dismissing the dropdown stops the pass instead of leaving it burning', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    const worker = last(factory);

    act(() => { fireEvent.keyDown(screen.getByTestId('library-topbar-search-input'), { key: 'Escape' }); });
    expect(worker.cancels.length).toBe(1);
    expect(worker.terminated).toBe(false);
  });

  it('a stopped verdict is owned by its query — a new query never inherits it', async () => {
    vi.useFakeTimers();
    const factory = recordingFactory();
    const { rerender } = renderTopBar({ query: 'seq:GAATTG', workerFactory: factory });
    act(() => { vi.advanceTimersByTime(200); });
    await flush();
    act(() => { fireEvent.click(screen.getByTestId('search-cancel-action')); });
    await flush();
    expect(screen.getByTestId('search-cancelled-notice')).toBeTruthy();

    rerender({ query: 'seq:CCCC', workerFactory: factory });
    expect(screen.queryByTestId('search-cancelled-notice')).toBeNull();
  });
});
